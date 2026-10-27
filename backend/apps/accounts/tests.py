from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from .models import User
from apps.listings.models import Homestay, Room, Vehicle
from apps.pricing.models import PricingRule


class DemoAccountLoginTests(TestCase):
    def setUp(self):
        call_command("seed_demo", stdout=StringIO())
        self.client = APIClient()

    def test_seed_demo_creates_accounts_with_hashed_passwords(self):
        expected = {
            "admin": ("admin123", User.Role.ADMIN),
            "host1": ("123456", User.Role.HOST),
            "xe1": ("123456", User.Role.VEHICLE_OWNER),
            "khach1": ("123456", User.Role.CUSTOMER),
            "khach2": ("123456", User.Role.CUSTOMER),
        }

        for username, (password, role) in expected.items():
            with self.subTest(username=username):
                user = User.objects.get(username=username)
                self.assertEqual(user.role, role)
                self.assertTrue(user.check_password(password))
                self.assertNotEqual(user.password, password)

    def test_demo_accounts_can_obtain_jwt_using_username(self):
        for username, password in (("admin", "admin123"), ("host1", "123456"), ("khach2", "123456")):
            with self.subTest(username=username):
                response = self.client.post(
                    "/api/auth/login/",
                    {"username": username, "password": password},
                    format="json",
                )
                self.assertEqual(response.status_code, 200, response.data)
                self.assertIn("access", response.data)
                self.assertIn("refresh", response.data)

    def test_seed_demo_can_be_rerun_without_duplicate_rows(self):
        call_command("seed_demo", stdout=StringIO())

        self.assertEqual(User.objects.count(), 5)
        self.assertEqual(Homestay.objects.count(), 1)
        self.assertEqual(Room.objects.count(), 2)
        self.assertEqual(Vehicle.objects.count(), 1)
        self.assertEqual(PricingRule.objects.count(), 7)
