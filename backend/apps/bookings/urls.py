from django.urls import path

from . import views as v
from . import views_public as vp
urlpatterns = [
    path("search/", v.SearchView.as_view()),
    path("quote/", v.QuoteView.as_view()),
    path("bookings/", v.BookingListCreateView.as_view()),
    path("bookings/<str:code>/", v.BookingDetailView.as_view()),
    path("bookings/<str:code>/pay/", v.PayView.as_view()),
    path("payments/webhook/", v.PaymentWebhookView.as_view()),
    path("host/orders/", v.HostOrdersView.as_view()),
    path("host/items/<int:item_id>/decision/", v.HostDecisionView.as_view()),
    path("host/rooms/<int:room_id>/blocks/", v.HostBlockView.as_view()),
    path("rooms/<int:room_id>/", vp.RoomDetailView.as_view()),
    path("vehicles/suggest/", vp.VehicleSuggestView.as_view()),
    path("bookings/<str:code>/mock-pay/", vp.MockPayView.as_view()),
]
