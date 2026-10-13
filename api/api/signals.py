# app/signals.py
import uuid
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .models import Booking, ClassType, BroadcastEmail, CreditLedgerEntry, CreditWallet, Lead, Payment, RecurringSchedule, User, Event
from .utils.emailing import send_broadcast_email_task, send_bulk_templated_email, send_templated_email
import logging
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from api.utils.site import studio_name, web_url

from api.utils.availability import MADRID_TZ  # noqa: E402  (zona del estudio)
logger = logging.getLogger(__name__)

@receiver(post_save, sender=Lead)
def send_welcome_email_on_lead_created(sender, instance: Lead, created: bool, **kwargs):
    """
    Cuando se crea un Lead, envía un email usando plantilla dinámica.
    """
    if not created:
        return

    data = {
        "name": instance.name or "",
        "email": instance.email,
        "city": instance.city or "",
        "experience_level": instance.experience_level or "",
        "primary_goal": instance.goal_primary or "",
        "cta_url": web_url("/dashboard"),
        "cta_text": "Accede a tu cuenta",
        "headline": f"¡Te damos la bienvenida a {studio_name()}!",
        "intro_copy": "Gracias por registrarte. Ya puedes ver el horario y reservar tu primera clase.",
    }

    template_id = "welcome"
    if not template_id:
        logger.warning("SENDGRID_TEMPLATE_NEW_LEAD no configurada; se omite envío.")
        return

    ok = send_templated_email(
        to_email=instance.email,
        template_id=template_id,
        dynamic_data=data,
    )
    if ok:
        logger.info("Email de bienvenida enviado a %s", instance.email)
    else:
        logger.error("Fallo enviando email de bienvenida a %s", instance.email)



# OJO: aquí había un SEGUNDO @receiver(post_save, sender=Lead) con el mismo
# nombre de función que el de arriba pero con dynamic_data incompleto (solo
# name/email/city): como el nombre pisaba al primero, el email de bienvenida
# salía SIN headline, sin texto y con el botón sin enlace. Eliminado; queda el
# receiver completo de arriba.


@receiver(post_save, sender=User)
def create_wallet_for_new_user(sender, instance: User, created: bool, **kwargs):
    """Todo usuario nace con monedero: sin esto, añadirle créditos desde el
    panel fallaba porque el wallet solo se creaba en su primera compra."""
    if created:
        CreditWallet.objects.get_or_create(user=instance)


# --- Verificación de email al crear la cuenta (código de 6 dígitos + enlace) ---
@receiver(post_save, sender=User)
def send_verification_email_on_user_created(sender, instance: User, created: bool, **kwargs):
    if not created or instance.is_staff or instance.is_verified:
        return
    from api.utils.verification import is_placeholder_email, send_verification
    # Altas desde el panel sin email usan una dirección inventada (PLACEHOLDER_EMAIL_DOMAIN):
    # no se le envía nada (rebotaría y perjudica la reputación del dominio).
    if is_placeholder_email(instance.email):
        return
    # Tras el commit: si el alta se revierte, no mandamos un código huérfano.
    transaction.on_commit(lambda: send_verification(User.objects.get(pk=instance.pk)))


@receiver(post_save, sender=Payment)
def send_payment_confirmation_email(sender, instance: Payment, **kwargs):
    if instance.guest == None:
        return
    if instance.status == 'succeeded':
        
        try:
            # --- 2. Recopilar la Información ---
            user = instance.guest 
            
            # Obtenemos los bookings (¡CON LA CORRECCIÓN!)
            # Optimizamos la query igual que en tu otro signal
            bookings = instance.bookings.all().select_related(
                'occurrence__class_type'
            )

            if not bookings.exists():
                logger.warning(f"Payment {instance.id} 'succeeded' pero no tiene bookings. No se envía email.")
                return

            # --- 3. Formatear los datos (¡CON LA CORRECCIÓN!) ---
            bookings_data_for_email = []
            for booking in bookings:
                schedule = booking.occurrence
                local_dt = booking.start_datetime.astimezone(MADRID_TZ)
                bookings_data_for_email.append({
                    "clase": schedule.class_type.title,
                    "fecha": local_dt.strftime("%d/%m/%Y"),
                    "hora": local_dt.strftime("%H:%M"),
                })

            dynamic_data = {
                "name": user.name or "",
                "payment_id": str(instance.id),
                "payment_total": f"€{instance.amount_eur:.2f}", 
                "payment_date": instance.created_at.strftime("%d/%m/%Y"), 
                "bookings_list": bookings_data_for_email, 
                "total_reservas": str(len(bookings_data_for_email)),
                "cta_url": web_url("/dashboard"),
                "cta_text": "Ver mis reservas",
            }
            
            template_id = "booking-guest" 

            # --- 4. Enviar el Email ---
            ok = send_templated_email(
                to_email=user.email,
                template_id=template_id,
                dynamic_data=dynamic_data,
                subject='clase reservada'
            )

            if ok:
                logger.info(f"Email de confirmación de pago enviado a {user.email} para Payment {instance.id}")
            else:
                logger.error(f"Fallo enviando email de confirmación a {user.email} para Payment {instance.id}")
        
        except Exception as e:
            logger.critical(f"Error CRÍTICO en signal send_payment_confirmation_email para Payment {instance.id}: {e}", exc_info=True)
            

