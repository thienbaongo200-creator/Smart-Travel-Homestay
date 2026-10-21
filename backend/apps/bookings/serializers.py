from rest_framework import serializers


class StaySerializer(serializers.Serializer):
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    guests = serializers.IntegerField(min_value=1, default=1)


class SearchSerializer(StaySerializer):
    city = serializers.CharField(required=False, allow_blank=True, default="")


class QuoteSerializer(StaySerializer):
    room_id = serializers.IntegerField()
    vehicle_id = serializers.IntegerField(required=False, allow_null=True)


class DecisionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["confirm", "reject"])
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class BlockSerializer(serializers.Serializer):
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, default="")
