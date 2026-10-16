"""Coordenadas del estudio: geocodificación con Nominatim (HTTP simulado) y el
punto del mapa que se guarda desde el panel (Ajustes → Mi estudio)."""
from decimal import Decimal
from unittest import mock

import requests
from django.core.cache import cache
from rest_framework.test import APIClient

from api.models import SiteConfig
from api.tests.factories import StudioTestCase, make_admin
from api.utils import geocode as geo


def _resp(results, status=200):
    r = mock.Mock()
    r.ok = 200 <= status < 300
    r.status_code = status
    r.json.return_value = results
    return r


MADRID = {'lat': '40.4243123', 'lon': '-3.7016456', 'address': {'postcode': '28004', 'city': 'Madrid'}}
BILBAO = {'lat': '43.26', 'lon': '-2.93', 'address': {'postcode': '48001', 'city': 'Bilbao'}}


class GeocodeTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        # Sin esperas reales: el turno de 1 req/s se comprueba aparte
        patcher = mock.patch.object(geo.time, 'sleep')
        self.sleep = patcher.start()
        self.addCleanup(patcher.stop)

    @mock.patch('api.utils.geocode.requests.get')
    def test_match_by_postal_code(self, get):
        get.return_value = _resp([BILBAO, MADRID])
        self.assertEqual(geo.geocode('Calle de Fuencarral 45', 'Madrid', '28004', 'ES'), (40.424312, -3.701646))
        params = get.call_args.kwargs['params']
        self.assertEqual(params['countrycodes'], 'es')
        self.assertEqual(params['street'], 'Fuencarral 45')  # sin «Calle de»

    @mock.patch('api.utils.geocode.requests.get')
    def test_wrong_place_is_rejected(self, get):
        get.return_value = _resp([BILBAO])
        self.assertIsNone(geo.geocode('Calle Mayor 1', 'Madrid', '28004', 'ES'))
        self.assertEqual(get.call_count, 3)  # tres formas de preguntar, ninguna sirve

    @mock.patch('api.utils.geocode.requests.get')
    def test_identifies_itself_with_a_user_agent(self, get):
        cfg = SiteConfig.load()
        cfg.contact_email = 'hola@estudio.test'
        cfg.save()
        get.return_value = _resp([MADRID])
        geo.geocode('Fuencarral 45', 'Madrid', '28004', 'ES')
        ua = get.call_args.kwargs['headers']['User-Agent']
        self.assertTrue(ua.startswith('StudioKit/1.0 (+http'), ua)
        self.assertIn('hola@estudio.test', ua)
        self.assertLessEqual(get.call_args.kwargs['timeout'], geo.REQUEST_TIMEOUT)

    @mock.patch.dict('os.environ', {'NOMINATIM_USER_AGENT': 'MiEstudio/2.0 (admin@mi.test)'})
    @mock.patch('api.utils.geocode.requests.get')
    def test_user_agent_can_be_overridden(self, get):
        get.return_value = _resp([MADRID])
        geo.geocode('Fuencarral 45', 'Madrid', '28004', 'ES')
        self.assertEqual(get.call_args.kwargs['headers']['User-Agent'], 'MiEstudio/2.0 (admin@mi.test)')

    @mock.patch('api.utils.geocode.requests.get', side_effect=requests.Timeout('lento'))
    def test_timeouts_are_logged_and_give_none(self, get):
        with self.assertLogs('api.utils.geocode', level='WARNING') as logs:
            self.assertIsNone(geo.geocode('Fuencarral 45', 'Madrid', '28004', 'ES'))
        self.assertIn('geocode.failed', logs.output[0])
        self.assertIn('Timeout', logs.output[0])

    @mock.patch('api.utils.geocode.requests.get')
    def test_rate_limited_or_blocked_stops_at_once(self, get):
        get.return_value = _resp({}, status=429)
        with self.assertLogs('api.utils.geocode', level='WARNING'):
            self.assertIsNone(geo.geocode('Fuencarral 45', 'Madrid', '28004', 'ES'))
        self.assertEqual(get.call_count, 1)

    @mock.patch('api.utils.geocode.requests.get')
    def test_needs_street_and_city_or_postcode(self, get):
        self.assertIsNone(geo.geocode('', 'Madrid', '28004', 'ES'))
        self.assertIsNone(geo.geocode('Fuencarral 45', '', '', 'ES'))
        get.assert_not_called()

    @mock.patch('api.utils.geocode.requests.get')
    def test_one_request_per_second(self, get):
        """Las peticiones seguidas esperan su turno (≥ 1 s entre una y otra)."""
        get.return_value = _resp([])
        clock = [1000.0]
        self.sleep.side_effect = lambda s: clock.__setitem__(0, clock[0] + s)
        with mock.patch.object(geo.time, 'time', side_effect=lambda: clock[0]):
            geo.geocode('Calle Mayor 1', 'Madrid', '28004', 'ES')
        waits = [c.args[0] for c in self.sleep.call_args_list]
        self.assertEqual(len(waits), 2)  # el 1.º sale ya; el 2.º y el 3.º esperan
        for w in waits:
            self.assertGreaterEqual(w, 1.0)

    def test_turn_is_shared_between_calls(self):
        """Otro proceso que acaba de preguntar (turno en la caché) hace esperar."""
        clock = [500.0]
        self.sleep.side_effect = lambda s: clock.__setitem__(0, clock[0] + s)
        with mock.patch.object(geo.time, 'time', side_effect=lambda: clock[0]):
            cache.set(geo._TURN_KEY, 500.8, 60)
            self.assertTrue(geo._wait_turn(deadline=510))
            self.sleep.assert_called_once()
            self.assertAlmostEqual(self.sleep.call_args.args[0], 0.8, places=3)
            # Sin hueco antes del límite → no se pregunta
            cache.set(geo._TURN_KEY, 600.0, 60)
            self.assertFalse(geo._wait_turn(deadline=510))


