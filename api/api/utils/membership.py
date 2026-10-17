"""
Detección de clientes regulares y recomendación de membresía.

Un cliente es "regular" si en las últimas 8 semanas ha venido al menos 4
semanas distintas, o si repite la MISMA clase (mismo horario) 3+ semanas.
Para cada regular sin suscripción calculamos, con SU historial real:
  - cuántas clases/créditos consume al mes y sus clases fijas,
  - el plan de membresía que le sale más barato (todo normalizado POR MES:
    Pro se cobra cada 2 meses y Elite cada 3),
  - cuánto paga ahora por clase (según sus últimos bonos) y cuánto ahorraría.

Lo usan: la tarjeta personal del panel, el checkout (bono vs membresía),
el email mensual y la lista de candidatas del CRM.
"""
import logging
import math
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

logger = logging.getLogger(__name__)

WINDOW_WEEKS = 8
MIN_WEEKS_REGULAR = 4
MIN_WEEKS_FIXED_SLOT = 3
WEEKS_PER_MONTH = 4.33
DEFAULT_DROP_IN = Decimal('12')
COOLDOWN_AFTER_CANCEL_DAYS = 60

WEEKDAYS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']


def _plan_months(plan):
    if plan.type != 'sub':
        return 1
    base = {'year': 12, 'week': 0.25}.get((plan.interval or 'month').lower(), 1)
    return base * max(1, plan.interval_count or 1)


def _catalog():
    """Planes activos + precio de clase suelta + mejor precio por crédito de bono."""
    from api.models import Plan
    plans = list(Plan.objects.filter(is_active=True))
    packs = [p for p in plans if p.type == 'pack' and p.credits]
    subs = [p for p in plans if p.type == 'sub' and p.credits]
    one = next((p for p in packs if p.credits == 1), None)
    drop_in = Decimal(one.price_eur) if one else DEFAULT_DROP_IN
    top_up = min((Decimal(p.price_eur) / p.credits for p in packs), default=drop_in)
    return subs, packs, drop_in, top_up


def pick_membership(subs, needed_per_month, top_up_rate):
    """Membresía con menor coste mensual total para cubrir `needed_per_month`
    créditos (las que falten se completan con bono). Si una que cubre todo
    cuesta ≤10 % más, se prefiere por comodidad."""
    if not subs:
        return None

    def per_month_credits(p):
        return Decimal(p.credits) / Decimal(str(_plan_months(p)))

    def per_month_price(p):
        return Decimal(p.price_eur) / Decimal(str(_plan_months(p)))

    def cost(p):
        return per_month_price(p) + max(Decimal(0), needed_per_month - per_month_credits(p)) * top_up_rate

    cheapest = sorted(subs, key=lambda p: (cost(p), p.credits))[0]
    if per_month_credits(cheapest) >= needed_per_month:
        return cheapest
    covering = sorted([p for p in subs if per_month_credits(p) >= needed_per_month], key=per_month_price)
    if covering and per_month_price(covering[0]) <= cost(cheapest) * Decimal('1.1'):
        return covering[0]
    return cheapest


def _current_price_per_credit(user, drop_in):
    """Lo que el cliente paga hoy por crédito, según sus últimos bonos (90 días)."""
    from api.models import CreditLedgerEntry, Plan
    since = timezone.now() - timedelta(days=90)
    grants = CreditLedgerEntry.objects.filter(
        wallet__user=user, kind='grant', created_at__gte=since, metadata__has_key='plan_id',
    ).order_by('-created_at')[:5]
    rates = []
    for g in grants:
        try:
            plan = Plan.all_objects.get(id=g.metadata.get('plan_id'))
            if plan.credits:
                rates.append(Decimal(plan.price_eur) / plan.credits)
        except Exception:
            continue
    if not rates:
        return drop_in
    return sum(rates) / len(rates)


