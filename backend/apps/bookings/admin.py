from django.contrib import admin

from .models import Booking, BookingItem, BookingItemNight, Payment, RoomDay, VehicleDay


@admin.register(RoomDay)
class RoomDayAdmin(admin.ModelAdmin):
    list_display = ("room", "day", "status", "booking_item")
    list_filter = ("status", "room")
    date_hierarchy = "day"


@admin.register(VehicleDay)
class VehicleDayAdmin(RoomDayAdmin):
    list_display = ("vehicle", "day", "status", "booking_item")
    list_filter = ("status", "vehicle")


admin.site.register(Booking)
admin.site.register(BookingItem)
admin.site.register(BookingItemNight)
admin.site.register(Payment)