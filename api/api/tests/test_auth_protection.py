"""Límites de peticiones, bloqueo de cuentas, captcha (Turnstile) y cabeceras."""
from unittest import mock

import requests
from django.conf import settings
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework.test import APIClient

from api.models import ContactUser, GuestProfile, User
from api.tests.factories import StudioTestCase, make_admin, make_client
from api.throttling import client_ip, ip_key, parse_rate

# Claves de PRUEBA oficiales de Cloudflare (no son secretos)
TEST_SITE_KEY = '1x00000000000000000000AA'
TEST_SECRET = '1x0000000000000000000000000000000AA'
TURNSTILE_ON = dict(TURNSTILE_SITE_KEY=TEST_SITE_KEY, TURNSTILE_SECRET_KEY=TEST_SECRET)


def rates(**overrides):
    return override_settings(THROTTLE_RATES={**settings.THROTTLE_RATES, **overrides})


def cf_response(success=True, codes=()):
    resp = mock.Mock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {'success': success, 'error-codes': list(codes)}
    return resp


class ClientIpTests(SimpleTestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def ip(self, remote, xff=None):
        extra = {'REMOTE_ADDR': remote}
        if xff is not None:
            extra['HTTP_X_FORWARDED_FOR'] = xff
        return client_ip(self.rf.get('/', **extra))

    def test_public_remote_addr_ignores_forwarded_header(self):
        # Sin proxy delante: la cabecera la escribe el cliente y no se mira
        self.assertEqual(self.ip('81.32.0.9', '1.2.3.4'), '81.32.0.9')

    def test_behind_private_proxy_uses_the_ip_the_proxy_saw(self):
        # Railway/Docker: el proxy (IP privada) añade la IP real al final
        self.assertEqual(self.ip('10.0.0.2', '88.12.0.7'), '88.12.0.7')

    def test_spoofed_forwarded_values_are_ignored(self):
        self.assertEqual(self.ip('10.0.0.2', '6.6.6.6, 88.12.0.7'), '88.12.0.7')
        self.assertEqual(self.ip('10.0.0.2', '6.6.6.6, 88.12.0.7, 172.18.0.5'), '88.12.0.7')

    def test_local_development(self):
        self.assertEqual(self.ip('127.0.0.1'), '127.0.0.1')
        self.assertEqual(self.ip('172.18.0.3', '172.18.0.1'), '172.18.0.1')

    @override_settings(TRUSTED_PROXY_CIDRS=['34.120.0.0/16'])
    def test_extra_trusted_proxies(self):
        self.assertEqual(self.ip('10.0.0.2', '81.32.0.5, 34.120.4.7'), '81.32.0.5')

    def test_ipv6_counts_per_network(self):
        a = ip_key(self.rf.get('/', REMOTE_ADDR='2001:db8:1:2::1'))
        b = ip_key(self.rf.get('/', REMOTE_ADDR='2001:db8:1:2:ffff::9'))
        self.assertEqual(a, b)
        self.assertEqual(a, '2001:db8:1:2::/64')

    def test_parse_rate(self):
        self.assertEqual(parse_rate('10/m'), (10, 60))
        self.assertEqual(parse_rate('5/15m'), (5, 900))
        self.assertEqual(parse_rate('20/hour'), (20, 3600))
        self.assertEqual(parse_rate('3/d'), (3, 86400))
        with self.assertRaises(ValueError):
            parse_rate('muchas')


class RateLimitTests(StudioTestCase):
    @rates(login='3/m')
    def test_login_is_limited_per_ip_with_a_spanish_message(self):
        c = APIClient()
        for i in range(3):
            c.post('/api/signinClient/', {'email': f'nadie{i}@test.local', 'password': 'x'}, format='json')
        r = c.post('/api/signinClient/', {'email': 'otra@test.local', 'password': 'x'}, format='json')
        self.assertEqual(r.status_code, 429)
        data = r.json()
        self.assertEqual(data['code'], 'throttled')
        self.assertIn('Demasiados intentos', data['detail'])
        self.assertGreater(data['retry_in'], 0)
        self.assertIn('Retry-After', r)
        # Otra IP (detrás del proxy) no está afectada
        r = c.post('/api/signinClient/', {'email': 'otra@test.local', 'password': 'x'}, format='json',
                   REMOTE_ADDR='10.0.0.2', HTTP_X_FORWARDED_FOR='88.12.0.20')
        self.assertEqual(r.status_code, 401)

    @rates(login='3/m')
    def test_panel_login_too(self):
        c = APIClient()
        for i in range(3):
            c.post('/api/signin/', {'email': f'nadie{i}@test.local', 'password': 'x'}, format='json')
        self.assertEqual(c.post('/api/signin/', {'email': 'x@test.local', 'password': 'x'}, format='json').status_code,
                         429)

    @rates(password_reset_email='2/h')
    def test_password_reset_is_limited_per_email(self):
        make_client()
        for _ in range(2):
            r = APIClient().post('/api/request-reset-password/', {'email': 'clienta@test.local'}, format='json',
                                 REMOTE_ADDR='10.0.0.2', HTTP_X_FORWARDED_FOR='88.12.0.30')
            self.assertEqual(r.status_code, 200)
        r = APIClient().post('/api/request-reset-password/', {'email': 'CLIENTA@test.local'}, format='json',
                             REMOTE_ADDR='10.0.0.2', HTTP_X_FORWARDED_FOR='88.12.0.31')
        self.assertEqual(r.status_code, 429)

    @rates(signup='2/h')
    def test_public_signup_is_limited_but_the_panel_is_not(self):
        for i in range(2):
            r = APIClient().post('/api/signupClient/', {'email': f'n{i}@test.local', 'password': 'secreta1',
                                                        'first_name': 'N'}, format='json')
            self.assertEqual(r.status_code, 201, r.content)
        r = APIClient().post('/api/signupClient/', {'email': 'n9@test.local', 'password': 'secreta1',
                                                    'first_name': 'N'}, format='json')
        self.assertEqual(r.status_code, 429)
        admin = APIClient()
        admin.force_authenticate(make_admin())
        for i in range(3):
            r = admin.post('/api/signupClient/', {'first_name': f'Clienta {i}'}, format='json')
            self.assertEqual(r.status_code, 201, r.content)

    @rates(public_form='2/h')
    def test_contact_form_is_limited(self):
        for _ in range(2):
            r = APIClient().post('/api/v1/contact-user/', {'name': 'Eva', 'email': 'eva@test.local',
                                                           'message': 'hola'}, format='json')
            self.assertIn(r.status_code, (200, 201, 400))
        r = APIClient().post('/api/v1/contact-user/', {'name': 'Eva', 'email': 'eva@test.local', 'message': 'hola'},
                             format='json')
        self.assertEqual(r.status_code, 429)
        self.assertLessEqual(ContactUser.objects.count(), 2)

    @rates(email_verify_email='1/h')
    def test_resend_verification_is_limited_per_email(self):
        APIClient().post('/api/v1/auth/resend-verification/', {'email': 'x@test.local'}, format='json')
        r = APIClient().post('/api/v1/auth/resend-verification/', {'email': 'x@test.local'}, format='json',
                             REMOTE_ADDR='10.0.0.2', HTTP_X_FORWARDED_FOR='88.12.0.40')
        self.assertEqual(r.status_code, 429)

    @rates(test_email='1/h')
    def test_test_email_is_limited_per_admin(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        with mock.patch('api.utils.emailing.send_test_email'):
            self.assertEqual(c.post('/api/v1/site-config/test-email/', {}, format='json').status_code, 200)
            self.assertEqual(c.post('/api/v1/site-config/test-email/', {}, format='json').status_code, 429)

    @rates(login='1/m')
    @override_settings(RATE_LIMITS_ENABLED=False)
    def test_can_be_switched_off(self):
        for _ in range(3):
            r = APIClient().post('/api/signinClient/', {'email': 'a@test.local', 'password': 'x'}, format='json')
            self.assertEqual(r.status_code, 401)


class LockoutTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        make_client()

    def fail(self, email='clienta@test.local', url='/api/signinClient/'):
        return APIClient().post(url, {'email': email, 'password': 'mala'}, format='json')

    def test_five_failures_lock_the_account_even_with_the_right_password(self):
        for _ in range(4):
            self.assertEqual(self.fail().status_code, 401)
        r = self.fail()
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.json()['code'], 'account_locked')
        self.assertIn('contraseña', r.json()['error'])
        r = APIClient().post('/api/signinClient/', {'email': 'clienta@test.local', 'password': 'x-client-pass'},
                             format='json')
        self.assertEqual(r.status_code, 429)
        self.assertIn('espera', r.json()['error'].lower())

    def test_unknown_emails_behave_exactly_the_same(self):
        for _ in range(4):
            self.assertEqual(self.fail('noexiste@test.local').status_code, 401)
        r = self.fail('noexiste@test.local')
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.json()['code'], 'account_locked')

    def test_success_resets_the_counter(self):
        for _ in range(4):
            self.fail()
        r = APIClient().post('/api/signinClient/', {'email': 'clienta@test.local', 'password': 'x-client-pass'},
                             format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.fail().status_code, 401)

    def test_new_password_from_the_email_link_unlocks(self):
        for _ in range(5):
            self.fail()
        user = User.objects.get(email='clienta@test.local')
        user.set_reset_token()
        r = APIClient().post('/api/reset-password/', {'email': user.email, 'reset_token': str(user.reset_token),
                                                      'new_password': 'nueva-clave-1'}, format='json')
        self.assertEqual(r.status_code, 200)
        r = APIClient().post('/api/signinClient/', {'email': 'clienta@test.local', 'password': 'nueva-clave-1'},
                             format='json')
        self.assertEqual(r.status_code, 200)

    def test_panel_login_shares_the_lock(self):
        make_admin()
        for _ in range(5):
            self.fail('admin@test.local', '/api/signin/')
        r = APIClient().post('/api/signin/', {'email': 'admin@test.local', 'password': 'x-admin-pass'}, format='json')
        self.assertEqual(r.status_code, 429)

    @override_settings(LOGIN_LOCKOUT_ATTEMPTS=2)
    def test_attempts_are_configurable(self):
        self.assertEqual(self.fail().status_code, 401)
        self.assertEqual(self.fail().status_code, 429)


