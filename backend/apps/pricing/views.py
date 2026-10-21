from django.db.models import Q
from rest_framework import viewsets

from .models import PricingRule
from .serializers import PricingRuleSerializer


class PricingRuleViewSet(viewsets.ModelViewSet):
    """Host chỉ thấy/sửa rule thuộc homestay/xe của mình."""
    serializer_class = PricingRuleSerializer

    def get_queryset(self):
        u = self.request.user
        return PricingRule.objects.filter(Q(homestay__owner=u) | Q(vehicle__owner=u))
