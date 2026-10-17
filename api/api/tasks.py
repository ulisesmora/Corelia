# tu_app/tasks.py
from celery import shared_task
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Sum
from datetime import datetime, time, timedelta
from django.conf import settings
from api.utils.cancel_bookings import cancel_session_logic
from .models import Booking, CreditWallet, CreditLedgerEntry, RecurringSchedule, UserClassPreference
import logging
from api.utils.site import studio_name, web_url

logger = logging.getLogger(__name__)

@shared_task
def expire_old_credits_task():
    """
    Tarea periódica para buscar créditos vencidos y anularlos.
    """
    now = timezone.now()
    
    # Optimizacion: Solo traemos wallets que tengan Grants vencidos
    # para no iterar sobre usuarios que no tienen nada que ver.
    wallets_with_expired_grants = CreditWallet.objects.filter(
        entries__kind='grant',
        entries__expires_at__lt=now
    ).distinct()

    count = 0
    for wallet in wallets_with_expired_grants:
        # Reutilizamos la lógica de "protección de saldo"
        processed = process_wallet_expiration(wallet, now)
        if processed:
            count += 1
            
    return f"Procesadas {count} wallets con expiraciones."

def process_wallet_expiration(wallet, now):
    """
    Lógica corregida: Protege el saldo de los grants activos (futuros)
    y solo expira el excedente.
    """
    has_changes = False
    
    # 1. Buscamos grants vencidos que aún no han sido procesados
    # Nota: Es importante filtrar solo los que vencen ANTES de 'now'
    expired_grants = wallet.entries.filter(kind='grant', expires_at__lt=now)

    with transaction.atomic():
        _ = CreditWallet.objects.select_for_update().get(id=wallet.id)
        
        # 2. Calcular la suma de todos los GRANTS VIVOS (que vencen en el futuro)
        # Esto nos dice cuánto saldo está "protegido" porque pertenece a paquetes vigentes.
        active_grants_total = wallet.entries.filter(
            kind='grant', 
            expires_at__gte=now  # Grants que vencen hoy o en el futuro
        ).aggregate(total=Sum('amount'))['total'] or 0
        # Las clases de un plan del estudio no tienen fecha: caducan en su
        # corte (api/utils/studio_plans.py). Las del ciclo actual cuentan como vivas.
        from api.models import StudioPlan
        active_grants_total += StudioPlan.objects.filter(
            user_id=wallet.user_id, status__in=['active', 'paused'],
        ).aggregate(total=Sum('credits_pool'))['total'] or 0

        current_balance = wallet.balance
        
        # 3. Calcular el saldo real que es "vencible"
        # Si el balance es 7 y tengo 8 en grants activos, saldo_vencible = -1 -> 0 (No expira nada)
        # Si el balance es 15 y tengo 8 en grants activos, saldo_vencible = 7 (Expira 7)
        expireable_balance = max(0, current_balance - active_grants_total)

        if expireable_balance == 0:
            return False # El saldo actual está totalmente cubierto por paquetes nuevos

        for grant in expired_grants:
            expiry_ref = f"EXP-GRANT-{grant.id}"
            
            # Si ya existe la expiración para este grant, saltamos
            if wallet.entries.filter(kind='expire', reference=expiry_ref).exists():
                continue
            
            # Si ya no queda saldo vencible por procesar, terminamos
            if expireable_balance <= 0:
                break

            # Expiramos como máximo el monto original del grant o lo que quede de saldo vencible
            amount_to_expire = min(grant.amount, expireable_balance)
            
            if amount_to_expire > 0:
                CreditLedgerEntry.objects.create(
                    wallet=wallet,
                    kind='expire',
                    amount=-amount_to_expire,
                    reference=expiry_ref,
                    metadata={"original_grant": grant.id, "note": "Celery auto-expire (Safe Logic)"}
                )
                # Restamos lo que acabamos de expirar del "saldo vencible" disponible
                expireable_balance -= amount_to_expire
                has_changes = True
            
    return has_changes

