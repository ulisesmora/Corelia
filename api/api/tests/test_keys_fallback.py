"""STRIPE_KEYS_FALLBACK_ENABLED: el plan B de pegar claves propias de Stripe
(Ajustes → Cobros → «Avanzado») se puede quitar en un servicio gestionado,
donde todos cobran con «Conectar pagos»."""
from unittest import mock

from django.test import override_settings
from rest_framework.test import APIClient

from api.models import SiteConfig
from api.tests.factories import StudioTestCase, make_admin
from api.utils import payments

STATUS_URL = '/api/v1/site-config/stripe/connect/status/'
KEYS_URL = '/api/v1/site-config/stripe/'
KEYS = {'secret_key': 'sk_test_abc', 'publishable_key': 'pk_test_abc'}


class KeysFallbackTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_on_by_default(self):
        self.assertTrue(payments.keys_fallback_enabled())
        r = self.admin.get(STATUS_URL)
        self.assertEqual(r.status_code, 200)
        self.assertIs(r.json()['keys_fallback'], True)

    @override_settings(STRIPE_KEYS_FALLBACK_ENABLED=False)
    def test_off_in_status(self):
        r = self.admin.get(STATUS_URL)
        self.assertIs(r.json()['keys_fallback'], False)

    @override_settings(STRIPE_KEYS_FALLBACK_ENABLED=False)
    def test_off_refuses_new_keys(self):
        with mock.patch('api.utils.payments.connect_stripe') as connect:
            r = self.admin.post(KEYS_URL, KEYS, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()['code'], 'keys_disabled')
        connect.assert_not_called()
        self.assertFalse(SiteConfig.load().payments_enabled)

    @override_settings(STRIPE_KEYS_FALLBACK_ENABLED=False)
    def test_off_still_disconnects_saved_keys(self):
        cfg = SiteConfig.load()
        cfg.payments_enabled = True
        cfg.stripe_secret_key = 'sk_test_old'
        cfg.stripe_publishable_key = 'pk_test_old'
        cfg.payments_provider = 'keys'
        cfg.save()
        r = self.admin.delete(KEYS_URL)  # sin webhook guardado: no llama a Stripe
        self.assertIn(r.status_code, (200, 204))
        self.assertFalse(SiteConfig.load().payments_enabled)

    @override_settings(STRIPE_KEYS_FALLBACK_ENABLED=True)
    def test_on_still_validates_keys(self):
        r = self.admin.post(KEYS_URL, {'secret_key': 'sk_test_abc', 'publishable_key': 'nope'}, format='json')
        self.assertEqual(r.status_code, 400)
