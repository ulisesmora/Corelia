"""«Formas de pago en tu web»: qué métodos de pago ve el cliente en el pago
de Stripe (Checkout embebido con métodos dinámicos) y cómo se encienden desde
el panel (Ajustes → Cobros). Guía: docs/STRIPE_CONNECT.md → «Formas de pago».

Cómo decide Stripe qué enseña: sin `payment_method_types`, Checkout usa la
configuración de métodos de pago POR DEFECTO de la cuenta que cobra
(Payment Method Configurations API, /v1/payment_method_configurations):

- «Conectar pagos» (cargos directos): la configuración «hija» que la cuenta del
  estudio hereda de la configuración «padre» de la plataforma. Se lee y se
  cambia con la clave de la plataforma y la cabecera Stripe-Account; solo se
  puede cambiar si la plataforma no la ha bloqueado
  (display_preference.overridable).
- Claves propias: la configuración por defecto de su propia cuenta.

Por método, Stripe devuelve:
  available                    se ve en el pago (capacidad activa + encendido)
  display_preference.value     lo efectivo (on/off)
  display_preference.preference lo que pidió el estudio (on/off/none) ← se escribe
  display_preference.overridable False = la plataforma lo bloquea
Solo aparecen los métodos que tienen sentido en el país de la cuenta.

Encendido pero no `available` = «pendiente»: Stripe aún no deja usarlo (p. ej.
Bizum hasta que verifica el NIF/DNI del estudio).

Reservas de clase: un método que tarda días en confirmarse (vales, domiciliación)
dejaría la plaza retenida sin cobrar. Por eso el pago de una reserva:
- con STRIPE_CONNECT_BOOKING_PMC (cuenta conectada) usa esa configuración;
- si no, quita esos métodos con `excluded_payment_method_types`
  (booking_excluded_types). Bonos y membresías los ofrecen con normalidad.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import stripe
from django.conf import settings

from api.utils.payments import _effective, _is_live_secret, stripe_client, stripe_keys, to_dict

logger = logging.getLogger(__name__)


class MethodsError(Exception):
    """Error con mensaje para el panel. `code`/`status`/`extra` van en la respuesta."""

    def __init__(self, message: str, code: str = 'error', status: int = 400, **extra):
        super().__init__(message)
        self.code = code
        self.status = status
        self.extra = extra


# ─── Catálogo ─────────────────────────────────────────────────────────────────

_SEPA = frozenset({'ES', 'PT', 'FR', 'DE', 'IT', 'NL', 'BE', 'AT', 'LU', 'FI', 'GR', 'IE'})
_KLARNA = _SEPA | {'GB', 'US', 'CA', 'CH'}
_PAYPAL = _SEPA | {'GB', 'CH', 'LI'}


@dataclass(frozen=True)
class Method:
    key: str                 # nombre del campo en la configuración de Stripe
    name: str
    icon: str                # clave del icono en el panel
    why: str                 # una línea: qué es para el cliente
    limits: str = ''         # una línea: límites y dónde no sirve
    delayed: bool = False    # tarda días en confirmarse (vales, domiciliación)
    countries: frozenset | None = None   # None = todos
    drop_in: bool = True     # clase suelta al reservar
    packs: bool = True       # bonos (pago único)
    subs: bool = True        # cuotas mensuales (Checkout en modo suscripción)
    toggle: str = 'api'      # 'api' | 'dashboard' (solo en el panel de Stripe) | 'locked'
    needs_domain: bool = False  # hay que verificar el dominio de la web
    capability: bool = False    # Stripe revisa datos del estudio antes de activarlo
    extra: dict = field(default_factory=dict)


METHODS: tuple[Method, ...] = (
    Method('card', 'Tarjeta', 'card',
           'Visa, Mastercard y las demás. Es la base: Apple Pay y Google Pay van con ella.',
           'Siempre activa.', toggle='locked'),
    Method('apple_pay', 'Apple Pay', 'apple_pay',
           'Tus clientes pagan con Face ID en iPhone. Ya activado si tu web está verificada.',
           'En la web, con Safari o iPhone actualizados (iOS 17 o más).', needs_domain=True),
    Method('google_pay', 'Google Pay', 'google_pay',
           'Pagan con la tarjeta guardada en su Android o en Chrome, sin teclearla.',
           'Hace falta tener tu web verificada.', needs_domain=True),
    Method('link', 'Link', 'link',
           'El pago rápido de Stripe: guarda su tarjeta y la rellena sola la próxima vez.',
           'Hace falta tener tu web verificada.', needs_domain=True,
           countries=None, extra={'not_in': ('BR',)}),
    Method('bizum', 'Bizum', 'bizum',
           'Pagan con su móvil desde la app de su banco. Lo usa casi todo el mundo en España.',
           'Solo clases y bonos, no cuotas mensuales. De 0,50 € a 5.000 €. Stripe pide tu NIF/DNI para activarlo.',
           countries=frozenset({'ES'}), subs=False, capability=True),
    Method('mb_way', 'MB WAY', 'mb_way',
           'La app de pago más usada en Portugal: aprueban el pago en su móvil.',
           'Solo clases y bonos, no cuotas mensuales.', countries=frozenset({'PT'}), subs=False),
    Method('ideal', 'iDEAL | Wero', 'ideal',
           'Pagan desde su banco en los Países Bajos.',
           'En cuotas, la primera con iDEAL y las siguientes por domiciliación SEPA.',
           countries=frozenset({'NL'})),
    Method('bancontact', 'Bancontact', 'bancontact',
           'La forma de pago con tarjeta o app más usada en Bélgica.',
           'Solo clases y bonos, no cuotas mensuales.', countries=frozenset({'BE'}), subs=False),
    Method('cartes_bancaires', 'Cartes Bancaires', 'cartes_bancaires',
           'La red de tarjetas de Francia: más tarjetas francesas aceptadas.',
           'Va con la tarjeta.', countries=frozenset({'FR'})),
    Method('klarna', 'Klarna', 'klarna',
           'Pagar más tarde o a plazos, sin tarjeta.',
           'Klarna decide qué plazos ofrece según el importe y el país; en cuotas, solo en algunos países.',
           countries=_KLARNA),
    Method('paypal', 'PayPal', 'paypal',
           'Pagan con su cuenta de PayPal.',
           'Se solicita en tu Stripe y Stripe revisa la solicitud.',
           countries=_PAYPAL, toggle='dashboard'),
    # Pagos que tardan días
    Method('sepa_debit', 'Domiciliación SEPA', 'sepa_debit',
           'Pagan con su IBAN. Cómodo para las cuotas mensuales.',
           'Tarda varios días hábiles en confirmarse: no se usa al reservar una clase suelta.',
           delayed=True, countries=_SEPA, drop_in=False),
    Method('multibanco', 'Multibanco', 'multibanco',
           'Reciben una referencia y pagan en su banco o en un cajero (Portugal).',
           'Tarda días en confirmarse. Solo bonos: no se usa al reservar una clase.',
           delayed=True, countries=frozenset({'PT'}), drop_in=False, subs=False),
    Method('oxxo', 'OXXO', 'oxxo',
           'Reciben un vale y pagan en efectivo en una tienda OXXO (México).',
           'Hasta 5 días para pagar el vale y sin devoluciones. De 10 a 10.000 MXN. Solo bonos.',
           delayed=True, countries=frozenset({'MX'}), drop_in=False, subs=False),
    Method('bacs_debit', 'Bacs Direct Debit', 'bacs_debit',
           'Domiciliación con cuenta del Reino Unido. Cómodo para cuotas.',
           'Tarda días en confirmarse: no se usa al reservar una clase suelta.',
           delayed=True, countries=frozenset({'GB'}), drop_in=False),
    Method('us_bank_account', 'Cuenta bancaria (ACH)', 'us_bank_account',
           'Pagan con su cuenta bancaria de EE. UU.',
           'Tarda hasta 4 días hábiles: no se usa al reservar una clase suelta.',
           delayed=True, countries=frozenset({'US'}), drop_in=False),
    Method('acss_debit', 'Débito preautorizado (PAD)', 'acss_debit',
           'Pagan con su cuenta bancaria de Canadá.',
           'Tarda días en confirmarse. Solo bonos: Stripe no lo ofrece en cuotas con este pago.',
           delayed=True, countries=frozenset({'CA'}), drop_in=False, subs=False),
)
BY_KEY = {m.key: m for m in METHODS}

# Recomendados por país (la tarjeta siempre va)
RECOMMENDED = {
    'ES': ('card', 'apple_pay', 'google_pay', 'link', 'bizum'),
    'PT': ('card', 'apple_pay', 'google_pay', 'link', 'mb_way'),
    'NL': ('card', 'apple_pay', 'google_pay', 'link', 'ideal'),
    'BE': ('card', 'apple_pay', 'google_pay', 'link', 'bancontact'),
    'FR': ('card', 'apple_pay', 'google_pay', 'link', 'cartes_bancaires'),
}
RECOMMENDED_DEFAULT = ('card', 'apple_pay', 'google_pay', 'link')

# Métodos que tardan días y no deben retener una plaza (todos son valores de
# excluded_payment_method_types de Checkout). customer_balance = transferencia.
_ALWAYS_EXCLUDED_IN_BOOKINGS = ('customer_balance',)
_EXCLUDED_BY_COUNTRY_EXTRA = {'BR': ('boleto',), 'JP': ('konbini',)}

DASHBOARD_URL = 'https://dashboard.stripe.com/{mode}settings/payment_methods'


def methods_for(country: str) -> list[Method]:
    country = (country or '').upper()
    out = []
    for m in METHODS:
        if country in m.extra.get('not_in', ()):
            continue
        if m.countries is None or country in m.countries:
            out.append(m)
    return out


def booking_excluded_types(country: str | None = None) -> list[str]:
    """excluded_payment_method_types para el pago de una reserva de clase."""
    if country is None:
        from api.utils.site import get_site_config
        country = account_country(get_site_config())
    country = (country or '').upper()
    keys = [m.key for m in methods_for(country) if m.delayed]
    return keys + [k for k in (*_ALWAYS_EXCLUDED_IN_BOOKINGS, *_EXCLUDED_BY_COUNTRY_EXTRA.get(country, ())) if k not in keys]


# ─── Cuenta que cobra ─────────────────────────────────────────────────────────

def account_country(cfg) -> str:
    st = cfg.stripe_connect_status or {}
    provider, _, _ = _effective(cfg)
    if provider == 'connect' and st.get('country'):
        return str(st['country']).upper()
    return (cfg.country or '').upper()


def _context(cfg):
    """(provider, live, client) de la cuenta que cobra ahora, o MethodsError."""
    provider, ready, live = _effective(cfg)
    if not ready:
        raise MethodsError('Primero activa los pagos online (más abajo, «Pagos online»).',
                           code='payments_disabled', status=409)
    client = stripe_client()
    if client is None:
        raise MethodsError('Primero activa los pagos online.', code='payments_disabled', status=409)
    if provider == 'keys':
        live = _is_live_secret(stripe_keys(cfg)[0])
    return provider, live, client


def dashboard_url(live: bool) -> str:
    return DASHBOARD_URL.format(mode='' if live else 'test/')


def _configs(client) -> list[dict]:
    res = client.v1.payment_method_configurations.list(params={'limit': 100})
    return [to_dict(c) for c in (to_dict(res).get('data') or [])]


def default_config(configs: list[dict], provider: str) -> dict | None:
    """La configuración que usa Checkout sin `payment_method_configuration`.
    En la cuenta conectada, la hija de la configuración por defecto de la
    plataforma (tiene `parent`); con claves, la por defecto de la cuenta."""
    active = [c for c in configs if c.get('active', True)]
    if provider == 'connect':
        for c in active:
            if c.get('parent') and c.get('is_default'):
                return c
    for c in active:
        if c.get('is_default'):
            return c
    return active[0] if active else None


def booking_config(configs: list[dict]) -> dict | None:
    """Hija de STRIPE_CONNECT_BOOKING_PMC en la cuenta conectada (si la hay)."""
    parent = settings.STRIPE_CONNECT_BOOKING_PMC
    if not parent:
        return None
    return next((c for c in configs if c.get('parent') == parent or c.get('id') == parent), None)


# ─── Estado de cada método ────────────────────────────────────────────────────

def _method_state(m: Method, config: dict | None, provider: str) -> tuple[str, str]:
    """(status, toggle). status: on | off | pending | unavailable."""
    if m.key == 'paypal' and provider == 'connect':
        return 'unavailable', 'none'
    entry = (config or {}).get(m.key)
    if m.key == 'card' and not isinstance(entry, dict):
        return 'on', 'locked'
    if not isinstance(entry, dict):
        return 'unavailable', 'none'
    pref = entry.get('display_preference') or {}
    value = pref.get('value') or 'off'
    if value == 'on':
        status = 'on' if entry.get('available') else 'pending'
    else:
        status = 'off'
    toggle = m.toggle
    if toggle == 'api' and pref.get('overridable') is False:
        toggle = 'dashboard'
    return status, toggle


def _why_unavailable(m: Method, provider: str) -> str:
    if m.key == 'paypal' and provider == 'connect':
        return 'Stripe no ofrece PayPal en cuentas conectadas que cobran directamente («Conectar pagos»).'
    return 'Stripe no lo ofrece todavía para tu cuenta o tu país.'


def _why_pending(m: Method) -> str:
    if m.capability:
        return 'Stripe está revisando tu alta: entra en tu Stripe por si te pide tu NIF/DNI.'
    return 'Encendido, pero Stripe aún no deja usarlo: mira en tu Stripe si te pide algún dato.'


def describe(m: Method, status: str, toggle: str, provider: str, recommended: tuple) -> dict:
    data = {
        'key': m.key, 'name': m.name, 'icon': m.icon,
        'group': 'delayed' if m.delayed else 'instant',
        'status': status, 'toggle': toggle,
        'works': {'drop_in': m.drop_in, 'packs': m.packs, 'subs': m.subs},
        'why': m.why, 'limits': m.limits,
        'needs_domain': m.needs_domain, 'recommended': m.key in recommended,
        'note': '',
    }
    if status == 'unavailable':
        data['note'] = _why_unavailable(m, provider)
        data['limits'] = ''
    elif status == 'pending':
        data['note'] = _why_pending(m)
    elif toggle == 'dashboard' and m.toggle == 'api':
        data['note'] = 'Quien gestiona tu instalación lo tiene bloqueado: pídeselo o cámbialo en tu Stripe.'
    if m.delayed:
        data['warning'] = ('Las reservas de clase no lo ofrecen: un pago que tarda días no puede guardar la plaza. '
                           'Sirve para bonos' + (' y cuotas.' if m.subs else '.'))
    return data


# ─── Dominios (Apple Pay, Google Pay, Link) ───────────────────────────────────

def _domain_row(d: dict) -> dict:
    def st(key):
        return ((d.get(key) or {}).get('status')) or 'inactive'

    def err(key):
        return (((d.get(key) or {}).get('status_details') or {}).get('error_message')) or ''
    return {
        'domain': d.get('domain_name', ''), 'enabled': bool(d.get('enabled', True)),
        'apple_pay': st('apple_pay'), 'google_pay': st('google_pay'), 'link': st('link'),
        'error': err('apple_pay') or err('google_pay') or '',
    }


def _listed_domains(client) -> dict:
    res = client.v1.payment_method_domains.list(params={'limit': 100})
    return {d.get('domain_name'): d for d in (to_dict(x) for x in (to_dict(res).get('data') or []))}


def domains_status(client, cfg) -> list[dict]:
    """Estado (solo lectura) de los dominios donde se cobra."""
    from api.utils.stripe_connect import payment_method_domains
    listed = _listed_domains(client)
    rows = []
    for host in payment_method_domains(cfg):
        d = listed.get(host)
        rows.append(_domain_row(d) if d else {'domain': host, 'enabled': False, 'apple_pay': 'missing',
                                               'google_pay': 'missing', 'link': 'missing', 'error': ''})
    return rows


def verify_domains(client, cfg) -> list[dict]:
    """Registra los dominios que falten, reactiva los apagados y vuelve a
    validar los que Apple Pay no da por buenos. Nunca lanza por un dominio."""
    from api.utils.stripe_connect import payment_method_domains
    listed = _listed_domains(client)
    rows = []
    for host in payment_method_domains(cfg):
        d = listed.get(host)
        try:
            if d is None:
                d = to_dict(client.v1.payment_method_domains.create(params={'domain_name': host}))
            elif not d.get('enabled', True):
                d = to_dict(client.v1.payment_method_domains.update(d['id'], params={'enabled': True}))
            if ((d.get('apple_pay') or {}).get('status')) != 'active' and d.get('id'):
                d = to_dict(client.v1.payment_method_domains.validate(d['id']))
            rows.append(_domain_row(d))
        except stripe.StripeError as e:
            logger.warning("payment_methods.domain_failed domain=%s error=%s", host, e)
            rows.append({'domain': host, 'enabled': False, 'apple_pay': 'error', 'google_pay': 'error',
                         'link': 'error', 'error': getattr(e, 'user_message', None) or str(e)})
    return rows


def web_domain_ready(rows: list[dict]) -> bool:
    """¿Apple Pay vale en la web? (el primer dominio es siempre el de la web)."""
    return bool(rows) and rows[0].get('apple_pay') == 'active' and rows[0].get('enabled', True)


# ─── Lo que ve el panel ───────────────────────────────────────────────────────

def overview(cfg) -> dict:
    """GET: métodos del país del estudio con su estado, dominios y recomendados."""
    from api.utils.locale import COUNTRIES
    country = account_country(cfg)
    provider, ready, live = _effective(cfg)
    recommended = RECOMMENDED.get(country, RECOMMENDED_DEFAULT)
    country_name = COUNTRIES[country].name if country in COUNTRIES else country
    data = {
        'ready': ready, 'provider': provider, 'country': country, 'country_name': country_name,
        'live': live, 'config_id': '', 'dashboard_url': dashboard_url(live),
        'booking_protection': 'pmc' if (provider == 'connect' and settings.STRIPE_CONNECT_BOOKING_PMC) else 'excluded',
        'recommended': {'label': f'Recomendados para {country_name}' if country_name else 'Recomendados',
                        'keys': [k for k in recommended if k in {m.key for m in methods_for(country)}]},
        'domains': [], 'apple_pay_ready': False, 'error': '',
        'methods': [],
    }
    methods = methods_for(country)
    if not ready:
        data['methods'] = [describe(m, 'off', 'none', provider, recommended) for m in methods]
        data['error'] = 'Primero activa los pagos online (más abajo, «Pagos online»).'
        return data
    provider, live, client = _context(cfg)
    data['live'] = live
    data['dashboard_url'] = dashboard_url(live)
    try:
        config = default_config(_configs(client), provider)
    except stripe.StripeError as e:
        logger.warning("payment_methods.list_failed provider=%s error=%s", provider, e)
        data['methods'] = [describe(m, 'off', 'none', provider, recommended) for m in methods]
        data['error'] = 'No hemos podido leer tus formas de pago en Stripe. Vuelve a probar en un momento.'
        return data
    data['config_id'] = (config or {}).get('id', '')
    data['methods'] = [describe(m, *_method_state(m, config, provider), provider, recommended) for m in methods]
    try:
        rows = domains_status(client, cfg)
        data['domains'] = rows
        data['apple_pay_ready'] = web_domain_ready(rows)
    except stripe.StripeError as e:
        logger.warning("payment_methods.domains_failed error=%s", e)
    return data


def _dashboard_only(m: Method, live: bool, reason: str) -> MethodsError:
    return MethodsError(reason, code='dashboard_only', status=409, dashboard_url=dashboard_url(live), method=m.key)


def _update(client, config_id: str, prefs: dict) -> dict:
    params = {k: {'display_preference': {'preference': 'on' if on else 'off'}} for k, on in prefs.items()}
    return to_dict(client.v1.payment_method_configurations.update(config_id, params=params))


def _mirror_booking(client, configs: list[dict], prefs: dict) -> bool | None:
    """Mantiene la configuración de reservas igual que la normal, salvo los
    métodos que tardan días (siempre apagados ahí). None = no hay."""
    booking = booking_config(configs)
    if not booking:
        return None
    mirrored = {k: on for k, on in prefs.items() if not BY_KEY[k].delayed}
    if not mirrored:
        return True
    try:
        _update(client, booking['id'], mirrored)
        return True
    except stripe.StripeError as e:
        logger.warning("payment_methods.booking_mirror_failed config=%s error=%s", booking.get('id'), e)
        return False


def set_methods(cfg, prefs: dict) -> dict:
    """Enciende/apaga métodos en la configuración por defecto de la cuenta.
    prefs: {clave: bool}. Devuelve {'changed': [...], 'skipped': [{key, reason}], 'booking_synced'}.
    Lanza MethodsError si ninguno se pudo cambiar."""
    provider, live, client = _context(cfg)
    country = account_country(cfg)
    allowed = {m.key for m in methods_for(country)}
    for key in prefs:
        if key not in BY_KEY:
            raise MethodsError('Ese método de pago no existe.', code='unknown_method')
        if key not in allowed:
            raise MethodsError(f'{BY_KEY[key].name} no se usa en tu país.', code='not_in_country')
    try:
        configs = _configs(client)
    except stripe.StripeError as e:
        logger.warning("payment_methods.list_failed provider=%s error=%s", provider, e)
        raise MethodsError('No hemos podido hablar con Stripe. Vuelve a probar en un momento.', code='stripe', status=502)
    config = default_config(configs, provider)
    if not config:
        raise MethodsError('Tu Stripe todavía no tiene formas de pago configuradas. Ábrelo y revisa «Métodos de pago».',
                           code='dashboard_only', status=409, dashboard_url=dashboard_url(live))

    todo, skipped = {}, []
    for key, on in prefs.items():
        m = BY_KEY[key]
        status, toggle = _method_state(m, config, provider)
        if toggle == 'locked':
            skipped.append({'key': key, 'reason': 'La tarjeta va siempre activada.'})
        elif status == 'unavailable':
            skipped.append({'key': key, 'reason': _why_unavailable(m, provider)})
        elif toggle != 'api':
            skipped.append({'key': key, 'reason': 'Solo se puede cambiar en tu Stripe.', 'dashboard': True})
        elif (status in ('on', 'pending')) != bool(on):
            todo[key] = bool(on)

    if len(prefs) == 1 and skipped:
        m = BY_KEY[next(iter(prefs))]
        reason = skipped[0]['reason']
        if skipped[0].get('dashboard') or m.key == 'card':
            raise _dashboard_only(m, live, f'{m.name}: {reason} Ábrelo en Stripe → Métodos de pago.')
        raise MethodsError(f'{m.name}: {reason}', code='unavailable', status=409, method=m.key)

    changed = []
    if todo:
        try:
            _update(client, config['id'], todo)
            changed = list(todo)
        except stripe.InvalidRequestError as e:
            if len(todo) == 1:
                m = BY_KEY[next(iter(todo))]
                logger.info("payment_methods.toggle_rejected method=%s error=%s", m.key, e)
                raise _dashboard_only(m, live, f'Stripe no deja cambiar {m.name} desde aquí '
                                               f'({getattr(e, "user_message", None) or e}). Cámbialo en tu Stripe.')
            # Varios a la vez (recomendados): uno a uno, para no perder los que sí se pueden
            for key, on in todo.items():
                try:
                    _update(client, config['id'], {key: on})
                    changed.append(key)
                except stripe.StripeError as e2:
                    skipped.append({'key': key, 'reason': getattr(e2, 'user_message', None) or str(e2), 'dashboard': True})
        except stripe.StripeError as e:
            logger.warning("payment_methods.toggle_failed error=%s", e)
            raise MethodsError('No hemos podido hablar con Stripe. Vuelve a probar en un momento.', code='stripe', status=502)

    synced = _mirror_booking(client, configs, {k: todo[k] for k in changed}) if changed and provider == 'connect' else None
    logger.info("payment_methods.updated provider=%s changed=%s skipped=%s", provider, changed,
                [s['key'] for s in skipped])
    return {'changed': changed, 'skipped': skipped, 'booking_synced': synced}


def apply_recommended(cfg) -> dict:
    country = account_country(cfg)
    keys = RECOMMENDED.get(country, RECOMMENDED_DEFAULT)
    allowed = {m.key for m in methods_for(country)}
    return set_methods(cfg, {k: True for k in keys if k in allowed and k != 'card'})


def verify(cfg) -> dict:
    """«Verificar dominio para Apple Pay»: registra y valida y dice cómo quedó."""
    provider, _, client = _context(cfg)
    try:
        rows = verify_domains(client, cfg)
    except stripe.StripeError as e:
        logger.warning("payment_methods.verify_failed error=%s", e)
        raise MethodsError('No hemos podido hablar con Stripe. Vuelve a probar en un momento.', code='stripe', status=502)
    if provider == 'connect':
        _remember_connect_domains(cfg, [r['domain'] for r in rows if r.get('apple_pay') not in ('error', 'missing')])
    logger.info("payment_methods.domains_verified provider=%s ok=%s", provider, web_domain_ready(rows))
    return {'domains': rows, 'apple_pay_ready': web_domain_ready(rows)}


def _remember_connect_domains(cfg, hosts: list[str]):
    from django.db import transaction
    from api.models import SiteConfig
    if not hosts:
        return
    with transaction.atomic():
        fresh = SiteConfig.objects.select_for_update().get(pk=cfg.pk)
        if fresh.stripe_account_id != cfg.stripe_account_id:
            return
        st = dict(fresh.stripe_connect_status or {})
        st['pm_domains'] = sorted(set((st.get('pm_domains') or []) + hosts))
        fresh.stripe_connect_status = st
        fresh.save(update_fields=['stripe_connect_status', 'updated_at'])


def register_with_keys(client, cfg) -> None:
    """Al conectar las claves propias: registra los dominios (Apple Pay en el
    Checkout embebido también lo necesita en la cuenta del estudio). Nunca lanza."""
    try:
        verify_domains(client, cfg)
    except Exception:
        logger.warning("payment_methods.keys_domains_failed", exc_info=True)
