"""Stripe con las dos formas de la API: la anterior a 2025-03-31.basil
(invoice.subscription, subscription.current_period_*) y la actual
(invoice.parent.subscription_details.subscription, items.data[0].current_period_*).
Además: todo pasa por stripe_client(), nunca por `stripe.api_key` global.
Stripe siempre simulado: nada sale a internet."""
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone as dt_tz
from decimal import Decimal
from unittest import mock

import stripe
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from api.models import CreditLedgerEntry, Plan, SiteConfig, Subscription
from api.tests.factories import StudioTestCase, make_admin, make_client
from api.views import (
    CreateStripeSubscriptionView, StripeWebhookView, _invoice_subscription_id, _subscription_client_secret,
    _subscription_period,
)

START = 1_790_000_000
END = START + 30 * 24 * 3600


def _ts(value):
    return datetime.fromtimestamp(value, tz=dt_tz.utc)


def _enable_stripe(webhook_secret='whsec_falso'):
    cfg = SiteConfig.load()
    cfg.payments_enabled = True
    cfg.stripe_secret_key = 'sk_test_falsa_para_tests'
    cfg.stripe_publishable_key = 'pk_test_falsa'
    cfg.stripe_webhook_secret = webhook_secret
    cfg.save()


def _invoice(new_shape, sub_id='sub_1', invoice_id='in_1'):
    invoice = {
        'id': invoice_id,
        'object': 'invoice',
        'billing_reason': 'subscription_cycle',
        'lines': {'data': [{'period': {'start': START, 'end': END}}]},
    }
    if new_shape:
        invoice['parent'] = {'type': 'subscription_details',
                             'subscription_details': {'subscription': sub_id}}
    else:
        invoice['subscription'] = sub_id
    return invoice


def _subscription(new_shape, sub_id='sub_1', status='active'):
    sub = {'id': sub_id, 'object': 'subscription', 'status': status, 'cancel_at_period_end': False}
    item = {'id': 'si_1', 'object': 'subscription_item'}
    if new_shape:
        item.update(current_period_start=START, current_period_end=END)
    else:
        sub.update(current_period_start=START, current_period_end=END)
    sub['items'] = {'object': 'list', 'data': [item]}
    return sub


class HelperTests(StudioTestCase):
    def test_invoice_subscription_both_shapes(self):
        self.assertEqual(_invoice_subscription_id(_invoice(new_shape=True)), 'sub_1')
        self.assertEqual(_invoice_subscription_id(_invoice(new_shape=False)), 'sub_1')
        # Igual con objetos reales de la librería y con el campo expandido
        obj = stripe.StripeObject.construct_from(_invoice(new_shape=True), 'sk_test_x')
        self.assertEqual(_invoice_subscription_id(obj), 'sub_1')
        expanded = _invoice(new_shape=False)
        expanded['subscription'] = {'id': 'sub_9', 'object': 'subscription'}
        self.assertEqual(_invoice_subscription_id(expanded), 'sub_9')
        # Factura sin suscripción (pago suelto)
        self.assertIsNone(_invoice_subscription_id({'id': 'in_2', 'parent': None}))

    def test_subscription_period_both_shapes(self):
        self.assertEqual(_subscription_period(_subscription(new_shape=True)), (START, END))
        self.assertEqual(_subscription_period(_subscription(new_shape=False)), (START, END))
        obj = stripe.StripeObject.construct_from(_subscription(new_shape=True), 'sk_test_x')
        self.assertEqual(_subscription_period(obj), (START, END))
        self.assertEqual(_subscription_period({'id': 'sub_1'}), (None, None))

    def test_client_secret_both_shapes(self):
        new = {'latest_invoice': {'confirmation_secret': {'client_secret': 'pi_new_secret'}}}
        old = {'latest_invoice': {'payment_intent': {'client_secret': 'pi_old_secret'}}}
        self.assertEqual(_subscription_client_secret(new), 'pi_new_secret')
        self.assertEqual(_subscription_client_secret(old), 'pi_old_secret')
        self.assertIsNone(_subscription_client_secret({'latest_invoice': None}))


class WebhookShapesTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        _enable_stripe()
        self.user = make_client(credits=0)
        self.plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        now = timezone.now()
        self.sub = Subscription.objects.create(
            user=self.user, plan=self.plan, status='active',
            current_period_start=now - timedelta(days=30), current_period_end=now,
            stripe_subscription_id='sub_1',
        )

    def _granted(self):
        return CreditLedgerEntry.objects.filter(wallet__user=self.user, kind='grant',
                                                metadata__stripe_invoice_id='in_1').count()

    def test_invoice_paid_renews_with_both_shapes(self):
        for new_shape in (True, False):
            with self.subTest(new_shape=new_shape):
                CreditLedgerEntry.objects.filter(wallet__user=self.user).delete()
                StripeWebhookView()._handle_invoice_paid(_invoice(new_shape))
                self.assertEqual(self._granted(), 1)
                self.sub.refresh_from_db()
                self.assertEqual(self.sub.current_period_start, _ts(START))
                self.assertEqual(self.sub.current_period_end, _ts(END))

    def test_subscription_updated_reads_both_period_shapes(self):
        for new_shape in (True, False):
            with self.subTest(new_shape=new_shape):
                Subscription.objects.filter(pk=self.sub.pk).update(
                    current_period_start=timezone.now(), current_period_end=timezone.now())
                StripeWebhookView()._handle_subscription_updated(_subscription(new_shape))
                self.sub.refresh_from_db()
                self.assertEqual(self.sub.current_period_start, _ts(START))
                self.assertEqual(self.sub.current_period_end, _ts(END))

    def test_signed_webhook_end_to_end_without_global_api_key(self):
        """El webhook valida la firma con StripeClient.construct_event y no
        necesita (ni toca) stripe.api_key."""
        payload = json.dumps({
            'id': 'evt_1', 'object': 'event', 'type': 'invoice.paid',
            'data': {'object': _invoice(new_shape=True)},
        })
        ts = int(time.time())
        sig = hmac.new(b'whsec_falso', f'{ts}.{payload}'.encode(), hashlib.sha256).hexdigest()
        with mock.patch.object(stripe, 'api_key', None):
            r = APIClient().post('/api/v1/webhooks/listener/', data=payload, content_type='application/json',
                                 HTTP_STRIPE_SIGNATURE=f't={ts},v1={sig}')
            self.assertIsNone(stripe.api_key)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._granted(), 1)

    def test_webhook_rejects_missing_signature(self):
        r = APIClient().post('/api/v1/webhooks/listener/', data='{}', content_type='application/json')
        self.assertEqual(r.status_code, 400)


class CreateStripeSubscriptionTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        _enable_stripe()
        self.user = make_client(credits=0)
        self.user.stripe_customer_id = 'cus_1'
        self.user.save(update_fields=['stripe_customer_id'])
        self.plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub',
                                        stripe_price_id='price_1')
        self.admin = make_admin()

    def _post(self):
        # Se llama a la vista directamente: en urls.py la ruta
        # v1/subscriptions/create-stripe/ queda detrás del router
        # (subscriptions/<pk>/) y responde 405.
        request = APIRequestFactory().post('/api/v1/subscriptions/create-stripe/',
                                           {'user_id': self.user.id, 'plan_id': self.plan.id}, format='json')
        force_authenticate(request, user=self.admin)
        response = CreateStripeSubscriptionView.as_view()(request)
        response.render()
        return response

    def _create(self, stripe_sub):
        fake = mock.MagicMock()
        fake.v1.subscriptions.create.return_value = stripe.StripeObject.construct_from(stripe_sub, 'sk_test_x')
        with mock.patch('api.utils.payments.stripe_client', return_value=fake):
            r = self._post()
        return r, fake.v1.subscriptions.create

    def test_both_period_shapes(self):
        for new_shape in (True, False):
            with self.subTest(new_shape=new_shape):
                sub = _subscription(new_shape, sub_id=f'sub_{int(new_shape)}')
                if new_shape:
                    sub['latest_invoice'] = {'confirmation_secret': {'client_secret': 'secret_new'}}
                else:
                    sub['latest_invoice'] = {'payment_intent': {'client_secret': 'secret_old'}}
                r, create = self._create(sub)
                self.assertEqual(r.status_code, 201, r.content)
                self.assertEqual(r.data['client_secret'], 'secret_new' if new_shape else 'secret_old')
                params = create.call_args.kwargs['params']
                self.assertEqual(params['customer'], 'cus_1')
                self.assertEqual(params['expand'], ['latest_invoice.confirmation_secret'])
                local = Subscription.objects.get(stripe_subscription_id=sub['id'])
                self.assertEqual(local.current_period_start, _ts(START))
                self.assertEqual(local.current_period_end, _ts(END))

    def test_payments_disabled(self):
        with mock.patch('api.utils.payments.stripe_client', return_value=None):
            r = self._post()
        self.assertEqual(r.status_code, 503)


class NoGlobalApiKeyTests(StudioTestCase):
    def test_stripe_client_and_deprecated_alias_leave_global_untouched(self):
        from api.utils.payments import stripe_client, stripe_ready
        with mock.patch.object(stripe, 'api_key', None):
            self.assertIsNone(stripe_client())
            self.assertFalse(stripe_ready())
            _enable_stripe()
            client = stripe_client()
            self.assertIsInstance(client, stripe.StripeClient)
            self.assertTrue(stripe_ready())
            self.assertIsNone(stripe.api_key)
