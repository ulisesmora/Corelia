"""«Formas de pago en tu web» (api/utils/payment_methods.py): métodos por
país, encender/apagar en la configuración de Stripe (cuenta conectada o
claves propias), recomendados, dominios de Apple Pay y reservas sin métodos
que tardan días. Stripe siempre simulado: nada sale a internet."""
from unittest import mock

import stripe
from django.test import override_settings
from rest_framework.test import APIClient

from api.models import Payment, SiteConfig
from api.tests import test_stripe_connect as connect_tests
from api.tests.factories import StudioTestCase, make_admin, make_client
from api.tests.test_stripe_connect import PLATFORM, enable_keys, link_account
from api.utils import payment_methods as pm
from api.utils.stripe_connect import payment_method_domains

BASE = '/api/v1/site-config/stripe/payment-methods/'
TOGGLE = BASE + 'toggle/'
RECOMMENDED = BASE + 'recommended/'
VERIFY = BASE + 'verify-domains/'


def entry(value='off', available=None, overridable=True, preference=None):
    return {'available': (value == 'on') if available is None else available,
            'display_preference': {'overridable': overridable, 'preference': preference or value, 'value': value}}


def config(id_='pmc_hija', parent='pmc_padre', is_default=True, **methods):
    base = {'id': id_, 'object': 'payment_method_configuration', 'active': True, 'is_default': is_default,
            'parent': parent, 'card': entry('on'), 'apple_pay': entry('on'), 'google_pay': entry('on'),
            'link': entry('off')}
    base.update(methods)
    return base


def domain(name, apple='active', enabled=True, id_=None, error=''):
    d = {'id': id_ or f'pmd_{name}', 'domain_name': name, 'enabled': enabled,
         'apple_pay': {'status': apple}, 'google_pay': {'status': apple}, 'link': {'status': apple}}
    if error:
        d['apple_pay']['status_details'] = {'error_message': error}
    return d


def fake_client(configs, domains=()):
    fake = mock.MagicMock()
    fake.v1.payment_method_configurations.list.return_value = {'data': list(configs)}
    fake.v1.payment_method_configurations.update.side_effect = lambda id_, params: {'id': id_, **params}
    fake.v1.payment_method_domains.list.return_value = {'data': list(domains)}
    fake.v1.payment_method_domains.create.side_effect = lambda params: domain(params['domain_name'], apple='inactive')
    fake.v1.payment_method_domains.update.side_effect = lambda id_, params: {
        **domain(id_[4:], apple='inactive'), 'id': id_, 'enabled': params['enabled']}
    fake.v1.payment_method_domains.validate.side_effect = lambda id_: domain(id_[4:], apple='active', id_=id_)
    return fake


def set_country(code, web_domain=''):
    cfg = SiteConfig.load()
    cfg.country = code
    cfg.web_domain = web_domain
    st = dict(cfg.stripe_connect_status or {})
    if st:
        st['country'] = code
        cfg.stripe_connect_status = st
    cfg.save()


