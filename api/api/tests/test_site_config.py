"""Configuración del estudio desde el panel y su versión pública."""
from rest_framework.test import APIClient

from api.models import SiteConfig
from api.tests.factories import StudioTestCase, make_admin, make_client


class SiteConfigTests(StudioTestCase):
    def test_public_config_works_out_of_the_box(self):
        r = APIClient().get('/api/v1/site-config/public/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['studio_name'], 'Mi Estudio')
        self.assertFalse(data['payments_enabled'])
        self.assertEqual(data['stripe_publishable_key'], '')
        # Las claves push se generan solas la primera vez
        self.assertTrue(len(data['vapid_public_key']) > 60)

    def test_public_config_never_leaks_secrets(self):
        cfg = SiteConfig.load()
        cfg.smtp_password = 'super-secreta'
        cfg.stripe_secret_key = 'sk_test_supersecreta'
        cfg.save()
        body = APIClient().get('/api/v1/site-config/public/').content.decode()
        self.assertNotIn('super-secreta', body)
        self.assertNotIn('sk_test', body)

    def test_admin_can_update_branding(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        r = c.patch('/api/v1/site-config/', {
            'studio_name': 'Estudio Luna', 'color_primary': '#112233', 'smtp_password': 'abc',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['studio_name'], 'Estudio Luna')
        self.assertTrue(r.json()['has_smtp_password'])
        self.assertNotIn('smtp_password', r.json())
        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(public['theme']['primary'], '#112233')

    def test_empty_password_keeps_the_stored_one(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        c.patch('/api/v1/site-config/', {'smtp_password': 'abc'}, format='json')
        c.patch('/api/v1/site-config/', {'smtp_password': '', 'smtp_host': 'smtp.gmail.com'}, format='json')
        self.assertEqual(SiteConfig.load().smtp_password, 'abc')

    def test_bad_color_is_rejected(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        r = c.patch('/api/v1/site-config/', {'color_primary': 'rojo'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_clients_cannot_read_admin_config(self):
        c = APIClient()
        c.force_authenticate(make_client())
        self.assertEqual(c.get('/api/v1/site-config/').status_code, 403)

    def test_payment_endpoints_answer_disabled_without_stripe(self):
        c = APIClient()
        c.force_authenticate(make_client())
        r = c.post('/api/v1/checkout/pay-plan/', {'plan_id': 1}, format='json')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()['code'], 'payments_disabled')
