from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.deletion import ProtectedError
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import BookingItem, DayStatus, RoomDay, VehicleDay
from apps.listings.models import ApprovalStatus, Homestay, Room, Vehicle

from .permissions import IsHost, IsPartner, IsVehicleOwner
from .serializers import HomestaySerializer, RoomSerializer, VehicleSerializer

D = DayStatus


class SafeDelete:
    def destroy(self, request, *a, **kw):
        try:
            return super().destroy(request, *a, **kw)
        except ProtectedError:
            return Response({"detail": "Đã có đơn đặt liên quan nên không thể xóa. Hãy tắt hiển thị thay vì xóa."}, status=409)


def _calendar(model, fk, obj):
    """Gom các ngày liên tiếp cùng trạng thái/đơn/ghi chú thành một khoảng."""
    today = timezone.localdate()
    rows = (model.objects.filter(**{fk: obj}, day__gte=today, day__lt=today + timedelta(days=365))
            .exclude(status=D.AVAILABLE).select_related("booking_item__booking").order_by("day"))
    out = []
    for r in rows:
        code = r.booking_item.booking.code if r.booking_item_id else None
        nxt = (r.day + timedelta(days=1)).isoformat()
        if out and out[-1]["status"] == r.status and out[-1]["booking"] == code and out[-1]["note"] == r.note \
                and out[-1]["to"] == r.day.isoformat():
            out[-1]["to"] = nxt
        else:
            out.append({"id": r.id, "from": r.day.isoformat(), "to": nxt, "status": r.status, "note": r.note,
                        "booking": code})
    return out


class HomestayViewSet(SafeDelete, viewsets.ModelViewSet):
    serializer_class = HomestaySerializer
    permission_classes = [permissions.IsAuthenticated, IsHost]

    def get_queryset(self):
        return Homestay.objects.filter(owner=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, status=ApprovalStatus.PENDING)


class RoomViewSet(SafeDelete, viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated, IsHost]

    def get_queryset(self):
        return Room.objects.filter(homestay__owner=self.request.user).select_related("homestay").order_by("homestay_id", "id")

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):
        return Response(_calendar(RoomDay, "room", self.get_object()))


class VehicleViewSet(SafeDelete, viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated, IsVehicleOwner]

    def get_queryset(self):
        return Vehicle.objects.filter(owner=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, status=ApprovalStatus.PENDING)

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):  # chủ xe chỉ xem
        return Response(_calendar(VehicleDay, "vehicle", self.get_object()))


class InboxView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        u = request.user
        items = (BookingItem.objects.filter(Q(room__homestay__owner=u) | Q(vehicle__owner=u))
                 .select_related("booking__customer", "room__homestay", "vehicle")
                 .order_by("-booking__created_at")[:200])
        out = []
        for i in items:
            c = i.booking.customer
            out.append({
                "item_id": i.id, "booking": i.booking.code, "type": "ROOM" if i.room_id else "VEHICLE",
                "resource": f"{i.room.homestay.name} / {i.room.name}" if i.room_id else i.vehicle.name,
                "customer": c.username, "email": c.email, "phone": c.phone, "guests": i.booking.guests,
                "check_in": i.booking.check_in, "check_out": i.booking.check_out,
                "status": i.status, "subtotal": i.subtotal, "note": i.note, "created_at": i.booking.created_at,
            })
        return Response(out)


class StatsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsPartner]

    def get(self, request):
        u = request.user
        items = BookingItem.objects.filter(Q(room__homestay__owner=u) | Q(vehicle__owner=u))
        earned = items.filter(status=BookingItem.Status.CONFIRMED)
        monthly = (earned.annotate(m=TruncMonth("booking__check_in")).values("m")
                   .annotate(revenue=Sum("subtotal"), orders=Count("id")).order_by("m"))
        by_status = {r["status"]: r["n"] for r in items.values("status").annotate(n=Count("id"))}

        today = timezone.localdate()
        end = today + timedelta(days=30)
        rooms = Room.objects.filter(homestay__owner=u, is_active=True).count()
        nights = RoomDay.objects.filter(room__homestay__owner=u, room__is_active=True, day__gte=today, day__lt=end,
                                        status__in=[D.HELD, D.BOOKED]).count()
        return Response({
            "total_revenue": earned.aggregate(t=Sum("subtotal"))["t"] or 0,
            "pending": by_status.get("PENDING", 0),
            "total_orders": earned.count(),
            "occupancy_30d": round(100 * nights / (rooms * 30), 1) if rooms else None,
            "by_status": by_status,
            "monthly": [{"month": r["m"].strftime("%Y-%m"), "revenue": r["revenue"], "orders": r["orders"]} for r in monthly],
        })