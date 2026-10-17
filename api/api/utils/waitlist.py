"""
Lista de espera de una sesión (regla + fecha).

Flujo:
- La clase está llena → el cliente se apunta (join). Queda «waiting» por
  orden de llegada.
- Se libera una plaza (alguien cancela, se le quita, se mueve su reserva…)
  → offer_next() se la ofrece a la primera persona: pasa a «offered» con caducidad
  (WaitlistSettings.claim_minutes, nunca más allá del inicio de la clase) y
  recibe email + push con un enlace para aceptarla. Mientras la oferta está
  viva, esa plaza cuenta como ocupada (seats_taken): nadie se la quita.
- La acepta (claim) → se crea su Booking pagando con créditos.
- No contesta a tiempo → expire_offers() (tarea cada 10 min) la marca
  «expired» y se ofrece a la siguiente persona.
- El estudio puede «Dar plaza» desde el calendario (promote) o quitarla.

Las fechas se comparan en hora de pared del estudio, igual que las reservas
(ver api/utils/availability.py).
"""
import logging
from datetime import datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from api.utils.availability import MADRID_TZ, slot_unavailable_reason, to_madrid_wall

logger = logging.getLogger(__name__)

ACTIVE_BOOKING = ('reserved', 'attended')


class WaitlistError(Exception):
    """Error con un código estable para la web/panel y un texto para personas."""

    def __init__(self, code, message, status=400, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra

    def payload(self):
        return {'error': self.message, 'code': self.code, **self.extra}


# ── Fechas ────────────────────────────────────────────────────────────────

def wall_date(value):
    wall = to_madrid_wall(value)
    return wall.date() if wall else None


def as_instant(wall):
    """Hora de pared del estudio → instante real (Django lo guarda en UTC)."""
    return wall.replace(tzinfo=MADRID_TZ)


def slot_bounds(schedule, d, start_time=None, end_time=None):
    """(inicio, fin) en hora de pared de la sesión de `schedule` el día `d`."""
    st = start_time or schedule.start_time
    et = end_time or schedule.end_time
    start = datetime.combine(d, st)
    end = datetime.combine(d, et)
    if end <= start:
        end += timedelta(days=1)
    return start, end


def _day_window(d):
    """Filtro grueso en BD para «ese día» (±1 día por las convenciones de hora)."""
    lo = as_instant(datetime.combine(d, time.min)) - timedelta(days=1)
    return lo, lo + timedelta(days=3)


def bookings_on(schedule_id, d, statuses=ACTIVE_BOOKING, select=True):
    from api.models import Booking
    lo, hi = _day_window(d)
    qs = Booking.objects.filter(occurrence_id=schedule_id, start_datetime__gte=lo, start_datetime__lt=hi)
    if statuses:
        qs = qs.filter(status__in=statuses)
    if select:
        qs = qs.select_related('user', 'guest', 'payment', 'occurrence__class_type')
    return [b for b in qs.order_by('created_at', 'id') if wall_date(b.start_datetime) == d]


def entries_on(schedule_id, d, statuses=('waiting', 'offered')):
    from api.models import WaitlistEntry
    lo, hi = _day_window(d)
    qs = WaitlistEntry.objects.filter(schedule_id=schedule_id, start_datetime__gte=lo, start_datetime__lt=hi)
    if statuses:
        qs = qs.filter(status__in=statuses)
    return [e for e in qs.select_related('user').order_by('created_at', 'id') if wall_date(e.start_datetime) == d]


def _offer_alive(entry, now=None):
    now = now or timezone.now()
    return entry.status == 'offered' and entry.offer_expires_at and entry.offer_expires_at > now


def seats_taken(schedule, d, exclude_user_id=None):
    """Plazas ocupadas de la sesión: reservas activas + ofertas vivas de la
    lista de espera (una oferta guarda la plaza hasta que caduca). Con
    exclude_user_id no se cuenta la oferta de ese cliente (es la suya)."""
    now = timezone.now()
    booked = len(bookings_on(schedule.id, d, select=False))
    held = sum(1 for e in entries_on(schedule.id, d, ('offered',))
               if _offer_alive(e, now) and e.user_id != exclude_user_id)
    return booked + held


def occurs_on(schedule, d):
    if not schedule.is_active or schedule.deleted_at is not None:
        return False
    if schedule.is_recurrent:
        return schedule.weekday == d.weekday() and schedule.is_date_in_window(d)
    return schedule.start_date == d


def settings_obj():
    from api.models import WaitlistSettings
    return WaitlistSettings.load()


def position_of(entry):
    """Puesto en la cola (1 = la primera persona) entre quienes siguen esperando."""
    ahead = [e for e in entries_on(entry.schedule_id, wall_date(entry.start_datetime), ('waiting', 'offered'))
             if (e.created_at, e.id) < (entry.created_at, entry.id)]
    return len(ahead) + 1


# ── Apuntarse / borrarse ──────────────────────────────────────────────────

def join(schedule, start_value, user):
    """Apunta a `user` a la lista de espera de la sesión. Devuelve la entrada."""
    from api.models import WaitlistEntry

    cfg = settings_obj()
    if not cfg.enabled:
        raise WaitlistError('waitlist_disabled', 'Este estudio no tiene lista de espera.')
    wall = to_madrid_wall(start_value)
    if wall is None:
        raise WaitlistError('bad_date', 'Fecha de la clase no válida.')
    d = wall.date()
    if not occurs_on(schedule, d):
        raise WaitlistError('no_session', 'Esa clase no tiene sesión ese día.')
    start_wall, _ = slot_bounds(schedule, d)
    if as_instant(start_wall) <= timezone.now():
        raise WaitlistError('past', 'Esa clase ya ha empezado.')
    reason = slot_unavailable_reason(schedule, start_wall)
    if reason:
        raise WaitlistError('unavailable', 'Esa clase no está disponible en esa fecha.')
    if any(b.user_id == user.id for b in bookings_on(schedule.id, d, select=False)):
        raise WaitlistError('already_booked', 'Ya tienes plaza en esta clase.')
    if seats_taken(schedule, d) < schedule.capacity_max:
        raise WaitlistError('has_space', 'Todavía quedan plazas: puedes reservarla directamente.', status=409)
    try:
        with transaction.atomic():
            entry = WaitlistEntry.objects.create(
                schedule=schedule, start_datetime=as_instant(start_wall), user=user,
            )
    except IntegrityError:
        raise WaitlistError('already_waiting', 'Ya estás en la lista de espera de esta clase.')
    logger.info("waitlist.join entry=%s schedule=%s date=%s user=%s", entry.id, schedule.id, d, user.id)
    return entry


def leave(entry, status='left'):
    if entry.status not in ('waiting', 'offered'):
        return entry
    was_offered = entry.status == 'offered'
    entry.status = status
    entry.save(update_fields=['status', 'updated_at'])
    if was_offered:  # su plaza guardada queda libre → a la siguiente persona
        sid, d = entry.schedule_id, wall_date(entry.start_datetime)
        transaction.on_commit(lambda: offer_next(sid, d))
    return entry


# ── Ofrecer plazas libres ─────────────────────────────────────────────────

def claim_url(entry):
    """Enlace del aviso «¡Tienes plaza!»: la página /lista-espera de la web
    (web/src/components/WaitlistClaim.tsx) pide entrar si hace falta y acepta
    la plaza con POST /api/v1/waitlist/claim/ {token}."""
    from api.utils.site import web_url
    return web_url(f"/lista-espera?token={entry.claim_token}")


def offer_next(schedule_id, d):
    """Si la sesión tiene plazas libres, se las ofrece a las primeras de la
    lista. Devuelve las entradas ofrecidas. Nunca lanza."""
    from api.models import RecurringSchedule, WaitlistEntry
    try:
        cfg = settings_obj()
        if not (cfg.enabled and cfg.auto_offer) or d is None:
            return []
        schedule = RecurringSchedule.objects.filter(pk=schedule_id).select_related('class_type').first()
        if not schedule or not occurs_on(schedule, d):
            return []
        start_wall, _ = slot_bounds(schedule, d)
        start = as_instant(start_wall)
        now = timezone.now()
        if start <= now or slot_unavailable_reason(schedule, start_wall):
            return []
        offered = []
        with transaction.atomic():
            RecurringSchedule.objects.select_for_update().filter(pk=schedule.id).first()
            free = schedule.capacity_max - seats_taken(schedule, d)
            if free <= 0:
                return []
            waiting = entries_on(schedule.id, d, ('waiting',))[:free]
            expires = min(now + timedelta(minutes=cfg.claim_minutes), start)
            for e in waiting:
                WaitlistEntry.objects.filter(pk=e.pk).update(
                    status='offered', offered_at=now, offer_expires_at=expires, updated_at=now)
                e.status, e.offered_at, e.offer_expires_at = 'offered', now, expires
                offered.append(e)
        for e in offered:
            transaction.on_commit(lambda e=e, s=schedule: _notify_offer(e, s))
        if offered:
            logger.info("waitlist.offered schedule=%s date=%s entries=%s", schedule.id, d, [e.id for e in offered])
        return offered
    except Exception:
        logger.error("waitlist.offer_failed schedule=%s date=%s", schedule_id, d, exc_info=True)
        return []


def _notify_offer(entry, schedule):
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user
    from api.utils.sms import format_class_date
    user = entry.user
    title = schedule.class_type.title
    cuando = format_class_date(entry.start_datetime)
    limite = to_madrid_wall(entry.offer_expires_at)
    url = claim_url(entry)
    try:
        send_push_to_user(user, title='🎉 ¡Tienes plaza!',
                          body=f'Se ha liberado una plaza en {title} ({cuando}). Acéptala antes de las {limite:%H:%M}.',
                          url=url)
    except Exception:
        logger.warning("waitlist.offer_push_failed entry=%s", entry.id, exc_info=True)
    if user.email:
        send_templated_email(
            to_email=user.email,
            template_id='generic-notice',
            dynamic_data={
                'name': user.first_name or '',
                'headline': '¡Se ha liberado una plaza!',
                'intro_copy': (f'Estabas en la lista de espera de {title} del {cuando} y se ha quedado una plaza libre. '
                               f'Te la guardamos hasta el {limite:%d/%m a las %H:%M}: acéptala antes o pasará a la '
                               'siguiente persona de la lista.'),
                'cta_text': 'Quiero la plaza',
                'cta_url': url,
            },
            subject=f'Tienes plaza en {title}',
        )


def expire_offers(now=None):
    """Ofertas sin contestar a tiempo → «expired» y se ofrece a la siguiente persona."""
    from api.models import WaitlistEntry
    now = now or timezone.now()
    slots = set()
    for e in WaitlistEntry.objects.filter(status='offered', offer_expires_at__lte=now):
        WaitlistEntry.objects.filter(pk=e.pk, status='offered').update(status='expired', updated_at=now)
        slots.add((e.schedule_id, wall_date(e.start_datetime)))
    for sid, d in slots:
        offer_next(sid, d)
    if slots:
        logger.info("waitlist.expired slots=%s", len(slots))
    return len(slots)


# ── Reservar desde la lista (el cliente acepta / el estudio da plaza) ─────

def book_from_entry(entry, charge='credits', force=False, by_admin=None):
    """Crea la reserva de la entrada (aceptar la oferta o «Dar plaza»)."""
    from api.utils.calendar_ops import add_client_to_occurrence
    if entry.status not in ('waiting', 'offered'):
        raise WaitlistError('not_active', 'Esa persona ya no está en la lista de espera.')
    d = wall_date(entry.start_datetime)
    booking = add_client_to_occurrence(
        entry.schedule, d, entry.user, charge=charge, force=force, admin=by_admin,
        source='waitlist',
    )
    entry.refresh_from_db()
    entry.status = 'claimed'
    entry.booking = booking
    entry.save(update_fields=['status', 'booking', 'updated_at'])
    return booking


def claim(token, user):
    from api.models import WaitlistEntry
    entry = WaitlistEntry.objects.filter(claim_token=token).select_related('schedule__class_type', 'user').first()
    if not entry or entry.user_id != user.id:
        raise WaitlistError('not_found', 'No encontramos esa plaza.', status=404)
    if entry.status == 'claimed':
        raise WaitlistError('already_claimed', 'Ya aceptaste esta plaza: la tienes en tus reservas.')
    if entry.status != 'offered':
        raise WaitlistError('not_offered', 'Todavía no hay plaza para ti: te avisaremos si se libera.')
    if not _offer_alive(entry):
        raise WaitlistError('offer_expired', 'Se acabó el plazo para aceptar la plaza y ha pasado a la siguiente persona.')
    try:
        return book_from_entry(entry, charge='credits')
    except WaitlistError as e:
        if e.code == 'insufficient_credits':
            # El texto de calendar_ops es para el estudio («Carla no tiene…»): aquí habla el cliente
            limite = to_madrid_wall(entry.offer_expires_at)
            raise WaitlistError(
                'insufficient_credits',
                f'No te quedan clases en tu bono. Compra uno y vuelve a este enlace antes de las {limite:%H:%M}.',
                offer_expires_at=limite.isoformat(timespec='minutes') if limite else None)
        raise


def mark_claimed_by_booking(booking):
    """El cliente reservó por la web normal una sesión en la que estaba en
    lista de espera: su entrada pasa a «claimed»."""
    from api.models import WaitlistEntry
    if not booking.user_id or not booking.occurrence_id:
        return
    d = wall_date(booking.start_datetime)
    for e in entries_on(booking.occurrence_id, d):
        if e.user_id == booking.user_id:
            WaitlistEntry.objects.filter(pk=e.pk).update(status='claimed', booking=booking, updated_at=timezone.now())


def full_class_payload(schedule, start_value):
    """Lo que devuelve la reserva cuando la clase está llena (para que la web
    ofrezca «Apuntarme a la lista de espera»)."""
    cfg = settings_obj()
    wall = to_madrid_wall(start_value)
    return {
        'code': 'class_full',
        'waitlist': bool(cfg.enabled),
        'schedule_id': schedule.id,
        'start_datetime': wall.isoformat() if wall else None,
    }


def move_entries(old_schedule_id, old_date, new_schedule, new_start_wall):
    """Al mover una sesión, su lista de espera se va con ella."""
    from api.models import WaitlistEntry
    ids = [e.id for e in entries_on(old_schedule_id, old_date)]
    if ids:
        WaitlistEntry.objects.filter(pk__in=ids).update(
            schedule=new_schedule, start_datetime=as_instant(new_start_wall), updated_at=timezone.now())
    return len(ids)


def remove_entries_for(schedule_id, d=None, from_date=None, reason='class_canceled'):
    """La sesión se cancela: su lista de espera se cierra («removed»)."""
    from api.models import WaitlistEntry
    qs = WaitlistEntry.objects.filter(schedule_id=schedule_id, status__in=('waiting', 'offered'))
    ids = []
    for e in qs:
        ed = wall_date(e.start_datetime)
        if (d is not None and ed == d) or (from_date is not None and ed >= from_date):
            ids.append(e.id)
    if ids:
        WaitlistEntry.objects.filter(pk__in=ids).update(status='removed', updated_at=timezone.now())
    return len(ids)

