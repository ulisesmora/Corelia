"""«Conectar pagos» (Stripe Connect): clientes por cuenta, alta, estado,
webhook de Connect y reparto de reembolsos entre la cuenta de las claves y la
cuenta conectada. Stripe siempre simulado: nada sale a internet."""
import hashlib
import hmac
import importlib
import json
import time
from datetime import timedelta
from decimal import Decimal
from unittest import mock

import stripe
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Booking, CreditLedgerEntry, GuestProfile, Payment, Plan, SiteConfig, Subscription, User,
)
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio, next_weekday, madrid
from api.utils import payments
from api.utils.stripe_connect import stripe_account_linked, stripe_payments_changed

PLATFORM = dict(
    STRIPE_CONNECT_PLATFORM_KEY='sk_test_plataforma',
    STRIPE_CONNECT_PUBLISHABLE_KEY='pk_test_plataforma',
    STRIPE_CONNECT_WEBHOOK_SECRET='whsec_connect',
    STRIPE_CONNECT_AVAILABILITY_CHECK='',
    STRIPE_CONNECT_BOOKING_PMC='',
    PANEL_URL='https://panel.example.com',
)
ACCT = 'acct_1Estudio'
STATUS = '/api/v1/site-config/stripe/connect/status/'
START = '/api/v1/site-config/stripe/connect/start/'
SYNC = '/api/v1/site-config/stripe/connect/sync/'
DISCONNECT = '/api/v1/site-config/stripe/connect/disconnect/'
CONNECT_HOOK = '/api/v1/webhooks/connect/'
KEYS_HOOK = '/api/v1/webhooks/listener/'

# Respuesta de la clave pública de hoy (antes de «Conectar pagos»): no cambia
PUBLIC_KEYS = {
    'studio_name', 'tagline', 'description', 'tagline_en', 'description_en', 'logo_url', 'logo_light_url',
    'favicon_url', 'og_image_url', 'contact', 'content', 'icons', 'hero_mode', 'hero_image_url', 'hero_video_id',
    'hero_video_poster_url', 'hero_illustration', 'legal', 'theme', 'currency', 'country', 'drop_in_price',
    'timezone', 'cancel_min_hours', 'payments_enabled', 'stripe_publishable_key', 'google_login_enabled',
    'turnstile_site_key', 'google_client_id', 'vapid_public_key', 'setup_completed', 'site_url',
    'preview_frame_origins', 'google_business_url', 'google_review_url', 'facebook_url', 'tiktok_url',
    'youtube_url', 'google_site_verification', 'bing_site_verification', 'ga4_measurement_id', 'google_ads_id',
    'google_ads_purchase_label', 'google_ads_signup_label', 'meta_pixel_id',
    'sections',  # «Mi web» → Secciones (0010)
    'payment_options',  # «Formas de cobro» (0011)
}


def v1_account(charges=False, submitted=False, due=(), disabled=''):
    return stripe.StripeObject.construct_from({
        'id': ACCT, 'object': 'account', 'country': 'ES', 'default_currency': 'eur',
        'charges_enabled': charges, 'payouts_enabled': charges, 'details_submitted': submitted,
        'settings': {'dashboard': {'display_name': 'Estudio Luna'}},
        'requirements': {'currently_due': list(due), 'past_due': [], 'eventually_due': list(due),
                         'pending_verification': [], 'disabled_reason': disabled or None},
    }, 'sk_test_x')


def fake_platform(account=None):
    """Cliente de la plataforma simulado (v2 accounts, account links, v1 accounts)."""
    fake = mock.MagicMock()
    fake.v2.core.accounts.create.return_value = stripe.StripeObject.construct_from(
        {'id': ACCT, 'object': 'v2.core.account'}, 'sk_test_x')
    fake.v2.core.account_links.create.return_value = stripe.StripeObject.construct_from(
        {'object': 'v2.core.account_link', 'url': 'https://connect.stripe.com/setup/abc'}, 'sk_test_x')
    fake.v1.accounts.retrieve.return_value = account or v1_account()
    return fake


def link_account(active=True, provider='connect', livemode=False):
    cfg = SiteConfig.load()
    cfg.stripe_account_id = ACCT
    cfg.payments_provider = provider
    cfg.stripe_connect_status = {'livemode': livemode, 'country': 'ES', 'charges_enabled': active,
                                 'details_submitted': active}
    cfg.save()
    return cfg


