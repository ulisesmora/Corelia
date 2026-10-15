"""Guía de puesta en marcha del estudio (panel → «Puesta en marcha»).

Once pasos en el orden en que dependen unos de otros (un horario necesita un
tipo de clase y una sala; un tipo de clase, una categoría…). El estado de cada
paso se calcula con los datos reales; solo lo que no se puede deducir (el
asistente de bienvenida terminado, «me gusta este estilo», un paso opcional
saltado) se guarda en SiteConfig.setup_steps.

Publicar la web (SiteConfig.setup_completed = True) exige los pasos mínimos:
mientras no, la web no se deja indexar (robots.txt y <meta robots>).

Los textos que ve el estudio (qué es cada paso, por qué, ejemplos) están en el
panel: crm/src/onboarding/copy.ts. Aquí solo hay claves y datos.

  GET  /api/v1/setup/progress/            estado de los pasos y el siguiente
  POST /api/v1/setup/steps/<paso>/        {"status": "done"|"skipped"|"todo"}
  POST /api/v1/setup/publish/             publica la web (si se puede)
  GET  /api/v1/setup/class-templates/     plantillas de tipos de clase
  POST /api/v1/setup/class-templates/     {"items": [{"key": "reformer", …}]}
"""
import logging
from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import (
    Booking, Category, ClassType, FAQItem, Instructor, Plan, RecurringSchedule, Room, SiteConfig, SiteImage,
    Testimonial, User,
)

logger = logging.getLogger(__name__)

# Orden de la guía. «required» = hace falta para publicar la web.
STEPS = [
    ('studio', True),
    ('style', True),
    ('rooms', True),
    ('instructors', True),
    ('class_types', True),
    ('schedule', True),
    ('plans', True),
    ('payments', False),
    ('content', False),
    ('google', False),
    ('launch', False),
]
STEP_KEYS = [k for k, _ in STEPS]
REQUIRED_STEPS = [k for k, req in STEPS if req]

# Qué paso necesita a cuál (solo dependencias de verdad del modelo de datos)
PREREQUISITES = {
    'schedule': ['rooms', 'class_types'],
    'launch': REQUIRED_STEPS,
}

# Pasos que se marcan a mano (no se pueden deducir del todo de los datos)
ACK_KEYS = {
    'welcome': ('done',),
    'style': ('done',),
    'payments': ('done', 'skipped'),
    'content': ('done', 'skipped'),
    'google': ('done', 'skipped'),
}

# Puesta en marcha OBLIGATORIA del panel (crm/src/pages/Setup.tsx): 8 pasos,
# en orden. Un paso está hecho cuando sus datos están Y el estudio ha pulsado
# «Continuar» en él (setup_steps["flow"]); «launch» = web publicada. Mientras
# no esté todo, el panel desbloquea secciones según el paso al que se ha
# llegado (crm/src/onboarding/locks.ts). Con la web publicada, todo hecho.
FLOW_STEPS = ['studio', 'style', 'rooms', 'instructors', 'class_types', 'schedule', 'plans', 'launch']

DEFAULT_STUDIO_NAME = 'Mi Estudio'
DEFAULT_ROOM_NAME = 'Sala principal'
DEFAULT_ROOM_CAPACITY = 10
SAMPLE_MARK = '(ejemplo)'  # seed_demo: «Laura (ejemplo)»
STYLE_FIELDS = ('style_preset', 'icon_style', 'palette', 'font_pair', 'color_primary', 'color_secondary',
                'color_dark', 'color_background', 'font_heading', 'font_body')


# ── Plantillas de tipos de clase ─────────────────────────────────────────────
# Categoría: (slug, nombre, nombre en inglés, descripción, descripción en inglés).
# Los slugs «pilates» y «yoga» los usa la web para recomendar la primera clase.
CATEGORIES = {
    'pilates': ('Pilates', 'Pilates',
                'Fuerza, control y postura, en esterilla o con máquinas.',
                'Strength, control and posture, on the mat or with equipment.'),
    'yoga': ('Yoga', 'Yoga',
             'Respiración, movilidad y calma, desde estilos suaves a dinámicos.',
             'Breath, mobility and calm, from gentle to dynamic styles.'),
    'barre': ('Barre', 'Barre',
              'Entrenamiento inspirado en la danza, con barra y movimientos pequeños.',
              'Dance-inspired training at the barre with small, precise movements.'),
    'funcional': ('Funcional', 'Functional training',
                  'Entrenamiento para el día a día: fuerza, resistencia y movilidad.',
                  'Training for everyday life: strength, endurance and mobility.'),
    'bienestar': ('Bienestar', 'Wellbeing',
                  'Clases para bajar el ritmo: meditación, respiración y estiramientos.',
                  'Classes to slow down: meditation, breathing and stretching.'),
}

