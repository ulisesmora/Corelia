"""Códigos de un solo uso basados en el tiempo (TOTP, RFC 6238), solo con la
biblioteca estándar. Compatibles con Google Authenticator, 1Password, Authy,
Microsoft Authenticator…: SHA-1, 6 dígitos, intervalos de 30 segundos.

    secret = random_secret()
    uri = provisioning_uri(secret, 'ana@estudio.com', 'Mi Estudio')   # → QR
    step = verify(secret, '123456', last_step=device.last_used_step)
    if step is not None:
        device.last_used_step = step   # el mismo código ya no vale otra vez

Se aceptan el código del intervalo actual y el de uno antes y uno después
(±30 s) por si el reloj del móvil no va exacto.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

DIGITS = 6
PERIOD = 30
WINDOW = 1  # intervalos de margen a cada lado
SECRET_BYTES = 20  # 160 bits, lo que recomienda el RFC 4226 para SHA-1


def random_secret() -> str:
    """Secreto nuevo en base32 sin relleno (lo que se escribe a mano en la app)."""
    return base64.b32encode(secrets.token_bytes(SECRET_BYTES)).decode().rstrip('=')


def _key(secret: str) -> bytes:
    clean = ''.join(secret.split()).replace('-', '').upper()
    clean += '=' * (-len(clean) % 8)
    return base64.b32decode(clean)


def hotp(key: bytes, counter: int, digits: int = DIGITS) -> str:
    """HOTP (RFC 4226) con truncado dinámico."""
    digest = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(number % (10 ** digits)).zfill(digits)


def time_step(for_time: float | None = None) -> int:
    return int((time.time() if for_time is None else for_time) // PERIOD)


def totp(secret: str, for_time: float | None = None, digits: int = DIGITS) -> str:
    return hotp(_key(secret), time_step(for_time), digits)


def normalize_code(code) -> str:
    """'123 456' o '123-456' → '123456'. Devuelve '' si no son 6 cifras."""
    clean = ''.join(ch for ch in str(code or '') if not ch.isspace() and ch != '-')
    return clean if len(clean) == DIGITS and clean.isdigit() else ''


def verify(secret: str, code, last_step: int = 0, for_time: float | None = None,
           window: int = WINDOW) -> int | None:
    """Comprueba un código. Devuelve el intervalo que ha coincidido (para
    guardarlo y no aceptar ese código otra vez) o None si no vale.

    - Compara en tiempo constante (hmac.compare_digest) y revisa todos los
      intervalos de la ventana sin salir antes (no da pistas por el tiempo).
    - Rechaza intervalos iguales o anteriores a last_step: un código ya usado
      (o uno más viejo) no sirve aunque siga dentro de su ventana.
    """
    clean = normalize_code(code)
    if not clean or not secret:
        return None
    try:
        key = _key(secret)
    except (ValueError, TypeError):
        return None
    now = time_step(for_time)
    matched = None
    for step in range(now - window, now + window + 1):
        if step < 0:
            continue
        ok = hmac.compare_digest(hotp(key, step), clean)
        if ok and step > (last_step or 0) and matched is None:
            matched = step
    return matched


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    """URI otpauth:// que se convierte en el QR que escanea la app."""
    issuer = (issuer or '').replace(':', '').strip() or 'Corelia'
    label = quote(f'{issuer}:{account}', safe='@:')
    params = urlencode({
        'secret': secret, 'issuer': issuer, 'algorithm': 'SHA1',
        'digits': DIGITS, 'period': PERIOD,
    }, quote_via=quote)
    return f'otpauth://totp/{label}?{params}'


def format_secret(secret: str) -> str:
    """'JBSWY3DPEHPK3PXP' → 'JBSW Y3DP EHPK 3PXP' (más fácil de copiar a mano)."""
    return ' '.join(secret[i:i + 4] for i in range(0, len(secret), 4))
