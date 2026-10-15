"""Verificación en dos pasos del panel (contraseña + código del móvil).

Flujo de entrada:
  1. /api/signin/ con email y contraseña correctos y la verificación activada →
     NO devuelve la sesión, sino un «pase» firmado de 5 minutos (pending_token).
  2. /api/v1/auth/2fa/verify/ con ese pase + el código de 6 dígitos (o un
     código de recuperación) → la sesión normal (JWT).

El pase va firmado con la SECRET_KEY e incluye un resumen de la contraseña
actual: si se cambia la contraseña, los pases anteriores dejan de valer.
"""
import hashlib
import hmac
import logging
import secrets

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from api.utils import totp

logger = logging.getLogger(__name__)

RECOVERY_CODES = 10
_RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'  # sin 0/o, 1/l/i
_PENDING_SALT = 'corelia.two-factor.pending'


# ── Estado ────────────────────────────────────────────────────────────────────

def get_device(user):
    from api.models import TwoFactorDevice
    return TwoFactorDevice.objects.filter(user=user).first()


def is_enabled(user) -> bool:
    device = get_device(user)
    return bool(device and device.enabled)


def studio_requires_2fa() -> bool:
    from api.utils.site import get_site_config
    return bool(get_site_config().require_panel_2fa)


def setup_required(user) -> bool:
    """El estudio exige la verificación y esta persona del panel aún no la tiene."""
    return bool(user and user.is_staff and studio_requires_2fa() and not is_enabled(user))


# ── Códigos de recuperación ───────────────────────────────────────────────────

def _normalize_recovery(code) -> str:
    return ''.join(ch for ch in str(code or '').lower() if ch.isalnum())


def _hash_recovery(code: str, salt: str) -> str:
    return hashlib.sha256(f'{salt}:{_normalize_recovery(code)}'.encode()).hexdigest()


def new_recovery_codes() -> tuple[list[str], list[str]]:
    """(códigos en claro para enseñarlos UNA vez, resúmenes para guardar)."""
    plain, hashed = [], []
    for _ in range(RECOVERY_CODES):
        raw = ''.join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        code = f'{raw[:5]}-{raw[5:]}'
        salt = secrets.token_hex(8)
        plain.append(code)
        hashed.append(f'{salt}${_hash_recovery(code, salt)}')
    return plain, hashed


def _match_recovery(stored: list, code) -> int | None:
    clean = _normalize_recovery(code)
    if len(clean) != 10:
        return None
    found = None
    for i, item in enumerate(stored or []):
        salt, _, digest = str(item).partition('$')
        if hmac.compare_digest(_hash_recovery(clean, salt), digest) and found is None:
            found = i
    return found


# ── Alta, baja y comprobación ─────────────────────────────────────────────────

def start_setup(user):
    """Secreto nuevo (aún sin activar). Si ya estaba activada, no se toca."""
    from api.models import TwoFactorDevice
    device, _ = TwoFactorDevice.objects.get_or_create(user=user)
    if device.enabled:
        return device
    device.secret = totp.random_secret()
    device.confirmed_at = None
    device.last_used_step = 0
    device.recovery_codes = []
    device.save()
    return device


def confirm_setup(user, code) -> list[str] | None:
    """Activa la verificación si el código es bueno. Devuelve los códigos de recuperación."""
    device = get_device(user)
    if not device or device.enabled or not device.secret:
        return None
    step = totp.verify(device.secret, code, last_step=device.last_used_step)
    if step is None:
        return None
    plain, hashed = new_recovery_codes()
    device.confirmed_at = timezone.now()
    device.last_used_step = step
    device.recovery_codes = hashed
    device.save(update_fields=['confirmed_at', 'last_used_step', 'recovery_codes', 'updated_at'])
    logger.info("security.2fa_enabled user_id=%s", user.id)
    return plain


def disable(user, by=None):
    from api.models import TwoFactorDevice
    TwoFactorDevice.objects.filter(user=user).delete()
    logger.warning("security.2fa_disabled user_id=%s by=%s", user.id, getattr(by, 'id', by))


def regenerate_recovery_codes(user) -> list[str] | None:
    device = get_device(user)
    if not device or not device.enabled:
        return None
    plain, hashed = new_recovery_codes()
    device.recovery_codes = hashed
    device.save(update_fields=['recovery_codes', 'updated_at'])
    logger.info("security.2fa_recovery_regenerated user_id=%s", user.id)
    return plain


def check_totp(user, code) -> bool:
    """Código de la app. Un código usado ya no vale otra vez (ni en paralelo:
    el UPDATE condicional solo lo gana una petición)."""
    from api.models import TwoFactorDevice
    device = get_device(user)
    if not device or not device.enabled:
        return False
    step = totp.verify(device.secret, code, last_step=device.last_used_step)
    if step is None:
        return False
    return TwoFactorDevice.objects.filter(pk=device.pk, last_used_step__lt=step).update(last_used_step=step) == 1


def use_recovery_code(user, code) -> bool:
    """Código de recuperación: sirve una sola vez."""
    from api.models import TwoFactorDevice
    with transaction.atomic():
        device = TwoFactorDevice.objects.select_for_update().filter(user=user).first()
        if not device or not device.enabled:
            return False
        idx = _match_recovery(device.recovery_codes, code)
        if idx is None:
            return False
        codes = list(device.recovery_codes)
        codes.pop(idx)
        device.recovery_codes = codes
        device.save(update_fields=['recovery_codes', 'updated_at'])
    logger.warning("security.2fa_recovery_used user_id=%s left=%s", user.id, len(codes))
    return True


def check_code_or_recovery(user, code='', recovery_code='') -> str | None:
    """'totp' / 'recovery' según lo que haya valido, o None."""
    if code and check_totp(user, code):
        return 'totp'
    if recovery_code and use_recovery_code(user, recovery_code):
        return 'recovery'
    return None


def recovery_codes_left(user) -> int:
    device = get_device(user)
    return len(device.recovery_codes or []) if device and device.enabled else 0


# ── Pase entre la contraseña y el código ─────────────────────────────────────

def _password_fingerprint(user) -> str:
    return hashlib.sha256((user.password or '').encode()).hexdigest()[:16]


def make_pending_token(user) -> str:
    return signing.dumps({'u': user.pk, 'p': _password_fingerprint(user)}, salt=_PENDING_SALT, compress=False)


def read_pending_token(token: str):
    """Usuario del pase, o None si no vale o ha caducado."""
    from django.contrib.auth import get_user_model
    if not token or not isinstance(token, str) or len(token) > 500:
        return None
    try:
        data = signing.loads(token, salt=_PENDING_SALT, max_age=settings.TWO_FACTOR_PENDING_SECONDS)
    except signing.BadSignature:  # incluye SignatureExpired
        return None
    user = get_user_model().objects.filter(pk=data.get('u'), is_active=True).first()
    if not user or not hmac.compare_digest(_password_fingerprint(user), str(data.get('p', ''))):
        return None
    return user


# ── QR ────────────────────────────────────────────────────────────────────────

def issuer_name() -> str:
    from api.utils.site import studio_name
    return settings.TWO_FACTOR_ISSUER or studio_name()


def qr_svg_data_url(uri: str) -> str:
    """QR del enlace otpauth:// como imagen SVG (data URL) para un <img>."""
    import segno
    qr = segno.make(uri, error='m')
    return qr.svg_data_uri(scale=6, border=2, dark='#111111', light='#ffffff')
