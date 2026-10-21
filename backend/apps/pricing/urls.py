from rest_framework.routers import DefaultRouter

from .views import PricingRuleViewSet

router = DefaultRouter()
router.register("host/pricing-rules", PricingRuleViewSet, basename="pricing-rule")
urlpatterns = router.urls