def enable_keys(webhook_secret='whsec_claves'):
    cfg = SiteConfig.load()
    cfg.payments_enabled = True
    cfg.payments_provider = 'keys'
    cfg.stripe_secret_key = 'sk_test_claves'
    cfg.stripe_publishable_key = 'pk_test_claves'
    cfg.stripe_webhook_secret = webhook_secret
    cfg.save()


def signed_post(path, event, secret):
    payload = json.dumps(event)
    ts = int(time.time())
    sig = hmac.new(secret.encode(), f'{ts}.{payload}'.encode(), hashlib.sha256).hexdigest()
    return APIClient().post(path, data=payload, content_type='application/json',
                            HTTP_STRIPE_SIGNATURE=f't={ts},v1={sig}')


def event(type_, obj, account=ACCT, livemode=False):
    ev = {'id': f'evt_{type_}', 'object': 'event', 'type': type_, 'livemode': livemode,
          'data': {'object': obj}}
    if account is not None:
        ev['account'] = account
    return ev


class StatusAndClientTests(StudioTestCase):
    """payments_status() y stripe_client(account) en cada situación."""

    def test_nothing_configured(self):
        s = payments.payments_status()
        self.assertEqual((s['provider'], s['ready'], s['state'], s['connect_available']), ('', False, 'none', False))
        self.assertIsNone(payments.stripe_client())
        self.assertFalse(payments.payments_enabled())

    @override_settings(STRIPE_CONNECT_PLATFORM_KEY='sk_live_x', STRIPE_CONNECT_PUBLISHABLE_KEY='pk_test_x')
    def test_connect_needs_both_keys_in_the_same_mode(self):
        self.assertFalse(payments.connect_configured())

    @override_settings(**PLATFORM)
    def test_connect_available_and_availability_check(self):
        self.assertTrue(payments.connect_available())
        with override_settings(STRIPE_CONNECT_AVAILABILITY_CHECK='api.tests.test_stripe_connect.never'):
            self.assertFalse(payments.connect_available())
        with override_settings(STRIPE_CONNECT_AVAILABILITY_CHECK='no.existe'):
            self.assertFalse(payments.connect_available())

    def test_keys_client(self):
        enable_keys()
        with mock.patch.object(payments.stripe, 'StripeClient') as cls:
            payments.stripe_client()
        cls.assert_called_once_with('sk_test_claves')
        self.assertEqual(payments.current_stripe_account(), '')

    @override_settings(**PLATFORM)
    def test_connected_client_uses_platform_key_and_stripe_account(self):
        link_account(active=True)
        with mock.patch.object(payments.stripe, 'StripeClient') as cls:
            payments.stripe_client()
            cls.assert_called_once_with('sk_test_plataforma', stripe_account=ACCT)
            cls.reset_mock()
            payments.platform_client()
            cls.assert_called_once_with('sk_test_plataforma')
        s = payments.payments_status()
        self.assertEqual((s['provider'], s['ready'], s['state'], s['live']), ('connect', True, 'active', False))
        self.assertEqual(payments.current_stripe_account(), ACCT)
        self.assertEqual(payments.publishable_key(), 'pk_test_plataforma')
        self.assertEqual(payments.stripe_account_for_js(), ACCT)

    @override_settings(**PLATFORM)
    def test_explicit_account_routing(self):
        enable_keys()
        link_account(active=True)
        with mock.patch.object(payments.stripe, 'StripeClient') as cls:
            payments.stripe_client(account='')
            cls.assert_called_once_with('sk_test_claves')
            cls.reset_mock()
            payments.stripe_client(account='acct_Otra')
            cls.assert_called_once_with('sk_test_plataforma', stripe_account='acct_Otra')

    @override_settings(**PLATFORM)
    def test_keys_keep_working_while_the_account_is_being_set_up(self):
        enable_keys()
        link_account(active=False)
        s = payments.payments_status()
        self.assertEqual((s['provider'], s['ready'], s['state']), ('keys', True, 'onboarding'))
        self.assertEqual(payments.current_stripe_account(), '')

    @override_settings(**PLATFORM)
    def test_states(self):
        cfg = link_account(active=False)
        self.assertEqual(payments.connect_state(cfg), 'onboarding')
        cfg.stripe_connect_status = {'livemode': False, 'details_submitted': True}
        self.assertEqual(payments.connect_state(cfg), 'pending')
        cfg.stripe_connect_status = {'livemode': False, 'details_submitted': True, 'currently_due': ['external_account']}
        self.assertEqual(payments.connect_state(cfg), 'restricted')
        self.assertEqual(payments.payments_status(cfg)['requirements_due'], ['external_account'])
        cfg.stripe_connect_status = {'livemode': True, 'charges_enabled': True, 'details_submitted': True}
        self.assertEqual(payments.connect_state(cfg), 'mismatch')  # cuenta live, plataforma test
        self.assertFalse(payments.payments_status(cfg)['ready'])


