"""Moneda y país del estudio: formato de importes, unidad mínima de Stripe y
que TODO el dinero (checkout, cupones, reembolsos, webhooks) vaya en la
moneda del estudio. Stripe siempre simulado (mock): nada sale a internet."""
import re
from datetime import datetime, timedelta, timezone as dt_tz
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Booking, Coupon, GuestProfile, Payment, Plan, SiteConfig
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio, madrid, next_weekday
from api.utils.locale import NBSP, money
from api.utils.payments import from_stripe_amount, to_stripe_amount


def _set_studio(**fields):
    cfg = SiteConfig.load()
    for k, v in fields.items():
        setattr(cfg, k, v)
    cfg.save()
    return cfg


def _enable_stripe():
    # Clave falsa: stripe_ready() solo comprueba que haya una; las llamadas van a mocks
    _set_studio(payments_enabled=True, stripe_secret_key='sk_test_falsa_para_tests',
                stripe_publishable_key='pk_test_falsa')


class MoneyFormatTests(StudioTestCase):
    def test_format_per_currency(self):
        s = NBSP
        cases = [
            ((29, 'EUR', 'es-ES'), f'29,00{s}€'),
            ((1234.5, 'EUR', 'es-ES'), f'1234,50{s}€'),      # es-ES no agrupa 4 cifras
            ((12345.5, 'EUR', 'es-ES'), f'12.345,50{s}€'),
            ((29, 'EUR', 'en-IE'), '€29.00'),
            ((29, 'USD', 'en-US'), '$29.00'),
            ((29, 'USD', 'es-ES'), f'29,00{s}US$'),
            ((29, 'USD', 'es-MX'), 'US$29.00'),
            ((549, 'MXN', 'es-MX'), f'$549.00{s}MXN'),
            ((1549, 'MXN', 'en-US'), 'MX$1,549.00'),
            ((29, 'CAD', 'en-CA'), f'$29.00{s}CAD'),
            ((29, 'GBP', 'en-GB'), '£29.00'),
            ((120000, 'COP', 'es-CO'), f'${s}120.000,00{s}COP'),
            ((1500, 'ARS', 'es-AR'), f'${s}1.500,00{s}ARS'),
            ((15990, 'CLP', 'es-CL'), f'$15.990{s}CLP'),
            ((15990.6, 'CLP', 'es-CL'), f'$15.991{s}CLP'),   # sin decimales: redondea
            ((29.9, 'PEN', 'es-PE'), f'S/{s}29.90'),
            ((29, 'BRL', 'pt-BR'), f'R${s}29,00'),
            ((1290, 'CHF', 'es-CH'), f'CHF{s}1’290.00'),
            ((-5, 'EUR', 'es-ES'), f'-5,00{s}€'),
        ]
        for args, expected in cases:
            with self.subTest(args=args):
                self.assertEqual(money(*args), expected)

    def test_trim_and_rounding(self):
        self.assertEqual(money(30, 'EUR', 'es-ES', trim=True), f'30{NBSP}€')
        self.assertEqual(money(30.5, 'EUR', 'es-ES', trim=True), f'30,50{NBSP}€')
        self.assertEqual(money('12.345', 'EUR', 'es-ES'), f'12,35{NBSP}€')  # ROUND_HALF_UP
        self.assertEqual(money(None, 'EUR', 'es-ES'), f'0,00{NBSP}€')

    def test_defaults_come_from_the_studio(self):
        self.assertEqual(money(29), f'29,00{NBSP}€')  # España/EUR por defecto
        _set_studio(country='MX', currency='MXN')
        self.assertEqual(money(549), f'$549.00{NBSP}MXN')
        self.assertEqual(money(549, locale='en'), '$549.00 MXN'.replace(' ', NBSP))
        _set_studio(country='US', currency='USD')
        self.assertEqual(money(29), '$29.00')
        # Un pago antiguo se formatea con SU moneda
        self.assertEqual(money(29, 'eur'), f'€29.00')


