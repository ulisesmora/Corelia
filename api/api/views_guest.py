"""Reservar y pagar en el estudio.

POST /api/v1/checkout/guest-reserve/   (invitadas, sin cuenta)
    {email, name, phone, cart_items: [...], turnstile_token?}
    → 201 {status: 'reserved', bookings: [...], total, currency, pay_at_studio: true}

POST /api/v1/checkout/studio-reserve/  (clientas con cuenta)
    {cart_items: [...]}  → lo mismo, a su nombre

Las dos dependen de «Formas de cobro» (Ajustes → Cobros,
api/utils/payment_options.py): «Pagar en el estudio» encendido para quien
reserva (invitadas y/o clientas con cuenta) y, para las invitadas, «Reservar
sin cuenta». Por defecto (automático) solo se paga en el estudio cuando la
web no cobra con tarjeta, como antes. Si no se puede: 409 con
code='pay_at_studio_disabled' o 'guest_booking_disabled' (y `card: true` si
la web cobra con tarjeta, para que la web ofrezca eso).

Las reservas quedan confirmadas sin pago asociado; el precio de la clase se
guarda en booking.metadata (pay_at_studio, price, currency) para que el
estudio sepa cuánto cobrar al llegar: salen en Ventas → «Quién me debe» hasta
que el estudio las marca como cobradas (api/utils/dashboard.py). Límite por IP
y captcha (si el estudio lo tiene configurado) para las invitadas.
"""
import logging
from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import Booking
from api.throttling import scoped
from api.utils.guest_checkout import MAX_GUEST_ITEMS
from api.utils.turnstile import check_captcha

logger = logging.getLogger(__name__)


def _reserve_at_studio(owner: dict, cart_items, max_items: int, source: str):
    """Valida el carrito y crea las reservas «pagar en el estudio» de `owner`
    ({'guest': …} o {'user': …}). Devuelve (bookings, lines, total, currency)
    o (None, error). Llamar dentro de transaction.atomic()."""
    from api.utils.guest_checkout import validate_cart
    from api.utils.payments import stripe_currency

    currency = stripe_currency().upper()
    lines, error = validate_cart(cart_items, lock=True, max_items=max_items, **owner)
    if error:
        transaction.set_rollback(True)
        return None, error
    bookings = []
    total = Decimal(0)
    for line in lines:
        price = line.price if line.price and line.price > 0 else Decimal(0)
        total += price
        bookings.append(Booking.objects.create(
            **owner, **line.target(),
            start_datetime=line.start, end_datetime=line.end, status='reserved',
            metadata={'pay_at_studio': True, 'price': str(price), 'currency': currency, 'source': source},
        ))
    return (bookings, lines, total, currency), None


def _reserved_response(bookings, lines, total, currency, email):
    return Response({
        'status': 'reserved',
        'pay_at_studio': True,
        'bookings': [{
            'id': b.id,
            'title': line.title,
            'kind': 'event' if line.event is not None else 'class',
            'start_datetime': b.start_datetime.isoformat() if hasattr(b.start_datetime, 'isoformat') else str(b.start_datetime),
            'price': b.metadata.get('price'),
        } for b, line in zip(bookings, lines)],
        'total': str(total),
        'currency': currency,
        'email': email,
    }, status=status.HTTP_201_CREATED)


class GuestReserveView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # solo para invitadas: un token caducado no debe dar 401
    throttle_classes = [scoped('checkout')]

    def post(self, request, *args, **kwargs):
        from api.utils.guest_checkout import guest_details, guest_profile, notify_guest_reservation
        from api.utils.payment_options import option_error, payment_options

        opts = payment_options()
        if not opts['guest_booking']:
            return option_error('guest_booking_disabled')
        if not opts['pay_at_studio']['guests']:
            # La web cobra con tarjeta: que pague así (antes code='pay_online')
            return option_error('pay_at_studio_disabled', card=opts['drop_in_online'])
        captcha = check_captcha(request)
        if captcha:
            return captcha

        details, error = guest_details(request.data)
        if error:
            return error

        with transaction.atomic():
            guest, created = guest_profile(details['email'], details['name'], details['phone'])
            result, error = _reserve_at_studio({'guest': guest}, request.data.get('cart_items'),
                                               MAX_GUEST_ITEMS, 'web_guest')
            if error:
                return error
            bookings, lines, total, currency = result
            transaction.on_commit(lambda: notify_guest_reservation(bookings, total, currency))

        logger.info("guest_reserve.created guest_id=%s created=%s bookings=%s total=%s %s",
                    guest.public_id, created, [b.id for b in bookings], total, currency)
        return _reserved_response(bookings, lines, total, currency, guest.email)


class StudioReserveView(APIView):
    """Clienta con cuenta que reserva y paga en el estudio (si el estudio lo
    permite: «Pagar en el estudio» → «Clientas con cuenta»)."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [scoped('checkout')]

    def post(self, request, *args, **kwargs):
        from api.utils.booking_notify import notify_booking_confirmation
        from api.utils.guest_checkout import notify_guest_reservation
        from api.utils.payment_options import option_error, payment_options

        opts = payment_options()
        if not opts['pay_at_studio']['clients']:
            return option_error('pay_at_studio_disabled', card=opts['drop_in_online'])

        user = request.user
        with transaction.atomic():
            result, error = _reserve_at_studio({'user': user}, request.data.get('cart_items'), 30, 'web_client')
            if error:
                return error
            bookings, lines, total, currency = result
            # Push de confirmación + email con lo que paga en el estudio
            transaction.on_commit(lambda items=bookings: notify_booking_confirmation(items, send_email=False))
            transaction.on_commit(lambda: notify_guest_reservation(bookings, total, currency))

        logger.info("studio_reserve.created user_id=%s bookings=%s total=%s %s",
                    user.id, [b.id for b in bookings], total, currency)
        return _reserved_response(bookings, lines, total, currency, user.email)
