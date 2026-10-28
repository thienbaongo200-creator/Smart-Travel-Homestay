from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ProfileSerializer, RegisterSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


def _me(u):
    return {"id": u.id, "username": u.username, "email": u.email, "role": u.role,
            "phone": u.phone, "license_class": u.license_class}


class MeView(APIView):
    def get(self, request):
        return Response(_me(request.user))

    def patch(self, request): 
        s = ProfileSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(_me(request.user))