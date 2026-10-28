from django.core.management.base import BaseCommand

from apps.bookings import services as svc
from apps.bookings.models import RoomDay, VehicleDay
from apps.listings.models import Room, Vehicle


class Command(BaseCommand):
    help = "Bổ sung lịch 365 ngày cho mọi phòng/xe (chạy sau khi nạp dữ liệu cũ, hoặc mỗi đêm)."

    def handle(self, *args, **opts):
        for r in Room.objects.filter(is_active=True):
            svc.ensure_calendar(RoomDay, "room", r)
        for v in Vehicle.objects.all():
            svc.ensure_calendar(VehicleDay, "vehicle", v)
        self.stdout.write("done")