from datetime import timedelta
from decimal import Decimal as D

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.bookings import services as svc
from apps.bookings.models import Booking, DayStatus, Payment, RoomDay, VehicleDay
from apps.listings.models import ApprovalStatus, Homestay, Room, Vehicle
from apps.pricing.models import PricingRule


def next_weekday(wd, min_days=3):
    d = timezone.localdate() + timedelta(days=min_days)
    while d.weekday() != wd:
        d += timedelta(days=1)
    return d


class BookingTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user("h", "h@x.com", "123456", role="HOST")
        self.c1 = User.objects.create_user("c1", "c1@x.com", "123456", license_class="A1")
        self.c2 = User.objects.create_user("c2", "c2@x.com", "123456", license_class="B2")
        hs = Homestay.objects.create(owner=self.host, name="H", address="a", city="Đà Lạt", status=ApprovalStatus.APPROVED)
        self.room = Room.objects.create(homestay=hs, name="A", base_price=D(500000), max_guests=2)
        self.bike = Vehicle.objects.create(owner=self.host, name="Vision", vehicle_type="MOTORBIKE", license_class="A1",
                                           base_price=D(150000), city="Đà Lạt", status=ApprovalStatus.APPROVED)
        self.car = Vehicle.objects.create(owner=self.host, name="Vios", vehicle_type="CAR", license_class="B1",
                                          base_price=D(800000), city="Đà Lạt", status=ApprovalStatus.APPROVED)
        PricingRule.objects.create(target="ROOM", kind="WEEKEND", multiplier=D("1.2"))
        PricingRule.objects.create(target="VEHICLE", kind="COMBO", multiplier=D("0.9"), min_value=3)

    def test_calendar_generated_and_unique(self):
        self.assertEqual(RoomDay.objects.filter(room=self.room).count(), 365)
        self.assertEqual(VehicleDay.objects.filter(vehicle=self.bike).count(), 365)

    def test_weekend_combo_price(self):
        ci = next_weekday(4)  # T6 -> 3 đêm T6, T7, CN
        q = svc.quote(self.room, self.bike, ci, ci + timedelta(days=3))
        self.assertEqual(D(q["room"]["subtotal"]), D(1800000))
        self.assertEqual(D(q["combo_discount"]), D(45000))
        self.assertEqual(D(q["total"]), D(2205000))

    def test_price_cap_300_percent(self):
        PricingRule.objects.filter(kind="WEEKEND").update(multiplier=D("5"))
        ci = next_weekday(4)
        q = svc.quote(self.room, None, ci, ci + timedelta(days=1))
        self.assertEqual(D(q["room"]["lines"][0]["price"]), D(1500000))  # trần 300% của 500k
        self.assertTrue(q["room"]["lines"][0]["clamped"])

    def test_overbooking_blocked(self):
        ci = next_weekday(0)
        co = ci + timedelta(days=2)
        svc.create_booking(self.c1, self.room.id, None, ci, co, 2)
        with self.assertRaises(svc.SlotUnavailable):
            svc.create_booking(self.c2, self.room.id, None, ci + timedelta(days=1), co + timedelta(days=1), 2)
        svc.create_booking(self.c2, self.room.id, None, co, co + timedelta(days=1), 2)  # liền kề vẫn hợp lệ

    def test_vehicle_unavailable_rolls_back_room(self):
        ci = next_weekday(1)
        VehicleDay.objects.filter(vehicle=self.bike, day=ci).update(status=DayStatus.MAINTENANCE)
        with self.assertRaises(svc.SlotUnavailable):
            svc.create_booking(self.c1, self.room.id, self.bike.id, ci, ci + timedelta(days=2), 2)
        self.assertEqual(Booking.objects.count(), 0)
        self.assertEqual(RoomDay.objects.filter(room=self.room, status=DayStatus.HELD).count(), 0)

    def test_license_check(self):
        ci = next_weekday(2)
        with self.assertRaises(svc.LicenseMismatch):  # A1 không thuê được ô tô yêu cầu B1
            svc.create_booking(self.c1, self.room.id, self.car.id, ci, ci + timedelta(days=1), 2)
        svc.create_booking(self.c2, self.room.id, self.car.id, ci, ci + timedelta(days=1), 2)  # B2 thuê được B1

    def _held_booking(self, user, ci, co):
        b = svc.create_booking(user, self.room.id, None, ci, co, 2)
        pay = svc.initiate_payment(b, user)
        return b, pay

    def test_payment_amount_and_idempotent(self):
        ci = next_weekday(3)
        b, pay = self._held_booking(self.c1, ci, ci + timedelta(days=1))
        with self.assertRaises(svc.BookingError):
            svc.handle_payment_result(pay.gateway_ref, True, 1, {})
        svc.handle_payment_result(pay.gateway_ref, True, pay.amount, {})
        svc.handle_payment_result(pay.gateway_ref, True, pay.amount, {})  # lặp: bỏ qua
        b.refresh_from_db()
        self.assertEqual(b.status, "PENDING")

    def test_late_callback_confirm_or_refund(self):
        ci = next_weekday(4, 10)
        co = ci + timedelta(days=1)
        b, pay = self._held_booking(self.c1, ci, co)
        Booking.objects.filter(pk=b.pk).update(hold_expires_at=timezone.now() - timedelta(minutes=1))
        svc.release_expired_holds()
        b.refresh_from_db()
        self.assertEqual(b.status, "EXPIRED")
        svc.handle_payment_result(pay.gateway_ref, True, pay.amount, {})  # còn lịch: xác nhận lại
        b.refresh_from_db()
        self.assertEqual(b.status, "PENDING")

        ci2 = ci + timedelta(days=7)
        b2, pay2 = self._held_booking(self.c1, ci2, ci2 + timedelta(days=1))
        Booking.objects.filter(pk=b2.pk).update(hold_expires_at=timezone.now() - timedelta(minutes=1))
        svc.release_expired_holds()
        svc.create_booking(self.c2, self.room.id, None, ci2, ci2 + timedelta(days=1), 2)  # người khác lấy mất lịch
        p = svc.handle_payment_result(pay2.gateway_ref, True, pay2.amount, {})
        self.assertEqual(p.status, Payment.Status.REFUND_PENDING)
        self.assertTrue(Payment.objects.filter(kind="REFUND", booking=b2).exists())