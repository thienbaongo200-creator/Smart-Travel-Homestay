from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.listings.models import ApprovalStatus, Homestay, Vehicle


class AdminApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="secure-test-password", role=User.Role.ADMIN
        )
        self.owner = User.objects.create_user(
            username="host", email="host@example.com", password="secure-test-password", role=User.Role.HOST
        )
        self.homestay = Homestay.objects.create(
            owner=self.owner, name="Pending stay", address="Address", city="Da Lat",
            status=ApprovalStatus.PENDING,
        )
        self.vehicle = Vehicle.objects.create(
            owner=self.owner, name="Pending vehicle", vehicle_type="MOTORBIKE",
            base_price=100000, city="Da Lat", status=ApprovalStatus.PENDING,
        )

    def test_admin_can_load_overview_and_pending_approvals(self):
        self.client.force_authenticate(self.admin)

        overview = self.client.get("/api/admin/overview/")
        approvals = self.client.get("/api/admin/approvals/")

        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.data["pending_approvals"], 2)
        self.assertEqual(approvals.status_code, 200)
        self.assertEqual(approvals.data["homestays"][0]["id"], self.homestay.id)
        self.assertEqual(approvals.data["vehicles"][0]["id"], self.vehicle.id)

    def test_non_admin_cannot_access_admin_api(self):
        self.client.force_authenticate(self.owner)

        self.assertEqual(self.client.get("/api/admin/overview/").status_code, 403)

    def test_admin_can_reject_pending_homestay_with_reason(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f"/api/admin/approvals/homestay/{self.homestay.id}/decision/",
            {"status": ApprovalStatus.REJECTED, "reason": "Thiếu thông tin."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.homestay.refresh_from_db()
        self.assertEqual(self.homestay.status, ApprovalStatus.REJECTED)
        self.assertEqual(self.homestay.reject_reason, "Thiếu thông tin.")

    def test_admin_can_update_user_status_but_not_deactivate_self(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"/api/admin/users/{self.owner.id}/status/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.is_active)

        self_response = self.client.patch(
            f"/api/admin/users/{self.admin.id}/status/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(self_response.status_code, 400)

    def test_admin_can_reject_vehicle_and_store_feedback(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f"/api/admin/approvals/vehicle/{self.vehicle.id}/decision/",
            {"status": ApprovalStatus.REJECTED, "reason": "Thiếu giấy tờ xe."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.status, ApprovalStatus.REJECTED)
        self.assertEqual(self.vehicle.reject_reason, "Thiếu giấy tờ xe.")
