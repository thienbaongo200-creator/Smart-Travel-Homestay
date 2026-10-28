from django.contrib.auth.models import AbstractUser
from django.db import models

LICENSE_CHOICES = [("A1", "A1"), ("A2", "A2"), ("B1", "B1"), ("B2", "B2")]


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = "CUSTOMER", "Khách hàng"
        HOST = "HOST", "Chủ homestay"
        VEHICLE_OWNER = "VEHICLE_OWNER", "Chủ xe"
        ADMIN = "ADMIN", "Quản trị"

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    license_class = models.CharField(max_length=2, blank=True, choices=LICENSE_CHOICES)  

    REQUIRED_FIELDS = ["email"]