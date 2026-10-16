"""Stripe opcional. Si el estudio no lo ha conectado, los pagos online están
desactivados: la web oculta el pago con tarjeta y el estudio vende los
créditos en persona (se añaden desde el panel → Créditos).

Dos formas de cobrar (SiteConfig.payments_provider):

- «keys»: el estudio pega sus claves de Stripe en el panel (o van en el
  entorno: STRIPE_SECRET_KEY…). Es lo de siempre y lo que ve quien instala
  Corelia por su cuenta.
- «connect» («Conectar pagos»): la instalación tiene una plataforma de Stripe
  Connect (STRIPE_CONNECT_* en el entorno) y el estudio solo pulsa un botón:
  Stripe le crea su propia cuenta (api/utils/stripe_connect.py). Se cobra con
  cargos directos en SU cuenta: el dinero va a su banco, la comisión de
  Stripe la paga ella y la plataforma no se queda nada.

Cada vista de pago pide stripe_client(): un StripeClient listo para la
cuenta que cobra ahora, o None si los pagos están desactivados. Para operar
sobre algo ya cobrado (reembolsos, cancelar una suscripción) se pide el de su
cuenta: stripe_client(account=pago.stripe_account) ('' = la de las claves).
Nunca se toca `stripe.api_key` (global del proceso): cada llamada lleva su
propia clave.
"""
import json
import logging
from decimal import ROUND_HALF_UP, Decimal

import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from api.utils.site import get_site_config

logger = logging.getLogger(__name__)

PAYMENTS_DISABLED_MESSAGE = (
    'Los pagos online no están activados en este estudio. '
    'Puedes comprar tus clases directamente en el estudio.'
)

# Estados de la cuenta conectada (payments_status()['state'])
CONNECT_STATES = ('none', 'onboarding', 'pending', 'restricted', 'active', 'mismatch')


def _is_live_secret(key: str) -> bool:
    return (key or '').startswith(('sk_live_', 'rk_live_'))


def stripe_keys(cfg=None):
    """(secreta, publicable, webhook) de las CLAVES del estudio: panel > entorno."""
    cfg = cfg or get_site_config()
    if cfg.payments_enabled and cfg.stripe_secret_key:
        return cfg.stripe_secret_key, cfg.stripe_publishable_key, cfg.stripe_webhook_secret
    if settings.STRIPE_SECRET_KEY:
        return settings.STRIPE_SECRET_KEY, settings.STRIPE_PUBLISHABLE_KEY, settings.STRIPE_WEBHOOK_SECRET
    return '', '', ''


# ─── «Conectar pagos» (Stripe Connect) ────────────────────────────────────────

def connect_configured() -> bool:
    """¿Tiene esta instalación una plataforma de Connect? Hacen falta la clave
    secreta y la publicable de la plataforma, y las dos del mismo modo."""
    secret = settings.STRIPE_CONNECT_PLATFORM_KEY or ''
    publishable = settings.STRIPE_CONNECT_PUBLISHABLE_KEY or ''
    if not secret or not publishable:
        return False
    return _is_live_secret(secret) == publishable.startswith('pk_live_')


def platform_live() -> bool:
    return _is_live_secret(settings.STRIPE_CONNECT_PLATFORM_KEY)


def connect_available(cfg=None) -> bool:
    """¿Se ofrece «Conectar pagos» a este estudio? Plataforma configurada y,
    si se ha definido STRIPE_CONNECT_AVAILABILITY_CHECK (ruta a una función
    f(site_config) -> bool), que esa función diga que sí. Solo decide si se
    puede EMPEZAR: una cuenta ya conectada sigue funcionando."""
    if not connect_configured():
        return False
    path = settings.STRIPE_CONNECT_AVAILABILITY_CHECK
    if not path:
        return True
    try:
        from django.utils.module_loading import import_string
        return bool(import_string(path)(cfg or get_site_config()))
    except Exception:
        logger.exception("stripe_connect.availability_check_failed path=%s", path)
        return False


def connect_countries() -> list:
    """Países (ISO-2) en los que se puede abrir la cuenta conectada."""
    return list(settings.STRIPE_CONNECT_COUNTRIES)


