"""Carga un estudio de ejemplo (clases, horarios, equipo y bonos) para
ver la web funcionando desde el primer minuto. Todo se puede editar o borrar
después desde el panel."""
from datetime import date, time
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import Category, ClassType, FAQItem, Instructor, Plan, RecurringSchedule, Room, SiteConfig

CLASSES = [
    # (título, slug, descripción, nivel, duración)
    ('Pilates Mat', 'pilates-mat',
     'Pilates en esterilla para ganar fuerza, movilidad y control del centro. Para todos los niveles.',
     'all', 55),
    ('Pilates Reformer', 'pilates-reformer',
     'Clase en máquina Reformer en grupo reducido: trabajo de precisión con resistencia de muelles.',
     'all', 55),
    ('Yoga Flow', 'yoga-flow',
     'Secuencias dinámicas de yoga que unen respiración y movimiento. Sales con energía y calma.',
     'all', 60),
]

# (slug de la clase, día de la semana 0=lunes, hora inicio, hora fin)
SCHEDULE = [
    ('pilates-mat', 0, time(9, 30), time(10, 25)),
    ('pilates-mat', 2, time(9, 30), time(10, 25)),
    ('pilates-mat', 4, time(18, 0), time(18, 55)),
    ('pilates-reformer', 1, time(10, 0), time(10, 55)),
    ('pilates-reformer', 3, time(19, 0), time(19, 55)),
    ('yoga-flow', 1, time(19, 0), time(20, 0)),
    ('yoga-flow', 5, time(10, 0), time(11, 0)),
]

PLANS = [
    # (nombre, slug, tipo, créditos, precio, caducidad días, intervalo)
    ('Bono 5 clases', 'bono-5', 'pack', 5, Decimal('60.00'), 60, None),
    ('Bono 10 clases', 'bono-10', 'pack', 10, Decimal('110.00'), 90, None),
    ('Membresía 8 clases/mes', 'membresia-8', 'sub', 8, Decimal('85.00'), 35, 'month'),
]


FAQS = [
    ('¿Necesito experiencia previa?',
     'No. Las clases están pensadas para todos los niveles y adaptamos cada ejercicio a tu punto de partida.',
     'Do I need previous experience?',
     'No. Classes are for all levels and every exercise is adapted to your starting point.'),
    ('¿Qué tengo que traer?',
     'Ropa cómoda y calcetines antideslizantes (para Pilates). Si quieres, una botella de agua. El material lo pone el estudio.',
     'What should I bring?',
     'Comfortable clothes and grip socks (for Pilates). A water bottle if you like. We provide all the equipment.'),
    ('¿Cómo funcionan los créditos?',
     'Compras un bono o una membresía y recibes créditos. Cada clase gasta normalmente 1 crédito y los usas para reservar en la web o en la app.',
     'How do credits work?',
     'You buy a pack or a membership and get credits. Each class usually costs 1 credit, which you use to book on the website or the app.'),
    ('¿Puedo cancelar una reserva?',
     f'Sí, desde tu cuenta, hasta {settings.BOOKING_CANCEL_MIN_HOURS} horas antes de la clase. Te devolvemos el crédito al momento para que reserves otra.',
     'Can I cancel a booking?',
     f'Yes, from your account, up to {settings.BOOKING_CANCEL_MIN_HOURS} hours before the class. Your credit is returned instantly so you can book another one.'),
    ('¿Cuántas personas hay por clase?',
     'Trabajamos en grupos reducidos para poder corregirte y acompañarte durante toda la clase.',
     'How many people are in each class?',
     'We work in small groups so we can guide and correct you throughout the class.'),
]


class Command(BaseCommand):
    help = 'Carga datos de ejemplo (clases, horarios y bonos).'

    def add_arguments(self, parser):
        parser.add_argument('--only-if-empty', action='store_true',
                            help='No hace nada si ya hay clases creadas.')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['only_if_empty'] and ClassType.objects.exists():
            self.stdout.write('Ya hay clases: no se cargan datos de ejemplo.')
            return

        cat, _ = Category.objects.get_or_create(slug='pilates-y-yoga', defaults={'name': 'Pilates y Yoga'})
        instructor, _ = Instructor.objects.get_or_create(
            slug='instructora-ejemplo',
            defaults={'name': 'Laura (ejemplo)', 'experience_years': 8,
                      'short_bio': 'Formación certificada en Pilates y Yoga. Cambia esta ficha por la de tu equipo en el panel.'},
        )
        room, _ = Room.objects.get_or_create(name='Sala principal', defaults={'capacity': 10})

        types = {}
        for title, slug, desc, level, minutes in CLASSES:
            types[slug], _ = ClassType.objects.get_or_create(slug=slug, defaults={
                'title': title, 'category': cat, 'instructor': instructor, 'description': desc,
                'level': level, 'duration_minutes': minutes,
                'default_price_credits': Decimal('1'), 'default_price_eur': Decimal('14'),
            })

        created = 0
        for slug, weekday, start, end in SCHEDULE:
            if RecurringSchedule.objects.filter(class_type=types[slug], weekday=weekday, start_time=start).exists():
                continue
            sched = RecurringSchedule(
                class_type=types[slug], room=room, weekday=weekday, is_recurrent=True,
                start_time=start, end_time=end, capacity_min=1, capacity_max=room.capacity,
                is_active=True, start_date=date.today(),
            )
            sched._skip_broadcast = True  # datos de ejemplo: no avisar a nadie
            sched.save()
            created += 1

        for name, slug, kind, credits, price, expire, interval in PLANS:
            Plan.objects.get_or_create(slug=slug, defaults={
                'name': name, 'type': kind, 'credits': credits, 'price_eur': price,
                'credits_expire_days': expire, 'interval': interval,
                'auto_renew': kind == 'sub', 'is_active': True,
            })

        for i, (q, a, q_en, a_en) in enumerate(FAQS):
            # is_sample: se muestran, pero no van a Google como FAQPage hasta que el estudio las edite
            FAQItem.objects.get_or_create(question=q, defaults={
                'answer': a, 'question_en': q_en, 'answer_en': a_en, 'order': i, 'page': 'both',
                'is_sample': True})

        cfg = SiteConfig.load()
        if not cfg.hero_title:
            cfg.hero_title = 'Muévete mejor, siéntete mejor'
            cfg.hero_title_en = 'Move better, feel better'
            cfg.hero_subtitle = 'Pilates y yoga en grupos reducidos. Reserva tu clase en segundos.'
            cfg.hero_subtitle_en = 'Pilates and yoga in small groups. Book your class in seconds.'
            cfg.about_title = 'Un estudio para cuidarte'
            cfg.about_title_en = 'A studio to take care of yourself'
            cfg.about_text = ('Somos un estudio de movimiento consciente. Te acompañamos en cada clase para que '
                              'ganes fuerza, movilidad y calma, sea cual sea tu punto de partida.\n\n'
                              'Cambia este texto en el panel → Ajustes → Contenido de la web.')
            cfg.about_text_en = ('We are a mindful movement studio. We guide you in every class so you gain '
                                 'strength, mobility and calm, whatever your starting point.')
            cfg.save()

        self.stdout.write(self.style.SUCCESS(
            f'Datos de ejemplo cargados: {len(types)} clases, {created} horarios semanales, {len(PLANS)} bonos, '
            f'{len(FAQS)} preguntas frecuentes.'))
