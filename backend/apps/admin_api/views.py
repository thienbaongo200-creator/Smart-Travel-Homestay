from datetime import date

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.bookings.models import Booking, Payment
from apps.listings.models import ApprovalStatus, Homestay, Vehicle

from .permissions import IsSiteAdmin


def _month_offset(year, month, offset):
    month_index = year * 12 + month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


class AdminOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiteAdmin]

    def get(self, request):
        today = timezone.localdate()
        start_month = _month_offset(today.year, today.month, -5)
        monthly = (
            Payment.objects.filter(status=Payment.Status.SUCCESS, created_at__date__gte=start_month)
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(revenue=Sum("amount"), payments=Count("id"))
            .order_by("month")
        )
        booking_status = dict(
            Booking.objects.values("status").annotate(total=Count("id")).values_list("status", "total")
        )
        pending_homestays = Homestay.objects.filter(status=ApprovalStatus.PENDING).count()
        pending_vehicles = Vehicle.objects.filter(status=ApprovalStatus.PENDING).count()

        return Response({
            "users_total": User.objects.count(),
            "users_active": User.objects.filter(is_active=True).count(),
            "homestays_total": Homestay.objects.count(),
            "vehicles_total": Vehicle.objects.count(),
            "pending_approvals": pending_homestays + pending_vehicles,
            "bookings_total": Booking.objects.count(),
            "revenue_total": Payment.objects.filter(status=Payment.Status.SUCCESS).aggregate(
                total=Sum("amount")
            )["total"] or 0,
            "bookings_by_status": booking_status,
            "monthly_revenue": [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "revenue": row["revenue"],
                    "payments": row["payments"],
                }
                for row in monthly
            ],
        })


class UserListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiteAdmin]

    def get(self, request):
        users = User.objects.all().order_by("id")
        query = request.query_params.get("q", "").strip()
        if query:
            users = users.filter(
                Q(username__icontains=query)
                | Q(email__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            )
        return Response([
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "phone": user.phone,
                "role": user.role,
                "is_active": user.is_active,
                "date_joined": user.date_joined,
            }
            for user in users[:250]
        ])


class UserStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiteAdmin]

    def patch(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        is_active = request.data.get("is_active")
        if not isinstance(is_active, bool):
            return Response(
                {"is_active": ["Giá trị phải là true hoặc false."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.pk == request.user.pk and not is_active:
            return Response(
                {"detail": "Bạn không thể tự khóa tài khoản quản trị hiện tại."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = is_active
        user.save(update_fields=["is_active"])
        return Response({"id": user.id, "is_active": user.is_active})


class ApprovalListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiteAdmin]

    def get(self, request):
        homestays = Homestay.objects.filter(status=ApprovalStatus.PENDING).select_related("owner").order_by("id")
        vehicles = Vehicle.objects.filter(status=ApprovalStatus.PENDING).select_related("owner").order_by("id")
        return Response({
            "homestays": [
                {
                    "id": item.id,
                    "name": item.name,
                    "city": item.city,
                    "address": item.address,
                    "owner": item.owner.username,
                    "created_at": item.created_at,
                    "description": item.description,
                }
                for item in homestays
            ],
            "vehicles": [
                {
                    "id": item.id,
                    "name": item.name,
                    "vehicle_type": item.vehicle_type,
                    "city": item.city,
                    "owner": item.owner.username,
                    "base_price": item.base_price,
                }
                for item in vehicles
            ],
        })


class ApprovalDecisionView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSiteAdmin]

    def post(self, request, kind, listing_id):
        status_value = request.data.get("status")
        if status_value not in (ApprovalStatus.APPROVED, ApprovalStatus.REJECTED):
            return Response(
                {"status": ["Chọn APPROVED hoặc REJECTED."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get("reason", "")).strip()
        if status_value == ApprovalStatus.REJECTED and not reason:
            return Response(
                {"reason": ["Cần nêu lý do khi từ chối."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model = {"homestay": Homestay, "vehicle": Vehicle}.get(kind)
        if model is None:
            return Response({"detail": "Loại tin đăng không hợp lệ."}, status=status.HTTP_404_NOT_FOUND)
        listing = get_object_or_404(model, pk=listing_id)
        if listing.status != ApprovalStatus.PENDING:
            return Response(
                {"detail": "Chỉ có thể xử lý tin đang chờ duyệt."},
                status=status.HTTP_409_CONFLICT,
            )
        listing.status = status_value
        if isinstance(listing, Homestay):
            listing.reject_reason = reason if status_value == ApprovalStatus.REJECTED else ""
            listing.save(update_fields=["status", "reject_reason"])
        else:
            listing.reject_reason = reason if status_value == ApprovalStatus.REJECTED else ""
            listing.save(update_fields=["status", "reject_reason"])
        return Response({"id": listing.id, "kind": kind, "status": listing.status})
