"""Reserva como invitada (sin cuenta): lo que comparten el pago con tarjeta
(POST /api/v1/checkout/create-session/) y «pagar en el estudio»
(POST /api/v1/checkout/guest-reserve/).

  - guest_details(data)       → nombre, email y teléfono validados (o un error).
  - guest_profile(...)        → la ficha de la invitada: reutiliza la que ya
                                exista con ese email (también si estaba borrada).
  - validate_cart(...)        → comprueba cada clase o evento del carrito (es
                                una sesión real, está activa, no ha empezado,
                                no hay cierre, tiene plaza, no la tiene ya
                                reservada…) y devuelve las líneas con precio.
                                También lo usa la reserva con créditos.

Antes, el pago de invitada creaba el Payment y las reservas pendientes ANTES de
comprobar las plazas (si la 2.ª clase estaba llena quedaban huérfanos), fallaba
con 500 si la invitada ya existía borrada o no mandaba nombre, y con el estudio
sin pagos online no había forma de reservar sin cuenta.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
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
    """Una sesión del carrito ya comprobada: una clase del horario (`schedule`)
    o un evento suelto (`event`), con su inicio y fin reales y su precio."""
    schedule: object | None
    event: object | None
    title: str
    start: datetime
    end: datetime | None
    price: Decimal | None
    credits: Decimal | None

    def target(self) -> dict:
        """Campos de Booking para esta sesión (clase XOR evento)."""
        if self.event is not None:
            return {'event_id': self.event.id}
        return {'occurrence_id': self.schedule.id}


def item_kind(item) -> str:
    """'event' para los eventos sueltos («E_…» en la web), 'class' para el resto.
    El id_source de un evento es el de Event, no el de una clase del horario."""
    return 'event' if str((item or {}).get('id') or '').startswith('E_') or (item or {}).get('type') == 'EVENT' else 'class'


def event_unavailable_reason(event):
    """Motivo por el que un evento no se puede reservar, o None. Los cierres
    globales (sin clase concreta) también afectan a los eventos."""
    from api.models import ScheduleBlackout
    from api.utils.availability import to_madrid_wall

    if not event.is_active or event.status == 'canceled' or event.deleted_at is not None:
        return 'inactive'
    wall = to_madrid_wall(event.start_datetime)
    day = timedelta(days=1)
    for b in ScheduleBlackout.objects.filter(schedule__isnull=True,
                                             start_datetime__lte=event.start_datetime + day,
                                             end_datetime__gte=event.start_datetime - day):
        if to_madrid_wall(b.start_datetime) <= wall < to_madrid_wall(b.end_datetime):
            return 'blocked'
    return None


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


def validate_cart(cart_items, guest=None, user=None, lock=False,
                  max_items=MAX_GUEST_ITEMS) -> tuple[list[CartLine] | None, Response | None]:
    """Comprueba un carrito (clases del horario y eventos sueltos) para una
    invitada (`guest`) o una clienta con cuenta (`user`). Con lock=True bloquea
    las clases y eventos (select_for_update) para que dos reservas a la vez no
    pasen del aforo: llámalo dentro de transaction.atomic().

    Cada línea tiene que ser una sesión REAL: para una clase, su día de la
    semana (o su fecha si es suelta) y su hora; para un evento, su inicio. La
    hora que se guarda es la de la sesión, no la que mande el navegador."""
    from api.models import Booking, Event, RecurringSchedule
    from api.utils.availability import UNAVAILABLE_MESSAGES, slot_unavailable_reason, to_madrid_wall
    from api.utils.waitlist import as_instant, full_class_payload, occurs_on, seats_taken, slot_bounds

    if not cart_items or not isinstance(cart_items, list):
        return None, _bad('La solicitud debe contener una lista de clases.', 'empty_cart')
    if len(cart_items) > max_items:
        return None, _bad(f'Puedes reservar hasta {max_items} clases a la vez.', 'too_many')

    parsed = []  # (kind, id, item)
    for item in cart_items:
        if not isinstance(item, dict):
            return None, _bad('Carrito no válido.', 'bad_item')
        try:
            ref = int(item.get('id_source'))
        except (TypeError, ValueError):
            return None, _bad('No se encontraron clases válidas en el carrito.', 'bad_item')
        parsed.append((item_kind(item), ref, item))

    def fetch(model, ids, related):
        qs = model.objects.filter(id__in=ids).select_related(*related)
        if lock:
            qs = qs.select_for_update(of=('self',))
        return {o.id: o for o in qs}

    schedules = fetch(RecurringSchedule, [r for k, r, _ in parsed if k == 'class'], ('class_type',))
    events = fetch(Event, [r for k, r, _ in parsed if k == 'event'], ('class_type',))

    now = timezone.now()
    owner = {'guest': guest} if guest is not None else ({'user': user} if user is not None else None)
    lines: list[CartLine] = []
    seen = set()
    for kind, ref, item in parsed:
        start_sent = _aware(item.get('sessionDate'))
        if kind == 'event':
            event = events.get(ref)
            if event is None:
                return None, _bad(f'El evento con id {ref} no es válido o no existe.', 'not_found')
            title = event.title
            start, end = event.start_datetime, event.end_datetime
            # El navegador manda el inicio del evento: si no coincide, no es esa sesión
            if start_sent is None or abs((start_sent - start).total_seconds()) >= 60:
                return None, _bad(f'"{title}": esa sesión no existe en el horario.', 'bad_slot')
        else:
            schedule = schedules.get(ref)
            if schedule is None:
                return None, _bad(f'La sesión con id {ref} no es válida o no existe.', 'not_found')
            title = schedule.class_type.title
            if start_sent is None:
                return None, _bad(f'"{title}": falta la fecha de la sesión.', 'bad_date')
            wall = to_madrid_wall(start_sent)
            # Su día y su hora: antes se aceptaba cualquier hora que mandara el navegador
            if wall is None or not occurs_on(schedule, wall.date()) or \
                    (wall.hour, wall.minute) != (schedule.start_time.hour, schedule.start_time.minute):
                return None, _bad(f'"{title}": esa sesión no existe en el horario.', 'bad_slot')
            s_wall, e_wall = slot_bounds(schedule, wall.date())
            start, end = as_instant(s_wall), as_instant(e_wall)

        if start <= now:
            return None, _bad(f'"{title}": esa sesión ya ha empezado.', 'past')
        key = (kind, ref, start)
        if key in seen:
            continue  # la misma sesión dos veces en el carrito: cuenta una
        seen.add(key)

        if kind == 'event':
            unavailable = event_unavailable_reason(event)
            active = Booking.objects.filter(event_id=ref, status__in=['reserved', 'attended'])
        else:
            unavailable = slot_unavailable_reason(schedule, start)
            active = Booking.objects.filter(occurrence_id=ref, start_datetime=start,
                                            status__in=['reserved', 'attended'])
        if unavailable:
            return None, _bad(f'"{title}": {UNAVAILABLE_MESSAGES[unavailable]}', unavailable)
        if owner is not None and active.filter(**owner).exists():
            return None, _bad(f'Ya tienes una reserva para "{title}" en ese horario.', 'already_booked')

        taken = active.count()
        if kind == 'event':
            capacity, full_extra = event.capacity_max, {'code': 'class_full', 'waitlist': False}
            price, credits = event.price_eur, event.price_credits
        else:
            # Las plazas ofrecidas a la lista de espera también cuentan (salvo la suya)
            taken = max(taken, seats_taken(schedule, to_madrid_wall(start).date(),
                                           exclude_user_id=getattr(user, 'id', None)))
            capacity, full_extra = schedule.capacity_max, full_class_payload(schedule, start)
            price = schedule.price_eur_override
            if price is None:
                price = schedule.class_type.default_price_eur
            credits = schedule.price_credits_override
            if credits is None:
                credits = schedule.class_type.default_price_credits
        if taken >= capacity:
            return None, _bad(f'La clase "{title}" está completa para el horario seleccionado.', **full_extra)

        lines.append(CartLine(
            schedule=schedule if kind == 'class' else None,
            event=event if kind == 'event' else None,
            title=title, start=start, end=end,
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