# key: título, título en inglés, categoría, minutos, créditos, nivel, aforo habitual,
#      descripción, descripción en inglés
CLASS_TEMPLATES = [
    ('reformer', 'Pilates Reformer', 'Reformer Pilates', 'pilates', 55, 2, 'all', 6,
     'Pilates en máquina Reformer en grupo reducido. Los muelles añaden resistencia o te ayudan, '
     'así que se adapta a cualquier nivel: ganas fuerza, control del centro y una postura mejor.',
     'Pilates on the Reformer machine in a small group. The springs add resistance or support, so it adapts '
     'to every level: you build strength, core control and better posture.'),
    ('mat', 'Pilates Mat', 'Mat Pilates', 'pilates', 55, 1, 'all', 12,
     'Pilates en esterilla con tu propio peso y pequeños accesorios (aro, pelota, bandas). '
     'Trabaja el centro, la movilidad de la espalda y la respiración.',
     'Pilates on the mat using your own body weight and small props (ring, ball, bands). '
     'It works your core, spine mobility and breathing.'),
    ('barre', 'Barre', 'Barre', 'barre', 50, 1, 'all', 12,
     'Clase inspirada en la danza clásica con barra: movimientos pequeños y muchas repeticiones '
     'para tonificar piernas, glúteos y brazos, con música que anima.',
     'A ballet-inspired class at the barre: small movements and high repetitions to tone legs, '
     'glutes and arms, with upbeat music.'),
    ('yoga', 'Yoga', 'Yoga', 'yoga', 60, 1, 'all', 14,
     'Yoga para todos los niveles: posturas, respiración y una relajación final. '
     'Ideal si es tu primera vez o quieres una práctica equilibrada.',
     'Yoga for all levels: postures, breathing and a final relaxation. '
     'Ideal if it is your first time or you want a balanced practice.'),
    ('hatha', 'Hatha Yoga', 'Hatha Yoga', 'yoga', 60, 1, 'all', 14,
     'Yoga tradicional a ritmo pausado: mantienes cada postura unas respiraciones para ganar '
     'flexibilidad, fuerza y concentración.',
     'Traditional, slow-paced yoga: you hold each posture for a few breaths to build flexibility, '
     'strength and focus.'),
    ('vinyasa', 'Vinyasa Yoga', 'Vinyasa Yoga', 'yoga', 60, 1, 'int', 14,
     'Secuencias fluidas que unen movimiento y respiración. Una práctica dinámica que activa '
     'el cuerpo y despeja la mente.',
     'Flowing sequences that link movement and breath. A dynamic practice that energises the body '
     'and clears the mind.'),
    ('yin', 'Yin Yoga', 'Yin Yoga', 'yoga', 60, 1, 'all', 14,
     'Posturas suaves mantenidas varios minutos para soltar tensión y ganar movilidad. '
     'Perfecta para desconectar.',
     'Gentle postures held for several minutes to release tension and gain mobility. '
     'Perfect to unwind.'),
    ('funcional', 'Entrenamiento funcional', 'Functional training', 'funcional', 45, 1, 'all', 12,
     'Fuerza y resistencia con movimientos del día a día (empujar, tirar, agacharse, girar), '
     'con peso corporal, kettlebells y bandas.',
     'Strength and endurance with everyday movements (push, pull, squat, rotate), using body weight, '
     'kettlebells and bands.'),
    ('hiit', 'HIIT', 'HIIT', 'funcional', 40, 1, 'int', 12,
     'Intervalos cortos de alta intensidad con descansos activos. Mucho trabajo en poco tiempo.',
     'Short high-intensity intervals with active recovery. A lot of work in a short time.'),
    ('movilidad', 'Movilidad y estiramientos', 'Mobility and stretching', 'bienestar', 45, 1, 'all', 14,
     'Ejercicios suaves para mover las articulaciones, estirar y aliviar la rigidez. '
     'Un gran complemento para cualquier otra clase.',
     'Gentle exercises to move your joints, stretch and ease stiffness. '
     'A great complement to any other class.'),
    ('meditacion', 'Meditación', 'Meditation', 'bienestar', 30, 1, 'all', 16,
     'Meditación guiada y ejercicios de respiración para reducir el estrés y aprender a parar.',
     'Guided meditation and breathing exercises to reduce stress and learn to pause.'),
]
TEMPLATE_BY_KEY = {t[0]: t for t in CLASS_TEMPLATES}


