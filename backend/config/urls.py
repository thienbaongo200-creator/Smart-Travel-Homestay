from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", TokenObtainPairView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/admin/", include("apps.admin_api.urls")),
    path("api/", include("apps.pricing.urls")),
    path("api/", include("apps.bookings.urls")),
    path("api/", include("apps.host.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
