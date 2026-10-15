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


class PanelStyleTests(StudioTestCase):
    """El panel sigue el estilo de la web (o no) y lo sabe sin sesión: lo
    necesita ya en la pantalla de entrada."""

    def test_public_theme_has_style_icons_and_panel_flag(self):
        theme = APIClient().get('/api/v1/site-config/public/').json()['theme']
        self.assertEqual(theme['style'], 'natural')
        self.assertEqual(theme['icons'], 'line')
        self.assertIs(theme['panel_follows_style'], True)

    def test_admin_can_switch_panel_style_off_and_on(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        r = c.patch('/api/v1/site-config/', {'panel_follows_style': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIs(r.json()['panel_follows_style'], False)
        theme = APIClient().get('/api/v1/site-config/public/').json()['theme']
        self.assertIs(theme['panel_follows_style'], False)
        c.patch('/api/v1/site-config/', {'panel_follows_style': True}, format='json')
        self.assertTrue(SiteConfig.load().panel_follows_style)

    def test_clients_cannot_change_panel_style(self):
        c = APIClient()
        c.force_authenticate(make_client())
        r = c.patch('/api/v1/site-config/', {'panel_follows_style': False}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(SiteConfig.load().panel_follows_style)

    def test_panel_manifest_is_dark_with_a_dark_style(self):
        cfg = SiteConfig.load()
        cfg.color_background = '#F5F0EA'
        cfg.color_dark = '#3D3228'
        cfg.save()
        m = self.client.get('/panel.webmanifest').json()
        self.assertEqual((m['background_color'], m['theme_color']), ('#F5F0EA', '#3D3228'))

        # Neón con un fondo claro: el panel usa un fondo oscuro garantizado
        cfg.style_preset = 'neon'
        cfg.save()
        m = self.client.get('/panel.webmanifest').json()
        self.assertNotEqual(m['background_color'], '#F5F0EA')
        self.assertEqual(m['background_color'], m['theme_color'])
        from api.views_site import _luminance
        self.assertLess(_luminance(m['background_color']), 0.06)

        # Fondo ya oscuro: se usa tal cual
        cfg.color_background = '#12122A'
        cfg.save()
        self.assertEqual(self.client.get('/panel.webmanifest').json()['background_color'], '#12122A')

        # Panel con su aspecto clásico: colores de siempre
        cfg.panel_follows_style = False
        cfg.save()
        m = self.client.get('/panel.webmanifest').json()
        self.assertEqual((m['background_color'], m['theme_color']), ('#12122A', '#3D3228'))