def never(cfg):
    return False


@override_settings(**PLATFORM)
class StartTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_clients_cannot_connect(self):
        c = APIClient()
        c.force_authenticate(make_client())
        self.assertEqual(c.post(START, {}, format='json').status_code, 403)
        self.assertEqual(c.get(STATUS).status_code, 403)

    def test_404_without_platform(self):
        with override_settings(STRIPE_CONNECT_PLATFORM_KEY=''):
            r = self.admin.post(START, {}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.admin.get(STATUS).json()['connect_available'], True)

    def test_404_when_availability_check_says_no(self):
        with override_settings(STRIPE_CONNECT_AVAILABILITY_CHECK='api.tests.test_stripe_connect.never'):
            self.assertEqual(self.admin.post(START, {}, format='json').status_code, 404)

    def test_start_creates_the_account_once_and_builds_the_urls_itself(self):
        fake = fake_platform()
        linked = mock.Mock()
        stripe_account_linked.connect(linked)
        self.addCleanup(stripe_account_linked.disconnect, linked)
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake):
            r1 = self.admin.post(START, {'country': 'ES', 'return_to': 'welcome',
                                         'origin': 'https://malo.example.org'}, format='json')
            r2 = self.admin.post(START, {'country': 'ES'}, format='json')
        self.assertEqual(r1.status_code, 200, r1.content)
        self.assertEqual(r1.json()['url'], 'https://connect.stripe.com/setup/abc')
        self.assertTrue(r1.json()['created'])
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertFalse(r2.json()['created'])
        fake.v2.core.accounts.create.assert_called_once()
        self.assertEqual(linked.call_count, 1)
        self.assertEqual(linked.call_args.kwargs['account_id'], ACCT)

        params = fake.v2.core.accounts.create.call_args.kwargs['params']
        self.assertEqual(params['dashboard'], 'full')
        self.assertEqual(params['identity'], {'country': 'es'})
        self.assertEqual(params['defaults']['responsibilities'],
                         {'fees_collector': 'stripe', 'losses_collector': 'stripe'})
        self.assertEqual(params['defaults']['currency'], 'eur')
        self.assertEqual(params['defaults']['locales'], ['es-ES'])
        self.assertTrue(params['configuration']['merchant']['capabilities']['card_payments']['requested'])
        self.assertIn('idempotency_key', fake.v2.core.accounts.create.call_args.kwargs['options'])

        # Enlace: URLs del panel construidas en el servidor (el origen de fuera se ignora)
        first = fake.v2.core.account_links.create.call_args_list[0].kwargs['params']
        onboarding = first['use_case']['account_onboarding']
        self.assertEqual(first['account'], ACCT)
        self.assertEqual(onboarding['return_url'], 'https://panel.example.com/bienvenida?stripe=return')
        self.assertEqual(onboarding['refresh_url'], 'https://panel.example.com/bienvenida?stripe=refresh')
        second = fake.v2.core.account_links.create.call_args_list[1].kwargs['params']
        self.assertEqual(second['use_case']['account_onboarding']['return_url'],
                         'https://panel.example.com/ajustes?tab=pagos&stripe=return')

        cfg = SiteConfig.load()
        self.assertEqual((cfg.stripe_account_id, cfg.payments_provider), (ACCT, 'connect'))
        s = self.admin.get(STATUS).json()
        self.assertEqual((s['state'], s['ready'], s['account_id']), ('onboarding', False, ACCT))

    def test_allowed_origin_is_used(self):
        fake = fake_platform()
        with override_settings(API_URL='https://api.example.com'), \
                mock.patch('api.utils.stripe_connect.platform_client', return_value=fake):
            self.admin.post(START, {'origin': 'https://api.example.com'}, format='json')
        url = fake.v2.core.account_links.create.call_args.kwargs['params']['use_case']['account_onboarding']['return_url']
        self.assertEqual(url, 'https://api.example.com/ajustes?tab=pagos&stripe=return')

    def test_country_must_be_supported(self):
        fake = fake_platform()
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake):
            r = self.admin.post(START, {'country': 'AR'}, format='json')
        self.assertEqual(r.status_code, 400)
        fake.v2.core.accounts.create.assert_not_called()
        self.assertEqual(SiteConfig.load().stripe_account_id, '')

    def test_failed_signal_receiver_does_not_save_the_link(self):
        def boom(**kwargs):
            raise RuntimeError('cuenta ya usada por otro estudio')
        stripe_account_linked.connect(boom)
        self.addCleanup(stripe_account_linked.disconnect, boom)
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake_platform()):
            with self.assertRaises(RuntimeError):
                self.admin.post(START, {}, format='json')
        self.assertEqual(SiteConfig.load().stripe_account_id, '')

    def test_active_account_needs_no_link(self):
        link_account(active=True)
        fake = fake_platform()
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake):
            r = self.admin.post(START, {}, format='json')
        self.assertIsNone(r.json()['url'])
        fake.v2.core.account_links.create.assert_not_called()


