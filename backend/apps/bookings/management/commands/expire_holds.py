from django.core.management.base import BaseCommand

from apps.bookings.services import release_expired_holds


class Command(BaseCommand):
    help = "Nhả các đơn HOLD hết hạn. Chạy mỗi phút bằng cron / Task Scheduler."

    def handle(self, *args, **opts):
        self.stdout.write(f"expired: {release_expired_holds()}")