@receiver(post_save, sender=Payment)
def send_plan_purchase_confirmation_email(sender, instance: Payment, **kwargs):

    if instance.status != 'succeeded':
        return

    if not instance.user:
        return

    try:
        user = instance.user
        
        # --- PREPARAR DATOS PARA EL TEMPLATE ---
        # Las claves del diccionario deben coincidir con {{variable}} en tu HTML
        dynamic_data = {
            "name": user.first_name or "Usuario", # Fallback por seguridad
            "payment_id": str(instance.id),
            "payment_date": instance.created_at.strftime("%d/%m/%Y"), # Ej: 25/10/2023
            "payment_total": f"€{instance.amount_eur:.2f}",
        }

        # --- ID DEL TEMPLATE DE SENDGRID ---
        template_id = "plan-purchase" 

        # --- ENVIAR ---
        ok = send_templated_email(
            to_email=user.email,
            template_id=template_id,
            dynamic_data=dynamic_data,
            subject='Confirmación de compra de créditos'
        )

        if ok:
            logger.info(f"Email de PLAN enviado a {user.email} para Payment {instance.id}")
        else:
            logger.error(f"Fallo enviando email de PLAN a {user.email}")

    except Exception as e:
        logger.critical(f"Error en send_plan_purchase_confirmation_email: {e}", exc_info=True)
            
                        
@receiver(post_save, sender=CreditLedgerEntry)
def send_credit_booking_confirmation_email(sender, instance: CreditLedgerEntry, created: bool, **kwargs):
    if not created or instance.kind != 'spend':
        return
        
    try:
        # --- 2. Recopilar la Información ---
        
        # Obtenemos el wallet y el usuario
        wallet = instance.wallet
        user = wallet.user # Asumo que tu modelo Wallet tiene un FK a User
        
        # Obtenemos los IDs de los bookings desde el metadata
        booking_ids = instance.metadata.get('booking_ids')
        if not booking_ids:
            logger.warning(f"Ledger Entry {instance.id} 'spend' no tiene booking_ids. No se envía email.")
            return

        # Buscamos los bookings en la BBDD
        bookings = Booking.objects.filter(id__in=booking_ids).select_related(
            'occurrence__class_type' # Optimizamos la query
        )
        

        # --- 3. Formatear los datos para la plantilla ---
        bookings_data_for_email = []
        for booking in bookings:
            schedule = booking.occurrence
            local_dt = booking.start_datetime.astimezone(MADRID_TZ)
            bookings_data_for_email.append({
                "clase": schedule.class_type.title,
                "fecha": local_dt.strftime("%d/%m/%Y"),
                "hora": local_dt.strftime("%H:%M"),
            })
            

        # Datos dinámicos para la plantilla
        dynamic_data = {
            "name": user.first_name or "",
            
            # Datos de la transacción de créditos
            "credits_spent": str(abs(instance.amount)), # El 'amount' es negativo, usamos abs()
            "new_balance": str(wallet.balance), # La @property ya estará actualizada
            "transaction_date": instance.created_at.strftime("%d/%m/%Y"),
            
            # ¡Aquí pasamos la lista de reservas!
            "bookings_list": bookings_data_for_email, 
            "total_reservas": str(len(bookings_data_for_email)),
            
            "cta_url": web_url("/dashboard"),
            "cta_text": "Ver mis reservas",
        }
        
        # DEBES crear una nueva variable en settings.py para esta plantilla
        template_id = "booking-credits" 

        # --- 4. Enviar el Email ---
        ok = send_templated_email(
            to_email=user.email,
            template_id=template_id,
            dynamic_data=dynamic_data,
            subject='clase reservada'
        )

        if ok:
            logger.info(f"Email de confirmación (créditos) enviado a {user.email} para Ledger Entry {instance.id}")
            
        else:
            logger.error(f"Fallo enviando email de confirmación (créditos) a {user.email} para Ledger Entry {instance.id}")
    
    except Exception as e:
        logger.critical(f"Error CRÍTICO en signal send_credit_booking_confirmation_email para Ledger {instance.id}: {e}", exc_info=True)
        
    



