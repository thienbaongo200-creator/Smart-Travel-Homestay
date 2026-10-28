import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


def new_code():
    return uuid.uuid4().hex[:10].upper()


class DayStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Trống"
    HELD = "HELD", "Đang giữ chỗ"
    BOOKED = "BOOKED", "Đã đặt"
    BLOCKED = "BLOCKED", "Chủ chặn"
    MAINTENANCE = "MAINTENANCE", "Bảo trì"


_LINKED = ["HELD", "BOOKED"]


def _link_rule():
    # HELD/BOOKED phải gắn với một mục đơn; các trạng thái khác thì không
    return Q(status__in=_LINKED, booking_item__isnull=False) | (~Q(status__in=_LINKED) & Q(booking_item__isnull=True))


class Booking(models.Model):
    class Status(models.TextChoices):
        HOLD = "HOLD", "Đang giữ chỗ (chờ thanh toán cọc)"
        PENDING = "PENDING", "Chờ chủ xác nhận"
        CONFIRMED = "CONFIRMED", "Đã xác nhận"
        CHECKED_IN = "CHECKED_IN", "Đang lưu trú"
        CHECKED_OUT = "CHECKED_OUT", "Đã hoàn thành"
        CANCELLED = "CANCELLED", "Đã hủy"
        REJECTED = "REJECTED", "Bị từ chối"
        EXPIRED = "EXPIRED", "Hết hạn giữ chỗ"

    code = models.CharField(max_length=10, unique=True, default=new_code, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bookings")
    check_in = models.DateField()
    check_out = models.DateField()
    guests = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.HOLD, db_index=True)
    hold_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=0)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=0)
    price_breakdown = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(check_in__lt=models.F("check_out")), name="booking_dates_valid")]
        indexes = [models.Index(fields=["customer", "-created_at"])]


class BookingItem(models.Model):
    """Một mục trong đơn: đúng một phòng hoặc một xe. Đơn gộp phòng + xe = 2 mục."""

    class Status(models.TextChoices):
        HOLD = "HOLD", "Giữ chỗ"
        PENDING = "PENDING", "Chờ xác nhận"
        CONFIRMED = "CONFIRMED", "Đã xác nhận"
        CANCELLED = "CANCELLED", "Đã hủy"

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="items")
    room = models.ForeignKey("listings.Room", null=True, blank=True, on_delete=models.PROTECT)
    vehicle = models.ForeignKey("listings.Vehicle", null=True, blank=True, on_delete=models.PROTECT)
    subtotal = models.DecimalField(max_digits=12, decimal_places=0)
    breakdown = models.JSONField(default=dict)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.HOLD, db_index=True)
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=(Q(room__isnull=False) & Q(vehicle__isnull=True)) | (Q(room__isnull=True) & Q(vehicle__isnull=False)),
            name="item_room_xor_vehicle")]

    @property
    def owner_id(self):
        return self.room.homestay.owner_id if self.room_id else self.vehicle.owner_id


class BookingItemNight(models.Model):
    """Giá từng đêm chép vào đơn lúc đặt; đổi quy tắc về sau không ảnh hưởng đơn cũ."""
    item = models.ForeignKey(BookingItem, on_delete=models.CASCADE, related_name="nights")
    day = models.DateField()
    price = models.DecimalField(max_digits=12, decimal_places=0)
    applied_rules = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "booking_item_nights"
        ordering = ["day"]
        constraints = [models.UniqueConstraint(fields=["item", "day"], name="uq_booking_item_nights")]


class RoomDay(models.Model):
    """Lịch phòng theo từng ngày. UNIQUE (room_id, day) là chốt cuối chống trùng lịch."""
    room = models.ForeignKey("listings.Room", on_delete=models.CASCADE, related_name="days")
    day = models.DateField()
    status = models.CharField(max_length=12, choices=DayStatus.choices, default=DayStatus.AVAILABLE)
    price_override = models.DecimalField(max_digits=12, decimal_places=0, null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    booking_item = models.ForeignKey(BookingItem, null=True, blank=True, on_delete=models.PROTECT, related_name="room_days")

    class Meta:
        db_table = "room_calendar"
        constraints = [
            models.UniqueConstraint(fields=["room", "day"], name="uq_room_calendar"),
            models.CheckConstraint(condition=_link_rule(), name="ck_room_calendar_link"),
        ]
        indexes = [models.Index(fields=["day", "status"], name="ix_room_calendar_day")]


class VehicleDay(models.Model):
    """Lịch xe theo từng ngày. UNIQUE (vehicle_id, day)."""
    vehicle = models.ForeignKey("listings.Vehicle", on_delete=models.CASCADE, related_name="days")
    day = models.DateField()
    status = models.CharField(max_length=12, choices=DayStatus.choices, default=DayStatus.AVAILABLE)
    price_override = models.DecimalField(max_digits=12, decimal_places=0, null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    booking_item = models.ForeignKey(BookingItem, null=True, blank=True, on_delete=models.PROTECT, related_name="vehicle_days")

    class Meta:
        db_table = "vehicle_calendar"
        constraints = [
            models.UniqueConstraint(fields=["vehicle", "day"], name="uq_vehicle_calendar"),
            models.CheckConstraint(condition=_link_rule(), name="ck_vehicle_calendar_link"),
        ]
        indexes = [models.Index(fields=["day", "status"], name="ix_vehicle_calendar_day")]


class Payment(models.Model):
    class Kind(models.TextChoices):
        DEPOSIT = "DEPOSIT", "Đặt cọc"
        REFUND = "REFUND", "Hoàn tiền"

    class Status(models.TextChoices):
        INIT = "INIT", "Khởi tạo"
        SUCCESS = "SUCCESS", "Thành công"
        FAILED = "FAILED", "Thất bại"
        REFUND_PENDING = "REFUND_PENDING", "Đã thu, chờ hoàn tiền"
        REFUNDED = "REFUNDED", "Đã hoàn"

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="payments")
    provider = models.CharField(max_length=20, default="MOCK")
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.DEPOSIT)
    gateway_ref = models.CharField(max_length=64, unique=True, default=new_code)  # duy nhất: chống xử lý trùng
    amount = models.DecimalField(max_digits=12, decimal_places=0)
    status = models.CharField(max_length=14, choices=Status.choices, default=Status.INIT)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)