def _template_payload(t, existing: dict) -> dict:
    """`existing`: {título en minúsculas: id} de los tipos de clase que ya hay."""
    key, title, title_en, cat, minutes, credits, level, capacity, desc, desc_en = t
    cat_name, cat_name_en, _, _ = CATEGORIES[cat]
    return {
        'key': key, 'title': title, 'title_en': title_en, 'category': cat, 'category_name': cat_name,
        'category_name_en': cat_name_en, 'duration_minutes': minutes, 'credits': credits, 'level': level,
        'capacity': capacity, 'description': desc, 'description_en': desc_en,
        'exists': title.lower() in existing,
        'id': existing.get(title.lower()),
    }


def list_class_templates() -> list:
    existing = {t.lower(): pk for pk, t in ClassType.objects.order_by('-id').values_list('id', 'title')}
    return [_template_payload(t, existing) for t in CLASS_TEMPLATES]


def _ensure_category(slug: str) -> Category:
    name, name_en, desc, desc_en = CATEGORIES[slug]
    cat = Category.all_objects.filter(Q(slug=slug) | Q(name__iexact=name)).order_by('deleted_at').first()
    if cat:
        if cat.deleted_at:
            cat.deleted_at = None
            cat.save(update_fields=['deleted_at', 'updated_at'])
        return cat
    return Category.objects.create(slug=slug, name=name, name_en=name_en, description=desc, description_en=desc_en)


def _free_slug(base: str, exclude_id=None) -> str:
    base = slugify(base)[:170] or 'clase'
    slug, n = base, 2
    qs = ClassType.all_objects.all()
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    while qs.filter(slug=slug).exists():
        slug = f'{base}-{n}'
        n += 1
    return slug


@transaction.atomic
def create_from_templates(items: list, cfg: SiteConfig) -> tuple:
    """Crea los tipos de clase elegidos (y sus categorías). Devuelve (creados, ya existían)."""
    instructors = list(Instructor.objects.all()[:2])
    created, skipped = [], []
    for raw in items:
        t = TEMPLATE_BY_KEY[raw['key']]
        key, title, title_en, cat_slug, minutes, credits, level, _, desc, desc_en = t
        title = (raw.get('title') or title).strip()[:160]
        minutes = int(raw.get('duration_minutes') or minutes)
        credits = Decimal(str(raw.get('credits') or credits))
        instructor_id = raw.get('instructor_id')
        if instructor_id is None and len(instructors) == 1:
            instructor_id = instructors[0].id  # una sola persona da todas las clases
        category = _ensure_category(cat_slug)
        values = {
            'title_en': title_en if title == t[1] else '', 'description': desc,
            'description_en': desc_en if title == t[1] else '', 'duration_minutes': minutes, 'level': level,
            'default_price_credits': credits,
            'default_price_eur': (cfg.drop_in_price or Decimal('0')) * credits,
            'instructor_id': instructor_id, 'is_active': True,
        }
        same = ClassType.all_objects.filter(title__iexact=title, category=category).first()
        if same and not same.deleted_at:
            skipped.append({'key': key, 'id': same.id, 'title': same.title})
            continue
        if same:  # borrada antes: vuelve, con los datos de la plantilla
            for k, v in values.items():
                setattr(same, k, v)
            same.deleted_at = None
            same.save()
            created.append({'key': key, 'id': same.id, 'title': same.title})
            continue
        try:
            with transaction.atomic():
                ct = ClassType.objects.create(title=title, slug=_free_slug(title), category=category, **values)
        except IntegrityError:
            skipped.append({'key': key, 'id': None, 'title': title})
            continue
        created.append({'key': key, 'id': ct.id, 'title': ct.title})
    return created, skipped


def ensure_default_room() -> Room | None:
    """«Sala principal» si el estudio aún no tiene ninguna sala (se puede editar)."""
    if Room.objects.exists():
        return None
    room = Room.all_objects.filter(name=DEFAULT_ROOM_NAME).first()
    if room:
        room.deleted_at = None
        room.save(update_fields=['deleted_at', 'updated_at'])
        return room
    return Room.objects.create(name=DEFAULT_ROOM_NAME, capacity=DEFAULT_ROOM_CAPACITY)