@shared_task
def test_cron():
    # Usamos BASE_DIR para garantizar la ruta exacta
    file_path = settings.BASE_DIR / "celery_proof.txt"
    
    try:
        # Modo 'a' es append (agregar al final sin borrar lo anterior)
        with open(file_path, "a") as f:
            f.write(f"✅ Celery funcionó. Hora servidor: {timezone.now()}\n")
        return f"Escrito en: {file_path}"
    except Exception as e:
        return f"Error escribiendo: {e}"
    



@shared_task
def check_and_cancel_low_occupancy_sessions():
    now = timezone.now()
    today_date = now.date() # Solo la fecha (ej: 2025-11-13)
    today_weekday = today_date.weekday()

    logger.info(f"--- 🔍 Revisando clases para la fecha: {today_date} ---")
    return

    active_schedules = RecurringSchedule.objects.filter(
        weekday=today_weekday,
        is_active=True,
        deleted_at__isnull=True
    )

    processed_count = 0
    canceled_sessions = 0

    for schedule in active_schedules:
        # TRUCO PRO: No construyas el datetime exacto para el filtro.
        # Usa __date para buscar reservas que caigan en ese día.
        # Y usa occurrence=schedule para asegurar que son de esa clase.
        
        bookings_query = Booking.objects.filter(
            occurrence=schedule,        # Pertenecen a este horario
            start_datetime__date=today_date, # Ocurren en esta fecha
            status='reserved'
        )
        
        booking_count = bookings_query.count()

        logger.info(f"Clase: {schedule.class_type.title} ({schedule.start_time}). Reservas: {booking_count}. Min: {schedule.capacity_min}")
        if booking_count < schedule.capacity_min:
            logger.warning(f"⚠️ AFORO BAJO. Cancelando...")
            # OJO: schedule.start_time es hora de pared de Madrid; make_aware sin
            # zona usaba TIME_ZONE (UTC) y corría la sesión 2 horas. La tarea está
            # desactivada (return arriba), pero queda correcto por si se reactiva.
            from api.utils.availability import MADRID_TZ
            naive_datetime = datetime.combine(today_date, schedule.start_time)
            full_datetime_aware = timezone.make_aware(naive_datetime, MADRID_TZ)

            # Llamamos al servicio pasando la FECHA+HORA completa
            result = cancel_session_logic(
                occurrence_id=schedule.id,
                start_datetime_aware=full_datetime_aware 
            )
            
            if result.get('cancelled', 0) > 0:
                canceled_sessions += 1
        
        processed_count += 1

    return f"Revisadas {processed_count}. Canceladas: {canceled_sessions}"


# ─────────────────────────────────────────────────────────────────────────────
# SHARED HELPER — used by both the weekly cron and the immediate trigger
# ─────────────────────────────────────────────────────────────────────────────

