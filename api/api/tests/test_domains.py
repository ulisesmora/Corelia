"""Dominio propio del estudio, configurado desde el panel."""
from unittest import mock

from rest_framework.test import APIClient

from api.models import SiteConfig
from api.tests.factories import StudioTestCase, make_admin
from api.utils.site import api_url, web_url


class DomainTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.c = APIClient()
        self.c.force_authenticate(make_admin())

    def test_domain_is_cleaned_and_used_in_links(self):
        r = self.c.patch('/api/v1/site-config/', {'web_domain': 'HTTPS://www.EstudioLuna.es/inicio'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(SiteConfig.load().web_domain, 'www.estudioluna.es')
        self.assertEqual(web_url('/dashboard'), 'https://www.estudioluna.es/dashboard')
        self.assertEqual(APIClient().get('/api/v1/site-config/public/').json()['site_url'], 'https://www.estudioluna.es')

    def test_invalid_domain_rejected(self):
        r = self.c.patch('/api/v1/site-config/', {'panel_domain': 'mi estudio'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_panel_domain_moves_stripe_webhook(self):
        cfg = SiteConfig.load()
        cfg.payments_enabled = True
        cfg.stripe_secret_key = 'sk_test_x'
        cfg.stripe_webhook_id = 'we_old'
        cfg.save()
        fake = {'webhook_id': 'we_new', 'webhook_secret': 'whsec_new', 'account_id': 'acct', 'account_name': 'x', 'live_mode': False}
        with mock.patch('api.utils.payments.connect_stripe', return_value=fake) as connect:
            self.c.patch('/api/v1/site-config/', {'panel_domain': 'panel.estudioluna.es'}, format='json')
        connect.assert_called_once_with('sk_test_x', 'https://panel.estudioluna.es/api/v1/webhooks/listener/')
        cfg = SiteConfig.load()
        self.assertEqual(cfg.stripe_webhook_id, 'we_new')
        self.assertEqual(cfg.stripe_webhook_secret, 'whsec_new')
        self.assertEqual(api_url(), 'https://panel.estudioluna.es')

    def test_check_domain_reports_not_ready(self):
        import requests
        with mock.patch('requests.get', side_effect=requests.exceptions.ConnectionError()):
            r = self.c.post('/api/v1/site-config/check-domain/', {'domain': 'www.estudioluna.es'}, format='json')
        self.assertFalse(r.json()['ok'])
        self.assertIn('DNS', r.json()['error'])

    def test_check_domain_ok_for_panel(self):
        resp = mock.Mock(ok=True, status_code=200, text='ok')
        with mock.patch('requests.get', return_value=resp):
            r = self.c.post('/api/v1/site-config/check-domain/', {'domain': 'panel.estudioluna.es', 'kind': 'panel'}, format='json')
        self.assertTrue(r.json()['ok'])
