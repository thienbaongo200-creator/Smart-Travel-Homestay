from django.core.exceptions import ValidationError
from django.db import models


class PricingRule(models.Model):
    class Kind(models.TextChoices):
        WEEKEND = "WEEKEND", "Cuối tuần (T6-CN)"
        HOLIDAY = "HOLIDAY", "Ngày lễ/Tết"
        SEASON = "SEASON", "Mùa cao/thấp điểm"
        OCCUPANCY = "OCCUPANCY", "Công suất lấp đầy"
        LEAD_TIME = "LEAD_TIME", "Thời gian đặt trước"
        COMBO = "COMBO", "Combo phòng + xe"

    class Target(models.TextChoices):
        ROOM = "ROOM", "Phòng"
        VEHICLE = "VEHICLE", "Xe"

    # Phạm vi: homestay cụ thể / xe cụ thể / cả hai null = rule mặc định toàn hệ thống
    homestay = models.ForeignKey("listings.Homestay", null=True, blank=True, on_delete=models.CASCADE, related_name="pricing_rules")
    vehicle = models.ForeignKey("listings.Vehicle", null=True, blank=True, on_delete=models.CASCADE, related_name="pricing_rules")
    target = models.CharField(max_length=7, choices=Target.choices, default=Target.ROOM)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    multiplier = models.DecimalField(max_digits=5, decimal_places=3)
    # HOLIDAY / SEASON: khoảng ngày áp dụng (gồm cả hai đầu)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    # OCCUPANCY: min_value = ngưỡng % ; LEAD_TIME: [min,max] số ngày; COMBO: min_value = số đêm tối thiểu
    min_value = models.IntegerField(null=True, blank=True)
    max_value = models.IntegerField(null=True, blank=True)
    label = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)  # bật/tắt từng quy tắc
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["homestay", "is_active"]), models.Index(fields=["vehicle", "is_active"])]
        constraints = [
            models.CheckConstraint(
                condition=~(models.Q(homestay__isnull=False) & models.Q(vehicle__isnull=False)),
                name="pricing_rule_single_scope",
            ),
            models.CheckConstraint(condition=models.Q(multiplier__gt=0), name="pricing_rule_multiplier_positive"),
        ]

    def clean(self):
        # BR-05: hệ số cuối tuần/lễ không thấp hơn 1.0
        if self.kind in (self.Kind.WEEKEND, self.Kind.HOLIDAY) and self.multiplier < 1:
            raise ValidationError("Hệ số cuối tuần/ngày lễ không được thấp hơn 1.0")
        if self.kind in (self.Kind.HOLIDAY, self.Kind.SEASON) and not (self.start_date and self.end_date):
            raise ValidationError("Cần start_date và end_date")

    def covers(self, d):
        return bool(self.start_date and self.end_date and self.start_date <= d <= self.end_date)

    def __str__(self):
        return f"{self.kind} x{self.multiplier} ({self.target})"
