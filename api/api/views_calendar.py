"""
Calendario del panel (crm/src/pages/CalendarPage.tsx) y lista de espera.

Panel (solo administradoras):
  GET  /api/v1/calendar/?start=YYYY-MM-DD&end=YYYY-MM-DD[&catalog=1]
  GET  /api/v1/calendar/occurrence/?schedule=ID&date=YYYY-MM-DD
  POST /api/v1/calendar/occurrence/move/         {schedule, date, new_date?, new_start, new_end?, new_room?, notify?, force?}
  POST /api/v1/calendar/occurrence/undo-move/    {undo}
  POST /api/v1/calendar/occurrence/edit/         {schedule, date, scope: this|following, changes, notify?, existing_bookings?}
  POST /api/v1/calendar/occurrence/cancel/       {schedule, date, scope?, refund: credits|money|none, notify?, message?}
  POST /api/v1/calendar/occurrence/reactivate/   {schedule, date, restore_bookings?}
  POST /api/v1/calendar/occurrence/add-client/   {schedule, date, user, charge: credits|free, force?, notify?}
  POST /api/v1/calendar/occurrence/notify/       {schedule, date, message, subject?}
  POST /api/v1/calendar/bookings/<id>/check-in/  {attended: bool, no_show?: bool}
  POST /api/v1/calendar/bookings/<id>/remove/    {refund: credits|money|none, notify?}
  POST /api/v1/waitlist/<id>/promote/            {charge: credits|free, force?}   («Dar plaza»)
  POST /api/v1/waitlist/<id>/remove/
  GET/PATCH /api/v1/waitlist/settings/           (GET es público: {enabled})

Web (clientas con sesión):
  GET  /api/v1/waitlist/                          mis entradas activas
  POST /api/v1/waitlist/                          {schedule_id, start_datetime}  → apuntarme
  POST /api/v1/waitlist/<id>/leave/               borrarme
  POST /api/v1/waitlist/claim/                    {token}  → aceptar la plaza ofrecida
"""
import logging
import uuid
from datetime import datetime

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import Booking, RecurringSchedule, WaitlistEntry, WaitlistSettings
from api.utils import calendar_ops as ops
from api.utils import waitlist as wl
from api.utils.availability import to_madrid_wall

logger = logging.getLogger(__name__)
User = get_user_model()


def _err(e):
    return Response(e.payload(), status=e.status)


def _bad(msg, code='bad_request'):
    return Response({'error': msg, 'code': code}, status=status.HTTP_400_BAD_REQUEST)


def _truthy(v, default=True):
    if v is None:
        return default
    return str(v).lower() in ('1', 'true', 'yes', 'on')


