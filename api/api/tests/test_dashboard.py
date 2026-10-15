"""Resúmenes del panel: Hoy, Ventas, Mi web y Ajustes (api/views_dashboard.py)."""
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Booking, CreditLedgerEntry, CreditWallet, FAQItem, Payment, Plan, SiteConfig, Subscription, WaitlistEntry,
)
from api.tests.factories import StudioTestCase, madrid, make_admin, make_client, make_studio
from api.utils.dashboard import local_today, period_bounds

ENDPOINTS = [
    ('get', '/api/v1/dashboard/today/'), ('get', '/api/v1/dashboard/day/'), ('post', '/api/v1/dashboard/actions/'),
    ('get', '/api/v1/dashboard/sales/'), ('get', '/api/v1/dashboard/sales/export/'),
    ('get', '/api/v1/dashboard/web/'), ('post', '/api/v1/dashboard/web/sections/'),
    ('get', '/api/v1/dashboard/checklist/'),
]


class DashboardBase(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.today = local_today()
        self.tomorrow = self.today + timedelta(days=1)
        # Clase de mañana a las 10:00 (siempre en el futuro y en menos de 36 h)
        self.sched = make_studio(weekday=self.tomorrow.weekday(), start=time(10, 0), end=time(10, 55))
        self.admin = make_admin()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.carla = make_client()

    def book(self, user, day, status='reserved', payment=None):
        return Booking.objects.create(
            user=user, occurrence=self.sched, status=status, payment=payment,
            start_datetime=madrid(day, 10), end_datetime=madrid(day, 10, 55),
        )

    def pay(self, user, amount, status='succeeded', days_ago=0, **kw):
        p = Payment.objects.create(user=user, amount_eur=Decimal(amount), status=status, currency='EUR', **kw)
        if days_ago:
            Payment.objects.filter(pk=p.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
            p.refresh_from_db()
        return p

    def today_data(self):
        r = self.api.get('/api/v1/dashboard/today/')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def item(self, data, kind):
        return next((a for a in data['attention'] if a['kind'] == kind), None)


class PermissionTests(DashboardBase):
    def test_only_admins(self):
        anon = APIClient()
        client = APIClient()
        client.force_authenticate(self.carla)
        for c in (anon, client):
            for method, url in ENDPOINTS:
                r = getattr(c, method)(url, {}, format='json')
                self.assertIn(r.status_code, (401, 403), f"{method} {url}")


class TodayTests(DashboardBase):
    def test_fresh_studio(self):
        data = self.today_data()
        self.assertFalse(data['has_bookings'])
        self.assertEqual([k['key'] for k in data['kpis']],
                         ['bookings_week', 'revenue_month', 'active_clients', 'occupancy_week'])
        for k in data['kpis']:
            self.assertIsNone(k['delta'])
            self.assertTrue(k['hint'])
        kinds = {a['kind'] for a in data['attention']}
        self.assertIn('share', kinds)
        self.assertIn('tax_id', kinds)
        self.assertEqual(len(data['chart']), 14)
        self.assertEqual(len(data['extras']), 4)

    def test_kpis_with_data(self):
        last_week = self.tomorrow - timedelta(days=7)
        self.book(self.carla, self.tomorrow)
        self.book(make_client('b@test.local'), last_week, status='attended')
        self.pay(self.carla, 50)
        data = self.today_data()
        k = {x['key']: x for x in data['kpis']}
        monday = self.today - timedelta(days=self.today.weekday())
        expected_week = sum(1 for d in (self.tomorrow, last_week) if monday <= d <= monday + timedelta(days=6))
        self.assertEqual(k['bookings_week']['value'], expected_week)
        self.assertEqual(k['revenue_month']['value'], 50.0)
        self.assertIsNotNone(k['bookings_week']['spark'])
        self.assertEqual(len(k['bookings_week']['spark']), 7)
        self.assertNotIn('share', {a['kind'] for a in data['attention']})
        self.assertTrue(any('reservó' in f['text'] for f in data['feed']))

    def test_failed_payment_item_until_paid(self):
        p = self.pay(self.carla, 150, status='failed', days_ago=2)
        item = self.item(self.today_data(), 'payment')
        self.assertIsNotNone(item)
        self.assertIn('Carla', item['title'])
        self.assertEqual(item['action']['payload'], {'kind': 'resend_payment_link', 'payment_id': p.id})
        self.pay(self.carla, 150)  # vuelve a pagar: ya no se debe nada
        self.assertIsNone(self.item(self.today_data(), 'payment'))

    def test_resend_link_needs_emails(self):
        p = self.pay(self.carla, 150, status='failed')
        r = self.api.post('/api/v1/dashboard/actions/', {'kind': 'resend_payment_link', 'payment_id': p.id},
                          format='json')
        self.assertEqual(r.status_code, 409)
        with patch('api.utils.emailing.send_templated_email', return_value=True) as send:
            r = self.api.post('/api/v1/dashboard/actions/', {'kind': 'resend_payment_link', 'payment_id': p.id},
                              format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('Carla', r.json()['done'])
        self.assertEqual(send.call_args.kwargs['to_email'], self.carla.email)

    def test_past_due_subscription_is_owed(self):
        plan = Plan.objects.create(name='Mensual', type='sub', credits=8, price_eur=Decimal('90'))
        now = timezone.now()
        sub = Subscription.objects.create(user=self.carla, plan=plan, status='past_due',
                                          current_period_start=now, current_period_end=now + timedelta(days=30))
        item = self.item(self.today_data(), 'payment')
        self.assertEqual(item['action']['payload'], {'kind': 'resend_payment_link', 'subscription_id': sub.id})
        sales = self.api.get('/api/v1/dashboard/sales/').json()
        self.assertEqual(sales['kpis']['pending'], 90.0)
        self.assertEqual(sales['owed'][0]['status'], 'past_due')

    def test_waitlist_free_spot_and_give_it(self):
        lucia = make_client('lucia@test.local')
        WaitlistEntry.objects.create(schedule=self.sched, start_datetime=madrid(self.tomorrow, 10), user=lucia)
        item = self.item(self.today_data(), 'waitlist')
        self.assertIsNotNone(item)
        self.assertIn('Plaza libre en Mat 10:00', item['title'])
        r = self.api.post('/api/v1/dashboard/actions/', item['action']['payload'], format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(Booking.objects.filter(user=lucia, occurrence=self.sched, status='reserved').exists())
        self.assertEqual(WaitlistEntry.objects.get(user=lucia).status, 'claimed')
        self.assertIsNone(self.item(self.today_data(), 'waitlist'))

    def test_expiring_pack_extend_and_undo(self):
        wallet = CreditWallet.objects.get(user=self.carla)
        CreditLedgerEntry.objects.filter(wallet=wallet).delete()
        exp = timezone.now() + timedelta(days=3)
        grant = CreditLedgerEntry.objects.create(wallet=wallet, kind='grant', amount=5, expires_at=exp)
        CreditLedgerEntry.objects.create(wallet=wallet, kind='spend', amount=-2)
        item = self.item(self.today_data(), 'expiring')
        self.assertIsNotNone(item)
        self.assertIn('3 clases', item['subtitle'])
        r = self.api.post('/api/v1/dashboard/actions/', item['action']['payload'], format='json')
        self.assertEqual(r.status_code, 200, r.content)
        grant.refresh_from_db()
        self.assertEqual(grant.expires_at, exp + timedelta(days=7))
        self.assertIsNone(self.item(self.today_data(), 'expiring'))  # ya no caduca esta semana
        r = self.api.post('/api/v1/dashboard/actions/', r.json()['undo'], format='json')
        self.assertEqual(r.status_code, 200)
        grant.refresh_from_db()
        self.assertEqual(grant.expires_at, exp)

    def test_covered_pack_is_not_flagged(self):
        wallet = CreditWallet.objects.get(user=self.carla)
        CreditLedgerEntry.objects.filter(wallet=wallet).delete()
        CreditLedgerEntry.objects.create(wallet=wallet, kind='grant', amount=5,
                                         expires_at=timezone.now() + timedelta(days=3))
        CreditLedgerEntry.objects.create(wallet=wallet, kind='spend', amount=-5)
        self.assertIsNone(self.item(self.today_data(), 'expiring'))

    def test_near_empty_class_and_notify(self):
        fan = make_client('fan@test.local')
        self.book(fan, self.tomorrow - timedelta(days=7), status='attended')
        item = self.item(self.today_data(), 'near_empty')
        self.assertIsNotNone(item)
        self.assertEqual(item['subtitle'], '0 de 8 plazas')
        with patch('api.utils.emailing.send_templated_email', return_value=True) as send:
            r = self.api.post('/api/v1/dashboard/actions/', item['action']['payload'], format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['people'], 1)
        self.assertEqual(send.call_args.kwargs['to_email'], fan.email)

    def test_unknown_action(self):
        r = self.api.post('/api/v1/dashboard/actions/', {'kind': 'nope'}, format='json')
        self.assertEqual(r.status_code, 400)


class DayTimelineTests(DashboardBase):
    def test_sessions_with_people(self):
        self.book(self.carla, self.tomorrow)
        r = self.api.get('/api/v1/dashboard/day/', {'date': self.tomorrow.isoformat()})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data['sessions']), 1)
        s = data['sessions'][0]
        self.assertEqual((s['title'], s['start'], s['booked'], s['capacity']), ('Mat', '10:00', 1, 8))
        self.assertEqual(s['people'][0]['initials'], 'CA')
        self.assertFalse(data['is_today'])


class SalesTests(DashboardBase):
    def test_summary_and_comparison(self):
        start, end, ps, pe, _ = period_bounds('month', self.today)
        self.pay(self.carla, 100)
        days_back = (self.today - pe).days
        self.pay(self.carla, 50, days_ago=days_back)
        plan = Plan.objects.create(name='Bono 10', type='pack', credits=10, price_eur=Decimal('120'))
        p = self.pay(self.carla, 120)
        wallet = CreditWallet.objects.get(user=self.carla)
        CreditLedgerEntry.objects.create(wallet=wallet, kind='grant', amount=10,
                                         metadata={'payment_id': p.id, 'plan_id': plan.id})
        data = self.api.get('/api/v1/dashboard/sales/', {'period': 'month'}).json()
        self.assertEqual(data['kpis']['revenue'], 220.0)
        self.assertEqual(data['kpis']['revenue_prev'], 50.0)
        self.assertEqual(data['kpis']['revenue_change_pct'], 340)
        self.assertEqual(data['kpis']['packs_sold'], 1)
        concepts = {r['concept'] for r in data['collected']}
        self.assertIn('Bono 10', concepts)
        bono = next(x for x in data['plans'] if x['name'] == 'Bono 10')
        self.assertEqual((bono['sold'], bono['revenue']), (1, 120.0))
        self.assertTrue(data['chart'])
        for period in ('week', 'quarter', 'year'):
            r = self.api.get('/api/v1/dashboard/sales/', {'period': period})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()['period'], period)

    def test_csv_export(self):
        self.pay(self.carla, Decimal('12.50'))
        SiteConfig.objects.filter(pk=1).update(tax_id='B12345678')
        r = self.api.get('/api/v1/dashboard/sales/export/', {'period': 'month'})
        self.assertEqual(r.status_code, 200)
        self.assertIn('attachment;', r['Content-Disposition'])
        body = r.content.decode('utf-8')
        self.assertTrue(body.startswith('﻿'))
        self.assertIn('B12345678', body)
        self.assertIn('Carla;clienta@test.local', body)
        self.assertIn('12,50;EUR;Cobrado', body)


class WebAndSettingsTests(DashboardBase):
    def test_web_summary_and_toggle(self):
        a = FAQItem.objects.create(question='¿Hay que llevar esterilla?', answer='No')
        b = FAQItem.objects.create(question='¿Puedo cancelar?', answer='Sí', is_active=False)
        data = self.api.get('/api/v1/dashboard/web/').json()
        faqs = next(s for s in data['sections'] if s['key'] == 'faqs')
        self.assertEqual((faqs['visible'], faqs['enabled'], faqs['toggle'], faqs['count']), (True, True, True, 1))
        r = self.api.post('/api/v1/dashboard/web/sections/', {'section': 'faqs', 'visible': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()['enabled'])
        self.assertEqual(SiteConfig.load().web_sections, {'faqs': False})
        # El contenido no se toca: se apaga la sección entera
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual((a.is_active, b.is_active), (True, False))
        faqs = next(s for s in self.api.get('/api/v1/dashboard/web/').json()['sections'] if s['key'] == 'faqs')
        self.assertEqual((faqs['visible'], faqs['enabled']), (False, False))
        self.api.post('/api/v1/dashboard/web/sections/', {'section': 'faqs', 'visible': True}, format='json')
        self.assertEqual(SiteConfig.load().web_sections, {})
        r = self.api.post('/api/v1/dashboard/web/sections/', {'section': 'about', 'visible': False}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_checklist(self):
        data = self.api.get('/api/v1/dashboard/checklist/').json()
        keys = {x['key'] for x in data['review']}
        self.assertTrue({'payments', 'emails', 'tax_id', '2fa'} <= keys)
        SiteConfig.objects.filter(pk=1).update(tax_id='B1')
        from api.utils.site import clear_site_config_cache
        clear_site_config_cache()
        keys = {x['key'] for x in self.api.get('/api/v1/dashboard/checklist/').json()['review']}
        self.assertNotIn('tax_id', keys)
