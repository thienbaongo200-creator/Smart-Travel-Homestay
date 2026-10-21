from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.deletion import ProtectedError
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings import services as svc
from apps.bookings.models import BookingItem, CalendarSlot
from apps.listings.models import ApprovalStatus, Homestay, Room, Vehicle

from .permissions import IsHost, IsPartner, IsVehicleOwner
from .serializers import HomestaySerializer, RoomSerializer, VehicleSerializer

S = CalendarSlot.Status


class SafeDelete:
    def destroy(self, request, *a, **kw):
        try:
            return super().destroy(request, *a, **kw)
        except ProtectedError:
            return Response({"detail": "Đã có đơn đặt liên quan nên không thể xóa. Hãy tắt hiển thị thay vì xóa."}, status=409)


def _calendar(field, obj):
    today = timezone.localdate()
    qs = (CalendarSlot.objects.filter(svc.active_q(), **{field: obj},
                                      period__overlap=svc._range(today, today + timedelta(days=365)))
          .select_related("booking_item__booking").order_by("period"))
    return [{"id": s.id, "from": s.period.lower.isoformat(), "to": s.period.upper.isoformat(),
             "status": s.status, "note": s.note,
             "booking": s.booking_item.booking.code if s.booking_item_id else None} for s in qs]


class HomestayViewSet(SafeDelete, viewsets.ModelViewSet):
    serializer_class = HomestaySerializer
    permission_classes = [permissions.IsAuthenticated, IsHost]

    def get_queryset(self):
        return Homestay.objects.filter(owner=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, status=ApprovalStatus.PENDING)  # luôn chờ admin duyệt


class RoomViewSet(SafeDelete, viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated, IsHost]

    def get_queryset(self):
        return Room.objects.filter(homestay__owner=self.request.user).select_related("homestay").order_by("homestay_id", "id")

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):
        return Response(_calendar("room", self.get_object()))


class VehicleViewSet(SafeDelete, viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated, IsVehicleOwner]

    def get_queryset(self):
        return Vehicle.objects.filter(owner=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, status=ApprovalStatus.PENDING)

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):  # chủ xe chỉ xem, không sửa lịch thủ công (BR)
        return Response(_calendar("vehicle", self.get_object()))


class UnblockView(APIView):
    """DELETE /api/host/blocks/<id>/ : mở lại lịch đã chặn thủ công."""
    permission_classes = [permissions.IsAuthenticated, IsHost]

    def delete(self, request, slot_id):
        slot = get_object_or_404(CalendarSlot, pk=slot_id, status=S.BLOCKED, room__homestay__owner=request.user)
        slot.delete()
        return Response(status=204)


class InboxView(APIView):
    """Đơn thuộc phòng/xe của đối tác hiện tại (kèm thông tin khách)."""
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        u = request.user
        items = (BookingItem.objects.filter(Q(room__homestay__owner=u) | Q(vehicle__owner=u))
                 .select_related("booking__customer", "slot", "room__homestay", "vehicle")
                 .order_by("-booking__created_at")[:200])
        out = []
        for i in items:
            c = i.booking.customer
            out.append({
                "item_id": i.id, "booking": i.booking.code,
                "type": "ROOM" if i.room_id else "VEHICLE",
                "resource": f"{i.room.homestay.name} / {i.room.name}" if i.room_id else i.vehicle.name,
                "customer": c.username, "email": c.email, "phone": c.phone, "guests": i.booking.guests,
                "check_in": i.booking.check_in, "check_out": i.booking.check_out,
                "status": i.slot.status, "subtotal": i.subtotal, "note": i.slot.note,
                "created_at": i.booking.created_at,
            })
        return Response(out)


class StatsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        u = request.user
        items = BookingItem.objects.filter(Q(room__homestay__owner=u) | Q(vehicle__owner=u))
        earned = items.filter(slot__status__in=[S.CONFIRMED, S.CHECKED_IN, S.CHECKED_OUT])
        monthly = (earned.annotate(m=TruncMonth("booking__check_in")).values("m")
                   .annotate(revenue=Sum("subtotal"), orders=Count("id")).order_by("m"))
        by_status = {r["slot__status"]: r["n"] for r in items.values("slot__status").annotate(n=Count("id"))}

        today = timezone.localdate()
        end = today + timedelta(days=30)
        rooms = Room.objects.filter(homestay__owner=u, is_active=True).count()
        nights = 0
        for s in CalendarSlot.objects.filter(room__homestay__owner=u, status__in=[S.PENDING, S.CONFIRMED, S.CHECKED_IN],
                                             period__overlap=svc._range(today, end)):
            nights += (min(s.period.upper, end) - max(s.period.lower, today)).days

        return Response({
            "total_revenue": earned.aggregate(t=Sum("subtotal"))["t"] or 0,
            "pending": by_status.get("PENDING", 0),
            "total_orders": earned.count(),
            "occupancy_30d": round(100 * nights / (rooms * 30), 1) if rooms else None,
            "by_status": by_status,
            "monthly": [{"month": r["m"].strftime("%Y-%m"), "revenue": r["revenue"], "orders": r["orders"]} for r in monthly],
        })