# ── Estado de los pasos ──────────────────────────────────────────────────────

def _ack(cfg: SiteConfig, key: str) -> str:
    steps = cfg.setup_steps if isinstance(cfg.setup_steps, dict) else {}
    value = steps.get(key)
    return value if value in ('done', 'skipped') else ''


def _style_changed(cfg: SiteConfig) -> bool:
    return any(getattr(cfg, f) != SiteConfig._meta.get_field(f).default for f in STYLE_FIELDS)


def compute_progress(cfg: SiteConfig | None = None) -> dict:
    from api.utils.emailing import email_enabled
    from api.utils.payments import payments_status

    cfg = cfg or SiteConfig.load()
    today = date.today()

    name = (cfg.studio_name or '').strip()
    studio_missing = []
    if not name or name == DEFAULT_STUDIO_NAME:
        studio_missing.append('name')
    if not (cfg.phone or cfg.contact_email or cfg.whatsapp):
        studio_missing.append('contact')
    if not (cfg.address or cfg.city):
        studio_missing.append('address')

    instructors = Instructor.objects.all()
    real_instructors = instructors.exclude(name__icontains=SAMPLE_MARK)
    class_types = ClassType.objects.filter(is_active=True)
    schedules = RecurringSchedule.objects.filter(is_active=True).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=today)).filter(
        Q(is_recurrent=True) | Q(start_date__isnull=True) | Q(start_date__gte=today))
    plans = Plan.objects.filter(is_active=True)
    counts = {
        'rooms': Room.objects.count(),
        'instructors': real_instructors.count(),
        'sample_instructors': instructors.count() - real_instructors.count(),
        'class_types': class_types.count(),
        'schedule': schedules.count(),
        'plans': plans.count(),
        'faqs': FAQItem.objects.filter(is_active=True, is_sample=False).count(),
        'testimonials': Testimonial.objects.filter(is_active=True).count(),
        'clients': User.objects.filter(is_staff=False, is_superuser=False).count(),
        'bookings': Booking.objects.count(),
    }

    hero_ok = bool(
        (cfg.hero_mode == 'image' and (cfg.hero_image_url
                                       or SiteImage.objects.filter(section='hero', is_active=True).exists()))
        or (cfg.hero_mode == 'video' and cfg.hero_video_url)
        or cfg.hero_mode == 'illustration'
    )
    texts_ok = bool((cfg.hero_title or cfg.hero_subtitle) and cfg.about_text)
    email_ok = email_enabled()
    pay = payments_status(cfg)
    stripe_ok = pay['ready']
    # Estado de los pagos para la guía: 'active' si ya se cobra (con claves o
    # con la cuenta conectada); si no, el de la cuenta conectada (none,
    # onboarding, pending, restricted, mismatch). Textos: crm/src/onboarding/copy.ts
    stripe_state = 'active' if stripe_ok else pay['state']

    state = {
        'studio': {'done': not studio_missing, 'missing': studio_missing,
                   'items': [{'key': 'logo', 'done': bool(cfg.logo_url)}]},
        'style': {'done': bool(_ack(cfg, 'style')) or _style_changed(cfg)},
        'rooms': {'done': counts['rooms'] > 0},
        'instructors': {'done': counts['instructors'] > 0, 'sample': counts['sample_instructors'] > 0},
        'class_types': {'done': counts['class_types'] > 0},
        'schedule': {'done': counts['schedule'] > 0},
        'plans': {'done': counts['plans'] > 0},
        'payments': {'done': email_ok and stripe_ok,
                     'items': [{'key': 'emails', 'done': email_ok},
                               {'key': 'stripe', 'done': stripe_ok, 'state': stripe_state}]},
        'content': {'done': hero_ok and texts_ok,
                    'items': [{'key': 'hero', 'done': hero_ok}, {'key': 'texts', 'done': texts_ok},
                              {'key': 'faqs', 'done': counts['faqs'] > 0},
                              {'key': 'testimonials', 'done': counts['testimonials'] > 0}]},
        'google': {'done': bool(cfg.google_business_url),
                   'items': [{'key': 'business', 'done': bool(cfg.google_business_url)},
                             {'key': 'search_console', 'done': bool(cfg.google_site_verification)},
                             {'key': 'domain', 'done': bool(cfg.web_domain)}]},
        'launch': {'done': bool(cfg.setup_completed),
                   'items': [{'key': 'test_booking', 'done': counts['bookings'] > 0},
                             {'key': 'clients', 'done': counts['clients'] > 0},
                             {'key': 'published', 'done': bool(cfg.setup_completed)}]},
    }

    acks = {key: _ack(cfg, key) if key in ACK_KEYS else '' for key in STEP_KEYS}
    done_map = {key: bool(state[key]['done']) or acks[key] == 'done' for key in STEP_KEYS}
    steps = []
    for key, required in STEPS:
        s = state[key]
        done = done_map[key]
        blocked_by = [p for p in PREREQUISITES.get(key, []) if not done_map[p]]
        if done:
            status_ = 'done'
        elif acks[key] == 'skipped':
            status_ = 'skipped'
        elif blocked_by:
            status_ = 'blocked'
        else:
            status_ = 'todo'
        steps.append({
            'key': key,
            'required': required,
            'status': status_,
            'done': done,
            'blocked_by': blocked_by if status_ == 'blocked' else [],
            'count': counts.get(key),
            'missing': s.get('missing', []),
            'items': s.get('items', []),
            'sample': bool(s.get('sample')),
            'can_skip': 'skipped' in ACK_KEYS.get(key, ()),
        })

    flow = flow_state(cfg, done_map)
    required_done = sum(1 for s in steps if s['required'] and s['done'])
    finished = [s for s in steps if s['status'] in ('done', 'skipped')]
    pending = [s for s in steps if s['status'] not in ('done', 'skipped')]
    # Primero lo obligatorio, en orden; luego lo opcional
    next_step = next((s['key'] for s in pending if s['required']), None) \
        or next((s['key'] for s in pending), None)
    return {
        'published': bool(cfg.setup_completed),
        'can_publish': required_done == len(REQUIRED_STEPS),
        'welcome_done': _ack(cfg, 'welcome') == 'done' or bool(cfg.setup_completed),
        'total': len(STEPS),
        'done_count': len(finished),
        'required_total': len(REQUIRED_STEPS),
        'required_done': required_done,
        'next_step': next_step,
        'missing_to_publish': [s['key'] for s in steps if s['required'] and not s['done']],
        'counts': counts,
        'steps': steps,
        'flow': flow,
    }


