"""Bloqueo temporal de cuentas tras varios intentos fallidos al entrar.

- Cada contraseña (o código de verificación) incorrecta suma un fallo al email
  y otro a la IP. Los contadores caducan a los LOGIN_LOCKOUT_MINUTES.
- Con LOGIN_LOCKOUT_ATTEMPTS fallos para un mismo email (5 en 15 min por
  defecto) ese email queda bloqueado LOGIN_LOCKOUT_MINUTES: ni siquiera la
  contraseña buena entra. Se desbloquea solo o al crear una contraseña nueva
  con el enlace del email.
- Se cuenta por email exista o no la cuenta: la respuesta es la misma y no
  revela quién tiene cuenta.
- Tras LOGIN_CAPTCHA_AFTER fallos (por IP o por email) se pide además el
  captcha (si Turnstile está configurado).

Los contadores viven en la caché (Redis en producción).
"""
import logging
import time

from django.conf import settings
from django.core.cache import cache

from api.throttling import client_ip, email_key, human_wait, ip_key

logger = logging.getLogger(__name__)


def _window() -> int:
    return max(60, settings.LOGIN_LOCKOUT_MINUTES * 60)


def _fail_key(kind: str, ident: str) -> str:
    return f'auth:fail:{kind}:{ident}'


def _lock_key(ident: str) -> str:
    return f'auth:lock:{ident}'


def _incr(key: str) -> int:
    cache.add(key, 0, timeout=_window())
    try:
        return cache.incr(key)
    except ValueError:  # caducó justo entre add e incr
        cache.set(key, 1, timeout=_window())
        return 1


def locked_for(email: str) -> int:
    """Segundos que le quedan de bloqueo a este email (0 = no está bloqueado)."""
    ident = email_key(email)
    if not ident:
        return 0
    until = cache.get(_lock_key(ident))
    if not until:
        return 0
    return max(1, int(until - time.time()))


def locked_message(seconds: int) -> str:
    return (
        'Por seguridad hemos bloqueado el acceso con este email durante un rato, porque la contraseña '
        f'se ha escrito mal varias veces. Espera {human_wait(seconds)} y vuelve a probar, '
        'o crea una contraseña nueva con «¿Has olvidado tu contraseña?».'
    )


def locked_response_data(seconds: int) -> dict:
    msg = locked_message(seconds)
    return {'error': msg, 'detail': msg, 'code': 'account_locked', 'retry_in': seconds}


def register_failure(request, email: str, reason: str = 'password') -> bool:
    """Apunta un intento fallido. Devuelve True si con este el email queda bloqueado."""
    ident = email_key(email)
    _incr(_fail_key('ip', ip_key(request)))
    if not ident:
        return False
    count = _incr(_fail_key('email', ident))
    if count >= settings.LOGIN_LOCKOUT_ATTEMPTS and not cache.get(_lock_key(ident)):
        seconds = settings.LOGIN_LOCKOUT_MINUTES * 60
        cache.set(_lock_key(ident), time.time() + seconds, timeout=seconds)
        cache.delete(_fail_key('email', ident))
        logger.warning(
            "security.account_locked email_hash=%s ip=%s reason=%s minutes=%s",
            ident[:12], client_ip(request), reason, settings.LOGIN_LOCKOUT_MINUTES,
        )
        return True
    logger.info("security.login_failed email_hash=%s ip=%s reason=%s count=%s",
                ident[:12], client_ip(request), reason, count)
    return False


def failures(request, email: str = '') -> int:
    """Fallos recientes (el mayor entre los de la IP y los del email)."""
    by_ip = cache.get(_fail_key('ip', ip_key(request))) or 0
    ident = email_key(email)
    by_email = (cache.get(_fail_key('email', ident)) or 0) if ident else 0
    return max(int(by_ip), int(by_email))


def clear_failures(email: str):
    """Entrada correcta: se olvidan los fallos de ese email (los de la IP no,
    para que nadie los borre entrando en su propia cuenta)."""
    ident = email_key(email)
    if ident:
        cache.delete(_fail_key('email', ident))


def unlock(email: str):
    """Contraseña nueva creada con el enlace del email: fuera bloqueo y fallos."""
    ident = email_key(email)
    if ident:
        cache.delete_many([_lock_key(ident), _fail_key('email', ident)])