class Base(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def patch_client(self, fake):
        p = mock.patch('api.utils.payment_methods.stripe_client', return_value=fake)
        p.start()
        self.addCleanup(p.stop)
        return fake

    def methods(self, data):
        return {m['key']: m for m in data['methods']}


@override_settings(**PLATFORM)
class ConnectListTests(Base):
    def setUp(self):
        super().setUp()
        link_account(active=True)

    def test_spain_list_with_status_groups_and_limits(self):
        set_country('ES', web_domain='estudioluna.com')
        fake = self.patch_client(fake_client(
            [config(id_='pmc_propia', parent=None, is_default=True),  # la del estudio, no la de la plataforma
             config(bizum=entry('on', available=False), sepa_debit=entry('off'), klarna=entry('off'))],
            domains=[domain('estudioluna.com')]))
        r = self.admin.get(BASE)
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual((data['provider'], data['country'], data['config_id']), ('connect', 'ES', 'pmc_hija'))
        self.assertEqual(data['recommended']['label'], 'Recomendados para España')
        self.assertEqual(data['recommended']['keys'], ['card', 'apple_pay', 'google_pay', 'link', 'bizum'])
        self.assertEqual(data['dashboard_url'], 'https://dashboard.stripe.com/test/settings/payment_methods')
        self.assertEqual(data['booking_protection'], 'excluded')
        m = self.methods(data)
        self.assertNotIn('oxxo', m)
        self.assertNotIn('mb_way', m)
        self.assertEqual((m['card']['status'], m['card']['toggle']), ('on', 'locked'))
        self.assertEqual((m['apple_pay']['status'], m['apple_pay']['toggle']), ('on', 'api'))
        self.assertIn('Face ID', m['apple_pay']['why'])
        self.assertEqual(m['link']['status'], 'off')
        # Bizum encendido pero Stripe aún revisa el alta (capacidad pendiente)
        self.assertEqual(m['bizum']['status'], 'pending')
        self.assertIn('NIF', m['bizum']['note'])
        self.assertEqual(m['bizum']['works'], {'drop_in': True, 'packs': True, 'subs': False})
        # SEPA tarda días: no en reservas de clase
        self.assertEqual(m['sepa_debit']['group'], 'delayed')
        self.assertFalse(m['sepa_debit']['works']['drop_in'])
        self.assertIn('reservas', m['sepa_debit']['warning'])
        # Klarna y PayPal también sirven para cuotas
        self.assertTrue(m['klarna']['works']['subs'])
        self.assertTrue(m['paypal']['works']['subs'])
        # PayPal: no con «Conectar pagos» (cargos directos)
        self.assertEqual((m['paypal']['status'], m['paypal']['toggle']), ('unavailable', 'none'))
        self.assertIn('cuentas conectadas', m['paypal']['note'])
        # Dominios: la web verificada
        self.assertTrue(data['apple_pay_ready'])
        self.assertEqual(data['domains'][0]['domain'], 'estudioluna.com')
        self.assertEqual(data['domains'][1]['apple_pay'], 'missing')  # www sin registrar
        fake.v1.payment_method_domains.create.assert_not_called()  # GET no registra nada

    def test_portugal_and_mexico_lists(self):
        set_country('PT')
        self.patch_client(fake_client([config(mb_way=entry('off'), multibanco=entry('off'))]))
        m = self.methods(self.admin.get(BASE).json())
        self.assertEqual(m['mb_way']['group'], 'instant')
        self.assertFalse(m['mb_way']['works']['subs'])
        self.assertEqual(m['multibanco']['group'], 'delayed')
        self.assertEqual(m['multibanco']['works'], {'drop_in': False, 'packs': True, 'subs': False})
        self.assertNotIn('bizum', m)

        set_country('MX')
        self.patch_client(fake_client([config(oxxo=entry('off'))]))
        data = self.admin.get(BASE).json()
        m = self.methods(data)
        self.assertEqual(set(m), {'card', 'apple_pay', 'google_pay', 'link', 'oxxo'})
        self.assertIn('sin devoluciones', m['oxxo']['limits'])
        self.assertEqual(m['oxxo']['works'], {'drop_in': False, 'packs': True, 'subs': False})
        self.assertEqual(data['recommended']['label'], 'Recomendados para México')

    def test_method_missing_from_stripe_is_unavailable(self):
        set_country('ES')
        self.patch_client(fake_client([config()]))  # sin bizum en la respuesta
        m = self.methods(self.admin.get(BASE).json())
        self.assertEqual((m['bizum']['status'], m['bizum']['toggle']), ('unavailable', 'none'))

    def test_platform_blocked_method_is_dashboard_only(self):
        set_country('ES')
        self.patch_client(fake_client([config(bizum=entry('off', overridable=False))]))
        m = self.methods(self.admin.get(BASE).json())
        self.assertEqual(m['bizum']['toggle'], 'dashboard')
        self.assertIn('bloqueado', m['bizum']['note'])

    def test_stripe_down_still_lists(self):
        fake = self.patch_client(fake_client([]))
        fake.v1.payment_method_configurations.list.side_effect = stripe.APIConnectionError('caído')
        data = self.admin.get(BASE).json()
        self.assertIn('No hemos podido', data['error'])
        self.assertTrue(all(x['toggle'] == 'none' for x in data['methods']))

    @override_settings(STRIPE_CONNECT_BOOKING_PMC='pmc_reservas')
    def test_booking_protection_with_platform_configuration(self):
        self.patch_client(fake_client([config()]))
        self.assertEqual(self.admin.get(BASE).json()['booking_protection'], 'pmc')


@override_settings(**PLATFORM)
class ConnectToggleTests(Base):
    def setUp(self):
        super().setUp()
        link_account(active=True)
        set_country('ES')

    def test_toggle_on_and_off(self):
        fake = self.patch_client(fake_client([config(bizum=entry('off'))]))
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['changed'], ['bizum'])
        self.assertIn('overview', r.json())
        fake.v1.payment_method_configurations.update.assert_called_once_with(
            'pmc_hija', params={'bizum': {'display_preference': {'preference': 'on'}}})

        fake = self.patch_client(fake_client([config()]))
        r = self.admin.post(TOGGLE, {'method': 'apple_pay', 'enabled': False}, format='json')
        self.assertEqual(r.json()['changed'], ['apple_pay'])
        fake.v1.payment_method_configurations.update.assert_called_once_with(
            'pmc_hija', params={'apple_pay': {'display_preference': {'preference': 'off'}}})

    def test_toggle_to_the_same_state_does_nothing(self):
        fake = self.patch_client(fake_client([config()]))
        r = self.admin.post(TOGGLE, {'method': 'apple_pay', 'enabled': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['changed'], [])
        fake.v1.payment_method_configurations.update.assert_not_called()

    def test_blocked_by_platform_returns_dashboard_link(self):
        fake = self.patch_client(fake_client([config(bizum=entry('off', overridable=False))]))
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'dashboard_only')
        self.assertEqual(r.json()['dashboard_url'], 'https://dashboard.stripe.com/test/settings/payment_methods')
        fake.v1.payment_method_configurations.update.assert_not_called()

    def test_card_cannot_be_turned_off_here(self):
        self.patch_client(fake_client([config()]))
        r = self.admin.post(TOGGLE, {'method': 'card', 'enabled': False}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'dashboard_only'))

    def test_paypal_is_unavailable_with_connect(self):
        self.patch_client(fake_client([config(paypal=entry('off'))]))
        r = self.admin.post(TOGGLE, {'method': 'paypal', 'enabled': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'unavailable'))

    def test_stripe_rejects_the_change_returns_dashboard_link(self):
        fake = self.patch_client(fake_client([config(bizum=entry('off'))]))
        fake.v1.payment_method_configurations.update.side_effect = stripe.InvalidRequestError(
            'You cannot update bizum', 'bizum')
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'dashboard_only')
        self.assertIn('Bizum', r.json()['error'])

    def test_stripe_down_is_502(self):
        fake = self.patch_client(fake_client([config(bizum=entry('off'))]))
        fake.v1.payment_method_configurations.update.side_effect = stripe.APIConnectionError('caído')
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (502, 'stripe'))

    def test_bad_requests(self):
        self.patch_client(fake_client([config()]))
        self.assertEqual(self.admin.post(TOGGLE, {'method': 'bizum'}, format='json').status_code, 400)
        r = self.admin.post(TOGGLE, {'method': 'nope', 'enabled': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'unknown_method'))
        r = self.admin.post(TOGGLE, {'method': 'oxxo', 'enabled': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'not_in_country'))

    def test_only_admins(self):
        client = make_client()
        api = APIClient()
        api.force_authenticate(client)
        self.assertEqual(api.get(BASE).status_code, 403)
        self.assertEqual(api.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json').status_code, 403)

    @override_settings(STRIPE_CONNECT_BOOKING_PMC='pmc_reservas_padre')
    def test_booking_configuration_is_kept_in_sync_without_delayed_methods(self):
        booking = config(id_='pmc_reservas_hija', parent='pmc_reservas_padre', is_default=False)
        fake = self.patch_client(fake_client([config(bizum=entry('off'), sepa_debit=entry('off')), booking]))
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertTrue(r.json()['booking_synced'])
        ids = [c.args[0] for c in fake.v1.payment_method_configurations.update.call_args_list]
        self.assertEqual(ids, ['pmc_hija', 'pmc_reservas_hija'])
        # Un método que tarda días no se copia a la de reservas
        fake = self.patch_client(fake_client([config(sepa_debit=entry('off')), booking]))
        self.admin.post(TOGGLE, {'method': 'sepa_debit', 'enabled': True}, format='json')
        ids = [c.args[0] for c in fake.v1.payment_method_configurations.update.call_args_list]
        self.assertEqual(ids, ['pmc_hija'])

    def test_recommended_for_spain(self):
        fake = self.patch_client(fake_client([config(bizum=entry('off'))]))
        r = self.admin.post(RECOMMENDED, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(r.json()['changed']), ['bizum', 'link'])
        fake.v1.payment_method_configurations.update.assert_called_once_with('pmc_hija', params={
            'link': {'display_preference': {'preference': 'on'}},
            'bizum': {'display_preference': {'preference': 'on'}},
        })

    def test_recommended_falls_back_one_by_one(self):
        fake = self.patch_client(fake_client([config(bizum=entry('off'))]))

        def update(id_, params):
            if 'bizum' in params:
                raise stripe.InvalidRequestError('bizum not available', 'bizum')
            return {'id': id_}
        fake.v1.payment_method_configurations.update.side_effect = update
        r = self.admin.post(RECOMMENDED, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['changed'], ['link'])
        self.assertEqual([s['key'] for s in r.json()['skipped']], ['bizum'])

    def test_payments_off(self):
        SiteConfig.objects.filter(pk=1).update(stripe_account_id='', payments_provider='')
        from api.utils.site import clear_site_config_cache
        clear_site_config_cache()
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'payments_disabled'))
        data = self.admin.get(BASE).json()
        self.assertFalse(data['ready'])
        self.assertIn('activa los pagos online', data['error'])


