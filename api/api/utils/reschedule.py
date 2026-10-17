"""
Gestión de reservas existentes cuando un horario cambia:
- move_bookings_to(): traslada reservas a un horario nuevo (misma plaza,
  mismos créditos) y avisa a cada cliente por email + push.
- cancel_future_bookings(): cancela y reembolsa desde una fecha, avisando.

Usado por apply_from (cambio de horario con fecha de efecto) y move_session
(mover una única fecha).

Convención de fechas: las reservas nuevas se guardan como instantes REALES de
Madrid (aware Europe/Madrid → UTC real en BD), que es la convención con la que
la web guarda sus reservas en producción — así los conteos de aforo por
igualdad exacta cuadran con las reservas web y las horas se muestran bien.
"""
import logging
from datetime import datetime

from django.db import transaction

from api.models import Booking, CreditLedgerEntry
from api.utils.availability import MADRID_TZ, to_madrid_wall
from api.utils.emailing import send_templated_email
from api.utils.push import send_cancellation_push, send_schedule_change_push
from api.utils.sms import _app_hint, notify_cancellation_email, send_whatsapp_cancellation
from api.utils.site import web_url

logger = logging.getLogger(__name__)

GENERIC_TEMPLATE = "generic-notice"  # headline/intro/cta genérico (emails/generic_notice.html)


def _wall_date(booking):
    """Fecha 'de pared' de la reserva tal y como la vio el usuario
    (tolerante a la convención con la que se guardó el datetime)."""
    wall = to_madrid_wall(booking.start_datetime)
    return (wall or booking.start_datetime.replace(tzinfo=None)).date()


def _as_stored(dt_naive_wall):
    """Hora de pared Madrid → instante real (Django lo guarda como UTC)."""
    return dt_naive_wall.replace(tzinfo=MADRID_TZ)


def _notify_change_email(user, class_title, old_dt, new_dt):
    """Acepta User o GuestProfile."""
    if not getattr(user, 'email', None):
        return
    try:
        from api.utils.availability import to_madrid_wall
        old_w, new_w = to_madrid_wall(old_dt), to_madrid_wall(new_dt)
        send_templated_email(
            to_email=user.email,
            template_id=GENERIC_TEMPLATE,
            dynamic_data={
                "name": getattr(user, "first_name", None) or getattr(user, "name", None) or "",
                "headline": "Cambio de horario en tu clase",
                "intro_copy": (
                    f"Tu clase de {class_title} del {old_w:%d/%m/%Y} a las {old_w:%H:%M} "
                    f"pasa al {new_w:%d/%m/%Y} a las {new_w:%H:%M}. "
                    f"Tu plaza se ha movido automáticamente — no tienes que hacer nada."
                    + _app_hint(user)
                ),
                "cta_text": "Ver mis reservas",
                "cta_url": web_url("/dashboard"),
            },
            subject="Cambio de horario en tu clase",
        )
    except Exception:
        logger.warning("reschedule.email_failed user_id=%s", user.id, exc_info=True)


def move_bookings_to(old_schedule, new_schedule, new_start_time, new_end_time,
                     from_date, only_date=None):
    """Traslada las reservas activas de old_schedule (fecha >= from_date, o
    exactamente only_date) al horario nuevo, conservando la fecha de cada una.
    Devuelve el nº de reservas movidas. Notifica push + email por cliente."""
    qs = Booking.objects.filter(
        occurrence=old_schedule, status='reserved',
    ).select_related('user', 'guest', 'occurrence__class_type')

    moved = 0
    notifications = []
    with transaction.atomic():
        for booking in qs:
            d = _wall_date(booking)
            if only_date is not None:
                if d != only_date:
                    continue
            elif d < from_date:
                continue

            old_dt = booking.start_datetime
            new_start = _as_stored(datetime.combine(d, new_start_time))
            new_end = _as_stored(datetime.combine(d, new_end_time))
            booking.occurrence = new_schedule
            booking.start_datetime = new_start
            booking.end_datetime = new_end
            booking.metadata = {**(booking.metadata or {}),
                                'moved_from': str(old_dt), 'moved_reason': 'schedule_change'}
            booking.save(update_fields=['occurrence', 'start_datetime', 'end_datetime',
                                        'metadata', 'updated_at'])
            moved += 1
            person = booking.user or booking.guest
            if person:
                notifications.append((person, old_schedule.class_type.title, old_dt, new_start))

    for person, title, old_dt, new_dt in notifications:
        if hasattr(person, 'push_subscriptions'):  # invitados: solo email
            send_schedule_change_push(person, title, old_dt, new_dt)
        _notify_change_email(person, title, old_dt, new_dt)

    logger.info(
        "reschedule.moved old_schedule=%s new_schedule=%s moved=%s from=%s only=%s",
        old_schedule.id, new_schedule.id, moved, from_date, only_date,
    )
    return moved


def cancel_future_bookings(schedule, from_date, reason="Cambio de calendario"):
    """Cancela y reembolsa las reservas activas de schedule con fecha >= from_date.
    Devuelve (canceladas, reembolsadas). Avisa por email + WhatsApp + push."""
    qs = Booking.objects.filter(
        occurrence=schedule, status='reserved',
    ).select_related('user', 'guest', 'payment', 'occurrence__class_type')

    cancelled = refunded = 0
    to_notify = []
    guest_refunds = []
    with transaction.atomic():
        for booking in qs:
            if _wall_date(booking) < from_date:
                continue
            credits = (
                schedule.price_credits_override
                if schedule.price_credits_override is not None
                else schedule.class_type.default_price_credits
            )
            if (booking.user and credits and credits > 0
                    and not (booking.metadata or {}).get('no_charge')
                    and hasattr(booking.user, 'wallet')):
                CreditLedgerEntry.objects.create(
                    wallet=booking.user.wallet,
                    kind='refund',
                    amount=credits,
                    reference=f'reschedule_cancel_{schedule.id}_{booking.id}',
                    metadata={'booking_id': booking.id, 'reason': reason},
                )
                refunded += 1
            elif booking.guest_id:
                # Invitado: pagó con tarjeta → reembolso Stripe tras el commit
                guest_refunds.append(booking)
            booking.status = 'canceled'
            booking.save(update_fields=['status', 'updated_at'])
            cancelled += 1
            person = booking.user or booking.guest
            if person:
                to_notify.append((person, schedule.class_type.title, booking.start_datetime))

    from api.utils.guest_refund import refund_guest_booking_stripe
    for booking in guest_refunds:
        if refund_guest_booking_stripe(booking, reason=reason):
            refunded += 1

    for person, title, start_dt in to_notify:
        try:
            notify_cancellation_email(person, title, start_dt)
            send_whatsapp_cancellation(person, title, start_dt)
        except Exception:
            logger.warning("reschedule.cancel_notify_failed pk=%s", person.pk, exc_info=True)
        if hasattr(person, 'push_subscriptions'):
            send_cancellation_push(person, title, start_dt)

    logger.info("reschedule.cancelled schedule=%s cancelled=%s refunded=%s from=%s",
                schedule.id, cancelled, refunded, from_date)
    return cancelled, refunded
