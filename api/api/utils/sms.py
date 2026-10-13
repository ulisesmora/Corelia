"""Avisos de cancelación a clientas (email + WhatsApp opcional) y formato de
fechas en lenguaje natural."""
import logging
import os

import requests
from django.conf import settings

from api.utils.site import studio_name, web_url

logger = logging.getLogger(__name__)

_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
          'septiembre', 'octubre', 'noviembre', 'diciembre']


def format_class_date(value) -> str:
    """'martes 6 de octubre a las 09:30' en la hora del estudio."""
    from api.utils.availability import to_madrid_wall
    local = to_madrid_wall(value)
    if local is None:
        return str(value)
    return f"{_DIAS[local.weekday()]} {local.day} de {_MESES[local.month - 1]} a las {local:%H:%M}"


def _refund_line(person) -> str:
    # GuestProfile (invitada) pagó con tarjeta; User usa créditos
    if not hasattr(person, 'first_name'):
        return "Si la pagaste con tarjeta, te devolvemos el importe automáticamente (tarda unos días en verse en tu banco)."
    return "Si usaste créditos, ya los tienes de vuelta en tu cuenta para reservar otra clase."


def _app_hint(person) -> str:
    """Si la clienta no tiene la app con avisos, este es el mejor momento
    para sugerirla: acaba de ver por qué sirve."""
    try:
        if hasattr(person, 'push_subscriptions') and not person.push_subscriptions.exists():
            return (f" Consejo: instala la app de {studio_name()} desde {web_url()} y te avisaremos "
                    "al instante la próxima vez que cambie una de tus clases.")
    except Exception:
        pass
    return ""


def notify_cancellation_email(user, class_name, date_str):
    """Acepta User o GuestProfile (las invitadas tienen `name`, no `first_name`)."""
    if not user.email:
        return
    from api.utils.emailing import send_templated_email
    send_templated_email(
        to_email=user.email,
        template_id="class-cancellation",
        dynamic_data={
            "name": getattr(user, "first_name", None) or getattr(user, "name", None) or "",
            "headline": "Clase cancelada",
            "intro_copy": (f"Lamentamos informarte de que la clase de '{class_name}' del "
                           f"{format_class_date(date_str)} ha sido cancelada. {_refund_line(user)}"
                           + _app_hint(user)),
            "cta_text": "Ver el calendario",
            "cta_url": web_url('/calendar'),
        },
        subject="Tu clase ha sido cancelada",
    )


def send_whatsapp_cancellation(user, class_title, start_datetime_aware):
    """WhatsApp automático vía un servidor whatsmeow propio (opcional y
    avanzado: sin WHATSAPP_OUTBOX_URL no se envía nada)."""
    url = getattr(settings, 'WHATSAPP_OUTBOX_URL', '')
    if not url:
        return
    if not getattr(user, 'phone', None):
        return

    message_body = (
        f"Hola {getattr(user, 'first_name', None) or getattr(user, 'name', None) or ''}, lamentamos informarte que la clase "
        f"*{class_title}* del *{format_class_date(start_datetime_aware)}* ha sido cancelada.\n\n"
        f"✅ {_refund_line(user)}\n\n"
        f"Puedes elegir otra clase en {web_url('/calendar')}\n\n"
        f"Disculpa las molestias,\n"
        f"El equipo de {studio_name()}."
    )
    payload = {
        "message": message_body,
        "botId": int(os.getenv('WHATSAPP_BOT_ID', '0') or 0),
        "phoneNumber": user.phone,
        "buttons_header": "urgent",
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        logger.info("whatsapp.sent user_pk=%s", user.pk)
    except requests.exceptions.RequestException:
        logger.error("whatsapp.failed user_pk=%s", user.pk, exc_info=True)