def _run_auto_reserve(start_date, end_date, filter_user_id=None):
    """
    Core auto-reserve logic.
    Books all matching class slots between start_date and end_date (inclusive).
    Only processes users with an active subscription.
    Returns a human-readable summary string.
    """
    from django.utils import timezone as tz
    from datetime import timedelta
    from api.utils.emailing import send_templated_email
    from api.models import Subscription

    now = tz.now()

    prefs_qs = UserClassPreference.objects.filter(is_active=True)
    if filter_user_id is not None:
        prefs_qs = prefs_qs.filter(user_id=filter_user_id)

    prefs = prefs_qs.select_related(
        'user', 'user__wallet', 'schedule', 'schedule__class_type', 'schedule__room'
    )

    active_subscriber_ids = set(
        Subscription.objects.filter(
            status='active', cancel_at_period_end=False
        ).values_list('user_id', flat=True)
    )
    # Clientes del estudio con plan mensual activo (se cobra en el estudio)
    from api.models import StudioPlan
    active_subscriber_ids |= set(StudioPlan.objects.filter(status='active').values_list('user_id', flat=True))

    user_results: dict = {}  # user_id → {user, reserved, failed, classes}

    for pref in prefs:
        user = pref.user
        schedule = pref.schedule

        if user.id not in active_subscriber_ids:
            continue

        # ¿La clase ya no existe? (eliminada, o su vigencia terminó antes de la
        # semana a reservar). Desactivar la preferencia, ofrecer alternativas
        # y avisar por push+email — antes se saltaba EN SILENCIO y el cliente
        # se quedaba esperando una clase que nunca llegaba.
        if schedule.deleted_at or (schedule.end_date and schedule.end_date < start_date):
            from api.utils.replacement import retire_schedule_preferences
            retire_schedule_preferences(schedule, 'ya no está en el horario')
            continue

        # Pausada temporalmente por el estudio (is_active=False): no reservar,
        # pero NO desactivar la preferencia — volverá a reservarse al reactivarla.
        if not schedule.is_active:
            continue

        try:
            wallet = user.wallet
        except CreditWallet.DoesNotExist:
            continue

        price_credits = (
            schedule.price_credits_override
            if schedule.price_credits_override is not None
            else schedule.class_type.default_price_credits
        )

        weekday = schedule.weekday
        if weekday is None:
            continue

        reserved_count = 0
        failed_full = 0      # aforo completo esa fecha
        failed_credits = 0   # saldo insuficiente

        # Slots candidatos de la semana, generados en memoria (sin queries).
        # Se respeta la ventana de vigencia de la regla (start_date/end_date):
        # así los cambios de horario "desde el día X" no generan auto-reservas
        # fuera de su periodo.
        # Los slots se crean como instantes reales de Madrid (= UTC real en BD),
        # la MISMA convención con la que la web guarda sus reservas. Antes se
        # etiquetaba la hora de pared como UTC: el aforo no "veía" las reservas
        # web del mismo slot (riesgo de sobre-reserva y de doble reserva del
        # mismo usuario) y la hora se mostraba desplazada.
        from api.utils.availability import MADRID_TZ
        slots = []
        current = start_date
        while current <= end_date:
            if current.weekday() == weekday and schedule.is_date_in_window(current):
                aware_start = datetime.combine(current, schedule.start_time, tzinfo=MADRID_TZ)
                aware_end   = datetime.combine(current, schedule.end_time, tzinfo=MADRID_TZ)
                # Never book slots in the past
                if aware_start > now:
                    slots.append((current, aware_start, aware_end))
            current += timedelta(days=1)

        # Excluir slots dentro de excepciones (vacaciones/cierres/privadas)
        if slots:
            from api.utils.availability import blackouts_overlapping, to_madrid_wall
            blks = blackouts_overlapping(
                to_madrid_wall(slots[0][1]), to_madrid_wall(slots[-1][2]), [schedule.id]
            )
            if blks:
                slots = [
                    s for s in slots
                    if not any(bs <= to_madrid_wall(s[1]) < be for _, bs, be in blks)
                ]

        if not slots:
            continue

        with transaction.atomic():
            # Un solo lock por preferencia: schedule (aforo) y wallet (saldo).
            # El saldo se comprueba DESPUÉS del lock para que dos procesos
            # concurrentes no puedan gastar los mismos créditos.
            locked_sched = RecurringSchedule.objects.select_for_update().get(id=schedule.id)
            locked_wallet = CreditWallet.objects.select_for_update().get(id=wallet.id)

            slot_starts = [s for _, s, _ in slots]

            already_booked = set(
                Booking.objects.filter(
                    user=user,
                    occurrence=schedule,
                    start_datetime__in=slot_starts,
                    status__in=['reserved', 'attended'],
                ).values_list('start_datetime', flat=True)
            )

            occupancy = {
                row['start_datetime']: row['c']
                for row in Booking.objects.filter(
                    occurrence_id=locked_sched.id,
                    start_datetime__in=slot_starts,
                    status__in=['reserved', 'attended'],
                ).values('start_datetime').annotate(c=Count('id'))
            }

            available_balance = locked_wallet.balance

            new_bookings = []
            spend_entries = []
            for day, aware_start, aware_end in slots:
                if aware_start in already_booked:
                    continue
                if occupancy.get(aware_start, 0) >= locked_sched.capacity_max:
                    failed_full += 1
                    continue
                if available_balance < price_credits:
                    failed_credits += 1
                    continue

                new_bookings.append(Booking(
                    occurrence=schedule,
                    user=user,
                    status='reserved',
                    start_datetime=aware_start,
                    end_datetime=aware_end,
                ))
                spend_entries.append(CreditLedgerEntry(
                    wallet=locked_wallet,
                    kind='spend',
                    amount=-price_credits,
                    reference=f'Auto-reserva semanal: {schedule.class_type.title}',
                    metadata={
                        'schedule_id': schedule.id,
                        'date': str(day),
                        'auto_reserve': True,
                        'week_start': str(start_date),
                    }
                ))
                available_balance -= price_credits
                reserved_count += 1

            Booking.objects.bulk_create(new_bookings)
            CreditLedgerEntry.objects.bulk_create(spend_entries)

        if reserved_count > 0 or failed_full > 0 or failed_credits > 0:
            uid = user.id
            if uid not in user_results:
                user_results[uid] = {
                    'user': user, 'reserved': 0,
                    'failed_full': 0, 'failed_credits': 0,
                    'classes': [], 'full_classes': [],
                }
            user_results[uid]['reserved'] += reserved_count
            user_results[uid]['failed_full'] += failed_full
            user_results[uid]['failed_credits'] += failed_credits
            user_results[uid]['classes'].append(schedule.class_type.title)
            if failed_full:
                user_results[uid]['full_classes'].append(schedule.class_type.title)

    # ── Un resumen por usuario: email siempre; push además si algo falló ───────
    from api.utils.push import send_push_to_user

    for uid, data in user_results.items():
        u = data['user']
        n_full, n_credits = data['failed_full'], data['failed_credits']

        problemas = []
        if n_full:
            problemas.append(
                f'{n_full} clase(s) de {", ".join(sorted(set(data["full_classes"])))} '
                f'ya estaban completas — echa un vistazo al calendario por si otra hora te encaja'
            )
        if n_credits:
            problemas.append(
                f'{n_credits} clase(s) se quedaron sin reservar porque no tenías créditos '
                f'suficientes — recarga o renueva tu plan para no perder tu plaza'
            )

        try:
            send_templated_email(
                to_email=u.email,
                template_id='generic-notice',
                dynamic_data={
                    'name': u.first_name or '',
                    'headline': 'Resumen de auto-reserva semanal',
                    'intro_copy': (
                        f'Se han reservado {data["reserved"]} clase(s) para la próxima semana '
                        f'({", ".join(sorted(set(data["classes"])))}).'
                        + (' ' + '. '.join(problemas) + '.' if problemas else '')
                    ),
                    'cta_text': 'Ver mis reservas',
                    'cta_url': web_url('/dashboard'),
                },
            )
        except Exception:
            logger.warning("auto_reserve.email_failed user_id=%s", uid, exc_info=True)

        # Push siempre que hay novedad: confirmación si todo fue bien,
        # y aviso accionable si algo falló (clase llena / sin saldo).
        if data['reserved'] > 0 and not (n_full or n_credits):
            try:
                send_push_to_user(
                    u,
                    title='✅ Semana lista',
                    body=(f'{data["reserved"]} clase(s) reservadas para la próxima semana: '
                          f'{", ".join(sorted(set(data["classes"])))}. ¡Nos vemos en el estudio!'),
                    url='/dashboard',
                )
            except Exception:
                logger.warning("auto_reserve.push_failed user_id=%s", uid, exc_info=True)
        if n_full or n_credits:
            try:
                if n_credits:
                    body = (f'Te quedaste sin créditos y {n_credits} clase(s) no se '
                            f'reservaron. Recarga para recuperar tu plaza.')
                    push_url = '/dashboard?tab=suscripcion'
                else:
                    body = (f'{", ".join(sorted(set(data["full_classes"])))} ya estaba '
                            f'completa esa semana. Mira el calendario para elegir otra hora.')
                    push_url = '/calendar'
                send_push_to_user(
                    u,
                    title='⚠️ No pudimos reservar todas tus clases',
                    body=body,
                    url=push_url,
                )
            except Exception:
                logger.warning("auto_reserve.push_failed user_id=%s", uid, exc_info=True)

    total_reserved = sum(d['reserved'] for d in user_results.values())
    total_failed = sum(d['failed_full'] + d['failed_credits'] for d in user_results.values())
    logger.info(
        "auto_reserve.done start=%s end=%s reserved=%s failed=%s users=%s",
        start_date, end_date, total_reserved, total_failed, len(user_results),
    )
    return (
        f"Auto-reserva semanal ({start_date} → {end_date}): "
        f"{total_reserved} reservadas, {total_failed} fallidas, "
        f"{len(user_results)} usuarios afectados."
    )


