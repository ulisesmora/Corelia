"""Clientes del estudio: plan mensual que se cobra en el estudio (sin Stripe).

El estudio vende, p. ej., «8 clases al mes por 60 € en efectivo». Nada se cobra
ni se renueva solo: cada mes pulsa «Renovar» y se hace el CORTE de créditos.

Corte (renew):
  1. Clases del plan que le quedan (leftover):
        min(credits_pool, saldo − créditos «protegidos»)
     credits_pool = las del plan con las que empezó el ciclo (las del mes + las
     acumuladas). Protegidos = bonos/regalos vivos que no son de este plan
     (caducan más tarde o nunca): misma regla que la caducidad de bonos
     (tasks.process_wallet_expiration). Es decir, las clases del plan se
     gastan primero y los bonos que tenga aparte no se tocan.
  2. Según carry_over:
        lose → se pierden todas las que le quedan
        keep → se acumulan todas
        cap  → se acumulan hasta carry_over_cap; el resto se pierde
  3. Se apunta en su monedero: «expire» por las perdidas (reference
     STUDIO-CUT-<renovación>) y «grant» por las del mes nuevo (sin caducidad:
     la caducidad de estas clases ES el corte; metadata.studio_plan_id).
  4. Cobro: «paid» crea un Payment succeeded con el método (sale en Ventas →
     «Lo cobrado»); «later» deja la renovación pendiente (Ventas → «Quién me
     debe») hasta marcarla cobrada (pay_renewal).
  5. Se avanza next_due_date al siguiente cycle_day.

Doble renovación: bloqueo de la fila del plan, una renovación por periodo
(UniqueConstraint plan+period_start) y, si el panel manda el period_start que
vio, tiene que coincidir con el pendiente (un doble clic da 409).

Ejemplo (8 al mes, le quedan 2 al cortar):
  lose → empieza el mes con 8 · keep → con 10 · cap 1 → con 9.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from api.models import CreditLedgerEntry, CreditWallet, Payment, StudioPlan, StudioPlanRenewal
from api.utils.payment_options import STUDIO_METHOD_KEYS
from api.utils.waitlist import WaitlistError

logger = logging.getLogger(__name__)

# Se puede renovar desde unos días antes del corte (p. ej. paga el 28 el mes siguiente)
RENEW_WINDOW_DAYS = 7
# Aviso opcional al cliente: días antes del corte
REMIND_DAYS_BEFORE = 3
MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre']
METHOD_LABELS = dict(StudioPlan.METHODS)
CUT_PREFIX = 'STUDIO-CUT-'


class StudioPlanError(WaitlistError):
    """{'error', 'code'} como el resto del panel."""


def D(v) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return Decimal(0)


def num(v):
    """Decimal → int si es entero (para el JSON del panel)."""
    v = D(v)
    return int(v) if v == v.to_integral_value() else float(v)


def today():
    from api.utils.dashboard import local_today
    return local_today()


# ── Fechas del ciclo ──────────────────────────────────────────────────────

def next_cycle_date(d: date, cycle_day: int) -> date:
    """Primer día `cycle_day` estrictamente después de `d`."""
    cycle_day = max(1, min(28, int(cycle_day or 1)))
    if d.day < cycle_day:
        return d.replace(day=cycle_day)
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(y, m, cycle_day)


def month_label(d: date) -> str:
    return f"{MONTHS_LONG[d.month - 1]} {d.year}"


# ── Saldo y corte ─────────────────────────────────────────────────────────

def wallet_balance(wallet) -> Decimal:
    if wallet is None or not wallet.pk:
        return Decimal(0)
    return D(wallet.entries.aggregate(t=Sum('amount'))['t'])


def protected_credits(wallet, plan, now=None) -> Decimal:
    """Créditos vivos que NO son de este plan (bonos, regalos…)."""
    if wallet is None or not wallet.pk:
        return Decimal(0)
    now = now or timezone.now()
    # (en Python: un exclude() sobre una clave JSON que falta también quitaría esas filas)
    return sum((D(amount) for amount, meta in wallet.entries.filter(kind='grant', amount__gt=0)
                .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).values_list('amount', 'metadata')
                if not (isinstance(meta, dict) and str(meta.get('studio_plan_id')) == str(plan.id))), Decimal(0))


def compute_cutoff(plan: StudioPlan, wallet=None, now=None) -> dict:
    """Las cuentas del corte, sin tocar nada (sirve de vista previa)."""
    if wallet is None:
        wallet = CreditWallet.objects.filter(user_id=plan.user_id).first()
    balance = wallet_balance(wallet)
    pool = D(plan.credits_pool)
    leftover = max(Decimal(0), min(pool, balance - protected_credits(wallet, plan, now)))
    if plan.carry_over == 'keep':
        kept = leftover
    elif plan.carry_over == 'cap':
        kept = min(leftover, D(plan.carry_over_cap or 0))
    else:
        kept = Decimal(0)
    expired = leftover - kept
    added = D(plan.credits_per_month)
    return {
        'balance_before': balance, 'leftover': leftover, 'expired': expired, 'kept': kept,
        'added': added, 'balance_after': balance - expired + added, 'pool_after': kept + added,
    }


def cutoff_json(c: dict) -> dict:
    return {k: num(v) for k, v in c.items()}


def _clean_method(method, default='cash'):
    m = str(method or default).strip().lower()
    if m not in STUDIO_METHOD_KEYS:
        raise StudioPlanError('bad_method', 'Elige cómo te ha pagado: efectivo, Bizum, tarjeta o transferencia.')
    return m


def _payment(plan, amount, currency, method, renewal, admin):
    return Payment.objects.create(
        user=plan.user, amount_eur=amount, currency=currency, method=method, status='succeeded',
        # source=pay_at_studio: cobro apuntado por el estudio → sin email automático (signals._cobro_en_estudio)
        raw_response={'source': 'pay_at_studio', 'studio_plan_id': plan.id, 'renewal_id': renewal.id,
                      'by_admin': getattr(admin, 'id', None)},
    )


def renew(plan_id, charge='paid', method=None, period_start=None, admin=None, now=None) -> StudioPlanRenewal:
    """Corte de créditos + cobro (o pendiente). Lanza StudioPlanError."""
    if charge not in ('paid', 'later'):
        raise StudioPlanError('bad_charge', "charge debe ser 'paid' o 'later'.")
    now = now or timezone.now()
    t = today()
    try:
        with transaction.atomic():
            plan = (StudioPlan.objects.select_for_update().select_related('user')
                    .filter(pk=plan_id).first())
            if plan is None:
                raise StudioPlanError('not_found', 'No encontramos ese plan.', status=404)
            if plan.status != 'active':
                raise StudioPlanError('not_active', 'Este plan está en pausa o terminado: reactívalo para renovarlo.',
                                      status=409)
            due = plan.next_due_date or t
            if period_start:
                try:
                    expected = date.fromisoformat(str(period_start)[:10])
                except ValueError:
                    raise StudioPlanError('bad_request', 'period_start no válido (AAAA-MM-DD).')
                if expected != due:
                    raise StudioPlanError('already_renewed', 'Este mes ya está renovado. Recarga para ver cómo está.',
                                          status=409, next_due_date=due.isoformat())
            if due > t + timedelta(days=RENEW_WINDOW_DAYS):
                raise StudioPlanError(
                    'not_due', f'Ya está renovado hasta el {(due - timedelta(days=1)).day} de '
                               f'{MONTHS_LONG[(due - timedelta(days=1)).month - 1]}.',
                    status=409, next_due_date=due.isoformat())
            if StudioPlanRenewal.objects.filter(plan=plan, period_start=due).exists():
                raise StudioPlanError('already_renewed', 'Este mes ya está renovado.', status=409)
            m = _clean_method(method, plan.payment_method) if charge == 'paid' else ''

            wallet, _ = CreditWallet.objects.get_or_create(user=plan.user)
            wallet = CreditWallet.objects.select_for_update().get(pk=wallet.pk)
            c = compute_cutoff(plan, wallet, now)
            nxt = next_cycle_date(due, plan.cycle_day)
            renewal = StudioPlanRenewal.objects.create(
                plan=plan, period_start=due, period_end=nxt - timedelta(days=1),
                balance_before=c['balance_before'], leftover=c['leftover'], expired=c['expired'], kept=c['kept'],
                added=c['added'], balance_after=c['balance_after'], amount=D(plan.price), currency=plan.currency,
                method=m or plan.payment_method, created_by=admin if getattr(admin, 'pk', None) else None,
            )
            if c['expired'] > 0:
                CreditLedgerEntry.objects.create(
                    wallet=wallet, kind='expire', amount=-c['expired'], reference=f"{CUT_PREFIX}{renewal.id}",
                    metadata={'studio_plan_id': plan.id, 'renewal_id': renewal.id},
                )
            CreditLedgerEntry.objects.create(
                wallet=wallet, kind='grant', amount=c['added'],
                reference=f"Plan del estudio · {month_label(due)}"[:120],
                metadata={'studio_plan_id': plan.id, 'renewal_id': renewal.id, 'source': 'studio_plan'},
            )
            if charge == 'paid':
                renewal.payment = _payment(plan, renewal.amount, renewal.currency, m, renewal, admin)
                renewal.paid_at = now
                renewal.save(update_fields=['payment', 'paid_at', 'updated_at'])
            plan.credits_pool = c['pool_after']
            plan.next_due_date = nxt
            plan.last_renewed_at = now
            plan.due_marked_for = None
            if not plan.started_on:
                plan.started_on = due
            plan.save(update_fields=['credits_pool', 'next_due_date', 'last_renewed_at', 'due_marked_for',
                                     'started_on', 'updated_at'])
    except IntegrityError:
        raise StudioPlanError('already_renewed', 'Este mes ya está renovado.', status=409)
    logger.info("studio_plan.renew plan=%s renewal=%s period=%s charge=%s expired=%s added=%s admin=%s",
                plan.id, renewal.id, renewal.period_start, charge, c['expired'], c['added'], getattr(admin, 'id', None))
    return renewal


def pay_renewal(renewal_id, method=None, admin=None) -> StudioPlanRenewal:
    """«Cobrado» de una renovación que quedó pendiente."""
    with transaction.atomic():
        r = (StudioPlanRenewal.objects.select_for_update(of=('self',)).select_related('plan__user')
             .filter(pk=renewal_id).first())
        if r is None:
            raise StudioPlanError('not_found', 'No encontramos esa renovación.', status=404)
        if r.paid_at or r.payment_id:
            raise StudioPlanError('already_paid', 'Esa renovación ya está cobrada.', status=409)
        m = _clean_method(method, r.plan.payment_method)
        r.payment = _payment(r.plan, r.amount, r.currency, m, r, admin)
        r.paid_at = timezone.now()
        r.method = m
        r.save(update_fields=['payment', 'paid_at', 'method', 'updated_at'])
    logger.info("studio_plan.pay renewal=%s payment=%s method=%s admin=%s", r.id, r.payment_id, m,
                getattr(admin, 'id', None))
    return r


def set_status(plan_id, action, admin=None) -> StudioPlan:
    with transaction.atomic():
        plan = StudioPlan.objects.select_for_update().filter(pk=plan_id).first()
        if plan is None:
            raise StudioPlanError('not_found', 'No encontramos ese plan.', status=404)
        if plan.status == 'ended':
            raise StudioPlanError('ended', 'Este plan ya está terminado. Crea uno nuevo si vuelve.', status=409)
        if action == 'pause':
            plan.status = 'paused'
        elif action == 'resume':
            plan.status = 'active'
            t = today()
            if plan.next_due_date and plan.next_due_date < t:
                plan.next_due_date = t  # vuelve: el mes empieza cuando se renueve
        elif action == 'end':
            plan.status = 'ended'
            # Las clases fijas de este plan dejan de reservarse solas
            from api.models import UserClassPreference
            ids = list(plan.fixed_schedules.values_list('id', flat=True))
            if ids:
                for pref in UserClassPreference.objects.filter(user_id=plan.user_id, schedule_id__in=ids):
                    pref.soft_delete()
        else:
            raise StudioPlanError('bad_request', 'Acción desconocida.')
        try:
            plan.save(update_fields=['status', 'next_due_date', 'updated_at'])
        except IntegrityError:
            raise StudioPlanError('already_open', 'Este cliente ya tiene otro plan del estudio abierto.', status=409)
    logger.info("studio_plan.%s plan=%s admin=%s", action, plan.id, getattr(admin, 'id', None))
    return plan


# ── Listas para Hoy, Ventas y el panel ────────────────────────────────────

def balances_of(user_ids) -> dict:
    from api.models import CreditLedgerEntry as E
    return {uid: D(t) for uid, t in E.objects.filter(wallet__user_id__in=list(user_ids))
            .values('wallet__user_id').annotate(t=Sum('amount')).values_list('wallet__user_id', 't')}


def upcoming(until: date | None = None, t: date | None = None):
    """Planes activos con el corte vencido o antes de `until` (incluido)."""
    t = t or today()
    until = until or t + timedelta(days=RENEW_WINDOW_DAYS)
    return list(StudioPlan.objects.filter(status='active', next_due_date__lte=until)
                .select_related('user').order_by('next_due_date', 'id'))


def plan_json(plan: StudioPlan, balance=None, t: date | None = None, with_preview=False) -> dict:
    from api.utils.dashboard import user_name
    t = t or today()
    due = plan.next_due_date
    if balance is None:
        balance = balances_of([plan.user_id]).get(plan.user_id, Decimal(0))
    out = {
        'id': plan.id, 'user_id': plan.user_id, 'name': user_name(plan.user),
        'phone': plan.user.phone or '', 'email': plan.user.email or '',
        'title': plan.name or f"{plan.credits_per_month} clases al mes",
        'credits_per_month': plan.credits_per_month, 'price': num(plan.price), 'currency': plan.currency,
        'payment_method': plan.payment_method, 'method_label': METHOD_LABELS.get(plan.payment_method, ''),
        'cycle_day': plan.cycle_day, 'carry_over': plan.carry_over, 'carry_over_cap': plan.carry_over_cap,
        'status': plan.status, 'started_on': plan.started_on.isoformat() if plan.started_on else None,
        'next_due_date': due.isoformat() if due else None,
        'days_to_due': (due - t).days if due else None,
        'overdue': bool(due and due < t and plan.status == 'active'),
        'due_soon': bool(due and due <= t + timedelta(days=RENEW_WINDOW_DAYS) and plan.status == 'active'),
        'can_renew': bool(plan.status == 'active' and (not due or due <= t + timedelta(days=RENEW_WINDOW_DAYS))),
        'last_renewed_at': plan.last_renewed_at.isoformat() if plan.last_renewed_at else None,
        'credits_pool': num(plan.credits_pool), 'balance': num(balance),
        'remind_client': plan.remind_client, 'notes': plan.notes,
        'fixed_schedules': [
            {'id': s.id, 'title': s.class_type.title, 'weekday': s.weekday,
             'start_time': s.start_time.strftime('%H:%M') if s.start_time else ''}
            for s in plan.fixed_schedules.select_related('class_type').all()
        ],
    }
    if with_preview:
        out['preview'] = cutoff_json(compute_cutoff(plan))
    return out


def renewal_json(r: StudioPlanRenewal) -> dict:
    return {
        'id': r.id, 'plan_id': r.plan_id, 'period_start': r.period_start.isoformat(),
        'period_end': r.period_end.isoformat(), 'balance_before': num(r.balance_before), 'leftover': num(r.leftover),
        'expired': num(r.expired), 'kept': num(r.kept), 'added': num(r.added), 'balance_after': num(r.balance_after),
        'amount': num(r.amount), 'currency': r.currency, 'method': r.method,
        'method_label': METHOD_LABELS.get(r.method, ''), 'paid': bool(r.paid_at),
        'paid_at': r.paid_at.isoformat() if r.paid_at else None, 'payment_id': r.payment_id,
        'created_at': r.created_at.isoformat(),
        'by': (r.created_by.first_name or r.created_by.email) if r.created_by_id and r.created_by else '',
    }


def unpaid_renewals(limit=50):
    return list(StudioPlanRenewal.objects.filter(paid_at__isnull=True, payment__isnull=True,
                                                 plan__deleted_at__isnull=True)
                .select_related('plan__user').order_by('period_start')[:limit])


def today_card(t: date | None = None) -> dict:
    """«Renovaciones de este mes» para Hoy: vencidas, esta semana y el resto del mes."""
    from api.utils.dashboard import add_months
    t = t or today()
    month_end = add_months(t, 1) - timedelta(days=1)
    until = max(month_end, t + timedelta(days=RENEW_WINDOW_DAYS))
    plans = upcoming(until, t)
    bal = balances_of([p.user_id for p in plans])
    items = [plan_json(p, bal.get(p.user_id, Decimal(0)), t) for p in plans]
    for it, p in zip(items, plans):
        if it['can_renew']:
            it['preview'] = cutoff_json(compute_cutoff(p))
    week = sum(1 for i in items if i['due_soon'])
    return {'items': items, 'this_week': week, 'overdue': sum(1 for i in items if i['overdue']),
            'unpaid': len(unpaid_renewals())}


# ── Tarea diaria ──────────────────────────────────────────────────────────

def daily(t: date | None = None) -> dict:
    """Marca los planes que vencen hoy o antes (salen en Hoy) y, solo si la
    el estudio lo encendió en el plan, avisa al cliente unos días antes. No cobra
    ni renueva nada."""
    from api.utils.emailing import send_templated_email
    from api.utils.site import studio_name, web_url
    from api.utils.verification import is_placeholder_email
    t = t or today()
    marked = reminded = 0
    for plan in StudioPlan.objects.filter(status='active', next_due_date__lte=t).exclude(due_marked_for=t):
        StudioPlan.objects.filter(pk=plan.pk).update(due_marked_for=t)
        marked += 1
    soon = t + timedelta(days=REMIND_DAYS_BEFORE)
    for plan in (StudioPlan.objects.filter(status='active', remind_client=True, next_due_date__gt=t,
                                           next_due_date__lte=soon)
                 .select_related('user')):
        if plan.last_reminder_for == plan.next_due_date:
            continue
        email = plan.user.email or ''
        if not email or is_placeholder_email(email):
            continue
        d = plan.next_due_date
        ok = send_templated_email(
            to_email=email, template_id='generic-notice',
            subject=f'Tu mes en {studio_name()} empieza el día {d.day}',
            dynamic_data={'name': plan.user.first_name or '', 'headline': f'Tu mes empieza el día {d.day}',
                          'intro_copy': (f'Tu plan de {plan.credits_per_month} clases se renueva el '
                                         f'{d.day} de {MONTHS_LONG[d.month - 1]}. Lo pagas en el estudio, '
                                         f'como siempre.'),
                          'cta_text': 'Ver mis clases', 'cta_url': web_url('/dashboard')},
        )
        if ok:
            StudioPlan.objects.filter(pk=plan.pk).update(last_reminder_for=d)
            reminded += 1
    logger.info("studio_plan.daily date=%s marked=%s reminded=%s", t, marked, reminded)
    return {'marked': marked, 'reminded': reminded}
