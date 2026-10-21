from django.core.management.base import BaseCommand

from apps.bookings.services import expire_stale_holds


class Command(BaseCommand):
    help = "Nhả các HOLD hết hạn. Chạy mỗi phút bằng cron/Celery beat."

    def handle(self, *args, **opts):
        self.stdout.write(f"expired: {expire_stale_holds()}")
