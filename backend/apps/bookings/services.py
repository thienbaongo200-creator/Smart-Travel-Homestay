from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.backends.postgresql.psycopg_any import DateRange
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.listings.models import ApprovalStatus, Room, Vehicle
from apps.pricing.services import build_quote

from .models import Booking, BookingItem, CalendarSlot, Payment

S = CalendarSlot.Status
B = Booking.Status


class BookingError(Exception):
    http_status = 400


class SlotUnavailable(BookingError):
    http_status = 409


class InvalidState(BookingError):
    http_status = 409


class NotAllowed(BookingError):
    http_status = 403


# ---------- Availability ----------
def active_q(now=None):
    """Slot đang chặn lịch: HOLD chưa hết hạn + PENDING/CONFIRMED/CHECKED_IN/BLOCKED."""
    now = now or timezone.now()
    return Q(status__in=CalendarSlot.BLOCKING) & ~Q(status=S.HOLD, expires_at__lte=now)


def _range(ci, co):
    return DateRange(ci, co, "[)")


def busy_ids(field, ci, co):
    return CalendarSlot.objects.filter(active_q(), **{f"{field}__isnull": False}, period__overlap=_range(ci, co)).values(f"{field}_id")


def search_rooms(city, ci, co, guests):
    qs = Room.objects.filter(is_active=True, homestay__status=ApprovalStatus.APPROVED, max_guests__gte=guests)
    if city:
        qs = qs.filter(homestay__city__icontains=city)
    return qs.exclude(id__in=busy_ids("room", ci, co)).select_related("homestay")


def suggest_vehicles(city, ci, co):
    qs = Vehicle.objects.filter(status=ApprovalStatus.APPROVED)
    if city:
        qs = qs.filter(city__icontains=city)
    return qs.exclude(id__in=busy_ids("vehicle", ci, co))


# ---------- Occupancy (đầu vào cho giá động) ----------
def room_occupancy_pct(homestay, d):
    total = homestay.rooms.filter(is_active=True).count() or 1
    booked = CalendarSlot.objects.filter(active_q(), room__homestay=homestay, period__contains=d).values("room_id").distinct().count()
    return Decimal(booked * 100) / total


def vehicle_occupancy_pct(vehicle, d):
    pool = Vehicle.objects.filter(status=ApprovalStatus.APPROVED, vehicle_type=vehicle.vehicle_type, city=vehicle.city)
    total = pool.count() or 1
    booked = CalendarSlot.objects.filter(active_q(), vehicle__in=pool, period__contains=d).values("vehicle_id").distinct().count()
    return Decimal(booked * 100) / total


def quote(room, vehicle, ci, co):
    return build_quote(room, vehicle, ci, co,
                       lambda d: room_occupancy_pct(room.homestay, d),
                       lambda d: vehicle_occupancy_pct(vehicle, d) if vehicle else Decimal(0))


# ---------- Hold / expire ----------
def expire_stale_holds():
    now = timezone.now()
    ids = list(CalendarSlot.objects.filter(status=S.HOLD, expires_at__lte=now).values_list("booking_item__booking_id", flat=True))
    CalendarSlot.objects.filter(status=S.HOLD, expires_at__lte=now).update(status=S.CANCELLED)
    Booking.objects.filter(id__in=ids, status=B.HOLD).update(status=B.EXPIRED)
    return len(ids)