@shared_task
def auto_reserve_weekly_classes():
    """
    Cron: every Sunday at 03:00.
    Books all matching class slots for the coming week (Monday → Sunday).
    """
    from django.utils import timezone as tz
    from datetime import timedelta

    today = tz.now().date()  # Sunday
    week_start = today + timedelta(days=1)   # Monday
    week_end   = today + timedelta(days=7)   # Sunday (next)

    return _run_auto_reserve(week_start, week_end)


@shared_task
def auto_reserve_for_user_now(user_id):
    """
    Triggered immediately when a user adds/updates their class preferences.
    Books remaining slots of the current week (today → coming Saturday)
    so mid-week subscribers are not left waiting until the Sunday cron.
    """
    from django.utils import timezone as tz
    from datetime import timedelta

    today = tz.now().date()
    # Python weekday: 0=Mon … 5=Sat … 6=Sun
    dow = today.weekday()

    if dow == 6:
        # It's Sunday — the weekly cron runs tonight at 3am, nothing to fill in
        return "Sunday: weekly cron handles next week, no immediate action needed."

    days_to_saturday = 5 - dow  # e.g. Mon(0) → 5 days, Fri(4) → 1 day
    week_end = today + timedelta(days=days_to_saturday)  # this Saturday

    return _run_auto_reserve(today, week_end, filter_user_id=user_id)