def analyze_user(user, now=None, catalog=None):
    """Devuelve el análisis del cliente, o None si no aplica (staff,
    suscripción activa, sin actividad…). `eligible` indica si es regular."""
    from api.models import Booking, Subscription
    from api.utils.availability import to_madrid_wall

    if user.is_staff or user.is_superuser:
        return None
    now = now or timezone.now()

    subs_qs = Subscription.objects.filter(user=user)
    if subs_qs.filter(status__in=['active', 'past_due']).exists():
        return None
    if subs_qs.filter(status='canceled', updated_at__gte=now - timedelta(days=COOLDOWN_AFTER_CANCEL_DAYS)).exists():
        return None  # canceló hace poco: no insistir

    start = now - timedelta(weeks=WINDOW_WEEKS)
    bookings = list(
        Booking.objects.filter(
            user=user, status__in=['reserved', 'attended'],
            start_datetime__gte=start, start_datetime__lt=now + timedelta(days=7),
            occurrence__isnull=False,
        ).select_related('occurrence__class_type')
    )
    if not bookings:
        return None

    weeks = set()
    credits_total = Decimal(0)
    slot_weeks = defaultdict(set)
    for b in bookings:
        wall = to_madrid_wall(b.start_datetime) or b.start_datetime.replace(tzinfo=None)
        wk = wall.isocalendar()[:2]
        weeks.add(wk)
        sched = b.occurrence
        c = sched.price_credits_override if sched.price_credits_override is not None \
            else sched.class_type.default_price_credits
        credits_total += Decimal(c or 1)
        if sched.is_recurrent and sched.weekday is not None:
            slot_weeks[sched.id].add(wk)

    fixed = []
    sched_by_id = {b.occurrence.id: b.occurrence for b in bookings}
    for sid, wks in sorted(slot_weeks.items(), key=lambda kv: -len(kv[1])):
        if len(wks) >= MIN_WEEKS_FIXED_SLOT:
            s = sched_by_id[sid]
            if s.is_active and not s.deleted_at:
                fixed.append({
                    'schedule_id': s.id,
                    'title': s.class_type.title,
                    'title_en': s.class_type.title_en or s.class_type.title,
                    'weekday': s.weekday,
                    'start_time': s.start_time.strftime('%H:%M'),
                    'label': f"los {WEEKDAYS_ES[s.weekday]} a las {s.start_time.strftime('%H:%M')}",
                    'weeks': len(wks),
                })

    weeks_active = len(weeks)
    eligible = weeks_active >= MIN_WEEKS_REGULAR or bool(fixed)
    months_window = Decimal(WINDOW_WEEKS) / Decimal(str(WEEKS_PER_MONTH))
    classes_per_month = Decimal(len(bookings)) / months_window
    credits_per_month = (credits_total / months_window).quantize(Decimal('0.1'))

    result = {
        'eligible': eligible,
        'weeks_active': weeks_active,
        'window_weeks': WINDOW_WEEKS,
        'classes_per_month': int(round(classes_per_month)),
        'credits_per_month': float(credits_per_month),
        'fixed_slots': fixed[:3],
        'segment': 'fixed' if fixed else ('intense' if classes_per_month >= 8 else 'flexible'),
        'plan': None,
    }
    if not eligible:
        return result

    subs, packs, drop_in, top_up = catalog or _catalog()
    needed = Decimal(math.ceil(credits_per_month))
    plan = pick_membership(subs, needed, top_up)
    if not plan:
        return result

    months = Decimal(str(_plan_months(plan)))
    monthly_price = Decimal(plan.price_eur) / months
    monthly_credits = Decimal(plan.credits) / months
    extra = max(Decimal(0), needed - monthly_credits)
    plan_cost = monthly_price + extra * top_up
    current_rate = _current_price_per_credit(user, drop_in)
    current_cost = needed * current_rate
    saving = (current_cost - plan_cost).quantize(Decimal('1'))

    result.update({
        'plan': {
            'id': plan.id,
            'name': plan.name,
            'price': float(plan.price_eur),
            'months': float(months),
            'monthly_price': float(monthly_price.quantize(Decimal('0.01'))),
            'credits': plan.credits,
            'price_per_class': float((Decimal(plan.price_eur) / plan.credits).quantize(Decimal('0.01'))),
        },
        'current_price_per_class': float(current_rate.quantize(Decimal('0.01'))),
        'drop_in': float(drop_in),
        'saving_per_month': float(max(Decimal(0), saving)),
        'extra_classes': int(math.ceil(extra)),
    })
    return result


def candidates(now=None):
    """Todos los clientes regulares sin membresía, con su análisis (para CRM y email)."""
    from api.models import Booking, User
    now = now or timezone.now()
    user_ids = (
        Booking.objects.filter(
            user__isnull=False, status__in=['reserved', 'attended'],
            start_datetime__gte=now - timedelta(weeks=WINDOW_WEEKS),
        ).values_list('user_id', flat=True).distinct()
    )
    catalog = _catalog()
    out = []
    for user in User.objects.filter(id__in=list(user_ids), is_staff=False):
        try:
            a = analyze_user(user, now=now, catalog=catalog)
        except Exception:
            logger.warning("membership.analyze_failed user_id=%s", user.id, exc_info=True)
            continue
        if a and a['eligible'] and a['plan']:
            out.append((user, a))
    out.sort(key=lambda ua: (-ua[1]['weeks_active'], -ua[1]['classes_per_month']))
    return out
