import hashlib
import hmac
import json

from django.conf import settings
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import Room, Vehicle

from . import services as svc
from .models import Booking, BookingItem, CalendarSlot, Payment
from .serializers import BlockSerializer, DecisionSerializer, QuoteSerializer, SearchSerializer, StaySerializer


def _err(e):
    return Response({"detail": str(e)}, status=e.http_status)


class SearchView(APIView):
    """GET /api/search/?city=&check_in=&check_out=&guests="""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        s = SearchSerializer(data=request.query_params)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["check_in"] >= d["check_out"]:
            return Response({"detail": "check_in phải trước check_out"}, status=400)
        results = []
        for room in svc.search_rooms(d["city"], d["check_in"], d["check_out"], d["guests"])[:50]:
            q = svc.quote(room, None, d["check_in"], d["check_out"])
            results.append({"room_id": room.id, "room": room.name, "homestay": room.homestay.name,
                            "city": room.homestay.city, "lat": room.homestay.latitude, "lng": room.homestay.longitude,
                            "total": q["total"], "nights": q["nights"]})
        vehicles = [{"vehicle_id": v.id, "name": v.name, "type": v.vehicle_type, "base_price": v.base_price}
                    for v in svc.suggest_vehicles(d["city"], d["check_in"], d["check_out"])[:20]]
        return Response({"rooms": results, "vehicle_suggestions": vehicles})


class QuoteView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        s = QuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        room = get_object_or_404(Room.objects.select_related("homestay"), id=d["room_id"])
        vehicle = Vehicle.objects.filter(id=d.get("vehicle_id")).first() if d.get("vehicle_id") else None
        return Response(svc.quote(room, vehicle, d["check_in"], d["check_out"]))


class BookingListCreateView(APIView):
    def get(self, request):
        # IDOR-safe: luôn lọc theo chủ sở hữu ở tầng queryset
        qs = Booking.objects.filter(customer=request.user).order_by("-created_at")
        return Response([{"code": b.code, "status": b.status, "total": b.total_amount, "deposit": b.deposit_amount,
                          "check_in": b.check_in, "check_out": b.check_out, "hold_expires_at": b.hold_expires_at} for b in qs])

    def post(self, request):
        s = QuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        try:
            b = svc.create_booking(request.user, d["room_id"], d.get("vehicle_id"), d["check_in"], d["check_out"], d["guests"])
        except svc.BookingError as e:
            return _err(e)
        return Response({"code": b.code, "status": b.status, "total": b.total_amount, "deposit": b.deposit_amount,
                         "hold_expires_at": b.hold_expires_at, "breakdown": b.price_breakdown}, status=201)


class BookingDetailView(APIView):
    def get(self, request, code):
        b = get_object_or_404(Booking, code=code, customer=request.user)  # 404 thay vì 403: không lộ sự tồn tại
        return Response({"code": b.code, "status": b.status, "total": b.total_amount, "breakdown": b.price_breakdown})


class PayView(APIView):
    def post(self, request, code):
        b = get_object_or_404(Booking, code=code, customer=request.user)
        try:
            p = svc.initiate_payment(b, request.user)
        except svc.BookingError as e:
            return _err(e)
        # Thực tế: build URL VNPay/MoMo/Stripe Checkout ở đây
        return Response({"txn_ref": p.txn_ref, "amount": p.amount, "pay_url": f"/mock-gateway/{p.txn_ref}"})


class PaymentWebhookView(APIView):
    """Mock webhook. Ký HMAC-SHA256 trên raw body (giống cách xác thực VNPay/Stripe)."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        sig = request.headers.get("X-Signature", "")
        expected = hmac.new(settings.PAYMENT_WEBHOOK_SECRET.encode(), request.body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return Response({"detail": "invalid signature"}, status=401)
        data = json.loads(request.body)
        try:
            p = svc.handle_payment_result(data["txn_ref"], bool(data.get("success")), data)
        except Payment.DoesNotExist:
            return Response({"detail": "unknown txn"}, status=404)
        return Response({"status": p.status})


class HostOrdersView(APIView):
    """Đơn thuộc phòng/xe của host hiện tại."""

    def get(self, request):
        items = (BookingItem.objects.filter(Q(room__homestay__owner=request.user) | Q(vehicle__owner=request.user))
                 .select_related("booking", "slot", "room", "vehicle").order_by("-booking__created_at"))
        return Response([{"item_id": i.id, "booking": i.booking.code, "type": "ROOM" if i.room_id else "VEHICLE",
                          "status": i.slot.status, "subtotal": i.subtotal,
                          "check_in": i.booking.check_in, "check_out": i.booking.check_out} for i in items])


class HostDecisionView(APIView):
    def post(self, request, item_id):
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        # lọc theo owner trước -> người lạ nhận 404 (chống IDOR)
        get_object_or_404(BookingItem.objects.filter(Q(room__homestay__owner=request.user) | Q(vehicle__owner=request.user)), pk=item_id)
        try:
            svc.decide_item(item_id, request.user, s.validated_data["action"] == "confirm", s.validated_data["reason"])
        except svc.BookingError as e:
            return _err(e)
        return Response({"ok": True})


class HostBlockView(APIView):
    """POST /api/host/rooms/<id>/blocks/ — chặn lịch thủ công (bảo trì/không cho thuê)."""

    def post(self, request, room_id):
        room = get_object_or_404(Room, pk=room_id, homestay__owner=request.user)
        s = BlockSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["check_in"] >= d["check_out"]:
            return Response({"detail": "Khoảng ngày không hợp lệ"}, status=400)
        try:
            CalendarSlot.objects.create(room=room, period=svc._range(d["check_in"], d["check_out"]),
                                        status=CalendarSlot.Status.BLOCKED, note=d["note"])
        except IntegrityError:
            return Response({"detail": "Khoảng ngày đã có đơn/khóa khác"}, status=409)
        return Response(status=201)