def _confirmed(cfg: SiteConfig) -> list:
    steps = cfg.setup_steps if isinstance(cfg.setup_steps, dict) else {}
    value = steps.get('flow')
    return [k for k in value if k in FLOW_STEPS] if isinstance(value, list) else []


def flow_state(cfg: SiteConfig, done_map: dict) -> dict:
    """Estado de la puesta en marcha obligatoria (8 pasos en orden).

    reached: número (1…8) del primer paso sin terminar; 9 = todo hecho. Los
    pasos se terminan en orden: uno hecho después de uno pendiente no cuenta
    para desbloquear (el panel se abre según `reached`)."""
    published = bool(cfg.setup_completed)
    confirmed = set(_confirmed(cfg))
    items, reached = [], None
    for i, key in enumerate(FLOW_STEPS, start=1):
        data_ok = published if key == 'launch' else bool(done_map.get(key))
        done = published or (data_ok and (key == 'launch' or key in confirmed))
        items.append({'key': key, 'done': done, 'data_done': data_ok, 'confirmed': key in confirmed})
        if not done and reached is None:
            reached = i
    reached = reached or len(FLOW_STEPS) + 1
    raw = cfg.setup_steps if isinstance(cfg.setup_steps, dict) else {}
    return {
        'steps': items,
        'total': len(FLOW_STEPS),
        'reached': reached,
        'current': FLOW_STEPS[reached - 1] if reached <= len(FLOW_STEPS) else None,
        'left': len(FLOW_STEPS) - reached + 1,
        'finished': reached > len(FLOW_STEPS),
        'later': bool(raw.get('later')) and not published,
    }


# ── Vistas ───────────────────────────────────────────────────────────────────

