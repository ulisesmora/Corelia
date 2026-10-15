"""
Operaciones del calendario del panel sobre UNA sesión.

Una «sesión» es una regla (RecurringSchedule) en una fecha: las reglas
semanales generan una sesión por semana y las puntuales (is_recurrent=False)
una sola. Las reservas (Booking) apuntan a la regla + el instante de inicio,
así que una sesión se identifica con (regla, fecha de pared del estudio).

Aquí vive la lógica; las vistas (api/views_calendar.py) solo validan y
responden:
  build_calendar()            sesiones de un rango con ocupación, sin N+1
  move_occurrence()           mover una sesión (día/hora/sala) y avisar
  undo_move()                 deshacer un movimiento
  edit_occurrence()           «solo esta» (sesión puntual nueva) o
                              «esta y las siguientes» (apply_schedule_from)
  apply_schedule_from()       cambio de horario con fecha de efecto (lo usa
                              también POST /v1/recurrences/{id}/apply_from/)
  cancel_occurrence()         cancelar con devolución (bono / dinero / nada)
  reactivate_occurrence()     deshacer la cancelación (sin rehacer reservas)
  add_client_to_occurrence()  apuntar a una clienta desde el panel
  remove_booking()            quitar a una clienta (con o sin devolución)
  set_attendance()            «Ha venido»
  notify_attendees()          mensaje a las apuntadas
"""
import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from api.models import (
    Booking, ClassType, CreditLedgerEntry, CreditWallet, Event, Instructor, RecurringSchedule, Room,
    ScheduleBlackout, Subscription, UserClassPreference, WaitlistEntry,
)
from api.utils.availability import MADRID_TZ, blackouts_overlapping, slot_unavailable_reason, to_madrid_wall
from api.utils.waitlist import (
    WaitlistError, as_instant, bookings_on, entries_on, move_entries, occurs_on, remove_entries_for,
    seats_taken, settings_obj, slot_bounds, wall_date,
)

logger = logging.getLogger(__name__)

# Los errores del calendario usan la misma forma que los de la lista de espera
CalendarError = WaitlistError

MAX_RANGE_DAYS = 62
HIDDEN_KINDS = ('moved',)  # sesiones movidas: se ve la puntual nueva


def wall_now():
    return timezone.now().astimezone(MADRID_TZ).replace(tzinfo=None)


def price_credits(schedule):
    v = schedule.price_credits_override
    if v is None:
        v = schedule.class_type.default_price_credits
    return Decimal(v or 0)


def instructor_of(schedule):
    return schedule.override_instructor or schedule.class_type.instructor


def person_name(p):
    if p is None:
        return ''
    if hasattr(p, 'first_name'):
        full = f"{p.first_name or ''} {p.last_name or ''}".strip()
        return full or (p.email or '').split('@')[0]
    return p.name or (p.email or '')


def _parse_time(v):
    if isinstance(v, time):
        return v
    return datetime.strptime(str(v)[:5], '%H:%M').time()


def _parse_date(v):
    if isinstance(v, date):
        return v
    return datetime.strptime(str(v), '%Y-%m-%d').date()


# ════════════════════════════════════════════════════════════════════════
# 1. Calendario de un rango
# ════════════════════════════════════════════════════════════════════════

def _rules_for_range(start, end, schedule_ids=None):
    qs = RecurringSchedule.objects.filter(is_active=True).filter(
        (Q(is_recurrent=True)
         & (Q(start_date__isnull=True) | Q(start_date__lte=end))
         & (Q(end_date__isnull=True) | Q(end_date__gte=start)))
        | Q(is_recurrent=False, start_date__gte=start, start_date__lte=end)
    ).select_related('class_type__instructor', 'class_type__category', 'room', 'override_instructor')
    if schedule_ids is not None:
        qs = qs.filter(pk__in=list(schedule_ids))
    return list(qs)


def _iter_dates(rule, start, end):
    if not rule.is_recurrent:
        if rule.start_date and start <= rule.start_date <= end:
            yield rule.start_date
        return
    first = max(start, rule.start_date or start)
    last = min(end, rule.end_date or end)
    if rule.weekday is None:
        return
    d = first + timedelta(days=(rule.weekday - first.weekday()) % 7)
    while d <= last:
        yield d
        d += timedelta(days=7)


def _blackout_dict(b, b_start, b_end):
    return {
        'id': b.id, 'kind': b.kind, 'reason': b.reason or '',
        'schedule_id': b.schedule_id,
        'start': b_start.isoformat(timespec='minutes'), 'end': b_end.isoformat(timespec='minutes'),
    }


def occurrence_key(schedule_id, d):
    return f"s{schedule_id}-{d.isoformat()}"


