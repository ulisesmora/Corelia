"""Google Business, redes, verificación de buscadores y analítica/publicidad
(GA4, Google Ads, píxel de Meta) en la configuración del estudio, y preguntas
frecuentes de ejemplo (is_sample)."""
from django.core.management import call_command
from rest_framework.test import APIClient

from api.models import FAQItem, SiteConfig
from api.tests.factories import StudioTestCase, make_admin

TRACKING_FIELDS = (
    'google_business_url', 'google_review_url', 'facebook_url', 'tiktok_url', 'youtube_url',
    'google_site_verification', 'bing_site_verification', 'ga4_measurement_id', 'google_ads_id',
    'google_ads_purchase_label', 'google_ads_signup_label', 'meta_pixel_id',
)


class TrackingConfigValidationTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.c = APIClient()
        self.c.force_authenticate(make_admin())

    def patch(self, **data):
        return self.c.patch('/api/v1/site-config/', data, format='json')

    def assertSaved(self, field, sent, expected):
        r = self.patch(**{field: sent})
        self.assertEqual(r.status_code, 200, f'{field}={sent!r}: {r.content!r}')
        self.assertEqual(r.json()[field], expected)
        self.assertEqual(getattr(SiteConfig.load(), field), expected)

    def assertRejected(self, field, sent):
        r = self.patch(**{field: sent})
        self.assertEqual(r.status_code, 400, f'{field}={sent!r} debería rechazarse')
        self.assertIn(field, r.json())
        msg = str(r.json()[field])
        self.assertTrue(msg and '<script' not in msg.lower())
        return msg

    # ── Enlaces ──
    def test_social_urls_valid(self):
        self.assertSaved('google_business_url', 'https://maps.app.goo.gl/AbCdEf123', 'https://maps.app.goo.gl/AbCdEf123')
        self.assertSaved('google_review_url', 'https://g.page/r/CXyz123abc/review', 'https://g.page/r/CXyz123abc/review')
        self.assertSaved('facebook_url', 'https://www.facebook.com/estudioluna', 'https://www.facebook.com/estudioluna')
        self.assertSaved('tiktok_url', 'https://www.tiktok.com/@estudioluna', 'https://www.tiktok.com/@estudioluna')
        self.assertSaved('youtube_url', 'http://youtube.com/@estudioluna', 'http://youtube.com/@estudioluna')

    def test_social_url_without_scheme_gets_https(self):
        self.assertSaved('facebook_url', '  facebook.com/estudioluna ', 'https://facebook.com/estudioluna')

    def test_social_urls_invalid(self):
        for bad in ('javascript:alert(1)', 'ftp://example.com/x', 'no es un enlace',
                    'https://exa mple.com', '"><script>alert(1)</script>', 'data:text/html,hola'):
            msg = self.assertRejected('google_business_url', bad)
            self.assertIn('https://', msg)
        self.assertRejected('youtube_url', 'https://' + 'a' * 300 + '.com')

    def test_social_urls_can_be_cleared(self):
        self.assertSaved('facebook_url', 'https://facebook.com/x', 'https://facebook.com/x')
        self.assertSaved('facebook_url', '', '')

    # ── Verificación de buscadores ──
    def test_google_verification_code(self):
        code = 'aBcD_1234-efGH5678ijkl9012mnop3456qrst7890uv'
        self.assertSaved('google_site_verification', code, code)
        self.assertSaved('google_site_verification', f'  {code}  ', code)

    def test_google_verification_full_meta_tag_keeps_only_code(self):
        code = 'Zx9_yW8-vU7tS6rQ5pO4nM3lK2jI1hG0fEdCbA12345'
        self.assertSaved('google_site_verification',
                         f'<meta name="google-site-verification" content="{code}" />', code)
        self.assertSaved('google_site_verification',
                         f"<meta content='{code}' name='google-site-verification'>", code)
        # Registro TXT del método DNS
        self.assertSaved('google_site_verification', f'google-site-verification={code}', code)

    def test_google_verification_invalid(self):
        for bad in ('corto', '<meta name="google-site-verification" content="x"><script>alert(1)</script>',
                    'abc def ghi jkl mno', 'código-con-acentos-áé', 'a' * 121):
            self.assertRejected('google_site_verification', bad)

    def test_bing_verification(self):
        code = '0123456789ABCDEF0123456789ABCDEF'
        self.assertSaved('bing_site_verification', code, code)
        self.assertSaved('bing_site_verification', f'<meta name="msvalidate.01" content="{code}" />', code)
        for bad in ('1234567', 'ABC-DEF-123456', '<script>x</script>'):
            self.assertRejected('bing_site_verification', bad)

    # ── Analítica y publicidad ──
    def test_ga4_id_normalized(self):
        self.assertSaved('ga4_measurement_id', 'G-AB12CD34EF', 'G-AB12CD34EF')
        self.assertSaved('ga4_measurement_id', ' g-ab12 cd34ef ', 'G-AB12CD34EF')

    def test_ga4_id_invalid(self):
        for bad in ('UA-12345-1', 'AB12CD34EF', 'G-', 'G-ABC', 'G-AB12CD34EF0123456', "G-ABCD');alert(1);//"):
            msg = self.assertRejected('ga4_measurement_id', bad)
            self.assertIn('G-', msg)

    def test_google_ads_id(self):
        self.assertSaved('google_ads_id', 'AW-123456789', 'AW-123456789')
        self.assertSaved('google_ads_id', 'aw-123456789', 'AW-123456789')
        self.assertSaved('google_ads_id', 'AW-123456789/AbCdEfGh', 'AW-123456789')
        for bad in ('123456789', 'AW-12345', 'AW-ABCDEFGHI', 'G-AB12CD34EF', 'AW-1234567890123456'):
            msg = self.assertRejected('google_ads_id', bad)
            self.assertIn('AW-', msg)

    def test_google_ads_labels(self):
        self.assertSaved('google_ads_purchase_label', 'AbC-dEf_123', 'AbC-dEf_123')
        self.assertSaved('google_ads_signup_label', 'AW-123456789/XyZ987abc', 'XyZ987abc')
        for field in ('google_ads_purchase_label', 'google_ads_signup_label'):
            for bad in ('abc', 'etiqueta con espacios!', 'a' * 61, '<b>x</b>'):
                self.assertRejected(field, bad)

    def test_meta_pixel_id(self):
        self.assertSaved('meta_pixel_id', '1234567890123', '1234567890123')
        self.assertSaved('meta_pixel_id', '1234 5678 9012 3', '1234567890123')
        for bad in ('123456789', 'abc1234567890', '1' * 21, '12345678901;alert(1)'):
            self.assertRejected('meta_pixel_id', bad)

    def test_all_fields_can_be_cleared(self):
        for field in TRACKING_FIELDS:
            r = self.patch(**{field: ''})
            self.assertEqual(r.status_code, 200, field)
            self.assertEqual(r.json()[field], '')

    def test_invalid_value_does_not_save_anything(self):
        r = self.patch(studio_name='Estudio Luna', ga4_measurement_id='UA-1')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(SiteConfig.load().studio_name, 'Mi Estudio')


