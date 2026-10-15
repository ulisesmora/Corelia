"""Puesta en marcha obligatoria del panel (crm/src/pages/Setup.tsx).

Ocho pantallas, una tarea en cada una, en orden: Tu estudio, Tu estilo, Salas,
Profesores, Clases, Horario, Bonos y Publicar. El estado de cada paso lo
calcula setup_guide.compute_progress (progress["flow"]); aquí está lo que
necesitan las pantallas para guardar solas («Se guarda solo») y los consejos
del panel ya vistos por cada persona.

  POST   /api/v1/setup/flow/                 {"confirm": "<paso>"} | {"later": true|false}
  POST   /api/v1/setup/instructors/          {"name"}            → crea una profesora
  DELETE /api/v1/setup/class-types/<id>/                         → quita una clase (y su horario)
  GET    /api/v1/setup/week/                                     → semana tipo
  POST   /api/v1/setup/week/                 {"weekday", "start_time", "class_type_id", "room_id"?}
  PATCH  /api/v1/setup/week/<id>/            {"class_type_id"}
  DELETE /api/v1/setup/week/<id>/
  GET    /api/v1/setup/packs/                                    → bonos sugeridos
  POST   /api/v1/setup/packs/                {"key", "on"?, "price"?}
  GET    /api/v1/setup/tips/                                     → visitas guiadas ya vistas
  POST   /api/v1/setup/tips/                 {"key"} | {"reset": true}

Todo se guarda en tablas que ya existían (Room, Instructor, ClassType,
RecurringSchedule, Plan) y en SiteConfig.setup_steps (JSON): sin migraciones.
"""
import logging
import re
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import Booking, ClassType, Instructor, Plan, RecurringSchedule, Room, SiteConfig
from api.setup_guide import FLOW_STEPS, compute_progress

logger = logging.getLogger(__name__)

# Qué falta (por paso) cuando se pulsa «Continuar» sin los datos
CONFIRM_ERRORS = {
    'studio': 'Escribe el nombre del estudio, un teléfono o email y la ciudad.',
    'style': 'Elige un estilo.',
    'rooms': 'Añade al menos una sala.',
    'instructors': 'Añade al menos una persona que dé las clases.',
    'class_types': 'Elige al menos una clase.',
    'schedule': 'Pon al menos una clase en la semana.',
    'plans': 'Ofrece al menos un bono.',
}


def _steps_json(cfg: SiteConfig) -> dict:
    return dict(cfg.setup_steps) if isinstance(cfg.setup_steps, dict) else {}


def _locked_config() -> SiteConfig:
    return SiteConfig.objects.select_for_update().get_or_create(pk=1)[0]


def _bad(message: str, **extra) -> Response:
    return Response({'error': message, **extra}, status=status.HTTP_400_BAD_REQUEST)


# ── Avanzar en la puesta en marcha ──────────────────────────────────────────

