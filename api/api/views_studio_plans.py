"""Clientes del estudio (planes mensuales que se cobran en el estudio) y
atajos de «Créditos». Solo administración. Lógica en api/utils/studio_plans.py.

  GET   /api/v1/studio-plans/?user=&status=&due=1   planes (due=1: vencidos o esta semana)
  POST  /api/v1/studio-plans/                       alta {user, credits_per_month, price, payment_method,
                                                    cycle_day, carry_over, carry_over_cap?, fixed_schedule_ids?,
                                                    remind_client?, notes?, start_date?, start: paid|later|none,
                                                    method?}  (start≠none → primera renovación ya)
  GET   /api/v1/studio-plans/<id>/                  plan + vista previa del corte + renovaciones
  PATCH /api/v1/studio-plans/<id>/                  cambiar condiciones (valen desde el próximo corte)
  GET   /api/v1/studio-plans/<id>/preview/          cuentas del próximo corte
  POST  /api/v1/studio-plans/<id>/renew/            {charge: paid|later, method?, period_start?}
  POST  /api/v1/studio-plans/<id>/pause/ · /resume/ · /end/
  POST  /api/v1/studio-plans/renewals/<id>/pay/     {method}  cobrar una renovación pendiente
  GET   /api/v1/studio-plans/upcoming/              renovaciones de este mes (Hoy)
  GET   /api/v1/studio-plans/shortcuts/             «Créditos»: clientes recientes y con pocas clases
  POST  /api/v1/studio-plans/credit-sale/           {user, credits, expires_days?|expires_at?, amount?, method?, reason?}
                                                    clases sueltas con créditos (+ cobro en mano opcional)
"""
import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from api.models import CreditLedgerEntry, CreditWallet, Payment, RecurringSchedule, StudioPlan
from api.utils import studio_plans as sp
from api.utils.locale import studio_currency

logger = logging.getLogger(__name__)
User = get_user_model()


def _err(e):
    return Response(e.payload(), status=e.status)


def _bad(msg, code='bad_request', **extra):
    return Response({'error': msg, 'code': code, **extra}, status=400)


def _int(v, lo, hi, field, label):
    try:
        n = int(str(v).strip())
    except (TypeError, ValueError):
        raise sp.StudioPlanError('bad_' + field, f'{label}: escribe un número.', field=field)
    if not lo <= n <= hi:
        raise sp.StudioPlanError('bad_' + field, f'{label}: entre {lo} y {hi}.', field=field)
    return n


def _money(v, field='price'):
    try:
        d = Decimal(str(v if v not in (None, '') else 0).replace(',', '.'))
    except (InvalidOperation, ValueError):
        raise sp.StudioPlanError('bad_' + field, 'Escribe el precio con números, p. ej. 60 o 59,90.', field=field)
    if d < 0 or d > Decimal('99999'):
        raise sp.StudioPlanError('bad_' + field, 'El precio no puede ser negativo.', field=field)
    return d.quantize(Decimal('0.01'))


def _clean(data, plan=None):
    """Valida los campos editables del plan. Devuelve (campos, ids de clases fijas o None)."""
    out = {}
    if plan is None or 'credits_per_month' in data:
        out['credits_per_month'] = _int(data.get('credits_per_month'), 1, 200, 'credits_per_month', 'Clases al mes')
    if plan is None or 'price' in data:
        out['price'] = _money(data.get('price'))
    if 'payment_method' in data or plan is None:
        m = str(data.get('payment_method') or 'cash').lower()
        if m not in dict(StudioPlan.METHODS):
            raise sp.StudioPlanError('bad_method', 'Elige cómo paga: efectivo, Bizum, tarjeta o transferencia.',
                                     field='payment_method')
        out['payment_method'] = m
    if 'cycle_day' in data or plan is None:
        out['cycle_day'] = _int(data.get('cycle_day') or 1, 1, 28, 'cycle_day', 'Día del corte')
    if 'carry_over' in data or plan is None:
        c = str(data.get('carry_over') or 'lose')
        if c not in dict(StudioPlan.CARRY):
            raise sp.StudioPlanError('bad_carry_over', 'Elige qué pasa con las clases que sobran.', field='carry_over')
        out['carry_over'] = c
        if c == 'cap':
            out['carry_over_cap'] = _int(data.get('carry_over_cap'), 1, 200, 'carry_over_cap', 'Máximo que se acumula')
        else:
            out['carry_over_cap'] = None
    for f, n in (('name', 120), ('notes', 300)):
        if f in data:
            out[f] = str(data.get(f) or '').strip()[:n]
    if 'remind_client' in data:
        out['remind_client'] = str(data.get('remind_client')).lower() in ('1', 'true', 'yes', 'on')
    fixed = None
    if 'fixed_schedule_ids' in data:
        ids = [int(x) for x in (data.get('fixed_schedule_ids') or []) if str(x).isdigit()]
        fixed = list(RecurringSchedule.objects.filter(id__in=ids, is_recurrent=True))
        if len(fixed) != len(set(ids)):
            raise sp.StudioPlanError('bad_schedule', 'Alguna de esas clases fijas ya no existe.', field='fixed_schedule_ids')
    return out, fixed


