"""Reserva como invitada (sin cuenta): lo que comparten el pago con tarjeta
(POST /api/v1/checkout/create-session/) y «pagar en el estudio»
(POST /api/v1/checkout/guest-reserve/).

  - guest_details(data)       → nombre, email y teléfono validados (o un error).
  - guest_profile(...)        → la ficha de la invitada: reutiliza la que ya
                                exista con ese email (también si estaba borrada).
  - validate_cart(...)        → comprueba cada clase del carrito (existe, está
                                activa, no ha pasado, tiene plaza, no la tiene
                                ya reservada…) y devuelve las líneas con precio.

Antes, el pago de invitada creaba el Payment y las reservas pendientes ANTES de
comprobar las plazas (si la 2.ª clase estaba llena quedaban huérfanos), fallaba
con 500 si la invitada ya existía borrada o no mandaba nombre, y con el estudio
sin pagos online no había forma de reservar sin cuenta.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Tope de clases por reserva de invitada (evita carritos absurdos o abusivos)
MAX_GUEST_ITEMS = 10


@dataclass
class CartLine:
    schedule: object
    start: datetime
    end: datetime | None
    start_raw: str
    end_raw: str | None
    price: Decimal | None
    credits: Decimal | None


def _bad(message: str, code: str = '', **extra) -> Response:
    body = {'error': message}
    if code:
        body['code'] = code
    body.update(extra)
    return Response(body, status=status.HTTP_400_BAD_REQUEST)


def guest_details(data) -> tuple[dict | None, Response | None]:
    """Email (obligatorio y válido), nombre (si falta, la parte del email) y
    teléfono (opcional). Devuelve (datos, None) o (None, respuesta de error)."""
    email = str(data.get('email') or '').strip().lower()
    if not email:
        return None, _bad('Falta el email de la invitada.', 'guest_email')
    try:
        validate_email(email)
    except ValidationError:
        return None, _bad('El email no es válido.', 'guest_email')
    name = ' '.join(str(data.get('name') or '').split())[:120] or email.split('@')[0][:120]
    phone = str(data.get('phone') or '').strip()[:40]
    # react-international-phone manda solo el prefijo («+34») si se deja vacío
    if sum(ch.isdigit() for ch in phone) < 7:
        phone = ''
    return {'email': email, 'name': name, 'phone': phone}, None


def guest_profile(email: str, name: str, phone: str):
    """Ficha de la invitada con ese email: la reutiliza (aunque estuviera
    borrada) y actualiza nombre y teléfono con lo último que ha escrito."""
    from api.models import GuestProfile

    guest = GuestProfile.all_objects.filter(email__iexact=email).order_by('id').first()
    if guest is None:
        return GuestProfile.objects.create(email=email, name=name, phone=phone or None), True
    fields = []
    if guest.deleted_at is not None:
        guest.deleted_at = None
        fields.append('deleted_at')
    if name and guest.name != name:
        guest.name = name
        fields.append('name')
    if phone and guest.phone != phone:
        guest.phone = phone
        fields.append('phone')
    if fields:
        guest.save(update_fields=[*fields, 'updated_at'])
    return guest, False


def _aware(value) -> datetime | None:
    """Fecha del carrito (ISO, normalmente en UTC con «Z») → datetime con zona.
    Sin zona se interpreta en la hora del estudio."""
    from api.utils.availability import MADRID_TZ

    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = parse_datetime(str(value or '').strip())
        except (TypeError, ValueError):
            dt = None
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = dt.replace(tzinfo=MADRID_TZ)
    return dt


def validate_cart(cart_items, guest=None, lock=False) -> tuple[list[CartLine] | None, Response | None]:
    """Comprueba el carrito de una invitada. Con lock=True bloquea las clases
    (select_for_update) para que dos reservas a la vez no pasen del aforo:
    llámalo dentro de transaction.atomic()."""
    from api.models import Booking, RecurringSchedule
    from api.utils.availability import UNAVAILABLE_MESSAGES, slot_unavailable_reason, to_madrid_wall
    from api.utils.waitlist import full_class_payload, occurs_on, seats_taken, wall_date

    if not cart_items or not isinstance(cart_items, list):
        return None, _bad('La solicitud debe contener una lista de clases.', 'empty_cart')
    if len(cart_items) > MAX_GUEST_ITEMS:
        return None, _bad(f'Puedes reservar hasta {MAX_GUEST_ITEMS} clases a la vez.', 'too_many')

    ids = []
    for item in cart_items:
        if not isinstance(item, dict):
            return None, _bad('Carrito no válido.', 'bad_item')
        # Los eventos sueltos («E_…») no son horarios: su id no es de una clase
        # y antes se reservaba la clase que tuviera ese mismo número.
        if str(item.get('id') or '').startswith('E_'):
            return None, _bad('Este evento no se puede reservar online: escríbenos y te guardamos plaza.', 'event')
        try:
            ids.append(int(item.get('id_source')))
        except (TypeError, ValueError):
            return None, _bad('No se encontraron clases válidas en el carrito.', 'bad_item')

    qs = RecurringSchedule.objects.filter(id__in=ids).select_related('class_type')
    if lock:
        qs = qs.select_for_update()
    schedules = {s.id: s for s in qs}

    now = timezone.now()
    lines: list[CartLine] = []
    seen = set()
    for item, sid in zip(cart_items, ids):
        schedule = schedules.get(sid)
        if schedule is None:
            return None, _bad(f'La sesión con id {sid} no es válida o no existe.', 'not_found')
        title = schedule.class_type.title
        start = _aware(item.get('sessionDate'))
        if start is None:
            return None, _bad(f'"{title}": falta la fecha de la sesión.', 'bad_date')
        end = _aware(item.get('sessionDateEnd'))
        if start <= now:
            return None, _bad(f'"{title}": esa sesión ya ha empezado.', 'past')
        key = (sid, start)
        if key in seen:
            continue  # la misma sesión dos veces en el carrito: cuenta una
        seen.add(key)

        # La fecha tiene que ser una sesión real de esa clase (su día y su hora):
        # antes se aceptaba cualquier hora que mandara el navegador.
        wall = to_madrid_wall(start)
        if wall is None or not occurs_on(schedule, wall.date()) or \
                (wall.hour, wall.minute) != (schedule.start_time.hour, schedule.start_time.minute):
            return None, _bad(f'"{title}": esa sesión no existe en el horario.', 'bad_slot')

        unavailable = slot_unavailable_reason(schedule, start)
        if unavailable:
            return None, _bad(f'"{title}": {UNAVAILABLE_MESSAGES[unavailable]}', unavailable)

        active = Booking.objects.filter(occurrence_id=sid, start_datetime=start, status__in=['reserved', 'attended'])
        if guest is not None and active.filter(guest=guest).exists():
            return None, _bad(f'Ya tienes una reserva para "{title}" en ese horario.', 'already_booked')
        taken = active.count()
        day = wall_date(start)
        if day is not None:
            taken = max(taken, seats_taken(schedule, day))
        if taken >= schedule.capacity_max:
            return None, _bad(f'La clase "{title}" está completa para el horario seleccionado.',
                              **full_class_payload(schedule, start))

        price = schedule.price_eur_override
        if price is None:
            price = schedule.class_type.default_price_eur
        credits = schedule.price_credits_override
        if credits is None:
            credits = schedule.class_type.default_price_credits
        lines.append(CartLine(
            schedule=schedule, start=start, end=end,
            start_raw=str(item.get('sessionDate')), end_raw=item.get('sessionDateEnd'),
            price=Decimal(price) if price is not None else None,
            credits=Decimal(credits) if credits is not None else None,
        ))
    return lines, None


def notify_guest_reservation(bookings, total, currency) -> None:
    """Email a la invitada que reservó para pagar en el estudio. Nunca lanza."""
    from api.utils.booking_notify import GENERIC_TEMPLATE, _booking_line
    from api.utils.emailing import send_templated_email
    from api.utils.locale import money
    from api.utils.site import get_site_config, web_url

    try:
        if not bookings:
            return
        guest = bookings[0].guest
        if guest is None or not guest.email:
            return
        lines = [_booking_line(b) for b in bookings]
        n = len(lines)
        studio = get_site_config().studio_name
        to_pay = f' Pagas {money(total, currency)} en el estudio al llegar.' if total and total > 0 else ''
        send_templated_email(
            to_email=guest.email,
            template_id=GENERIC_TEMPLATE,
            dynamic_data={
                'name': guest.name or '',
                'headline': 'Reserva confirmada',
                'intro_copy': (
                    (f'Tu plaza está guardada: {lines[0]}.' if n == 1
                     else f'Tus {n} plazas están guardadas: {" · ".join(lines)}.')
                    + to_pay
                    + f' Si no puedes venir, avisa a {studio} con tiempo para que otra persona pueda aprovechar la plaza.'
                ),
                'cta_text': 'Ver el horario',
                'cta_url': web_url('/calendar'),
            },
        )
    except Exception:
        logger.warning('guest_reserve.email_failed', exc_info=True)