def connect_state(cfg=None) -> str:
    """Estado de la cuenta conectada, a partir de lo último que dijo Stripe
    (SiteConfig.stripe_connect_status, forma de GET /v1/accounts/{id}):

    none        sin cuenta conectada
    onboarding  cuenta creada, faltan sus datos en Stripe
    pending     datos enviados, Stripe los está revisando
    restricted  Stripe necesita más datos (o la ha limitado)
    active      puede cobrar (charges_enabled)
    mismatch    la cuenta no es de la plataforma actual (otro modo test/live,
                o la instalación ya no tiene Connect configurado)
    """
    cfg = cfg or get_site_config()
    if not cfg.stripe_account_id:
        return 'none'
    st = cfg.stripe_connect_status or {}
    if not connect_configured() or bool(st.get('livemode', platform_live())) != platform_live():
        return 'mismatch'
    if st.get('charges_enabled'):
        return 'active'
    if not st.get('details_submitted'):
        return 'onboarding'
    disabled = str(st.get('disabled_reason') or '')
    if st.get('past_due') or st.get('currently_due') or disabled.startswith(('rejected', 'requirements.past_due')):
        return 'restricted'
    return 'pending'


def _requirements_due(st: dict) -> list:
    due = []
    for key in ('past_due', 'currently_due'):
        for item in st.get(key) or []:
            if item not in due:
                due.append(item)
    return due


def _effective(cfg) -> tuple:
    """(proveedor, listo, live) con el que se cobra ahora mismo.

    Con 'connect' elegido y la cuenta activa → la cuenta conectada. Si no,
    las claves (panel o entorno) si las hay: así un estudio que ya cobraba
    con claves sigue cobrando mientras termina de conectar su cuenta."""
    st = cfg.stripe_connect_status or {}
    if cfg.payments_provider == 'connect' and connect_state(cfg) == 'active':
        return 'connect', True, bool(st.get('livemode'))
    secret = stripe_keys(cfg)[0]
    if secret:
        return 'keys', True, _is_live_secret(secret)
    if cfg.stripe_account_id:
        return 'connect', False, bool(st.get('livemode', platform_live()))
    return '', False, False


def keys_fallback_enabled() -> bool:
    """¿Se ofrece pegar las claves propias de Stripe (plan B sin Connect)?
    STRIPE_KEYS_FALLBACK_ENABLED (por defecto sí). No afecta a claves ya
    guardadas: siguen cobrando y se pueden desconectar."""
    return bool(getattr(settings, 'STRIPE_KEYS_FALLBACK_ENABLED', True))


def payments_status(cfg=None) -> dict:
    """Todo lo que el panel (y la guía) necesitan saber de los pagos online."""
    cfg = cfg or get_site_config()
    provider, ready, live = _effective(cfg)
    st = cfg.stripe_connect_status or {}
    return {
        'provider': provider,
        'ready': ready,
        'state': connect_state(cfg),
        'connect_available': connect_available(cfg),
        'live': live,
        'requirements_due': _requirements_due(st) if cfg.stripe_account_id else [],
        'account_id': cfg.stripe_account_id,
        # El panel ofrece «Avanzado: usar mis propias claves» (solo sin Connect)
        'keys_fallback': keys_fallback_enabled(),
    }


def payments_enabled() -> bool:
    """¿Se puede cobrar online ahora mismo (claves o cuenta conectada activa)?"""
    return _effective(get_site_config())[1]


def current_stripe_account(cfg=None):
    """Cuenta con la que se cobra ahora: 'acct_…' (conectada), '' (claves) o
    None si los pagos están desactivados. Es lo que se guarda en
    Payment.stripe_account / Subscription.stripe_account."""
    cfg = cfg or get_site_config()
    provider, ready, _ = _effective(cfg)
    if not ready:
        return None
    return cfg.stripe_account_id if provider == 'connect' else ''


def platform_client():
    """StripeClient de la plataforma de Connect (sin cuenta conectada), o None."""
    if not settings.STRIPE_CONNECT_PLATFORM_KEY:
        return None
    return stripe.StripeClient(settings.STRIPE_CONNECT_PLATFORM_KEY)