def do_bulk_email_after_commit(schedule_id: int, is_new: bool):
    logger.info(f"[on_commit] Tarea iniciada para Schedule ID: {schedule_id}")
    
    try:
        # Volvemos a consultar la instancia (con los datos que necesita)
        instance = RecurringSchedule.objects.select_related(
            "class_type", "override_instructor"
        ).get(id=schedule_id)
    except RecurringSchedule.DoesNotExist:
        logger.error("[on_commit] La RecurringSchedule ID %s no existe.", schedule_id)
        return
    
    if instance.deleted_at:
        logger.info("Signal ignorada: La clase %s está siendo borrada (soft-delete).", instance.id)
        return

    # 1. Preparar datos comunes de la plantilla
    try:
        class_type = instance.class_type
        instructor = instance.override_instructor or class_type.instructor
        
        # Formatear el día
        weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        class_day = instance.start_date
        
        if instance.is_recurrent:
            class_day = weekdays[instance.weekday]
        
        # Datos que serán iguales para todos
        common_data = {
            "class_title": class_type.title,
            "class_schedule": f"{class_day} a las {instance.start_time.strftime('%H:%M')}",
            "class_image": class_type.image or "https://via.placeholder.com/400x250",
            "instructor_name": instructor.name if instructor else "Instructor",
            "cta_url": web_url(f"/classdetail/{class_type.slug}") # URL para ver el horario
        }
        
        # Asunto del correo (diferente si es nueva o actualizada)
        if is_new:
            subject = f"¡Nueva clase disponible: {class_type.title}!"
        else:
            subject = f"Actualización en nuestra clase: {class_type.title}"

    except Exception as e:
        logger.error("[on_commit] Error al preparar datos de la clase %s: %s", schedule_id, e)
        return

    users_to_notify = User.objects.filter(
        is_active=True, 
        is_staff=False
    ).values('email', 'first_name') # .values() es mucho más rápido
    
    personalizations_data = []
    
    for user in users_to_notify:
        personalizations_data.append({
            "to_email": user['email'],
            "dynamic_data": {
                "name": user['first_name'] or user['email'],
                # Datos comunes de la clase
                **common_data
            }
        })
        
    if not personalizations_data:
        logger.info("[on_commit] No hay usuarios para notificar.")
        return
    template_id = "new-class" 
    
    ok = send_bulk_templated_email(
        template_id=template_id,
        personalizations_data=personalizations_data,
        subject=subject
    )

    if ok:
        logger.info("[on_commit] Envío masivo de %s emails completado.", len(personalizations_data))
    else:
        logger.error("[on_commit] Fallo en envío masivo.")

    # Push a todos los dispositivos suscritos (además del email). Un fallo
    # aquí no debe afectar al alta de la clase ni al envío de emails.
    try:
        from api.utils.push import send_push_broadcast
        send_push_broadcast(
            title=f"🧘 Nueva clase: {class_type.title}",
            body=f"{common_data['class_schedule']} con {common_data['instructor_name']}. ¡Reserva tu plaza!",
            url=f"/classdetail/{class_type.slug}",
        )
    except Exception:
        logger.warning("push.broadcast_failed schedule_id=%s", schedule_id, exc_info=True)



