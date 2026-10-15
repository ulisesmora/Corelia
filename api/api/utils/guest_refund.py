"""
Reembolso automático en Stripe para reservas de INVITADAS canceladas por el
estudio (blackout, horario eliminado, cambio de horario, cancelación de sesión).

Las usuarias registradas pagan con créditos y se les reembolsa al monedero;
las invitadas pagaron con tarjeta, así que lo justo es devolverles el dinero
a la tarjeta sin que tengan que reclamar.

Seguridad del importe: nunca se devuelve más de lo que queda reembolsable en
el PaymentIntent (cubre pagos con cupón de descuento o parcialmente
reembolsados). Si algo falla, se registra en CRITICAL para reembolso manual
— la cancelación nunca se rompe por esto.
"""
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)


def _booking_price(booking):
    """Precio actual de la reserva (en la moneda del estudio), o None."""
    price = None
    if booking.occurrence_id:
        schedule = booking.occurrence
        price = (
            schedule.price_eur_override
            if schedule.price_eur_override is not None
            else schedule.class_type.default_price_eur
        )
    elif booking.event_id:
        price = booking.event.price_eur
    if not price or price <= 0:
        return None
    return Decimal(price)


def _booking_price_cents(booking, currency):
    """Precio en la unidad mínima de Stripe de `currency` (céntimos; CLP tal cual)."""
    from api.utils.payments import to_stripe_amount
    price = _booking_price(booking)
    return to_stripe_amount(price, currency) if price else 0


def refund_guest_booking_stripe(booking, reason=''):
    """Devuelve a la tarjeta el precio de la reserva de una invitada.
    Retorna lo reembolsado en la unidad mínima de la moneda del pago
    (céntimos; en CLP, pesos) o 0 si no aplica. Nunca lanza."""
    payment = booking.payment
    if not booking.guest_id or not payment:
        return 0
    if (payment.method or '') != 'stripe':
        return 0
    intent_id = getattr(payment, 'stripe_payment_intent_id', None)
    if not intent_id:
        logger.warning("guest_refund.no_intent booking_id=%s payment_id=%s", booking.id, payment.id)
        return 0
    if (booking.metadata or {}).get('no_charge'):
        return 0

    # El reembolso va en la moneda en la que se COBRÓ. Si el estudio ha
    # cambiado de moneda después, el precio actual de la clase está en otra
    # moneda y no se puede comparar: mejor reembolso manual que uno erróneo.
    from api.utils.locale import studio_currency
    paid_currency = (payment.currency or 'EUR').upper()
    if paid_currency != studio_currency():
        logger.critical(
            "guest_refund.currency_changed booking_id=%s payment_id=%s paid=%s studio=%s — "
            "reembolsar a mano: el estudio cambió de moneda después del pago",
            booking.id, payment.id, paid_currency, studio_currency(),
        )
        return 0
    price_cents = _booking_price_cents(booking, paid_currency)
    if price_cents <= 0:
        return 0

    from api.utils.payments import stripe_client, to_dict
    # En la cuenta donde se cobró ('' = la de las claves; acct_… = la conectada)
    client = stripe_client(account=getattr(payment, 'stripe_account', '') or '')
    if client is None:
        logger.critical("guest_refund.stripe_disconnected booking_id=%s payment_id=%s — "
                        "reembolsar a mano: Stripe ya no está conectado", booking.id, payment.id)
        return 0

    try:
        pi = to_dict(client.v1.payment_intents.retrieve(intent_id, params={'expand': ['latest_charge']}))
        received = pi.get('amount_received') or 0
        already = 0
        charge = pi.get('latest_charge')
        if isinstance(charge, dict):
            already = charge.get('amount_refunded') or 0
        refundable = max(0, received - already)
        amount = min(price_cents, refundable)
        if amount <= 0:
            logger.warning(
                "guest_refund.nothing_refundable booking_id=%s intent=%s received=%s refunded=%s",
                booking.id, intent_id, received, already,
            )
            return 0
        client.v1.refunds.create(params={
            'payment_intent': intent_id,
            'amount': amount,
            'metadata': {'booking_id': str(booking.id), 'reason': reason or 'studio_cancellation'},
        })
        logger.info(
            "guest_refund.issued booking_id=%s guest_id=%s amount_minor=%s currency=%s intent=%s reason=%r",
            booking.id, booking.guest_id, amount, paid_currency, intent_id, reason,
        )
        return amount
    except Exception:
        logger.critical(
            "guest_refund.FAILED booking_id=%s guest_id=%s intent=%s price_cents=%s — reembolsar manualmente",
            booking.id, booking.guest_id, intent_id, price_cents, exc_info=True,
        )
        return 0
