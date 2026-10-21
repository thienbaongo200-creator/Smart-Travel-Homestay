"""Endpoint bổ sung cho frontend. Đặt file này tại apps/bookings/views_public.py"""
from datetime import timedelta

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import ApprovalStatus, Room

from . import services as svc
from .models import Booking, CalendarSlot
from .serializers import SearchSerializer


class RoomDetailView(APIView):
    """GET /api/rooms/<id>/ : thông tin phòng + danh sách đêm đã kín trong 365 ngày tới."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, room_id):
        room = get_object_or_404(Room.objects.select_related("homestay"), pk=room_id, is_active=True,
                                 homestay__status=ApprovalStatus.APPROVED)
        today = timezone.localdate()
        horizon = today + timedelta(days=365)
        slots = CalendarSlot.objects.filter(svc.active_q(), room=room, period__overlap=svc._range(today, horizon))
        busy = set()
        for s in slots:
            d, end = max(s.period.lower, today), min(s.period.upper, horizon)
            while d < end:
                busy.add(d.isoformat())
                d += timedelta(days=1)
        hs = room.homestay
        return Response({
            "id": room.id, "name": room.name, "homestay": hs.name, "city": hs.city, "address": hs.address,
            "description": hs.description, "max_guests": room.max_guests, "base_price": room.base_price,
            "lat": float(hs.latitude) if hs.latitude is not None else None,
            "lng": float(hs.longitude) if hs.longitude is not None else None,
            "busy_dates": sorted(busy),
        })


class VehicleSuggestView(APIView):
    """GET /api/vehicles/suggest/?city&check_in&check_out : xe trống trong toàn bộ kỳ."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        s = SearchSerializer(data=request.query_params)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["check_in"] >= d["check_out"]:
            return Response({"detail": "check_in phải trước check_out"}, status=400)
        return Response([{"vehicle_id": v.id, "name": v.name, "type": v.vehicle_type, "transmission": v.transmission,
                          "seats": v.seats, "base_price": v.base_price}
                         for v in svc.suggest_vehicles(d["city"], d["check_in"], d["check_out"])[:20]])


class MockPayView(APIView):
    """POST /api/bookings/<code>/mock-pay/ {success: bool} : chỉ hoạt động khi DEBUG=True."""

    def post(self, request, code):
        if not settings.DEBUG:
            return Response(status=404)
        booking = get_object_or_404(Booking, code=code, customer=request.user)
        pay = booking.payments.filter(status="INIT").order_by("-id").first()
        if pay is None:
            return Response({"detail": "Không có giao dịch đang chờ"}, status=409)
        pay = svc.handle_payment_result(pay.txn_ref, bool(request.data.get("success", True)), {"mock": True})
        return Response({"status": pay.status})