def _date(v):
    try:
        return datetime.strptime(str(v), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def _time(v):
    if v in (None, ''):
        return None
    try:
        return datetime.strptime(str(v)[:5], '%H:%M').time()
    except (TypeError, ValueError):
        raise ops.CalendarError('bad_time', 'Hora no válida (HH:MM).')


def _session(data):
    """(regla, fecha) de la petición o una Response de error."""
    d = _date(data.get('date'))
    if d is None:
        return None, None, _bad('date requerida (YYYY-MM-DD).')
    try:
        sid = int(data.get('schedule'))
    except (TypeError, ValueError):
        return None, None, _bad('schedule requerido.')
    schedule = RecurringSchedule.objects.select_related('class_type', 'room').filter(pk=sid).first()
    if schedule is None:
        return None, None, Response({'error': 'Esa clase no existe.', 'code': 'not_found'},
                                    status=status.HTTP_404_NOT_FOUND)
    return schedule, d, None


class CalendarRangeView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        start = _date(request.query_params.get('start'))
        end = _date(request.query_params.get('end'))
        if not start or not end or end < start:
            return _bad('start y end requeridos (YYYY-MM-DD), con end >= start.')
        if (end - start).days > ops.MAX_RANGE_DAYS:
            return _bad(f'Como mucho {ops.MAX_RANGE_DAYS} días por consulta.')
        data = ops.build_calendar(start, end)
        if _truthy(request.query_params.get('catalog'), default=False):
            data['catalog'] = ops.calendar_catalog()
        return Response(data)


class CalendarOccurrenceView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        schedule, d, error = _session(request.query_params)
        if error:
            return error
        try:
            return Response(ops.occurrence_detail(schedule, d))
        except ops.CalendarError as e:
            return _err(e)


class _SessionAction(APIView):
    """POST con {schedule, date, …} sobre una sesión."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        schedule, d, error = _session(request.data)
        if error:
            return error
        try:
            return Response(self.run(request, schedule, d, request.data))
        except ops.CalendarError as e:
            return _err(e)

    def run(self, request, schedule, d, data):  # pragma: no cover - abstracto
        raise NotImplementedError


class CalendarMoveView(_SessionAction):
    def run(self, request, schedule, d, data):
        new_date = _date(data.get('new_date')) if data.get('new_date') else None
        if data.get('new_date') and new_date is None:
            raise ops.CalendarError('bad_date', 'new_date no válida (YYYY-MM-DD).')
        return ops.move_occurrence(
            schedule, d, new_date=new_date, new_start=_time(data.get('new_start')),
            new_end=_time(data.get('new_end')), new_room_id=data.get('new_room') or None,
            notify=_truthy(data.get('notify')), user=request.user, force=_truthy(data.get('force'), False),
        )


class CalendarUndoMoveView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        undo = request.data.get('undo')
        if not isinstance(undo, dict) or not undo.get('schedule') or not undo.get('target'):
            return _bad('undo requerido (lo que devolvió «mover»).')
        try:
            return Response(ops.undo_move(undo, user=request.user))
        except ops.CalendarError as e:
            return _err(e)
        except (RecurringSchedule.DoesNotExist, KeyError, ValueError):
            return _bad('No se puede deshacer ese cambio.')


class CalendarEditView(_SessionAction):
    def run(self, request, schedule, d, data):
        changes = data.get('changes') or {}
        if not isinstance(changes, dict):
            raise ops.CalendarError('bad_changes', 'changes debe ser un objeto.')
        return ops.edit_occurrence(
            schedule, d, scope=data.get('scope') or 'this', changes=changes,
            notify=_truthy(data.get('notify')), existing_mode=data.get('existing_bookings') or 'move',
            user=request.user, force=_truthy(data.get('force'), False),
        )


class CalendarCancelView(_SessionAction):
    def run(self, request, schedule, d, data):
        return ops.cancel_occurrence(
            schedule, d, scope=data.get('scope') or 'this', refund=data.get('refund') or 'credits',
            notify=_truthy(data.get('notify')), reason=str(data.get('reason') or ''),
            message=str(data.get('message') or ''), user=request.user,
        )


class CalendarReactivateView(_SessionAction):
    def run(self, request, schedule, d, data):
        return ops.reactivate_occurrence(schedule, d, user=request.user,
                                         restore_bookings=_truthy(data.get('restore_bookings'), False))


class CalendarAddClientView(_SessionAction):
    def run(self, request, schedule, d, data):
        client = User.objects.filter(pk=data.get('user')).first() if str(data.get('user') or '').isdigit() else None
        if client is None:
            raise ops.CalendarError('bad_user', 'Elige una clienta.')
        booking = ops.add_client_to_occurrence(
            schedule, d, client, charge=data.get('charge') or 'credits', force=_truthy(data.get('force'), False),
            notify=_truthy(data.get('notify')), admin=request.user,
        )
        return {'booking_id': booking.id, 'status': booking.status}


class CalendarNotifyView(_SessionAction):
    def run(self, request, schedule, d, data):
        return ops.notify_attendees(schedule, d, data.get('message') or '', subject=str(data.get('subject') or ''),
                                    push=_truthy(data.get('push')), email=_truthy(data.get('email')))


class CalendarBookingCheckInView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)
        try:
            b = ops.set_attendance(booking, attended=_truthy(request.data.get('attended')),
                                   no_show=_truthy(request.data.get('no_show'), False))
        except ops.CalendarError as e:
            return _err(e)
        return Response({'booking_id': b.id, 'status': b.status})


class CalendarBookingRemoveView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        booking = get_object_or_404(Booking.objects.select_related('occurrence__class_type', 'user', 'guest', 'payment'),
                                    pk=pk)
        refund = request.data.get('refund') or 'credits'
        if refund not in ops.REFUND_POLICIES:
            return _bad("refund debe ser 'credits', 'money' o 'none'.")
        try:
            return Response(ops.remove_booking(booking, refund=refund,
                                               notify=_truthy(request.data.get('notify'), False),
                                               user=request.user))
        except ops.CalendarError as e:
            return _err(e)


# ── Lista de espera ───────────────────────────────────────────────────────

def _entry_json(e, position=None):
    s = e.schedule
    wall = to_madrid_wall(e.start_datetime)
    return {
        'id': e.id, 'status': e.status, 'position': position,
        'schedule_id': e.schedule_id, 'class_title': s.class_type.title if s else '',
        'start_datetime': wall.isoformat(timespec='minutes') if wall else None,
        'offer_expires_at': (to_madrid_wall(e.offer_expires_at).isoformat(timespec='minutes')
                             if e.offer_expires_at else None),
        'claim_token': str(e.claim_token) if e.status == 'offered' else None,
    }


class WaitlistView(APIView):
    """La clienta: ver sus listas de espera y apuntarse a una."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = WaitlistEntry.objects.filter(user=request.user, status__in=WaitlistEntry.ACTIVE) \
            .select_related('schedule__class_type').order_by('start_datetime')
        return Response([_entry_json(e, wl.position_of(e)) for e in qs])

    def post(self, request):
        try:
            sid = int(request.data.get('schedule_id') or request.data.get('id_source'))
        except (TypeError, ValueError):
            return _bad('schedule_id requerido.')
        schedule = RecurringSchedule.objects.select_related('class_type').filter(pk=sid).first()
        if schedule is None:
            return Response({'error': 'Esa clase no existe.', 'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        start = request.data.get('start_datetime') or request.data.get('sessionDate')
        try:
            entry = wl.join(schedule, start, request.user)
        except wl.WaitlistError as e:
            return _err(e)
        return Response(_entry_json(entry, wl.position_of(entry)), status=status.HTTP_201_CREATED)


class WaitlistLeaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        entry = get_object_or_404(WaitlistEntry, pk=pk, user=request.user)
        wl.leave(entry, status='left')
        return Response({'id': entry.id, 'status': entry.status})


class WaitlistClaimView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('token') or '').strip()
        try:
            token = uuid.UUID(token)
        except ValueError:
            return Response({'error': 'No encontramos esa plaza.', 'code': 'not_found'},
                            status=status.HTTP_404_NOT_FOUND)
        try:
            booking = wl.claim(token, request.user)
        except wl.WaitlistError as e:
            return _err(e)
        return Response({'booking_id': booking.id, 'status': booking.status}, status=status.HTTP_201_CREATED)


class WaitlistPromoteView(APIView):
    """«Dar plaza» desde el calendario del panel."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        entry = get_object_or_404(WaitlistEntry.objects.select_related('schedule__class_type', 'user'), pk=pk)
        try:
            booking = wl.book_from_entry(entry, charge=request.data.get('charge') or 'credits',
                                         force=_truthy(request.data.get('force'), False), by_admin=request.user)
        except wl.WaitlistError as e:
            return _err(e)
        return Response({'booking_id': booking.id, 'status': booking.status, 'entry': entry.id})


class WaitlistRemoveView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        entry = get_object_or_404(WaitlistEntry, pk=pk)
        wl.leave(entry, status='removed')
        return Response({'id': entry.id, 'status': entry.status})


class WaitlistSettingsView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAdminUser()]

    def get(self, request):
        cfg = WaitlistSettings.load()
        data = {'enabled': cfg.enabled}
        if request.user and request.user.is_staff:
            data.update(auto_offer=cfg.auto_offer, claim_minutes=cfg.claim_minutes)
        return Response(data)

    def patch(self, request):
        cfg = WaitlistSettings.load()
        fields = []
        for f in ('enabled', 'auto_offer'):
            if f in request.data:
                setattr(cfg, f, _truthy(request.data.get(f)))
                fields.append(f)
        if 'claim_minutes' in request.data:
            try:
                minutes = int(request.data['claim_minutes'])
            except (TypeError, ValueError):
                return _bad('claim_minutes debe ser un número de minutos.')
            if not 10 <= minutes <= 60 * 48:
                return _bad('El plazo para aceptar debe estar entre 10 minutos y 48 horas.')
            cfg.claim_minutes = minutes
            fields.append('claim_minutes')
        cfg.save()
        logger.info("waitlist.settings fields=%s admin=%s", fields, request.user.id)
        return Response({'enabled': cfg.enabled, 'auto_offer': cfg.auto_offer, 'claim_minutes': cfg.claim_minutes})