def _sync_fixed(plan, fixed):
    """Liga las clases fijas al plan y le guarda la plaza de cada semana
    (UserClassPreference, como «Clases fijas»). Las que se quitan del plan
    dejan de reservarse. Tras guardar, reserva ya las de esta semana."""
    from api.models import UserClassPreference
    before = set(plan.fixed_schedules.values_list('id', flat=True))
    plan.fixed_schedules.set(fixed)
    now_ids = {s.id for s in fixed}
    for s in fixed:
        pref, created = UserClassPreference.objects.get_or_create(user_id=plan.user_id, schedule=s,
                                                                  defaults={'is_active': True})
        if not created and not pref.is_active:
            pref.is_active = True
            pref.save(update_fields=['is_active', 'updated_at'])
    for pref in UserClassPreference.objects.filter(user_id=plan.user_id, schedule_id__in=before - now_ids):
        pref.soft_delete()
    if now_ids - before and plan.status == 'active':
        def _reserve(uid=plan.user_id):
            try:
                from api.tasks import auto_reserve_for_user_now
                auto_reserve_for_user_now.delay(uid)
            except Exception:
                logger.warning("studio_plan.auto_reserve_enqueue_failed user=%s", uid, exc_info=True)
        transaction.on_commit(_reserve)


class StudioPlanViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminUser]

    # ── Lista / alta / ficha ──────────────────────────────────────────────

    def list(self, request):
        qs = StudioPlan.objects.select_related('user').prefetch_related('fixed_schedules__class_type')
        q = request.query_params
        if q.get('user'):
            qs = qs.filter(user_id=q.get('user'))
        status_ = q.get('status')
        if status_ == 'open':
            qs = qs.filter(status__in=['active', 'paused'])
        elif status_ in dict(StudioPlan.STATUS):
            qs = qs.filter(status=status_)
        t = sp.today()
        if q.get('due') in ('1', 'true'):
            qs = qs.filter(status='active', next_due_date__lte=t + timedelta(days=sp.RENEW_WINDOW_DAYS))
        plans = list(qs.order_by('status', 'next_due_date', 'id')[:500])
        bal = sp.balances_of([p.user_id for p in plans])
        return Response([sp.plan_json(p, bal.get(p.user_id, Decimal(0)), t) for p in plans])

    def create(self, request):
        data = request.data
        user = User.objects.filter(pk=data.get('user'), is_staff=False).first() if str(
            data.get('user') or '').isdigit() else None
        if user is None:
            return _bad('Elige un cliente.', 'bad_user', field='user')
        start = str(data.get('start') or 'paid')
        if start not in ('paid', 'later', 'none'):
            return _bad("start debe ser 'paid', 'later' o 'none'.")
        try:
            fields, fixed = _clean(data)
            start_date = sp.today()
            if data.get('start_date'):
                try:
                    start_date = date.fromisoformat(str(data.get('start_date'))[:10])
                except ValueError:
                    return _bad('Fecha de inicio no válida.', field='start_date')
                if abs((start_date - sp.today()).days) > 62:
                    return _bad('La fecha de inicio tiene que estar cerca de hoy (dos meses como mucho).',
                                field='start_date')
            with transaction.atomic():
                try:
                    plan = StudioPlan.objects.create(
                        user=user, currency=studio_currency(), next_due_date=start_date, status='active',
                        created_by=request.user, **fields,
                    )
                except IntegrityError:
                    return Response({'error': f'{user.first_name or "Este cliente"} ya tiene un plan del estudio. '
                                              'Renuévalo o termínalo antes de crear otro.',
                                     'code': 'already_open'}, status=409)
            renewal = None
            if start != 'none':
                renewal = sp.renew(plan.id, charge=start, method=data.get('method'), admin=request.user)
            if fixed:
                # Después del primer mes: la auto-reserva ya encuentra sus créditos
                with transaction.atomic():
                    _sync_fixed(plan, fixed)
        except sp.StudioPlanError as e:
            return _err(e)
        plan.refresh_from_db()
        logger.info("studio_plan.create plan=%s user=%s start=%s admin=%s", plan.id, user.id, start, request.user.id)
        return Response({'plan': sp.plan_json(plan, with_preview=True),
                         'renewal': sp.renewal_json(renewal) if renewal else None}, status=201)

    def _get(self, pk):
        return (StudioPlan.objects.select_related('user').prefetch_related('fixed_schedules__class_type')
                .filter(pk=pk).first())

    def retrieve(self, request, pk=None):
        plan = self._get(pk)
        if plan is None:
            return Response({'error': 'No encontramos ese plan.', 'code': 'not_found'}, status=404)
        out = sp.plan_json(plan, with_preview=True)
        out['renewals'] = [sp.renewal_json(r) for r in plan.renewals.select_related('created_by')[:24]]
        return Response(out)

    def partial_update(self, request, pk=None):
        plan = self._get(pk)
        if plan is None:
            return Response({'error': 'No encontramos ese plan.', 'code': 'not_found'}, status=404)
        if plan.status == 'ended':
            return Response({'error': 'Este plan ya está terminado.', 'code': 'ended'}, status=409)
        try:
            fields, fixed = _clean(request.data, plan)
        except sp.StudioPlanError as e:
            return _err(e)
        if 'cycle_day' in fields and fields['cycle_day'] != plan.cycle_day:
            last = plan.renewals.order_by('-period_start').first()
            if last is not None:
                fields['next_due_date'] = sp.next_cycle_date(last.period_start, fields['cycle_day'])
        for k, v in fields.items():
            setattr(plan, k, v)
        plan.save()
        if fixed is not None:
            with transaction.atomic():
                _sync_fixed(plan, fixed)
        logger.info("studio_plan.update plan=%s fields=%s admin=%s", plan.id, sorted(fields), request.user.id)
        return Response(sp.plan_json(self._get(pk), with_preview=True))

    # ── Corte y estado ───────────────────────────────────────────────────

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        plan = self._get(pk)
        if plan is None:
            return Response({'error': 'No encontramos ese plan.', 'code': 'not_found'}, status=404)
        return Response(sp.cutoff_json(sp.compute_cutoff(plan)))

    @action(detail=True, methods=['post'])
    def renew(self, request, pk=None):
        try:
            r = sp.renew(pk, charge=request.data.get('charge') or 'paid', method=request.data.get('method'),
                         period_start=request.data.get('period_start'), admin=request.user)
        except sp.StudioPlanError as e:
            return _err(e)
        plan = self._get(pk)
        name = (plan.user.first_name or '').split(' ')[0] or 'el cliente'
        done = (f"Renovado: {name} empieza con {sp.num(r.balance_after)} clases"
                + (f" · cobrado {sp.num(r.amount)} {r.currency}" if r.paid_at else ' · cobro pendiente'))
        return Response({'done': done, 'renewal': sp.renewal_json(r), 'plan': sp.plan_json(plan, with_preview=True)})

    def _status(self, request, pk, what):
        try:
            sp.set_status(pk, what, admin=request.user)
        except sp.StudioPlanError as e:
            return _err(e)
        return Response(sp.plan_json(self._get(pk), with_preview=True))

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        return self._status(request, pk, 'pause')

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        return self._status(request, pk, 'resume')

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        return self._status(request, pk, 'end')

    @action(detail=False, methods=['post'], url_path=r'renewals/(?P<renewal_id>\d+)/pay')
    def pay_renewal(self, request, renewal_id=None):
        try:
            r = sp.pay_renewal(renewal_id, method=request.data.get('method'), admin=request.user)
        except sp.StudioPlanError as e:
            return _err(e)
        return Response({'done': f"Cobrado: {sp.num(r.amount)} {r.currency}", 'renewal': sp.renewal_json(r)})

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        return Response(sp.today_card())

    # ── Atajos de «Créditos» ─────────────────────────────────────────────

    @action(detail=False, methods=['get'])
    def shortcuts(self, request):
        """Clientes tocados hace poco (movimientos de créditos o recién dados de
        alta) y los que se están quedando sin clases, para elegir de un toque."""
        from api.utils.dashboard import user_name
        now = timezone.now()
        since = now - timedelta(days=60)
        last = dict(CreditLedgerEntry.objects.filter(created_at__gte=since, wallet__user__is_staff=False)
                    .values('wallet__user_id').annotate(at=Max('created_at'))
                    .values_list('wallet__user_id', 'at'))
        for uid, joined in User.objects.filter(date_joined__gte=since, is_staff=False, is_superuser=False,
                                               is_active=True).values_list('id', 'date_joined'):
            if uid not in last or joined > last[uid]:
                last[uid] = joined
        ids = sorted(last, key=lambda u: last[u], reverse=True)[:40]
        plan_users = dict(StudioPlan.objects.filter(status__in=['active', 'paused'])
                          .values_list('user_id', 'id'))
        ids = list(dict.fromkeys(ids + list(plan_users)))
        bal = sp.balances_of(ids)
        users = {u.id: u for u in User.objects.filter(id__in=ids, is_active=True)}
        plans = {p.user_id: p for p in StudioPlan.objects.filter(status__in=['active', 'paused'], user_id__in=ids)}
        t = sp.today()
        rows = []
        for uid in ids:
            u = users.get(uid)
            if u is None:
                continue
            b = bal.get(uid, Decimal(0))
            p = plans.get(uid)
            rows.append({
                'id': uid, 'name': user_name(u), 'first_name': u.first_name or '', 'last_name': u.last_name or '',
                'phone': u.phone or '', 'email': u.email or '', 'balance': sp.num(b),
                'last_at': last[uid].isoformat() if uid in last else None,
                'low': b <= 1 and (uid in last or p is not None),
                'plan': ({'id': p.id, 'status': p.status, 'next_due_date': p.next_due_date.isoformat()
                          if p.next_due_date else None, 'overdue': bool(p.next_due_date and p.next_due_date < t
                                                                        and p.status == 'active')}
                         if p else None),
            })
        recent = [r for r in rows if r['last_at']][:8]
        low = sorted([r for r in rows if r['low']], key=lambda r: (r['balance'], r['name']))[:6]
        return Response({'recent': recent, 'low': low})

    @action(detail=False, methods=['post'], url_path='credit-sale')
    def credit_sale(self, request):
        """Clases sueltas con créditos: añade créditos y, si te ha pagado,
        apunta el cobro (sale en Ventas → «Lo cobrado»)."""
        data = request.data
        user = User.objects.filter(pk=data.get('user'), is_staff=False).first() if str(
            data.get('user') or '').isdigit() else None
        if user is None:
            return _bad('Elige un cliente.', 'bad_user', field='user')
        try:
            credits = _int(data.get('credits'), 1, 200, 'credits', 'Clases')
            amount = _money(data.get('amount'), 'amount')
            method = str(data.get('method') or 'cash').lower()
            if amount > 0 and method not in dict(StudioPlan.METHODS):
                raise sp.StudioPlanError('bad_method', 'Elige cómo te ha pagado.', field='method')
            days = data.get('expires_days')
            expires = None
            if data.get('expires_at'):
                from django.utils.dateparse import parse_datetime
                expires = parse_datetime(str(data.get('expires_at')))
                if expires is None or expires <= timezone.now():
                    raise sp.StudioPlanError('bad_expires_at', 'La fecha de caducidad tiene que ser futura.',
                                             field='expires_at')
            elif days not in (None, '', 0, '0'):
                expires = timezone.now() + timedelta(days=_int(days, 1, 730, 'expires_days', 'Caducan en'))
        except sp.StudioPlanError as e:
            return _err(e)
        reason = str(data.get('reason') or '').strip()[:120] or 'Clases sueltas en el estudio'
        with transaction.atomic():
            wallet, _ = CreditWallet.objects.get_or_create(user=user)
            payment = None
            if amount > 0:
                payment = Payment.objects.create(
                    user=user, amount_eur=amount, currency=studio_currency(), method=method, status='succeeded',
                    raw_response={'source': 'pay_at_studio', 'studio_credits': credits, 'by_admin': request.user.id},
                )
            meta = {'source': 'studio_credits', 'by_admin': request.user.id}
            if payment:
                meta['payment_id'] = payment.id
            entry = CreditLedgerEntry.objects.create(wallet=wallet, kind='grant', amount=credits, reference=reason,
                                                     expires_at=expires, metadata=meta)
        logger.info("studio_credits.sale user=%s credits=%s amount=%s method=%s admin=%s", user.id, credits,
                    amount, method if payment else '', request.user.id)
        return Response({'entry_id': entry.id, 'payment_id': payment.id if payment else None,
                         'balance': sp.num(sp.wallet_balance(wallet)),
                         'expires_at': expires.isoformat() if expires else None}, status=201)