class SetupFlowView(APIView):
    """POST {"confirm": paso}: «Continuar» en ese paso (exige sus datos y los
    pasos anteriores hechos: no se puede saltar ninguno).
    POST {"later": true}: «Guardar y seguir luego» (el panel se abre limitado
    en vez de llevar a la puesta en marcha)."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        data = request.data or {}
        if 'later' in data:
            with transaction.atomic():
                cfg = _locked_config()
                steps = _steps_json(cfg)
                if data.get('later'):
                    steps['later'] = True
                else:
                    steps.pop('later', None)
                cfg.setup_steps = steps
                cfg.save(update_fields=['setup_steps', 'updated_at'])
            logger.info("setup.flow.later value=%s admin_id=%s", bool(data.get('later')), request.user.id)
            return Response(compute_progress(cfg))

        key = data.get('confirm')
        if key not in FLOW_STEPS or key == 'launch':
            return _bad('Ese paso no existe.')
        with transaction.atomic():
            cfg = _locked_config()
            steps = _steps_json(cfg)
            if key == 'style':
                steps['style'] = 'done'  # «me gusta este estilo» aunque sea el de serie
                cfg.setup_steps = steps
            progress = compute_progress(cfg)
            flow = {s['key']: s for s in progress['flow']['steps']}
            index = FLOW_STEPS.index(key)
            pending_before = [k for k in FLOW_STEPS[:index] if not flow[k]['done']]
            if pending_before and not cfg.setup_completed:
                return _bad('Antes termina los pasos anteriores.', missing=pending_before)
            if not flow[key]['data_done']:
                missing = next((s.get('missing', []) for s in progress['steps'] if s['key'] == key), [])
                return _bad(CONFIRM_ERRORS[key], missing=missing)
            confirmed = [k for k in steps.get('flow', []) if k in FLOW_STEPS] \
                if isinstance(steps.get('flow'), list) else []
            if key not in confirmed:
                confirmed.append(key)
            steps['flow'] = confirmed
            cfg.setup_steps = steps
            cfg.save(update_fields=['setup_steps', 'updated_at'])
        logger.info("setup.flow.confirm step=%s admin_id=%s", key, request.user.id)
        return Response(compute_progress(cfg))


# ── Profesores ──────────────────────────────────────────────────────────────

def _free_slug(model, base: str) -> str:
    base = slugify(base)[:120] or 'profesora'
    slug, n = base, 2
    while model.all_objects.filter(slug=slug).exists():
        slug = f'{base}-{n}'
        n += 1
    return slug


class SetupInstructorView(APIView):
    """POST {"name"}: crea una profesora con lo mínimo (el resto, en Ajustes)."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        name = (request.data or {}).get('name')
        if not isinstance(name, str) or not name.strip():
            return _bad('Escribe el nombre.')
        name = name.strip()[:120]
        same = Instructor.all_objects.filter(name__iexact=name).order_by('deleted_at').first()
        if same and not same.deleted_at:
            return Response({'id': same.id, 'name': same.name}, status=status.HTTP_200_OK)
        if same:  # borrada antes: vuelve con su ficha
            same.deleted_at = None
            same.save(update_fields=['deleted_at', 'updated_at'])
            return Response({'id': same.id, 'name': same.name}, status=status.HTTP_201_CREATED)
        inst = Instructor.objects.create(name=name, slug=_free_slug(Instructor, name))
        logger.info("setup.instructor_created id=%s admin_id=%s", inst.id, request.user.id)
        return Response({'id': inst.id, 'name': inst.name}, status=status.HTTP_201_CREATED)


# ── Clases ──────────────────────────────────────────────────────────────────