# Keep legacy task as a no-op alias so existing beat entries don't crash
@shared_task
def auto_reserve_monthly_classes():
    """Deprecated — replaced by auto_reserve_weekly_classes."""
    return auto_reserve_weekly_classes()


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICACIONES PUSH — recordatorios de clase
# ─────────────────────────────────────────────────────────────────────────────

def _booking_wall_info(booking):
    """(fecha, hora) del slot en hora de pared de Madrid, tolerante a la
    convención mixta con la que se guardaron los datetimes históricos.

    Para reservas de clases usamos la hora REAL del horario (schedule.start_time),
    que es la verdad independientemente de cómo se etiquetó el datetime; la
    fecha se toma de cualquiera de las dos lecturas (coinciden salvo medianoche).
    """
    from api.utils.availability import to_madrid_wall

    wall_a = to_madrid_wall(booking.start_datetime)
    wall_b = booking.start_datetime.replace(tzinfo=None)
    the_date = wall_b.date()  # lectura literal: coincide con lo que vio el usuario

    if booking.occurrence_id:
        return the_date, booking.occurrence.start_time
    return the_date, (wall_a or wall_b).time()


@shared_task
def send_class_reminders():
    """Cada 15 min (beat): push ~2h antes de cada clase reservada.
    Idempotente: marca metadata.reminder_2h_sent en cada reserva avisada."""
    from api.utils.availability import MADRID_TZ
    from api.utils.push import send_push_to_user

    now_wall = timezone.now().astimezone(MADRID_TZ).replace(tzinfo=None, second=0, microsecond=0)
    win_start = now_wall + timedelta(hours=2)
    win_end = win_start + timedelta(minutes=15)

    candidates = Booking.objects.filter(
        status='reserved',
        user__isnull=False,
        start_datetime__gte=timezone.now() - timedelta(hours=6),
        start_datetime__lte=timezone.now() + timedelta(hours=6),
    ).select_related('user', 'occurrence__class_type', 'event')

    notified = pushes = 0
    for booking in candidates:
        if (booking.metadata or {}).get('reminder_2h_sent'):
            continue
        the_date, the_time = _booking_wall_info(booking)
        slot_wall = datetime.combine(the_date, the_time)
        if not (win_start <= slot_wall < win_end):
            continue

        title = (
            booking.occurrence.class_type.title if booking.occurrence_id
            else (booking.event.title if booking.event_id else 'Tu clase')
        )
        pushes += send_push_to_user(
            booking.user,
            title='⏰ Recordatorio de clase',
            body=f'{title} hoy a las {the_time:%H:%M}. ¡Te esperamos!',
            url='/dashboard',
        )
        # Marcar SIEMPRE (aunque no tenga suscripciones) para no reintentar en bucle
        booking.metadata = {**(booking.metadata or {}), 'reminder_2h_sent': True}
        booking.save(update_fields=['metadata', 'updated_at'])
        notified += 1

    if notified:
        logger.info("push.reminders bookings=%s pushes=%s window=%s→%s", notified, pushes, win_start, win_end)
    return f"Recordatorios: {notified} reservas, {pushes} pushes ({win_start:%H:%M}-{win_end:%H:%M})"