def do_bulk_email_after_commit_event(schedule_id: int, is_new: bool):
    logger.info(f"[on_commit] Tarea iniciada para Schedule ID: {schedule_id}")
    
    try:
        # Volvemos a consultar la instancia (con los datos que necesita)
        instance = Event.objects.select_related(
            "class_type", "override_instructor"
        ).get(id=schedule_id)
    except Event.DoesNotExist:
        logger.error("[on_commit] La RecurringSchedule ID %s no existe.", schedule_id)
        return
    
    if instance.deleted_at:
        logger.info("Signal ignorada: La clase %s está siendo borrada (soft-delete).", instance.id)
        return

    # 1. Preparar datos comunes de la plantilla
    try:
        class_type = instance.class_type
        instructor = instance.override_instructor or class_type.instructor
        
        
        
        # Fecha legible en hora de Madrid (antes salía el datetime crudo en UTC)
        local_dt = instance.start_datetime.astimezone(MADRID_TZ)

        # Datos que serán iguales para todos
        common_data = {
            "class_title": class_type.title,
            "class_schedule": f"{local_dt.strftime('%d/%m/%Y')} a las {local_dt.strftime('%H:%M')}",
            "class_image": class_type.image or "https://via.placeholder.com/400x250",
            "instructor_name": instructor.name if instructor else "Instructor",
            "cta_url": web_url("/calendar") # URL para ver el horario
        }
        
        # Asunto del correo (diferente si es nueva o actualizada)
        if is_new:
            subject = f"¡Nuevo evento disponible: {instance.title}!"
        else:
            subject = f"Actualización en nuestra clase: {instance.title}"

    except Exception as e:
        logger.error("[on_commit] Error al preparar datos de la clase %s: %s", schedule_id, e)
        return

    users_to_notify = User.objects.filter(
        is_active=True, 
        is_staff=False
    ).values('email', 'first_name') # .values() es mucho más rápido
    
    personalizations_data = []
    
    for user in users_to_notify:
        personalizations_data.append({
            "to_email": user['email'],
            "dynamic_data": {
                "name": user['first_name'] or user['email'],
                # Datos comunes de la clase
                **common_data
            }
        })
        
    if not personalizations_data:
        logger.info("[on_commit] No hay usuarios para notificar.")
        return
    template_id = "new-class" 
    
    ok = send_bulk_templated_email(
        template_id=template_id,
        personalizations_data=personalizations_data,
        subject=subject
    )

    if ok:
        logger.info("[on_commit] Envío masivo de %s emails completado.", len(personalizations_data))
    else:
        logger.error("[on_commit] Fallo en envío masivo.")

    # Push a todos los dispositivos suscritos (además del email)
    try:
        from api.utils.push import send_push_broadcast
        send_push_broadcast(
            title=f"✨ Nuevo evento: {instance.title}",
            body=f"{common_data['class_schedule']}. ¡Reserva tu plaza!",
            url="/calendar",  # los eventos no tienen página propia en la web
        )
    except Exception:
        logger.warning("push.broadcast_failed event_id=%s", schedule_id, exc_info=True)

# --- Este es el Signal (Receptor) ---
@receiver(post_save, sender=RecurringSchedule)
def send_new_class_notification_on_commit(sender, instance: RecurringSchedule, created: bool, **kwargs):
    # FIX: solo al CREAR. Antes cada edición (corregir una errata, cambiar
    # aforo, el toggle de activo…) mandaba un email masivo a toda la base.
    if not created:
        return
    if not instance.is_active:
        logger.info("Signal ignorada: La clase %s está inactiva.", instance.id)
        return
    # apply_from clona la regla para un cambio de horario con fecha de efecto:
    # es una continuación, no una clase nueva — no avisar.
    if getattr(instance, '_skip_broadcast', False):
        logger.info("broadcast.skipped schedule_id=%s reason=apply_from_clone", instance.id)
        return

    logger.info("Signal detectada: Clase %s creada. Encolando 'on_commit'...", instance.id)

    transaction.on_commit(
        lambda: do_bulk_email_after_commit(instance.id, created)
    )

@receiver(post_save, sender=Event)
def send_new_event_notification_on_commit(sender, instance, created: bool, **kwargs):
    # FIX: solo al CREAR (misma razón que en RecurringSchedule)
    if not created:
        return
    if not instance.is_active:
        logger.info("Signal ignorada: El evento %s está inactivo.", instance.id)
        return
    if getattr(instance, '_skip_broadcast', False):
        return

    logger.info("Signal detectada: Evento %s creado. Encolando 'on_commit'...", instance.id)

    transaction.on_commit(
        lambda: do_bulk_email_after_commit_event(instance.id, created)
    )
    


@receiver(post_save, sender=BroadcastEmail)
def trigger_broadcast_email(sender, instance, created, **kwargs):
    """
    Cuando se crea un nuevo BroadcastEmail, programamos el envío
    para después de que se confirme la transacción en la BD.
    """
    if created and not instance.sent_at:
        # Usamos lambda para pasar el argumento
        transaction.on_commit(lambda: send_broadcast_email_task(instance.id))


@receiver(post_save, sender=ClassType)
def class_type_indexnow(sender, instance, **kwargs):
    """Clase creada o editada → avisar a buscadores para que la (re)indexen ya."""
    if not instance.slug or instance.deleted_at:
        return
    from django.db import transaction
    from api.utils.indexnow import class_urls

    def _send():
        try:
            from api.tasks import ping_indexnow
            ping_indexnow.delay(class_urls(instance.slug))
        except Exception:
            logger.warning("indexnow.enqueue_failed slug=%s", instance.slug, exc_info=True)
    transaction.on_commit(_send)
