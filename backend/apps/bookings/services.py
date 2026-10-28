from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.listings.models import ApprovalStatus, Room, Vehicle
from apps.pricing.services import build_quote

from .models import Booking, BookingItem, BookingItemNight, DayStatus, Payment, RoomDay, VehicleDay, new_code

B = Booking.Status
I = BookingItem.Status
D = DayStatus


class BookingError(Exception):
    http_status = 400


class SlotUnavailable(BookingError):
    http_status = 409


class InvalidState(BookingError):
    http_status = 409


class NotAllowed(BookingError):
    http_status = 403


class LicenseMismatch(BookingError):
    http_status = 400


# ---------- Lịch theo từng ngày ----------
def _days_model(item):
    return RoomDay if item.room_id else VehicleDay


def _fk(item):
    return "room" if item.room_id else "vehicle"


def ensure_calendar(model, fk, obj, start=None, days=365):
    """Sinh lịch 365 ngày cho phòng/xe (idempotent nhờ UNIQUE + ignore_conflicts)."""
    start = start or timezone.localdate()
    model.objects.bulk_create(
        [model(**{fk: obj}, day=start + timedelta(days=i)) for i in range(days)], ignore_conflicts=True)


def hold_days(model, fk, obj, item, ci, co, what):
    """Khóa các dòng lịch theo thứ tự ngày (SELECT ... FOR UPDATE), rồi AVAILABLE -> HELD.
    Người đến sau chờ người trước commit, thấy HELD, không đủ số đêm và nhận 409."""
    rows = model.objects.filter(**{fk: obj}, day__gte=ci, day__lt=co)
    list(rows.select_for_update().order_by("day"))
    n = rows.filter(status=D.AVAILABLE).update(status=D.HELD, booking_item=item)
    if n != (co - ci).days:
        raise SlotUnavailable(f"{what} không còn trống đủ {(co - ci).days} đêm. Vui lòng chọn ngày khác.")


def release_item_days(item):
    _days_model(item).objects.filter(booking_item=item).update(status=D.AVAILABLE, booking_item=None)


def release_booking_days(booking):
    RoomDay.objects.filter(booking_item__booking=booking).update(status=D.AVAILABLE, booking_item=None)
    VehicleDay.objects.filter(booking_item__booking=booking).update(status=D.AVAILABLE, booking_item=None)


def release_expired_holds():
    """Đơn HOLD quá hạn -> EXPIRED và nhả lịch. Chạy lười ở mọi truy vấn lịch + lệnh expire_holds (cron)."""
    with transaction.atomic():
        expired = list(Booking.objects.select_for_update(skip_locked=True)
                       .filter(status=B.HOLD, hold_expires_at__lt=timezone.now()))
        for b in expired:
            b.status = B.EXPIRED
            b.save(update_fields=["status"])
            b.items.update(status=I.CANCELLED, note="Hết hạn giữ chỗ")
            release_booking_days(b)
    return len(expired)


def block_room(room, ci, co, note=""):
    if ci >= co:
        raise BookingError("Khoảng ngày không hợp lệ")
    with transaction.atomic():
        rows = RoomDay.objects.filter(room=room, day__gte=ci, day__lt=co)
        list(rows.select_for_update().order_by("day"))
        if rows.filter(status=D.AVAILABLE).update(status=D.BLOCKED, note=note) != (co - ci).days:
            raise SlotUnavailable("Khoảng ngày đã có đơn hoặc khóa khác")


def unblock_room(room, ci, co):
    return RoomDay.objects.filter(room=room, day__gte=ci, day__lt=co, status=D.BLOCKED).update(
        status=D.AVAILABLE, note="")


# ---------- Tìm kiếm ----------
def _free(model_qs, rel, ci, co):
    n = (co - ci).days
    return model_qs.annotate(free=Count("days", filter=Q(days__day__gte=ci, days__day__lt=co,
                                                         days__status=D.AVAILABLE))).filter(free=n)


def search_rooms(city, ci, co, guests):
    release_expired_holds()
    qs = Room.objects.filter(is_active=True, homestay__status=ApprovalStatus.APPROVED, max_guests__gte=guests)
    if city:
        qs = qs.filter(homestay__city__icontains=city)
    return _free(qs, "days", ci, co).select_related("homestay")