@shared_task
def send_morning_digest():
    """08:00 (beat, hora Madrid): resumen del día a quien tiene clase hoy."""
    from api.utils.availability import MADRID_TZ
    from api.utils.push import send_push_to_user

    today = timezone.now().astimezone(MADRID_TZ).date()

    candidates = Booking.objects.filter(
        status='reserved',
        user__isnull=False,
        start_datetime__gte=timezone.now() - timedelta(hours=12),
        start_datetime__lte=timezone.now() + timedelta(hours=36),
    ).select_related('user', 'occurrence__class_type', 'event')

    per_user = {}
    for booking in candidates:
        the_date, the_time = _booking_wall_info(booking)
        if the_date != today:
            continue
        title = (
            booking.occurrence.class_type.title if booking.occurrence_id
            else (booking.event.title if booking.event_id else 'Clase')
        )
        per_user.setdefault(booking.user_id, {'user': booking.user, 'items': []})
        per_user[booking.user_id]['items'].append((the_time, title))

    users_notified = pushes = 0
    for data in per_user.values():
        items = sorted(data['items'])
        listado = ' · '.join(f"{t:%H:%M} {title}" for t, title in items)
        n = len(items)
        sent = send_push_to_user(
            data['user'],
            title=f"Hoy tienes {n} clase{'s' if n > 1 else ''} 🧘",
            body=listado,
            url='/dashboard',
        )
        if sent:
            users_notified += 1
            pushes += sent

    logger.info("push.morning_digest users=%s pushes=%s date=%s", users_notified, pushes, today)
    return f"Resumen diario: {users_notified} usuarios, {pushes} pushes ({today})"


@shared_task
def clean_expired_replacement_flags():
    from django.contrib.auth import get_user_model
    now = timezone.now()
    User = get_user_model()
    updated = User.objects.filter(
        needs_class_replacement=True,
        replacement_deadline__lt=now,
    ).update(
        needs_class_replacement=False,
        replacement_class_options=None,
        replacement_deadline=None,
    )
    return f"Flags de reemplazo limpiados: {updated} usuarios"

# ─────────────────────────────────────────────────────────────────────────────
# RECOMENDACIÓN DE MEMBRESÍA — email mensual a regulares
# ─────────────────────────────────────────────────────────────────────────────

