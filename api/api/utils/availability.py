"""
Disponibilidad de slots: ventana de vigencia del horario + excepciones
(ScheduleBlackout). Única fuente de verdad para TODOS los caminos de reserva
(créditos, invitados, reemplazos, auto-reserva) y para el calendario público.

Zona horaria: todas las comparaciones se hacen en HORA DE PARED de
Europe/Madrid. Motivo: las rutas históricas guardaron datetimes con
convenciones mixtas (naive interpretado como UTC vs. aware Madrid), pero la
hora "que ve el usuario" en el calendario es siempre la de Madrid. Comparar en
hora de pared hace que un cierre de '10:00 a 12:00 del 10 de octubre'
signifique exactamente eso, venga el dato de donde venga.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Q

# Zona horaria del estudio (settings.STUDIO_TIMEZONE). El nombre MADRID_TZ es
# histórico: el proyecto nació en España y se usa en muchos sitios.
MADRID_TZ = ZoneInfo(settings.STUDIO_TIMEZONE)


def to_madrid_wall(value):
    """Normaliza un datetime o string ISO a datetime naive en hora de Madrid.

    - Aware → se convierte a Europe/Madrid y se quita el tzinfo.
    - Naive o string sin offset → se asume que YA es hora de pared de Madrid
      (es lo que genera el calendario público y lo que reenvía el frontend).
    Devuelve None si no se puede parsear.
    """
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if value.tzinfo is not None:
        value = value.astimezone(MADRID_TZ).replace(tzinfo=None)
    return value


def blackouts_overlapping(start_wall, end_wall, schedule_ids=None):
    """Blackouts activos cuyo rango (en hora de pared Madrid) solapa
    [start_wall, end_wall). Incluye siempre los globales (schedule=None).

    Se consulta en BD con un margen de ±1 día y se afina en Python en hora de
    pared, para ser robustos frente a datetimes guardados en UTC o Madrid.
    """
    from api.models import ScheduleBlackout
    from datetime import timedelta

    qs = ScheduleBlackout.objects.filter(
        start_datetime__lte=_as_aware_utc(end_wall) + timedelta(days=1),
        end_datetime__gte=_as_aware_utc(start_wall) - timedelta(days=1),
    )
    if schedule_ids is not None:
        qs = qs.filter(Q(schedule__isnull=True) | Q(schedule_id__in=list(schedule_ids)))
    result = []
    for b in qs:
        b_start = to_madrid_wall(b.start_datetime)
        b_end = to_madrid_wall(b.end_datetime)
        if b_start < end_wall and b_end > start_wall:
            result.append((b, b_start, b_end))
    return result


def _as_aware_utc(wall):
    """Hora de pared Madrid → instante aware (para el filtro grueso en BD)."""
    from datetime import timezone as _tz
    return wall.replace(tzinfo=MADRID_TZ).astimezone(_tz.utc)


def slot_unavailable_reason(schedule, slot_start):
    """Devuelve el motivo por el que el slot NO es reservable, o None si lo es.

    - 'inactive'      → la clase está desactivada.
    - 'out_of_window' → la fecha cae fuera de start_date/end_date de la regla
                        (cambios de horario con fecha de efecto).
    - 'blocked'       → hay un ScheduleBlackout (vacaciones/franja/privada).

    `slot_start` puede ser datetime (aware o naive) o string ISO.
    """
    wall = to_madrid_wall(slot_start)
    if wall is None:
        return None  # sin fecha interpretable no bloqueamos aquí (otras validaciones actúan)

    if not schedule.is_active:
        return "inactive"

    if not schedule.is_date_in_window(wall.date()):
        return "out_of_window"

    from api.models import ScheduleBlackout
    for b in ScheduleBlackout.objects.filter(
        Q(schedule__isnull=True) | Q(schedule_id=schedule.id)
    ).filter(
        # filtro grueso en BD (±1 día por el desfase de convenciones)
        start_datetime__lte=_as_aware_utc(wall) + _one_day(),
        end_datetime__gte=_as_aware_utc(wall) - _one_day(),
    ):
        if to_madrid_wall(b.start_datetime) <= wall < to_madrid_wall(b.end_datetime):
            return "blocked"

    return None


def _one_day():
    from datetime import timedelta
    return timedelta(days=1)


UNAVAILABLE_MESSAGES = {
    "inactive": "La clase no está activa.",
    "out_of_window": "La clase no está disponible en esa fecha (fuera de su periodo de vigencia).",
    "blocked": "La clase está cerrada en ese horario (vacaciones, cierre o sesión privada).",
}
