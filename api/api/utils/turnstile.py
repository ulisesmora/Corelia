"""Captcha opcional con Cloudflare Turnstile (gratuito, sin cookies de seguimiento
ni «busca los semáforos»: casi siempre se resuelve solo).

Se activa con TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY (dash.cloudflare.com →
Turnstile). Sin ellas todo funciona como siempre y estas funciones dejan pasar.

El navegador muestra el widget y manda su respuesta en `turnstile_token`; aquí
se comprueba con Cloudflare. Si está activado y Cloudflare no responde, NO se
deja pasar (falla cerrado) y se pide volver a probar en un momento.

Claves de PRUEBA oficiales de Cloudflare (solo desarrollo y tests):
    site key 1x00000000000000000000AA  /  secret 1x0000000000000000000000000000000AA → siempre pasa
    secret 2x0000000000000000000000000000000AA → siempre falla
"""
import logging

import requests
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from api.throttling import client_ip

logger = logging.getLogger(__name__)

VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
MAX_TOKEN_LENGTH = 2048  # límite que documenta Cloudflare

MSG_MISSING = 'Marca la casilla de seguridad («Verifica que eres una persona») y vuelve a enviar.'
MSG_FAILED = 'No hemos podido comprobar la casilla de seguridad. Vuelve a marcarla y envía otra vez.'
MSG_UNREACHABLE = ('Ahora mismo no podemos comprobar la casilla de seguridad. '
                   'Espera un momento y vuelve a intentarlo.')


def turnstile_enabled() -> bool:
    return bool(settings.TURNSTILE_SITE_KEY and settings.TURNSTILE_SECRET_KEY)


def turnstile_site_key() -> str:
    """Clave pública para el widget ('' si el captcha está apagado)."""
    return settings.TURNSTILE_SITE_KEY if turnstile_enabled() else ''


def request_token(request) -> str:
    try:
        data = request.data
    except Exception:
        return ''
    if not hasattr(data, 'get'):
        return ''
    token = data.get('turnstile_token') or data.get('cf-turnstile-response') or ''
    return token if isinstance(token, str) else ''


def verify_turnstile(token: str, remote_ip: str = '') -> tuple[bool, str]:
    """(True, '') si el captcha es válido o está desactivado; si no, (False, mensaje)."""
    if not turnstile_enabled():
        return True, ''
    token = (token or '').strip()
    if not token:
        return False, MSG_MISSING
    if len(token) > MAX_TOKEN_LENGTH:
        return False, MSG_FAILED
    payload = {'secret': settings.TURNSTILE_SECRET_KEY, 'response': token}
    if remote_ip:
        payload['remoteip'] = remote_ip
    try:
        resp = requests.post(VERIFY_URL, data=payload, timeout=settings.TURNSTILE_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.error("security.turnstile_unreachable error=%s", e.__class__.__name__)
        return False, MSG_UNREACHABLE
    if data.get('success'):
        return True, ''
    logger.info("security.turnstile_failed codes=%s", ','.join(data.get('error-codes') or []))
    return False, MSG_FAILED


def captcha_error_response(message: str) -> Response:
    return Response(
        {'error': message, 'detail': message, 'code': 'captcha_required', 'captcha_required': True},
        status=status.HTTP_400_BAD_REQUEST,
    )


def check_captcha(request) -> Response | None:
    """En una vista: `if (resp := check_captcha(request)): return resp`."""
    ok, message = verify_turnstile(request_token(request), client_ip(request))
    return None if ok else captcha_error_response(message)
