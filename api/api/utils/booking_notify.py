"""
Confirmación de reserva — push + email en cuanto la reserva queda confirmada,
tanto para usuarios registrados como para invitados (guest checkout).

Antes no existía NINGUNA confirmación fuera de la pantalla de "pago
completado": si el cliente cerraba la pestaña o el webhook tardaba, no le
quedaba ningún rastro de su reserva.
"""
import logging

from django.conf import settings
from api.utils.site import web_url

logger = logging.getLogger(__name__)

# Plantilla genérica real (headline/intro_copy/cta). El id antiguo
# "d-0d18d7f6…" renderizaba emails/booking_confirmation_credits.html, que
# ignora esos campos → el email llegaba con los títulos y los datos en blanco.
GENERIC_TEMPLATE = "generic-notice"


def _booking_line(booking):
    from api.utils.availability import to_madrid_wall

    title = (
        booking.occurrence.class_type.title if booking.occurrence_id
        else (booking.event.title if booking.event_id else 'Clase')
    )
    wall = to_madrid_wall(booking.start_datetime)
    cuando = f"{wall:%d/%m a las %H:%M}" if wall else ''
    room = ''
    try:
        if booking.occurrence_id and booking.occurrence.room_id:
            room = f" · {booking.occurrence.room.name}"
    except Exception:
        pass
    return f"{title} — {cuando}{room}"


def notify_booking_confirmation(bookings, send_email=True):
    """Confirma por push (usuarios) y email (usuarios e invitados) un lote de
    reservas ya confirmadas. Agrupa por persona para mandar UN aviso aunque
    haya reservado varias clases. Nunca lanza.

    send_email=False cuando otro email detallado ya cubre la confirmación
    (reserva con créditos → email del ledger; pago de invitado → recibo del
    Payment): si no, al cliente le llegaban DOS emails por la misma reserva.
    El push se manda igual."""
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user

    try:
        per_person = {}
        for b in bookings:
            person = b.user or b.guest
            if person is None:
                continue
            key = ('u' if b.user_id else 'g', person.pk)
            per_person.setdefault(key, {'person': person, 'is_user': bool(b.user_id), 'lines': []})
            per_person[key]['lines'].append(_booking_line(b))

        for data in per_person.values():
            person, lines = data['person'], data['lines']
            n = len(lines)
            listado = ' · '.join(lines)
            first_name = getattr(person, 'first_name', None) or getattr(person, 'name', '') or ''

            if data['is_user']:
                try:
                    send_push_to_user(
                        person,
                        title='✅ Reserva confirmada',
                        body=(lines[0] if n == 1
                              else f'{n} clases reservadas: {listado}'),
                        url='/dashboard',
                    )
                except Exception:
                    logger.warning("booking.confirm.push_failed user_id=%s", person.pk, exc_info=True)

            email = getattr(person, 'email', None)
            if email and send_email:
                try:
                    send_templated_email(
                        to_email=email,
                        template_id=GENERIC_TEMPLATE,
                        dynamic_data={
                            'name': first_name,
                            'headline': 'Reserva confirmada 🧘',
                            'intro_copy': (
                                (f'Tu plaza está guardada: {listado}. ' if n == 1
                                 else f'Tus {n} plazas están guardadas: {listado}. ')
                                + 'Si algún día no puedes venir, puedes cancelar hasta '
                                  f'{settings.BOOKING_CANCEL_MIN_HOURS} h antes y recuperas tus créditos.'
                            ),
                            'cta_text': 'Ver mis reservas',
                            'cta_url': web_url('/dashboard'),
                        },
                    )
                except Exception:
                    logger.warning("booking.confirm.email_failed pk=%s", person.pk, exc_info=True)

        logger.info("booking.confirm.sent people=%s bookings=%s",
                    len(per_person), sum(len(d['lines']) for d in per_person.values()))
    except Exception:
        logger.error("booking.confirm.failed", exc_info=True)


_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']


def notify_fixed_class_assigned(user, schedule, booked: int, first_start, last_start):
    """Aviso único cuando el estudio le guarda a un cliente una clase fija
    semanal (asignación desde el CRM). Estas reservas no gastan créditos, así
    que no se usa el texto genérico de confirmación. Nunca lanza."""
    if not booked:
        return
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user
    from api.utils.sms import format_class_date
    from api.utils.verification import is_placeholder_email

    title = schedule.class_type.title
    dia = _DIAS[schedule.weekday] if schedule.weekday is not None else ''
    hora = schedule.start_time.strftime('%H:%M')
    cuando = f"los {dia} a las {hora}" if dia.endswith('s') else f"cada {dia} a las {hora}"
    desde = format_class_date(first_start)
    hasta = format_class_date(last_start).split(' a las ')[0]
    try:
        send_push_to_user(
            user,
            title='📅 Tu clase fija está guardada',
            body=f"{title} {cuando}: tienes plaza en las próximas {booked} semanas (hasta el {hasta}).",
            url='/dashboard',
        )
    except Exception:
        logger.warning("fixed_class.push_failed user_id=%s", user.pk, exc_info=True)
    if user.email and not is_placeholder_email(user.email):
        try:
            send_templated_email(
                to_email=user.email,
                template_id=GENERIC_TEMPLATE,
                dynamic_data={
                    'name': user.first_name or '',
                    'headline': 'Tu clase fija está guardada 🧘',
                    'intro_copy': (
                        f"Te hemos guardado plaza en {title} {cuando}, desde el {desde} "
                        f"hasta el {hasta} ({booked} clases). Si algún día no puedes venir, "
                        "avísanos o cancélala desde tu cuenta para dejar la plaza libre."
                    ),
                    'cta_text': 'Ver mis reservas',
                    'cta_url': web_url('/dashboard'),
                },
            )
        except Exception:
            logger.warning("fixed_class.email_failed user_id=%s", user.pk, exc_info=True)