class TurnstileTests(StudioTestCase):
    def test_disabled_by_default(self):
        self.assertEqual(APIClient().get('/api/v1/site-config/public/').json()['turnstile_site_key'], '')
        r = APIClient().post('/api/signupClient/', {'email': 'n@test.local', 'password': 'secreta1',
                                                    'first_name': 'N'}, format='json')
        self.assertEqual(r.status_code, 201)

    @override_settings(**TURNSTILE_ON)
    def test_public_config_exposes_only_the_site_key(self):
        data = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(data['turnstile_site_key'], TEST_SITE_KEY)
        self.assertNotIn(TEST_SECRET, str(data))

    @override_settings(**TURNSTILE_ON)
    def test_signup_requires_a_valid_captcha(self):
        body = {'email': 'n@test.local', 'password': 'secreta1', 'first_name': 'N'}
        r = APIClient().post('/api/signupClient/', body, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.json()['captcha_required'])
        self.assertFalse(User.objects.filter(email='n@test.local').exists())
        with mock.patch('api.utils.turnstile.requests.post', return_value=cf_response(False, ['invalid-input-response'])):
            r = APIClient().post('/api/signupClient/', {**body, 'turnstile_token': 'malo'}, format='json')
        self.assertEqual(r.status_code, 400)
        with mock.patch('api.utils.turnstile.requests.post', return_value=cf_response(True)) as post:
            r = APIClient().post('/api/signupClient/', {**body, 'turnstile_token': 'XXXX.DUMMY.TOKEN'}, format='json',
                                 REMOTE_ADDR='10.0.0.2', HTTP_X_FORWARDED_FOR='88.12.0.50')
        self.assertEqual(r.status_code, 201, r.content)
        sent = post.call_args.kwargs['data']
        self.assertEqual(sent['secret'], TEST_SECRET)
        self.assertEqual(sent['response'], 'XXXX.DUMMY.TOKEN')
        self.assertEqual(sent['remoteip'], '88.12.0.50')
        self.assertTrue(post.call_args.kwargs['timeout'])

    @override_settings(**TURNSTILE_ON)
    def test_fails_closed_when_cloudflare_is_down(self):
        with mock.patch('api.utils.turnstile.requests.post', side_effect=requests.ConnectionError('caído')):
            r = APIClient().post('/api/request-reset-password/', {'email': 'a@test.local', 'turnstile_token': 't'},
                                 format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('momento', r.json()['error'])

    @override_settings(**TURNSTILE_ON)
    def test_password_reset_requires_captcha(self):
        self.assertEqual(APIClient().post('/api/request-reset-password/', {'email': 'a@test.local'},
                                          format='json').status_code, 400)
        with mock.patch('api.utils.turnstile.requests.post', return_value=cf_response(True)):
            r = APIClient().post('/api/request-reset-password/', {'email': 'a@test.local', 'turnstile_token': 't'},
                                 format='json')
        self.assertEqual(r.status_code, 200)

    @override_settings(**TURNSTILE_ON)
    def test_login_asks_for_captcha_only_after_three_failures(self):
        make_client()
        good = {'email': 'clienta@test.local', 'password': 'x-client-pass'}
        r = APIClient().post('/api/signinClient/', good, format='json')
        self.assertEqual(r.status_code, 200)  # sin fallos: sin captcha
        for i in range(3):
            r = APIClient().post('/api/signinClient/', {'email': f'otra{i}@test.local', 'password': 'x'},
                                 format='json')
        self.assertTrue(r.json().get('captcha_required'))
        r = APIClient().post('/api/signinClient/', good, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'captcha_required')
        with mock.patch('api.utils.turnstile.requests.post', return_value=cf_response(True)):
            r = APIClient().post('/api/signinClient/', {**good, 'turnstile_token': 't'}, format='json')
        self.assertEqual(r.status_code, 200)

    @override_settings(**TURNSTILE_ON)
    def test_guest_checkout_requires_captcha(self):
        with mock.patch('api.utils.payments.stripe_ready', return_value=True):
            r = APIClient().post('/api/v1/checkout/create-session/', {'email': 'inv@test.local', 'cart_items': []},
                                 format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.json()['captcha_required'])
        self.assertFalse(GuestProfile.objects.filter(email='inv@test.local').exists())


class HeadersAndLimitsTests(StudioTestCase):
    def test_security_headers(self):
        r = self.client.get('/healthz')
        self.assertEqual(r['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(r['X-Frame-Options'], 'DENY')
        self.assertEqual(r['Referrer-Policy'], 'strict-origin-when-cross-origin')

    @override_settings(SECURE_HSTS_SECONDS=31536000, SECURE_HSTS_INCLUDE_SUBDOMAINS=False)
    def test_hsts_only_over_https_and_without_subdomains_by_default(self):
        self.assertNotIn('Strict-Transport-Security', self.client.get('/healthz'))
        r = self.client.get('/healthz', secure=True)
        self.assertEqual(r['Strict-Transport-Security'], 'max-age=31536000')

    @override_settings(MAX_REQUEST_MB=1)
    def test_huge_requests_are_rejected_before_reading_them(self):
        r = self.client.post('/api/signinClient/', data=b'x' * 10, content_type='application/json',
                             CONTENT_LENGTH=str(2 * 1024 * 1024))
        self.assertEqual(r.status_code, 413)
        self.assertIn('demasiado grande', r.json()['error'])
