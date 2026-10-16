"""Coordenadas del estudio a partir de su dirección (OpenStreetMap/Nominatim,
gratis y sin clave). Se usan en el mapa de «Cómo llegar» de la web, en los
datos para Google (GeoCoordinates) y en /llms.txt: ayudan a que te
recomienden en búsquedas «cerca de mí».

Una coordenada equivocada es peor que ninguna (te pondría en otro sitio del
mapa): solo se acepta un resultado si coincide el código postal o la ciudad.
Si no se encuentra, el panel pide colocar el punto a mano en el mapa.

Política de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
  - identificarse con un User-Agent propio (NOMINATIM_USER_AGENT o, por
    defecto, «StudioKit/1.0 (+<web del estudio>; <email de contacto>)»);
  - como mucho 1 petición por segundo EN TOTAL: turno compartido en la caché
    (vale con varios procesos si la caché es Redis);
  - solo se llama al GUARDAR la dirección en el panel, nunca al servir la web
    pública; con tiempo máximo por petición y en total.
"""
import logging
import os
import re
import time
import unicodedata

import requests
from django.core.cache import cache

logger = logging.getLogger(__name__)

NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
MIN_INTERVAL = 1.05      # segundos entre peticiones (política: máx. 1/s)
REQUEST_TIMEOUT = 5      # segundos por petición
TOTAL_BUDGET = 12        # segundos como mucho para todos los intentos
_TURN_KEY = 'geocode:nominatim:next'
_LOCK_KEY = 'geocode:nominatim:lock'

_STREET_PREFIX = re.compile(
    r'^(c/|c\.|calle|avda\.?|av\.?|avenida|avinguda|pza\.?|plaza|plaça|paseo|pº|ps\.?|passeig|'
    r'ctra\.?|carretera|camino|ronda|travesía|urb\.?|urbanización)\s+(de\s+(la\s+|los\s+|las\s+)?|del\s+)?',
    re.IGNORECASE,
)


def _norm(text: str) -> str:
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def _matches(result: dict, city: str, postal_code: str) -> bool:
    addr = result.get('address') or {}
    if postal_code:
        return (addr.get('postcode') or '').replace(' ', '') == postal_code.replace(' ', '')
    if city:
        places = [addr.get(k, '') for k in ('city', 'town', 'village', 'municipality', 'suburb')]
        return any(_norm(city) and _norm(city) in _norm(p) for p in places if p)
    return False


def user_agent() -> str:
    """Identificación ante Nominatim (obligatoria por su política de uso)."""
    custom = (os.environ.get('NOMINATIM_USER_AGENT') or '').strip()
    if custom:
        return custom
    parts = []
    try:
        from api.utils.site import get_site_config, web_url
        parts.append(f'+{web_url()}')
        email = (get_site_config().contact_email or '').strip()
        if email:
            parts.append(email)
    except Exception:  # sin base de datos (scripts): basta con el nombre
        pass
    return f"StudioKit/1.0 ({'; '.join(parts) or 'self-hosted studio booking app'})"


def _wait_turn(deadline: float) -> bool:
    """Reserva el siguiente hueco libre (≥ MIN_INTERVAL tras el anterior) y
    espera a que llegue. False si no cabe antes de `deadline`."""
    while True:
        now = time.time()
        if cache.add(_LOCK_KEY, 1, timeout=5):
            try:
                slot = max(now, float(cache.get(_TURN_KEY) or 0))
                if slot > deadline:
                    return False
                cache.set(_TURN_KEY, slot + MIN_INTERVAL, timeout=60)
            finally:
                cache.delete(_LOCK_KEY)
            if slot > now:
                time.sleep(slot - now)
            return True
        if now + 0.1 > deadline:
            return False
        time.sleep(0.05)


def geocode(address: str, city: str, postal_code: str, country: str):
    """(lat, lon) o None si no se encuentra con seguridad (o Nominatim falla)."""
    if not (address and (city or postal_code)):
        return None
    street = _STREET_PREFIX.sub('', address.strip())
    base = {'countrycodes': (country or 'es').lower(), 'format': 'json', 'limit': 5, 'addressdetails': 1}
    attempts = [
        {**base, 'street': street, 'city': city, 'postalcode': postal_code},
        {**base, 'q': ', '.join(p for p in (street, postal_code, city) if p)},
        {**base, 'q': ', '.join(p for p in (address, postal_code, city) if p)},
    ]
    deadline = time.time() + TOTAL_BUDGET
    headers = {'User-Agent': user_agent(), 'Accept-Language': (country or 'es').lower()}
    errors = 0
    for params in attempts:
        if not _wait_turn(deadline - REQUEST_TIMEOUT):
            logger.warning("geocode.out_of_time address=%r city=%r", address, city)
            return None
        try:
            r = requests.get(
                NOMINATIM_URL,
                params={k: v for k, v in params.items() if v},
                headers=headers,
                timeout=min(REQUEST_TIMEOUT, max(1.0, deadline - time.time())),
            )
            if not r.ok:
                errors += 1
                logger.warning("geocode.http_error status=%s address=%r", r.status_code, address)
                if r.status_code in (403, 429):  # bloqueados o demasiadas peticiones: no insistir
                    return None
                continue
            for result in r.json():
                if _matches(result, city, postal_code):
                    return round(float(result['lat']), 6), round(float(result['lon']), 6)
        except Exception as e:
            errors += 1
            logger.warning("geocode.failed address=%r city=%r error=%s", address, city, type(e).__name__)
    if not errors:
        logger.info("geocode.not_found address=%r city=%r postal_code=%r", address, city, postal_code)
    return None