@override_settings(**PLATFORM)
class DomainTests(Base):
    def setUp(self):
        super().setUp()
        link_account(active=True)
        set_country('ES', web_domain='estudioluna.com')

    def test_verify_registers_reenables_and_validates(self):
        fake = self.patch_client(fake_client([config()], domains=[
            domain('estudioluna.com', apple='inactive'),
            domain('panel.example.com', enabled=False),
        ]))
        r = self.admin.post(VERIFY, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertTrue(data['apple_pay_ready'])
        self.assertEqual([d['domain'] for d in data['domains']],
                         ['estudioluna.com', 'www.estudioluna.com', 'panel.example.com'])
        fake.v1.payment_method_domains.create.assert_called_once_with(params={'domain_name': 'www.estudioluna.com'})
        fake.v1.payment_method_domains.update.assert_called_once_with('pmd_panel.example.com', params={'enabled': True})
        validated = [c.args[0] for c in fake.v1.payment_method_domains.validate.call_args_list]
        self.assertIn('pmd_estudioluna.com', validated)
        self.assertEqual(SiteConfig.load().stripe_connect_status['pm_domains'],
                         ['estudioluna.com', 'panel.example.com', 'www.estudioluna.com'])

    def test_verify_reports_errors_per_domain(self):
        fake = self.patch_client(fake_client([config()], domains=[domain('estudioluna.com')]))
        fake.v1.payment_method_domains.create.side_effect = stripe.InvalidRequestError('Domain not reachable', 'x')
        data = self.admin.post(VERIFY, format='json').json()
        www = next(d for d in data['domains'] if d['domain'] == 'www.estudioluna.com')
        self.assertEqual(www['apple_pay'], 'error')
        self.assertIn('not reachable', www['error'])
        self.assertTrue(data['apple_pay_ready'])  # la web principal sí vale

    def test_inactive_domain_shows_stripe_reason(self):
        self.patch_client(fake_client([config()], domains=[
            domain('estudioluna.com', apple='inactive', error='File not found')]))
        data = self.admin.get(BASE).json()
        self.assertFalse(data['apple_pay_ready'])
        self.assertEqual(data['domains'][0]['error'], 'File not found')

    @override_settings(WEB_URL='https://estudio-luna.vercel.app')
    def test_domains_cover_custom_domain_www_and_default_host(self):
        cfg = SiteConfig.load()
        self.assertEqual(payment_method_domains(cfg),
                         ['estudioluna.com', 'www.estudioluna.com', 'estudio-luna.vercel.app', 'panel.example.com'])
        set_country('MX', web_domain='estudioluna.com.mx')
        self.assertEqual(payment_method_domains(SiteConfig.load())[:2], ['estudioluna.com.mx', 'www.estudioluna.com.mx'])
        set_country('ES', web_domain='reservas.estudioluna.com')
        self.assertEqual(payment_method_domains(SiteConfig.load())[:2],
                         ['reservas.estudioluna.com', 'estudio-luna.vercel.app'])


class KeysModeTests(Base):
    """Claves propias: la configuración por defecto de SU cuenta, sin Stripe-Account."""

    def setUp(self):
        super().setUp()
        enable_keys()
        set_country('ES')

    def test_list_and_toggle_with_own_account(self):
        own = config(id_='pmc_default', parent=None, bizum=entry('off'), paypal=entry('off'))
        fake = self.patch_client(fake_client([config(id_='pmc_otra', parent=None, is_default=False), own]))
        data = self.admin.get(BASE).json()
        self.assertEqual((data['provider'], data['config_id']), ('keys', 'pmc_default'))
        self.assertEqual(data['booking_protection'], 'excluded')
        m = self.methods(data)
        # PayPal: con claves propias existe, pero se solicita en su Stripe
        self.assertEqual((m['paypal']['status'], m['paypal']['toggle']), ('off', 'dashboard'))
        r = self.admin.post(TOGGLE, {'method': 'bizum', 'enabled': True}, format='json')
        self.assertEqual(r.json()['changed'], ['bizum'])
        fake.v1.payment_method_configurations.update.assert_called_once_with(
            'pmc_default', params={'bizum': {'display_preference': {'preference': 'on'}}})
        r = self.admin.post(TOGGLE, {'method': 'paypal', 'enabled': True}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'dashboard_only'))
        self.assertEqual(r.json()['dashboard_url'], 'https://dashboard.stripe.com/test/settings/payment_methods')

    def test_keys_client_is_the_studio_key(self):
        with mock.patch('api.utils.payments.stripe.StripeClient') as cls:
            cls.return_value = fake_client([config(parent=None)])
            self.admin.get(BASE)
        cls.assert_called_with('sk_test_claves')

    def test_verify_domains_in_keys_mode(self):
        fake = self.patch_client(fake_client([config(parent=None)]))
        r = self.admin.post(VERIFY, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(fake.v1.payment_method_domains.create.call_count, len(r.json()['domains']))

    def test_connecting_keys_registers_domains(self):
        from api.utils.payments import connect_stripe
        SiteConfig.objects.filter(pk=1).update(web_domain='estudioluna.com')
        from api.utils.site import clear_site_config_cache
        clear_site_config_cache()
        fake = fake_client([])
        fake.v1.accounts.retrieve_current.return_value = mock.Mock(id='acct_propia', default_currency='eur')
        fake.v1.webhook_endpoints.create.return_value = mock.Mock(id='we_1', secret='whsec_1')
        with mock.patch('api.utils.payments.stripe.StripeClient', return_value=fake):
            connect_stripe('sk_test_nueva', 'https://api.example.com/api/v1/webhooks/listener/')
        created = [c.kwargs['params']['domain_name'] for c in fake.v1.payment_method_domains.create.call_args_list]
        self.assertEqual(created[:2], ['estudioluna.com', 'www.estudioluna.com'])

    def test_connecting_keys_survives_domain_errors(self):
        from api.utils.payments import connect_stripe
        fake = fake_client([])
        fake.v1.accounts.retrieve_current.return_value = mock.Mock(id='acct_propia', default_currency='eur')
        fake.v1.webhook_endpoints.create.return_value = mock.Mock(id='we_1', secret='whsec_1')
        fake.v1.payment_method_domains.list.side_effect = RuntimeError('boom')
        with mock.patch('api.utils.payments.stripe.StripeClient', return_value=fake):
            result = connect_stripe('sk_test_nueva', 'https://api.example.com/api/v1/webhooks/listener/')
        self.assertEqual(result['webhook_id'], 'we_1')


class BookingExclusionTests(StudioTestCase):
    def test_excluded_types_per_country(self):
        self.assertEqual(pm.booking_excluded_types('ES'), ['sepa_debit', 'customer_balance'])
        self.assertEqual(pm.booking_excluded_types('PT'), ['sepa_debit', 'multibanco', 'customer_balance'])
        self.assertEqual(pm.booking_excluded_types('MX'), ['oxxo', 'customer_balance'])
        self.assertEqual(pm.booking_excluded_types('GB'), ['bacs_debit', 'customer_balance'])
        self.assertEqual(pm.booking_excluded_types('US'), ['us_bank_account', 'customer_balance'])
        self.assertEqual(pm.booking_excluded_types('CA'), ['acss_debit', 'customer_balance'])
        self.assertEqual(pm.booking_excluded_types('BR'), ['customer_balance', 'boleto'])

    def test_all_excluded_types_are_valid_checkout_values(self):
        """Los valores salen de la librería de Stripe (versión fijada en uv.lock)."""
        import inspect
        import re
        from stripe.params import _payment_method_configuration_update_params as pmc_params
        from stripe.params.checkout import _session_create_params as session_params
        src = inspect.getsource(session_params)
        block = src[src.index('excluded_payment_method_types: NotRequired'):]
        block = block[:block.index('"""')]
        valid = set(re.findall(r'"([a-z_]+)"', block))
        self.assertIn('oxxo', valid)
        for country in ('ES', 'PT', 'FR', 'NL', 'BE', 'DE', 'GB', 'US', 'CA', 'MX', 'BR', 'JP'):
            for key in pm.booking_excluded_types(country):
                self.assertIn(key, valid, key)
        # Y cada método del catálogo existe en la configuración de métodos de pago
        fields = set(re.findall(r'^    ([a-z_]+): NotRequired', inspect.getsource(pmc_params), re.M))
        for m in pm.METHODS:
            self.assertIn(m.key, fields, m.key)

@override_settings(**PLATFORM)
class BookingCheckoutTests(StudioTestCase):
    """El pago de una reserva de clase no ofrece métodos que tardan días."""
    _fake = connect_tests.CheckoutInConnectModeTests._fake
    _book = connect_tests.CheckoutInConnectModeTests._book

    def test_connect_without_booking_configuration_excludes_delayed_methods(self):
        link_account(active=True)
        set_country('PT')
        fake = self._fake()
        r = self._book(fake)
        self.assertEqual(r.status_code, 201, r.content)
        params = fake.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['excluded_payment_method_types'], ['sepa_debit', 'multibanco', 'customer_balance'])
        self.assertNotIn('payment_method_configuration', params)

    def test_keys_mode_excludes_delayed_methods(self):
        enable_keys()
        set_country('MX')
        fake = self._fake()
        r = self._book(fake)
        self.assertEqual(r.status_code, 201, r.content)
        params = fake.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['excluded_payment_method_types'], ['oxxo', 'customer_balance'])
        self.assertEqual(Payment.objects.get().stripe_account, '')

    @override_settings(STRIPE_CONNECT_BOOKING_PMC='pmc_reservas')
    def test_booking_configuration_wins(self):
        link_account(active=True)
        fake = self._fake()
        self._book(fake)
        params = fake.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['payment_method_configuration'], 'pmc_reservas')
        self.assertNotIn('excluded_payment_method_types', params)
