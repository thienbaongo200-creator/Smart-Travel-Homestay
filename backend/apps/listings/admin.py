from django.contrib import admin

from .models import ApprovalStatus, Homestay, Room, RoomImage, Vehicle


class RoomInline(admin.TabularInline):
    model = Room
    extra = 0


@admin.action(description="Duyệt tin đã chọn")
def approve(modeladmin, request, queryset):
    queryset.update(status=ApprovalStatus.APPROVED)


@admin.register(Homestay)
class HomestayAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "owner", "status")
    list_filter = ("status", "city")
    inlines = [RoomInline]
    actions = [approve]


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("name", "vehicle_type", "base_price", "owner", "status")
    list_filter = ("status", "vehicle_type")
    actions = [approve]


admin.site.register(RoomImage)
