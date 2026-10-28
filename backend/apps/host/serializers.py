from rest_framework import serializers

from apps.listings.models import Homestay, Room, Vehicle


class HomestaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Homestay
        fields = ["id", "name", "description", "address", "city", "latitude", "longitude",
                  "status", "reject_reason", "created_at"]
        read_only_fields = ["status", "reject_reason", "created_at"]


class RoomSerializer(serializers.ModelSerializer):
    homestay_name = serializers.CharField(source="homestay.name", read_only=True)

    class Meta:
        model = Room
        fields = ["id", "homestay", "homestay_name", "name", "base_price", "max_guests", "is_active"]

    def validate_homestay(self, hs):
        if hs.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Bạn không sở hữu homestay này")  # chống IDOR
        return hs

    def validate_base_price(self, v):
        if v <= 0:
            raise serializers.ValidationError("Giá phải lớn hơn 0")
        return v


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ["id", "name", "vehicle_type", "transmission", "engine_cc", "seats", "license_class",
                  "base_price", "city", "status"]
        read_only_fields = ["status"]

    def validate_base_price(self, v):
        if v <= 0:
            raise serializers.ValidationError("Giá phải lớn hơn 0")
        return v

    def validate(self, attrs):
        if not attrs.get("license_class") and not (self.instance and self.instance.license_class):
            vt = attrs.get("vehicle_type") or (self.instance and self.instance.vehicle_type)
            attrs["license_class"] = "B1" if vt == "CAR" else "A1"
        return attrs