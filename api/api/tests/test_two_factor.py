"""Verificación en dos pasos (TOTP) del panel."""
import time
from io import StringIO
from unittest import mock

from django.core import signing
from django.core.management import call_command
from django.db import connection
from django.test import Client
from rest_framework.test import APIClient

from api.models import SiteConfig, TwoFactorDevice, User
from api.tests.factories import StudioTestCase, make_admin, make_client
from api.utils import totp, two_factor

PASSWORD = 'x-admin-pass'


def code_for(user, offset=0):
    device = TwoFactorDevice.objects.get(user=user)
    return totp.totp(device.secret, for_time=time.time() + offset)


def enable_2fa(user):
    """Activa la verificación como lo haría el panel. Devuelve los códigos de recuperación."""
    c = APIClient()
    c.force_authenticate(user)
    c.post('/api/v1/auth/2fa/setup/')
    # El código del intervalo anterior: así el de «ahora» sigue libre para entrar
    r = c.post('/api/v1/auth/2fa/confirm/', {'code': code_for(user, -30)}, format='json')
    assert r.status_code == 200, r.content
    return r.json()['recovery_codes']


class TwoFactorSetupTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_admin()
        self.c = APIClient()
        self.c.force_authenticate(self.admin)

    def test_setup_returns_qr_uri_and_manual_key(self):
        r = self.c.post('/api/v1/auth/2fa/setup/')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertTrue(data['otpauth_uri'].startswith('otpauth://totp/'))
        self.assertIn('admin@test.local', data['otpauth_uri'])
        self.assertTrue(data['qr_svg'].startswith('data:image/svg+xml'))
        device = TwoFactorDevice.objects.get(user=self.admin)
        self.assertEqual(data['secret'].replace(' ', ''), device.secret)
        self.assertFalse(device.enabled)
        self.assertFalse(self.c.get('/api/v1/auth/2fa/').json()['enabled'])

    def test_secret_is_encrypted_in_the_database(self):
        self.c.post('/api/v1/auth/2fa/setup/')
        device = TwoFactorDevice.objects.get(user=self.admin)
        with connection.cursor() as cur:
            cur.execute('SELECT secret FROM api_twofactordevice WHERE id = %s', [device.id])
            raw = cur.fetchone()[0]
        self.assertTrue(raw.startswith('enc:'))
        self.assertNotIn(device.secret, raw)

    def test_confirm_needs_a_good_code_and_returns_ten_recovery_codes(self):
        self.c.post('/api/v1/auth/2fa/setup/')
        r = self.c.post('/api/v1/auth/2fa/confirm/', {'code': '000000'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('código', r.json()['error'])
        r = self.c.post('/api/v1/auth/2fa/confirm/', {'code': code_for(self.admin)}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        codes = r.json()['recovery_codes']
        self.assertEqual(len(codes), 10)
        self.assertEqual(len(set(codes)), 10)
        device = TwoFactorDevice.objects.get(user=self.admin)
        self.assertTrue(device.enabled)
        # Guardados resumidos, nunca en claro
        for code in codes:
            self.assertNotIn(code, str(device.recovery_codes))
        status = self.c.get('/api/v1/auth/2fa/').json()
        self.assertTrue(status['enabled'])
        self.assertEqual(status['recovery_codes_left'], 10)
        # Ya activada: no se puede «empezar» otra vez sin desactivar
        self.assertEqual(self.c.post('/api/v1/auth/2fa/setup/').status_code, 400)

    def test_only_panel_users(self):
        c = APIClient()
        c.force_authenticate(make_client())
        self.assertEqual(c.post('/api/v1/auth/2fa/setup/').status_code, 403)
        self.assertIn(APIClient().get('/api/v1/auth/2fa/').status_code, (401, 403))

    def test_disable_requires_code_or_password(self):
        enable_2fa(self.admin)
        r = self.c.post('/api/v1/auth/2fa/disable/', {}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.c.post('/api/v1/auth/2fa/disable/', {'password': 'mala'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.c.post('/api/v1/auth/2fa/disable/', {'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(TwoFactorDevice.objects.filter(user=self.admin).exists())

    def test_disable_with_current_code(self):
        enable_2fa(self.admin)
        r = self.c.post('/api/v1/auth/2fa/disable/', {'code': code_for(self.admin)}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(two_factor.is_enabled(self.admin))

    def test_regenerate_recovery_codes(self):
        old = enable_2fa(self.admin)
        self.assertEqual(self.c.post('/api/v1/auth/2fa/recovery-codes/', {}, format='json').status_code, 400)
        r = self.c.post('/api/v1/auth/2fa/recovery-codes/', {'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200)
        new = r.json()['recovery_codes']
        self.assertEqual(len(new), 10)
        self.assertFalse(set(old) & set(new))
        self.assertFalse(two_factor.use_recovery_code(self.admin, old[0]))
        self.assertTrue(two_factor.use_recovery_code(self.admin, new[0]))


class TwoFactorLoginTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_admin()
        self.recovery = enable_2fa(self.admin)

    def _password_step(self):
        r = APIClient().post('/api/signin/', {'email': 'admin@test.local', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertTrue(data['two_factor_required'])
        self.assertNotIn('access', data)
        self.assertNotIn('refresh', data)
        return data['two_factor_token']

    def test_login_without_2fa_is_unchanged(self):
        other = make_admin('otra-admin@test.local')
        r = APIClient().post('/api/signin/', {'email': other.email, 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn('access', data)
        self.assertFalse(data['two_factor_enabled'])

    def test_code_gives_the_session_and_cannot_be_reused(self):
        token = self._password_step()
        code = code_for(self.admin)
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'code': code}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertIn('access', data)
        self.assertTrue(data['two_factor_enabled'])
        # La sesión sirve para el panel
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
        self.assertEqual(c.get('/api/v1/auth/2fa/').status_code, 200)
        # El mismo código no vale dos veces
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': self._password_step(), 'code': code}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_recovery_code_works_once(self):
        token = self._password_step()
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'recovery_code': self.recovery[0].upper()},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['recovery_codes_left'], 9)
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': self._password_step(),
                                                          'recovery_code': self.recovery[0]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('recuperación', r.json()['error'])

    def test_bad_or_expired_token(self):
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': 'inventado', 'code': '123456'}, format='json')
        self.assertEqual(r.status_code, 401)
        token = self._password_step()
        with mock.patch('django.core.signing.time.time', return_value=time.time() + 3600):
            r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'code': code_for(self.admin)},
                                 format='json')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()['code'], 'two_factor_expired')

    def test_token_dies_when_password_changes(self):
        token = self._password_step()
        self.admin.set_password('otra-clave-nueva')
        self.admin.save()
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'code': code_for(self.admin)}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_token_of_a_client_is_useless(self):
        clienta = make_client()
        token = signing.dumps({'u': clienta.pk, 'p': two_factor._password_fingerprint(clienta)},
                              salt=two_factor._PENDING_SALT, compress=False)
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'code': '123456'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_wrong_codes_lock_the_account(self):
        token = self._password_step()
        last = None
        for _ in range(5):
            last = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'code': '000000'}, format='json')
        self.assertEqual(last.status_code, 429)
        self.assertEqual(last.json()['code'], 'account_locked')
        # Bloqueada: ni el código bueno ni la contraseña sirven ahora
        r = APIClient().post('/api/v1/auth/2fa/verify/', {'token': token, 'code': code_for(self.admin)}, format='json')
        self.assertEqual(r.status_code, 429)
        r = APIClient().post('/api/signin/', {'email': 'admin@test.local', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 429)

    def test_google_login_never_opens_the_panel(self):
        SiteConfig.objects.update_or_create(pk=1, defaults={'google_client_id': 'x.apps.googleusercontent.com'})
        from api.utils.site import clear_site_config_cache
        clear_site_config_cache()
        info = {'email': 'admin@test.local', 'email_verified': True}
        with mock.patch('google.oauth2.id_token.verify_oauth2_token', return_value=info):
            r = APIClient().post('/api/google-login/', {'credential': 'tok'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertNotIn('access', r.json())

    def test_client_login_endpoint_does_not_open_the_panel(self):
        r = APIClient().post('/api/signinClient/', {'email': 'admin@test.local', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()['error'], 'Email o contraseña incorrectos.')

    def test_django_admin_login_asks_for_the_code(self):
        c = Client()
        r = c.post('/django-admin/login/', {'username': 'admin@test.local', 'password': PASSWORD})
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, 'código de 6 cifras')
        self.assertNotIn('_auth_user_id', c.session)
        r = c.post('/django-admin/login/', {'username': 'admin@test.local', 'password': PASSWORD,
                                             'otp_code': '000000'})
        self.assertNotIn('_auth_user_id', c.session)
        r = c.post('/django-admin/login/', {'username': 'admin@test.local', 'password': PASSWORD,
                                             'otp_code': code_for(self.admin)})
        self.assertEqual(r.status_code, 302)
        self.assertIn('_auth_user_id', c.session)

    def test_disable_command(self):
        out = StringIO()
        call_command('disable_2fa', 'admin@test.local', stdout=out)
        self.assertIn('desactivada', out.getvalue())
        self.assertFalse(two_factor.is_enabled(self.admin))


class TwoFactorPolicyTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.boss = make_admin('jefa@test.local')
        self.c = APIClient()
        self.c.force_authenticate(self.boss)

    def test_policy_needs_own_2fa_first(self):
        r = self.c.post('/api/v1/auth/2fa/policy/', {'require': True}, format='json')
        self.assertEqual(r.status_code, 400)
        enable_2fa(self.boss)
        r = self.c.post('/api/v1/auth/2fa/policy/', {'require': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(SiteConfig.load().require_panel_2fa)

    def test_policy_cannot_be_set_through_site_config(self):
        r = self.c.patch('/api/v1/site-config/', {'require_panel_2fa': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(SiteConfig.load().require_panel_2fa)

    def test_team_member_without_2fa_can_only_set_it_up(self):
        enable_2fa(self.boss)
        self.c.post('/api/v1/auth/2fa/policy/', {'require': True}, format='json')
        make_admin('equipo@test.local')
        r = APIClient().post('/api/signin/', {'email': 'equipo@test.local', 'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data['two_factor_setup_required'])
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
        r = c.get('/api/v1/bookings/')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json()['code'], 'two_factor_setup_required')
        self.assertEqual(c.get('/api/v1/site-config/').status_code, 200)  # lectura para pintar el panel
        self.assertEqual(c.patch('/api/v1/site-config/', {}, format='json').status_code, 403)
        # Puede activarla y entonces ya usa el panel con la misma sesión
        self.assertEqual(c.get('/api/v1/auth/2fa/').json()['setup_required'], True)
        c.post('/api/v1/auth/2fa/setup/')
        member = User.objects.get(email='equipo@test.local')
        r = c.post('/api/v1/auth/2fa/confirm/', {'code': code_for(member)}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(c.get('/api/v1/bookings/').status_code, 200)

    def test_clients_are_not_affected(self):
        enable_2fa(self.boss)
        self.c.post('/api/v1/auth/2fa/policy/', {'require': True}, format='json')
        make_client()
        r = APIClient().post('/api/signinClient/', {'email': 'clienta@test.local', 'password': 'x-client-pass'},
                             format='json')
        self.assertEqual(r.status_code, 200)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
        self.assertEqual(c.get('/api/v1/bookings/').status_code, 200)
