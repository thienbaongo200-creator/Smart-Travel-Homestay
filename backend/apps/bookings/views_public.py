from datetime import timedelta

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import ApprovalStatus, Room

from . import services as svc
from .models import Booking, DayStatus, RoomDay
from .serializers import SearchSerializer


class RoomDetailView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, room_id):
        svc.release_expired_holds()
        room = get_object_or_404(Room.objects.select_related("homestay"), pk=room_id, is_active=True,
                                 homestay__status=ApprovalStatus.APPROVED)
        today = timezone.localdate()
        busy = (RoomDay.objects.filter(room=room, day__gte=today, day__lt=today + timedelta(days=365))
                .exclude(status=DayStatus.AVAILABLE).order_by("day").values_list("day", flat=True))
        hs = room.homestay
        return Response({
            "id": room.id, "name": room.name, "homestay": hs.name, "city": hs.city, "address": hs.address,
            "description": hs.description, "max_guests": room.max_guests, "base_price": room.base_price,
            "lat": float(hs.latitude) if hs.latitude is not None else None,
            "lng": float(hs.longitude) if hs.longitude is not None else None,
            "busy_dates": [d.isoformat() for d in busy],
        })


class VehicleSuggestView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        s = SearchSerializer(data=request.query_params)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["check_in"] >= d["check_out"]:
            return Response({"detail": "check_in phải trước check_out"}, status=400)
        return Response([{"vehicle_id": v.id, "name": v.name, "type": v.vehicle_type, "transmission": v.transmission,
                          "seats": v.seats, "license_class": v.license_class, "base_price": v.base_price}
                         for v in svc.suggest_vehicles(d["city"], d["check_in"], d["check_out"])[:20]])


class MockPayView(APIView):
    """Chỉ khi DEBUG=True. Gọi thẳng service (đã bao gồm kiểm tra số tiền)."""

    def post(self, request, code):
        if not settings.DEBUG:
            return Response(status=404)
        booking = get_object_or_404(Booking, code=code, customer=request.user)
        pay = booking.payments.filter(kind="DEPOSIT", status="INIT").order_by("-id").first()
        if pay is None:
            return Response({"detail": "Không có giao dịch đang chờ"}, status=409)
        try:
            pay = svc.handle_payment_result(pay.gateway_ref, bool(request.data.get("success", True)), pay.amount,
                                            {"mock": True})
        except svc.BookingError as e:
            return Response({"detail": str(e)}, status=e.http_status)
        return Response({"status": pay.status})