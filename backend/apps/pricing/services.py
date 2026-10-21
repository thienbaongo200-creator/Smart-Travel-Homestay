"""
Dynamic Pricing Engine.

Giá một đêm/ngày:
    price(d) = round_1000( base × day_factor(d) × occupancy_factor(d) × lead_factor )
    day_factor(d) = max(weekend(d), holiday(d)) × season(d)          # BR-05, BR-06
Tổng:
    total = Σ room(d) + Σ vehicle(d) − combo_discount
    combo_discount = vehicle_subtotal × (1 − combo.multiplier)  nếu số đêm ≥ combo.min_value
"""
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


def day_factor(d, rules):
    peak = ONE
    for r in rules:
        if r.kind == K.WEEKEND and d.weekday() in (4, 5, 6):  # T6, T7, CN
            peak = max(peak, r.multiplier)
        elif r.kind == K.HOLIDAY and r.covers(d):
            peak = max(peak, r.multiplier)
    season = ONE
    for r in rules:
        if r.kind == K.SEASON and r.covers(d):
            season *= r.multiplier
    return peak * season


def occupancy_factor(rate_pct: Decimal, rules):
    factor, best = ONE, -1
    for r in rules:
        if r.kind == K.OCCUPANCY and r.min_value is not None and rate_pct >= r.min_value and r.min_value > best:
            factor, best = r.multiplier, r.min_value  # ngưỡng cao nhất thỏa mãn thắng
    return factor


def lead_factor(lead_days: int, rules):
    for r in rules:
        if r.kind != K.LEAD_TIME:
            continue
        if (r.min_value is None or lead_days >= r.min_value) and (r.max_value is None or lead_days <= r.max_value):
            return r.multiplier
    return ONE


def _price_lines(base, check_in, check_out, rules, occupancy_fn: Callable, today):
    lead = max((check_in - today).days, 0)
    lf = lead_factor(lead, rules)
    lines, subtotal, d = [], Decimal(0), check_in
    while d < check_out:
        df = day_factor(d, rules)
        of = occupancy_factor(occupancy_fn(d), rules)
        price = round_vnd(base * df * of * lf)
        lines.append({"date": d.isoformat(), "base": str(base), "day_factor": str(df),
                      "occupancy_factor": str(of), "lead_factor": str(lf), "price": str(price)})
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