class MapPointSaveTests(StudioTestCase):
    """PATCH /api/v1/site-config/ desde el panel."""

    def setUp(self):
        super().setUp()
        self.c = APIClient()
        self.c.force_authenticate(make_admin())

    def patch(self, data):
        return self.c.patch('/api/v1/site-config/', data, format='json')

    @mock.patch('api.utils.geocode.geocode', return_value=(40.424312, -3.701646))
    def test_new_address_gets_coordinates(self, gc):
        r = self.patch({'address': 'Calle de Fuencarral 45', 'city': 'Madrid', 'postal_code': '28004'})
        self.assertEqual(r.status_code, 200, r.content)
        gc.assert_called_once_with('Calle de Fuencarral 45', 'Madrid', '28004', 'ES')
        self.assertEqual(r.json()['geocode_status'], 'ok')
        self.assertEqual(r.json()['latitude'], '40.424312')
        public = APIClient().get('/api/v1/site-config/public/').json()['contact']
        self.assertEqual((public['latitude'], public['longitude']), (40.424312, -3.701646))

    @mock.patch('api.utils.geocode.geocode', return_value=None)
    def test_not_found_asks_to_place_the_pin(self, gc):
        cfg = SiteConfig.load()
        cfg.address, cfg.city, cfg.latitude, cfg.longitude = 'Viejo 1', 'Madrid', Decimal('40.1'), Decimal('-3.1')
        cfg.save()
        r = self.patch({'address': 'Calle Inventada 99', 'city': 'Madrid'})
        self.assertEqual(r.json()['geocode_status'], 'not_found')
        cfg.refresh_from_db()
        # El punto viejo era de otra dirección: mejor ninguno que uno equivocado
        self.assertIsNone(cfg.latitude)
        self.assertIsNone(cfg.longitude)

    @mock.patch('api.utils.geocode.geocode')
    def test_manual_pin_is_saved_without_geocoding(self, gc):
        r = self.patch({'latitude': 40.42431987654, 'longitude': -3.70164321})
        self.assertEqual(r.status_code, 200, r.content)
        gc.assert_not_called()
        self.assertEqual(r.json()['geocode_status'], 'manual')
        cfg = SiteConfig.load()
        self.assertEqual(cfg.latitude, Decimal('40.424320'))
        self.assertEqual(cfg.longitude, Decimal('-3.701643'))

    @mock.patch('api.utils.geocode.geocode')
    def test_manual_pin_wins_over_a_new_address(self, gc):
        self.patch({'address': 'Calle Nueva 2', 'city': 'Madrid', 'latitude': '40.5', 'longitude': '-3.6'})
        gc.assert_not_called()
        self.assertEqual(SiteConfig.load().latitude, Decimal('40.500000'))

    @mock.patch('api.utils.geocode.geocode')
    def test_saving_the_same_address_keeps_the_pin(self, gc):
        cfg = SiteConfig.load()
        cfg.address, cfg.city, cfg.latitude, cfg.longitude = 'Fuencarral 45', 'Madrid', Decimal('40.4'), Decimal('-3.7')
        cfg.save()
        r = self.patch({'address': 'Fuencarral 45', 'city': 'Madrid', 'studio_name': 'Luna'})
        gc.assert_not_called()
        self.assertNotIn('geocode_status', r.json())
        self.assertEqual(SiteConfig.load().latitude, Decimal('40.400000'))

    @mock.patch('api.utils.geocode.geocode', return_value=(40.42, -3.70))
    def test_address_without_pin_is_looked_up_once_when_saved(self, gc):
        cfg = SiteConfig.load()
        cfg.address, cfg.city = 'Fuencarral 45', 'Madrid'
        cfg.save()
        self.patch({'studio_name': 'Luna'})  # otros datos: no se pregunta
        gc.assert_not_called()
        self.patch({'address': 'Fuencarral 45', 'city': 'Madrid'})  # se guarda la dirección
        gc.assert_called_once()

    @mock.patch('api.utils.geocode.geocode', return_value=(40.42, -3.70))
    def test_retry_from_the_panel(self, gc):
        cfg = SiteConfig.load()
        cfg.address, cfg.city, cfg.latitude, cfg.longitude = 'Fuencarral 45', 'Madrid', Decimal('41'), Decimal('-3')
        cfg.save()
        r = self.patch({'latitude': None, 'longitude': None})
        gc.assert_called_once()
        self.assertEqual(r.json()['geocode_status'], 'ok')
        self.assertEqual(SiteConfig.load().latitude, Decimal('40.420000'))

    @mock.patch('api.utils.geocode.geocode')
    def test_out_of_range_coordinates_are_rejected(self, gc):
        for bad in ({'latitude': 91, 'longitude': 0}, {'latitude': 0, 'longitude': -181}, {'latitude': 'abc', 'longitude': 1}):
            r = self.patch(bad)
            self.assertEqual(r.status_code, 400, bad)
        gc.assert_not_called()

    def test_public_pages_never_geocode(self):
        cfg = SiteConfig.load()
        cfg.address, cfg.city = 'Fuencarral 45', 'Madrid'
        cfg.save()
        with mock.patch('api.utils.geocode.requests.get') as get:
            self.assertEqual(APIClient().get('/api/v1/site-config/public/').status_code, 200)
            self.c.get('/api/v1/site-config/')
        get.assert_not_called()
