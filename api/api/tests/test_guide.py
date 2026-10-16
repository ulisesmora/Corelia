"""«Cómo se cobra»: GET /api/v1/guide/charging/ (api/views_guide.py)."""
from decimal import Decimal

from django.test import override_settings
from rest_framework.test import APIClient

from api.models import ClassType, Plan, SiteConfig, WaitlistSettings
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio
from api.utils.site import clear_site_config_cache

URL = '/api/v1/guide/charging/'


class ChargingGuideTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(make_admin())

    def facts(self):
        r = self.api.get(URL)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_only_admins(self):
        self.assertIn(APIClient().get(URL).status_code, (401, 403))
        client = APIClient()
        client.force_authenticate(make_client())
        self.assertEqual(client.get(URL).status_code, 403)
        self.assertEqual(client.post(URL, {}, format='json').status_code, 403)

    def test_read_only(self):
        self.assertEqual(self.api.post(URL, {}, format='json').status_code, 405)

    @override_settings(BOOKING_CANCEL_MIN_HOURS=8)
    def test_fresh_studio_defaults(self):
        data = self.facts()
        self.assertEqual(data['currency'], 'EUR')
        self.assertEqual(data['drop_in_price'], '12')
        self.assertFalse(data['drop_in_from_plan'])
        self.assertEqual(data['cancel_min_hours'], 8)
        self.assertEqual(data['waitlist'], {'enabled': True, 'auto_offer': True, 'claim_minutes': 120})
        self.assertEqual(data['payments'], {'enabled': False, 'provider': ''})
        self.assertIsNone(data['pack'])
        self.assertIsNone(data['subscription'])
        self.assertEqual(data['class_types'], [])
        self.assertFalse(data['credits_vary'])
        self.assertEqual(data['counts'], {'packs': 0, 'subscriptions': 0, 'class_types': 0})

    @override_settings(BOOKING_CANCEL_MIN_HOURS=12)
    def test_uses_the_studio_settings(self):
        cfg = SiteConfig.load()
        cfg.currency = 'USD'
        cfg.drop_in_price = Decimal('15.50')
        cfg.save()
        clear_site_config_cache()
        wl = WaitlistSettings.load()
        wl.claim_minutes = 45
        wl.auto_offer = False
        wl.save()

        data = self.facts()
        self.assertEqual(data['currency'], 'USD')
        self.assertEqual(data['drop_in_price'], '15.5')
        self.assertEqual(data['cancel_min_hours'], 12)
        self.assertEqual(data['waitlist'], {'enabled': True, 'auto_offer': False, 'claim_minutes': 45})

    def test_examples_from_what_is_on_sale(self):
        sched = make_studio(credits=1)
        cat = sched.class_type.category
        ClassType.objects.create(title='Reformer', slug='reformer', category=cat,
                                 default_price_credits=Decimal('2'), default_price_eur=Decimal('24'))
        ClassType.objects.create(title='Oculta', slug='oculta', category=cat, is_active=False)
        Plan.objects.create(name='Clase suelta', type='pack', credits=1, price_eur=Decimal('14'))
        Plan.objects.create(name='Bono 10', type='pack', credits=10, price_eur=Decimal('110'), credits_expire_days=90)
        Plan.objects.create(name='Bono 5', type='pack', credits=5, price_eur=Decimal('60'), credits_expire_days=60)
        Plan.objects.create(name='Bono retirado', type='pack', credits=3, price_eur=Decimal('30'), is_active=False)
        Plan.objects.create(name='Mensual', type='sub', credits=8, price_eur=Decimal('79'), interval='month', interval_count=1)

        data = self.facts()
        # El bono de 1 clase manda sobre el precio de referencia (igual que la web)
        self.assertEqual(data['drop_in_price'], '14')
        self.assertTrue(data['drop_in_from_plan'])
        # El bono de ejemplo: el más pequeño de más de una clase (no el oculto)
        self.assertEqual(data['pack']['name'], 'Bono 5')
        self.assertEqual(data['pack']['price'], '60')
        self.assertEqual(data['pack']['expire_days'], 60)
        self.assertEqual(data['subscription']['name'], 'Mensual')
        self.assertEqual(data['subscription']['interval'], 'month')
        self.assertEqual(data['subscription']['credits'], 8)
        self.assertEqual([t['title'] for t in data['class_types']], ['Mat', 'Reformer'])
        self.assertEqual(data['class_types'][1]['credits'], '2')
        self.assertEqual(data['class_types'][1]['price'], '24')
        self.assertTrue(data['credits_vary'])
        self.assertEqual(data['counts'], {'packs': 3, 'subscriptions': 1, 'class_types': 2})