MEMBERSHIP_EMAIL_EVERY_DAYS = 30
MEMBERSHIP_EMAIL_MAX_TOTAL = 3       # nunca más de 3 en total sin respuesta
MEMBERSHIP_DISMISS_COOLDOWN_DAYS = 21


def _fixed_classes_for_clients() -> bool:
    """¿Se habla de clases fijas con los clientes? Solo si el estudio deja que
    las elijan en la web (Ajustes → Cobros, SiteConfig.client_fixed_classes).
    Si no, las clases fijas son una herramienta del panel y los avisos no las
    explican ni las venden."""
    from api.utils.site import get_site_config
    return bool(get_site_config().client_fixed_classes)


def _membership_message(user, a):
    """Texto personal con SU ahorro real (y su clase fija solo si el estudio
    deja que los clientes elijan sus clases fijas en la web)."""
    plan = a['plan']
    fixed = _fixed_classes_for_clients()
    slot = a['fixed_slots'][0] if (fixed and a['fixed_slots']) else None
    if fixed:
        habit = (f"Llevas {a['weeks_active']} semanas viniendo {slot['label']}"
                 if slot else f"Llevas {a['weeks_active']} de las últimas {a['window_weeks']} semanas viniendo a {studio_name()}")
        auto = (f"tu plaza de {slot['label']} se reserva sola cada semana" if slot
                else "tus clases fijas se reservan solas cada semana")
    else:
        habit = ''
        auto = 'tus clases de cada mes quedan pagadas de una vez'
    if plan['price_per_class'] < a['current_price_per_class']:
        # Solo hablamos de precio si de verdad le sale más barato
        from api.utils.locale import money
        price_line = (f"Con la membresía {plan['name']} cada clase te sale a {money(plan['price_per_class'])} "
                      f"(ahora pagas {money(a['current_price_per_class'])})")
        saving = (f", unos {money(int(a['saving_per_month']), trim=True)} menos al mes" if a['saving_per_month'] >= 5 else '')
        body = f"{price_line}{saving}, y {auto}."
    elif fixed:
        # Si no ahorra, el valor es la comodidad: no prometemos lo que no es
        body = f"Con la membresía {plan['name']}, {auto}: sin tener que acordarte de reservar ni quedarte sin sitio."
    else:
        body = f"Con la membresía {plan['name']}, {auto}, sin estar pendiente de recargar bonos."
    return habit, f"{body} Sin permanencia: cancelas cuando quieras."