def build_calendar(start, end, schedule_ids=None, include_events=True):
    """Sesiones (y eventos) de [start, end] con ocupación, lista de espera y
    excepciones, en 6 consultas sea cual sea el tamaño del rango."""
    now = wall_now()
    rules = _rules_for_range(start, end, schedule_ids)
    rule_ids = [r.id for r in rules]
    range_start = datetime.combine(start, time.min)
    range_end = datetime.combine(end + timedelta(days=1), time.min)

    # Reservas del rango por (regla, fecha de pared) y estado
    counts = defaultdict(lambda: defaultdict(int))
    if rule_ids:
        lo = as_instant(range_start) - timedelta(days=1)
        hi = as_instant(range_end) + timedelta(days=1)
        for sid, start_dt, st in Booking.objects.filter(
            occurrence_id__in=rule_ids, start_datetime__gte=lo, start_datetime__lt=hi,
            status__in=('reserved', 'attended', 'no_show'),
        ).values_list('occurrence_id', 'start_datetime', 'status'):
            counts[(sid, wall_date(start_dt))][st] += 1
        tnow = timezone.now()
        for sid, start_dt, st, exp in WaitlistEntry.objects.filter(
            schedule_id__in=rule_ids, start_datetime__gte=lo, start_datetime__lt=hi,
            status__in=('waiting', 'offered'),
        ).values_list('schedule_id', 'start_datetime', 'status', 'offer_expires_at'):
            key = (sid, wall_date(start_dt))
            counts[key]['waitlist'] += 1
            if st == 'offered' and exp and exp > tnow:
                counts[key]['offered'] += 1

    blks = blackouts_overlapping(range_start, range_end, schedule_ids=rule_ids if schedule_ids is not None else None)
    global_blks = [(b, bs, be) for b, bs, be in blks if b.schedule_id is None]
    by_rule = defaultdict(list)
    for b, bs, be in blks:
        if b.schedule_id is not None:
            by_rule[b.schedule_id].append((b, bs, be))

    # Días enteros cerrados (vacaciones/festivos del estudio)
    closed_days = {}
    d = start
    while d <= end:
        d0 = datetime.combine(d, time.min)
        d1 = d0 + timedelta(days=1)
        for b, bs, be in global_blks:
            if bs <= d0 and be >= d1:
                closed_days[d.isoformat()] = {'kind': b.kind, 'reason': b.reason or '', 'id': b.id}
                break
        d += timedelta(days=1)

    occurrences = []
    for rule in rules:
        inst = instructor_of(rule)
        for d in _iter_dates(rule, start, end):
            s_wall, e_wall = slot_bounds(rule, d)
            hidden = canceled = False
            blackout = None
            for b, bs, be in by_rule.get(rule.id, ()):
                if bs <= s_wall < be:
                    if b.kind in HIDDEN_KINDS or (b.kind == 'closed' and (b.reason or '').lower().startswith('sesión movida')):
                        hidden = True
                    elif b.kind == 'canceled':
                        canceled = True
                    elif blackout is None:
                        blackout = _blackout_dict(b, bs, be)
            if hidden:
                continue
            if blackout is None:
                for b, bs, be in global_blks:
                    if bs <= s_wall < be:
                        blackout = _blackout_dict(b, bs, be)
                        break
            c = counts.get((rule.id, d), {})
            booked = c.get('reserved', 0) + c.get('attended', 0)
            occurrences.append({
                'id': occurrence_key(rule.id, d),
                'kind': 'class',
                'schedule_id': rule.id,
                'event_id': None,
                'date': d.isoformat(),
                'start': s_wall.isoformat(timespec='minutes'),
                'end': e_wall.isoformat(timespec='minutes'),
                'duration': int((e_wall - s_wall).total_seconds() // 60),
                'title': rule.class_type.title,
                'class_type': {'id': rule.class_type_id, 'title': rule.class_type.title},
                'room': {'id': rule.room_id, 'name': rule.room.name},
                'instructor': {'id': inst.id, 'name': inst.name} if inst else None,
                'capacity': rule.capacity_max,
                'capacity_min': rule.capacity_min,
                'booked': booked,
                'attended': c.get('attended', 0),
                'no_show': c.get('no_show', 0),
                'waitlist': c.get('waitlist', 0),
                'offered': c.get('offered', 0),
                'recurring': bool(rule.is_recurrent),
                'weekday': rule.weekday,
                'series': {'start_date': rule.start_date.isoformat() if rule.start_date else None,
                           'end_date': rule.end_date.isoformat() if rule.end_date else None},
                'canceled': canceled,
                'blackout': blackout,
                'past': e_wall <= now,
                'started': s_wall <= now,
                'price_credits': str(price_credits(rule)),
            })

    if include_events and schedule_ids is None:
        events = Event.objects.filter(
            is_active=True,
            start_datetime__gte=as_instant(range_start) - timedelta(days=1),
            start_datetime__lt=as_instant(range_end) + timedelta(days=1),
        ).select_related('class_type__instructor', 'room', 'override_instructor').annotate(
            n_booked=Count('event_bookings', filter=Q(event_bookings__status__in=('reserved', 'attended'),
                                                      event_bookings__deleted_at__isnull=True)),
            n_attended=Count('event_bookings', filter=Q(event_bookings__status='attended',
                                                        event_bookings__deleted_at__isnull=True)),
        )
        for ev in events:
            s_wall, e_wall = to_madrid_wall(ev.start_datetime), to_madrid_wall(ev.end_datetime)
            if not (range_start <= s_wall < range_end):
                continue
            inst = ev.instructor
            occurrences.append({
                'id': f"e{ev.id}", 'kind': 'event', 'schedule_id': None, 'event_id': ev.id,
                'date': s_wall.date().isoformat(),
                'start': s_wall.isoformat(timespec='minutes'), 'end': e_wall.isoformat(timespec='minutes'),
                'duration': int((e_wall - s_wall).total_seconds() // 60),
                'title': ev.title,
                'class_type': {'id': ev.class_type_id, 'title': ev.class_type.title},
                'room': {'id': ev.room_id, 'name': ev.room.name},
                'instructor': {'id': inst.id, 'name': inst.name} if inst else None,
                'capacity': ev.capacity_max, 'capacity_min': ev.capacity_min,
                'booked': ev.n_booked, 'attended': ev.n_attended, 'no_show': 0,
                'waitlist': 0, 'offered': 0, 'recurring': False, 'weekday': None, 'series': None,
                'canceled': ev.status == 'canceled', 'blackout': None,
                'past': e_wall <= now, 'started': s_wall <= now,
                'price_credits': str(ev.price_credits),
            })

    occurrences.sort(key=lambda o: (o['start'], o['room']['name']))
    return {
        'start': start.isoformat(), 'end': end.isoformat(),
        'now': now.isoformat(timespec='minutes'),
        'occurrences': occurrences,
        'closed_days': closed_days,
        'blackouts': [_blackout_dict(b, bs, be) for b, bs, be in global_blks],
    }


def calendar_catalog():
    """Lo que necesita el panel para filtros, leyenda y formularios."""
    return {
        'rooms': [{'id': r.id, 'name': r.name, 'capacity': r.capacity}
                  for r in Room.objects.order_by('name')],
        'instructors': [{'id': i.id, 'name': i.name} for i in Instructor.objects.order_by('name')],
        'class_types': [
            {'id': c.id, 'title': c.title, 'duration_minutes': c.duration_minutes,
             'instructor_id': c.instructor_id, 'default_price_credits': str(c.default_price_credits),
             'category': c.category.name if c.category_id else ''}
            for c in ClassType.objects.filter(is_active=True).select_related('category').order_by('title')
        ],
        'has_schedule': RecurringSchedule.objects.filter(is_active=True).exists(),
        'waitlist': {'enabled': settings_obj().enabled},
    }


def get_occurrence(schedule, d):
    data = build_calendar(d, d, schedule_ids=[schedule.id], include_events=False)
    for o in data['occurrences']:
        if o['schedule_id'] == schedule.id:
            return o
    return None


def occurrence_detail(schedule, d):
    """Sesión + quién viene (con su bono) + lista de espera."""
    occ = get_occurrence(schedule, d)
    if occ is None:
        raise CalendarError('no_session', 'Esa clase no tiene sesión ese día.', status=404)
    bookings = bookings_on(schedule.id, d, statuses=('reserved', 'attended', 'no_show'))
    user_ids = [b.user_id for b in bookings if b.user_id]
    waiting = entries_on(schedule.id, d)
    user_ids += [e.user_id for e in waiting]
    balances = dict(
        CreditLedgerEntry.objects.filter(wallet__user_id__in=user_ids)
        .values('wallet__user_id').annotate(total=Sum('amount')).values_list('wallet__user_id', 'total')
    )
    plans = {}
    for sub in Subscription.objects.filter(user_id__in=user_ids, status='active').select_related('plan'):
        plans.setdefault(sub.user_id, sub.plan.name)

    def paid_with(b):
        if (b.metadata or {}).get('no_charge'):
            return 'free'
        if b.payment_id and b.payment and b.payment.method == 'stripe':
            return 'card'
        return 'credits' if b.user_id else 'card'

    attendees = []
    for b in bookings:
        p = b.user or b.guest
        attendees.append({
            'booking_id': b.id, 'status': b.status,
            'name': person_name(p), 'email': getattr(p, 'email', '') or '',
            'phone': getattr(p, 'phone', '') or '',
            'user_id': b.user_id, 'guest': bool(b.guest_id),
            'paid_with': paid_with(b),
            'balance': str(balances.get(b.user_id) or 0) if b.user_id else None,
            'plan': plans.get(b.user_id),
            'created_at': b.created_at.isoformat(),
        })
    tnow = timezone.now()
    wl = []
    for i, e in enumerate(waiting):
        wl.append({
            'id': e.id, 'position': i + 1, 'status': e.status,
            'offer_alive': bool(e.status == 'offered' and e.offer_expires_at and e.offer_expires_at > tnow),
            'offer_expires_at': to_madrid_wall(e.offer_expires_at).isoformat(timespec='minutes') if e.offer_expires_at else None,
            'name': person_name(e.user), 'email': e.user.email, 'user_id': e.user_id,
            'balance': str(balances.get(e.user_id) or 0), 'plan': plans.get(e.user_id),
            'created_at': e.created_at.isoformat(),
        })
    return {'occurrence': occ, 'attendees': attendees, 'waitlist': wl,
            'free_seats': max(0, schedule.capacity_max - seats_taken(schedule, d))}


# ════════════════════════════════════════════════════════════════════════
# 2. Mover / editar
# ════════════════════════════════════════════════════════════════════════

def _check_room_free(room_id, new_date, s_wall, e_wall, ignore_schedule_ids=()):
    """Otra sesión en esa sala que se solape (para avisar antes de mover)."""
    data = build_calendar(new_date, new_date, include_events=False)
    for o in data['occurrences']:
        if o['room']['id'] != room_id or o['schedule_id'] in ignore_schedule_ids or o['canceled']:
            continue
        os_, oe = datetime.fromisoformat(o['start']), datetime.fromisoformat(o['end'])
        if os_ < e_wall and oe > s_wall:
            return o
    return None


def _move_bookings(bookings, target_schedule, new_date, new_start, new_end, notify, title):
    """Traslada reservas a la sesión nueva y avisa (email + push)."""
    from api.utils.push import send_schedule_change_push
    from api.utils.reschedule import _notify_change_email
    to_notify = []
    s_wall = datetime.combine(new_date, new_start)
    e_wall = datetime.combine(new_date, new_end)
    if e_wall <= s_wall:
        e_wall += timedelta(days=1)
    for b in bookings:
        old_dt = b.start_datetime
        b.occurrence = target_schedule
        b.start_datetime = as_instant(s_wall)
        b.end_datetime = as_instant(e_wall)
        b.metadata = {**(b.metadata or {}), 'moved_from': str(old_dt), 'moved_reason': 'calendar_move'}
        b.save(update_fields=['occurrence', 'start_datetime', 'end_datetime', 'metadata', 'updated_at'])
        person = b.user or b.guest
        if person and notify:
            to_notify.append((person, old_dt, b.start_datetime))

    def _send():
        for person, old_dt, new_dt in to_notify:
            if hasattr(person, 'push_subscriptions'):
                send_schedule_change_push(person, title, old_dt, new_dt)
            _notify_change_email(person, title, old_dt, new_dt)
    transaction.on_commit(_send)
    return len(to_notify)


def _apply_simple_changes(target, changes):
    """Cambios que no mueven la sesión: profesora, plazas, tipo de clase."""
    if 'instructor' in changes:
        target.override_instructor_id = changes['instructor'] or None
    if 'capacity_max' in changes:
        target.capacity_max = max(1, int(changes['capacity_max']))
    if 'capacity_min' in changes:
        target.capacity_min = max(1, int(changes['capacity_min']))
    if 'class_type' in changes and changes['class_type']:
        target.class_type_id = int(changes['class_type'])


def move_occurrence(schedule, d, new_date=None, new_start=None, new_end=None, new_room_id=None,
                    notify=True, user=None, changes=None, force=False):
    """Mueve UNA sesión (y opcionalmente cambia profesora/plazas solo ese día).

    - Regla semanal: se crea una sesión puntual con los cambios, se cierra el
      hueco original de ese día (blackout «moved») y se trasladan las
      reservas y la lista de espera.
    - Sesión puntual: se edita ella misma.
    Avisa a las apuntadas (email + push) si cambia día, hora o sala."""
    changes = changes or {}
    if not occurs_on(schedule, d):
        raise CalendarError('no_session', 'Esa clase no tiene sesión ese día.', status=404)
    old_s, old_e = slot_bounds(schedule, d)
    orig_room = schedule.room_id
    if old_s <= wall_now():
        raise CalendarError('past', 'Esa clase ya ha empezado: no se puede mover.')
    duration = old_e - old_s
    new_date = new_date or d
    new_start = new_start or schedule.start_time
    if new_end is None:
        new_end = (datetime.combine(new_date, new_start) + duration).time()
    new_room_id = int(new_room_id or schedule.room_id)
    s_wall = datetime.combine(new_date, new_start)
    e_wall = datetime.combine(new_date, new_end)
    if e_wall <= s_wall:
        raise CalendarError('bad_time', 'La hora de fin tiene que ser después de la de inicio.')
    if s_wall <= wall_now():
        raise CalendarError('past_target', 'No se puede mover una clase a una hora que ya ha pasado.')
    if not Room.objects.filter(pk=new_room_id).exists():
        raise CalendarError('bad_room', 'Esa sala no existe.')
    if not force:
        clash = _check_room_free(new_room_id, new_date, s_wall, e_wall, ignore_schedule_ids=(schedule.id,))
        if clash:
            raise CalendarError(
                'room_busy',
                f"{clash['room']['name']} ya tiene {clash['title']} de {clash['start'][11:16]} a {clash['end'][11:16]}.",
                status=409, clash=clash)
    for b, bs, be in blackouts_overlapping(s_wall, e_wall):
        if b.schedule_id is None:
            raise CalendarError('closed', f"Ese día está cerrado ({b.reason or 'cierre del estudio'}).")

    where_changed = (new_date != d or new_start != schedule.start_time or new_room_id != orig_room)
    title = schedule.class_type.title
    bookings = bookings_on(schedule.id, d, statuses=('reserved',))
    with transaction.atomic():
        blackout = None
        if schedule.is_recurrent:
            target = RecurringSchedule(
                class_type_id=schedule.class_type_id, room_id=new_room_id, weekday=None, is_recurrent=False,
                start_time=new_start, end_time=new_end,
                capacity_min=schedule.capacity_min, capacity_max=schedule.capacity_max,
                price_credits_override=schedule.price_credits_override,
                price_eur_override=schedule.price_eur_override,
                override_instructor_id=schedule.override_instructor_id,
                is_active=True, start_date=new_date, end_date=new_date,
            )
            _apply_simple_changes(target, changes)
            target._skip_broadcast = True  # es un traslado, no una clase nueva
            target.save()
            blackout = ScheduleBlackout.objects.create(
                schedule=schedule, start_datetime=as_instant(old_s), end_datetime=as_instant(old_e),
                kind='moved', created_by=user,
                reason=(f'Sesión movida al {new_date:%d/%m} a las {new_start:%H:%M}' if where_changed
                        else 'Sesión cambiada solo ese día'),
            )
        else:
            target = schedule
            target.start_date = target.end_date = new_date
            target.start_time, target.end_time, target.room_id = new_start, new_end, new_room_id
            _apply_simple_changes(target, changes)
            target.save()
        notified = _move_bookings(bookings, target, new_date, new_start, new_end,
                                  notify and where_changed, title) if bookings else 0
        moved_wl = move_entries(schedule.id, d, target, s_wall)
    logger.info(
        "calendar.move schedule=%s date=%s → target=%s %s %s room=%s bookings=%s waitlist=%s admin=%s",
        schedule.id, d, target.id, new_date, new_start, new_room_id, len(bookings), moved_wl,
        getattr(user, 'id', None),
    )
    return {
        'moved': len(bookings), 'notified': notified, 'waitlist_moved': moved_wl,
        'occurrence_id': occurrence_key(target.id, new_date),
        'schedule_id': target.id, 'date': new_date.isoformat(),
        'undo': {
            'schedule': schedule.id, 'date': d.isoformat(), 'target': target.id,
            'target_date': new_date.isoformat(), 'blackout': blackout.id if blackout else None,
            'original': {'start_time': old_s.strftime('%H:%M'), 'end_time': old_e.strftime('%H:%M'),
                         'room': orig_room},
            'notify': bool(notify and where_changed),
        },
    }


def undo_move(undo, user=None):
    """Deshace move_occurrence() con el dict «undo» que devolvió."""
    schedule = RecurringSchedule.all_objects.get(pk=undo['schedule'])
    target = RecurringSchedule.all_objects.get(pk=undo['target'])
    d = _parse_date(undo['date'])
    target_date = _parse_date(undo['target_date'])
    notify = bool(undo.get('notify'))
    title = schedule.class_type.title
    if schedule.id == target.id:
        # Era una sesión puntual: se vuelve a mover a su sitio
        orig = undo.get('original') or {}
        return move_occurrence(
            target, target_date, new_date=d, new_start=_parse_time(orig['start_time']),
            new_end=_parse_time(orig['end_time']), new_room_id=orig.get('room') or target.room_id,
            notify=notify, user=user, force=True)
    old_s, _ = slot_bounds(schedule, d)
    bookings = bookings_on(target.id, target_date, statuses=('reserved',))
    with transaction.atomic():
        if undo.get('blackout'):
            for b in ScheduleBlackout.objects.filter(pk=undo['blackout'], schedule=schedule):
                b.soft_delete()
        notified = _move_bookings(bookings, schedule, d, schedule.start_time, schedule.end_time, notify, title) \
            if bookings else 0
        move_entries(target.id, target_date, schedule, old_s)
        target.soft_delete()
    logger.info("calendar.undo_move schedule=%s date=%s target=%s bookings=%s",
                schedule.id, d, target.id, len(bookings))
    return {'moved': len(bookings), 'notified': notified, 'occurrence_id': occurrence_key(schedule.id, d)}


def apply_schedule_from(schedule, effective_date, changes=None, end_only=False, existing_mode='keep', user=None):
    """Cambio de horario con fecha de efecto: la regla actual sigue hasta la
    víspera y (salvo end_only) se crea una regla nueva desde effective_date.

    existing_mode decide qué pasa con las reservas YA HECHAS desde esa fecha:
    keep (se quedan), move (se trasladan a la hora/sala nueva; mismo día de la
    semana) o cancel (se cancelan devolviendo créditos y avisando).
    Lanza CalendarError si algo no cuadra."""
    changes = dict(changes or {})
    if existing_mode not in ('keep', 'move', 'cancel'):
        raise CalendarError('bad_mode', "existing_bookings debe ser 'keep', 'move' o 'cancel'.")
    if schedule.end_date and schedule.end_date < effective_date:
        raise CalendarError('already_ended', f'La regla ya termina el {schedule.end_date}.')
    new_weekday = changes.get('weekday', schedule.weekday)
    if existing_mode == 'move' and (end_only or new_weekday != schedule.weekday):
        raise CalendarError(
            'cannot_move',
            'Solo se pueden MOVER las reservas si la clase mantiene el mismo día de la semana '
            '(y no estás terminándola). Usa "cancel" o "keep".')
    if 'instructor' in changes and 'override_instructor' not in changes:
        changes['override_instructor'] = changes.pop('instructor')

    try:
        with transaction.atomic():
            schedule.end_date = effective_date - timedelta(days=1)
            schedule.save(update_fields=['end_date', 'updated_at'])
            new_schedule = None
            if not end_only:
                new_schedule = RecurringSchedule(
                    class_type_id=changes.get('class_type', schedule.class_type_id),
                    room_id=changes.get('room', schedule.room_id),
                    weekday=new_weekday,
                    start_time=_parse_time(changes.get('start_time', schedule.start_time)),
                    end_time=_parse_time(changes.get('end_time', schedule.end_time)),
                    capacity_min=changes.get('capacity_min', schedule.capacity_min),
                    capacity_max=changes.get('capacity_max', schedule.capacity_max),
                    price_credits_override=changes.get('price_credits_override', schedule.price_credits_override),
                    price_eur_override=changes.get('price_eur_override', schedule.price_eur_override),
                    override_instructor_id=changes.get('override_instructor', schedule.override_instructor_id),
                    is_recurrent=schedule.is_recurrent,
                    is_active=True,
                    start_date=effective_date,
                    end_date=None,
                )
                # Continuación de una clase existente: sin email masivo de «clase nueva»
                new_schedule._skip_broadcast = True
                new_schedule.save()
                UserClassPreference.objects.filter(
                    schedule=schedule, is_active=True, deleted_at__isnull=True,
                ).update(schedule=new_schedule)
    except IntegrityError:
        raise CalendarError(
            'duplicate_rule',
            'Ya existe otra clase semanal en esa sala, ese día y a esa hora.')

    moved = cancelled = refunded = 0
    from api.utils.reschedule import cancel_future_bookings, move_bookings_to
    if existing_mode == 'move' and new_schedule:
        moved = move_bookings_to(schedule, new_schedule, new_schedule.start_time, new_schedule.end_time,
                                 from_date=effective_date)
    elif existing_mode == 'cancel':
        cancelled, refunded = cancel_future_bookings(
            schedule, effective_date, reason='Cambio de horario' if not end_only else 'Clase finalizada')
    if end_only:
        from api.utils.replacement import retire_schedule_preferences
        retire_schedule_preferences(schedule, f'termina el {effective_date:%d/%m/%Y}')
    if new_schedule is not None and existing_mode in ('move', 'keep'):
        # La lista de espera desde esa fecha va con la regla nueva si se mantiene la hora
        if existing_mode == 'move':
            for e in WaitlistEntry.objects.filter(schedule=schedule, status__in=('waiting', 'offered')):
                ed = wall_date(e.start_datetime)
                if ed and ed >= effective_date:
                    s_wall, _ = slot_bounds(new_schedule, ed)
                    WaitlistEntry.objects.filter(pk=e.pk).update(schedule=new_schedule, start_datetime=as_instant(s_wall))
    elif existing_mode == 'cancel' or end_only:
        remove_entries_for(schedule.id, from_date=effective_date)

    logger.info(
        "schedule.apply_from schedule_id=%s effective=%s end_only=%s new_id=%s existing=%s moved=%s "
        "cancelled=%s admin_id=%s", schedule.id, effective_date, end_only,
        new_schedule.id if new_schedule else None, existing_mode, moved, cancelled, getattr(user, 'id', None),
    )
    return {'old_schedule': schedule, 'new_schedule': new_schedule,
            'bookings_moved': moved, 'bookings_cancelled': cancelled, 'bookings_refunded': refunded}


def edit_occurrence(schedule, d, scope, changes, notify=True, existing_mode='move', user=None, force=False):
    """«Editar» desde la ficha de la clase.

    scope='this'      → solo esa sesión (move_occurrence con los cambios).
    scope='following' → esa y las siguientes (apply_schedule_from desde d)."""
    changes = dict(changes or {})
    new_date = _parse_date(changes['date']) if changes.get('date') else None
    new_start = _parse_time(changes['start_time']) if changes.get('start_time') else None
    new_end = _parse_time(changes['end_time']) if changes.get('end_time') else None
    new_room = changes.get('room')
    simple = {k: changes[k] for k in ('instructor', 'capacity_max', 'capacity_min', 'class_type') if k in changes}

    if scope == 'this' or not schedule.is_recurrent:
        return {'scope': 'this', **move_occurrence(
            schedule, d, new_date=new_date, new_start=new_start, new_end=new_end, new_room_id=new_room,
            notify=notify, user=user, changes=simple, force=force)}

    if scope != 'following':
        raise CalendarError('bad_scope', "scope debe ser 'this' o 'following'.")
    if not occurs_on(schedule, d):
        raise CalendarError('no_session', 'Esa clase no tiene sesión ese día.', status=404)
    if slot_bounds(schedule, d)[0] <= wall_now():
        raise CalendarError('past', 'Esa clase ya ha empezado: cambia desde la próxima.')
    af = {}
    if new_date and new_date.weekday() != schedule.weekday:
        af['weekday'] = new_date.weekday()
    if new_start and new_start != schedule.start_time:
        af['start_time'] = new_start
        if not new_end:
            dur = datetime.combine(d, schedule.end_time) - datetime.combine(d, schedule.start_time)
            af['end_time'] = (datetime.combine(d, new_start) + dur).time()
    if new_end and new_end != schedule.end_time:
        af['end_time'] = new_end
    if new_room and int(new_room) != schedule.room_id:
        af['room'] = int(new_room)
    if 'instructor' in simple:
        af['override_instructor'] = simple['instructor'] or None
    for k in ('capacity_max', 'capacity_min', 'class_type'):
        if k in simple:
            af[k] = int(simple[k])
    if not af:
        raise CalendarError('nothing', 'No has cambiado nada.')
    if existing_mode == 'move' and 'weekday' in af:
        existing_mode = 'cancel' if not force else 'keep'
    timing = any(k in af for k in ('weekday', 'start_time', 'end_time', 'room'))
    res = apply_schedule_from(schedule, d, af, end_only=False,
                              existing_mode=existing_mode if timing else 'keep', user=user)
    old, new = res['old_schedule'], res['new_schedule']
    if not timing:
        # Solo cambia la profesora, las plazas o el tipo: misma hora y sala, así
        # que las reservas y la lista de espera pasan a la regla nueva sin avisar.
        ids = [b.id for b in Booking.objects.filter(occurrence=old, status__in=('reserved', 'attended', 'pending'))
               if (wall_date(b.start_datetime) or d) >= d]
        Booking.objects.filter(pk__in=ids).update(occurrence=new)
        wl = [e.id for e in WaitlistEntry.objects.filter(schedule=old, status__in=('waiting', 'offered'))
              if (wall_date(e.start_datetime) or d) >= d]
        WaitlistEntry.objects.filter(pk__in=wl).update(schedule=new)
        res['bookings_moved'] = len(ids)
    # Si era la primera sesión de la regla, la regla vieja se queda vacía: fuera
    if old.start_date and old.end_date and old.end_date < old.start_date \
            and not Booking.objects.filter(occurrence=old).exists():
        old.soft_delete()
    first = d if not af.get('weekday') else d + timedelta(days=(af['weekday'] - d.weekday()) % 7)
    return {'scope': 'following', 'schedule_id': new.id, 'occurrence_id': occurrence_key(new.id, first),
            'bookings_moved': res['bookings_moved'], 'bookings_cancelled': res['bookings_cancelled'],
            'bookings_refunded': res['bookings_refunded']}


# ════════════════════════════════════════════════════════════════════════
# 3. Cancelar / reactivar
# ════════════════════════════════════════════════════════════════════════

REFUND_POLICIES = ('credits', 'money', 'none')


def _refund_credits(booking, schedule, reason):
    credits = price_credits(schedule)
    if not booking.user_id or credits <= 0:
        return False
    wallet, _ = CreditWallet.objects.get_or_create(user_id=booking.user_id)
    CreditLedgerEntry.objects.create(
        wallet=wallet, kind='refund', amount=credits,
        reference=f'calendar_cancel_{schedule.id}_{booking.id}',
        metadata={'booking_id': booking.id, 'reason': reason},
    )
    return True


def _cancel_bookings(bookings, schedule, refund, reason, extra_meta=None):
    """Cancela reservas aplicando la política de devolución. Devuelve
    (canceladas, con créditos, con dinero, personas). El dinero (Stripe) se
    devuelve DESPUÉS de la transacción."""
    from api.utils.guest_refund import refund_guest_booking_stripe
    card_queue, people = [], []
    n_credits = 0
    with transaction.atomic():
        for b in bookings:
            b = Booking.objects.select_for_update(of=('self',)).select_related('payment', 'user', 'guest').get(pk=b.pk)
            if b.status not in ('reserved', 'pending'):
                continue
            how = None
            if refund != 'none' and not (b.metadata or {}).get('no_charge'):
                by_card = bool(b.payment_id and b.payment and b.payment.method == 'stripe'
                               and b.payment.stripe_payment_intent_id)
                if b.guest_id or (refund == 'money' and by_card):
                    card_queue.append(b)
                    how = 'card'
                elif _refund_credits(b, schedule, reason):
                    n_credits += 1
                    how = 'credits'
            b.status = 'canceled'
            b.metadata = {**(b.metadata or {}), 'canceled_by': 'studio', 'refund': how or 'none',
                          'cancel_reason': reason, **(extra_meta or {})}
            b.save(update_fields=['status', 'metadata', 'updated_at'])
            person = b.user or b.guest
            if person:
                people.append((person, b.start_datetime, how))
    n_card = 0
    for b in card_queue:
        if refund_guest_booking_stripe(b, reason=reason, any_owner=True):
            n_card += 1
    return len(people), n_credits, n_card, people


def _notify_cancel(people, title, message=''):
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user
    from api.utils.sms import format_class_date, send_whatsapp_cancellation
    from api.utils.site import web_url
    lines = {
        'credits': 'Te hemos devuelto la clase a tu bono para que reserves otra.',
        'card': 'Te devolvemos el importe a tu tarjeta (tarda unos días en verse en tu banco).',
        None: '',
    }
    sent = 0
    for person, start_dt, how in people:
        extra = (' ' + message.strip()) if message and message.strip() else ''
        refund_line = lines.get(how, '')
        if getattr(person, 'email', None):
            send_templated_email(
                to_email=person.email, template_id='generic-notice',
                dynamic_data={
                    'name': getattr(person, 'first_name', None) or getattr(person, 'name', '') or '',
                    'headline': 'Clase cancelada',
                    'intro_copy': (f'La clase de {title} del {format_class_date(start_dt)} se ha cancelado.'
                                   f'{extra} {refund_line}').strip(),
                    'cta_text': 'Reservar otra clase', 'cta_url': web_url('/calendar'),
                },
                subject='Tu clase se ha cancelado',
            )
            sent += 1
        if hasattr(person, 'push_subscriptions'):
            wall = to_madrid_wall(start_dt)
            send_push_to_user(person, title='❌ Clase cancelada',
                              body=f'{title} del {wall:%d/%m a las %H:%M} se ha cancelado. {refund_line}'.strip(),
                              url='/dashboard')
        if how == 'credits':
            try:
                send_whatsapp_cancellation(person, title, start_dt)
            except Exception:
                logger.warning("calendar.cancel.whatsapp_failed pk=%s", person.pk, exc_info=True)
    return sent


def cancel_occurrence(schedule, d, scope='this', refund='credits', notify=True, reason='', message='', user=None):
    if refund not in REFUND_POLICIES:
        raise CalendarError('bad_refund', "refund debe ser 'credits', 'money' o 'none'.")
    if not occurs_on(schedule, d):
        raise CalendarError('no_session', 'Esa clase no tiene sesión ese día.', status=404)
    title = schedule.class_type.title
    reason = reason or 'Clase cancelada por el estudio'
    if scope == 'following' and schedule.is_recurrent:
        if slot_bounds(schedule, d)[0] <= wall_now():
            raise CalendarError('past', 'Esa clase ya ha empezado: cancela desde la próxima.')
        apply_schedule_from(schedule, d, end_only=True, existing_mode='keep', user=user)
        future = [b for b in Booking.objects.filter(occurrence=schedule, status='reserved')
                  .select_related('user', 'guest', 'payment')
                  if (wall_date(b.start_datetime) or d) >= d]
        n, n_credits, n_card, people = _cancel_bookings(future, schedule, refund, reason)
        remove_entries_for(schedule.id, from_date=d)
        blackout_id = None
    else:
        s_wall, e_wall = slot_bounds(schedule, d)
        with transaction.atomic():
            blackout = ScheduleBlackout.objects.create(
                schedule=schedule, start_datetime=as_instant(s_wall), end_datetime=as_instant(e_wall),
                kind='canceled', reason=reason[:200], created_by=user,
            )
            n, n_credits, n_card, people = _cancel_bookings(
                bookings_on(schedule.id, d, statuses=('reserved', 'pending')), schedule, refund, reason,
                extra_meta={'cancel_blackout': blackout.id, 'cancel_notified': bool(notify)})
            remove_entries_for(schedule.id, d=d)
        blackout_id = blackout.id
    notified = 0
    if notify and people:
        notified = _notify_cancel(people, title, message)
    logger.info("calendar.cancel schedule=%s date=%s scope=%s refund=%s cancelled=%s credits=%s card=%s admin=%s",
                schedule.id, d, scope, refund, n, n_credits, n_card, getattr(user, 'id', None))
    return {'cancelled': n, 'refunded_credits': n_credits, 'refunded_card': n_card,
            'notified': notified, 'blackout_id': blackout_id, 'scope': scope}


def reactivate_occurrence(schedule, d, user=None, restore_bookings=False):
    """Deshace la cancelación de UNA sesión: vuelve a estar en la web.

    restore_bookings=True («Deshacer» justo después de cancelar): las reservas
    que anuló esa cancelación vuelven a estar activas — se anula la devolución
    de créditos que se hizo y, si se les avisó, reciben «la clase sigue en
    pie». Las reembolsadas a tarjeta no se pueden recuperar (se informa)."""
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user
    from api.utils.sms import format_class_date
    from api.utils.site import web_url
    s_wall, e_wall = slot_bounds(schedule, d)
    blackout_ids = []
    for b, bs, be in blackouts_overlapping(s_wall, e_wall, schedule_ids=[schedule.id]):
        if b.schedule_id == schedule.id and b.kind == 'canceled' and bs <= s_wall < be:
            blackout_ids.append(b.id)
    if not blackout_ids:
        raise CalendarError('not_canceled', 'Esa clase no está cancelada.')
    restored, not_restored, to_notify = 0, 0, []
    with transaction.atomic():
        for b in ScheduleBlackout.objects.filter(pk__in=blackout_ids):
            b.soft_delete()
        if restore_bookings:
            for bk in bookings_on(schedule.id, d, statuses=('canceled',)):
                meta = bk.metadata or {}
                if meta.get('cancel_blackout') not in blackout_ids:
                    continue
                if meta.get('refund') == 'card':
                    not_restored += 1
                    continue
                if meta.get('refund') == 'credits':
                    for e in CreditLedgerEntry.objects.filter(reference=f'calendar_cancel_{schedule.id}_{bk.id}', kind='refund'):
                        e.soft_delete()
                bk.status = 'reserved'
                bk.metadata = {k: v for k, v in meta.items()
                               if k not in ('canceled_by', 'refund', 'cancel_reason', 'cancel_blackout', 'cancel_notified')}
                bk.save(update_fields=['status', 'metadata', 'updated_at'])
                restored += 1
                person = bk.user or bk.guest
                if person and meta.get('cancel_notified'):
                    to_notify.append((person, bk.start_datetime))
            # La lista de espera que se cerró con la cancelación vuelve a esperar
            for e in entries_on(schedule.id, d, statuses=('removed',)):
                if e.updated_at >= timezone.now() - timedelta(hours=24):
                    WaitlistEntry.objects.filter(pk=e.pk).update(status='waiting', offered_at=None, offer_expires_at=None)

    title = schedule.class_type.title

    def _send():
        for person, start_dt in to_notify:
            if getattr(person, 'email', None):
                send_templated_email(
                    to_email=person.email, template_id='generic-notice',
                    dynamic_data={
                        'name': getattr(person, 'first_name', None) or getattr(person, 'name', '') or '',
                        'headline': '¡Tu clase sigue en pie!',
                        'intro_copy': (f'Perdona el lío: la clase de {title} del {format_class_date(start_dt)} '
                                       'NO se cancela. Conservas tu plaza, no tienes que hacer nada.'),
                        'cta_text': 'Ver mis reservas', 'cta_url': web_url('/dashboard'),
                    },
                    subject=f'Tu clase de {title} sigue en pie',
                )
            if hasattr(person, 'push_subscriptions'):
                send_push_to_user(person, title='✅ Tu clase sigue en pie',
                                  body=f'{title}: no se cancela. Conservas tu plaza.', url='/dashboard')
    if to_notify:
        transaction.on_commit(_send)
    logger.info("calendar.reactivate schedule=%s date=%s restored=%s not_restored=%s admin=%s",
                schedule.id, d, restored, not_restored, getattr(user, 'id', None))
    return {'reactivated': True, 'restored': restored, 'not_restored': not_restored}


# ════════════════════════════════════════════════════════════════════════
# 4. Personas: apuntar, quitar, «Ha venido», avisar
# ════════════════════════════════════════════════════════════════════════

def add_client_to_occurrence(schedule, d, client, charge='credits', force=False, notify=True, admin=None,
                             source='calendar'):
    """Apunta a una clienta (User) a la sesión.
    charge='credits' descuenta la clase de su bono; 'free' la apunta sin coste.
    force=True permite pasarse del aforo. Lanza CalendarError."""
    if charge not in ('credits', 'free'):
        raise CalendarError('bad_charge', "charge debe ser 'credits' o 'free'.")
    if not occurs_on(schedule, d):
        raise CalendarError('no_session', 'Esa clase no tiene sesión ese día.', status=404)
    s_wall, e_wall = slot_bounds(schedule, d)
    if slot_unavailable_reason(schedule, s_wall) == 'blocked' and not force:
        raise CalendarError('unavailable', 'Esa clase está cerrada o cancelada ese día.')
    price = price_credits(schedule)
    with transaction.atomic():
        RecurringSchedule.objects.select_for_update().filter(pk=schedule.id).first()
        if any(b.user_id == client.id for b in bookings_on(schedule.id, d, select=False)):
            raise CalendarError('already_booked', f'{person_name(client)} ya está apuntada a esta clase.')
        if not force and seats_taken(schedule, d, exclude_user_id=client.id) >= schedule.capacity_max:
            raise CalendarError('full', 'La clase está llena.', status=409)
        wallet = None
        if charge == 'credits' and price > 0:
            wallet, _ = CreditWallet.objects.get_or_create(user=client)
            wallet = CreditWallet.objects.select_for_update().get(pk=wallet.pk)
            balance = wallet.entries.aggregate(t=Sum('amount'))['t'] or 0
            if balance < price:
                raise CalendarError('insufficient_credits',
                                    f'{person_name(client)} no tiene clases en su bono (le quedan {balance}).',
                                    balance=str(balance), price=str(price))
        meta = {'source': source}
        if admin is not None:
            meta['added_by'] = admin.id
        if charge == 'free' or price <= 0:
            meta['no_charge'] = True
        booking = Booking.objects.create(
            user=client, occurrence=schedule, start_datetime=as_instant(s_wall), end_datetime=as_instant(e_wall),
            status='reserved', metadata=meta,
        )
        if wallet is not None:
            # El aviso de «clase reservada» con el saldo lo manda la señal del ledger
            CreditLedgerEntry.objects.create(
                wallet=wallet, kind='spend', amount=-price, reference='Reserva de clases',
                metadata={'booking_ids': [booking.id], 'source': source},
            )
    if notify and wallet is None:
        from api.utils.booking_notify import notify_booking_confirmation
        transaction.on_commit(lambda: notify_booking_confirmation([booking], send_email=True))
    elif notify:
        from api.utils.booking_notify import notify_booking_confirmation
        transaction.on_commit(lambda: notify_booking_confirmation([booking], send_email=False))
    logger.info("calendar.add_client schedule=%s date=%s user=%s charge=%s booking=%s admin=%s",
                schedule.id, d, client.id, charge, booking.id, getattr(admin, 'id', None))
    return booking


def remove_booking(booking, refund='credits', notify=False, user=None):
    """Quita a una persona de la clase (también «deshacer» de Añadir)."""
    schedule = booking.occurrence
    if schedule is None:
        raise CalendarError('not_class', 'Esa reserva no es de una clase del horario.')
    if booking.status not in ('reserved', 'attended', 'no_show', 'pending'):
        raise CalendarError('not_active', 'Esa reserva ya no está activa.')
    if booking.status in ('attended', 'no_show'):
        Booking.objects.filter(pk=booking.pk).update(status='reserved')
        booking.refresh_from_db()
    n, n_credits, n_card, people = _cancel_bookings([booking], schedule, refund, 'Quitada por el estudio')
    if notify and people:
        _notify_cancel(people, schedule.class_type.title)
    return {'removed': n, 'refunded_credits': n_credits, 'refunded_card': n_card}


def set_attendance(booking, attended=True, no_show=False):
    if booking.status not in ('reserved', 'attended', 'no_show'):
        raise CalendarError('not_active', 'Esa reserva ya no está activa.')
    booking.status = 'no_show' if no_show else ('attended' if attended else 'reserved')
    booking.save(update_fields=['status', 'updated_at'])
    return booking


def notify_attendees(schedule, d, message, subject='', push=True, email=True):
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user
    from api.utils.sms import format_class_date
    from api.utils.site import web_url
    message = (message or '').strip()
    if not message:
        raise CalendarError('empty', 'Escribe el mensaje.')
    title = schedule.class_type.title
    s_wall, _ = slot_bounds(schedule, d)
    cuando = format_class_date(as_instant(s_wall))
    n_email = n_push = 0
    seen = set()
    for b in bookings_on(schedule.id, d, statuses=('reserved', 'attended')):
        person = b.user or b.guest
        key = ('u' if b.user_id else 'g', getattr(person, 'pk', None))
        if not person or key in seen:
            continue
        seen.add(key)
        if email and getattr(person, 'email', None):
            if send_templated_email(
                to_email=person.email, template_id='generic-notice',
                dynamic_data={'name': getattr(person, 'first_name', None) or getattr(person, 'name', '') or '',
                              'headline': subject or f'Sobre tu clase de {title}',
                              'intro_copy': f'{message}\n\n({title}, {cuando})',
                              'cta_text': 'Ver mis reservas', 'cta_url': web_url('/dashboard')},
                subject=subject or f'Aviso sobre tu clase de {title}',
            ):
                n_email += 1
        if push and hasattr(person, 'push_subscriptions'):
            if send_push_to_user(person, title=f'📣 {title} · {s_wall:%d/%m %H:%M}', body=message[:180],
                                 url='/dashboard'):
                n_push += 1
    logger.info("calendar.notify schedule=%s date=%s people=%s email=%s push=%s",
                schedule.id, d, len(seen), n_email, n_push)
    return {'people': len(seen), 'emails': n_email, 'pushes': n_push}
