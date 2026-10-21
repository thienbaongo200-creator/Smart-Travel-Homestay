from decimal import Decimal

from django.conf import settings
from django.db import models


class ApprovalStatus(models.TextChoices):
    PENDING = "PENDING", "Chờ duyệt"
    APPROVED = "APPROVED", "Đã duyệt"
    REJECTED = "REJECTED", "Từ chối"
    SUSPENDED = "SUSPENDED", "Tạm khóa"


class Homestay(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="homestays")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=300)
    city = models.CharField(max_length=100, db_index=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING, db_index=True)
    reject_reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Room(models.Model):
    """Đơn vị cho thuê thực tế (bookable unit)."""
    homestay = models.ForeignKey(Homestay, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=120)
    base_price = models.DecimalField(max_digits=12, decimal_places=0)  # VND / đêm
    max_guests = models.PositiveSmallIntegerField(default=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(base_price__gt=0), name="room_price_positive")]

    def __str__(self):
        return f"{self.homestay.name} / {self.name}"

    @property
    def owner_id(self):
        return self.homestay.owner_id


class RoomImage(models.Model):
    homestay = models.ForeignKey(Homestay, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="homestays/")


class Vehicle(models.Model):
    class Type(models.TextChoices):
        MOTORBIKE = "MOTORBIKE", "Xe máy"
        CAR = "CAR", "Ô tô"

    class Transmission(models.TextChoices):
        AUTOMATIC = "AT", "Số tự động"
        MANUAL = "MT", "Số sàn"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="vehicles")
    name = models.CharField(max_length=150)
    vehicle_type = models.CharField(max_length=10, choices=Type.choices, db_index=True)
    transmission = models.CharField(max_length=2, choices=Transmission.choices, default=Transmission.AUTOMATIC)
    engine_cc = models.PositiveIntegerField(null=True, blank=True)
    seats = models.PositiveSmallIntegerField(default=2)
    base_price = models.DecimalField(max_digits=12, decimal_places=0)  # VND / ngày
    city = models.CharField(max_length=100, db_index=True)
    image = models.ImageField(upload_to="vehicles/", blank=True)
    status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING, db_index=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(base_price__gt=0), name="vehicle_price_positive")]

    def __str__(self):
        return self.name