class StripeAmountTests(StudioTestCase):
    def test_two_decimal_currencies(self):
        self.assertEqual(to_stripe_amount(Decimal('29.90'), 'EUR'), 2990)
        self.assertEqual(to_stripe_amount(Decimal('19.99'), 'usd'), 1999)
        self.assertEqual(to_stripe_amount(549, 'MXN'), 54900)
        self.assertEqual(to_stripe_amount(Decimal('0.125'), 'EUR'), 13)  # redondeo, no truncado
        # COP NO es «sin decimales» en Stripe: se multiplica por 100
        self.assertEqual(to_stripe_amount(120000, 'COP'), 12000000)
        self.assertEqual(from_stripe_amount(2990, 'eur'), Decimal('29.90'))
        self.assertEqual(from_stripe_amount(12000000, 'cop'), Decimal('120000.00'))

    def test_zero_decimal_currencies(self):
        self.assertEqual(to_stripe_amount(15990, 'CLP'), 15990)
        self.assertEqual(to_stripe_amount(Decimal('15990.6'), 'clp'), 15991)
        self.assertEqual(to_stripe_amount(500, 'JPY'), 500)
        self.assertEqual(from_stripe_amount(15990, 'clp'), Decimal(15990))
        self.assertEqual(from_stripe_amount(500, 'JPY'), Decimal(500))

    def test_special_cases_whole_units_with_two_decimals(self):
        # ISK y UGX: sin decimales, pero Stripe los quiere como «x 100»
        self.assertEqual(to_stripe_amount(5, 'UGX'), 500)
        self.assertEqual(to_stripe_amount(Decimal('5.4'), 'ISK'), 500)


class SiteConfigLocaleTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.c = APIClient()
        self.c.force_authenticate(make_admin())

    def test_admin_sets_country_and_currency(self):
        r = self.c.patch('/api/v1/site-config/', {'country': 'mx', 'currency': 'mxn'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['country'], 'MX')
        self.assertEqual(r.json()['currency'], 'MXN')
        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(public['currency'], 'MXN')
        self.assertEqual(public['country'], 'MX')

    def test_unsupported_values_are_rejected_in_spanish(self):
        r = self.c.patch('/api/v1/site-config/', {'currency': 'BTC'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Elige una de las monedas', r.json()['currency'][0])
        r = self.c.patch('/api/v1/site-config/', {'country': 'XX'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('país', r.json()['country'][0])
        self.assertEqual(SiteConfig.load().currency, 'EUR')

    def test_admin_gets_options_and_old_payment_currencies(self):
        Payment.objects.create(amount_eur=10, currency='eur', status='succeeded')
        Payment.objects.create(amount_eur=20, currency='EUR', status='succeeded')
        Payment.objects.create(amount_eur=5, currency='EUR', status='pending')
        data = self.c.get('/api/v1/site-config/').json()
        codes = {c['code'] for c in data['locale_options']['currencies']}
        self.assertTrue({'EUR', 'USD', 'MXN', 'CAD', 'GBP', 'COP', 'ARS', 'CLP', 'PEN', 'BRL', 'CHF'} <= codes)
        mx = next(c for c in data['locale_options']['countries'] if c['code'] == 'MX')
        self.assertEqual((mx['name'], mx['currency']), ('México', 'MXN'))
        self.assertEqual(data['payment_currencies'], [{'currency': 'EUR', 'count': 2}])

    def test_changing_currency_never_converts_old_payments(self):
        old = Payment.objects.create(amount_eur=Decimal('29.00'), currency='eur', status='succeeded')
        self.c.patch('/api/v1/site-config/', {'currency': 'USD', 'country': 'US'}, format='json')
        old.refresh_from_db()
        self.assertEqual((old.amount_eur, old.currency), (Decimal('29.00'), 'EUR'))

    def test_stats_only_add_the_studio_currency(self):
        Payment.objects.create(amount_eur=Decimal('29.00'), currency='EUR', status='succeeded')
        _set_studio(currency='USD', country='US')
        Payment.objects.create(amount_eur=Decimal('40.00'), currency='USD', status='succeeded')
        from api.utils.stats import dashboard_stats
        data = dashboard_stats()
        self.assertEqual(data['currency'], 'USD')
        self.assertEqual(data['kpis']['sales_eur'], 40.0)
        self.assertEqual(data['other_currency_payments'], 1)


class CheckoutCurrencyTests(StudioTestCase):
    """El checkout de Stripe cobra en la moneda del estudio (Stripe simulado)."""

    def setUp(self):
        super().setUp()
        _enable_stripe()
        self.sched = make_studio()
        self.sched.class_type.default_price_eur = Decimal('549')
        self.sched.class_type.save()
        day = next_weekday(self.sched.weekday, min_days=2)
        self.start = madrid(day, 10)
        self.end = madrid(day, 10, 55)

    def _cart(self):
        return [{'id_source': self.sched.id, 'sessionDate': self.start.isoformat(),
                 'sessionDateEnd': self.end.isoformat()}]

    def _post(self, **extra):
        session = SimpleNamespace(client_secret='cs_secret_falso', id='cs_test_1')
        with mock.patch('api.views.stripe.checkout.Session.create', return_value=session) as create, \
                mock.patch('api.views.stripe.Coupon.create', return_value=SimpleNamespace(id='co_1')) as coupon:
            r = APIClient().post('/api/v1/checkout/create-session/', {
                'email': 'invitada@test.local', 'name': 'Inés', 'cart_items': self._cart(), **extra,
            }, format='json')
        return r, create, coupon

    def test_guest_checkout_uses_studio_currency(self):
        _set_studio(country='MX', currency='MXN')
        r, create, _ = self._post()
        self.assertEqual(r.status_code, 201, r.content)
        item = create.call_args.kwargs['line_items'][0]['price_data']
        self.assertEqual(item['currency'], 'mxn')
        self.assertEqual(item['unit_amount'], 54900)
        self.assertEqual(Payment.objects.get().currency, 'MXN')

    def test_zero_decimal_currency_is_not_multiplied(self):
        _set_studio(country='CL', currency='CLP')
        self.sched.class_type.default_price_eur = Decimal('15990')
        self.sched.class_type.save()
        r, create, _ = self._post()
        self.assertEqual(r.status_code, 201, r.content)
        item = create.call_args.kwargs['line_items'][0]['price_data']
        self.assertEqual((item['currency'], item['unit_amount']), ('clp', 15990))

    def test_fixed_amount_coupon_in_studio_currency(self):
        _set_studio(country='CL', currency='CLP')
        self.sched.class_type.default_price_eur = Decimal('15990')
        self.sched.class_type.save()
        now = timezone.now()
        Coupon.objects.create(code='MENOS2000', discount_type='amount', value=Decimal('2000'),
                              valid_from=now - timedelta(days=1), valid_to=now + timedelta(days=30))
        r, _, coupon = self._post(couponCode='MENOS2000')
        self.assertEqual(r.status_code, 201, r.content)
        params = coupon.call_args.kwargs
        self.assertEqual((params['amount_off'], params['currency']), (2000, 'clp'))
        self.assertEqual(Payment.objects.get().amount_eur, Decimal('13990'))

    def test_plan_checkout_uses_studio_currency(self):
        _set_studio(country='US', currency='USD')
        plan = Plan.objects.create(name='Bono 10', credits=10, price_eur=Decimal('129.90'), type='pack')
        c = APIClient()
        c.force_authenticate(make_client(credits=0))
        session = SimpleNamespace(client_secret='cs_secret_falso', id='cs_test_2')
        with mock.patch('api.views.stripe.checkout.Session.create', return_value=session) as create:
            r = c.post('/api/v1/checkout/pay-plan/', {'plan_id': plan.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        item = create.call_args.kwargs['line_items'][0]['price_data']
        self.assertEqual((item['currency'], item['unit_amount']), ('usd', 12990))
        self.assertEqual(Payment.objects.get().currency, 'USD')

    def test_webhook_reads_amount_in_payment_currency(self):
        from api.views import StripeWebhookView
        _set_studio(country='CL', currency='CLP')
        guest = GuestProfile.objects.create(name='Inés', email='ines@test.local')
        payment = Payment.objects.create(guest=guest, amount_eur=Decimal('15990'), currency='CLP', status='pending')
        Booking.objects.create(guest=guest, payment=payment, occurrence=self.sched,
                               start_datetime=self.start, end_datetime=self.end, status='pending')
        session = {'id': 'cs_test_3', 'payment_intent': 'pi_1', 'amount_total': 15990, 'currency': 'clp',
                   'metadata': {'local_payment_id': str(payment.id)}}
        with mock.patch('api.utils.emailing.send_templated_email', return_value=True), \
                mock.patch('api.signals.send_templated_email', return_value=True):
            StripeWebhookView()._fulfill_booking_purchase(session)
        payment.refresh_from_db()
        self.assertEqual((payment.amount_eur, payment.currency, payment.status), (Decimal('15990'), 'CLP', 'succeeded'))

    def test_session_amount_for_analytics(self):
        from api.views import _session_amount
        self.assertEqual(_session_amount({'amount_total': 15990, 'currency': 'clp'}),
                         {'amount_total': '15990', 'currency': 'CLP'})
        self.assertEqual(_session_amount({'amount_total': 2990, 'currency': 'eur'}),
                         {'amount_total': '29.90', 'currency': 'EUR'})


class GuestRefundCurrencyTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        _enable_stripe()
        self.sched = make_studio()
        self.sched.class_type.default_price_eur = Decimal('15990')
        self.sched.class_type.save()
        self.guest = GuestProfile.objects.create(name='Inés', email='ines@test.local')
        start = datetime.now(dt_tz.utc) + timedelta(days=3)
        self.payment = Payment.objects.create(guest=self.guest, amount_eur=Decimal('15990'), currency='CLP',
                                              status='pending', stripe_payment_intent_id='pi_1')
        self.booking = Booking.objects.create(guest=self.guest, payment=self.payment, occurrence=self.sched,
                                              start_datetime=start, end_datetime=start + timedelta(hours=1),
                                              status='reserved')

    def _refund(self):
        from api.utils.guest_refund import refund_guest_booking_stripe
        pi = {'amount_received': 15990, 'latest_charge': {'amount_refunded': 0}}
        with mock.patch('stripe.PaymentIntent.retrieve', return_value=pi), \
                mock.patch('stripe.Refund.create') as refund:
            amount = refund_guest_booking_stripe(self.booking, reason='test')
        return amount, refund

    def test_refund_in_zero_decimal_currency(self):
        _set_studio(country='CL', currency='CLP')
        amount, refund = self._refund()
        self.assertEqual(amount, 15990)
        self.assertEqual(refund.call_args.kwargs['amount'], 15990)

    def test_no_automatic_refund_if_studio_changed_currency(self):
        _set_studio(country='MX', currency='MXN')  # el pago se cobró en CLP
        with self.assertLogs('api.utils.guest_refund', level='CRITICAL'):
            amount, refund = self._refund()
        self.assertEqual(amount, 0)
        refund.assert_not_called()


class EmailAmountTests(StudioTestCase):
    def test_purchase_email_uses_payment_currency(self):
        _set_studio(country='MX', currency='MXN')
        user = make_client(credits=0)
        with mock.patch('api.signals.send_templated_email', return_value=True) as send:
            Payment.objects.create(user=user, amount_eur=Decimal('549'), currency='mxn', status='succeeded')
        data = next(c.kwargs['dynamic_data'] for c in send.call_args_list
                    if c.kwargs.get('template_id') == 'plan-purchase')
        self.assertEqual(data['payment_total'], f'$549.00{NBSP}MXN')


class NoHardcodedEuroTests(StudioTestCase):
    def test_payment_code_has_no_fixed_eur(self):
        """Ningún 'eur' escrito a mano en el código de pagos: todo sale de la
        moneda del estudio (o de la guardada en el pago)."""
        root = Path(__file__).resolve().parents[1]
        files = [root / 'views.py', root / 'views_site.py', root / 'signals.py', root / 'tasks.py',
                 *sorted((root / 'utils').glob('*.py'))]
        pattern = re.compile(r'''['"]eur['"]|€\{|\{[^}]*\}\s*€''')
        offenders = [f'{f.name}:{i}' for f in files
                     for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1)
                     if pattern.search(line)]
        self.assertEqual(offenders, [])