@shared_task
def send_membership_suggestions():
    """Diaria (beat). Envía la recomendación personal por email (y push si
    tiene la app) a los clientes regulares sin membresía, respetando los límites."""
    from api.models import MembershipNudge
    from api.utils.emailing import send_templated_email
    from api.utils.membership import candidates
    from api.utils.push import send_push_to_user

    now = timezone.now()
    sent = skipped = 0
    for user, a in candidates(now=now):
        nudges = MembershipNudge.objects.filter(user=user)
        if nudges.filter(channel='email', action='sent').count() >= MEMBERSHIP_EMAIL_MAX_TOTAL:
            skipped += 1
            continue
        if nudges.filter(channel='email', action='sent',
                         created_at__gte=now - timedelta(days=MEMBERSHIP_EMAIL_EVERY_DAYS)).exists():
            skipped += 1
            continue
        if nudges.filter(action='dismissed',
                         created_at__gte=now - timedelta(days=MEMBERSHIP_DISMISS_COOLDOWN_DAYS)).exists():
            skipped += 1
            continue
        if not user.email:
            continue

        habit, body = _membership_message(user, a)
        fixed = _fixed_classes_for_clients()
        headline = 'Tu plaza, guardada cada semana' if fixed else f"La membresía de {studio_name()}"
        intro = f"{habit}. {body}" if habit else body
        plan = a['plan']
        prefer = ','.join(str(s['schedule_id']) for s in a['fixed_slots']) if fixed else ''
        cta_url = (web_url(f"/checkout?tab=subscription&plan_id={plan['id']}")
                   + (f"&prefer={prefer}" if prefer else ''))
        try:
            ok = send_templated_email(
                to_email=user.email,
                template_id='generic-notice',
                dynamic_data={
                    'name': user.first_name or '',
                    'headline': headline,
                    'intro_copy': intro,
                    'cta_text': f"Ver la membresía {plan['name']}",
                    'cta_url': cta_url,
                },
                subject=(f"{user.first_name or 'Hola'}, te guardamos tu plaza cada semana" if fixed
                         else f"{user.first_name or 'Hola'}, ¿te cuento cómo funciona la membresía?"),
            )
        except Exception:
            logger.warning("membership.email_failed user_id=%s", user.id, exc_info=True)
            ok = False
        if not ok:
            continue
        MembershipNudge.objects.create(
            user=user, channel='email', action='sent', plan_id=plan['id'],
            segment=a['segment'], saving_per_month=a['saving_per_month'],
        )
        if user.push_subscriptions.exists():
            try:
                send_push_to_user(user, title=headline,
                                  body=(f"{habit}. Con la membresía se reserva sola." if fixed
                                        else f"Con la membresía {plan['name']} tus clases del mes quedan pagadas."),
                                  url=cta_url.replace(web_url(), ''))
                MembershipNudge.objects.create(user=user, channel='push', action='sent', plan_id=plan['id'],
                                               segment=a['segment'])
            except Exception:
                logger.warning("membership.push_failed user_id=%s", user.id, exc_info=True)
        sent += 1

    logger.info("membership.suggestions sent=%s skipped=%s", sent, skipped)
    return f"Recomendaciones de membresía: {sent} enviadas, {skipped} omitidas por límites"


# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN DE EMAIL — recordatorios automáticos
# ─────────────────────────────────────────────────────────────────────────────

@shared_task
def send_verification_reminders():
    """Diaria (beat). A quien se registró y no ha confirmado su email:
    recordatorio con código nuevo a las 24 h y a las 72 h. Solo altas de los
    últimos 14 días (las antiguas se tratan a mano con resend_verifications)."""
    from django.contrib.auth import get_user_model
    from api.utils.verification import is_placeholder_email, send_verification

    User = get_user_model()
    now = timezone.now()
    pending = User.objects.filter(
        is_staff=False, date_joined__gte=now - timedelta(days=14),
    ).exclude(is_verified=True)

    sent = 0
    for user in pending:
        if is_placeholder_email(user.email):
            continue
        age = now - user.date_joined
        due = ((user.verification_reminders_sent == 0 and age >= timedelta(hours=24)) or
               (user.verification_reminders_sent == 1 and age >= timedelta(hours=72)))
        if not due:
            continue
        if send_verification(user, reminder=True):
            user.verification_reminders_sent += 1
            user.save(update_fields=['verification_reminders_sent'])
            sent += 1
    logger.info("verification.reminders sent=%s", sent)
    return f"Recordatorios de verificación: {sent}"


@shared_task(ignore_result=True)
def ping_indexnow(urls):
    """Aviso a buscadores (IndexNow) tras crear/editar una clase."""
    from api.utils.indexnow import ping
    ping(urls)


@shared_task
def expire_waitlist_offers():
    """Cada 10 min: las plazas ofrecidas de la lista de espera que nadie ha
    aceptado a tiempo pasan a la siguiente persona (api/utils/waitlist.py)."""
    from api.utils.waitlist import expire_offers
    return expire_offers()


@shared_task
def studio_plans_daily():
    """Cada mañana (hora del estudio): marca los planes del estudio que vencen
    (salen en Hoy → «Renovaciones de este mes») y, solo si el estudio lo encendió
    en el plan, avisa al cliente unos días antes. No cobra ni renueva nada
    (api/utils/studio_plans.py)."""
    from api.utils.studio_plans import daily
    return daily()
