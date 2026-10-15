"""TOTP (RFC 6238) hecho con la biblioteca estándar."""
import base64
from urllib.parse import parse_qs, urlparse

from django.test import SimpleTestCase

from api.utils import totp

# Secreto de los vectores de prueba del RFC 6238 (SHA-1): "12345678901234567890"
RFC_SECRET = base64.b32encode(b'12345678901234567890').decode()


class TotpTests(SimpleTestCase):
    def test_rfc6238_vectors(self):
        # Los vectores del RFC son de 8 cifras: las 6 últimas son nuestro código
        for t, expected8 in [(59, '94287082'), (1111111109, '07081804'), (1111111111, '14050471'),
                             (1234567890, '89005924'), (2000000000, '69279037'), (20000000000, '65353130')]:
            with self.subTest(t=t):
                self.assertEqual(totp.totp(RFC_SECRET, for_time=t, digits=8), expected8)
                self.assertEqual(totp.totp(RFC_SECRET, for_time=t), expected8[-6:])

    def test_verify_accepts_one_step_of_clock_drift(self):
        now = 1_700_000_000
        for drift in (-30, 0, 30):
            code = totp.totp(RFC_SECRET, for_time=now + drift)
            self.assertIsNotNone(totp.verify(RFC_SECRET, code, for_time=now))
        far = totp.totp(RFC_SECRET, for_time=now + 90)
        self.assertIsNone(totp.verify(RFC_SECRET, far, for_time=now))

    def test_code_cannot_be_reused_nor_older_ones(self):
        now = 1_700_000_000
        code = totp.totp(RFC_SECRET, for_time=now)
        step = totp.verify(RFC_SECRET, code, for_time=now)
        self.assertEqual(step, totp.time_step(now))
        self.assertIsNone(totp.verify(RFC_SECRET, code, last_step=step, for_time=now))
        older = totp.totp(RFC_SECRET, for_time=now - 30)
        self.assertIsNone(totp.verify(RFC_SECRET, older, last_step=step, for_time=now))

    def test_normalizes_spaces_and_rejects_garbage(self):
        now = 1_700_000_000
        code = totp.totp(RFC_SECRET, for_time=now)
        self.assertIsNotNone(totp.verify(RFC_SECRET, f'{code[:3]} {code[3:]}', for_time=now))
        for bad in ('', None, '12345', '1234567', 'abcdef', '12 34 5x'):
            self.assertIsNone(totp.verify(RFC_SECRET, bad, for_time=now))
        self.assertIsNone(totp.verify('', code, for_time=now))
        self.assertIsNone(totp.verify('!!!no-base32', code, for_time=now))

    def test_random_secret_and_uri(self):
        secret = totp.random_secret()
        self.assertEqual(len(base64.b32decode(secret + '=' * (-len(secret) % 8))), 20)
        self.assertNotEqual(secret, totp.random_secret())
        uri = totp.provisioning_uri(secret, 'ana@estudio.com', 'Estudio: Luz')
        parsed = urlparse(uri)
        self.assertEqual(parsed.scheme, 'otpauth')
        self.assertEqual(parsed.netloc, 'totp')
        self.assertIn('Estudio%20Luz:ana@estudio.com', parsed.path)
        q = parse_qs(parsed.query)
        self.assertEqual(q['secret'], [secret])
        self.assertEqual(q['issuer'], ['Estudio Luz'])
        self.assertEqual(q['digits'], ['6'])
        self.assertEqual(q['period'], ['30'])
        self.assertEqual(totp.format_secret('ABCDEFGHIJ'), 'ABCD EFGH IJ')
