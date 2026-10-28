import hashlib
import hmac
import json

from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import Room

from . import services as svc
from .models import Booking, BookingItem, Payment
from .serializers import BlockSerializer, DecisionSerializer, QuoteSerializer, SearchSerializer


def _err(e):
    return Response({"detail": str(e)}, status=e.http_status)


class SearchView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        s = SearchSerializer(data=request.query_params)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["check_in"] >= d["check_out"]:
            return Response({"detail": "check_in phải trước check_out"}, status=400)
        results = []
        for room in svc.search_rooms(d["city"], d["check_in"], d["check_out"], d["guests"])[:50]:
            q = svc.quote(room, None, d["check_in"], d["check_out"])
            hs = room.homestay
            results.append({"room_id": room.id, "room": room.name, "homestay": hs.name, "city": hs.city,
                            "lat": float(hs.latitude) if hs.latitude is not None else None,
                            "lng": float(hs.longitude) if hs.longitude is not None else None,
                            "total": q["total"], "nights": q["nights"]})
        vehicles = [{"vehicle_id": v.id, "name": v.name, "type": v.vehicle_type, "base_price": v.base_price}
                    for v in svc.suggest_vehicles(d["city"], d["check_in"], d["check_out"])[:20]]
        return Response({"rooms": results, "vehicle_suggestions": vehicles})


class QuoteView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        s = QuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        room = get_object_or_404(Room.objects.select_related("homestay"), id=d["room_id"])
        from apps.listings.models import Vehicle
        vehicle = Vehicle.objects.filter(id=d.get("vehicle_id")).first() if d.get("vehicle_id") else None
        return Response(svc.quote(room, vehicle, d["check_in"], d["check_out"]))


class BookingListCreateView(APIView):
    def get(self, request):
        svc.release_expired_holds()  # đơn quá hạn hiện đúng trạng thái EXPIRED
        qs = Booking.objects.filter(customer=request.user).order_by("-created_at")  # IDOR-safe
        return Response([{"code": b.code, "status": b.status, "total": b.total_amount, "deposit": b.deposit_amount,
                          "check_in": b.check_in, "check_out": b.check_out, "hold_expires_at": b.hold_expires_at}
                         for b in qs])

    def post(self, request):
        s = QuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        try:
            b = svc.create_booking(request.user, d["room_id"], d.get("vehicle_id"), d["check_in"], d["check_out"],
                                   d["guests"])
        except svc.BookingError as e:
            return _err(e)
        return Response({"code": b.code, "status": b.status, "total": b.total_amount, "deposit": b.deposit_amount,
                         "hold_expires_at": b.hold_expires_at, "breakdown": b.price_breakdown}, status=201)


class BookingDetailView(APIView):
    def get(self, request, code):
        svc.release_expired_holds()
        b = get_object_or_404(Booking.objects.prefetch_related("items__nights", "items__room__homestay", "items__vehicle"),
                              code=code, customer=request.user)  # 404 thay vì 403: không lộ sự tồn tại
        items = [{
            "type": "ROOM" if i.room_id else "VEHICLE",
            "name": f"{i.room.homestay.name} / {i.room.name}" if i.room_id else i.vehicle.name,
            "status": i.status, "subtotal": i.subtotal, "note": i.note,
            "nights": [{"day": n.day, "price": n.price, "applied_rules": n.applied_rules} for n in i.nights.all()],
        } for i in b.items.all()]
        return Response({"code": b.code, "status": b.status, "total": b.total_amount, "deposit": b.deposit_amount,
                         "check_in": b.check_in, "check_out": b.check_out, "items": items})


class PayView(APIView):
    def post(self, request, code):
        b = get_object_or_404(Booking, code=code, customer=request.user)
        try:
            p = svc.initiate_payment(b, request.user)
        except svc.BookingError as e:
            return _err(e)
        return Response({"gateway_ref": p.gateway_ref, "amount": p.amount, "pay_url": f"/mock-gateway/{p.gateway_ref}"})


class PaymentWebhookView(APIView):
    """Kiểm tra chữ ký HMAC-SHA256 trên raw body, kiểm tra số tiền, xử lý idempotent."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        sig = request.headers.get("X-Signature", "")
        expected = hmac.new(settings.PAYMENT_WEBHOOK_SECRET.encode(), request.body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return Response({"detail": "invalid signature"}, status=401)
        try:
            data = json.loads(request.body)
        except ValueError:
            return Response({"detail": "invalid json"}, status=400)
        ref = data.get("gateway_ref") or data.get("txn_ref")
        try:
            p = svc.handle_payment_result(ref, bool(data.get("success")), data.get("amount"), data)
        except Payment.DoesNotExist:
            return Response({"detail": "unknown gateway_ref"}, status=404)
        except svc.BookingError as e:
            return _err(e)
        return Response({"status": p.status})


class HostDecisionView(APIView):
    def post(self, request, item_id):
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        get_object_or_404(BookingItem.objects.filter(Q(room__homestay__owner=request.user) | Q(vehicle__owner=request.user)),
                          pk=item_id)  # người lạ nhận 404
        try:
            svc.decide_item(item_id, request.user, s.validated_data["action"] == "confirm", s.validated_data["reason"])
        except svc.BookingError as e:
            return _err(e)
        return Response({"ok": True})


class HostBlockView(APIView):
    """POST: chặn lịch thủ công. DELETE ?from=&to= : mở lại."""

    def post(self, request, room_id):
        room = get_object_or_404(Room, pk=room_id, homestay__owner=request.user)
        s = BlockSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        try:
            svc.block_room(room, d["check_in"], d["check_out"], d["note"])
        except svc.BookingError as e:
            return _err(e)
        return Response(status=201)

    def delete(self, request, room_id):
        room = get_object_or_404(Room, pk=room_id, homestay__owner=request.user)
        ci, co = parse_date(request.query_params.get("from", "")), parse_date(request.query_params.get("to", ""))
        if not ci or not co:
            return Response({"detail": "Thiếu from/to"}, status=400)
        svc.unblock_room(room, ci, co)
        return Response(status=204)