def stripe_client(account=None):
    """StripeClient para cobrar, o None si no se puede. Úsalo así:

        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        client.v1.checkout.sessions.create(params={...})

    account=None  → la cuenta que cobra ahora (claves o cuenta conectada).
    account=''    → la de las claves (pagos y suscripciones de antes de
                    conectar, o de un estudio que nunca usó Connect).
    account='acct_…' → esa cuenta conectada, con la clave de la plataforma
                    (cabecera Stripe-Account: cargos directos).
    """
    if account is None:
        cfg = get_site_config()
        provider, ready, _ = _effective(cfg)
        if not ready:
            return None
        if provider == 'connect':
            return stripe.StripeClient(settings.STRIPE_CONNECT_PLATFORM_KEY, stripe_account=cfg.stripe_account_id)
        return stripe.StripeClient(stripe_keys()[0])
    if account == '':
        secret = stripe_keys()[0]
        return stripe.StripeClient(secret) if secret else None
    if not settings.STRIPE_CONNECT_PLATFORM_KEY:
        return None
    return stripe.StripeClient(settings.STRIPE_CONNECT_PLATFORM_KEY, stripe_account=account)


def publishable_key() -> str:
    """Clave publicable para Stripe.js: la de la plataforma con la cuenta
    conectada, la del estudio con claves; '' sin pagos."""
    provider, ready, _ = _effective(get_site_config())
    if not ready:
        return ''
    if provider == 'connect':
        return settings.STRIPE_CONNECT_PUBLISHABLE_KEY
    return stripe_keys()[1]


def stripe_account_for_js() -> str:
    """acct_… para loadStripe(pk, {stripeAccount}) con la cuenta conectada; '' si no."""
    cfg = get_site_config()
    provider, ready, _ = _effective(cfg)
    return cfg.stripe_account_id if (ready and provider == 'connect') else ''


def stripe_ready() -> bool:
    """Obsoleto: usa stripe_client(). Ya no configura nada global."""
    return payments_enabled()


