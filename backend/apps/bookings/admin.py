from django.contrib import admin

from .models import Booking, BookingItem, CalendarSlot, Payment

admin.site.register(Booking)
admin.site.register(BookingItem)
admin.site.register(CalendarSlot)
admin.site.register(Payment)
