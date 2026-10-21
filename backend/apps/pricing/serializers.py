from rest_framework import serializers

from .models import PricingRule


class PricingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingRule
        fields = "__all__"

    def validate(self, attrs):
        user = self.context["request"].user
        hs, ve = attrs.get("homestay"), attrs.get("vehicle")
        if hs is None and ve is None:
            raise serializers.ValidationError("Chỉ quản trị mới tạo được rule toàn hệ thống")
        if (hs and hs.owner_id != user.id) or (ve and ve.owner_id != user.id):
            raise serializers.ValidationError("Bạn không sở hữu tài nguyên này")  # chống IDOR khi tạo
        PricingRule(**attrs).clean()
        return attrs
