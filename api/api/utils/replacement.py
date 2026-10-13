"""
Flujo de "tu clase habitual ya no existe" para suscriptoras con auto-reserva.

Cuando una clase recurrente desaparece del horario (se elimina desde el CRM,
se termina con apply_from end_only, o la auto-reserva descubre que la regla
ya no está vigente), las preferencias que apuntaban a ella se desactivan y a
cada afectada se le ofrecen hasta 3 alternativas (misma categoría) durante
7 días, avisándola por email y push. La web muestra el banner de reemplazo
vía /v1/my-replacement-status/ y reserva con /v1/choose-replacement/.
"""
import logging

from django.utils import timezone
from api.utils.site import web_url

logger = logging.getLogger(__name__)

GENERIC_TEMPLATE = "generic-notice"  # headline/intro/cta (emails/generic_notice.html)
REPLACEMENT_DAYS = 7


def _alternatives_for(schedule, limit=3):
    """Hasta `limit` clases activas de la misma categoría, priorizando el
    mismo día de la semana. Incluye weekday para que el front pueda calcular
    la próxima fecha reservable."""
    from api.models import RecurringSchedule

    base = RecurringSchedule.objects.filter(
        class_type__category=schedule.class_type.category,
        is_active=True,
        is_recurrent=True,
        weekday__isnull=False,
        deleted_at__isnull=True,
    ).exclude(id=schedule.id).select_related('class_type', 'room')

    same_day = list(base.filter(weekday=schedule.weekday)[:limit])
    if len(same_day) < limit:
        extra = base.exclude(id__in=[s.id for s in same_day])[: limit - len(same_day)]
        same_day.extend(extra)

    return [
        {
            'id': alt.id,
            'title': alt.class_type.title,
            'title_en': alt.class_type.title_en or alt.class_type.title,
            'room': alt.room.name,
            'room_en': alt.room.title_en or alt.room.name,
            'weekday': alt.weekday,
            'start_time': alt.start_time.strftime('%H:%M'),
        }
        for alt in same_day
    ]


def retire_schedule_preferences(schedule, reason_text, notify=True):
    """Desactiva las preferencias de auto-reserva de `schedule`, marca a cada
    usuaria con el flag de reemplazo (con alternativas) y la avisa por email
    y push. Devuelve cuántas usuarias fueron afectadas.

    `reason_text` es la frase en llano para el aviso, p. ej.
    "ya no está en el horario" o "termina el 30/09".
    Nunca lanza: se llama desde flujos de admin que no deben romperse.
    """
    from django.contrib.auth import get_user_model
    from api.models import UserClassPreference
    from api.utils.emailing import send_templated_email
    from api.utils.push import send_push_to_user

    try:
        prefs = list(
            UserClassPreference.objects.filter(
                schedule=schedule, is_active=True, deleted_at__isnull=True,
            ).select_related('user')
        )
        if not prefs:
            return 0

        now = timezone.now()
        deadline = now + timezone.timedelta(days=REPLACEMENT_DAYS)
        alternatives = _alternatives_for(schedule)
        class_title = schedule.class_type.title

        UserClassPreference.objects.filter(id__in=[p.id for p in prefs]).update(
            is_active=False, updated_at=now,
        )

        User = get_user_model()
        User.objects.filter(id__in=[p.user_id for p in prefs]).update(
            needs_class_replacement=True,
            replacement_class_options=alternatives,
            replacement_deadline=deadline,
        )

        if notify:
            for pref in prefs:
                user = pref.user
                try:
                    send_push_to_user(
                        user,
                        title='📅 Tu clase habitual cambia',
                        body=f'{class_title} {reason_text}. '
                             f'Elige una clase alternativa en tu panel — '
                             f'tienes hasta el {deadline:%d/%m}.',
                        url='/dashboard?tab=clases',
                    )
                except Exception:
                    logger.warning("replacement.push_failed user_id=%s", user.id, exc_info=True)
                if user.email:
                    try:
                        alt_lines = ' · '.join(
                            f"{a['title']} ({a['start_time']}, {a['room']})" for a in alternatives
                        ) or 'Consulta el calendario para ver todas las clases.'
                        send_templated_email(
                            to_email=user.email,
                            template_id=GENERIC_TEMPLATE,
                            dynamic_data={
                                'name': user.first_name or '',
                                'headline': 'Tu clase habitual cambia',
                                'intro_copy': (
                                    f'Tu clase habitual de {class_title} {reason_text}, así que '
                                    f'hemos pausado su reserva automática. Puedes elegir una '
                                    f'alternativa desde tu panel hasta el {deadline:%d/%m/%Y}. '
                                    f'Sugerencias: {alt_lines}'
                                ),
                                'cta_text': 'Elegir otra clase',
                                'cta_url': web_url('/dashboard?tab=clases'),
                            },
                        )
                    except Exception:
                        logger.warning("replacement.email_failed user_id=%s", user.id, exc_info=True)

        logger.info(
            "replacement.flagged schedule_id=%s users=%s alternatives=%s reason=%r",
            schedule.id, len(prefs), len(alternatives), reason_text,
        )
        return len(prefs)
    except Exception:
        logger.error("replacement.retire_failed schedule_id=%s", schedule.id, exc_info=True)
        return 0
