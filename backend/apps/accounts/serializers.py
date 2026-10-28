from rest_framework import serializers

from .models import LICENSE_CHOICES, User

SELF_SERVICE_ROLES = [User.Role.CUSTOMER, User.Role.HOST, User.Role.VEHICLE_OWNER]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(choices=SELF_SERVICE_ROLES, default=User.Role.CUSTOMER) 
    license_class = serializers.ChoiceField(choices=LICENSE_CHOICES, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "phone", "password", "role", "license_class"]

    def create(self, validated):
        return User.objects.create_user(**validated)


class ProfileSerializer(serializers.ModelSerializer):
    license_class = serializers.ChoiceField(choices=LICENSE_CHOICES, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["phone", "license_class"]