"""Límites de peticiones (rate limiting) y la IP real de quien llama.

Los contadores viven en la caché de Django (Redis en producción, memoria en
desarrollo). Cada límite tiene un nombre («scope») con su valor por defecto en
settings.THROTTLE_RATES, que se cambia con la variable THROTTLE_<NOMBRE>.

Uso en una vista:

    throttle_classes = [scoped('login'), scoped('login_email', 'email')]

- 'ip'    → cuenta por IP (o por red /64 en IPv6).
- 'email' → cuenta por el email que viene en el cuerpo (si no hay email, no limita).
- 'user'  → por usuario con sesión; sin sesión, por IP.

Cuando se supera, la respuesta es un 429 con un mensaje en español y los
segundos que faltan (ver exception_handler).
"""
import hashlib
import ipaddress
import logging
import re
from functools import lru_cache

from django.conf import settings
from rest_framework.exceptions import Throttled
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


# ── IP real ───────────────────────────────────────────────────────────────────

@lru_cache(maxsize=8)
def _trusted_networks(cidrs: tuple) -> tuple:
    nets = []
    for c in cidrs:
        try:
            nets.append(ipaddress.ip_network(c, strict=False))
        except ValueError:
            logger.warning("security.trusted_proxy_cidr_invalid value=%s", c)
    return tuple(nets)


def _is_trusted_proxy(ip) -> bool:
    """Las direcciones que no son públicas (redes internas de Railway, Docker,
    localhost…) son de nuestros propios proxies. Se pueden añadir rangos
    públicos con TRUSTED_PROXY_CIDRS."""
    if not ip.is_global:
        return True
    return any(ip in net for net in _trusted_networks(tuple(settings.TRUSTED_PROXY_CIDRS)))


def client_ip(request) -> str:
    """IP del navegador que hace la petición.

    Se recorre la cadena X-Forwarded-For + REMOTE_ADDR de derecha a izquierda
    saltando nuestros proxies de confianza: la primera dirección pública es la
    de quien llama. Lo que haya más a la izquierda lo pudo escribir el propio
    cliente, así que no se mira (no se puede falsear la IP para saltarse los
    límites). Sin ninguna dirección pública (desarrollo) se usa la más lejana."""
    remote = (request.META.get('REMOTE_ADDR') or '').strip()
    xff = request.META.get('HTTP_X_FORWARDED_FOR') or ''
    chain = [p.strip() for p in xff.split(',') if p.strip()]
    if remote:
        chain.append(remote)
    for addr in reversed(chain):
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return addr[:64]
        if not _is_trusted_proxy(ip):
            return str(ip)
    return chain[0][:64] if chain else ''


def ip_key(request) -> str:
    """Clave para contar por IP. En IPv6 cada conexión doméstica tiene una red
    /64 entera: se cuenta por red para que no baste con cambiar de dirección."""
    raw = client_ip(request)
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return raw or 'desconocida'
    if ip.version == 6:
        return str(ipaddress.ip_network(f'{ip}/64', strict=False))
    return str(ip)


def email_key(email: str) -> str:
    """Email normalizado y resumido (no se guardan emails en la caché)."""
    norm = (email or '').strip().lower()
    return hashlib.sha256(norm.encode()).hexdigest()[:32] if norm else ''


def request_email(request) -> str:
    try:
        data = request.data
    except Exception:
        return ''
    value = data.get('email') if hasattr(data, 'get') else ''
    return value if isinstance(value, str) else ''


# ── Límites ───────────────────────────────────────────────────────────────────

_RATE_RE = re.compile(r'^\s*(\d+)\s*/\s*(\d*)\s*([smhd])\w*\s*$')
_PERIODS = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}


def parse_rate(rate):
    """'10/m' → (10, 60); '5/15m' → (5, 900); '20/hour' → (20, 3600)."""
    if not rate:
        return None, None
    m = _RATE_RE.match(str(rate))
    if not m:
        raise ValueError(f'Límite no válido: {rate!r} (usa por ejemplo 10/m, 5/15m o 20/h)')
    num, mult, unit = m.groups()
    return int(num), int(mult or 1) * _PERIODS[unit]


class _BaseThrottle(SimpleRateThrottle):
    """Lee el límite de settings en cada petición (así lo cambian las
    variables de entorno y los tests) y entiende periodos como 15m."""

    def get_rate(self):
        return settings.THROTTLE_RATES.get(self.scope)

    def parse_rate(self, rate):
        return parse_rate(rate)

    def ident(self, request) -> str:  # pragma: no cover - lo implementa cada clase
        raise NotImplementedError

    def get_cache_key(self, request, view):
        ident = self.ident(request)
        if not ident:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': ident}

    def allow_request(self, request, view):
        if not settings.RATE_LIMITS_ENABLED:
            return True
        allowed = super().allow_request(request, view)
        if not allowed:
            logger.warning("security.throttled scope=%s ip=%s path=%s", self.scope, client_ip(request), request.path)
        return allowed


class IPRateThrottle(_BaseThrottle):
    def ident(self, request):
        return ip_key(request)


class EmailRateThrottle(_BaseThrottle):
    def ident(self, request):
        return email_key(request_email(request))


class UserRateThrottle(_BaseThrottle):
    def ident(self, request):
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            return f'u{user.pk}'
        return ip_key(request)


_KINDS = {'ip': IPRateThrottle, 'email': EmailRateThrottle, 'user': UserRateThrottle}


@lru_cache(maxsize=None)
def scoped(scope: str, kind: str = 'ip'):
    """Clase de límite para usar en throttle_classes."""
    base = _KINDS[kind]
    return type(f'{base.__name__}[{scope}]', (base,), {'scope': scope})


def check_throttles(request, *throttles):
    """Aplica límites a mano dentro de una vista (p. ej. solo a una acción de
    un ViewSet). Lanza Throttled (429) si alguno se supera."""
    waits = []
    for cls in throttles:
        t = cls()
        if not t.allow_request(request, None):
            waits.append(t.wait() or 0)
    if waits:
        raise Throttled(wait=max(waits))


# ── Respuesta 429 en español ──────────────────────────────────────────────────

def human_wait(seconds) -> str:
    seconds = int(seconds or 0)
    if seconds <= 60:
        return 'un minuto'
    minutes = -(-seconds // 60)
    if minutes < 60:
        return f'{minutes} minutos'
    hours = -(-minutes // 60)
    return 'una hora' if hours == 1 else f'{hours} horas'


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if isinstance(exc, Throttled) and response is not None:
        wait = int(exc.wait or 0)
        msg = f'Demasiados intentos seguidos. Por seguridad, espera {human_wait(wait)} y vuelve a probar.'
        response.data = {'detail': msg, 'error': msg, 'code': 'throttled', 'retry_in': wait}
    return response