class TrackingConfigPublicTests(StudioTestCase):
    def test_public_exposes_fields(self):
        cfg = SiteConfig.load()
        cfg.google_business_url = 'https://maps.app.goo.gl/AbC'
        cfg.google_review_url = 'https://g.page/r/AbC/review'
        cfg.facebook_url = 'https://facebook.com/luna'
        cfg.tiktok_url = 'https://tiktok.com/@luna'
        cfg.youtube_url = 'https://youtube.com/@luna'
        cfg.google_site_verification = 'aBcD_1234-efGH5678'
        cfg.bing_site_verification = '0123456789ABCDEF'
        cfg.ga4_measurement_id = 'G-TEST1234'
        cfg.google_ads_id = 'AW-123456789'
        cfg.google_ads_purchase_label = 'buyLabel_1'
        cfg.google_ads_signup_label = 'signUp-2'
        cfg.meta_pixel_id = '1234567890123'
        cfg.save()
        data = APIClient().get('/api/v1/site-config/public/').json()
        for field in TRACKING_FIELDS:
            self.assertEqual(data[field], getattr(cfg, field), field)

    def test_public_defaults_empty(self):
        data = APIClient().get('/api/v1/site-config/public/').json()
        for field in TRACKING_FIELDS:
            self.assertEqual(data[field], '', field)

    def test_public_drops_values_saved_without_validation(self):
        # Guardado saltándose el API (admin de Django, shell…): no llega a la web
        cfg = SiteConfig.load()
        cfg.ga4_measurement_id = "G-X');alert(1)//"
        cfg.meta_pixel_id = '<script>'
        cfg.facebook_url = 'javascript:alert(1)'
        cfg.save()
        data = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(data['ga4_measurement_id'], '')
        self.assertEqual(data['meta_pixel_id'], '')
        self.assertEqual(data['facebook_url'], '')


class SampleFAQTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_seed_demo_marks_faqs_as_sample(self):
        call_command('seed_demo', stdout=open('/dev/null', 'w'))
        faqs = FAQItem.objects.all()
        self.assertTrue(faqs.exists())
        self.assertTrue(all(f.is_sample for f in faqs))
        public = APIClient().get('/api/v1/faqs/').json()
        self.assertTrue(public and all(f['is_sample'] for f in public))

    def test_editing_clears_is_sample(self):
        f = FAQItem.objects.create(question='¿Ejemplo?', answer='Sí', is_sample=True)
        r = self.admin.patch(f'/api/v1/faqs/{f.id}/', {'answer': 'Nuestra respuesta'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()['is_sample'])
        f.refresh_from_db()
        self.assertFalse(f.is_sample)

    def test_put_also_clears_is_sample(self):
        f = FAQItem.objects.create(question='¿Ejemplo?', answer='Sí', is_sample=True)
        r = self.admin.put(f'/api/v1/faqs/{f.id}/', {'question': '¿Nuestra?', 'answer': 'Sí'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        f.refresh_from_db()
        self.assertFalse(f.is_sample)

    def test_is_sample_is_read_only(self):
        r = self.admin.post('/api/v1/faqs/', {'question': 'x', 'answer': 'y', 'is_sample': True}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertFalse(r.json()['is_sample'])
        f = FAQItem.objects.get(pk=r.json()['id'])
        self.assertFalse(f.is_sample)
        r = self.admin.patch(f'/api/v1/faqs/{f.id}/', {'is_sample': True}, format='json')
        f.refresh_from_db()
        self.assertFalse(f.is_sample)
