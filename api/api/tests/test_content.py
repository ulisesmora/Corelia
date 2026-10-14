"""Contenido de la web (preguntas frecuentes), iconos y login con Google."""
from unittest import mock

from rest_framework.test import APIClient

from api.models import FAQItem, SiteConfig, User
from api.tests.factories import StudioTestCase, make_admin


class FAQTests(StudioTestCase):
    def test_public_sees_only_active_and_by_page(self):
        FAQItem.objects.create(question='¿Visible?', answer='Sí', page='home')
        FAQItem.objects.create(question='¿Precios?', answer='Sí', page='prices')
        FAQItem.objects.create(question='¿Oculta?', answer='No', is_active=False)
        r = APIClient().get('/api/v1/faqs/?page=home')
        self.assertEqual([f['question'] for f in r.json()], ['¿Visible?'])

    def test_only_admin_can_edit(self):
        self.assertIn(APIClient().post('/api/v1/faqs/', {'question': 'x', 'answer': 'y'}).status_code, (401, 403))
        c = APIClient()
        c.force_authenticate(make_admin())
        self.assertEqual(c.post('/api/v1/faqs/', {'question': 'x', 'answer': 'y'}, format='json').status_code, 201)


class IconTests(StudioTestCase):
    def test_icons_and_og_image_are_generated(self):
        with mock.patch('api.utils.brand_images._google_font_bytes', return_value=None):
            for size in (32, 180, 192, 512):
                r = self.client.get(f'/api/v1/site-config/icon/{size}.png')
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r['Content-Type'], 'image/png')
            self.assertEqual(self.client.get('/api/v1/site-config/icon/512.png?maskable=1').status_code, 200)
            self.assertEqual(self.client.get('/api/v1/site-config/og.png').status_code, 200)
            badge = self.client.get('/api/v1/site-config/badge.png')
            self.assertEqual(badge.status_code, 200)
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(badge.content))
            self.assertEqual(img.mode, 'RGBA')
            self.assertEqual(img.getpixel((0, 0))[3], 0)  # fondo transparente
        self.assertEqual(self.client.get('/api/v1/site-config/icon/13.png').status_code, 404)

    def test_public_config_points_to_icons(self):
        icons = APIClient().get('/api/v1/site-config/public/').json()['icons']
        self.assertEqual(icons['apple_touch'], '/api/v1/site-config/icon/180.png')


GOOGLE_INFO = {'email': 'Nueva@Gmail.com', 'email_verified': True, 'given_name': 'Nora', 'family_name': 'Gil'}


class GoogleLoginTests(StudioTestCase):
    def _login(self, info=GOOGLE_INFO):
        with mock.patch('google.oauth2.id_token.verify_oauth2_token', return_value=info):
            return APIClient().post('/api/google-login/', {'credential': 'tok'}, format='json')

    def test_disabled_without_client_id(self):
        self.assertEqual(self._login().status_code, 503)

    def test_creates_account_then_logs_in(self):
        cfg = SiteConfig.load()
        cfg.google_client_id = '123.apps.googleusercontent.com'
        cfg.save()
        r = self._login()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['created'])
        user = User.objects.get(email='nueva@gmail.com')
        self.assertTrue(user.is_verified)
        self.assertFalse(user.has_usable_password())
        again = self._login()
        self.assertFalse(again.json()['created'])
        self.assertEqual(User.objects.filter(email__iexact='nueva@gmail.com').count(), 1)

    def test_unverified_google_email_rejected(self):
        cfg = SiteConfig.load()
        cfg.google_client_id = '123.apps.googleusercontent.com'
        cfg.save()
        self.assertEqual(self._login({**GOOGLE_INFO, 'email_verified': False}).status_code, 400)

    def test_admin_accounts_cannot_use_web_google_login(self):
        cfg = SiteConfig.load()
        cfg.google_client_id = '123.apps.googleusercontent.com'
        cfg.save()
        make_admin('nueva@gmail.com')
        self.assertEqual(self._login().status_code, 403)
