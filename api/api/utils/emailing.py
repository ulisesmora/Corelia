"""Envío de emails con el SMTP propio del estudio (Gmail, Resend, Brevo…).

El servidor se configura desde el panel (SiteConfig) o, como alternativa, con
las variables EMAIL_HOST/EMAIL_HOST_USER/… Si no hay ninguno configurado, los
emails se OMITEN (se registra en el log) y el resto del sistema funciona
igual: las reservas, los avisos push y el panel no dependen del email.

Las plantillas son HTML de Django en api/templates/emails/. Todas reciben
además las variables de marca (brand_name, brand_logo, brand_color, web_url…)
sin que cada llamada tenga que pasarlas.
"""
import logging
from email.utils import formataddr
from typing import Dict, List, Optional

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from api.models import BroadcastEmail, User

logger = logging.getLogger(__name__)


TEMPLATE_FILES: Dict[str, str] = {
    'booking-guest': 'emails/booking_confirmation_guest.html',
    'booking-credits': 'emails/booking_confirmation_credits.html',
    'welcome': 'emails/lead_welcome.html',
    'verification': 'emails/user_verification.html',
    'plan-purchase': 'emails/plan_purchase.html',
    'new-class': 'emails/new_class_notification.html',
    'broadcast': 'emails/broadcast.html',
    'class-cancellation': 'emails/class_cancellation.html',
    'password-recovery': 'emails/password_recovery.html',
    # Avisos genéricos: name/headline/intro_copy/cta_text/cta_url
    'generic-notice': 'emails/generic_notice.html',
}


# ─── Configuración del servidor ───────────────────────────────────────────────

def _smtp_settings() -> Optional[dict]:
    """Parámetros SMTP efectivos (panel > entorno) o None si no hay email."""
    from api.utils.site import get_site_config
    cfg = get_site_config()
    if cfg.email_enabled and cfg.smtp_host:
        return {
            'host': cfg.smtp_host,
            'port': cfg.smtp_port,
            'username': cfg.smtp_user,
            'password': cfg.smtp_password,
            'use_tls': cfg.smtp_use_tls and not cfg.smtp_use_ssl,
            'use_ssl': cfg.smtp_use_ssl,
            'from_address': cfg.email_from_address or cfg.smtp_user,
            'from_name': cfg.email_from_name or cfg.studio_name,
        }
    if settings.EMAIL_HOST:
        return {
            'host': settings.EMAIL_HOST,
            'port': settings.EMAIL_PORT,
            'username': settings.EMAIL_HOST_USER,
            'password': settings.EMAIL_HOST_PASSWORD,
            'use_tls': settings.EMAIL_USE_TLS and not settings.EMAIL_USE_SSL,
            'use_ssl': settings.EMAIL_USE_SSL,
            'from_address': settings.DEFAULT_FROM_EMAIL,
            'from_name': cfg.studio_name,
        }
    return None


def email_enabled() -> bool:
    return _smtp_settings() is not None


def _connection(smtp: dict):
    return get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        host=smtp['host'], port=smtp['port'],
        username=smtp['username'], password=smtp['password'],
        use_tls=smtp['use_tls'], use_ssl=smtp['use_ssl'],
        timeout=settings.EMAIL_TIMEOUT,
    )


def _render(template_id: str, context: dict) -> Optional[str]:
    template_file = TEMPLATE_FILES.get(template_id)
    if not template_file:
        logger.error("email.unknown_template template=%s", template_id)
        return None
    from api.utils.site import brand_context
    try:
        return render_to_string(template_file, {**brand_context(), **context})
    except Exception:
        logger.exception("email.render_failed template=%s", template_file)
        return None


def _build_message(smtp, to_email, subject, html, connection):
    msg = EmailMultiAlternatives(
        subject=subject,
        body=strip_tags(html),
        from_email=formataddr((smtp['from_name'], smtp['from_address'])),
        to=[to_email],
        reply_to=[smtp['from_address']],
        connection=connection,
    )
    msg.attach_alternative(html, 'text/html')
    return msg


def _skip_recipient(to_email: str) -> bool:
    from api.utils.verification import is_placeholder_email
    return not to_email or is_placeholder_email(to_email)


# ─── API pública ──────────────────────────────────────────────────────────────

def send_templated_email(
    to_email: str,
    template_id: str,
    dynamic_data: Dict,
    subject: Optional[str] = None,
) -> bool:
    """Renderiza una plantilla y la envía. Devuelve True si salió.
    Nunca lanza: un fallo de email no debe romper una reserva o un pago."""
    smtp = _smtp_settings()
    if smtp is None:
        logger.info("email.skipped reason=not_configured template=%s", template_id)
        return False
    if _skip_recipient(to_email):
        return False
    html = _render(template_id, dynamic_data)
    if html is None:
        return False
    from api.utils.site import studio_name
    email_subject = subject or dynamic_data.get('subject') or f'Mensaje de {studio_name()}'
    try:
        conn = _connection(smtp)
        sent = _build_message(smtp, to_email, email_subject, html, conn).send()
        return bool(sent)
    except Exception:
        logger.exception("email.send_failed template=%s", template_id)
        return False


