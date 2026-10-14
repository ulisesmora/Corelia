"""Estadísticas del estudio para el panel de Inicio del CRM.

Todo se agrupa por fecha de Madrid. Los datos son pocos (miles de filas), así
que se agregan en Python: más legible que encadenar anotaciones por zona horaria.

"Persona" = usuaria registrada o invitada (si la invitada se vinculó a una
cuenta, cuenta como esa usuaria), para no contar dos veces a la misma clienta.
"""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.utils import timezone

from api.utils.verification import is_placeholder_email

from api.models import (
    Booking, CreditLedgerEntry, GuestProfile, Payment, Plan, Subscription,
)

from django.conf import settings  # noqa: E402
MADRID = ZoneInfo(settings.STUDIO_TIMEZONE)
ATTENDED = ('reserved', 'attended', 'no_show')
MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
MONTHS_ES_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                  'septiembre', 'octubre', 'noviembre', 'diciembre']


def _mdate(dt: datetime) -> date:
    return timezone.localtime(dt, MADRID).date()


def _month_start(d: date, back: int = 0) -> date:
    y, m = d.year, d.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def _aware(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=MADRID)


def _pct(cur: float, prev: float):
    if not prev:
        return None
    return round((cur - prev) / prev * 100)


def _person(b: Booking):
    if b.user_id:
        return ('u', b.user_id)
    if b.guest_id:
        linked = getattr(b.guest, 'linked_user_id', None)
        return ('u', linked) if linked else ('g', b.guest_id)
    return None


def _person_name(b: Booking) -> str:
    if b.user_id and b.user:
        u = b.user
        return f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
    if b.guest_id and b.guest:
        return b.guest.name or b.guest.email or 'Invitada'
    return 'Clienta'


def _booking_title(b: Booking) -> str:
    if b.occurrence_id and b.occurrence:
        return b.occurrence.class_type.title
    if b.event_id and b.event:
        return b.event.title
    return 'Clase'


def _plan_months(plan) -> int:
    count = plan.interval_count or 1
    if (plan.interval or 'month') == 'year':
        return 12 * count
    if (plan.interval or 'month') == 'week':
        return max(1, round(count / 4))
    return count


