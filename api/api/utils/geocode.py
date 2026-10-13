"""Coordenadas del estudio a partir de su dirección (OpenStreetMap/Nominatim,
gratis y sin clave). Se usan en los datos para Google (GeoCoordinates) y en
/llms.txt: ayudan a que te recomienden en búsquedas «cerca de mí».

Una coordenada equivocada es peor que ninguna (te pondría en otro sitio del
mapa): solo se acepta un resultado si coincide el código postal o la ciudad.

Política de Nominatim: identificarse y no más de 1 petición por segundo; aquí
solo se llama al guardar la dirección en el panel.
"""
import logging
import re
import time
import unicodedata

import requests

logger = logging.getLogger(__name__)

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


def geocode(address: str, city: str, postal_code: str, country: str):
    """(lat, lon) o None si no se encuentra con seguridad."""
    if not (address and (city or postal_code)):
        return None
    street = _STREET_PREFIX.sub('', address.strip())
    base = {'countrycodes': (country or 'es').lower(), 'format': 'json', 'limit': 5, 'addressdetails': 1}
    attempts = [
        {**base, 'street': street, 'city': city, 'postalcode': postal_code},
        {**base, 'q': ', '.join(p for p in (street, postal_code, city) if p)},
        {**base, 'q': ', '.join(p for p in (address, postal_code, city) if p)},
    ]
    for i, params in enumerate(attempts):
        if i:
            time.sleep(1.05)  # política de uso de Nominatim
        try:
            r = requests.get(
                'https://nominatim.openstreetmap.org/search',
                params={k: v for k, v in params.items() if v},
                headers={'User-Agent': 'StudioKit/1.0 (self-hosted studio booking app)'},
                timeout=6,
            )
            for result in (r.json() if r.ok else []):
                if _matches(result, city, postal_code):
                    return round(float(result['lat']), 6), round(float(result['lon']), 6)
        except Exception:
            logger.info("geocode.failed address=%s city=%s", address, city)
    return None
