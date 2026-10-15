"""Emails: sin configurar no se envía nada (y no rompe nada); configurados,
salen con la marca del estudio, uno por reserva y nunca en blanco."""
from unittest import mock

from django.core import mail
from django.core.mail import get_connection
from django.test import override_settings
from rest_framework.test import APIClient

from api.models import Lead, SiteConfig
from api.tests.factories import StudioTestCase, madrid, make_client, make_studio, next_weekday


def _locmem(_smtp):
    return get_connection('django.core.mail.backends.locmem.EmailBackend')


def enable_email(**extra):
    cfg = SiteConfig.load()
    cfg.studio_name = 'Estudio Luna'
    cfg.email_enabled = True
    cfg.smtp_host = 'smtp.test'
    cfg.smtp_user = 'hola@luna.test'
    cfg.smtp_password = 'secreta'
    for k, v in extra.items():
        setattr(cfg, k, v)
    cfg.save()
    return cfg


@mock.patch('api.utils.emailing._connection', _locmem)
class EmailTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio()
        self.user = make_client()
        self.day = next_weekday(1)

    def _reserve(self):
        c = APIClient()
        c.force_authenticate(self.user)
        start, end = madrid(self.day, 10), madrid(self.day, 10, 55)
        return c.post('/api/v1/checkout/reserve/', {'cart_items': [{
            'id_source': self.sched.id,
            'sessionDate': start.isoformat().replace('+00:00', 'Z'),
            'sessionDateEnd': end.isoformat().replace('+00:00', 'Z'),
        }]}, format='json')

    def test_no_email_configured_skips_quietly(self):
        mail.outbox = []
        r = self._reserve()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(mail.outbox), 0)

    def test_booking_with_credits_sends_exactly_one_complete_email(self):
        enable_email()
        mail.outbox = []
        with self.captureOnCommitCallbacks(execute=True):
            r = self._reserve()
        self.assertEqual(r.status_code, 201, r.content)
        to_user = [m for m in mail.outbox if m.to == [self.user.email]]
        self.assertEqual(len(to_user), 1, [m.subject for m in to_user])
        html = to_user[0].alternatives[0][0]
        self.assertIn('Mat', html)
        self.assertIn(self.day.strftime('%d/%m/%Y'), html)
        self.assertIn('Estudio Luna', html)
        self.assertIn('Estudio Luna', to_user[0].from_email)

    def test_generic_notice_is_never_blank(self):
        enable_email()
        from api.utils.booking_notify import notify_booking_confirmation
        with self.captureOnCommitCallbacks(execute=True):
            self._reserve()
        mail.outbox = []
        notify_booking_confirmation(list(self.user.bookings.all()))
        html = mail.outbox[0].alternatives[0][0]
        self.assertIn('Tu plaza está guardada', html)
        self.assertIn('/dashboard', html)

    def test_lead_gets_one_branded_welcome(self):
        enable_email()
        mail.outbox = []
        Lead.objects.create(name='Eva', email='eva@test.local')
        self.assertEqual(len(mail.outbox), 1)
        html = mail.outbox[0].alternatives[0][0]
        self.assertIn('Estudio Luna', html)
        self.assertNotIn('DOM', html)

    def test_placeholder_emails_are_never_contacted(self):
        enable_email()
        from django.conf import settings
        from api.utils.emailing import send_templated_email
        mail.outbox = []
        ok = send_templated_email(f'x@{settings.PLACEHOLDER_EMAIL_DOMAIN}', 'generic-notice',
                                  {'headline': 'h', 'intro_copy': 'i'})
        self.assertFalse(ok)
        self.assertEqual(len(mail.outbox), 0)

    def test_smtp_password_is_encrypted_at_rest(self):
        enable_email()
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute('SELECT smtp_password FROM api_siteconfig WHERE id=1')
            raw = cur.fetchone()[0]
        self.assertTrue(raw.startswith('enc:'))
        self.assertNotIn('secreta', raw)
        self.assertEqual(SiteConfig.load().smtp_password, 'secreta')


class ServerEmailTests(StudioTestCase):
    """Email del servidor (EMAIL_* del entorno, sin SMTP en el panel)."""

    def _send(self):
        from api.utils.emailing import send_templated_email
        return send_templated_email('clienta@test.local', 'generic-notice', {
            'name': 'Ana', 'headline': 'Hola', 'intro_copy': 'Prueba', 'cta_text': '', 'cta_url': '',
        }, subject='Prueba')

    @override_settings(EMAIL_HOST='smtp.servidor.test', DEFAULT_FROM_EMAIL='envios@servidor.test',
                       EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_uses_email_backend_and_replies_go_to_the_studio(self):
        cfg = SiteConfig.load()
        cfg.studio_name, cfg.contact_email = 'Estudio Luna', 'hola@luna.test'
        cfg.save()
        mail.outbox = []
        self.assertTrue(self._send())
        msg = mail.outbox[0]  # salió por EMAIL_BACKEND, no por un SMTP fijo
        self.assertIn('Estudio Luna', msg.from_email)
        self.assertIn('envios@servidor.test', msg.from_email)
        self.assertEqual(msg.reply_to, ['hola@luna.test'])
        self.assertEqual(msg.extra_headers['X-Email-Kind'], 'transactional')

    @override_settings(EMAIL_HOST='smtp.servidor.test', DEFAULT_FROM_EMAIL='envios@servidor.test',
                       EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_without_contact_email_replies_go_to_the_sender(self):
        mail.outbox = []
        self.assertTrue(self._send())
        self.assertEqual(mail.outbox[0].reply_to, ['envios@servidor.test'])
