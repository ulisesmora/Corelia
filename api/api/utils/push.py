"""
Envío de notificaciones Web Push (VAPID) con pywebpush.

Uso:
    from api.utils.push import send_push_to_user
    send_push_to_user(user, title="Recordatorio", body="Tu clase empieza a las 10:00",
                      url="/dashboard")

Las suscripciones muertas (410/404: el usuario revocó el permiso o borró el
navegador) se eliminan automáticamente.
"""
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _vapid():
    """(clave privada, claims) de esta instalación. Las claves se generan solas
    la primera vez (api.utils.site.ensure_vapid_keys)."""
    from api.utils.site import ensure_vapid_keys, get_site_config, web_url
    _, private = ensure_vapid_keys()
    cfg = get_site_config()
    contact = cfg.contact_email or cfg.smtp_user
    if contact:
        sub = f"mailto:{contact}"
    elif web_url().startswith('https://'):
        sub = web_url()
    else:
        sub = 'mailto:admin@example.com'
    return private, {"sub": sub}


def _send_one(subscription, payload: dict) -> bool:
    from pywebpush import webpush, WebPushException

    private_key, claims = _vapid()
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims=dict(claims),
            ttl=3600,
        )
        return True
    except WebPushException as e:
        status_code = getattr(getattr(e, "response", None), "status_code", None)
        if status_code in (404, 410):
            # Suscripción caducada/revocada: limpiar
            logger.info("push.subscription_expired sub_id=%s user_id=%s", subscription.id, subscription.user_id)
            subscription.delete()
        else:
            logger.warning(
                "push.send_failed sub_id=%s user_id=%s status=%s error=%s",
                subscription.id, subscription.user_id, status_code, e,
            )
        return False
    except Exception:
        logger.warning("push.send_failed sub_id=%s (error inesperado)", subscription.id, exc_info=True)
        return False


def send_push_to_user(user, title: str, body: str, url: str = "/") -> int:
    """Envía la notificación a todas las suscripciones del usuario.
    Devuelve cuántas se entregaron."""
    payload = {"title": title, "body": body, "url": url}
    sent = 0
    for sub in list(user.push_subscriptions.all()):
        if _send_one(sub, payload):
            sent += 1
    return sent


def send_push_broadcast(title: str, body: str, url: str = "/calendar") -> int:
    """Push a TODOS los dispositivos suscritos (p. ej. «nueva clase disponible»).
    Itera las suscripciones directamente para no hacer una query por usuario.
    Devuelve cuántas se entregaron."""
    from api.models import PushSubscription

    payload = {"title": title, "body": body, "url": url}
    sent = 0
    for sub in list(PushSubscription.objects.all()):
        if _send_one(sub, payload):
            sent += 1
    logger.info("push.broadcast title=%r sent=%s", title, sent)
    return sent


def send_schedule_change_push(user, class_title: str, old_dt, new_dt) -> int:
    """Push de «tu clase cambia de horario» (movida, no cancelada).
    Nunca lanza: una notificación fallida no debe romper el cambio."""
    try:
        from api.utils.availability import to_madrid_wall
        old_w, new_w = to_madrid_wall(old_dt), to_madrid_wall(new_dt)
        return send_push_to_user(
            user,
            title="🔁 Cambio de horario",
            body=f"Tu clase de {class_title} del {old_w:%d/%m} pasa de las "
                 f"{old_w:%H:%M} a las {new_w:%H:%M} el {new_w:%d/%m}. "
                 f"Tu plaza se ha movido automáticamente.",
            url="/dashboard",
        )
    except Exception:
        logger.warning("push.schedule_change_failed user_id=%s", getattr(user, "id", "?"), exc_info=True)
        return 0


def send_cancellation_push(user, class_title: str, start_dt) -> int:
    """Push de cancelación de clase — copy unificado para todos los flujos
    (blackout que pisa reservas, aforo insuficiente, horario eliminado).
    Nunca lanza: una notificación fallida no debe romper una cancelación."""
    try:
        from api.utils.availability import to_madrid_wall
        wall = to_madrid_wall(start_dt)
        cuando = f" del {wall:%d/%m a las %H:%M}" if wall else ""
        return send_push_to_user(
            user,
            title="❌ Clase cancelada",
            body=f"Tu clase de {class_title}{cuando} ha sido cancelada. "
                 f"Si usaste créditos, ya los tienes de vuelta.",
            url="/dashboard",
        )
    except Exception:
        logger.warning("push.cancellation_failed user_id=%s", getattr(user, "id", "?"), exc_info=True)
        return 0
