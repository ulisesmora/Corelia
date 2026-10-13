"""
Verificación de email: código de 6 dígitos (B) + enlace (compatibilidad).

Modelo "verificación suave" (A): la cuenta funciona desde el primer momento;
solo se exige el email verificado para contratar una membresía. El código
se escribe en la misma pantalla (funciona dentro de la app instalada, donde
un enlace abriría otro navegador) y el enlace del email sigue valiendo.

- Código: 6 dígitos, válido 30 min, guardado HASHEADO, máx. 5 intentos.
- Reenvío: como mucho 1 cada 60 s.
- Emails generados por el estudio (PLACEHOLDER_EMAIL_DOMAIN, altas desde el CRM sin
  email) nunca reciben correos de verificación: no existen y rebotarían.
"""
import logging
import secrets
import uuid
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from api.utils.site import studio_name, web_url

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 30
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
LINK_TTL_DAYS = 30
TEMPLATE_ID = 'verification'
def is_placeholder_email(email: str) -> bool:
    """Email interno de una clienta dada de alta sin email (nunca se le escribe)."""
    from django.conf import settings
    return not email or email.lower().endswith('@' + settings.PLACEHOLDER_EMAIL_DOMAIN.lower())


def seconds_until_resend(user) -> int:
    if not user.verification_last_sent:
        return 0
    elapsed = (timezone.now() - user.verification_last_sent).total_seconds()
    return max(0, int(RESEND_COOLDOWN_SECONDS - elapsed))


def mark_verified(user):
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    user.verification_code_hash = None
    user.verification_code_expires = None
    user.verification_code_attempts = 0
    user.save(update_fields=[
        'is_verified', 'verification_token', 'verification_token_expires',
        'verification_code_hash', 'verification_code_expires', 'verification_code_attempts',
    ])


def send_verification(user, reminder: bool = False) -> bool:
    """Genera un código y enlace NUEVOS y los envía. Devuelve True si salió."""
    from api.utils.emailing import send_templated_email

    if user.is_verified or is_placeholder_email(user.email):
        return False

    code = f"{secrets.randbelow(10**6):06d}"
    now = timezone.now()
    user.verification_code_hash = make_password(code)
    user.verification_code_expires = now + timedelta(minutes=CODE_TTL_MINUTES)
    user.verification_code_attempts = 0
    user.verification_token = uuid.uuid4()
    user.verification_token_expires = now + timedelta(days=LINK_TTL_DAYS)
    user.verification_last_sent = now
    user.save(update_fields=[
        'verification_code_hash', 'verification_code_expires', 'verification_code_attempts',
        'verification_token', 'verification_token_expires', 'verification_last_sent',
    ])

    link = web_url(f"/verify-account?token={user.verification_token}&userid={user.id}")
    try:
        ok = send_templated_email(
            to_email=user.email,
            template_id=TEMPLATE_ID,
            dynamic_data={
                'name': user.first_name or '',
                'code': code,
                'code_minutes': CODE_TTL_MINUTES,
                'cta_url': link,
                'verification_url': link,
                'reminder': reminder,
            },
            subject=(f"{code} es tu código de {studio_name()}" if not reminder
                     else f"¿Confirmamos tu email? Tu código: {code}"),
        )
    except Exception:
        logger.warning("verification.send_failed user_id=%s", user.id, exc_info=True)
        return False
    if ok:
        logger.info("verification.sent user_id=%s reminder=%s", user.id, reminder)
    return bool(ok)


def verify_code(user, code: str):
    """Devuelve (ok, mensaje_error)."""
    if user.is_verified:
        return True, None
    code = (code or '').strip().replace(' ', '')
    if not (len(code) == 6 and code.isdigit()):
        return False, 'Escribe los 6 números del código.'
    if not user.verification_code_hash or not user.verification_code_expires:
        return False, 'No hay ningún código activo. Pide uno nuevo.'
    if user.verification_code_attempts >= MAX_ATTEMPTS:
        return False, 'Demasiados intentos. Pide un código nuevo.'
    if timezone.now() > user.verification_code_expires:
        return False, 'El código ha caducado. Pide uno nuevo.'

    if not check_password(code, user.verification_code_hash):
        user.verification_code_attempts += 1
        user.save(update_fields=['verification_code_attempts'])
        left = MAX_ATTEMPTS - user.verification_code_attempts
        return False, (f'Código incorrecto. Te quedan {left} intentos.' if left > 0
                       else 'Demasiados intentos. Pide un código nuevo.')

    mark_verified(user)
    return True, None