def suggest_vehicles(city, ci, co):
    release_expired_holds()
    qs = Vehicle.objects.filter(status=ApprovalStatus.APPROVED)
    if city:
        qs = qs.filter(city__icontains=city)
    return _free(qs, "days", ci, co)


# ---------- Công suất (đầu vào giá động) ----------
def room_occupancy_pct(homestay, d):
    total = homestay.rooms.filter(is_active=True).count() or 1
    booked = RoomDay.objects.filter(room__homestay=homestay, room__is_active=True, day=d,
                                    status__in=[D.HELD, D.BOOKED]).count()
    return Decimal(booked * 100) / total


def vehicle_occupancy_pct(vehicle, d):
    pool = Vehicle.objects.filter(status=ApprovalStatus.APPROVED, vehicle_type=vehicle.vehicle_type, city=vehicle.city)
    total = pool.count() or 1
    booked = VehicleDay.objects.filter(vehicle__in=pool, day=d, status__in=[D.HELD, D.BOOKED]).count()
    return Decimal(booked * 100) / total


def quote(room, vehicle, ci, co):
    return build_quote(room, vehicle, ci, co,
                       lambda d: room_occupancy_pct(room.homestay, d),
                       lambda d: vehicle_occupancy_pct(vehicle, d) if vehicle else Decimal(0))


# ---------- Giấy phép lái xe ----------
_LIC = {"A1": ("A", 1), "A2": ("A", 2), "B1": ("B", 1), "B2": ("B", 2)}


def license_ok(user_lic, required):
    if not required:
        return True
    if not user_lic:
        return False
    uf, ur = _LIC[user_lic]
    rf, rr = _LIC[required]
    return uf == rf and ur >= rr  # B2 thuê được xe yêu cầu B1; A2 thuê được xe yêu cầu A1


# ---------- Tạo đơn gộp phòng + xe ----------
def _save_nights(item, lines):
    BookingItemNight.objects.bulk_create([
        BookingItemNight(item=item, day=l["date"], price=Decimal(l["price"]), applied_rules=l["applied_rules"])
        for l in lines])


def create_booking(customer, room_id, vehicle_id, ci, co, guests):
    today = timezone.localdate()
    if not (today <= ci < co):  # BR-01
        raise BookingError("Ngày nhận phòng phải trước ngày trả và không ở quá khứ")
    try:
        room = Room.objects.select_related("homestay").get(id=room_id, is_active=True,
                                                           homestay__status=ApprovalStatus.APPROVED)
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
        if not license_ok(customer.license_class, vehicle.license_class):
            raise LicenseMismatch(
                f"Giấy phép lái xe ({customer.license_class or 'chưa khai báo'}) không phù hợp, "
                f"xe yêu cầu {vehicle.license_class}")

    release_expired_holds()
    with transaction.atomic():  # một transaction: lỗi ở xe thì rollback cả phòng
        q = quote(room, vehicle, ci, co)
        expires = timezone.now() + timedelta(minutes=settings.HOLD_MINUTES)
        booking = Booking.objects.create(
            customer=customer, check_in=ci, check_out=co, guests=guests, status=B.HOLD, hold_expires_at=expires,
            total_amount=Decimal(q["total"]), deposit_amount=Decimal(q["deposit"]), price_breakdown=q)

        r_item = BookingItem.objects.create(booking=booking, room=room, subtotal=Decimal(q["room"]["subtotal"]),
                                            breakdown=q["room"])
        _save_nights(r_item, q["room"]["lines"])
        hold_days(RoomDay, "room", room, r_item, ci, co, "Phòng")

        if vehicle:
            v_sub = Decimal(q["vehicle"]["subtotal"]) - Decimal(q["combo_discount"])
            v_item = BookingItem.objects.create(booking=booking, vehicle=vehicle, subtotal=v_sub,
                                                breakdown=q["vehicle"])
            _save_nights(v_item, q["vehicle"]["lines"])
            hold_days(VehicleDay, "vehicle", vehicle, v_item, ci, co, "Xe")  # thiếu xe -> exception -> rollback phòng
    return booking


# ---------- Thanh toán ----------
def initiate_payment(booking, user):
    if booking.customer_id != user.id:
        raise NotAllowed("Không có quyền")
    if booking.status != B.HOLD or booking.hold_expires_at <= timezone.now():
        raise InvalidState("Đơn không còn ở trạng thái giữ chỗ")
    pay = booking.payments.filter(kind=Payment.Kind.DEPOSIT, status=Payment.Status.INIT).first()
    return pay or Payment.objects.create(booking=booking, amount=booking.deposit_amount)


