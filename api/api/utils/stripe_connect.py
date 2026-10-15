"""«Conectar pagos»: la cuenta de Stripe del estudio creada desde la
plataforma de Stripe Connect de la instalación (STRIPE_CONNECT_* en el
entorno; ver docs/STRIPE_CONNECT.md).

Cómo es la cuenta (Accounts v2, se crea en create_account):
- dashboard «full»: el estudio tiene su propio panel de Stripe completo;
- fees_collector y losses_collector «stripe»: Stripe le cobra a ella sus
  comisiones y responde de sus devoluciones; la plataforma no paga nada;
- se cobra con cargos directos en su cuenta (cabecera Stripe-Account) y sin
  application_fee: Corelia se queda el 0 %.

El alta la hace el estudio en Stripe (Account Links alojados por Stripe). El
estado se lee siempre con GET /v1/accounts/{id} (sync_status), al volver de
Stripe, con el botón «Comprobar» y con cada aviso account.updated.

Señales (lo único que necesita quien gestione varias instalaciones):
- stripe_account_linked(site_config, account_id): cuenta creada o vuelta a
  enlazar. Se envía dentro de la transacción: si un receptor falla, no se
  guarda el enlace.
- stripe_payments_changed(site_config, account_id, status, reason): cambió si
  se puede cobrar o el estado de la cuenta (y al desconectarla).
Se envían con send() (no send_robust): un fallo de un receptor no se calla.
"""
import logging
import uuid
from urllib.parse import urlsplit

import stripe
from django.db import transaction
from django.dispatch import Signal
from django.utils import timezone

from api.utils.payments import (
    _effective, connect_available, connect_countries, connect_state, payments_status, platform_client,
    platform_live, stripe_client, to_dict,
)

logger = logging.getLogger(__name__)

stripe_account_linked = Signal()
stripe_payments_changed = Signal()


class ConnectError(Exception):
    """Error con un mensaje que se puede enseñar tal cual en el panel."""


# Idioma de Stripe (alta, emails) según el país de la cuenta
_LOCALES = {
    'ES': 'es-ES', 'MX': 'es-419', 'US': 'en-US', 'GB': 'en-GB', 'IE': 'en-IE', 'CA': 'en-CA',
    'PT': 'pt-PT', 'BR': 'pt-BR', 'FR': 'fr-FR', 'BE': 'fr', 'LU': 'fr', 'DE': 'de-DE', 'AT': 'de',
    'CH': 'de', 'LI': 'de', 'IT': 'it-IT', 'NL': 'nl-NL', 'FI': 'fi-FI', 'GR': 'el-GR',
}


def _load_for_update():
    from api.models import SiteConfig
    return SiteConfig.objects.select_for_update().get_or_create(pk=1)[0]


def _signal_status(cfg) -> tuple:
    return connect_state(cfg), _effective(cfg)[1]


def summarize_account(account) -> dict:
    """Lo que se guarda de GET /v1/accounts/{id} (sin datos personales)."""
    a = to_dict(account)
    req = a.get('requirements') or {}
    dashboard = ((a.get('settings') or {}).get('dashboard') or {})
    return {
        'charges_enabled': bool(a.get('charges_enabled')),
        'payouts_enabled': bool(a.get('payouts_enabled')),
        'details_submitted': bool(a.get('details_submitted')),
        'disabled_reason': req.get('disabled_reason') or '',
        'currently_due': list(req.get('currently_due') or []),
        'past_due': list(req.get('past_due') or []),
        'eventually_due': list(req.get('eventually_due') or []),
        'pending_verification': list(req.get('pending_verification') or []),
        'current_deadline': req.get('current_deadline'),
        'country': (a.get('country') or '').upper(),
        'default_currency': (a.get('default_currency') or '').upper(),
        'display_name': dashboard.get('display_name') or ((a.get('business_profile') or {}).get('name')) or '',
    }


def _local_currency(country: str):
    """La moneda del estudio si es la de ese país (si no, que elija Stripe)."""
    from api.utils.locale import CURRENCIES, studio_currency
    code = studio_currency()
    cur = CURRENCIES.get(code)
    return code.lower() if cur and country in cur.home else None


