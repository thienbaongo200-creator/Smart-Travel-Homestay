from datetime import date, timedelta
from decimal import Decimal as D

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.bookings import services as svc
from apps.listings.models import ApprovalStatus, Homestay, Room, Vehicle
from apps.pricing.models import PricingRule


def next_weekday(wd, min_days=40):
    d = timezone.localdate() + timedelta(days=min_days)
    while d.weekday() != wd:
        d += timedelta(days=1)
    return d


class BookingTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user("h", "h@x.com", "123456", role="HOST")
        self.cus = [User.objects.create_user(f"c{i}", f"c{i}@x.com", "123456") for i in range(2)]
        hs = Homestay.objects.create(owner=self.host, name="H", address="a", city="Đà Lạt", status=ApprovalStatus.APPROVED)
        self.room = Room.objects.create(homestay=hs, name="A", base_price=D(500000), max_guests=2)
        self.bike = Vehicle.objects.create(owner=self.host, name="Vision", vehicle_type="MOTORBIKE", base_price=D(150000),
                                           city="Đà Lạt", status=ApprovalStatus.APPROVED)
        PricingRule.objects.create(target="ROOM", kind="WEEKEND", multiplier=D("1.2"))
        PricingRule.objects.create(target="VEHICLE", kind="COMBO", multiplier=D("0.9"), min_value=3)

    def test_weekend_combo_price(self):
        ci = next_weekday(4)  # Thứ 6 -> 3 đêm T6,T7,CN
        q = svc.quote(self.room, self.bike, ci, ci + timedelta(days=3))
        self.assertEqual(D(q["room"]["subtotal"]), D(1800000))      # 500k × 1.2 × 3
        self.assertEqual(D(q["combo_discount"]), D(45000))           # 10% của 450k
        self.assertEqual(D(q["total"]), D(2205000))

    def test_overbooking_blocked(self):
        ci = next_weekday(0)
        co = ci + timedelta(days=2)
        svc.create_booking(self.cus[0], self.room.id, None, ci, co, 2)
        with self.assertRaises(svc.SlotUnavailable):
            svc.create_booking(self.cus[1], self.room.id, None, ci + timedelta(days=1), co + timedelta(days=1), 2)
        # liền kề (check-in đúng ngày người trước check-out) vẫn hợp lệ
        svc.create_booking(self.cus[1], self.room.id, None, co, co + timedelta(days=1), 2)
