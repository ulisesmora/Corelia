"""«Formas de cobro»: qué se ofrece DE VERDAD en la web al reservar y al
comprar, a partir de los interruptores de Ajustes → Cobros (SiteConfig) y de
si Stripe está listo para cobrar (api/utils/payments.py).

  payment_options(cfg)  → dict con lo efectivo (lo usan la config pública de
                          la web, la guía «Cómo se cobra» y las rutas de pago).
  option_error(...)     → respuesta 409 con un código claro cuando una ruta
                          pide algo que el estudio ha apagado.

Lo efectivo:

  card               tarjeta en la web = Stripe listo Y online_card_enabled
  drop_in_online     pagar cada clase con tarjeta al reservar (clase suelta)
  packs_online       comprar bonos en la web
  memberships_online contratar membresías en la web
  guest_booking      reservar sin cuenta (con tarjeta o pagando en el estudio)
  pay_at_studio      {'guests', 'clients'}: «Pagar en el estudio».
                     pay_at_studio_enabled = None (por defecto) → automático:
                     encendido solo si la web no cobra con tarjeta (lo de
                     antes). Los invitados además necesitan guest_booking.
  credits            reservar con créditos (clientes con cuenta): siempre.

Ninguna opción toca lo que hace el estudio desde el panel (apuntar a un
cliente, añadir créditos, cobrar una membresía a mano…).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response

STUDIO_METHOD_KEYS = ('cash', 'bizum', 'card', 'transfer')

# Códigos de error (409) que la web entiende
CODES = {
    'card_disabled': 'Este estudio no cobra con tarjeta en la web.',
    'drop_in_not_online': 'Este estudio no vende clases sueltas en la web: reserva con tus créditos o pregunta en el estudio.',
    'packs_not_online': 'Los bonos de este estudio se compran en el estudio.',
    'memberships_not_online': 'Las membresías de este estudio se contratan en el estudio.',
    'guest_booking_disabled': 'Para reservar en este estudio necesitas tu cuenta. Entra o créala en un momento.',
    'pay_at_studio_disabled': 'Este estudio no admite pagar en el estudio al reservar.',
    'fixed_classes_admin_only': 'Tus clases fijas las gestiona el estudio. Escríbeles si quieres cambiarlas.',
}


def clean_methods(value) -> list[str]:
    """Lista de formas de pago en el estudio sin duplicados ni valores raros."""
    out = []
    for v in value or []:
        v = str(v or '').strip().lower()
        if v in STUDIO_METHOD_KEYS and v not in out:
            out.append(v)
    return out


def payment_options(cfg=None, online_ready=None) -> dict:
    from api.utils import payments
    from api.utils.site import get_site_config

    cfg = cfg or get_site_config()
    if online_ready is None:
        online_ready = payments.payments_enabled()
    card = bool(online_ready and cfg.online_card_enabled)
    guest_booking = bool(cfg.guest_booking_enabled)
    pay_at_studio = (not card) if cfg.pay_at_studio_enabled is None else bool(cfg.pay_at_studio_enabled)
    return {
        'online_ready': bool(online_ready),
        'card': card,
        'drop_in_online': card and bool(cfg.sell_drop_in_online),
        'packs_online': card and bool(cfg.sell_packs_online),
        'memberships_online': card and bool(cfg.sell_memberships_online),
        'guest_booking': guest_booking,
        'pay_at_studio': {
            'auto': cfg.pay_at_studio_enabled is None,
            'enabled': pay_at_studio,
            'guests': pay_at_studio and guest_booking and bool(cfg.pay_at_studio_guests),
            'clients': pay_at_studio and bool(cfg.pay_at_studio_clients),
        },
        'credits': True,
        'studio_methods': clean_methods(cfg.studio_payment_methods),
        'studio_note': (cfg.studio_payment_note or '').strip(),
        'studio_note_en': (cfg.studio_payment_note_en or '').strip(),
        'client_fixed_classes': bool(cfg.client_fixed_classes),
    }


def public_payment_options(cfg=None, online_ready=None) -> dict:
    """Lo que necesita la web (sin el detalle de «automático»)."""
    o = payment_options(cfg, online_ready)
    o['pay_at_studio'] = {'guests': o['pay_at_studio']['guests'], 'clients': o['pay_at_studio']['clients']}
    o.pop('online_ready', None)
    return o


def option_error(code: str, **extra) -> Response:
    body = {'error': CODES[code], 'code': code}
    body.update(extra)
    return Response(body, status=status.HTTP_409_CONFLICT)
