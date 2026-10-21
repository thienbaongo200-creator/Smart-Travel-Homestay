import uuid

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from django.db import models
from django.db.models import Q


def new_code():
    return uuid.uuid4().hex[:10].upper()


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
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="items")
    room = models.ForeignKey("listings.Room", null=True, blank=True, on_delete=models.PROTECT)
    vehicle = models.ForeignKey("listings.Vehicle", null=True, blank=True, on_delete=models.PROTECT)
    subtotal = models.DecimalField(max_digits=12, decimal_places=0)
    breakdown = models.JSONField(default=dict)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=(Q(room__isnull=False) & Q(vehicle__isnull=True)) | (Q(room__isnull=True) & Q(vehicle__isnull=False)),
            name="item_room_xor_vehicle")]

    @property
    def owner_id(self):
        return self.room.homestay.owner_id if self.room_id else self.vehicle.owner_id


class CalendarSlot(models.Model):
    """Nguồn sự thật cho lịch Phòng/Xe. DB tự chặn overbooking bằng EXCLUDE constraint."""

    class Status(models.TextChoices):
        HOLD = "HOLD", "Giữ chỗ tạm"
        PENDING = "PENDING", "Chờ xác nhận"
        CONFIRMED = "CONFIRMED", "Đã xác nhận"
        CHECKED_IN = "CHECKED_IN", "Đang lưu trú"
        CHECKED_OUT = "CHECKED_OUT", "Đã trả"
        BLOCKED = "BLOCKED", "Chủ chặn / bảo trì"
        CANCELLED = "CANCELLED", "Đã hủy"

    room = models.ForeignKey("listings.Room", null=True, blank=True, on_delete=models.CASCADE, related_name="slots")
    vehicle = models.ForeignKey("listings.Vehicle", null=True, blank=True, on_delete=models.CASCADE, related_name="slots")
    period = DateRangeField()  # [check_in, check_out): đêm trả phòng không bị tính
    status = models.CharField(max_length=12, choices=Status.choices, db_index=True)
    booking_item = models.OneToOneField(BookingItem, null=True, blank=True, on_delete=models.CASCADE, related_name="slot")
    expires_at = models.DateTimeField(null=True, blank=True)  # chỉ dùng cho HOLD
    note = models.CharField(max_length=300, blank=True)

    BLOCKING = ["HOLD", "PENDING", "CONFIRMED", "CHECKED_IN", "BLOCKED"]

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(Q(room__isnull=False) & Q(vehicle__isnull=True)) | (Q(room__isnull=True) & Q(vehicle__isnull=False)),
                name="slot_room_xor_vehicle"),
            ExclusionConstraint(
                name="no_room_overlap",
                expressions=[("room", RangeOperators.EQUAL), ("period", RangeOperators.OVERLAPS)],
                condition=Q(room__isnull=False, status__in=["HOLD", "PENDING", "CONFIRMED", "CHECKED_IN", "BLOCKED"]),
            ),
            ExclusionConstraint(
                name="no_vehicle_overlap",
                expressions=[("vehicle", RangeOperators.EQUAL), ("period", RangeOperators.OVERLAPS)],
                condition=Q(vehicle__isnull=False, status__in=["HOLD", "PENDING", "CONFIRMED", "CHECKED_IN", "BLOCKED"]),
            ),
        ]
        indexes = [models.Index(fields=["status", "expires_at"])]


class Payment(models.Model):
    class Status(models.TextChoices):
        INIT = "INIT", "Khởi tạo"
        SUCCESS = "SUCCESS", "Thành công"
        FAILED = "FAILED", "Thất bại"
        NEEDS_REFUND = "NEEDS_REFUND", "Cần hoàn tiền"

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="payments")
    provider = models.CharField(max_length=20, default="MOCK")  # VNPAY / MOMO / STRIPE
    txn_ref = models.CharField(max_length=64, unique=True, default=new_code)  # khóa idempotency
    amount = models.DecimalField(max_digits=12, decimal_places=0)
    status = models.CharField(max_length=14, choices=Status.choices, default=Status.INIT)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