def dashboard_stats(now: datetime | None = None, months: int = 6) -> dict:
    now = now or timezone.now()
    today = _mdate(now)
    this_month = _month_start(today)
    prev_month = _month_start(today, 1)
    # Mismo tramo del mes anterior (del 1 al mismo día) para comparar justo
    day_n = today.day
    prev_same_day = prev_month + timedelta(days=day_n - 1)
    oldest = _month_start(today, max(months, 4) - 1)

    User = get_user_model()

    # ── Reservas (en memoria) ────────────────────────────────────────────────
    bookings = list(
        Booking.objects.filter(start_datetime__isnull=False)
        .select_related('user', 'guest', 'occurrence__class_type', 'event')
    )
    attended = [b for b in bookings if b.status in ATTENDED and b.start_datetime]

    first_visit: dict = {}
    visits_by_person: dict = defaultdict(list)
    names: dict = {}
    contacts: dict = {}
    for b in sorted(attended, key=lambda x: x.start_datetime):
        p = _person(b)
        if not p:
            continue
        d = _mdate(b.start_datetime)
        first_visit.setdefault(p, d)
        visits_by_person[p].append(d)
        names[p] = _person_name(b)
        if b.user_id and b.user:
            contacts[p] = (b.user.phone, b.user.email)
        elif b.guest_id and b.guest:
            contacts[p] = (b.guest.phone, b.guest.email)

    def in_range(d: date, start: date, end: date) -> bool:
        return start <= d <= end

    def month_key(d: date) -> str:
        return f"{d.year}-{d.month:02d}"

    past_attended = [b for b in attended if _mdate(b.start_datetime) <= today]

    # ── Ventas ───────────────────────────────────────────────────────────────
    # Solo se suman los pagos en la moneda actual del estudio: si cambió de
    # moneda, los pagos antiguos no se convierten (ni se mezclan en el total).
    from api.utils.locale import studio_currency
    currency = studio_currency()
    all_payments = list(
        Payment.objects.filter(status='succeeded', created_at__gte=_aware(oldest) - timedelta(days=31))
        .prefetch_related('bookings')
    )
    payments = [p for p in all_payments if (p.currency or 'EUR').upper() == currency]
    other_currency_payments = len(all_payments) - len(payments)
    plan_payment_ids = {
        str(pid) for pid in CreditLedgerEntry.objects.filter(
            kind='grant', metadata__has_key='payment_id', created_at__gte=_aware(oldest) - timedelta(days=31),
        ).values_list('metadata__payment_id', flat=True)
    }
    renewals = list(
        CreditLedgerEntry.objects.filter(
            kind='grant', metadata__has_key='stripe_invoice_id', created_at__gte=_aware(oldest),
        ).values_list('created_at', 'metadata__plan_id')
    )
    plan_price = {p.id: p.price_eur for p in Plan.all_objects.all()}

    sales_rows = []  # (fecha madrid, importe, tipo)
    for p in payments:
        if p.bookings.all():
            kind = 'classes'
        elif str(p.id) in plan_payment_ids:
            kind = 'packs'
        elif p.stripe_checkout_session_id:
            kind = 'memberships'
        else:
            kind = 'other'
        sales_rows.append((_mdate(p.created_at), Decimal(p.amount_eur or 0), kind))
    for created, plan_id in renewals:
        sales_rows.append((_mdate(created), Decimal(plan_price.get(plan_id) or 0), 'memberships'))

    def sales_between(start: date, end: date):
        total = Decimal(0)
        by_kind: Counter = Counter()
        count = 0
        for d, amount, kind in sales_rows:
            if in_range(d, start, end):
                total += amount
                by_kind[kind] += float(amount)
                count += 1
        return float(total), {k: round(v, 2) for k, v in by_kind.items()}, count

    sales_now, sales_kinds, sales_count = sales_between(this_month, today)
    sales_prev, _, _ = sales_between(prev_month, prev_same_day)
    sales_prev_full, _, _ = sales_between(prev_month, this_month - timedelta(days=1))

    # ── Clientas nuevas ──────────────────────────────────────────────────────
    clients = User.objects.filter(is_staff=False, is_superuser=False)
    joined = [
        (_mdate(u.date_joined), u) for u in clients.filter(date_joined__gte=_aware(oldest) - timedelta(days=31))
    ]
    guests = [
        _mdate(g.created_at) for g in GuestProfile.objects.filter(
            created_at__gte=_aware(oldest) - timedelta(days=31), linked_user__isnull=True,
        )
    ]

    def count_joined(start, end):
        return sum(1 for d, _ in joined if in_range(d, start, end))

    def count_guests(start, end):
        return sum(1 for d in guests if in_range(d, start, end))

    def count_first(start, end):
        return sum(1 for d in first_visit.values() if in_range(d, start, end))

    def count_bookings(start, end):
        return sum(1 for b in past_attended if in_range(_mdate(b.start_datetime), start, end))

    def active_people(start, end):
        return len({_person(b) for b in past_attended if in_range(_mdate(b.start_datetime), start, end)} - {None})

    # ── Serie mensual ────────────────────────────────────────────────────────
    monthly = []
    for back in range(months - 1, -1, -1):
        start = _month_start(today, back)
        end = min(_month_start(today, back - 1) - timedelta(days=1) if back else today, today)
        s, _, _ = sales_between(start, end)
        monthly.append({
            'month': month_key(start),
            'label': MONTHS_ES[start.month - 1],
            'sales_eur': round(s, 2),
            'new_clients': count_joined(start, end) + count_guests(start, end),
            'first_timers': count_first(start, end),
            'bookings': count_bookings(start, end),
            'partial': back == 0,
        })

    # ── Retención: quienes probaron hace 30-90 días, ¿han vuelto? ───────────
    cohort = [p for p, d in first_visit.items() if in_range(d, today - timedelta(days=90), today - timedelta(days=30))]
    came_back = [p for p in cohort if len({d for d in visits_by_person[p] if d <= today}) >= 2]

    # ── Clases: más y menos llenas (últimos 30 días) ────────────────────────
    last30 = today - timedelta(days=30)
    sessions: dict = defaultdict(int)
    title_of: dict = {}
    capacity_of: dict = {}
    for b in past_attended:
        d = _mdate(b.start_datetime)
        if d < last30:
            continue
        key_title = (b.occurrence_id or f"e{b.event_id}")
        sessions[(key_title, b.start_datetime)] += 1
        title_of[key_title] = _booking_title(b)
        if b.occurrence_id and b.occurrence:
            local = timezone.localtime(b.start_datetime, MADRID)
            title_of[key_title] = f"{b.occurrence.class_type.title} · {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][local.weekday()]} {local:%H:%M}"
            capacity_of[key_title] = b.occurrence.capacity_max
    per_class: dict = defaultdict(list)
    for (k, _), n in sessions.items():
        per_class[k].append(n)
    class_rows = []
    for k, counts in per_class.items():
        avg = sum(counts) / len(counts)
        cap = capacity_of.get(k)
        class_rows.append({
            'title': title_of[k],
            'sessions': len(counts),
            'bookings': sum(counts),
            'avg_people': round(avg, 1),
            'capacity': cap,
            'fill_pct': round(avg / cap * 100) if cap else None,
        })
    top_classes = sorted(class_rows, key=lambda r: (-(r['fill_pct'] or 0), -r['bookings']))[:5]
    top_titles = {r['title'] for r in top_classes}
    quiet_classes = sorted(
        [r for r in class_rows if r['sessions'] >= 2 and r['fill_pct'] is not None
         and r['title'] not in top_titles and r['fill_pct'] < 60],
        key=lambda r: (r['fill_pct'], r['bookings']),
    )[:3]

    # ── Días y horas con más gente (últimos 60 días) ────────────────────────
    slots: Counter = Counter()
    for b in past_attended:
        if _mdate(b.start_datetime) >= today - timedelta(days=60):
            local = timezone.localtime(b.start_datetime, MADRID)
            slots[(local.weekday(), f"{local:%H:%M}")] += 1
    weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    busiest = [
        {'weekday': weekdays[w], 'hour': h, 'bookings': n}
        for (w, h), n in slots.most_common(5)
    ]

    # ── Clientas que han dejado de venir ─────────────────────────────────────
    future_people = {_person(b) for b in attended if _mdate(b.start_datetime) > today}
    at_risk = []
    for p, days in visits_by_person.items():
        before = [d for d in days if in_range(d, today - timedelta(days=90), today - timedelta(days=31))]
        recent = [d for d in days if in_range(d, today - timedelta(days=30), today)]
        if len(before) >= 3 and not recent and p not in future_people:
            phone, email = contacts.get(p, (None, None))
            at_risk.append({
                'name': names.get(p, 'Clienta'),
                'phone': phone,
                'email': email if email and not is_placeholder_email(email) else None,
                'last_visit': max(d for d in days if d <= today).isoformat(),
                'visits_before': len(before),
                'is_guest': p[0] == 'g',
            })
    at_risk.sort(key=lambda r: -r['visits_before'])

    # ── Últimas altas ───────────────────────────────────────────────────────
    booked_users = {p[1] for p in first_visit if p[0] == 'u'}
    newest = []
    for d, u in sorted(joined, key=lambda x: x[1].date_joined, reverse=True)[:8]:
        newest.append({
            'name': f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email,
            'joined': d.isoformat(),
            'source': 'Alta en el estudio' if u.created_by_admin else 'Se registró en la web',
            'has_booked': u.id in booked_users,
            'phone': u.phone,
        })

    sources = Counter(
        (u.source or '').strip().lower() for d, u in joined
        if d >= today - timedelta(days=90) and (u.source or '').strip()
    )

    # ── Membresías ───────────────────────────────────────────────────────────
    subs = list(Subscription.objects.filter(status__in=['active', 'past_due']).select_related('plan'))
    mrr = sum(float(s.plan.price_eur) / _plan_months(s.plan) for s in subs if s.status == 'active')
    new_subs = Subscription.objects.filter(created_at__gte=_aware(this_month)).count()

    return {
        'generated_at': now.isoformat(),
        # Los importes (*_eur, nombre histórico) van en esta moneda
        'currency': currency,
        'other_currency_payments': other_currency_payments,
        'period': {
            'label': f"{MONTHS_ES_LONG[this_month.month - 1]} (del 1 al {day_n})",
            'compare_label': f"mismos días de {MONTHS_ES_LONG[prev_month.month - 1]}",
            'month_name': MONTHS_ES_LONG[this_month.month - 1],
            'prev_month_name': MONTHS_ES_LONG[prev_month.month - 1],
        },
        'kpis': {
            'sales_eur': round(sales_now, 2),
            'sales_prev_eur': round(sales_prev, 2),
            'sales_change_pct': _pct(sales_now, sales_prev),
            'sales_prev_full_month_eur': round(sales_prev_full, 2),
            'sales_count': sales_count,
            'sales_by_kind': sales_kinds,
            'new_clients': count_joined(this_month, today),
            'new_clients_prev': count_joined(prev_month, prev_same_day),
            'new_guests': count_guests(this_month, today),
            'new_guests_prev': count_guests(prev_month, prev_same_day),
            'first_timers': count_first(this_month, today),
            'first_timers_prev': count_first(prev_month, prev_same_day),
            'bookings': count_bookings(this_month, today),
            'bookings_prev': count_bookings(prev_month, prev_same_day),
            'active_clients_30d': active_people(today - timedelta(days=29), today),
            'active_clients_prev_30d': active_people(today - timedelta(days=59), today - timedelta(days=30)),
        },
        'memberships': {
            'active': sum(1 for s in subs if s.status == 'active'),
            'past_due': sum(1 for s in subs if s.status == 'past_due'),
            'monthly_recurring_eur': round(mrr, 2),
            'new_this_month': new_subs,
        },
        'retention': {
            'tried': len(cohort),
            'came_back': len(came_back),
            'rate_pct': round(len(came_back) / len(cohort) * 100) if cohort else None,
        },
        'monthly': monthly,
        'top_classes': top_classes,
        'quiet_classes': quiet_classes,
        'busiest_slots': busiest,
        'at_risk': at_risk[:15],
        'at_risk_total': len(at_risk),
        'newest_clients': newest,
        'sources': [{'source': s, 'count': n} for s, n in sources.most_common(6)],
    }
