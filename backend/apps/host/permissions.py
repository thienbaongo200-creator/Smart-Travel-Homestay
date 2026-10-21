from rest_framework.permissions import BasePermission

from apps.accounts.models import User

R = User.Role


class _Role(BasePermission):
    roles = ()

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role in self.roles)


class IsHost(_Role):
    roles = (R.HOST, R.ADMIN)


class IsVehicleOwner(_Role):
    roles = (R.VEHICLE_OWNER, R.ADMIN)


class IsPartner(_Role):
    roles = (R.HOST, R.VEHICLE_OWNER, R.ADMIN)