def _public_https(url: str) -> bool:
    parts = urlsplit(url or '')
    host = parts.hostname or ''
    return parts.scheme == 'https' and '.' in host and not host.endswith(('.localhost', '.local', '.test'))


def account_params(cfg, country: str, email: str = '') -> dict:
    """Parámetros de POST /v2/core/accounts para la cuenta del estudio."""
    from api.utils.site import panel_url, web_url
    name = (cfg.studio_name or '').strip()[:100] or 'Estudio'
    defaults = {
        'responsibilities': {'fees_collector': 'stripe', 'losses_collector': 'stripe'},
        'locales': [_LOCALES.get(country, 'es')],
    }
    currency = _local_currency(country)
    if currency:
        defaults['currency'] = currency
    site = web_url()
    profile = {'doing_business_as': name, 'product_description': f'Clases, bonos y membresías de {name}'[:200]}
    if _public_https(site):
        profile['business_url'] = site
    defaults['profile'] = profile
    params = {
        'display_name': name,
        'dashboard': 'full',
        'identity': {'country': country.lower()},
        'configuration': {'merchant': {'capabilities': {'card_payments': {'requested': True}}}},
        'defaults': defaults,
        'metadata': {'corelia_web': site[:500], 'corelia_panel': panel_url()[:500]},
    }
    contact = (cfg.contact_email or email or '').strip()
    if contact:
        params['contact_email'] = contact
    return params


def _relink_previous(cfg, country: str):
    """Tras «Desconectar», volver a pulsar «Conectar pagos» reutiliza la misma
    cuenta (si sigue enlazada a la plataforma, es del mismo modo y del mismo
    país) en lugar de crearle otra y pedirle los datos otra vez."""
    st = cfg.stripe_connect_status or {}
    previous = st.get('previous_account')
    if (not previous or st.get('unlinked_reason') != 'disconnected'
            or bool(st.get('previous_livemode')) != platform_live()
            or (st.get('previous_country') or country) != country):
        return None
    try:
        return platform_client().v1.accounts.retrieve(previous)
    except stripe.StripeError:
        logger.info("stripe_connect.relink_unavailable account=%s", previous)
        return None


def create_account(country: str = '', email: str = ''):
    """Crea (una sola vez) la cuenta conectada del estudio. Idempotente: si ya
    hay una, la devuelve. Devuelve (site_config, creada)."""
    # 1) Bajo bloqueo: ¿ya hay cuenta? Si no, un identificador para el intento
    #    (clave de idempotencia: dos clics, o un reintento tras un fallo, dan
    #    la MISMA cuenta en Stripe).
    with transaction.atomic():
        cfg = _load_for_update()
        if cfg.stripe_account_id:
            return cfg, False
        if not connect_available(cfg):
            raise ConnectError('«Conectar pagos» no está disponible en esta instalación.')
        country = (country or cfg.country or '').strip().upper()
        if country not in connect_countries():
            raise ConnectError('Stripe todavía no abre cuentas en ese país desde aquí. '
                               'Puedes conectar tus propias claves de Stripe en «Avanzado».')
        st = dict(cfg.stripe_connect_status or {})
        nonce = st.get('create_nonce') or uuid.uuid4().hex
        if st.get('create_nonce') != nonce:
            st['create_nonce'] = nonce
            cfg.stripe_connect_status = st
            cfg.save(update_fields=['stripe_connect_status', 'updated_at'])

    # 2) La llamada a Stripe, fuera del bloqueo
    account = _relink_previous(cfg, country)
    relinked = account is not None
    if account is None:
        try:
            account = platform_client().v2.core.accounts.create(
                params=account_params(cfg, country, email),
                options={'idempotency_key': f'corelia-account-{nonce}-{country}'},
            )
        except stripe.StripeError as e:
            logger.warning("stripe_connect.create_failed country=%s error=%s", country, e)
            raise ConnectError(f'Stripe no ha podido crear tu cuenta: {getattr(e, "user_message", None) or e}')
    account_id = to_dict(account).get('id') or getattr(account, 'id', '')

    # 3) Guardar el enlace y avisar (dentro de la transacción)
    with transaction.atomic():
        cfg = _load_for_update()
        if cfg.stripe_account_id:
            return cfg, False
        cfg.stripe_account_id = account_id
        cfg.payments_provider = 'connect'
        cfg.stripe_connected_at = None
        cfg.stripe_connect_status = {'livemode': platform_live(), 'country': country,
                                     'created_at': timezone.now().isoformat(),
                                     'charges_enabled': False, 'details_submitted': False}
        cfg.save(update_fields=['stripe_account_id', 'payments_provider', 'stripe_connected_at',
                                'stripe_connect_status', 'updated_at'])
        stripe_account_linked.send(sender=type(cfg), site_config=cfg, account_id=account_id)
    logger.info("stripe_connect.account_%s account=%s country=%s live=%s",
                'relinked' if relinked else 'created', account_id, country, platform_live())
    if relinked:
        sync_status(account=account, reason='relinked')
    return cfg, True


