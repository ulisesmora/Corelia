"""Cifras y avisos de las pantallas «Hoy», «Ventas», «Mi web» y «Ajustes» del panel.

Todo en hora de pared del estudio (STUDIO_TIMEZONE). Los datos de un estudio
son pocos (miles de filas), así que se agregan en Python con pocas consultas.

  today_payload()        «Hoy»: cifras, avisos con acción, línea del día…
  day_timeline(d)        «Hoy en el estudio» de un día (navegación por días)
  attention_items()      «Necesita tu atención» (calculado con datos reales)
  run_action()           el botón de cada aviso (dar plaza, reenviar enlace…)
  sales_summary()        «Ventas» de un periodo frente al anterior
  sales_csv()            «Cierre para la gestoría» (CSV del periodo)
  web_summary()          «Mi web»: secciones, dominio y app
  set_section_visible()  mostrar/ocultar opiniones, preguntas o galería
  checklist()            extras opcionales y «Revisa esto» de Ajustes
"""
import csv
import io
import logging
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from api.models import (
    Booking, CreditLedgerEntry, FAQItem, Instructor, Payment, Plan, RecurringSchedule, SiteConfig, SiteImage,
    Subscription, Testimonial, WaitlistEntry, ClassType,
)
from api.utils.availability import MADRID_TZ, blackouts_overlapping, to_madrid_wall
from api.utils.waitlist import WaitlistError, as_instant, wall_date

logger = logging.getLogger(__name__)

ACTIVE = ('reserved', 'attended', 'no_show')
WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre']
PERIODS = ('week', 'month', 'quarter', 'year')


class DashboardError(WaitlistError):
    """Mismo formato que los errores del calendario: {'error', 'code'}."""


# ── Fechas ────────────────────────────────────────────────────────────────

def wall_now():
    return timezone.now().astimezone(MADRID_TZ).replace(tzinfo=None)


def local_today() -> date:
    return wall_now().date()


def instant(d: date):
    """Inicio del día `d` del estudio como instante real."""
    return as_instant(datetime.combine(d, time.min))


