from django.urls import path

from .views import (
    AdminOverviewView,
    ApprovalDecisionView,
    ApprovalListView,
    UserListView,
    UserStatusView,
)

urlpatterns = [
    path("overview/", AdminOverviewView.as_view()),
    path("users/", UserListView.as_view()),
    path("users/<int:user_id>/status/", UserStatusView.as_view()),
    path("approvals/", ApprovalListView.as_view()),
    path("approvals/<str:kind>/<int:listing_id>/decision/", ApprovalDecisionView.as_view()),
]