# ---------- Create booking ----------
def create_booking(customer, room_id, vehicle_id, ci, co, guests):
    today = timezone.localdate()
    if not (today <= ci < co):  # BR-01
        raise BookingError("Ngày nhận phòng phải trước ngày trả và không ở quá khứ")
    try:
        room = Room.objects.select_related("homestay").get(id=room_id, is_active=True, homestay__status=ApprovalStatus.APPROVED)
    except Room.DoesNotExist:
        raise BookingError("Phòng không tồn tại hoặc chưa được duyệt")
    if guests > room.max_guests:  # BR-02
        raise BookingError("Vượt quá số khách tối đa")
    vehicle = None
    if vehicle_id:
        try:
            vehicle = Vehicle.objects.get(id=vehicle_id, status=ApprovalStatus.APPROVED)
        except Vehicle.DoesNotExist:
            raise BookingError("Xe không tồn tại hoặc chưa được duyệt")

    try:
        with transaction.atomic():
            expire_stale_holds()
            q = quote(room, vehicle, ci, co)
            expires = timezone.now() + timedelta(minutes=settings.HOLD_MINUTES)
            booking = Booking.objects.create(
                customer=customer, check_in=ci, check_out=co, guests=guests, status=B.HOLD,
                hold_expires_at=expires, total_amount=Decimal(q["total"]), deposit_amount=Decimal(q["deposit"]),
                price_breakdown=q)
            r_item = BookingItem.objects.create(booking=booking, room=room, subtotal=Decimal(q["room"]["subtotal"]), breakdown=q["room"])
            CalendarSlot.objects.create(room=room, period=_range(ci, co), status=S.HOLD, booking_item=r_item, expires_at=expires)
            if vehicle:
                v_sub = Decimal(q["vehicle"]["subtotal"]) - Decimal(q["combo_discount"])
                v_item = BookingItem.objects.create(booking=booking, vehicle=vehicle, subtotal=v_sub, breakdown=q["vehicle"])
                CalendarSlot.objects.create(vehicle=vehicle, period=_range(ci, co), status=S.HOLD, booking_item=v_item, expires_at=expires)
    except IntegrityError:  # EXCLUDE constraint vi phạm -> có người giữ trước trong cùng khoảng
        raise SlotUnavailable("Phòng hoặc xe vừa được người khác giữ/đặt. Vui lòng chọn ngày khác.")
    return booking


# ---------- Payment ----------
def initiate_payment(booking, user):
    if booking.customer_id != user.id:
        raise NotAllowed("Không có quyền")
    if booking.status != B.HOLD or booking.hold_expires_at <= timezone.now():
        raise InvalidState("Đơn không còn ở trạng thái giữ chỗ")
    return Payment.objects.create(booking=booking, amount=booking.deposit_amount)


def handle_payment_result(txn_ref, success: bool, payload=None):
    """Webhook idempotent: gọi lại nhiều lần vẫn cho cùng kết quả."""
    with transaction.atomic():
        pay = Payment.objects.select_for_update().select_related("booking").get(txn_ref=txn_ref)
        if pay.status != Payment.Status.INIT:
            return pay
        pay.raw_payload = payload or {}
        booking = Booking.objects.select_for_update().get(pk=pay.booking_id)
        slots = CalendarSlot.objects.filter(booking_item__booking=booking)

        if success and booking.status == B.HOLD and booking.hold_expires_at > timezone.now():
            pay.status = Payment.Status.SUCCESS
            booking.status, booking.hold_expires_at = B.PENDING, None
            slots.update(status=S.PENDING, expires_at=None)  # gia hạn giữ chỗ tới khi chủ phản hồi
        elif success:
            pay.status = Payment.Status.NEEDS_REFUND  # tiền về nhưng hold đã hết hạn -> hoàn tiền
        else:
            pay.status = Payment.Status.FAILED
            if booking.status == B.HOLD:  # rollback: nhả lịch ngay
                booking.status = B.CANCELLED
                slots.update(status=S.CANCELLED)
        pay.save()
        booking.save()
        return pay


# ---------- Host decision ----------
def decide_item(item_id, actor, approve: bool, reason=""):
    with transaction.atomic():
        item = (BookingItem.objects.select_for_update(of=("self",))
                .select_related("booking", "room__homestay", "vehicle").get(pk=item_id))
        if item.owner_id != actor.id:
            raise NotAllowed("Không có quyền xử lý đơn này")
        slot = item.slot
        if slot.status != S.PENDING:
            raise InvalidState("Đơn không ở trạng thái chờ xác nhận")
        slot.status = S.CONFIRMED if approve else S.CANCELLED
        slot.note = "" if approve else reason
        slot.save(update_fields=["status", "note"])
        _recompute(item.booking)


def _recompute(booking):
    items = list(booking.items.select_related("slot"))
    room_item = next(i for i in items if i.room_id)
    if room_item.slot.status == S.CANCELLED:  # chủ phòng từ chối -> hủy cả đơn
        CalendarSlot.objects.filter(booking_item__booking=booking, status__in=CalendarSlot.BLOCKING).update(status=S.CANCELLED)
        booking.status = B.REJECTED
    elif all(i.slot.status in (S.CONFIRMED, S.CANCELLED) for i in items):
        booking.status = B.CONFIRMED  # (xe bị từ chối: phòng vẫn giữ; TODO hoàn tiền phần xe)
    booking.save(update_fields=["status"])