def payments_disabled_response():
    return Response({'error': PAYMENTS_DISABLED_MESSAGE, 'code': 'payments_disabled'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE)


def to_dict(obj) -> dict:
    """Objeto de Stripe → dict normal. Desde la versión 15 de la librería,
    StripeObject ya no es un dict (no tiene .get()). Acepta también dicts."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, 'to_dict'):
        return obj.to_dict()
    return dict(obj)


def parse_webhook_event(payload, sig_header: str, secret: str) -> dict:
    """Comprueba la firma de un aviso de Stripe y devuelve el evento como dict
    normal (event['data']['object'].get(...) funciona como siempre).
    Lanza stripe.SignatureVerificationError (firma) o ValueError (cuerpo)."""
    text = payload.decode('utf-8') if isinstance(payload, (bytes, bytearray)) else (payload or '')
    stripe.WebhookSignature.verify_header(text, sig_header, secret, stripe.Webhook.DEFAULT_TOLERANCE)
    event = json.loads(text)
    if not isinstance(event, dict) or not event.get('type') or not isinstance(event.get('data'), dict):
        raise ValueError('Evento de Stripe sin tipo o sin datos')
    return event


# Exactamente los eventos que procesa StripeWebhookView
WEBHOOK_EVENTS = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'invoice.paid',
    'customer.subscription.updated',
    'customer.subscription.deleted',
]

# Eventos del endpoint «Connect» de la plataforma (ConnectWebhookView): los de
# pago de arriba, que llegan de la cuenta conectada (event.account), y los de
# la propia cuenta. Lista para docs/STRIPE_CONNECT.md.
CONNECT_WEBHOOK_EVENTS = WEBHOOK_EVENTS + [
    'account.updated',
    'account.application.deauthorized',
]


def _account_name(account):
    try:
        return account.settings.dashboard.display_name or account.email or account.id
    except AttributeError:
        return getattr(account, 'email', None) or account.id


def connect_stripe(secret_key: str, webhook_url: str) -> dict:
    """Conecta la cuenta de Stripe del estudio en un solo paso:
    valida la clave, obtiene la clave publicable y CREA el webhook
    automáticamente (el paso manual que más falla). Devuelve un dict con el
    resultado; lanza ValueError con un mensaje legible si algo va mal."""
    secret_key = (secret_key or '').strip()
    if not secret_key.startswith(('sk_live_', 'sk_test_', 'rk_live_', 'rk_test_')):
        raise ValueError('Esa no parece una clave secreta de Stripe (empieza por sk_live_ o sk_test_).')

    client = stripe.StripeClient(secret_key)
    try:
        account = client.v1.accounts.retrieve_current()
    except stripe.AuthenticationError:
        raise ValueError('Stripe dice que la clave no es válida. Cópiala de nuevo desde Stripe → Desarrolladores → Claves de API.')
    except stripe.StripeError as e:
        raise ValueError(f'No se pudo conectar con Stripe: {e.user_message or e}')

    cfg = get_site_config()
    # Si ya había un webhook creado por nosotros, se sustituye (p. ej. cambio de dominio)
    if cfg.stripe_webhook_id:
        try:
            client.v1.webhook_endpoints.delete(cfg.stripe_webhook_id)
        except stripe.StripeError:
            pass

    try:
        endpoint = client.v1.webhook_endpoints.create(params={
            'url': webhook_url,
            'enabled_events': WEBHOOK_EVENTS,
            'description': f'Corelia — {cfg.studio_name}',
            # Los avisos llegan con la misma versión de la API que usa la
            # librería (si no, con la versión por defecto de la cuenta).
            'api_version': stripe.api_version,
        })
    except stripe.StripeError as e:
        raise ValueError(f'No se pudo crear el aviso automático (webhook) en Stripe: {e.user_message or e}')

    # Dominios de la web y del panel para Apple Pay / Google Pay / Link (nunca falla)
    from api.utils.payment_methods import register_with_keys
    register_with_keys(client, cfg)

    return {
        'account_id': account.id,
        'account_name': _account_name(account),
        'live_mode': secret_key.startswith(('sk_live_', 'rk_live_')),
        # Moneda en la que Stripe le paga al estudio (para avisar si no coincide)
        'default_currency': str(getattr(account, 'default_currency', '') or '').upper(),
        'webhook_id': endpoint.id,
        'webhook_secret': endpoint.secret,
    }


# ─── Importes para Stripe ─────────────────────────────────────────────────────
# Stripe recibe los importes como ENTEROS en la «unidad mínima» de la moneda:
# 29,90 € → 2990 (céntimos). Pero las monedas «sin decimales» van tal cual:
# 15.990 CLP → 15990 (no 1.599.000).
#
# Lista oficial de Stripe (https://docs.stripe.com/currencies#zero-decimal,
# consultada el 14-10-2026): BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF,
# UGX, VND, VUV, XAF, XOF, XPF.
#   · De las monedas que admite Corelia, solo CLP es sin decimales.
#   · COP NO lo es en Stripe: se multiplica por 100 como EUR o USD (Stripe
#     admite hasta 10 cifras en COP para métodos que no son tarjeta).
#   · Casos especiales («Special cases» de la misma página): ISK y UGX pasaron
#     a ser sin decimales, pero por compatibilidad se mandan con dos decimales
#     siempre «00» (5 UGX → 500). Aquí van en WHOLE_UNITS_TWO_DECIMAL.
#   · HUF y TWD se cobran con dos decimales (solo las transferencias son
#     enteras); las monedas de tres decimales (BHD, JOD, KWD, OMR, TND) no
#     están admitidas.
ZERO_DECIMAL = frozenset({
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
    'VND', 'VUV', 'XAF', 'XOF', 'XPF',
})
WHOLE_UNITS_TWO_DECIMAL = frozenset({'ISK', 'UGX'})


def stripe_currency(currency=None) -> str:
    """Código de moneda para Stripe (en minúsculas): la del estudio por defecto."""
    from api.utils.locale import normalize_currency, studio_currency
    return (normalize_currency(currency) if currency else studio_currency()).lower()


def to_stripe_amount(amount, currency) -> int:
    """Decimal en la moneda → entero en la unidad mínima de Stripe.
    29.90 EUR → 2990 · 15990 CLP → 15990 · 5 UGX → 500. Redondea al más cercano."""
    code = str(currency or '').upper()
    value = Decimal(str(amount if amount is not None else 0))
    if code in ZERO_DECIMAL:
        return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if code in WHOLE_UNITS_TWO_DECIMAL:
        return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP)) * 100
    return int((value * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def from_stripe_amount(amount, currency) -> Decimal:
    """Entero de Stripe (unidad mínima) → Decimal en la moneda.
    2990 EUR → 29.90 · 15990 CLP → 15990."""
    code = str(currency or '').upper()
    value = Decimal(int(amount or 0))
    if code in ZERO_DECIMAL:
        return value
    return (value / 100).quantize(Decimal('0.01'))
