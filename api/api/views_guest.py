"""Reservar como invitada y pagar en el estudio.

POST /api/v1/checkout/guest-reserve/
    {email, name, phone, cart_items: [...], turnstile_token?}
    → 201 {status: 'reserved', bookings: [...], total, currency, pay_at_studio: true}

Solo cuando el estudio NO cobra online (sin Stripe): entonces la web no puede
ofrecer el pago con tarjeta y, sin esto, quien no tiene cuenta no podía
reservar de ninguna forma (la página de pago le decía «crea tu cuenta y compra
créditos en el estudio»). Con pagos online la invitada paga con tarjeta
(CreateCheckoutSessionView) y esta ruta responde 409.

Las reservas quedan confirmadas a nombre de la ficha de invitada (GuestProfile),
sin pago asociado; el precio de la clase se guarda en booking.metadata para que
el estudio sepa cuánto cobrar al llegar. Límite por IP y captcha (si el estudio
lo tiene configurado), como el pago de invitada.
"""
import logging
from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import Booking
from api.throttling import scoped
from api.utils.turnstile import check_captcha

logger = logging.getLogger(__name__)


class GuestReserveView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # solo para invitadas: un token caducado no debe dar 401
    throttle_classes = [scoped('checkout')]

    def post(self, request, *args, **kwargs):
        from api.utils.guest_checkout import (
            guest_details, guest_profile, notify_guest_reservation, validate_cart,
        )
        from api.utils.payments import payments_enabled, stripe_currency

        if payments_enabled():
            return Response(
                {'error': 'Este estudio cobra las reservas online: paga con tarjeta para reservar.',
                 'code': 'pay_online'},
                status=status.HTTP_409_CONFLICT,
            )
        captcha = check_captcha(request)
        if captcha:
            return captcha

        details, error = guest_details(request.data)
        if error:
            return error

        currency = stripe_currency().upper()
        with transaction.atomic():
            guest, created = guest_profile(details['email'], details['name'], details['phone'])
            lines, error = validate_cart(request.data.get('cart_items'), guest=guest, lock=True)
            if error:
                transaction.set_rollback(True)
                return error
            bookings = []
            total = Decimal(0)
            for line in lines:
                price = line.price if line.price and line.price > 0 else Decimal(0)
                total += price
                bookings.append(Booking.objects.create(
                    guest=guest, **line.target(),
                    start_datetime=line.start, end_datetime=line.end, status='reserved',
                    metadata={'pay_at_studio': True, 'price': str(price), 'currency': currency,
                              'source': 'web_guest'},
                ))
            transaction.on_commit(lambda: notify_guest_reservation(bookings, total, currency))

        logger.info("guest_reserve.created guest_id=%s created=%s bookings=%s total=%s %s",
                    guest.public_id, created, [b.id for b in bookings], total, currency)
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
            'email': guest.email,
        }, status=status.HTTP_201_CREATED)
