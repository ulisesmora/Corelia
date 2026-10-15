"""Stripe opcional. Si el estudio no lo ha conectado, los pagos online están
desactivados: la web oculta el pago con tarjeta y el estudio vende los
créditos en persona (se añaden desde el panel → Créditos).

Las claves salen del panel (SiteConfig) o, como alternativa, de variables de
entorno. Cada vista de pago pide stripe_client(): un StripeClient con la
clave actual, o None si los pagos están desactivados. Nunca se toca
`stripe.api_key` (global del proceso): cada llamada lleva su propia clave.
"""
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


def stripe_keys():
    """(secreta, publicable, webhook) efectivas: panel > entorno."""
    cfg = get_site_config()
    if cfg.payments_enabled and cfg.stripe_secret_key:
        return cfg.stripe_secret_key, cfg.stripe_publishable_key, cfg.stripe_webhook_secret
    if settings.STRIPE_SECRET_KEY:
        return settings.STRIPE_SECRET_KEY, settings.STRIPE_PUBLISHABLE_KEY, settings.STRIPE_WEBHOOK_SECRET
    return '', '', ''


def payments_enabled() -> bool:
    return bool(stripe_keys()[0])


def stripe_client():
    """StripeClient con la clave actual, o None si los pagos están
    desactivados. Úsalo así:

        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        client.v1.checkout.sessions.create(params={...})
    """
    secret = stripe_keys()[0]
    if not secret:
        return None
    return stripe.StripeClient(secret)


def stripe_ready() -> bool:
    """Obsoleto: usa stripe_client(). Ya no configura nada global."""
    return payments_enabled()


def payments_disabled_response():
    return Response({'error': PAYMENTS_DISABLED_MESSAGE, 'code': 'payments_disabled'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE)


# Exactamente los eventos que procesa StripeWebhookView
WEBHOOK_EVENTS = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'invoice.paid',
    'customer.subscription.updated',
    'customer.subscription.deleted',
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
        })
    except stripe.StripeError as e:
        raise ValueError(f'No se pudo crear el aviso automático (webhook) en Stripe: {e.user_message or e}')

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
