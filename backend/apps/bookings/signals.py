from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.listings.models import Room, Vehicle

from . import services as svc
from .models import RoomDay, VehicleDay


@receiver(post_save, sender=Room)
def room_created(sender, instance, created, **kw):
    if created:
        svc.ensure_calendar(RoomDay, "room", instance)  # tự sinh lịch 365 ngày


@receiver(post_save, sender=Vehicle)
def vehicle_created(sender, instance, created, **kw):
    if created:
        svc.ensure_calendar(VehicleDay, "vehicle", instance)