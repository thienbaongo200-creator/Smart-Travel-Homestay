"""
Dynamic Pricing Engine: chuỗi quy tắc theo mẫu Strategy.

  giá(đêm) = clamp( giá_gốc → rule1 → rule2 → ... , sàn 50%, trần 300% ), làm tròn 1.000đ
  Rule áp theo priority giảm dần. Ngày lễ đứng trước cuối tuần và chặn rule cuối tuần (BR-06).
  Combo: giảm tiền xe khi thuê kèm từ N đêm (sau khi cộng các đêm).
  Giá từng đêm được chép vào đơn (BookingItemNight) lúc đặt.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .models import PricingRule

K = PricingRule.Kind
ONE = Decimal("1")


def round_vnd(v: Decimal) -> Decimal:
    return (v / 1000).quantize(ONE, rounding=ROUND_HALF_UP) * 1000


def load_rules(target, homestay=None, vehicle=None):
    scope = Q(homestay__isnull=True, vehicle__isnull=True)
    if homestay is not None:
        scope |= Q(homestay=homestay)
    if vehicle is not None:
        scope |= Q(vehicle=vehicle)
    return list(PricingRule.objects.filter(scope, target=target, is_active=True))


@dataclass
class Ctx:
    day: object
    check_in: object
    booking_date: object
    nights: int
    occupancy: Decimal
    flags: dict = field(default_factory=dict)

    @property
    def lead_days(self):
        return max((self.check_in - self.booking_date).days, 0)


# ---------------- Strategy ----------------
class PricingStrategy(ABC):
    bucket = "day"  # nhóm hệ số hiển thị: day / occ / lead

    def __init__(self, rule):
        self.rule = rule

    @abstractmethod
    def applies_to(self, ctx: Ctx) -> bool: ...

    def apply(self, price: Decimal, ctx: Ctx) -> Decimal:
        return price * self.rule.multiplier


class HolidayRule(PricingStrategy):
    def applies_to(self, ctx):
        return self.rule.covers(ctx.day)

    def apply(self, price, ctx):
        ctx.flags["holiday"] = True
        return super().apply(price, ctx)


class SeasonRule(PricingStrategy):
    def applies_to(self, ctx):
        return self.rule.covers(ctx.day)


class WeekendRule(PricingStrategy):
    def applies_to(self, ctx):  # đêm T6, T7, CN; ngày lễ thì không nhân thêm cuối tuần
        return ctx.day.weekday() in (4, 5, 6) and not ctx.flags.get("holiday")


class OccupancyRule(PricingStrategy):
    bucket = "occ"

    def applies_to(self, ctx):
        return ctx.occupancy >= (self.rule.min_value or 0)


class LeadTimeRule(PricingStrategy):
    bucket = "lead"

    def applies_to(self, ctx):
        lo, hi = self.rule.min_value, self.rule.max_value
        return (lo is None or ctx.lead_days >= lo) and (hi is None or ctx.lead_days <= hi)


STRATEGIES = {K.HOLIDAY: HolidayRule, K.SEASON: SeasonRule, K.WEEKEND: WeekendRule,
              K.OCCUPANCY: OccupancyRule, K.LEAD_TIME: LeadTimeRule}


def build_chain(rules, ctx):
    strategies = [STRATEGIES[r.kind](r) for r in rules if r.kind in STRATEGIES]

    def best(kind, key):  # nhóm loại trừ: chỉ giữ một rule mạnh nhất
        group = [s for s in strategies if s.rule.kind == kind and s.applies_to(ctx)]
        return max(group, key=key) if group else None

    occ = best(K.OCCUPANCY, lambda s: s.rule.min_value or 0)  # ngưỡng cao nhất thỏa mãn
    lead = best(K.LEAD_TIME, lambda s: s.rule.effective_priority)
    chain = [s for s in strategies if s.rule.kind not in (K.OCCUPANCY, K.LEAD_TIME)]
    chain += [s for s in (occ, lead) if s]
    return sorted(chain, key=lambda s: (-s.rule.effective_priority, s.rule.id or 0))


def price_night(base: Decimal, rules, ctx: Ctx):
    price, applied = Decimal(base), []
    factors = {"day": ONE, "occ": ONE, "lead": ONE}
    for s in build_chain(rules, ctx):
        if not s.applies_to(ctx):
            continue
        price = s.apply(price, ctx)
        factors[s.bucket] *= s.rule.multiplier
        applied.append(f"{s.rule.kind}#{s.rule.id}")

    floor = Decimal(base) * settings.PRICE_FLOOR_PERCENT / 100
    cap = Decimal(base) * settings.PRICE_CAP_PERCENT / 100
    clamped = min(max(price, floor), cap)
    return round_vnd(clamped), applied, factors, clamped != price


def _price_lines(base, check_in, check_out, rules, occupancy_fn: Callable, today):
    lines, subtotal, d = [], Decimal(0), check_in
    nights = (check_out - check_in).days
    while d < check_out:
        ctx = Ctx(day=d, check_in=check_in, booking_date=today, nights=nights, occupancy=occupancy_fn(d))
        price, applied, f, clamped = price_night(base, rules, ctx)
        lines.append({"date": d.isoformat(), "base": str(base), "day_factor": str(f["day"]),
                      "occupancy_factor": str(f["occ"]), "lead_factor": str(f["lead"]),
                      "applied_rules": ",".join(applied), "clamped": clamped, "price": str(price)})
        subtotal += price
        d += timedelta(days=1)
    return lines, subtotal


def build_quote(room, vehicle, check_in, check_out, room_occ_fn, vehicle_occ_fn, today=None):
    today = today or timezone.localdate()
    nights = (check_out - check_in).days
    r_rules = load_rules(PricingRule.Target.ROOM, homestay=room.homestay)
    room_lines, room_sub = _price_lines(room.base_price, check_in, check_out, r_rules, room_occ_fn, today)

    q = {"nights": nights, "room": {"lines": room_lines, "subtotal": str(room_sub)}, "vehicle": None,
         "combo_discount": "0"}
    total = room_sub

    if vehicle is not None:
        v_rules = load_rules(PricingRule.Target.VEHICLE, vehicle=vehicle)
        v_lines, v_sub = _price_lines(vehicle.base_price, check_in, check_out, v_rules, vehicle_occ_fn, today)
        combos = [r for r in v_rules if r.kind == K.COMBO and r.min_value is not None and nights >= r.min_value]
        discount = Decimal(0)
        if combos:
            best = max(combos, key=lambda r: r.min_value)
            discount = round_vnd(v_sub * (ONE - best.multiplier))
        q["vehicle"] = {"lines": v_lines, "subtotal": str(v_sub)}
        q["combo_discount"] = str(discount)
        total += v_sub - discount

    q["total"] = str(total)
    q["deposit"] = str(round_vnd(total * settings.DEPOSIT_RATE))
    return q