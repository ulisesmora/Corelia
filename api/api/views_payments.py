"""«Conectar pagos» desde el panel (Stripe Connect; api/utils/stripe_connect.py).

  GET  /api/v1/site-config/stripe/connect/status/      estado de los pagos online
  POST /api/v1/site-config/stripe/connect/start/       crea la cuenta (una vez) y
       {country?, return_to?, origin?}                  da el enlace al alta en Stripe
  POST /api/v1/site-config/stripe/connect/sync/        vuelve a leer la cuenta en Stripe
  POST /api/v1/site-config/stripe/connect/disconnect/  deja de usar la cuenta conectada

Solo administración. Si la instalación no tiene Connect configurado
(STRIPE_CONNECT_* en el entorno), start/sync responden 404 y el panel enseña
el formulario de claves de siempre.
"""
import logging

import stripe
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.throttling import scoped
from api.utils.payments import connect_configured, connect_countries, payments_status
from api.utils.site import get_site_config, panel_origins, panel_url
from api.utils.stripe_connect import ConnectError, account_link, create_account, sync_status, unlink

logger = logging.getLogger(__name__)

# A dónde se vuelve desde Stripe: solo estas pantallas del panel (nunca una
# URL que mande el navegador). Se les añade ?stripe=return|refresh.
RETURN_PATHS = {
    'settings': '/ajustes?tab=pagos',   # Ajustes → Pagos online (también desde la guía)
    'welcome': '/bienvenida',           # asistente de bienvenida (paso «Pagos»)
}
NOT_AVAILABLE = '«Conectar pagos» no está disponible en esta instalación. Usa tus propias claves de Stripe.'


def _status_payload(cfg=None) -> dict:
    """payments_status() + lo que el panel necesita para pintar la tarjeta."""
    from api.utils.locale import COUNTRIES
    cfg = cfg or get_site_config()
    data = payments_status(cfg)
    st = cfg.stripe_connect_status or {}
    allowed = connect_countries()
    data.update({
        # Países para confirmar antes de crear la cuenta (no se puede cambiar después)
        'countries': [{'code': c, 'name': COUNTRIES[c].name if c in COUNTRIES else c} for c in allowed],
        'default_country': cfg.country if cfg.country in allowed else '',
        'account_country': st.get('country', '') if cfg.stripe_account_id else '',
        'display_name': st.get('display_name', '') if cfg.stripe_account_id else '',
        'default_currency': st.get('default_currency', '') if cfg.stripe_account_id else '',
        'dashboard_url': 'https://dashboard.stripe.com/' if cfg.stripe_account_id else '',
        'has_keys': bool(cfg.payments_enabled and cfg.stripe_secret_key),
        'keys_provider': cfg.payments_provider == 'keys',
    })
    return data


def _return_urls(request) -> tuple:
    """(return_url, refresh_url) construidas aquí, a partir de una lista
    cerrada de orígenes del panel y de pantallas."""
    origin = (request.data.get('origin') or '').strip().rstrip('/')
    if origin not in panel_origins():
        origin = panel_url()
    path = RETURN_PATHS.get(request.data.get('return_to') or 'settings', RETURN_PATHS['settings'])
    sep = '&' if '?' in path else '?'
    return f'{origin}{path}{sep}stripe=return', f'{origin}{path}{sep}stripe=refresh'


class StripeConnectStatusView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(_status_payload())


class StripeConnectStartView(APIView):
    """Crea la cuenta (si no la hay) y devuelve el enlace al alta en Stripe.
    También sirve para «Continuar en Stripe» y «Completar datos en Stripe», y
    para pedir un enlace nuevo cuando el anterior caducó (?stripe=refresh)."""
    permission_classes = [IsAdminUser]
    throttle_classes = [scoped('stripe_connect', 'user')]

    def post(self, request):
        cfg = get_site_config()
        if not connect_configured() or (not cfg.stripe_account_id and not payments_status(cfg)['connect_available']):
            return Response({'error': NOT_AVAILABLE}, status=status.HTTP_404_NOT_FOUND)
        state = payments_status(cfg)['state']
        if state == 'mismatch':
            return Response({'error': 'Tu cuenta conectada es de otro modo de Stripe (prueba / real). '
                                      'Desconéctala y vuelve a conectar.', 'status': _status_payload(cfg)},
                            status=status.HTTP_409_CONFLICT)
        if state == 'active':
            return Response({'url': None, 'status': _status_payload(cfg)})
        try:
            cfg, created = create_account(country=request.data.get('country') or '', email=request.user.email or '')
            if payments_status()['state'] == 'active':  # cuenta reutilizada, ya activa
                return Response({'url': None, 'status': _status_payload()})
            return_url, refresh_url = _return_urls(request)
            url = account_link(return_url, refresh_url)
        except ConnectError as e:
            return Response({'error': str(e), 'status': _status_payload()}, status=status.HTTP_400_BAD_REQUEST)
        logger.info("stripe_connect.start account=%s created=%s admin_id=%s",
                    cfg.stripe_account_id, created, request.user.id)
        return Response({'url': url, 'created': created, 'status': _status_payload(cfg)})


class StripeConnectSyncView(APIView):
    """«Comprobar»: vuelve a leer la cuenta en Stripe (al volver del alta)."""
    permission_classes = [IsAdminUser]
    throttle_classes = [scoped('stripe_connect', 'user')]

    def post(self, request):
        cfg = get_site_config()
        if not connect_configured():
            return Response({'error': NOT_AVAILABLE}, status=status.HTTP_404_NOT_FOUND)
        if cfg.stripe_account_id:
            try:
                sync_status(reason='panel')
            except stripe.StripeError as e:
                logger.warning("stripe_connect.sync_failed account=%s error=%s", cfg.stripe_account_id, e)
                return Response({'error': 'No hemos podido hablar con Stripe. Vuelve a probar en un momento.',
                                 'status': _status_payload()}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(_status_payload())


class StripeConnectDisconnectView(APIView):
    """Deja de cobrar con la cuenta conectada. La cuenta sigue siendo del
    estudio en Stripe (con su dinero y su panel); si vuelve a pulsar
    «Conectar pagos», se reutiliza."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        unlink('disconnected')
        logger.info("stripe_connect.disconnect admin_id=%s", request.user.id)
        return Response(_status_payload())