def _confirm_deposit(booking):
    """Thanh toán thành công: còn lịch thì xác nhận, hết lịch thì trả False (hoàn tiền)."""
    items = list(booking.items.select_related("room", "vehicle"))
    ci, co = booking.check_in, booking.check_out

    if booking.status == B.HOLD:  # kể cả đã quá hạn nhưng tác vụ nền chưa nhả
        expected = sum((co - ci).days for _ in items)
        held = (RoomDay.objects.filter(booking_item__booking=booking, status=D.HELD).count()
                + VehicleDay.objects.filter(booking_item__booking=booking, status=D.HELD).count())
        if held != expected:
            return False
    elif booking.status == B.EXPIRED:  # đã nhả: thử giữ lại nếu các ngày còn trống
        try:
            with transaction.atomic():
                for it in items:
                    hold_days(_days_model(it), _fk(it), it.room or it.vehicle, it, ci, co,
                              "Phòng" if it.room_id else "Xe")
        except SlotUnavailable:
            return False
    else:
        return False  # đơn đã hủy / đã xử lý: khoản thu này phải hoàn lại

    booking.status, booking.hold_expires_at = B.PENDING, None
    booking.save(update_fields=["status", "hold_expires_at"])
    booking.items.update(status=I.PENDING, note="")
    return True


def handle_payment_result(gateway_ref, success: bool, amount, payload=None):
    """Webhook idempotent. Raise Payment.DoesNotExist nếu không có giao dịch."""
    with transaction.atomic():
        pay = Payment.objects.select_for_update().get(gateway_ref=gateway_ref, kind=Payment.Kind.DEPOSIT)
        if pay.status != Payment.Status.INIT:
            return pay  # callback lặp: bỏ qua
        if amount is None or Decimal(str(amount)) != pay.amount:
            raise BookingError("Số tiền callback không khớp giao dịch")
        pay.raw_payload = payload or {}
        booking = Booking.objects.select_for_update().get(pk=pay.booking_id)

        if not success:
            pay.status = Payment.Status.FAILED
            if booking.status == B.HOLD:  # thanh toán lỗi: hủy đơn, nhả lịch ngay
                booking.status = B.CANCELLED
                booking.save(update_fields=["status"])
                booking.items.update(status=I.CANCELLED, note="Thanh toán thất bại")
                release_booking_days(booking)
        else:
            pay.paid_at = timezone.now()
            if _confirm_deposit(booking):
                pay.status = Payment.Status.SUCCESS
            else:  # callback trễ và hết lịch: tạo bản ghi hoàn tiền
                pay.status = Payment.Status.REFUND_PENDING
                Payment.objects.create(booking=booking, provider=pay.provider, kind=Payment.Kind.REFUND,
                                       gateway_ref=f"{pay.gateway_ref}-RF", amount=pay.amount,
                                       status=Payment.Status.INIT)
        pay.save()
        return pay


# ---------- Chủ xác nhận / từ chối ----------
def decide_item(item_id, actor, approve: bool, reason=""):
    with transaction.atomic():
        item = (BookingItem.objects.select_for_update(of=("self",))
                .select_related("booking", "room__homestay", "vehicle").get(pk=item_id))
        if item.owner_id != actor.id:
            raise NotAllowed("Không có quyền xử lý đơn này")
        if item.status != I.PENDING:
            raise InvalidState("Đơn không ở trạng thái chờ xác nhận")
        if approve:
            item.status = I.CONFIRMED
            item.save(update_fields=["status"])
            _days_model(item).objects.filter(booking_item=item, status=D.HELD).update(status=D.BOOKED)
        else:
            item.status, item.note = I.CANCELLED, reason
            item.save(update_fields=["status", "note"])
            release_item_days(item)
        _recompute(item.booking)


def _recompute(booking):
    items = list(booking.items.all())
    room_item = next(i for i in items if i.room_id)
    if room_item.status == I.CANCELLED:  # chủ phòng từ chối: hủy cả đơn
        for i in items:
            if i.status != I.CANCELLED:
                i.status = I.CANCELLED
                i.save(update_fields=["status"])
                release_item_days(i)
        booking.status = B.REJECTED
    elif all(i.status in (I.CONFIRMED, I.CANCELLED) for i in items):
        booking.status = B.CONFIRMED
    booking.save(update_fields=["status"])