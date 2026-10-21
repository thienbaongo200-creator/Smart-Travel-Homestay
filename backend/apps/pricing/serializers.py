import copy

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import PricingRule


class PricingRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingRule
        fields = "__all__"

    def validate(self, attrs):
        user = self.context["request"].user
        inst = self.instance
        hs = attrs.get("homestay", inst.homestay if inst else None)
        ve = attrs.get("vehicle", inst.vehicle if inst else None)
        if hs is None and ve is None:
            raise serializers.ValidationError("Chọn homestay hoặc xe áp dụng (rule toàn hệ thống chỉ admin tạo)")
        if hs is not None and ve is not None:
            raise serializers.ValidationError("Chỉ chọn một: homestay hoặc xe")
        if (hs and hs.owner_id != user.id) or (ve and ve.owner_id != user.id):
            raise serializers.ValidationError("Bạn không sở hữu tài nguyên này")  
        tmp = copy.copy(inst) if inst else PricingRule()
        for k, v in attrs.items():
            setattr(tmp, k, v)
        try:
            tmp.clean()  
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)
        return attrs