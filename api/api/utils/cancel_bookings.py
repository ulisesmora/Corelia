# api/services.py
from django.db import transaction
from django.utils import timezone
from api.models import Booking, CreditLedgerEntry, RecurringSchedule
from api.utils.sms import notify_cancellation_email, send_whatsapp_cancellation
import logging

logger = logging.getLogger(__name__)

# Importa tus funciones de notificación (asegúrate de tenerlas definidas o impórtalas)
# from .utils import send_twilio_sms, notify_cancellation_email 

def cancel_session_logic(occurrence_id, start_datetime_aware):
    logger.info('cancelar sesion')
    """
    Lógica centralizada para cancelar una sesión.
    Se puede llamar desde la API (Admin) o desde Celery (Automático).
    """
    # Buscamos la regla de recurrencia
    try:
        schedule = RecurringSchedule.objects.get(id=occurrence_id)
    except RecurringSchedule.DoesNotExist:
        return {"error": "Schedule not found"}

    # Buscamos las reservas ACTIVAS para esa fecha/hora específica
    
    bookings = Booking.objects.filter(
        occurrence=schedule,
        start_datetime__date=start_datetime_aware, # <--- CAMBIO CLAVE (__date)
        status='reserved'
    ).select_related('user', 'user__wallet', 'guest', 'payment')

    logger.info(f"Reservas encontradas en el servicio: {bookings.count()}")
    if not bookings.exists():
        return {"message": "No bookings to cancel"}

    cancelled_count = 0
    refunded_count = 0
    class_title = schedule.class_type.title
    users_to_notify = []
    guest_refunds = []

    with transaction.atomic():
        for booking in bookings:
            # 1. Calcular Créditos a devolver
            credits_to_refund = (
                schedule.price_credits_override
                if schedule.price_credits_override is not None
                else schedule.class_type.default_price_credits
            )

            # 2. Reembolsar (User → créditos al monedero; Guest → Stripe)
            if booking.user and credits_to_refund > 0:
                try:
                    if hasattr(booking.user, 'wallet'):
                        CreditLedgerEntry.objects.create(
                            wallet=booking.user.wallet,
                            kind="refund",
                            amount=credits_to_refund,
                            reference=f"session_cancel_{occurrence_id}_{booking.id}",
                            metadata={
                                "booking_id": booking.id,
                                "reason": "Low occupancy auto-cancellation",
                                "session_date": str(start_datetime_aware)
                            }
                        )
                        refunded_count += 1
                except Exception as e:
                    logger.error(f"Error refunding user {booking.user.id}: {e}")
            elif booking.guest_id:
                guest_refunds.append(booking)
            # 3. Cancelar reserva
            booking.status = "canceled"
            booking.save(update_fields=['status', 'updated_at'])
            cancelled_count += 1

            person = booking.user or booking.guest
            if person:
                users_to_notify.append(person)

    # Reembolso Stripe a invitados (fuera de la transacción)
    from api.utils.guest_refund import refund_guest_booking_stripe
    for booking in guest_refunds:
        if refund_guest_booking_stripe(booking, reason='session_cancellation'):
            refunded_count += 1

    # 4. Notificaciones (Fuera de la transacción para no bloquear DB si el email tarda)
    from api.utils.push import send_cancellation_push
    for person in users_to_notify:
        logger.info(f"Notificando a {person.email}...")
        notify_cancellation_email(person, class_title, start_datetime_aware)
        send_whatsapp_cancellation(person, class_title, start_datetime_aware)
        if hasattr(person, 'push_subscriptions'):  # invitados: sin push
            send_cancellation_push(person, class_title, start_datetime_aware)
            

    return {
        "status": "success",
        "cancelled": cancelled_count,
        "refunded": refunded_count
    }


def cancel_all_schedule_bookings(schedule_id):
    try:
        schedule = RecurringSchedule.objects.get(id=schedule_id)
    except RecurringSchedule.DoesNotExist:
        return {"error": "Schedule not found"}

    now = timezone.now()

    bookings = Booking.objects.filter(
        occurrence=schedule,
        start_datetime__gte=now,
        status='reserved'
    ).select_related('user', 'user__wallet', 'guest', 'payment', 'occurrence', 'occurrence__class_type')

    if not bookings.exists():
        # Sin reservas futuras, pero puede haber suscriptoras con la clase en
        # sus preferencias: desactivarlas, ofrecer alternativas y avisarlas.
        from api.utils.replacement import retire_schedule_preferences
        replaced = retire_schedule_preferences(schedule, 'ya no está en el horario')
        schedule.soft_delete()
        return {
            "message": "No future bookings to cancel, schedule soft-deleted",
            "cancelled": 0, "refunded": 0, "affected_users": replaced,
        }

    cancelled_count = 0
    refunded_count = 0
    class_title = schedule.class_type.title
    affected_users = set()
    guest_refund_queue = []

    with transaction.atomic():
        for booking in bookings:
            credits_to_refund = (
                schedule.price_credits_override
                if schedule.price_credits_override is not None
                else schedule.class_type.default_price_credits
            )

            if booking.user and credits_to_refund > 0:
                try:
                    if hasattr(booking.user, 'wallet'):
                        CreditLedgerEntry.objects.create(
                            wallet=booking.user.wallet,
                            kind="refund",
                            amount=credits_to_refund,
                            reference=f"schedule_cancel_all_{schedule_id}_{booking.id}",
                            metadata={
                                "booking_id": booking.id,
                                "reason": "Schedule deleted from calendar",
                                "session_date": str(booking.start_datetime)
                            }
                        )
                        refunded_count += 1
                except Exception as e:
                    logger.error(f"Error refunding user {booking.user.id}: {e}")
            elif booking.guest_id:
                guest_refund_queue.append(booking)
            booking.status = "canceled"
            booking.save(update_fields=['status', 'updated_at'])
            cancelled_count += 1

            person = booking.user or booking.guest
            if person:
                affected_users.add(person)

    # Preferencias de auto-reserva: desactivar, ofrecer alternativas (con
    # weekday, para que el front calcule la próxima fecha) y avisar por
    # email+push — incluye a suscriptoras SIN reserva esa semana, que antes
    # no se enteraban de nada.
    from api.utils.replacement import retire_schedule_preferences
    replaced = retire_schedule_preferences(schedule, 'ya no está en el horario')

    schedule.soft_delete()

    # Reembolso Stripe a invitados (fuera de la transacción)
    from api.utils.guest_refund import refund_guest_booking_stripe
    for booking in guest_refund_queue:
        if refund_guest_booking_stripe(booking, reason='schedule_deleted'):
            refunded_count += 1

    from api.utils.push import send_cancellation_push
    for user in affected_users:
        try:
            notify_cancellation_email(user, class_title, now)
            send_whatsapp_cancellation(user, class_title, now)
        except Exception as e:
            logger.error(f"Error notifying {user.email}: {e}")
        if hasattr(user, 'push_subscriptions'):  # invitados: sin push
            send_cancellation_push(user, class_title, now)
    return {
        "status": "success",
        "cancelled": cancelled_count,
        "refunded": refunded_count,
        "affected_users": len(affected_users),
        "preferences_replaced": replaced,
    }