class SetupProgressView(APIView):
    """GET /api/v1/setup/progress/ — estado de cada paso de la guía."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(compute_progress())


class SetupStepView(APIView):
    """POST /api/v1/setup/steps/<paso>/ {"status": "done"|"skipped"|"todo"}

    Marca a mano lo que no se deduce de los datos. Al terminar el asistente de
    bienvenida («welcome») se crea «Sala principal» si no hay ninguna sala."""
    permission_classes = [IsAdminUser]

    def post(self, request, key):
        allowed = ACK_KEYS.get(key)
        if not allowed:
            return Response({'error': 'Ese paso no se puede marcar a mano.'}, status=status.HTTP_400_BAD_REQUEST)
        value = (request.data or {}).get('status', 'done')
        if value not in (*allowed, 'todo'):
            return Response({'error': 'Estado no válido para ese paso.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            cfg = SiteConfig.objects.select_for_update().get_or_create(pk=1)[0]
            steps = dict(cfg.setup_steps) if isinstance(cfg.setup_steps, dict) else {}
            if value == 'todo':
                steps.pop(key, None)
            else:
                steps[key] = value
            cfg.setup_steps = steps
            cfg.save(update_fields=['setup_steps', 'updated_at'])
            if key == 'welcome' and value == 'done':
                room = ensure_default_room()
                if room:
                    logger.info("setup.default_room_created room_id=%s", room.id)
        logger.info("setup.step key=%s status=%s admin_id=%s", key, value, request.user.id)
        return Response(compute_progress(cfg))


class SetupPublishView(APIView):
    """POST /api/v1/setup/publish/ — «Publicar mi web»: deja que los buscadores
    la indexen. Solo con los pasos mínimos hechos (si no, 400 con lo que falta)."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        cfg = SiteConfig.load()
        progress = compute_progress(cfg)
        if not progress['can_publish'] and not cfg.setup_completed:
            return Response({
                'error': 'Antes de publicar tu web te faltan algunos pasos de la guía.',
                'missing': progress['missing_to_publish'],
                'progress': progress,
            }, status=status.HTTP_400_BAD_REQUEST)
        if not cfg.setup_completed:
            cfg.setup_completed = True
            cfg.save(update_fields=['setup_completed', 'updated_at'])
            logger.info("setup.published admin_id=%s", request.user.id)
            from api.views_site import _ping_search_engines
            _ping_search_engines()
        return Response(compute_progress(cfg))


class SetupClassTemplatesView(APIView):
    """GET: plantillas de tipos de clase. POST {"items": [{"key", "title"?,
    "duration_minutes"?, "credits"?, "instructor_id"?}]}: crea las elegidas."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({'templates': list_class_templates(), 'categories': [
            {'slug': k, 'name': v[0], 'name_en': v[1]} for k, v in CATEGORIES.items()]})

    def post(self, request):
        items = (request.data or {}).get('items')
        if not isinstance(items, list) or not items or len(items) > len(CLASS_TEMPLATES):
            return Response({'error': 'Elige al menos una clase de la lista.'}, status=status.HTTP_400_BAD_REQUEST)
        clean = []
        for raw in items:
            if not isinstance(raw, dict) or raw.get('key') not in TEMPLATE_BY_KEY:
                return Response({'error': 'Esa plantilla no existe.'}, status=status.HTTP_400_BAD_REQUEST)
            item = {'key': raw['key']}
            title = raw.get('title')
            if title is not None:
                if not isinstance(title, str) or not title.strip():
                    return Response({'error': 'Escribe el nombre de la clase.'}, status=status.HTTP_400_BAD_REQUEST)
                item['title'] = title
            try:
                if raw.get('duration_minutes') is not None:
                    item['duration_minutes'] = int(raw['duration_minutes'])
                    if not 15 <= item['duration_minutes'] <= 600:
                        raise ValueError
                if raw.get('credits') is not None:
                    item['credits'] = Decimal(str(raw['credits']))
                    if not Decimal('0') <= item['credits'] <= Decimal('20'):
                        raise ValueError
            except (ValueError, ArithmeticError):
                return Response({'error': 'Revisa la duración (15 minutos o más) y los créditos.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if raw.get('instructor_id') is not None:
                if not Instructor.objects.filter(pk=raw['instructor_id']).exists():
                    return Response({'error': 'Ese profesor no existe.'}, status=status.HTTP_400_BAD_REQUEST)
                item['instructor_id'] = raw['instructor_id']
            clean.append(item)
        created, skipped = create_from_templates(clean, SiteConfig.load())
        logger.info("setup.class_templates created=%s skipped=%s admin_id=%s",
                    [c['key'] for c in created], [s['key'] for s in skipped], request.user.id)
        return Response({'created': created, 'skipped': skipped, 'progress': compute_progress()},
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