def account_link(return_url: str, refresh_url: str) -> str:
    """Enlace de un solo uso al alta en Stripe (Account Links v2, alojado por
    Stripe). Sirve también para completar datos que falten más adelante."""
    from api.utils.site import get_site_config
    cfg = get_site_config()
    if not cfg.stripe_account_id:
        raise ConnectError('Primero hay que crear tu cuenta.')
    try:
        link = platform_client().v2.core.account_links.create(params={
            'account': cfg.stripe_account_id,
            'use_case': {
                'type': 'account_onboarding',
                'account_onboarding': {'return_url': return_url, 'refresh_url': refresh_url},
            },
        })
    except stripe.StripeError as e:
        logger.warning("stripe_connect.link_failed account=%s error=%s", cfg.stripe_account_id, e)
        raise ConnectError(f'Stripe no ha podido abrir el alta: {getattr(e, "user_message", None) or e}')
    return to_dict(link).get('url') or getattr(link, 'url', '')


def sync_status(account=None, reason: str = 'sync') -> dict:
    """Lee la cuenta en Stripe (GET /v1/accounts/{id}), guarda su estado y
    devuelve payments_status(). La primera vez que queda activa registra los
    dominios de Apple Pay / Google Pay. `account`: el objeto ya leído (tests)."""
    from api.models import SiteConfig
    cfg = SiteConfig.load()
    account_id = cfg.stripe_account_id
    client = platform_client()
    if not account_id or client is None:
        return payments_status(cfg)
    if account is None:
        account = client.v1.accounts.retrieve(account_id)
    summary = summarize_account(account)

    first_active = False
    with transaction.atomic():
        cfg = _load_for_update()
        if cfg.stripe_account_id != account_id:
            return payments_status(cfg)  # la desconectaron mientras tanto
        before = _signal_status(cfg)
        st = dict(cfg.stripe_connect_status or {})
        st.pop('create_nonce', None)
        st.update(summary)
        st['synced_at'] = timezone.now().isoformat()
        cfg.stripe_connect_status = st
        if connect_state(cfg) == 'active' and not cfg.stripe_connected_at:
            cfg.stripe_connected_at = timezone.now()
            first_active = True
        cfg.save(update_fields=['stripe_connect_status', 'stripe_connected_at', 'updated_at'])
        after = _signal_status(cfg)
        if after != before:
            logger.info("stripe_connect.status_changed account=%s state=%s ready=%s", account_id, *after)
            stripe_payments_changed.send(sender=type(cfg), site_config=cfg, account_id=account_id,
                                         status=payments_status(cfg), reason=reason)
    if first_active:
        register_payment_method_domains(cfg)
    return payments_status(cfg)


