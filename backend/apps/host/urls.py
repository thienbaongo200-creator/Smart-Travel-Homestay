from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views as v

router = SimpleRouter()
router.register("host/homestays", v.HomestayViewSet, basename="host-homestay")
router.register("host/rooms", v.RoomViewSet, basename="host-room")
router.register("host/vehicles", v.VehicleViewSet, basename="host-vehicle")

urlpatterns = [
    path("host/stats/", v.StatsView.as_view()),
    path("host/inbox/", v.InboxView.as_view()),
    path("host/blocks/<int:slot_id>/", v.UnblockView.as_view()),
] + router.urls