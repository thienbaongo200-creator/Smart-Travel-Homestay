from rest_framework import serializers

from .models import User

SELF_SERVICE_ROLES = [User.Role.CUSTOMER, User.Role.HOST, User.Role.VEHICLE_OWNER]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    # ADMIN is deliberately not selectable: prevents privilege escalation at signup.
    role = serializers.ChoiceField(choices=SELF_SERVICE_ROLES, default=User.Role.CUSTOMER)

    class Meta:
        model = User
        fields = ["id", "username", "email", "phone", "password", "role"]

    def create(self, validated):
        return User.objects.create_user(**validated)  # hashes password