def send_bulk_templated_email(
    template_id: str,
    personalizations_data: List[Dict],
    subject: Optional[str] = None,
) -> bool:
    """Envía la misma plantilla a muchas personas reutilizando UNA conexión
    SMTP. personalizations_data = [{'to_email': ..., 'dynamic_data': {...}}].
    Ojo con los límites del proveedor (Gmail: ~500 al día)."""
    if not personalizations_data:
        return True
    smtp = _smtp_settings()
    if smtp is None:
        logger.info("email.bulk_skipped reason=not_configured template=%s n=%s",
                    template_id, len(personalizations_data))
        return False
    from api.utils.site import studio_name
    messages = []
    conn = _connection(smtp)
    for p in personalizations_data:
        to_email = p.get('to_email')
        data = p.get('dynamic_data') or {}
        if _skip_recipient(to_email) or not data:
            continue
        html = _render(template_id, data)
        if html is None:
            continue
        email_subject = subject or data.get('subject') or f'Mensaje de {studio_name()}'
        messages.append(_build_message(smtp, to_email, email_subject, html, conn))
    if not messages:
        return True
    try:
        sent = conn.send_messages(messages) or 0
        logger.info("email.bulk_sent template=%s sent=%s of=%s", template_id, sent, len(messages))
        return sent > 0
    except Exception:
        logger.exception("email.bulk_failed template=%s", template_id)
        return False


def send_test_email(to_email: str, smtp_override: Optional[dict] = None) -> None:
    """Email de prueba del asistente. A diferencia del resto, SÍ lanza la
    excepción para poder explicar en el panel qué ha fallado."""
    smtp = smtp_override or _smtp_settings()
    if smtp is None:
        raise ValueError('El email no está configurado.')
    html = _render('generic-notice', {
        'name': '',
        'headline': '¡Los emails funcionan! ✅',
        'intro_copy': 'Este es un email de prueba. A partir de ahora tus clientas recibirán '
                      'las confirmaciones de reserva, avisos y recordatorios desde esta dirección.',
        'cta_text': '', 'cta_url': '',
    })
    conn = _connection(smtp)
    _build_message(smtp, to_email, 'Email de prueba', html, conn).send(fail_silently=False)


# ─── Emails masivos (Comunicados) ─────────────────────────────────────────────

def send_broadcast_email_task(broadcast_id: int):
    logger.info("[Broadcast] Starting task for ID: %d", broadcast_id)

    try:
        instance = BroadcastEmail.objects.get(id=broadcast_id)
    except BroadcastEmail.DoesNotExist:
        logger.error("[Broadcast] ID %d not found.", broadcast_id)
        return

    if instance.sent_at:
        logger.info("[Broadcast] ID %d ya enviado el %s — se omite.", broadcast_id, instance.sent_at)
        return

    emails_sent = 0
    pushes_sent = 0
    email_ok = True

    # ── 1. Email masivo ──
    if instance.send_email:
        common_data = {
            "subject": instance.subject,
            "title": instance.title,
            "description": instance.description,
            "highlight": instance.highlighted_text or "",
            "has_highlight": bool(instance.highlighted_text),
        }
        users_to_notify = User.objects.filter(is_active=True, is_staff=False).values("email", "first_name")
        personalizations_data = [
            {"to_email": user["email"], "dynamic_data": {"name": user["first_name"] or "", **common_data}}
            for user in users_to_notify
            if user["email"]
        ]
        if personalizations_data:
            email_ok = send_bulk_templated_email(
                template_id='broadcast',
                personalizations_data=personalizations_data,
                subject=instance.subject,
            )
            if email_ok:
                emails_sent = len(personalizations_data)
            else:
                logger.error("[Broadcast] email send failed or email not configured.")

    # ── 2. Push a todos los dispositivos suscritos ──
    # Cuerpo corto: el texto destacado si existe; si no, el inicio de la descripción.
    if instance.send_push:
        try:
            from api.utils.push import send_push_broadcast
            body_src = (instance.highlighted_text or instance.description or "").strip()
            body = body_src if len(body_src) <= 140 else body_src[:137].rstrip() + "…"
            pushes_sent = send_push_broadcast(
                title=instance.title or instance.subject,
                body=body,
                url=instance.push_url or "/",
            )
        except Exception:
            logger.error("[Broadcast] Push broadcast failed for ID %d", broadcast_id, exc_info=True)

    # Se marca enviado si al menos un canal salió (evita reenvíos duplicados)
    if (instance.send_email and email_ok) or (instance.send_push and not instance.send_email):
        instance.sent_at = timezone.now()
    instance.emails_sent = emails_sent
    instance.pushes_sent = pushes_sent
    instance.save(update_fields=["sent_at", "emails_sent", "pushes_sent"])
    logger.info("[Broadcast] ID %d → emails=%d pushes=%d", broadcast_id, emails_sent, pushes_sent)