def month_start(d: date, back: int = 0) -> date:
    y, m = d.year, d.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def add_months(d: date, n: int) -> date:
    y, m = d.year, d.month + n
    while m > 12:
        m -= 12
        y += 1
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def period_bounds(period: str, today: date, offset: int = 0):
    """(inicio, fin, inicio anterior, fin anterior, fin del periodo) del periodo
    `period` que contiene hoy (o `offset` periodos antes). El anterior se
    compara «a mismos días»: del inicio al mismo tramo que llevamos."""
    if period == 'week':
        start = today - timedelta(days=today.weekday()) - timedelta(weeks=offset)
        full_end = start + timedelta(days=6)
        prev_start = start - timedelta(weeks=1)
        prev_full_end = start - timedelta(days=1)
    elif period == 'quarter':
        q0 = month_start(today).replace(month=((today.month - 1) // 3) * 3 + 1)
        start = add_months(q0, -3 * offset)
        full_end = add_months(start, 3) - timedelta(days=1)
        prev_start = add_months(start, -3)
        prev_full_end = start - timedelta(days=1)
    elif period == 'year':
        start = date(today.year - offset, 1, 1)
        full_end = date(start.year, 12, 31)
        prev_start = date(start.year - 1, 1, 1)
        prev_full_end = date(start.year - 1, 12, 31)
    else:  # month
        start = month_start(today, offset)
        full_end = add_months(start, 1) - timedelta(days=1)
        prev_start = add_months(start, -1)
        prev_full_end = start - timedelta(days=1)
    end = min(today, full_end)
    prev_end = min(prev_start + (end - start), prev_full_end)
    return start, end, prev_start, prev_end, full_end


def pct(cur, prev):
    if not prev:
        return None
    return round((float(cur) - float(prev)) / float(prev) * 100)


def date_label(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


# ── Personas ──────────────────────────────────────────────────────────────

def user_name(u) -> str:
    if u is None:
        return 'Clienta'
    full = f"{u.first_name or ''} {u.last_name or ''}".strip()
    return full or (u.email or '').split('@')[0] or 'Clienta'


def person_of(obj):
    """(clave, nombre, email) de quien hizo una reserva, un pago…"""
    if getattr(obj, 'user_id', None) and obj.user:
        return ('u', obj.user_id), user_name(obj.user), obj.user.email or ''
    if getattr(obj, 'guest_id', None) and obj.guest:
        g = obj.guest
        if g.linked_user_id:
            return ('u', g.linked_user_id), g.name or g.email or 'Invitada', g.email or ''
        return ('g', g.id), g.name or (g.email or '').split('@')[0] or 'Invitada', g.email or ''
    return None, 'Clienta', ''


def first_name(name: str) -> str:
    return (name or '').split(' ')[0] or name


def initials(name: str) -> str:
    parts = [p for p in (name or '').replace('(', ' ').split() if p[:1].isalpha()]
    if not parts:
        return '·'
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def booking_title(b) -> str:
    if b.occurrence_id and b.occurrence:
        return b.occurrence.class_type.title
    if b.event_id and b.event:
        return b.event.title
    return 'Clase'


# ── Ventas: filas de cobros ───────────────────────────────────────────────

METHOD_LABELS = {'stripe': 'Tarjeta', 'card': 'Tarjeta', 'cash': 'Efectivo', 'transfer': 'Transferencia',
                 'bizum': 'Bizum'}
KIND_LABELS = {'classes': 'Clase suelta', 'packs': 'Bono', 'memberships': 'Cuota', 'other': 'Otro'}


def _receipt_url(raw) -> str:
    if not isinstance(raw, dict):
        return ''
    url = raw.get('receipt_url') or ''
    if not url:
        charges = raw.get('charges') or {}
        data = charges.get('data') if isinstance(charges, dict) else None
        if data and isinstance(data, list) and isinstance(data[0], dict):
            url = data[0].get('receipt_url') or ''
    if not url:
        lc = raw.get('latest_charge')
        if isinstance(lc, dict):
            url = lc.get('receipt_url') or ''
    return url if isinstance(url, str) and url.startswith('https://') else ''


def sales_rows(start: date, end: date, statuses=('succeeded',)):
    """Cobros entre `start` y `end` (fechas del estudio, ambos incluidos) en la
    moneda actual del estudio. Incluye las renovaciones de cuotas (Stripe no
    crea un Payment: solo el asiento de créditos con stripe_invoice_id)."""
    from api.utils.locale import studio_currency
    currency = studio_currency()
    lo, hi = instant(start), instant(end + timedelta(days=1))
    payments = list(
        Payment.objects.filter(status__in=statuses, created_at__gte=lo, created_at__lt=hi)
        .select_related('user', 'guest__linked_user').prefetch_related('bookings__occurrence__class_type',
                                                                       'bookings__event')
    )
    payments = [p for p in payments if (p.currency or 'EUR').upper() == currency]
    pids = [str(p.id) for p in payments]
    grants = {}
    if pids:
        for pid, plan_id in CreditLedgerEntry.objects.filter(
            kind='grant', metadata__payment_id__in=pids + [int(x) for x in pids],
        ).values_list('metadata__payment_id', 'metadata__plan_id'):
            grants[str(pid)] = plan_id
    plans = {p.id: p for p in Plan.all_objects.all()}

    rows = []
    for p in payments:
        key, name, email = person_of(p)
        books = list(p.bookings.all())
        plan = plans.get(grants.get(str(p.id))) if str(p.id) in grants else None
        if books:
            kind = 'classes'
            b = books[0]
            when = to_madrid_wall(b.start_datetime)
            concept = f"{booking_title(b)}" + (f" · {when.day}/{when.month} {when:%H:%M}" if when else '')
            if len(books) > 1:
                concept += f" (+{len(books) - 1})"
        elif plan is not None:
            kind = 'memberships' if plan.type == 'sub' else 'packs'
            concept = plan.name
        elif p.stripe_checkout_session_id:
            kind = 'memberships'
            concept = 'Cuota'
        else:
            kind = 'other'
            concept = 'Pago'
        d = to_madrid_wall(p.created_at)
        rows.append({
            'id': f"p{p.id}", 'payment_id': p.id, 'date': d.date().isoformat(), 'time': d.strftime('%H:%M'),
            'name': name, 'email': email, 'person': f"{key[0]}{key[1]}" if key else '',
            'concept': concept, 'kind': kind, 'kind_label': KIND_LABELS[kind],
            'plan_id': plan.id if plan else None,
            'method': METHOD_LABELS.get((p.method or '').lower(), (p.method or 'Otro').capitalize()),
            'amount': float(p.amount_eur or 0), 'status': p.status,
            'receipt_no': f"R-{d.year}-{p.id:05d}", 'receipt_url': _receipt_url(p.raw_response),
        })

    # Renovaciones de cuotas (cobro automático de Stripe)
    renewals = CreditLedgerEntry.objects.filter(
        kind='grant', metadata__has_key='stripe_invoice_id', created_at__gte=lo, created_at__lt=hi,
    ).select_related('wallet__user')
    if 'succeeded' in statuses:
        for e in renewals:
            plan = plans.get((e.metadata or {}).get('plan_id'))
            if plan is None:
                continue
            d = to_madrid_wall(e.created_at)
            u = e.wallet.user
            rows.append({
                'id': f"r{e.id}", 'payment_id': None, 'date': d.date().isoformat(), 'time': d.strftime('%H:%M'),
                'name': user_name(u), 'email': u.email or '', 'person': f"u{u.id}",
                'concept': f"{plan.name} · renovación", 'kind': 'memberships', 'kind_label': KIND_LABELS['memberships'],
                'plan_id': plan.id, 'method': 'Tarjeta', 'amount': float(plan.price_eur or 0), 'status': 'succeeded',
                'receipt_no': f"C-{d.year}-{e.id:05d}", 'receipt_url': '',
            })
    rows.sort(key=lambda r: (r['date'], r['time']), reverse=True)
    return rows, currency


def _total(rows):
    return round(sum(r['amount'] for r in rows if r['status'] == 'succeeded'), 2)


# ── Quién me debe ─────────────────────────────────────────────────────────

def owed_items(limit=50):
    """Pagos fallidos (sin otro pago bueno después) y cuotas con el cobro pendiente."""
    since = timezone.now() - timedelta(days=45)
    out = []
    failed = list(Payment.objects.filter(status='failed', created_at__gte=since)
                  .select_related('user', 'guest__linked_user').order_by('-created_at')[:100])
    if failed:
        users = {p.user_id for p in failed if p.user_id}
        guests = {p.guest_id for p in failed if p.guest_id}
        later_ok = list(Payment.objects.filter(status='succeeded', created_at__gte=since)
                        .filter(Q(user_id__in=users) | Q(guest_id__in=guests))
                        .values_list('user_id', 'guest_id', 'created_at'))
        grants = {str(k): v for k, v in CreditLedgerEntry.objects.filter(
            kind='grant', metadata__has_key='plan_id').values_list('metadata__payment_id', 'metadata__plan_id')
            if k is not None}
        plans = {p.id: p for p in Plan.all_objects.all()}
        seen = set()
        for p in failed:
            if any((u and u == p.user_id or g and g == p.guest_id) and at > p.created_at for u, g, at in later_ok):
                continue
            key, name, email = person_of(p)
            if key in seen:
                continue
            seen.add(key)
            plan = plans.get((p.raw_response or {}).get('metadata', {}).get('plan_id') if isinstance(
                p.raw_response, dict) else None) or plans.get(grants.get(str(p.id)))
            concept = plan.name if plan else 'Pago'
            out.append({
                'id': f"pay-{p.id}", 'kind': 'payment', 'payment_id': p.id, 'subscription_id': None,
                'name': name, 'email': email, 'concept': concept, 'amount': float(p.amount_eur or 0),
                'status': 'failed', 'status_label': 'Fallido',
                'date': to_madrid_wall(p.created_at).date().isoformat(),
            })
    for s in Subscription.objects.filter(status='past_due').select_related('user', 'plan').order_by('-updated_at')[:50]:
        out.append({
            'id': f"sub-{s.id}", 'kind': 'subscription', 'payment_id': None, 'subscription_id': s.id,
            'name': user_name(s.user), 'email': s.user.email or '', 'concept': s.plan.name,
            'amount': float(s.plan.price_eur or 0), 'status': 'past_due', 'status_label': 'Sin cobrar',
            'date': to_madrid_wall(s.updated_at).date().isoformat(),
        })
    return out[:limit]


# ── Bonos que caducan ─────────────────────────────────────────────────────

def expiring_packs(days=7, limit=10):
    """Bonos con clases sin gastar que caducan en los próximos `days` días.
    Lo que se pierde = lo que no cubren los bonos que caducan después
    (misma regla que tasks.process_wallet_expiration)."""
    now = timezone.now()
    soon = list(CreditLedgerEntry.objects.filter(
        kind='grant', expires_at__gt=now, expires_at__lte=now + timedelta(days=days), amount__gt=0,
    ).select_related('wallet__user').order_by('expires_at')[:200])
    if not soon:
        return []
    wallet_ids = {e.wallet_id for e in soon}
    balances = dict(CreditLedgerEntry.objects.filter(wallet_id__in=wallet_ids)
                    .values('wallet_id').annotate(t=Sum('amount')).values_list('wallet_id', 't'))
    later = defaultdict(list)
    for wid, exp, amount in CreditLedgerEntry.objects.filter(
        wallet_id__in=wallet_ids, kind='grant', amount__gt=0,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).values_list('wallet_id', 'expires_at', 'amount'):
        later[wid].append((exp, amount))
    plans = {p.id: p.name for p in Plan.all_objects.all()}
    out, seen = [], set()
    for e in soon:
        if e.wallet_id in seen:
            continue
        protected = sum((a for exp, a in later[e.wallet_id] if exp is None or exp > e.expires_at), Decimal(0))
        at_risk = min(Decimal(e.amount), Decimal(balances.get(e.wallet_id) or 0) - protected)
        if at_risk <= 0:
            continue
        seen.add(e.wallet_id)
        u = e.wallet.user
        plan_name = plans.get((e.metadata or {}).get('plan_id')) or 'Bono'
        out.append({'entry': e, 'user': u, 'plan': plan_name, 'credits': at_risk,
                    'expires': to_madrid_wall(e.expires_at)})
        if len(out) >= limit:
            break
    return out


def _fmt_credits(v) -> str:
    v = Decimal(v)
    n = int(v) if v == v.to_integral_value() else float(v)
    return f"{n} {'clase' if n == 1 else 'clases'}"


def _when_label(d: date, today: date) -> str:
    if d == today:
        return 'hoy'
    if d == today + timedelta(days=1):
        return 'mañana'
    if 0 < (d - today).days < 7:
        return f"el {WEEKDAYS_LONG[d.weekday()]}"
    return f"el {d.day} de {MONTHS_LONG[d.month - 1]}"


def _money(v, currency) -> str:
    v = float(v)
    s = f"{v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    if s.endswith(',00'):
        s = s[:-3]
    sym = {'EUR': '€', 'USD': '$', 'GBP': '£', 'MXN': '$'}.get(currency, currency)
    return f"{s} {sym}" if currency == 'EUR' else f"{sym}{s}"


# ── Necesita tu atención ──────────────────────────────────────────────────

def _class_fans(class_type_id, exclude_user_ids=(), days=90, limit=80):
    """Clientas registradas que han venido a ese tipo de clase últimamente."""
    since = timezone.now() - timedelta(days=days)
    ids = set(Booking.objects.filter(
        occurrence__class_type_id=class_type_id, status__in=ACTIVE, start_datetime__gte=since, user__isnull=False,
    ).values_list('user_id', flat=True))
    ids -= set(exclude_user_ids)
    return list(get_user_model().objects.filter(id__in=list(ids)[:limit], is_active=True))


def attention_items(today=None, sessions=None):
    from api.utils.calendar_ops import build_calendar
    from api.utils.locale import studio_currency
    from api.utils.waitlist import entries_on

    today = today or local_today()
    now = wall_now()
    currency = studio_currency()
    items = []

    # 1) Plaza libre con lista de espera (hoy y los 2 días siguientes)
    if sessions is None:
        sessions = build_calendar(today, today + timedelta(days=2), include_events=False)['occurrences']
    near_empty = []
    for o in sessions:
        if o['kind'] != 'class' or o['canceled'] or o['blackout'] or o['started']:
            continue
        d = date.fromisoformat(o['date'])
        start = datetime.fromisoformat(o['start'])
        if o['waitlist'] and o['booked'] < o['capacity'] and not o['offered']:
            first = next((e for e in entries_on(o['schedule_id'], d) if e.status == 'waiting'), None)
            if first is not None:
                when = '' if d == today else f" · {_when_label(d, today)}"
                items.append({
                    'id': f"wait-{first.id}", 'kind': 'waitlist', 'tone': 'info', 'icon': 'hourglass',
                    'title': f"Plaza libre en {o['title']} {start:%H:%M}{when}",
                    'subtitle': f"{user_name(first.user)} es la primera en espera",
                    'action': {'type': 'api', 'label': 'Dar plaza',
                               'done': f"Plaza dada a {first_name(user_name(first.user))}. Le llega un aviso.",
                               'payload': {'kind': 'waitlist_promote', 'entry_id': first.id}},
                })
        # 4) Clase casi vacía (empieza en menos de 36 h)
        hours = (start - now).total_seconds() / 3600
        if 0 < hours <= 36 and o['capacity'] >= 4 and o['booked'] / o['capacity'] <= 0.25:
            near_empty.append((o, d, start))

    # 2) Pagos fallidos y cuotas sin cobrar
    for row in owed_items(limit=3):
        title = f"Pago fallido · {row['name']}" if row['kind'] == 'payment' else f"Cuota sin cobrar · {row['name']}"
        payload = {'kind': 'resend_payment_link'}
        payload['payment_id' if row['kind'] == 'payment' else 'subscription_id'] = \
            row['payment_id'] or row['subscription_id']
        items.append({
            'id': row['id'], 'kind': 'payment', 'tone': 'bad', 'icon': 'card',
            'title': title, 'subtitle': f"{row['concept']} · {_money(row['amount'], currency)}",
            'action': {'type': 'api', 'label': 'Reenviar enlace',
                       'done': f"Enlace de pago enviado a {first_name(row['name'])}", 'payload': payload},
        })

    # 3) Bonos que caducan esta semana con clases sin gastar
    for x in expiring_packs(days=7, limit=2):
        exp = x['expires']
        new_exp = exp + timedelta(days=7)
        name = user_name(x['user'])
        items.append({
            'id': f"exp-{x['entry'].id}", 'kind': 'expiring', 'tone': 'warn', 'icon': 'clock',
            'title': f"El bono de {name} caduca {_when_label(exp.date(), today)}",
            'subtitle': f"{x['plan']} · le quedan {_fmt_credits(x['credits'])}",
            'action': {'type': 'api', 'label': 'Ampliar 1 semana',
                       'done': f"Bono de {first_name(name)} ampliado al {new_exp.day} {MONTHS[new_exp.month - 1]}",
                       'payload': {'kind': 'extend_pack', 'entry_id': x['entry'].id, 'days': 7}},
        })

    # 4) Clases casi vacías (no antes de la primera reserva: al empezar, todas lo están)
    any_booking = Booking.objects.exists()
    for o, d, start in (sorted(near_empty, key=lambda t: t[2])[:2] if any_booking else []):
        fans = len(_class_fans(o['class_type']['id'], exclude_user_ids=()))
        when = '' if d == today else f" ({_when_label(d, today)})"
        action = ({'type': 'api', 'label': 'Avisar', 'done': f"Aviso enviado a las clientas de {o['title']}",
                   'payload': {'kind': 'promote_class', 'schedule_id': o['schedule_id'], 'date': o['date']}}
                  if fans else
                  {'type': 'navigate', 'label': 'Escribir aviso', 'to': '/mails?accion=nuevo'})
        items.append({
            'id': f"empty-{o['id']}", 'kind': 'near_empty', 'tone': 'p', 'icon': 'users',
            'title': f"{o['title']} {start:%H:%M}{when} va casi vacía",
            'subtitle': f"{o['booked']} de {o['capacity']} plazas",
            'action': action,
        })

    # 5) Para empezar: compartir la web si aún no hay reservas; el NIF
    cfg = SiteConfig.load()
    if not any_booking:
        from api.utils.site import web_url
        items.append({
            'id': 'share', 'kind': 'share', 'tone': 'p', 'icon': 'link',
            'title': 'Comparte tu web para recibir reservas', 'subtitle': web_url().split('://', 1)[-1],
            'action': {'type': 'copy', 'label': 'Copiar enlace', 'done': 'Enlace copiado', 'value': web_url()},
        })
    if not (cfg.tax_id or '').strip():
        items.append({
            'id': 'tax-id', 'kind': 'tax_id', 'tone': 'warn', 'icon': 'receipt',
            'title': 'Falta tu NIF para los recibos', 'subtitle': 'Te llevará un minuto',
            'action': {'type': 'navigate', 'label': 'Añadir NIF', 'to': '/ajustes'},
        })

    # 6) Regulares sin membresía a las que aún no se ha escrito
    try:
        from api.models import MembershipNudge
        from api.utils.membership import candidates
        pairs = candidates()
        contacted = set(MembershipNudge.objects.filter(
            user_id__in=[u.id for u, _ in pairs], channel='crm').values_list('user_id', flat=True))
        n = sum(1 for u, _ in pairs if u.id not in contacted)
        if n:
            items.append({
                'id': 'candidates', 'kind': 'candidates', 'tone': 'p', 'icon': 'star',
                'title': f"{n} {'clienta viene' if n == 1 else 'clientas vienen'} cada semana sin membresía",
                'subtitle': 'Escríbeles: es lo que más convierte',
                'action': {'type': 'navigate', 'label': 'Ver', 'to': '/membership-candidates'},
            })
    except Exception:  # pragma: no cover - el aviso es opcional
        logger.warning("dashboard.candidates_failed", exc_info=True)
    return items


def _send_notice(person, headline, intro, cta_text, cta_url, subject, push_title=None, push_url='/dashboard'):
    """Email (y push si es usuaria). Devuelve cuántos canales salieron."""
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user
    sent = 0
    email = getattr(person, 'email', '') or ''
    if email and send_templated_email(
        to_email=email, template_id='generic-notice', subject=subject,
        dynamic_data={'name': getattr(person, 'first_name', None) or getattr(person, 'name', '') or '',
                      'headline': headline, 'intro_copy': intro, 'cta_text': cta_text, 'cta_url': cta_url},
    ):
        sent += 1
    if push_title and hasattr(person, 'push_subscriptions'):
        try:
            if send_push_to_user(person, title=push_title, body=intro[:180], url=push_url):
                sent += 1
        except Exception:
            logger.warning("dashboard.push_failed", exc_info=True)
    return sent


def run_action(data, admin=None):
    """Ejecuta el botón de un aviso de «Hoy». Devuelve {'done': texto, 'undo'?: {...}}."""
    from api.utils.site import studio_name, web_url
    kind = (data or {}).get('kind')

    if kind == 'waitlist_promote':
        from api.utils.waitlist import book_from_entry
        entry = WaitlistEntry.objects.select_related('schedule__class_type', 'user').filter(
            pk=data.get('entry_id')).first()
        if entry is None:
            raise DashboardError('not_found', 'Esa persona ya no está en la lista de espera.', status=404)
        booking = book_from_entry(entry, charge=data.get('charge') or 'credits', by_admin=admin)
        logger.info("dashboard.waitlist_promote entry=%s booking=%s admin=%s", entry.id, booking.id,
                    getattr(admin, 'id', None))
        return {'done': f"Plaza dada a {first_name(user_name(entry.user))}. Le llega un aviso.",
                'booking_id': booking.id}

    if kind == 'resend_payment_link':
        if data.get('subscription_id'):
            sub = Subscription.objects.select_related('user', 'plan').filter(pk=data['subscription_id']).first()
            if sub is None:
                raise DashboardError('not_found', 'No encontramos esa cuota.', status=404)
            person, plan_name = sub.user, sub.plan.name
            headline = 'No pudimos cobrar tu cuota'
            intro = (f'El cobro de tu plan {plan_name} no se pudo completar. Revisa tu tarjeta desde tu '
                     f'cuenta para seguir reservando tus clases.')
            cta, url, push_url = 'Revisar mi pago', web_url('/dashboard?tab=suscripcion'), '/dashboard?tab=suscripcion'
        else:
            p = Payment.objects.select_related('user', 'guest').filter(pk=data.get('payment_id')).first()
            if p is None:
                raise DashboardError('not_found', 'No encontramos ese pago.', status=404)
            person = p.user or p.guest
            headline = 'Tu pago no se completó'
            intro = (f'El pago de {_money(p.amount_eur, (p.currency or "EUR").upper())} en {studio_name()} '
                     f'no se pudo completar. Puedes volver a intentarlo desde este enlace.')
            cta, url, push_url = 'Completar el pago', web_url('/prices'), '/prices'
        if person is None:
            raise DashboardError('no_contact', 'No hay a quién enviar el enlace.', status=400)
        sent = _send_notice(person, headline, intro, cta, url, subject=headline,
                            push_title=f'💳 {headline}', push_url=push_url)
        if not sent:
            raise DashboardError('not_sent', 'No se ha podido enviar: activa los emails del estudio en '
                                             'Ajustes → Emails o revisa su email.', status=409)
        logger.info("dashboard.resend_link payment=%s sub=%s admin=%s", data.get('payment_id'),
                    data.get('subscription_id'), getattr(admin, 'id', None))
        from api.utils.calendar_ops import person_name
        return {'done': f"Enlace de pago enviado a {first_name(person_name(person))}"}

    if kind in ('extend_pack', 'unextend_pack'):
        try:
            days = int(data.get('days') or 7)
        except (TypeError, ValueError):
            days = 7
        if not 1 <= days <= 60:
            raise DashboardError('bad_request', 'Se puede ampliar entre 1 y 60 días.')
        with transaction.atomic():
            e = CreditLedgerEntry.objects.select_for_update().select_related('wallet__user').filter(
                pk=data.get('entry_id'), kind='grant').first()
            if e is None or e.expires_at is None:
                raise DashboardError('not_found', 'Ese bono ya no tiene caducidad.', status=404)
            meta = dict(e.metadata or {})
            history = list(meta.get('extensions') or [])
            if kind == 'extend_pack':
                old = e.expires_at
                e.expires_at = old + timedelta(days=days)
                history.append({'from': old.isoformat(), 'to': e.expires_at.isoformat(),
                                'by': getattr(admin, 'id', None), 'at': timezone.now().isoformat()})
            else:
                if not history:
                    raise DashboardError('nothing_to_undo', 'No hay nada que deshacer.')
                last = history.pop()
                e.expires_at = datetime.fromisoformat(last['from'])
            meta['extensions'] = history
            e.metadata = meta
            e.save(update_fields=['expires_at', 'metadata', 'updated_at'])
        exp = to_madrid_wall(e.expires_at)
        name = first_name(user_name(e.wallet.user))
        logger.info("dashboard.%s entry=%s admin=%s", kind, e.id, getattr(admin, 'id', None))
        if kind == 'unextend_pack':
            return {'done': f"Caducidad del bono de {name} restaurada"}
        return {'done': f"Bono de {name} ampliado al {exp.day} {MONTHS[exp.month - 1]}",
                'undo': {'kind': 'unextend_pack', 'entry_id': e.id}}

    if kind == 'promote_class':
        from api.utils.waitlist import bookings_on, slot_bounds
        try:
            schedule = RecurringSchedule.objects.select_related('class_type').get(pk=int(data.get('schedule_id')))
            d = date.fromisoformat(str(data.get('date')))
        except (RecurringSchedule.DoesNotExist, TypeError, ValueError):
            raise DashboardError('not_found', 'Esa clase no existe.', status=404)
        booked = {b.user_id for b in bookings_on(schedule.id, d) if b.user_id}
        fans = _class_fans(schedule.class_type_id, exclude_user_ids=booked)
        if not fans:
            raise DashboardError('nobody', 'No hay clientas a las que avisar de esta clase.')
        s_wall, _ = slot_bounds(schedule, d)
        title = schedule.class_type.title
        when = f"{_when_label(d, local_today())} a las {s_wall:%H:%M}"
        headline = f"Quedan plazas en {title}"
        intro = f"Hay sitio en {title} {when}. Si te apetece venir, resérvala desde la web."
        n = 0
        for u in fans:
            if _send_notice(u, headline, intro, 'Reservar plaza', web_url('/calendar'), subject=headline,
                            push_title=f'🧘 {headline}', push_url='/calendar'):
                n += 1
        if not n:
            raise DashboardError('not_sent', 'No se ha podido enviar: activa los emails o los avisos al móvil.',
                                 status=409)
        logger.info("dashboard.promote_class schedule=%s date=%s people=%s admin=%s",
                    schedule.id, d, n, getattr(admin, 'id', None))
        return {'done': f"Aviso enviado a {n} {'clienta' if n == 1 else 'clientas'} de {title}", 'people': n}

    raise DashboardError('bad_request', 'Acción desconocida.')


# ── Hoy en el estudio (un día) ────────────────────────────────────────────

def day_timeline(d: date, data=None):
    from api.utils.calendar_ops import build_calendar
    data = data or build_calendar(d, d)
    occs = [o for o in data['occurrences'] if o['date'] == d.isoformat()]
    rule_ids = [o['schedule_id'] for o in occs if o['schedule_id']]
    event_ids = [o['event_id'] for o in occs if o['event_id']]
    people = defaultdict(list)
    if occs:
        lo, hi = instant(d) - timedelta(days=1), instant(d) + timedelta(days=2)
        qs = Booking.objects.filter(status__in=ACTIVE, start_datetime__gte=lo, start_datetime__lt=hi) \
            .filter(Q(occurrence_id__in=rule_ids) | Q(event_id__in=event_ids)) \
            .select_related('user', 'guest__linked_user').order_by('created_at')
        for b in qs:
            if wall_date(b.start_datetime) != d:
                continue
            k = f"s{b.occurrence_id}" if b.occurrence_id else f"e{b.event_id}"
            _, name, _ = person_of(b)
            people[k].append(name)
    now = wall_now()
    is_today = d == now.date()
    sessions, next_marked = [], False
    for o in sorted(occs, key=lambda x: x['start']):
        start = datetime.fromisoformat(o['start'])
        k = f"s{o['schedule_id']}" if o['schedule_id'] else f"e{o['event_id']}"
        names = people.get(k, [])
        is_next = False
        if is_today and not next_marked and not o['canceled'] and not o['blackout'] and start > now:
            is_next = next_marked = True
        sessions.append({
            'id': o['id'], 'kind': o['kind'], 'schedule_id': o['schedule_id'], 'event_id': o['event_id'],
            'date': o['date'], 'title': o['title'], 'class_type_id': o['class_type']['id'],
            'start': start.strftime('%H:%M'), 'end': o['end'][11:16], 'duration': o['duration'],
            'room': o['room']['name'], 'instructor': (o['instructor'] or {}).get('name') or '',
            'capacity': o['capacity'], 'booked': o['booked'], 'waitlist': o['waitlist'],
            'canceled': o['canceled'], 'blackout': (o['blackout'] or {}).get('reason') if o['blackout'] else None,
            'past': o['past'], 'started': o['started'], 'next': is_next,
            'people': [{'name': n, 'initials': initials(n)} for n in names[:5]], 'people_total': len(names),
        })
    closed = (data.get('closed_days') or {}).get(d.isoformat())
    return {'date': d.isoformat(), 'is_today': is_today, 'closed': closed, 'sessions': sessions}


# ── Cifras de «Hoy» ───────────────────────────────────────────────────────

def _people_by_day(start: date, end: date):
    rows = defaultdict(set)
    count = Counter()
    qs = Booking.objects.filter(status__in=ACTIVE, start_datetime__gte=instant(start) - timedelta(days=1),
                                start_datetime__lt=instant(end) + timedelta(days=2)) \
        .select_related('guest').only('start_datetime', 'user_id', 'guest_id', 'guest__linked_user_id')
    for b in qs:
        d = wall_date(b.start_datetime)
        if d is None or not start <= d <= end:
            continue
        count[d] += 1
        if b.user_id:
            rows[d].add(('u', b.user_id))
        elif b.guest_id:
            rows[d].add(('u', b.guest.linked_user_id) if b.guest and b.guest.linked_user_id else ('g', b.guest_id))
    return rows, count


def kpis(today: date):
    from api.utils.calendar_ops import build_calendar
    monday = today - timedelta(days=today.weekday())
    first = monday - timedelta(weeks=6)
    hist_start = min(first, today - timedelta(days=29 + 42))
    by_day_people, by_day_count = _people_by_day(hist_start, monday + timedelta(days=6))

    # 1) Reservas esta semana (las 7 últimas semanas para la tendencia)
    weekly = []
    for k in range(6, -1, -1):
        ws = monday - timedelta(weeks=k)
        weekly.append(sum(by_day_count[ws + timedelta(days=i)] for i in range(7)))
    bookings_week = weekly[-1]

    # 2) Ingresos del mes (frente a los mismos días del mes anterior)
    m0 = month_start(today)
    rows, currency = sales_rows(month_start(today, 6), today)
    by_month = defaultdict(float)
    for r in rows:
        if r['status'] == 'succeeded':
            by_month[r['date'][:7]] += r['amount']
    months = [month_start(today, k) for k in range(6, -1, -1)]
    monthly = [round(by_month[f"{m.year}-{m.month:02d}"], 2) for m in months]
    _, _, ps, pe, _ = period_bounds('month', today)
    rev_prev = round(sum(r['amount'] for r in rows if r['status'] == 'succeeded'
                         and ps.isoformat() <= r['date'] <= pe.isoformat()), 2)
    revenue = monthly[-1]

    # 3) Clientas activas: han venido (o tienen reserva) en los últimos 30 días
    def active_until(end):
        s = set()
        for i in range(30):
            s |= by_day_people[end - timedelta(days=i)]
        return len(s)
    active_series = [active_until(today - timedelta(weeks=k)) for k in range(6, -1, -1)]
    active_now = active_series[-1]
    active_prev = active_until(today - timedelta(days=30))

    # 4) Ocupación de la semana (reservas / plazas de las clases que hay)
    cal = build_calendar(first, monday + timedelta(days=6))
    occ_week = defaultdict(lambda: [0, 0])
    for o in cal['occurrences']:
        if o['canceled'] or o['blackout'] or not o['capacity']:
            continue
        wk = (date.fromisoformat(o['date']) - first).days // 7
        occ_week[wk][0] += o['booked']
        occ_week[wk][1] += o['capacity']
    occ_series = [round(occ_week[k][0] / occ_week[k][1] * 100) if occ_week[k][1] else 0 for k in range(7)]
    occ_now = occ_series[-1] if occ_week[6][1] else None
    occ_prev = occ_series[-2] if occ_week[5][1] else None
    any_booking = bookings_week or any(weekly)

    def delta(cur, prev, kind, label):
        if kind == 'pct':
            v = pct(cur, prev)
            if v is None:
                return None
        else:
            if prev is None or cur is None:
                return None
            v = round(cur - prev)
        return {'value': v, 'kind': kind, 'label': label, 'trend': 'up' if v > 0 else ('down' if v < 0 else 'flat')}

    prev_month = MONTHS_LONG[month_start(today, 1).month - 1]
    return currency, [
        {'key': 'bookings_week', 'label': 'Reservas esta semana', 'icon': 'calendar', 'tint': 'reformer',
         'value': bookings_week, 'format': 'count', 'spark': weekly if any(weekly) else None,
         'delta': delta(bookings_week, weekly[-2], 'pct', 'vs semana pasada') if any(weekly) else None,
         'hint': 'Aún sin reservas. Comparte tu enlace.', 'to': '/bookings'},
        {'key': 'revenue_month', 'label': 'Ingresos del mes', 'icon': 'wallet', 'tint': 'mat',
         'value': revenue, 'format': 'money', 'spark': monthly if any(monthly) else None,
         'delta': delta(revenue, rev_prev, 'pct', f'vs {prev_month}') if any(monthly) else None,
         'hint': 'Cuando cobres, lo verás aquí.', 'to': '/ventas'},
        {'key': 'active_clients', 'label': 'Clientas activas', 'icon': 'users', 'tint': 'yoga',
         'value': active_now, 'format': 'count', 'spark': active_series if any(active_series) else None,
         'delta': delta(active_now, active_prev, 'abs', 'en 30 días') if any(active_series) else None,
         'hint': 'Aún nadie ha venido a clase.', 'to': '/clients'},
        {'key': 'occupancy_week', 'label': 'Ocupación semana', 'icon': 'layers', 'tint': 'privada',
         'value': occ_now if any_booking else None, 'format': 'pct',
         'spark': occ_series if any_booking and any(occ_series) else None,
         'delta': delta(occ_now, occ_prev, 'pts', 'vs semana pasada') if any_booking else None,
         'hint': 'Se calcula con las primeras reservas.' if occ_week[6][1] else 'Esta semana no hay clases.',
         'to': '/calendar'},
    ]


def bookings_14(today: date):
    start = today - timedelta(days=13)
    _, by_day = _people_by_day(start, today)
    closed = {}
    for b, bs, be in blackouts_overlapping(datetime.combine(start, time.min),
                                           datetime.combine(today + timedelta(days=1), time.min)):
        if b.schedule_id is not None:
            continue
        d = start
        while d <= today:
            if bs <= datetime.combine(d, time.min) and be >= datetime.combine(d + timedelta(days=1), time.min):
                closed[d] = b.reason or 'Cerrado'
            d += timedelta(days=1)
    return [{'date': (start + timedelta(days=i)).isoformat(), 'count': by_day[start + timedelta(days=i)],
             'closed': closed.get(start + timedelta(days=i))} for i in range(14)]


def activity_feed(limit=8):
    since = timezone.now() - timedelta(days=21)
    rows = []
    for b in Booking.objects.filter(created_at__gte=since).exclude(status='pending') \
            .select_related('user', 'guest__linked_user', 'occurrence__class_type', 'event') \
            .order_by('-created_at')[:limit * 2]:
        _, name, _ = person_of(b)
        when = to_madrid_wall(b.start_datetime)
        what = f"{booking_title(b)}" + (f" {when.day}/{when.month} {when:%H:%M}" if when else '')
        rows.append((b.created_at, f"b{b.id}", name, f"reservó {what}"))
        if b.status == 'canceled' and b.updated_at and b.updated_at > b.created_at + timedelta(seconds=5):
            rows.append((b.updated_at, f"c{b.id}", name, f"canceló {what}"))
    for r in sales_rows(to_madrid_wall(since).date(), local_today())[0][:limit]:
        verb = {'packs': 'compró', 'memberships': 'pagó', 'classes': 'pagó'}.get(r['kind'], 'pagó')
        at = as_instant(datetime.fromisoformat(f"{r['date']}T{r['time']}"))
        rows.append((at, r['id'], r['name'], f"{verb} {r['concept']}"))
    for e in WaitlistEntry.objects.filter(created_at__gte=since).select_related('user', 'schedule__class_type') \
            .order_by('-created_at')[:limit]:
        rows.append((e.created_at, f"w{e.id}", user_name(e.user),
                     f"se apuntó a la lista de espera de {e.schedule.class_type.title}"))
    for u in get_user_model().objects.filter(date_joined__gte=since, is_staff=False, is_superuser=False) \
            .order_by('-date_joined')[:limit]:
        rows.append((u.date_joined, f"u{u.id}", user_name(u),
                     'se dio de alta en el estudio' if u.created_by_admin else 'se registró desde tu web'))
    rows.sort(key=lambda r: r[0], reverse=True)
    return [{'id': i, 'name': n, 'initials': initials(n), 'text': t, 'at': at.isoformat()}
            for at, i, n, t in rows[:limit]]


def extras_state(cfg=None):
    from api.utils.emailing import email_enabled
    from api.utils.payments import payments_status
    cfg = cfg or SiteConfig.load()
    hero_ok = bool(
        (cfg.hero_mode == 'image' and (cfg.hero_image_url or SiteImage.objects.filter(section='hero',
                                                                                      is_active=True).exists()))
        or (cfg.hero_mode == 'video' and cfg.hero_video_url) or cfg.hero_mode == 'illustration'
    )
    texts_ok = bool((cfg.hero_title or cfg.hero_subtitle) and cfg.about_text)
    return [
        {'key': 'payments', 'label': 'Cobrar online', 'done': bool(payments_status(cfg)['ready']),
         'to': '/ajustes?tab=pagos'},
        {'key': 'emails', 'label': 'Emails a clientas', 'done': bool(email_enabled()), 'to': '/ajustes?tab=emails'},
        {'key': 'google', 'label': 'Google (ficha y búsquedas)', 'done': bool(cfg.google_business_url),
         'to': '/ajustes?tab=google'},
        {'key': 'content', 'label': 'Fotos y textos de tu web', 'done': hero_ok and texts_ok,
         'to': '/ajustes?tab=textos'},
    ]


def today_payload():
    from api.utils.calendar_ops import build_calendar
    from api.utils.site import web_url
    today = local_today()
    cal = build_calendar(today, today + timedelta(days=2))
    timeline = day_timeline(today, cal)
    live = [s for s in timeline['sessions'] if not s['canceled'] and not s['blackout']]
    currency, k = kpis(today)
    cfg = SiteConfig.load()
    return {
        'today': today.isoformat(),
        'now': wall_now().isoformat(timespec='minutes'),
        'currency': currency,
        'summary': {'classes': len(live), 'bookings': sum(s['booked'] for s in live),
                    'closed': timeline['closed']},
        'has_bookings': Booking.objects.exists(),
        'kpis': k,
        'attention': attention_items(today, sessions=cal['occurrences']),
        'timeline': timeline,
        'chart': bookings_14(today),
        'feed': activity_feed(),
        'extras': extras_state(cfg),
        'web_url': web_url(),
        'published': bool(cfg.setup_completed),
    }


# ── Ventas ────────────────────────────────────────────────────────────────

def _buckets(period, start, full_end):
    """Cubos del gráfico: [(etiqueta, inicio, fin)]."""
    out = []
    if period == 'week':
        for i in range(7):
            d = start + timedelta(days=i)
            out.append((WEEKDAYS[i], d, d))
    elif period == 'month':
        d = start
        while d <= full_end:
            out.append((str(d.day), d, d))
            d += timedelta(days=1)
    elif period == 'quarter':
        d = start
        while d <= full_end:
            e = min(d + timedelta(days=6), full_end)
            out.append((date_label(d), d, e))
            d = e + timedelta(days=1)
    else:
        for m in range(12):
            s = add_months(start, m)
            out.append((MONTHS[s.month - 1], s, add_months(s, 1) - timedelta(days=1)))
    return out


def _period_label(period, start, end):
    if period == 'week':
        return f"Semana del {start.day} {MONTHS[start.month - 1]}"
    if period == 'month':
        return f"{MONTHS_LONG[start.month - 1].capitalize()} {start.year}"
    if period == 'quarter':
        return f"{(start.month - 1) // 3 + 1}.º trimestre {start.year}"
    return str(start.year)


def sales_summary(period='month', offset=0):
    if period not in PERIODS:
        period = 'month'
    today = local_today()
    start, end, ps, pe, full_end = period_bounds(period, today, offset)
    rows, currency = sales_rows(ps, end, statuses=('succeeded', 'refunded'))
    cur = [r for r in rows if start.isoformat() <= r['date'] <= end.isoformat()]
    prev = [r for r in rows if ps.isoformat() <= r['date'] <= pe.isoformat()]
    revenue, revenue_prev = _total(cur), _total(prev)

    def sold(rs):
        return sum(1 for r in rs if r['kind'] == 'packs' and r['status'] == 'succeeded')

    owed = owed_items()
    subs = list(Subscription.objects.filter(status__in=['active', 'past_due']).select_related('plan'))

    def per_month(plan):
        n = plan.interval_count or 1
        iv = plan.interval or 'month'
        return float(plan.price_eur) / (12 * n if iv == 'year' else (max(1, round(n / 4)) if iv == 'week' else n))
    mrr = round(sum(per_month(s.plan) for s in subs if s.status == 'active'), 2)

    # Gráfico: este periodo frente al anterior (alineado por posición)
    prev_offset = start - ps
    chart = []
    for label, b0, b1 in _buckets(period, start, full_end):
        future = b0 > today
        v = sum(r['amount'] for r in cur if r['status'] == 'succeeded' and b0.isoformat() <= r['date'] <= b1.isoformat())
        if period == 'year':
            p0, p1 = add_months(b0, -12), add_months(b0, -11) - timedelta(days=1)
        else:
            p0, p1 = b0 - prev_offset, min(b1 - prev_offset, start - timedelta(days=1))
        p0 = max(p0, ps)
        pv = sum(r['amount'] for r in rows if r['status'] == 'succeeded' and p0.isoformat() <= r['date'] <= p1.isoformat())
        chart.append({'label': label, 'start': b0.isoformat(), 'value': None if future else round(v, 2),
                      'prev': round(pv, 2)})

    plan_sales = Counter()
    plan_revenue = defaultdict(float)
    for r in cur:
        if r['plan_id'] and r['status'] == 'succeeded':
            plan_sales[r['plan_id']] += 1
            plan_revenue[r['plan_id']] += r['amount']
    plans = [{'id': p.id, 'name': p.name, 'type': p.type, 'credits': p.credits, 'price': float(p.price_eur),
              'active': p.is_active, 'sold': plan_sales[p.id], 'revenue': round(plan_revenue[p.id], 2),
              'subscribers': sum(1 for s in subs if s.plan_id == p.id and s.status == 'active')}
             for p in Plan.objects.order_by('-is_active', 'type', 'price_eur')]

    prev_name = {'week': 'la semana pasada', 'month': MONTHS_LONG[ps.month - 1],
                 'quarter': 'el trimestre anterior', 'year': str(ps.year)}[period]
    return {
        'period': period, 'offset': offset, 'currency': currency,
        'label': _period_label(period, start, end),
        'start': start.isoformat(), 'end': end.isoformat(), 'full_end': full_end.isoformat(),
        'prev_start': ps.isoformat(), 'prev_end': pe.isoformat(), 'compare_label': f"vs {prev_name}",
        'kpis': {
            'revenue': revenue, 'revenue_prev': revenue_prev, 'revenue_change_pct': pct(revenue, revenue_prev),
            'count': sum(1 for r in cur if r['status'] == 'succeeded'),
            'pending': round(sum(o['amount'] for o in owed), 2), 'pending_count': len(owed),
            'pending_failed': sum(1 for o in owed if o['kind'] == 'payment'),
            'packs_sold': sold(cur), 'packs_sold_prev': sold(prev),
            'subscriptions_active': sum(1 for s in subs if s.status == 'active'),
            'monthly_recurring': mrr,
            'refunded': round(sum(r['amount'] for r in cur if r['status'] == 'refunded'), 2),
        },
        'chart': chart,
        'owed': owed,
        'collected': cur[:300],
        'collected_total': len(cur),
        'plans': plans,
        'studio': _studio_fiscal(),
    }


def _studio_fiscal():
    cfg = SiteConfig.load()
    return {'name': cfg.studio_name, 'legal_name': cfg.legal_name or cfg.studio_name, 'tax_id': cfg.tax_id,
            'address': ', '.join(x for x in [cfg.address, cfg.postal_code, cfg.city] if x),
            'email': cfg.contact_email}


def sales_csv(period='month', offset=0):
    """«Cierre para la gestoría»: los cobros del periodo en CSV (Excel en español)."""
    data = sales_summary(period, offset)
    rows, _ = sales_rows(date.fromisoformat(data['start']), date.fromisoformat(data['end']),
                         statuses=('succeeded', 'refunded'))
    buf = io.StringIO()
    buf.write('﻿')  # BOM: Excel abre bien los acentos
    w = csv.writer(buf, delimiter=';')
    fiscal = data['studio']
    w.writerow([f"Cierre de {data['label']}", fiscal['legal_name'], fiscal['tax_id'] or 'NIF sin poner'])
    w.writerow([f"Del {data['start']} al {data['end']}"])
    w.writerow([])
    w.writerow(['Fecha', 'Hora', 'Nº recibo', 'Clienta', 'Email', 'Concepto', 'Tipo', 'Método', 'Importe',
                'Moneda', 'Estado'])

    def num(v):
        return f"{v:.2f}".replace('.', ',')
    status_label = {'succeeded': 'Cobrado', 'refunded': 'Devuelto'}
    for r in sorted(rows, key=lambda r: (r['date'], r['time'])):
        w.writerow([r['date'], r['time'], r['receipt_no'], r['name'], r['email'], r['concept'], r['kind_label'],
                    r['method'], num(r['amount'] if r['status'] == 'succeeded' else -r['amount']), data['currency'],
                    status_label.get(r['status'], r['status'])])
    w.writerow([])
    k = data['kpis']
    w.writerow(['Total cobrado', '', '', '', '', '', '', '', num(k['revenue']), data['currency']])
    if k['refunded']:
        w.writerow(['Total devuelto', '', '', '', '', '', '', '', num(-k['refunded']), data['currency']])
    by_kind = defaultdict(float)
    for r in rows:
        if r['status'] == 'succeeded':
            by_kind[r['kind_label']] += r['amount']
    for label, v in sorted(by_kind.items()):
        w.writerow([f"  {label}", '', '', '', '', '', '', '', num(v), data['currency']])
    filename = f"cierre-{data['period']}-{data['start']}_{data['end']}.csv"
    return buf.getvalue(), filename


# ── Mi web ────────────────────────────────────────────────────────────────

TOGGLE_MODELS = {
    'testimonials': lambda: Testimonial.objects.all(),
    'faqs': lambda: FAQItem.objects.filter(is_sample=False),
    'gallery': lambda: SiteImage.objects.filter(section='gallery'),
}


def web_summary():
    from api.utils.site import web_url
    cfg = SiteConfig.load()
    today = local_today()
    sched = RecurringSchedule.objects.filter(is_active=True).filter(Q(end_date__isnull=True) | Q(end_date__gte=today))
    n_classes = ClassType.objects.filter(is_active=True).count()
    n_plans = Plan.objects.filter(is_active=True).count()
    n_team = Instructor.objects.count()

    def toggle(key):
        qs = TOGGLE_MODELS[key]()
        total = qs.count()
        active = qs.filter(is_active=True).count()
        return total, active

    t_total, t_active = toggle('testimonials')
    f_total, f_active = toggle('faqs')
    g_total, g_active = toggle('gallery')
    has_contact = bool(cfg.address or cfg.city or cfg.phone or cfg.contact_email)
    hero_label = {'image': 'Foto', 'video': 'Vídeo', 'illustration': 'Ilustración'}.get(cfg.hero_mode, 'Foto')

    def sec(key, label, hint, icon, edit, visible, count=None, toggle_=False, total=None, empty=''):
        return {'key': key, 'label': label, 'hint': hint, 'icon': icon, 'edit': edit, 'visible': bool(visible),
                'count': count, 'toggle': toggle_, 'total': total, 'empty': empty}

    sections = [
        sec('hero', 'Portada', f"{hero_label}, título y botón Reservar", 'image', '/ajustes?tab=portada', True),
        sec('upcoming', 'Próximas clases', 'Lo siguiente que se puede reservar', 'calendar', '/calendar',
            sched.exists(), empty='Aparece al poner tu horario'),
        sec('classes', 'Clases', 'Tus tipos de clase', 'layers', '/classes', n_classes, n_classes,
            empty='Aparece al crear tu primera clase'),
        sec('prices', 'Precios', 'Bonos y cuotas a la venta', 'ticket', '/plans', n_plans, n_plans,
            empty='Aparece al crear un bono'),
        sec('team', 'Profesoras', 'Fotos y nombres', 'user', '/instructors', n_team, n_team,
            empty='Aparece al añadir a tu equipo'),
        sec('about', 'Sobre el estudio', 'Quiénes sois, en tus palabras', 'text', '/ajustes?tab=textos',
            bool(cfg.about_text), empty='Escribe unas líneas sobre ti'),
        sec('testimonials', 'Opiniones', 'Lo que dicen tus clientas', 'star', '/ajustes?tab=opiniones',
            t_active, t_active, toggle_=t_total > 0, total=t_total, empty='Añade la primera opinión'),
        sec('faqs', 'Preguntas frecuentes', 'Dudas típicas, respondidas', 'help', '/ajustes?tab=preguntas',
            f_active, f_active, toggle_=f_total > 0, total=f_total, empty='Añade tus preguntas'),
        sec('gallery', 'Galería', 'Fotos del estudio', 'photos', '/site-images', g_active, g_active,
            toggle_=g_total > 0, total=g_total, empty='Sube fotos de tu estudio'),
        sec('contact', 'Dónde estamos', 'Dirección, mapa y contacto', 'pin', '/ajustes', has_contact,
            empty='Añade tu dirección o teléfono'),
    ]
    m0 = month_start(today)
    User = get_user_model()
    from api.models import PushSubscription
    return {
        'web_url': web_url(), 'default_url': settings.WEB_URL.rstrip('/'),
        'domain': cfg.web_domain or '', 'published': bool(cfg.setup_completed),
        'sections': sections,
        'app': {'devices': PushSubscription.objects.count(),
                'clients': PushSubscription.objects.values('user_id').distinct().count()},
        'month': {
            'label': MONTHS_LONG[m0.month - 1],
            'bookings': Booking.objects.filter(created_at__gte=instant(m0), status__in=ACTIVE).count(),
            'signups': User.objects.filter(date_joined__gte=instant(m0), is_staff=False, is_superuser=False,
                                           created_by_admin=False).count(),
        },
    }


def set_section_visible(key, visible, ids=None):
    """Mostrar u ocultar una sección que se apaga con los «activo» de su
    contenido. Al ocultar devuelve qué se ocultó (para volver a mostrar justo
    eso); al mostrar sin `ids`, se muestra todo."""
    if key not in TOGGLE_MODELS:
        raise DashboardError('bad_request', 'Esa sección no se puede ocultar desde aquí.')
    qs = TOGGLE_MODELS[key]()
    if visible:
        target = qs.filter(is_active=False)
        if ids:
            target = target.filter(id__in=[int(i) for i in ids if str(i).isdigit()])
        changed = list(target.values_list('id', flat=True))
        if not changed and ids:  # lo recordado ya no existe: se muestra todo
            changed = list(qs.filter(is_active=False).values_list('id', flat=True))
        qs.filter(id__in=changed).update(is_active=True, updated_at=timezone.now())
    else:
        changed = list(qs.filter(is_active=True).values_list('id', flat=True))
        qs.filter(id__in=changed).update(is_active=False, updated_at=timezone.now())
    logger.info("dashboard.web_section key=%s visible=%s n=%s", key, visible, len(changed))
    return {'section': key, 'visible': bool(visible), 'ids': changed,
            'active': qs.filter(is_active=True).count(), 'total': qs.count()}


# ── Ajustes ───────────────────────────────────────────────────────────────

def checklist(user=None):
    cfg = SiteConfig.load()
    extras = extras_state(cfg)
    done = {e['key']: e['done'] for e in extras}
    review = []
    if not done['payments']:
        review.append({'key': 'payments', 'title': 'Activa los pagos online para cobrar al reservar',
                       'action': 'Activar', 'to': '/ajustes?tab=pagos', 'tone': 'warn'})
    if not done['emails']:
        review.append({'key': 'emails', 'title': 'Configura los emails: tus clientas no reciben confirmaciones',
                       'action': 'Configurar', 'to': '/ajustes?tab=emails', 'tone': 'warn'})
    if not (cfg.tax_id or '').strip():
        review.append({'key': 'tax_id', 'title': 'Falta tu NIF para los recibos', 'action': 'Añadir',
                       'to': '/ajustes', 'tone': 'warn'})
    if not (cfg.address or cfg.city):
        review.append({'key': 'address', 'title': 'Falta la dirección del estudio', 'action': 'Añadir',
                       'to': '/ajustes', 'tone': 'warn'})
    if not cfg.logo_url:
        review.append({'key': 'logo', 'title': 'Sube tu logo para la web y los emails', 'action': 'Subir',
                       'to': '/ajustes', 'tone': 'info'})
    if not cfg.web_domain:
        review.append({'key': 'domain', 'title': 'Usa tu propio dominio (tuestudio.com)', 'action': 'Conectar',
                       'to': '/ajustes?tab=dominio', 'tone': 'info'})
    if user is not None:
        dev = getattr(user, 'two_factor', None) if hasattr(user, 'two_factor') else None
        try:
            confirmed = bool(dev and dev.confirmed_at)
        except Exception:  # pragma: no cover
            confirmed = False
        if not confirmed:
            review.append({'key': '2fa', 'title': 'Protege tu cuenta con el código del móvil al entrar',
                           'action': 'Activar', 'to': '/seguridad', 'tone': 'info'})
    return {'extras': extras, 'review': review,
            'booking_cancel_min_hours': getattr(settings, 'BOOKING_CANCEL_MIN_HOURS', 8),
            'currency': cfg.currency, 'country': cfg.country}
