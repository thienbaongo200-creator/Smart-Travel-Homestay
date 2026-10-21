from datetime import date
from decimal import Decimal as D

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.listings.models import ApprovalStatus, Homestay, Room, Vehicle
from apps.pricing.models import PricingRule

R, T = PricingRule.Kind, PricingRule.Target


class Command(BaseCommand):
    help = "Tạo dữ liệu demo (host, chủ xe, khách, homestay, xe, quy tắc giá)."

    def handle(self, *args, **opts):
        host = User.objects.create_user("host1", "host1@example.com", "123456", role="HOST")
        owner = User.objects.create_user("xe1", "xe1@example.com", "123456", role="VEHICLE_OWNER")
        User.objects.create_user("khach1", "khach1@example.com", "123456", role="CUSTOMER")
        User.objects.create_superuser("admin", "admin@example.com", "admin123", role="ADMIN")

        hs = Homestay.objects.create(owner=host, name="Homestay Đà Lạt Xanh", address="12 Trại Mát", city="Đà Lạt",
                                     latitude=D("11.9404"), longitude=D("108.4583"), status=ApprovalStatus.APPROVED)
        Room.objects.create(homestay=hs, name="Phòng A", base_price=D(500000), max_guests=2)
        Room.objects.create(homestay=hs, name="Phòng B", base_price=D(700000), max_guests=4)
        Vehicle.objects.create(owner=owner, name="Honda Vision", vehicle_type="MOTORBIKE", engine_cc=110, seats=2,
                               base_price=D(150000), city="Đà Lạt", status=ApprovalStatus.APPROVED)

        # Rule mặc định toàn hệ thống (homestay=None, vehicle=None)
        rules = [
            dict(target=T.ROOM, kind=R.WEEKEND, multiplier=D("1.2")),
            dict(target=T.ROOM, kind=R.HOLIDAY, multiplier=D("1.5"), start_date=date(2026, 12, 31), end_date=date(2027, 1, 2)),
            dict(target=T.ROOM, kind=R.OCCUPANCY, multiplier=D("1.1"), min_value=70),
            dict(target=T.ROOM, kind=R.OCCUPANCY, multiplier=D("1.2"), min_value=80),
            dict(target=T.ROOM, kind=R.LEAD_TIME, multiplier=D("0.95"), min_value=30),            # early bird
            dict(target=T.ROOM, kind=R.LEAD_TIME, multiplier=D("1.10"), min_value=0, max_value=1),  # last-minute
            dict(target=T.VEHICLE, kind=R.COMBO, multiplier=D("0.90"), min_value=3),            # giảm 10% xe nếu ≥3 đêm
        ]
        for r in rules:
            PricingRule.objects.create(**r)
        self.stdout.write("Seed OK: host1/xe1/khach1 (pw 123456), admin/admin123")
