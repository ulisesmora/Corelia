"""Clientes del estudio: plan mensual cobrado en el estudio (api/utils/studio_plans.py,
api/views_studio_plans.py) y su integración con Hoy y Ventas."""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    CreditLedgerEntry, CreditWallet, Payment, StudioPlan, StudioPlanRenewal, UserClassPreference,
)
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio
from api.utils import studio_plans as sp
from api.utils.dashboard import local_today

BASE = '/api/v1/studio-plans/'


def balance(user):
    w = CreditWallet.objects.filter(user=user).first()
    return sp.wallet_balance(w)


class Base(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.today = local_today()
        self.sched = make_studio(weekday=(self.today + timedelta(days=1)).weekday(), start=time(10, 0),
                                 end=time(10, 55))
        self.admin = make_admin()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.ana = make_client(email='ana@test.local', credits=0)

    def create(self, **kw):
        body = {'user': self.ana.id, 'credits_per_month': 8, 'price': '60', 'payment_method': 'cash',
                'cycle_day': 1, 'carry_over': 'lose', 'start': 'paid', 'method': 'cash'}
        body.update(kw)
        r = self.api.post(BASE, body, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return StudioPlan.objects.get(pk=r.json()['plan']['id']), r.json()

    def spend(self, user, n):
        w, _ = CreditWallet.objects.get_or_create(user=user)
        CreditLedgerEntry.objects.create(wallet=w, kind='spend', amount=-n, reference='Reserva de clases')

    def make_due(self, plan, days_ago=0):
        """Como si hubiera pasado un mes: el alta queda atrás y el corte vence hoy (o hace `days_ago`)."""
        for r in StudioPlanRenewal.objects.filter(plan=plan):
            r.period_start -= timedelta(days=40 + days_ago)
            r.period_end -= timedelta(days=40 + days_ago)
            r.save(update_fields=['period_start', 'period_end'])
        StudioPlan.objects.filter(pk=plan.pk).update(next_due_date=self.today - timedelta(days=days_ago))
        plan.refresh_from_db()
        return plan


class CycleDateTests(StudioTestCase):
    def test_next_cycle_date(self):
        self.assertEqual(sp.next_cycle_date(date(2026, 10, 16), 1), date(2026, 11, 1))
        self.assertEqual(sp.next_cycle_date(date(2026, 10, 1), 1), date(2026, 11, 1))
        self.assertEqual(sp.next_cycle_date(date(2026, 10, 16), 20), date(2026, 10, 20))
        self.assertEqual(sp.next_cycle_date(date(2026, 12, 5), 5), date(2027, 1, 5))
        self.assertEqual(sp.next_cycle_date(date(2026, 1, 31), 28), date(2026, 2, 28))


class CreateTests(Base):
    def test_create_paid_grants_credits_and_payment(self):
        plan, data = self.create()
        self.assertEqual(balance(self.ana), 8)
        self.assertEqual(plan.credits_pool, 8)
        self.assertEqual(plan.started_on, self.today)
        self.assertEqual(plan.next_due_date, sp.next_cycle_date(self.today, 1))
        r = StudioPlanRenewal.objects.get(plan=plan)
        self.assertIsNotNone(r.paid_at)
        p = Payment.objects.get(pk=r.payment_id)
        self.assertEqual((p.status, p.method, p.amount_eur, p.user_id), ('succeeded', 'cash', Decimal('60.00'), self.ana.id))
        self.assertEqual(data['renewal']['added'], 8)
        # La clase del plan no tiene caducidad propia: caduca en el corte
        grant = CreditLedgerEntry.objects.get(wallet__user=self.ana, kind='grant')
        self.assertIsNone(grant.expires_at)
        self.assertEqual(grant.metadata['studio_plan_id'], plan.id)

    def test_create_later_leaves_it_owed(self):
        plan, _ = self.create(start='later')
        r = StudioPlanRenewal.objects.get(plan=plan)
        self.assertIsNone(r.paid_at)
        self.assertFalse(Payment.objects.exists())
        self.assertEqual(balance(self.ana), 8)

    def test_create_none_does_not_renew(self):
        plan, _ = self.create(start='none')
        self.assertFalse(StudioPlanRenewal.objects.exists())
        self.assertEqual(plan.next_due_date, self.today)
        self.assertEqual(balance(self.ana), 0)

    def test_one_open_plan_per_client(self):
        self.create()
        r = self.api.post(BASE, {'user': self.ana.id, 'credits_per_month': 4, 'price': 30}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'already_open')

    def test_validation(self):
        for body, field in [
            ({'credits_per_month': 0}, 'credits_per_month'), ({'cycle_day': 31}, 'cycle_day'),
            ({'carry_over': 'cap'}, 'carry_over_cap'), ({'price': 'abc'}, 'price'),
            ({'payment_method': 'stripe'}, 'payment_method'),
        ]:
            payload = {'user': self.ana.id, 'credits_per_month': 8, 'price': 60, **body}
            r = self.api.post(BASE, payload, format='json')
            self.assertEqual(r.status_code, 400, (body, r.content))
            self.assertEqual(r.json().get('field'), field)
        self.assertEqual(self.api.post(BASE, {'user': self.admin.id, 'credits_per_month': 8, 'price': 1},
                                       format='json').status_code, 400)

    def test_fixed_class_linked(self):
        plan, data = self.create(fixed_schedule_ids=[self.sched.id])
        self.assertEqual(list(plan.fixed_schedules.values_list('id', flat=True)), [self.sched.id])
        self.assertEqual(data['plan']['fixed_schedules'][0]['title'], 'Mat')


class FixedClassTests(Base):
    def test_patch_fixed_classes_syncs_preferences_and_books_now(self):
        plan, _ = self.create()
        with patch('api.tasks.auto_reserve_for_user_now.delay') as delay, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.api.patch(f'{BASE}{plan.id}/', {'fixed_schedule_ids': [self.sched.id]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        delay.assert_called_once_with(self.ana.id)
        self.assertTrue(UserClassPreference.objects.filter(user=self.ana, schedule=self.sched).exists())
        r = self.api.patch(f'{BASE}{plan.id}/', {'fixed_schedule_ids': []}, format='json')
        self.assertEqual(r.json()['fixed_schedules'], [])
        self.assertFalse(UserClassPreference.objects.filter(user=self.ana, schedule=self.sched).exists())


class CutoffTests(Base):
    """Le quedan 2 de 8 al cortar."""

    def cut(self, carry, cap=None):
        plan, _ = self.create(carry_over=carry, carry_over_cap=cap)
        self.spend(self.ana, 6)
        self.make_due(plan)
        r = sp.renew(plan.id, charge='paid', method='bizum', admin=self.admin)
        plan.refresh_from_db()
        return plan, r

    def test_lose(self):
        plan, r = self.cut('lose')
        self.assertEqual((r.leftover, r.expired, r.kept, r.added), (2, 2, 0, 8))
        self.assertEqual(balance(self.ana), 8)
        self.assertEqual(plan.credits_pool, 8)
        exp = CreditLedgerEntry.objects.get(kind='expire')
        self.assertEqual(exp.amount, -2)
        self.assertEqual(exp.reference, f'STUDIO-CUT-{r.id}')

    def test_keep(self):
        plan, r = self.cut('keep')
        self.assertEqual((r.leftover, r.expired, r.kept), (2, 0, 2))
        self.assertEqual(balance(self.ana), 10)
        self.assertEqual(plan.credits_pool, 10)
        self.assertFalse(CreditLedgerEntry.objects.filter(kind='expire').exists())

    def test_cap(self):
        plan, r = self.cut('cap', cap=1)
        self.assertEqual((r.leftover, r.expired, r.kept), (2, 1, 1))
        self.assertEqual(balance(self.ana), 9)
        self.assertEqual(plan.credits_pool, 9)

    def test_keep_accumulates_over_months(self):
        plan, _ = self.create(carry_over='keep')
        self.make_due(plan)
        sp.renew(plan.id, charge='paid')  # no gasta nada: 8 + 8
        plan.refresh_from_db()
        self.assertEqual(plan.credits_pool, 16)
        self.assertEqual(balance(self.ana), 16)

    def test_other_packs_are_not_touched(self):
        """Un bono aparte (caduca más tarde) no se pierde en el corte: se gastan antes las del plan."""
        plan, _ = self.create(carry_over='lose')
        w = CreditWallet.objects.get(user=self.ana)
        CreditLedgerEntry.objects.create(wallet=w, kind='grant', amount=5, reference='Bono 5',
                                         expires_at=timezone.now() + timedelta(days=60))
        self.spend(self.ana, 3)  # 8 + 5 − 3 = 10 → del plan quedan 5
        self.make_due(plan)
        r = sp.renew(plan.id, charge='paid')
        self.assertEqual((r.leftover, r.expired), (5, 5))
        self.assertEqual(balance(self.ana), 13)  # 5 del bono + 8 nuevas

    def test_all_spent_nothing_expires(self):
        plan, _ = self.create()
        self.spend(self.ana, 8)
        self.make_due(plan)
        r = sp.renew(plan.id, charge='paid')
        self.assertEqual((r.leftover, r.expired), (0, 0))
        self.assertEqual(balance(self.ana), 8)

    def test_preview_matches(self):
        plan, _ = self.create(carry_over='keep')
        self.spend(self.ana, 6)
        r = self.api.get(f'{BASE}{plan.id}/preview/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {'balance_before': 2, 'leftover': 2, 'expired': 0, 'kept': 2, 'added': 8,
                                    'balance_after': 10, 'pool_after': 10})

    def test_nightly_expiry_respects_plan_credits(self):
        """La caducidad de bonos de cada noche no se come las clases del plan."""
        from api.tasks import process_wallet_expiration
        plan, _ = self.create()
        w = CreditWallet.objects.get(user=self.ana)
        CreditLedgerEntry.objects.create(wallet=w, kind='grant', amount=3, reference='Bono viejo',
                                         expires_at=timezone.now() - timedelta(days=1))
        self.spend(self.ana, 3)  # gastó el bono viejo; quedan las 8 del plan
        process_wallet_expiration(w, timezone.now())
        self.assertEqual(balance(self.ana), 8)


class DoubleRenewTests(Base):
    def test_second_renew_same_period_is_refused(self):
        plan, _ = self.create()
        self.make_due(plan)
        due = plan.next_due_date.isoformat()
        r1 = self.api.post(f'{BASE}{plan.id}/renew/', {'charge': 'paid', 'method': 'cash', 'period_start': due},
                           format='json')
        self.assertEqual(r1.status_code, 200, r1.content)
        r2 = self.api.post(f'{BASE}{plan.id}/renew/', {'charge': 'paid', 'method': 'cash', 'period_start': due},
                           format='json')
        self.assertEqual(r2.status_code, 409)
        self.assertEqual(r2.json()['code'], 'already_renewed')
        self.assertEqual(StudioPlanRenewal.objects.filter(plan=plan).count(), 2)  # alta + este mes
        self.assertEqual(Payment.objects.count(), 2)

    def test_not_due_yet(self):
        plan, _ = self.create()
        StudioPlan.objects.filter(pk=plan.pk).update(next_due_date=self.today + timedelta(days=20))
        r = self.api.post(f'{BASE}{plan.id}/renew/', {'charge': 'paid'}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'not_due')

    def test_unique_period_constraint(self):
        plan, _ = self.create()
        self.make_due(plan)
        StudioPlanRenewal.objects.create(plan=plan, period_start=plan.next_due_date,
                                         period_end=plan.next_due_date + timedelta(days=30))
        with self.assertRaises(sp.StudioPlanError) as ctx:
            sp.renew(plan.id, charge='paid')
        self.assertEqual(ctx.exception.code, 'already_renewed')

    def test_paused_cannot_renew_and_resume(self):
        plan, _ = self.create()
        self.make_due(plan, days_ago=40)
        self.assertEqual(self.api.post(f'{BASE}{plan.id}/pause/').status_code, 200)
        r = self.api.post(f'{BASE}{plan.id}/renew/', {'charge': 'paid'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'not_active'))
        r = self.api.post(f'{BASE}{plan.id}/resume/')
        self.assertEqual(r.json()['next_due_date'], self.today.isoformat())

    def test_end_removes_fixed_classes(self):
        plan, _ = self.create(fixed_schedule_ids=[self.sched.id])
        self.assertTrue(UserClassPreference.objects.filter(user=self.ana, schedule=self.sched).exists())
        self.assertEqual(self.api.post(f'{BASE}{plan.id}/end/').status_code, 200)
        self.assertFalse(UserClassPreference.objects.filter(user=self.ana).exists())
        # Terminado: ya puede tener otro
        self.create()


class PermissionTests(Base):
    def test_only_admins(self):
        plan, _ = self.create()
        anon = APIClient()
        client = APIClient()
        client.force_authenticate(self.ana)
        urls = [('get', BASE), ('post', BASE), ('get', f'{BASE}{plan.id}/'), ('patch', f'{BASE}{plan.id}/'),
                ('post', f'{BASE}{plan.id}/renew/'), ('post', f'{BASE}{plan.id}/pause/'),
                ('get', f'{BASE}upcoming/'), ('get', f'{BASE}shortcuts/'), ('post', f'{BASE}credit-sale/'),
                ('post', f'{BASE}renewals/1/pay/')]
        for method, url in urls:
            self.assertIn(getattr(anon, method)(url, {}, format='json').status_code, (401, 403), url)
            self.assertEqual(getattr(client, method)(url, {}, format='json').status_code, 403, url)


class VentasAndHoyTests(Base):
    def test_paid_renewal_in_collected(self):
        self.create()
        data = self.api.get('/api/v1/dashboard/sales/?period=month').json()
        row = next(r for r in data['collected'] if r['name'].startswith('Carla'))
        self.assertEqual(row['kind'], 'memberships')
        self.assertIn('Plan del estudio', row['concept'])
        self.assertEqual(row['method'], 'Efectivo')
        self.assertEqual(row['amount'], 60.0)
        self.assertEqual(data['kpis']['revenue'], 60.0)

    def test_later_in_owed_then_paid(self):
        plan, _ = self.create(start='later')
        data = self.api.get('/api/v1/dashboard/sales/?period=month').json()
        owed = next(o for o in data['owed'] if o['kind'] == 'studio_plan')
        self.assertEqual((owed['amount'], owed['status_label']), (60.0, 'Sin cobrar'))
        self.assertEqual(data['kpis']['pending_studio'], 1)
        r = self.api.post('/api/v1/dashboard/actions/', {'kind': 'studio_plan_paid', 'renewal_id': owed['renewal_id'],
                                                          'method': 'bizum'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = self.api.get('/api/v1/dashboard/sales/?period=month').json()
        self.assertFalse([o for o in data['owed'] if o['kind'] == 'studio_plan'])
        self.assertEqual(data['collected'][0]['method'], 'Bizum')
        r = self.api.post('/api/v1/dashboard/actions/', {'kind': 'studio_plan_paid', 'renewal_id': owed['renewal_id'],
                                                          'method': 'cash'}, format='json')
        self.assertEqual(r.status_code, 409)

    def test_no_email_to_client(self):
        with patch('api.signals.send_templated_email') as send:
            self.create()
        self.assertFalse(send.called)

    def test_today_card_and_one_click_renew(self):
        plan, _ = self.create()
        self.spend(self.ana, 6)
        self.make_due(plan, days_ago=1)
        data = self.api.get('/api/v1/dashboard/today/').json()
        card = data['renewals']
        self.assertEqual((len(card['items']), card['overdue'], card['this_week']), (1, 1, 1))
        it = card['items'][0]
        self.assertTrue(it['can_renew'])
        self.assertEqual(it['preview']['balance_after'], 8)
        r = self.api.post('/api/v1/dashboard/actions/', {'kind': 'studio_plan_renew', 'plan_id': plan.id,
                                                          'charge': 'paid', 'method': 'card',
                                                          'period_start': it['next_due_date']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('empieza con 8 clases', r.json()['done'])
        self.assertEqual(balance(self.ana), 8)
        again = self.api.post('/api/v1/dashboard/actions/', {'kind': 'studio_plan_renew', 'plan_id': plan.id,
                                                              'charge': 'paid', 'method': 'card',
                                                              'period_start': it['next_due_date']}, format='json')
        self.assertEqual(again.status_code, 409)
        data = self.api.get('/api/v1/dashboard/today/').json()
        self.assertFalse([i for i in data['renewals']['items'] if i['can_renew']])

    def test_today_without_plans(self):
        data = self.api.get('/api/v1/dashboard/today/').json()
        self.assertEqual(data['renewals']['items'], [])


class DailyTaskTests(Base):
    def test_marks_due_and_reminder_is_opt_in(self):
        plan, _ = self.create()
        self.make_due(plan)
        with patch('api.utils.emailing.send_templated_email', return_value=True) as send:
            out = sp.daily()
        self.assertEqual(out['marked'], 1)
        self.assertFalse(send.called)
        plan.refresh_from_db()
        self.assertEqual(plan.due_marked_for, self.today)
        # Aviso solo si el estudio lo enciende
        StudioPlan.objects.filter(pk=plan.pk).update(remind_client=True, next_due_date=self.today + timedelta(days=2))
        with patch('api.utils.emailing.send_templated_email', return_value=True) as send:
            self.assertEqual(sp.daily()['reminded'], 1)
            self.assertEqual(sp.daily()['reminded'], 0)  # una vez por ciclo
        self.assertEqual(send.call_count, 1)

    def test_auto_reserve_includes_studio_plan_clients(self):
        from api.models import Booking
        from api.tasks import _run_auto_reserve
        with self.captureOnCommitCallbacks(execute=False):
            self.create(fixed_schedule_ids=[self.sched.id])
        start = self.today + timedelta(days=1)
        _run_auto_reserve(start, start + timedelta(days=6), filter_user_id=self.ana.id)
        self.assertTrue(Booking.objects.filter(user=self.ana, occurrence=self.sched).exists())
        self.assertEqual(balance(self.ana), 7)


class ShortcutsAndCreditSaleTests(Base):
    def test_credit_sale_records_payment(self):
        r = self.api.post(f'{BASE}credit-sale/', {'user': self.ana.id, 'credits': 5, 'expires_days': 30,
                                                   'amount': '45', 'method': 'bizum'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['balance'], 5)
        data = self.api.get('/api/v1/dashboard/sales/?period=month').json()
        row = data['collected'][0]
        self.assertEqual((row['kind'], row['concept'], row['method'], row['amount']),
                         ('packs', '5 clases en el estudio', 'Bizum', 45.0))

    def test_credit_sale_without_money(self):
        r = self.api.post(f'{BASE}credit-sale/', {'user': self.ana.id, 'credits': 2}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertFalse(Payment.objects.exists())
        self.assertIsNone(r.json()['expires_at'])

    def test_shortcuts_recent_and_low(self):
        bea = make_client(email='bea@test.local', credits=1)
        self.create()
        data = self.api.get(f'{BASE}shortcuts/').json()
        ids = [r['id'] for r in data['recent']]
        self.assertIn(self.ana.id, ids)
        self.assertIn(bea.id, ids)
        self.assertEqual([r['id'] for r in data['low']], [bea.id])
        ana = next(r for r in data['recent'] if r['id'] == self.ana.id)
        self.assertEqual((ana['balance'], ana['plan']['id'] is not None), (8, True))
        self.assertNotIn(self.admin.id, ids)


class CommandTests(Base):
    def test_advance_days_only_in_debug_and_makes_it_due(self):
        from io import StringIO

        from django.core.management import CommandError, call_command
        from django.test import override_settings
        plan, _ = self.create()
        with self.assertRaises(CommandError):
            call_command('studio_plans_daily', '--advance-days', '40', stdout=StringIO())
        with override_settings(DEBUG=True):
            call_command('studio_plans_daily', '--advance-days', '40', stdout=StringIO())
        plan.refresh_from_db()
        self.assertTrue(plan.next_due_date <= self.today)
        self.assertEqual(plan.due_marked_for, self.today)
        r = sp.renew(plan.id, charge='paid')
        self.assertEqual(r.added, 8)
