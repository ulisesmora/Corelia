"""Acceso a la configuración del estudio (SiteConfig) desde cualquier parte
del backend: nombre, URLs de la web, contexto de marca para los emails y
claves de las integraciones.

Se cachea unos segundos en memoria del proceso para no consultar la BD en
cada email/petición; al guardar en el panel la caché se limpia.
"""
import time

from django.conf import settings

_CACHE = {'obj': None, 'at': 0.0}
_TTL_SECONDS = 30


def clear_site_config_cache():
    _CACHE['obj'] = None
    _CACHE['at'] = 0.0
    try:
        from api.utils import brand_images
        brand_images._cache.clear()
    except Exception:
        pass


def get_site_config():
    """SiteConfig actual (siempre existe: se crea con valores por defecto)."""
    now = time.monotonic()
    if _CACHE['obj'] is None or now - _CACHE['at'] > _TTL_SECONDS:
        from api.models import SiteConfig
        _CACHE['obj'] = SiteConfig.load()
        _CACHE['at'] = now
    return _CACHE['obj']


# ── «Mi web» → Secciones ─────────────────────────────────────────────────
# Secciones de la web que el estudio puede apagar (SiteConfig.web_sections).
# Mismas claves que web/src/lib/sections.ts.
WEB_SECTION_KEYS = ('next', 'classes', 'prices', 'team', 'location', 'testimonials', 'faqs', 'gallery')


def web_sections(cfg=None) -> dict:
    """{clave: True/False} de todas las secciones (solo un False guardado la apaga)."""
    cfg = cfg or get_site_config()
    raw = cfg.web_sections if isinstance(cfg.web_sections, dict) else {}
    return {k: raw.get(k) is not False for k in WEB_SECTION_KEYS}


def web_section_on(key: str, cfg=None) -> bool:
    return web_sections(cfg).get(key, True)


def web_url(path: str = '') -> str:
    """URL absoluta de la web pública: web_url('/dashboard').
    Usa el dominio propio del estudio si lo ha configurado en el panel."""
    domain = get_site_config().web_domain
    base = f"https://{domain}" if domain else settings.WEB_URL.rstrip('/')
    if not path:
        return base
    return f"{base}/{path.lstrip('/')}"


def api_url(path: str = '') -> str:
    """URL absoluta del API/panel (dominio propio si lo hay)."""
    domain = get_site_config().panel_domain
    base = f"https://{domain}" if domain else settings.API_URL.rstrip('/')
    if not path:
        return base
    return f"{base}/{path.lstrip('/')}"


def panel_url(path: str = '') -> str:
    """URL absoluta del panel: el dominio propio del panel si lo hay o, si no,
    PANEL_URL (por defecto la del API, que es donde se sirve el panel)."""
    domain = get_site_config().panel_domain
    base = f"https://{domain}" if domain else settings.PANEL_URL.rstrip('/')
    if not path:
        return base
    return f"{base}/{path.lstrip('/')}"


def panel_origins() -> list:
    """Orígenes (esquema://host[:puerto]) desde los que se puede abrir el
    panel. Solo a estos se vuelve desde Stripe («Conectar pagos»)."""
    from urllib.parse import urlsplit
    domain = get_site_config().panel_domain
    origins = []
    for url in (panel_url(), settings.PANEL_URL, settings.API_URL, f'https://{domain}' if domain else ''):
        parts = urlsplit((url or '').strip())
        if parts.scheme in ('http', 'https') and parts.netloc:
            origin = f'{parts.scheme}://{parts.netloc}'
            if origin not in origins:
                origins.append(origin)
    return origins


def stripe_webhook_url() -> str:
    return api_url('/api/v1/webhooks/listener/')


def stripe_connect_webhook_url() -> str:
    return api_url('/api/v1/webhooks/connect/')


def studio_name() -> str:
    return get_site_config().studio_name or 'Mi Estudio'


def brand_context() -> dict:
    """Variables comunes a TODAS las plantillas de email (logo, colores,
    nombre, contacto). emailing.py las añade solo."""
    cfg = get_site_config()
    return {
        'brand_name': cfg.studio_name,
        'brand_logo': cfg.logo_url,
        'brand_color': cfg.color_secondary or cfg.color_primary,
        'brand_color_light': cfg.color_background,
        'brand_contact_email': cfg.contact_email,
        'brand_phone': cfg.phone,
        'brand_address': ', '.join(p for p in (cfg.address, cfg.city) if p),
        'web_url': web_url(),
    }


def placeholder_email(local_part: str) -> str:
    """Email interno para clientes sin email (nunca se les escribe)."""
    return f"{local_part}@{settings.PLACEHOLDER_EMAIL_DOMAIN}"


def ensure_vapid_keys(cfg=None):
    """Devuelve (pública, privada) de los avisos push, generándolas la
    primera vez. Sin configuración manual: cada instalación tiene las suyas."""
    from api.models import SiteConfig
    cfg = cfg or SiteConfig.load()
    if cfg.vapid_public_key and cfg.vapid_private_key:
        return cfg.vapid_public_key, cfg.vapid_private_key

    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    priv = key.private_numbers().private_value.to_bytes(32, 'big')
    pub = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()  # noqa: E731
    cfg.vapid_public_key = b64(pub)
    cfg.vapid_private_key = b64(priv)
    cfg.save(update_fields=['vapid_public_key', 'vapid_private_key', 'updated_at'])
    return cfg.vapid_public_key, cfg.vapid_private_key