@override_settings(**PLATFORM)
class SyncTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())
        link_account(active=False)

    def test_sync_to_active_marks_the_guide_step_and_registers_domains(self):
        changed = mock.Mock()
        stripe_payments_changed.connect(changed)
        self.addCleanup(stripe_payments_changed.disconnect, changed)
        cfg = SiteConfig.load()
        cfg.web_domain = 'estudioluna.com'
        cfg.save()
        fake = fake_platform(v1_account(charges=True, submitted=True))
        connected = mock.MagicMock()
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake), \
                mock.patch('api.utils.stripe_connect.stripe_client', return_value=connected) as sc:
            r = self.admin.post(SYNC)
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual((data['provider'], data['ready'], data['state']), ('connect', True, 'active'))
        self.assertEqual(data['display_name'], 'Estudio Luna')
        fake.v1.accounts.retrieve.assert_called_once_with(ACCT)
        self.assertEqual(changed.call_count, 1)
        self.assertIsNotNone(SiteConfig.load().stripe_connected_at)
        # Apple Pay / Google Pay: dominios de la web (con www) y del panel, en la cuenta conectada
        sc.assert_called_with(account=ACCT)
        domains = [c.kwargs['params']['domain_name'] for c in connected.v1.payment_method_domains.create.call_args_list]
        self.assertEqual(domains, ['estudioluna.com', 'www.estudioluna.com', 'panel.example.com'])
        self.assertEqual(SiteConfig.load().stripe_connect_status['pm_domains'],
                         sorted(['estudioluna.com', 'www.estudioluna.com', 'panel.example.com']))

        progress = self.admin.get('/api/v1/setup/progress/').json()
        pay = next(s for s in progress['steps'] if s['key'] == 'payments')
        item = next(i for i in pay['items'] if i['key'] == 'stripe')
        self.assertEqual(item, {'key': 'stripe', 'done': True, 'state': 'active'})

        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertTrue(public['payments_enabled'])
        self.assertEqual(public['stripe_publishable_key'], 'pk_test_plataforma')
        self.assertEqual(public['stripe_account'], ACCT)

        settings_ = self.admin.get('/api/v1/site-config/').json()
        self.assertTrue(settings_['has_stripe'])
        self.assertEqual(settings_['stripe_mode'], 'test')

    def test_guide_state_while_pending(self):
        fake = fake_platform(v1_account(submitted=True))
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake):
            self.admin.post(SYNC)
        progress = self.admin.get('/api/v1/setup/progress/').json()
        pay = next(s for s in progress['steps'] if s['key'] == 'payments')
        self.assertIn({'key': 'stripe', 'done': False, 'state': 'pending'}, pay['items'])

    def test_disconnect_then_connect_again_reuses_the_account(self):
        r = self.admin.post(DISCONNECT)
        self.assertEqual(r.json()['state'], 'none')
        cfg = SiteConfig.load()
        self.assertEqual((cfg.stripe_account_id, cfg.payments_provider), ('', ''))
        fake = fake_platform(v1_account(charges=True, submitted=True))
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake), \
                mock.patch('api.utils.stripe_connect.stripe_client', return_value=mock.MagicMock()):
            r = self.admin.post(START, {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        fake.v2.core.accounts.create.assert_not_called()
        self.assertIsNone(r.json()['url'])  # ya estaba activa
        self.assertEqual(r.json()['status']['state'], 'active')


@override_settings(**PLATFORM)
class ConnectWebhookTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        link_account(active=True)
        self.user = make_client(credits=0)
        self.plan = Plan.objects.create(name='Bono 5', credits=5, price_eur=Decimal('50'))

    def _session(self, payment):
        return {'id': 'cs_1', 'object': 'checkout.session', 'mode': 'payment', 'payment_status': 'paid',
                'payment_intent': 'pi_1', 'amount_total': 5000, 'currency': 'eur',
                'metadata': {'plan_id': str(self.plan.id), 'user_id': str(self.user.id),
                             'local_payment_id': str(payment.id)}}

    def _credits(self):
        return sum(e.amount for e in CreditLedgerEntry.objects.filter(wallet__user=self.user))

    def test_checkout_completed_with_account_fulfills(self):
        payment = Payment.objects.create(user=self.user, amount_eur=50, status='pending', stripe_account=ACCT)
        r = signed_post(CONNECT_HOOK, event('checkout.session.completed', self._session(payment)), 'whsec_connect')
        self.assertEqual(r.status_code, 200, r.content)
        payment.refresh_from_db()
        self.assertEqual((payment.status, payment.stripe_account, payment.stripe_payment_intent_id),
                         ('succeeded', ACCT, 'pi_1'))
        self.assertEqual(self._credits(), 5)

    def test_other_account_and_other_mode_are_ignored(self):
        payment = Payment.objects.create(user=self.user, amount_eur=50, status='pending')
        for ev in (event('checkout.session.completed', self._session(payment), account='acct_OtroEstudio'),
                   event('checkout.session.completed', self._session(payment), livemode=True),
                   event('checkout.session.completed', self._session(payment), account=None)):
            r = signed_post(CONNECT_HOOK, ev, 'whsec_connect')
            self.assertEqual(r.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(self._credits(), 0)

    def test_bad_signature(self):
        r = signed_post(CONNECT_HOOK, event('account.updated', {'id': ACCT}), 'whsec_otro')
        self.assertEqual(r.status_code, 400)
        r = APIClient().post(CONNECT_HOOK, data='{}', content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_keys_webhook_secret_is_not_valid_here(self):
        enable_keys(webhook_secret='whsec_claves')
        link_account(active=True)
        r = signed_post(CONNECT_HOOK, event('account.updated', {'id': ACCT}), 'whsec_claves')
        self.assertEqual(r.status_code, 400)

    def test_account_updated_rereads_the_account(self):
        fake = fake_platform(v1_account(submitted=True, due=['external_account']))
        with mock.patch('api.utils.stripe_connect.platform_client', return_value=fake):
            r = signed_post(CONNECT_HOOK, event('account.updated', {'id': ACCT, 'charges_enabled': True}),
                            'whsec_connect')
        self.assertEqual(r.status_code, 200)
        fake.v1.accounts.retrieve.assert_called_once_with(ACCT)
        s = payments.payments_status()
        self.assertEqual((s['state'], s['ready'], s['requirements_due']), ('restricted', False, ['external_account']))

    def test_deauthorize_unlinks(self):
        changed = mock.Mock()
        stripe_payments_changed.connect(changed)
        self.addCleanup(stripe_payments_changed.disconnect, changed)
        r = signed_post(CONNECT_HOOK, event('account.application.deauthorized', {'id': 'ca_1', 'object': 'application'}),
                        'whsec_connect')
        self.assertEqual(r.status_code, 200)
        cfg = SiteConfig.load()
        self.assertEqual((cfg.stripe_account_id, cfg.payments_provider), ('', ''))
        self.assertEqual(cfg.stripe_connect_status['unlinked_reason'], 'deauthorized')
        self.assertEqual(changed.call_args.kwargs['reason'], 'deauthorized')
        self.assertFalse(payments.payments_enabled())

    def test_renewal_with_both_invoice_shapes(self):
        from api.tests.test_stripe_api_versions import _invoice
        sub_plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        now = timezone.now()
        Subscription.objects.create(user=self.user, plan=sub_plan, status='active', stripe_account=ACCT,
                                    current_period_start=now - timedelta(days=30), current_period_end=now,
                                    stripe_subscription_id='sub_1')
        for i, new_shape in enumerate((True, False)):
            r = signed_post(CONNECT_HOOK, event('invoice.paid', _invoice(new_shape, invoice_id=f'in_{i}')),
                            'whsec_connect')
            self.assertEqual(r.status_code, 200)
        self.assertEqual(self._credits(), 16)

    def test_subscription_checkout_records_the_account(self):
        sub_plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        session = {'id': 'cs_sub', 'object': 'checkout.session', 'mode': 'subscription', 'payment_status': 'paid',
                   'subscription': 'sub_9', 'customer': 'cus_9', 'amount_total': 6000, 'currency': 'eur',
                   'metadata': {'plan_id': str(sub_plan.id), 'user_id': str(self.user.id)}}
        signed_post(CONNECT_HOOK, event('checkout.session.completed', session), 'whsec_connect')
        self.assertEqual(Subscription.objects.get(stripe_subscription_id='sub_9').stripe_account, ACCT)
        self.assertEqual(Payment.objects.get(stripe_checkout_session_id='cs_sub').stripe_account, ACCT)
        user = User.objects.get(pk=self.user.pk)
        self.assertEqual((user.stripe_customer_id, user.stripe_customer_account), ('cus_9', ACCT))

    def test_disabled_without_platform(self):
        with override_settings(STRIPE_CONNECT_WEBHOOK_SECRET=''):
            r = signed_post(CONNECT_HOOK, event('account.updated', {'id': ACCT}), 'whsec_connect')
        self.assertEqual(r.status_code, 503)


@override_settings(**PLATFORM)
class KeysWebhookStillWorksTests(StudioTestCase):
    """Estado híbrido: ya se cobra con la cuenta conectada, pero las
    suscripciones de antes siguen llegando al webhook de las claves."""

    def test_keys_webhook_renews_old_subscription(self):
        from api.tests.test_stripe_api_versions import _invoice
        enable_keys()
        link_account(active=True)
        user = make_client(credits=0)
        plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        now = timezone.now()
        Subscription.objects.create(user=user, plan=plan, status='active', stripe_subscription_id='sub_1',
                                    current_period_start=now - timedelta(days=30), current_period_end=now)
        self.assertEqual(payments.payments_status()['provider'], 'connect')  # ya cobra con la cuenta conectada
        r = signed_post(KEYS_HOOK, event('invoice.paid', _invoice(True), account=None), 'whsec_claves')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(CreditLedgerEntry.objects.filter(wallet__user=user, kind='grant').count(), 1)


@override_settings(**PLATFORM)
class RefundRoutingTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        enable_keys()
        link_account(active=True)
        self.sched = make_studio()
        self.sched.class_type.default_price_eur = Decimal('15')
        self.sched.class_type.save()

    def _guest_booking(self, account):
        sched = self.sched
        guest = GuestProfile.objects.create(name='Inés', email=f'ines{account or "keys"}@test.local')
        payment = Payment.objects.create(guest=guest, amount_eur=15, status='succeeded', method='stripe',
                                         stripe_payment_intent_id='pi_9', stripe_account=account)
        start = madrid(next_weekday(sched.weekday), 10)
        return Booking.objects.create(guest=guest, payment=payment, occurrence=sched, status='canceled',
                                      start_datetime=start, end_datetime=start + timedelta(minutes=55))

    def test_guest_refund_goes_to_the_account_that_charged(self):
        from api.utils.guest_refund import refund_guest_booking_stripe
        for account in ('', ACCT):
            with self.subTest(account=account):
                fake = mock.MagicMock()
                fake.v1.payment_intents.retrieve.return_value = stripe.StripeObject.construct_from(
                    {'id': 'pi_9', 'amount_received': 1500, 'latest_charge': {'id': 'ch_1', 'amount_refunded': 0}},
                    'sk_test_x')
                with mock.patch('api.utils.payments.stripe_client', return_value=fake) as sc:
                    refunded = refund_guest_booking_stripe(self._guest_booking(account), reason='test')
                sc.assert_called_once_with(account=account)
                self.assertEqual(refunded, 1500)
                self.assertEqual(fake.v1.refunds.create.call_args.kwargs['params']['amount'], 1500)

    def test_unconfirmed_booking_refund_uses_event_account(self):
        from api.views import StripeWebhookView
        with mock.patch('api.utils.payments.stripe_client') as sc:
            StripeWebhookView._issue_stripe_refund('pi_1', 500, 1, ACCT)
            sc.assert_called_once_with(account=ACCT)
            sc.reset_mock()
            StripeWebhookView._issue_stripe_refund('pi_1', 500, 1)
            sc.assert_called_once_with(account='')

    def test_subscription_cancel_uses_its_account(self):
        user = make_client(credits=0)
        plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        now = timezone.now()
        old = Subscription.objects.create(user=user, plan=plan, status='active', stripe_subscription_id='sub_old',
                                          current_period_start=now, current_period_end=now + timedelta(days=30))
        new = Subscription.objects.create(user=user, plan=plan, status='active', stripe_subscription_id='sub_new',
                                          stripe_account=ACCT, current_period_start=now,
                                          current_period_end=now + timedelta(days=30))
        c = APIClient()
        c.force_authenticate(user)
        for sub, account in ((old, ''), (new, ACCT)):
            with mock.patch('api.utils.payments.stripe_client') as sc:
                r = c.post(f'/api/v1/subscriptions/{sub.id}/cancel/')
            self.assertEqual(r.status_code, 200, r.content)
            sc.assert_called_once_with(account=account)
            sc.return_value.v1.subscriptions.update.assert_called_once_with(
                sub.stripe_subscription_id, params={'cancel_at_period_end': True})


@override_settings(**PLATFORM)
class CheckoutInConnectModeTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        link_account(active=True)
        self.user = make_client(credits=0)
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def _fake(self):
        fake = mock.MagicMock()
        fake.v1.checkout.sessions.create.return_value = stripe.StripeObject.construct_from(
            {'id': 'cs_1', 'client_secret': 'cs_secret'}, 'sk_test_x')
        return fake

    def test_pack_checkout_records_account_and_uses_embedded_page(self):
        plan = Plan.objects.create(name='Bono 5', credits=5, price_eur=Decimal('50'))
        fake = self._fake()
        with mock.patch('api.utils.payments.stripe_client', return_value=fake):
            r = self.c.post('/api/v1/checkout/pay-plan/', {'plan_id': plan.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        params = fake.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['ui_mode'], 'embedded_page')
        self.assertNotIn('payment_method_configuration', params)  # solo en reservas
        self.assertEqual(Payment.objects.get().stripe_account, ACCT)

    def test_subscription_ignores_price_from_the_keys_account(self):
        plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub',
                                   stripe_price_id='price_de_las_claves')
        fake = self._fake()
        with mock.patch('api.utils.payments.stripe_client', return_value=fake):
            r = self.c.post('/api/v1/checkout/pay-plan/', {'plan_id': plan.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        item = fake.v1.checkout.sessions.create.call_args.kwargs['params']['line_items'][0]
        self.assertNotIn('price', item)
        self.assertIn('price_data', item)
        plan.stripe_price_account = ACCT
        plan.save()
        with mock.patch('api.utils.payments.stripe_client', return_value=fake):
            self.c.post('/api/v1/checkout/pay-plan/', {'plan_id': plan.id}, format='json')
        item = fake.v1.checkout.sessions.create.call_args.kwargs['params']['line_items'][0]
        self.assertEqual(item, {'price': 'price_de_las_claves', 'quantity': 1})

    def _book(self, fake):
        sched = make_studio()
        sched.class_type.default_price_eur = Decimal('15')
        sched.class_type.save()
        start = madrid(next_weekday(sched.weekday), 10)
        with mock.patch('api.utils.payments.stripe_client', return_value=fake), \
                mock.patch('api.views.check_captcha', return_value=None):
            return APIClient().post('/api/v1/checkout/create-session/', {
                'email': 'invitada@test.local', 'name': 'Inés',
                'cart_items': [{'id_source': sched.id, 'sessionDate': start.isoformat(),
                                'sessionDateEnd': (start + timedelta(minutes=55)).isoformat()}],
            }, format='json')

    def test_booking_checkout_uses_the_booking_payment_method_configuration(self):
        fake = self._fake()
        with override_settings(STRIPE_CONNECT_BOOKING_PMC='pmc_sin_asincronos'):
            r = self._book(fake)
        self.assertEqual(r.status_code, 201, r.content)
        params = fake.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['payment_method_configuration'], 'pmc_sin_asincronos')
        self.assertEqual(params['ui_mode'], 'embedded_page')
        self.assertEqual(Payment.objects.get().stripe_account, ACCT)

    def test_booking_checkout_in_keys_mode_has_no_configuration(self):
        SiteConfig.objects.filter(pk=1).update(stripe_account_id='', payments_provider='keys')
        enable_keys()
        fake = self._fake()
        with override_settings(STRIPE_CONNECT_BOOKING_PMC='pmc_sin_asincronos'):
            r = self._book(fake)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn('payment_method_configuration', fake.v1.checkout.sessions.create.call_args.kwargs['params'])
        self.assertEqual(Payment.objects.get().stripe_account, '')


class PublicPayloadUnchangedTests(StudioTestCase):
    """Sin Connect en el entorno, la configuración pública es la de siempre."""

    def _public(self):
        return APIClient().get('/api/v1/site-config/public/').json()

    def test_without_payments(self):
        data = self._public()
        self.assertEqual(set(data), PUBLIC_KEYS)
        self.assertEqual((data['payments_enabled'], data['stripe_publishable_key']), (False, ''))

    def test_with_keys(self):
        enable_keys()
        data = self._public()
        self.assertEqual(set(data), PUBLIC_KEYS)
        self.assertEqual((data['payments_enabled'], data['stripe_publishable_key']), (True, 'pk_test_claves'))

    @override_settings(**PLATFORM)
    def test_with_platform_but_not_connected(self):
        enable_keys()
        data = self._public()
        self.assertEqual(set(data), PUBLIC_KEYS)
        self.assertEqual(data['stripe_publishable_key'], 'pk_test_claves')

    def test_admin_settings_has_stripe_as_before(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        self.assertFalse(c.get('/api/v1/site-config/').json()['has_stripe'])
        enable_keys()
        data = c.get('/api/v1/site-config/').json()
        self.assertEqual((data['has_stripe'], data['stripe_mode']), (True, 'test'))
        status_ = c.get(STATUS).json()
        self.assertEqual((status_['connect_available'], status_['provider'], status_['state']), (False, 'keys', 'none'))


class MigrationDataStepTests(StudioTestCase):
    def test_marks_keys_provider_where_a_secret_key_exists(self):
        from django.apps import apps
        migration = importlib.import_module('api.migrations.0007_stripe_connect')
        cfg = SiteConfig.load()
        migration.mark_keys_provider(apps, None)
        self.assertEqual(SiteConfig.load().payments_provider, '')
        cfg.stripe_secret_key = 'sk_test_x'
        cfg.save()
        migration.mark_keys_provider(apps, None)
        self.assertEqual(SiteConfig.load().payments_provider, 'keys')


@override_settings(**PLATFORM)
class PlanPriceAccountTests(StudioTestCase):
    def test_new_price_id_is_stamped_with_the_current_account(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        link_account(active=True)
        r = c.patch(f'/api/v1/plans/{plan.id}/', {'stripe_price_id': 'price_nuevo'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        plan.refresh_from_db()
        self.assertEqual((plan.stripe_price_id, plan.stripe_price_account), ('price_nuevo', ACCT))
        # Otro cambio cualquiera no toca la cuenta del precio
        c.patch(f'/api/v1/plans/{plan.id}/', {'credits': 10}, format='json')
        plan.refresh_from_db()
        self.assertEqual(plan.stripe_price_account, ACCT)