class SetupClassTypeDeleteView(APIView):
    """DELETE: quita una clase elegida por error (y sus huecos de la semana).
    Si alguien ya ha reservado esa clase, no se quita desde aquí."""
    permission_classes = [IsAdminUser]

    def delete(self, request, pk):
        ct = ClassType.objects.filter(pk=pk).first()
        if not ct:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if Booking.objects.filter(occurrence__class_type=ct).exists():
            return _bad('Esa clase ya tiene reservas: cámbiala desde Ajustes → Tipos de clase.')
        with transaction.atomic():
            for sched in RecurringSchedule.objects.filter(class_type=ct):
                sched.soft_delete()
            ct.soft_delete()
        logger.info("setup.class_type_removed id=%s admin_id=%s", pk, request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Semana tipo ─────────────────────────────────────────────────────────────

TIME_RE = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')


def _week_slots():
    today = date.today()
    qs = RecurringSchedule.objects.filter(is_active=True, is_recurrent=True).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('class_type', 'room')
    return [{
        'id': s.id, 'weekday': s.weekday, 'start_time': s.start_time.strftime('%H:%M'),
        'class_type_id': s.class_type_id, 'title': s.class_type.title, 'room_id': s.room_id,
        'duration_minutes': s.duration_minutes,
    } for s in qs.order_by('weekday', 'start_time')]


def _week_payload():
    return {
        'slots': _week_slots(),
        'class_types': [{'id': c.id, 'title': c.title, 'duration_minutes': c.duration_minutes,
                         'credits': float(c.default_price_credits or 0),
                         'category': c.category.slug if c.category_id else ''}
                        for c in ClassType.objects.filter(is_active=True).select_related('category').order_by('id')],
        'rooms': [{'id': r.id, 'name': r.name, 'capacity': r.capacity} for r in Room.objects.order_by('id')],
    }


def _end_time(start, minutes: int):
    return (datetime.combine(date.today(), start) + timedelta(minutes=minutes)).time()


def _has_bookings(sched: RecurringSchedule) -> bool:
    return Booking.objects.filter(occurrence=sched).exists()


def _validation_message(exc: ValidationError) -> str:
    if hasattr(exc, 'message_dict'):
        return ' '.join(m for msgs in exc.message_dict.values() for m in msgs)
    return ' '.join(exc.messages)


class SetupWeekView(APIView):
    """GET: la semana tipo (clases que se repiten). POST: pone una clase en
    un hueco (cada semana, desde hoy). No avisa por email a nadie: el estudio
    aún se está preparando."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(_week_payload())

    def post(self, request):
        data = request.data or {}
        try:
            weekday = int(data.get('weekday'))
            if not 0 <= weekday <= 6:
                raise ValueError
        except (TypeError, ValueError):
            return _bad('Elige un día de la semana.')
        m = TIME_RE.match(str(data.get('start_time') or ''))
        if not m:
            return _bad('Elige una hora (por ejemplo, 09:30).')
        start = datetime.strptime(m.group(0), '%H:%M').time()
        ct = ClassType.objects.filter(pk=data.get('class_type_id'), is_active=True).first()
        if not ct:
            return _bad('Elige una clase.')
        room = Room.objects.filter(pk=data['room_id']).first() if data.get('room_id') else Room.objects.order_by('id').first()
        if not room:
            return _bad('Antes añade una sala.')
        sched = RecurringSchedule(
            class_type=ct, room=room, weekday=weekday, start_time=start,
            end_time=_end_time(start, ct.duration_minutes), capacity_min=1, capacity_max=room.capacity,
            start_date=date.today(), is_recurrent=True, is_active=True,
        )
        sched._skip_broadcast = True  # sin email masivo de «clase nueva»
        try:
            sched.clean()
            with transaction.atomic():
                sched.save()
        except ValidationError as exc:
            return _bad(_validation_message(exc))
        except IntegrityError:
            return _bad(f'La sala {room.name} ya tiene una clase a esa hora.')
        logger.info("setup.week.slot_created id=%s admin_id=%s", sched.id, request.user.id)
        return Response(_week_payload(), status=status.HTTP_201_CREATED)


class SetupWeekSlotView(APIView):
    """PATCH {"class_type_id"}: cambia la clase de un hueco. DELETE: lo vacía."""
    permission_classes = [IsAdminUser]

    def _get(self, pk):
        return RecurringSchedule.objects.filter(pk=pk, is_recurrent=True).select_related('room').first()

    def patch(self, request, pk):
        sched = self._get(pk)
        if not sched:
            return Response(status=status.HTTP_404_NOT_FOUND)
        ct = ClassType.objects.filter(pk=(request.data or {}).get('class_type_id'), is_active=True).first()
        if not ct:
            return _bad('Elige una clase.')
        if _has_bookings(sched):
            return _bad('Esa clase ya tiene reservas: cámbiala desde el Calendario.')
        sched.class_type = ct
        sched.end_time = _end_time(sched.start_time, ct.duration_minutes)
        try:
            sched.clean()
            sched.save()
        except ValidationError as exc:
            return _bad(_validation_message(exc))
        return Response(_week_payload())

    def delete(self, request, pk):
        sched = self._get(pk)
        if not sched:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if _has_bookings(sched):
            return _bad('Esa clase ya tiene reservas: quítala desde el Calendario.')
        sched.soft_delete()
        return Response(_week_payload())


# ── Bonos sugeridos ─────────────────────────────────────────────────────────
# key: nombre, descripción, créditos, precio (× precio de la clase suelta),
#      días para usarlo, encendido de serie
PACKS = [
    ('trial', 'Clase de prueba', 'Para conocer el estudio', 1, Decimal('0.8'), 30, False),
    ('single', 'Clase suelta', 'Válida 1 mes', 1, Decimal('1'), 30, True),
    ('pack5', 'Bono 5 clases', 'Válido 2 meses', 5, Decimal('4.5'), 60, True),
    ('pack10', 'Bono 10 clases', 'Válido 3 meses', 10, Decimal('8'), 90, True),
    ('pack20', 'Bono 20 clases', 'Válido 6 meses', 20, Decimal('14'), 180, False),
]
PACK_BY_KEY = {p[0]: p for p in PACKS}


def _pack_ids(cfg: SiteConfig) -> dict:
    raw = _steps_json(cfg).get('packs')
    return {k: v for k, v in raw.items() if k in PACK_BY_KEY} if isinstance(raw, dict) else {}


def _round_price(value: Decimal) -> Decimal:
    return value.quantize(Decimal('1'), rounding=ROUND_HALF_UP)


def _pack_plan(cfg: SiteConfig, key: str):
    ids = _pack_ids(cfg)
    if ids.get(key):
        plan = Plan.all_objects.filter(pk=ids[key]).first()
        if plan:
            return plan
    return Plan.all_objects.filter(name__iexact=PACK_BY_KEY[key][1]).order_by('deleted_at').first()


def _packs_payload(cfg: SiteConfig) -> dict:
    base = cfg.drop_in_price or Decimal('12')
    items = []
    for key, name, desc, credits, factor, days, default_on in PACKS:
        plan = _pack_plan(cfg, key)
        live = bool(plan and not plan.deleted_at)
        items.append({
            'key': key, 'name': plan.name if live else name, 'description': desc, 'credits': credits,
            'price': str(plan.price_eur if live else _round_price(base * factor)),
            'expire_days': days, 'on': bool(live and plan.is_active), 'plan_id': plan.id if live else None,
            'suggested_on': default_on,
        })
    return {'packs': items, 'currency': cfg.currency or 'EUR'}


def _parse_price(raw):
    try:
        price = Decimal(str(raw)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return price if Decimal('0') < price <= Decimal('100000') else None


class SetupPacksView(APIView):
    """GET: bonos sugeridos (precios a partir de la clase suelta) y cuáles
    están ya a la venta. POST {"key", "on"?, "price"?}: enciende, apaga o
    cambia el precio de uno (crea o actualiza su Plan)."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(_packs_payload(SiteConfig.load()))

    def post(self, request):
        data = request.data or {}
        key = data.get('key')
        if key not in PACK_BY_KEY:
            return _bad('Ese bono no existe.')
        _, name, desc, credits, factor, days, _ = PACK_BY_KEY[key]
        price = None
        if data.get('price') is not None:
            price = _parse_price(data['price'])
            if price is None:
                return _bad('Escribe un precio mayor que 0.')
        with transaction.atomic():
            cfg = _locked_config()
            plan = _pack_plan(cfg, key)
            turn_on = data.get('on')
            if plan is None:
                if not turn_on:
                    return Response(_packs_payload(cfg))
                plan = Plan(name=name, slug=_free_slug(Plan, name), type='pack', credits=credits,
                            price_eur=price or _round_price((cfg.drop_in_price or Decimal('12')) * factor),
                            credits_expire_days=days, description=desc, is_active=True)
            if plan.deleted_at:
                plan.deleted_at = None
            if turn_on is not None:
                plan.is_active = bool(turn_on)
            if price is not None:
                plan.price_eur = price
            plan.price_credit = (plan.price_eur / plan.credits).quantize(Decimal('0.01')) if plan.credits else None
            plan.save()
            steps = _steps_json(cfg)
            ids = _pack_ids(cfg)
            ids[key] = plan.id
            steps['packs'] = ids
            cfg.setup_steps = steps
            cfg.save(update_fields=['setup_steps', 'updated_at'])
        logger.info("setup.pack key=%s plan_id=%s on=%s admin_id=%s", key, plan.id, plan.is_active, request.user.id)
        return Response(_packs_payload(cfg))


# ── Visitas guiadas y consejos ya vistos (por persona) ──────────────────────

TIP_KEY = re.compile(r'^[a-z0-9:_-]{1,48}$')
MAX_TIPS = 120


def _seen(cfg: SiteConfig, user_id: int) -> list:
    raw = _steps_json(cfg).get('seen')
    mine = raw.get(str(user_id)) if isinstance(raw, dict) else None
    return [k for k in mine if isinstance(k, str)] if isinstance(mine, list) else []


class SetupTipsView(APIView):
    """GET: lo que esta persona ya ha visto. POST {"key"}: lo marca como
    visto. POST {"reset": true}: vuelve a enseñar todos los consejos."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({'seen': _seen(SiteConfig.load(), request.user.id)})

    def post(self, request):
        data = request.data or {}
        key = data.get('key')
        if not data.get('reset') and (not isinstance(key, str) or not TIP_KEY.match(key)):
            return _bad('Clave no válida.')
        with transaction.atomic():
            cfg = _locked_config()
            steps = _steps_json(cfg)
            seen = steps.get('seen') if isinstance(steps.get('seen'), dict) else {}
            seen = dict(seen)
            mine = [] if data.get('reset') else _seen(cfg, request.user.id)
            if key and not data.get('reset') and key not in mine:
                mine = (mine + [key])[-MAX_TIPS:]
            seen[str(request.user.id)] = mine
            steps['seen'] = seen
            cfg.setup_steps = steps
            cfg.save(update_fields=['setup_steps', 'updated_at'])
        return Response({'seen': mine})