def payment_method_domains(cfg=None) -> list:
    """Dominios donde se ve el pago (la web, su www/sin www y el panel).
    Stripe los necesita registrados para Apple Pay y Google Pay."""
    from api.utils.site import panel_url, web_url
    hosts = []

    def add(host):
        host = (host or '').strip().lower().rstrip('.')
        if (host and '.' in host and host not in hosts and not host.replace('.', '').isdigit()
                and not host.endswith(('.localhost', '.local', '.test', '.internal')) and host != 'localhost'):
            hosts.append(host)

    web_host = urlsplit(web_url()).hostname or ''
    add(web_host)
    # Dominio propio: también su versión con/sin www (la web puede abrirse por las dos)
    if cfg is not None and cfg.web_domain and web_host == cfg.web_domain:
        if web_host.startswith('www.'):
            add(web_host[4:])
        elif web_host.count('.') == 1:
            add(f'www.{web_host}')
    add(urlsplit(panel_url()).hostname or '')
    return hosts


def register_payment_method_domains(cfg=None) -> list:
    """Registra en la cuenta conectada los dominios que falten. Nunca lanza."""
    from api.models import SiteConfig
    cfg = cfg or SiteConfig.load()
    account_id = cfg.stripe_account_id
    if not account_id or connect_state(cfg) != 'active':
        return []
    client = stripe_client(account=account_id)
    if client is None:
        return []
    done = list((cfg.stripe_connect_status or {}).get('pm_domains') or [])
    added = []
    for host in payment_method_domains(cfg):
        if host in done:
            continue
        try:
            client.v1.payment_method_domains.create(params={'domain_name': host})
            added.append(host)
        except stripe.StripeError as e:
            if 'already' in str(e).lower():
                added.append(host)
            else:
                logger.warning("stripe_connect.pm_domain_failed account=%s domain=%s error=%s", account_id, host, e)
    if added:
        with transaction.atomic():
            fresh = _load_for_update()
            if fresh.stripe_account_id == account_id:
                st = dict(fresh.stripe_connect_status or {})
                st['pm_domains'] = sorted(set((st.get('pm_domains') or []) + added))
                fresh.stripe_connect_status = st
                fresh.save(update_fields=['stripe_connect_status', 'updated_at'])
        logger.info("stripe_connect.pm_domains_registered account=%s domains=%s", account_id, added)
    return added


def unlink(reason: str = 'disconnected') -> dict:
    """Deja de usar la cuenta conectada (la cuenta sigue siendo del estudio en
    Stripe, con su dinero y su panel). reason: 'disconnected' (desde el panel)
    o 'deauthorized' (el estudio desconectó la plataforma desde Stripe)."""
    from api.models import SiteConfig
    from django.conf import settings
    with transaction.atomic():
        cfg = _load_for_update()
        account_id = cfg.stripe_account_id
        if not account_id:
            return payments_status(cfg)
        st = cfg.stripe_connect_status or {}
        cfg.stripe_connect_status = {
            'previous_account': account_id,
            'previous_livemode': bool(st.get('livemode', platform_live())),
            'previous_country': st.get('country') or '',
            'unlinked_reason': reason,
            'unlinked_at': timezone.now().isoformat(),
        }
        cfg.stripe_account_id = ''
        cfg.stripe_connected_at = None
        if cfg.payments_provider == 'connect':
            has_keys = bool((cfg.payments_enabled and cfg.stripe_secret_key) or settings.STRIPE_SECRET_KEY)
            cfg.payments_provider = 'keys' if has_keys else ''
        cfg.save(update_fields=['stripe_account_id', 'stripe_connect_status', 'stripe_connected_at',
                                'payments_provider', 'updated_at'])
        logger.info("stripe_connect.unlinked account=%s reason=%s", account_id, reason)
        stripe_payments_changed.send(sender=SiteConfig, site_config=cfg, account_id=account_id,
                                     status=payments_status(cfg), reason=reason)
    return payments_status(cfg)


__all__ = [
    'ConnectError', 'account_link', 'account_params', 'create_account', 'payment_method_domains',
    'register_payment_method_domains', 'stripe_account_linked', 'stripe_payments_changed',
    'summarize_account', 'sync_status', 'unlink',
]
