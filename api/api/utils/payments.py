"""Stripe opcional. Si el estudio no lo ha conectado, los pagos online están
desactivados: la web oculta el pago con tarjeta y el estudio vende los
créditos en persona (se añaden desde el panel → Créditos).

Las claves salen del panel (SiteConfig) o, como alternativa, de variables de
entorno. Cada vista de pago llama a stripe_ready() antes de usar stripe.
"""
import logging

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


def stripe_ready() -> bool:
    """Configura la librería con la clave actual. False = pagos desactivados."""
    secret = stripe_keys()[0]
    if not secret:
        return False
    stripe.api_key = secret
    return True


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
            'description': f'Studio Kit — {cfg.studio_name}',
        })
    except stripe.StripeError as e:
        raise ValueError(f'No se pudo crear el aviso automático (webhook) en Stripe: {e.user_message or e}')

    return {
        'account_id': account.id,
        'account_name': _account_name(account),
        'live_mode': secret_key.startswith(('sk_live_', 'rk_live_')),
        'webhook_id': endpoint.id,
        'webhook_secret': endpoint.secret,
    }
