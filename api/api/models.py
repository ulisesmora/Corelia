# app/models.py
import uuid
from datetime import timedelta
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import AbstractUser, BaseUserManager
from datetime import datetime, time
from django.db.models import Q, Sum

# CLAVE: Necesitas esta función de conversión para trabajar con TimeField
def time_to_minutes(t: time):
    """Convierte un objeto time (HH:MM:SS) a minutos desde medianoche."""
    return t.hour * 60 + t.minute
# ===========
# MIXINS
# ===========
class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class TimeStampedSoftDelete(models.Model):
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def soft_delete(self):
        if not self.deleted_at:
            self.deleted_at = timezone.now()
            self.save(update_fields=["deleted_at"])


# ===========
# ROLES
# ===========
class Role(TimeStampedSoftDelete):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, null=True)
    permissions = models.JSONField(
        default=dict,
        help_text="{'feature': ['read','write']}"
    )

    def __str__(self):
        return self.name
    
class EmailAsUsernameManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("El email es obligatorio")
        email = self.normalize_email(email)
        # username SIEMPRE igual que email
        extra_fields.setdefault("username", email)

        user = self.model(email=email, **extra_fields)
        user.username = email
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("El superusuario debe tener is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("El superusuario debe tener is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    birth_date = models.DateField(blank=True, null=True)
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=120, blank=True, null=True)
    whatThinkFeel = models.CharField(max_length=120, blank=True, null=True)
    whatSee = models.CharField(max_length=120, blank=True, null=True)
    whatListen = models.CharField(max_length=120, blank=True, null=True)
    whatsay = models.CharField(max_length=120, blank=True, null=True)
    frustated = models.CharField(max_length=120, blank=True, null=True)
    desires = models.CharField(max_length=120, blank=True, null=True)
    is_verified = models.BooleanField(default=False, null=True)
    verification_token = models.UUIDField(default=uuid.uuid4, editable=False, null=True, blank=True)
    verification_token_expires = models.DateTimeField(blank=True, null=True)
    # Verificación por código de 6 dígitos (se guarda hasheado)
    verification_code_hash = models.CharField(max_length=128, blank=True, null=True)
    verification_code_expires = models.DateTimeField(blank=True, null=True)
    verification_code_attempts = models.PositiveSmallIntegerField(default=0)
    verification_last_sent = models.DateTimeField(blank=True, null=True)
    verification_reminders_sent = models.PositiveSmallIntegerField(default=0)
    reset_token = models.UUIDField(editable=False, null=True, blank=True)
    reset_token_expires = models.DateTimeField(blank=True, null=True)
    experience_level = models.CharField(
        max_length=20,
        blank=True, null=True
    )
    gender = models.CharField(
        max_length=20,
        blank=True, null=True
    )
    goal_primary = models.CharField(
        max_length=40,
        blank=True, null=True
    )
    source = models.CharField(max_length=60, blank=True, null=True)
    consent = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    created_by_admin = models.BooleanField(default=False)
    needs_class_replacement = models.BooleanField(default=False)
    replacement_class_options = models.JSONField(null=True, blank=True)
    replacement_deadline = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = EmailAsUsernameManager()

    def save(self, *args, **kwargs):
        if self.email and self.username != self.email:
            self.username = self.email
        super().save(*args, **kwargs)
        
    @property
    def role_permissions(self):
        return self.role.permissions if self.role else {}

    def __str__(self):
        return self.email 
    
    def set_reset_token(self):
        self.reset_token = uuid.uuid4()
        self.reset_token_expires = timezone.now() + timedelta(minutes=330)
        self.save(update_fields=['reset_token', 'reset_token_expires'])
 

class GuestProfile(TimeStampedSoftDelete):
    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True, null=True, db_index=True, unique=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    birth_date = models.DateField(blank=True, null=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="linked_guests"
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        indexes = [models.Index(fields=["email"])]

    def __str__(self):
        return f"Guest({self.public_id})"


# ===========
# ENTIDADES DE CATÁLOGO (sin cambios)
# ===========
class Category(TimeStampedSoftDelete):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True, null=True)
    color = models.CharField(max_length=12, blank=True, null=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"name": "...", "description": "..."}}')
    # Versión en inglés de lo que se ve en la web (vacío = se muestra el español)
    name_en = models.CharField(max_length=120, blank=True, default='')
    description_en = models.TextField(blank=True, default='')

    def __str__(self):
        return self.name


class Instructor(TimeStampedSoftDelete):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    image = models.URLField(blank=True, null=True)
    experience_years = models.PositiveIntegerField(default=0)
    vision = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    short_bio = models.CharField(max_length=240, blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    instagram = models.URLField(blank=True, null=True)
    linkedin = models.URLField(blank=True, null=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"name": "...", "short_bio": "...", "description": "..."}}')
    short_bio_en = models.CharField(max_length=240, blank=True, default='')
    description_en = models.TextField(blank=True, default='')
    vision_en = models.TextField(blank=True, default='')

    def __str__(self):
        return self.name


class Room(TimeStampedSoftDelete):
    name = models.CharField(max_length=120, unique=True)
    title = models.CharField(max_length=200, blank=True, null=True, help_text="Título decorativo de la sala")
    description = models.TextField(blank=True, null=True, help_text="Descripción detallada de la sala")
    capacity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    location = models.CharField(max_length=200, blank=True, null=True)
    image = models.URLField(blank=True, null=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"name": "...", "title": "...", "description": "..."}}')
    title_en = models.CharField(max_length=200, blank=True, default='')
    description_en = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.name} (cap. {self.capacity})"


class ClassType(TimeStampedSoftDelete):
    LEVEL_CHOICES = [
        ("all", "Para todos"),
        ("beg", "Principiante"),
        ("int", "Intermedio"),
        ("adv", "Avanzado"),
    ]
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="classes")
    instructor = models.ForeignKey('Instructor', on_delete=models.PROTECT, related_name='class_types', blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    duration_minutes = models.PositiveIntegerField(default=60, validators=[MinValueValidator(15)])
    level = models.CharField(max_length=8, choices=LEVEL_CHOICES, default="all")
    default_price_credits = models.DecimalField(max_digits=8, decimal_places=2, default=1)
    default_price_eur = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    stripe_product_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_price_id = models.CharField(max_length=255, blank=True, null=True)
    image = models.URLField(blank=True, null=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"title": "...", "description": "..."}}')
    title_en = models.CharField(max_length=160, blank=True, default='')
    description_en = models.TextField(blank=True, default='')

    class Meta:
        unique_together = [("title", "category")]

    def __str__(self):
        return self.title
    
    @property
    def associated_instructors(self):
        override_instructor_ids = self.recurrences.exclude(
            override_instructor__isnull=True
        ).values_list('override_instructor_id', flat=True).distinct()
        
        # 2. Creamos un set con todos los IDs únicos
        instructor_ids = set(override_instructor_ids)
        
        # 3. Añadimos el ID del instructor principal (si existe)
        if self.instructor_id:
            instructor_ids.add(self.instructor_id)
            
        # Si no hay ningún instructor asociado, retornamos un queryset vacío
        if not instructor_ids:
            return Instructor.objects.none()
        
        # 4. Retornamos el QuerySet final de objetos Instructor
        # (Asumiendo que el modelo se llama 'Instructor')
        return Instructor.objects.filter(pk__in=instructor_ids)


# ===========
# RECURRENCIA Y SESIONES (ClassSession reemplaza ClassOccurrence)
# ===========
class RecurringSchedule(TimeStampedSoftDelete):
    class_type = models.ForeignKey(ClassType, on_delete=models.PROTECT, related_name="recurrences")
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="recurrences")
    weekday = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(6)],
        help_text="0=Lunes ... 6=Domingo",
        null=True
    )
    start_time = models.TimeField(null=False)
    end_time = models.TimeField(null=False)
    duration_minutes = models.PositiveIntegerField( null=True, # Permitimos nulo temporalmente si el cálculo falla
        blank=True)
    capacity_min = models.PositiveIntegerField(default=1)
    capacity_max = models.PositiveIntegerField(default=12)
    start_date = models.DateField(null=True)
    end_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    price_credits_override = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    price_eur_override = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    is_recurrent = models.BooleanField(default=False, null=True)
    override_instructor = models.ForeignKey(
        'Instructor', on_delete=models.SET_NULL, null=True, blank=True, related_name='override_sessions'
    )

    class Meta:
        indexes = [
            models.Index(fields=["weekday", "start_time"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['room', 'weekday', 'start_time'],
                name='unique_active_alive_schedule',
                condition=Q(deleted_at__isnull=True) & Q(is_active=True)
            )
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.start_time and self.end_time:
            start_minutes = time_to_minutes(self.start_time)
            end_minutes = time_to_minutes(self.end_time)

            if end_minutes <= start_minutes:
                if end_minutes != start_minutes:
                     raise ValidationError(
                        {'end_time': 'La hora de finalización debe ser posterior a la hora de inicio para clases que no cruzan medianoche.'}
                     )

        if self.room_id and self.weekday is not None and self.start_time and self.end_time:
            overlapping = RecurringSchedule.objects.filter(
                room_id=self.room_id,
                weekday=self.weekday,
                deleted_at__isnull=True,
                is_active=True,
            ).exclude(pk=self.pk)

            start_mins = time_to_minutes(self.start_time)
            end_mins = time_to_minutes(self.end_time)
            if end_mins <= start_mins:
                end_mins += 1440

            conflicts = []
            for other in overlapping:
                other_start = time_to_minutes(other.start_time)
                other_end = time_to_minutes(other.end_time)
                if other_end <= other_start:
                    other_end += 1440
                if start_mins < other_end and end_mins > other_start:
                    conflicts.append(other)

            if conflicts:
                conflict_titles = ', '.join(
                    f'{c.class_type.title} ({c.start_time.strftime("%H:%M")}-{c.end_time.strftime("%H:%M")})'
                    for c in conflicts
                )
                raise ValidationError(
                    {'start_time': f'La sala {self.room.name} ya tiene clase(s) en este horario: {conflict_titles}'}
                )
            
    def is_date_in_window(self, d):
        """True si la fecha 'd' cae dentro de la vigencia de esta regla.

        start_date/end_date permiten programar cambios de horario con fecha de
        efecto: una regla nueva con start_date futuro no genera reservas hasta
        esa fecha, y una regla con end_date deja de aceptar reservas después.

        Una sesión puntual (is_recurrent=False) solo es válida EN su fecha.
        """
        if not self.is_recurrent:
            return self.start_date is not None and d == self.start_date
        if self.start_date and d < self.start_date:
            return False
        if self.end_date and d > self.end_date:
            return False
        return True

    def save(self, *args, **kwargs):
        """
        Calcula duration_minutes antes de guardar si start_time y end_time están presentes.
        """
        if self.start_time and self.end_time:
            
            # Convertir objetos time a minutos totales desde medianoche
            start_minutes = time_to_minutes(self.start_time)
            end_minutes = time_to_minutes(self.end_time)

            # Calcular la diferencia en minutos
            if end_minutes > start_minutes:
                # Caso normal (la clase termina el mismo día)
                duration = end_minutes - start_minutes
            elif end_minutes < start_minutes:
                # Caso de clase que cruza la medianoche (e.g., 23:00 - 01:00).
                # (24*60 - start_minutes) + end_minutes
                duration = (1440 - start_minutes) + end_minutes 
            else:
                # Caso de start_time == end_time (duración 0, lo cual puede ser inválido o 24 horas)
                duration = 0 

            self.duration_minutes = duration

        # Si duration_minutes se calcula, no necesitamos validarlo en el save,
        # pero es bueno asegurarse de que es positivo si se setea manualmente.
        
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.class_type} {self.weekday} {self.start_time}"


class ScheduleBlackout(TimeStampedSoftDelete):
    """Excepción de calendario: bloquea reservas en un rango de fecha/hora.

    Cubre los tres casos que necesita el negocio sin tocar la recurrencia:
    - Vacaciones / cierre del estudio: schedule=None (global) + rango de días.
    - Franja cerrada: schedule=None o una clase + rango horario concreto.
    - Clase privada: schedule=X + el rango exacto de esa sesión.

    IMPORTANTE (zona horaria): las comparaciones se hacen SIEMPRE en hora de
    pared de Europe/Madrid (ver api/utils/availability.py), porque las
    distintas rutas de reserva han guardado históricamente los datetimes con
    convenciones distintas. El rango bloquea [start_datetime, end_datetime).
    """
    KIND = [
        ("vacation", "Vacaciones / cierre"),
        ("closed", "Franja cerrada"),
        ("private", "Clase privada"),
    ]
    schedule = models.ForeignKey(
        RecurringSchedule, on_delete=models.CASCADE, null=True, blank=True,
        related_name="blackouts",
        help_text="Vacío = aplica a TODAS las clases (cierre global)",
    )
    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField()
    kind = models.CharField(max_length=12, choices=KIND, default="closed")
    reason = models.CharField(max_length=200, blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="schedule_blackouts",
    )

    class Meta:
        indexes = [models.Index(fields=["start_datetime", "end_datetime"])]
        ordering = ["start_datetime"]

    def __str__(self):
        scope = self.schedule_id or "GLOBAL"
        return f"Blackout({scope} {self.start_datetime:%d/%m %H:%M}→{self.end_datetime:%d/%m %H:%M} {self.kind})"


class ClassOccurrence(TimeStampedSoftDelete):
    STATUS = [
        ("scheduled", "Programada"),
        ("confirmed", "Confirmada"),
        ("canceled", "Cancelada"),
        ("completed", "Completada"),
    ]
    # Antes era 'schedule', ahora lo mantengo para consistencia en la relación
    schedule = models.ForeignKey(
        RecurringSchedule, 
        on_delete=models.SET_NULL, # Se cambió a SET_NULL para permitir sesiones huérfanas
        null=True, blank=True, 
        related_name="sessions" # relacionado con RecurringSchedule
    ) 
    # Usé los campos de ClassOccurrence para no perder lógica:
    class_type = models.ForeignKey(ClassType, on_delete=models.PROTECT, related_name="sessions")
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="sessions")
    override_instructor = models.ForeignKey(
        'Instructor', on_delete=models.SET_NULL, null=True, blank=True, related_name='override_occurrence'
    )

    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    # Mantenemos min/max capacidad como en ClassOccurrence (aunque RecurringSchedule también los tiene)
    capacity = models.PositiveIntegerField(default=1) 
    status = models.CharField(max_length=12, choices=STATUS, default="scheduled")
    
    # Precios fijos como en ClassOccurrence
    price_credits = models.DecimalField(max_digits=8, decimal_places=2, default=1)
    price_eur = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        indexes = [
            models.Index(fields=["start_datetime"]),
            models.Index(fields=["status"]),
        ]
        unique_together = [("room", "start_datetime")]

    def __str__(self):
        return f"{self.class_type} @ {self.start_datetime:%Y-%m-%d %H:%M}"

    @property
    def instructor(self):
        # Mantenemos la lógica de instructor de ClassOccurrence
        return self.override_instructor or self.class_type.instructor

    @property
    def enrolled_count(self):
        # Booking no tiene FK a ClassOccurrence: las reservas viven en el
        # RecurringSchedule (related_name="bookings") con el datetime del slot.
        if not self.schedule_id:
            return 0
        return self.schedule.bookings.filter(
            start_datetime=self.start_datetime,
            status__in=["reserved", "attended"],
        ).count()

    @property
    def capacity_min(self):
        # La capacidad mínima vive en el RecurringSchedule; esta ocurrencia
        # solo guarda 'capacity' (máxima).
        return self.schedule.capacity_min if self.schedule_id else 1

    def should_confirm(self):
        return self.enrolled_count >= self.capacity_min

    def confirm_if_ready(self):
        if self.status == "scheduled" and self.should_confirm():
            self.status = "confirmed"
            self.save(update_fields=["status"])

    def cancel_if_not_enough(self, deadline_hours=3):
        if self.status in ["scheduled", "confirmed"]:
            if self.start_datetime - timezone.now() <= timedelta(hours=deadline_hours):
                if self.enrolled_count < self.capacity_min:
                    self.status = "canceled"
                    self.save(update_fields=["status"])


# ===========
# EVENTOS (sin cambios)
# ===========
class Event(TimeStampedSoftDelete):
    # ... (código del modelo Event)
    STATUS = [
        ("scheduled", "Programado"),
        ("confirmed", "Confirmado"),
        ("canceled", "Cancelado"),
        ("completed", "Completado"),
    ]
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="events")
    class_type = models.ForeignKey(ClassType, on_delete=models.PROTECT, related_name="events")
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="events")

    override_instructor = models.ForeignKey(
        'Instructor', on_delete=models.SET_NULL, null=True, blank=True, related_name='override_events'
    )

    description = models.TextField(blank=True, null=True)
    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField()
    capacity_min = models.PositiveIntegerField(default=1)
    capacity_max = models.PositiveIntegerField(default=20)
    status = models.CharField(max_length=12, choices=STATUS, default="scheduled")

    price_credits = models.DecimalField(max_digits=8, decimal_places=2, default=1)
    price_eur = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    stripe_product_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_price_id = models.CharField(max_length=255, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    image = models.URLField(blank=True, null=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"title": "...", "description": "..."}}')
    title_en = models.CharField(max_length=160, blank=True, default='')
    description_en = models.TextField(blank=True, default='')

    class Meta:
        indexes = [
            models.Index(fields=["start_datetime"]),
            models.Index(fields=["status"]),
        ]
        unique_together = [("room", "start_datetime")]

    def __str__(self):
        return f"Event({self.title} @ {self.start_datetime:%Y-%m-%d %H:%M})"

    @property
    def instructor(self):
        return self.override_instructor or self.class_type.instructor

    @property
    def enrolled_count(self):
        return self.event_bookings.filter(status__in=["reserved", "attended"]).count()

    def should_confirm(self):
        return self.enrolled_count >= self.capacity_min

    def confirm_if_ready(self):
        if self.status == "scheduled" and self.should_confirm():
            self.status = "confirmed"
            self.save(update_fields=["status"])

    def cancel_if_not_enough(self, deadline_hours=3):
        if self.status in ["scheduled", "confirmed"]:
            if self.start_datetime - timezone.now() <= timedelta(hours=deadline_hours):
                if self.enrolled_count < self.capacity_min:
                    self.status = "canceled"
                    self.save(update_fields=["status"])


# ===========
# PAGOS / STRIPE (sin cambios)
# ===========
class Payment(TimeStampedSoftDelete):
    # ... (código del modelo Payment)
    STATUS = [
        ("requires_action", "Requires action"),
        ("pending", "Pending"),
        ("succeeded", "Succeeded"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
        ("canceled", "Canceled"),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    guest = models.ForeignKey(GuestProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    method = models.CharField(max_length=20, default="stripe")
    currency = models.CharField(max_length=10, default="EUR")
    amount_eur = models.DecimalField(max_digits=10, decimal_places=2)
    # Stripe
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    stripe_charge_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_checkout_session_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)

    status = models.CharField(max_length=20, choices=STATUS, default="pending")
    raw_response = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~(models.Q(user__isnull=False) & models.Q(guest__isnull=False)),
                name="payment_user_xor_guest",
            )
        ]

    def __str__(self):
        who = self.user_id or self.guest_id
        return f"Payment {self.id} ({self.amount_eur} {self.currency}) -> {who}"

    

class CreditWallet(TimeStampedSoftDelete):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wallet")

    def __str__(self):
        return f"Wallet({self.user_id})"

    @property
    def balance(self):
        """
        Calcula el saldo total.
        El saldo es SIEMPRE la suma de todas las entradas.
        """
        agg = self.entries.aggregate(total=models.Sum("amount"))
        return agg["total"] or 0


class CreditLedgerEntry(TimeStampedSoftDelete):
    # ... (código del modelo CreditLedgerEntry)
    KIND = [
        ("grant", "Grant"),
        ("spend", "Spend"),
        ("refund", "Refund"),
        ("expire", "Expire"),
        ("adjust", "Adjust"),
    ]
    wallet = models.ForeignKey(CreditWallet, on_delete=models.CASCADE, related_name="entries")
    kind = models.CharField(max_length=12, choices=KIND)
    amount = models.DecimalField(max_digits=9, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [models.Index(fields=["expires_at"])]

    def __str__(self):
        return f"{self.kind} {self.amount} -> {self.wallet_id}"


# ===========
# PLANES Y SUSCRIPCIONES / PACKS (sin cambios)
# ===========
class Plan(TimeStampedSoftDelete):
    # ... (código del modelo Plan)
    TYPE = [("pack", "Pack (one-off)"), ("sub", "Subscription")]
    name = models.CharField(max_length=140, unique=True)
    slug = models.SlugField(max_length=160, unique=True, null=True)
    type = models.CharField(max_length=8, choices=TYPE, default="pack")
    credits = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    price_eur = models.DecimalField(max_digits=10, decimal_places=2)
    interval = models.CharField(max_length=16, blank=True, null=True, help_text="month, week, etc.")
    interval_count = models.PositiveIntegerField(blank=True, null=True, default=1)
    auto_renew = models.BooleanField(default=False)
    stripe_product_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_price_id = models.CharField(max_length=255, blank=True, null=True)
    credits_expire_days = models.PositiveIntegerField(blank=True, null=True, help_text="Días hasta caducidad de créditos otorgados")
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True, null=True)
    saving = models.DecimalField(max_digits=9, decimal_places=2, null=True)
    price_credit = models.DecimalField(max_digits=9, decimal_places=2, null=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"name": "...", "description": "..."}}')
    name_en = models.CharField(max_length=140, blank=True, default='')
    description_en = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.name} ({self.credits} cred.)"


class Subscription(TimeStampedSoftDelete):
    # ... (código del modelo Subscription)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=20, default="active")
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    cancel_at_period_end = models.BooleanField(default=False)
    stripe_subscription_id = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f"Sub({self.user_id} - {self.plan.name})"


# ===========
# CUPONES (sin cambios)
# ===========
class Coupon(TimeStampedSoftDelete):
    # ... (código del modelo Coupon)
    DISCOUNT_TYPE = [("percent", "Percent"), ("amount", "Fixed Amount"), ("credits", "Extra Credits")]
    code = models.CharField(max_length=40, unique=True, db_index=True)
    discount_type = models.CharField(max_length=12, choices=DISCOUNT_TYPE)
    value = models.DecimalField(max_digits=9, decimal_places=2, help_text="Porcentaje, importe EUR o créditos")
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    usage_limit = models.PositiveIntegerField(blank=True, null=True)
    per_user_limit = models.PositiveIntegerField(blank=True, null=True)
    min_amount_eur = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    applicable_category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="coupons")
    applicable_class_type = models.ForeignKey(ClassType, on_delete=models.SET_NULL, null=True, blank=True, related_name="coupons")
    applicable_plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, blank=True, related_name="coupons")
    applicable_event = models.ForeignKey('Event', on_delete=models.SET_NULL, null=True, blank=True, related_name="coupons")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.code


class CouponRedemption(TimeStampedSoftDelete):
    # ... (código del modelo CouponRedemption)
    coupon = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name="redemptions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="coupon_redemptions")
    guest = models.ForeignKey(GuestProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name="coupon_redemptions")
    payment = models.ForeignKey('Payment', on_delete=models.SET_NULL, null=True, blank=True, related_name="coupon_redemptions")
    times_used = models.PositiveIntegerField(default=1)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~(models.Q(user__isnull=False) & models.Q(guest__isnull=False)),
                name="couponredemption_user_xor_guest"
            )
        ]


# ===========
# RESERVAS (Booking) - CAMBIOS APLICADOS
# ===========
class Booking(TimeStampedSoftDelete):
    STATUS = [
        ("reserved", "Reservada"),
        ("canceled", "Cancelada"),
        ("attended", "Asistida"),
        ("no_show", "No-show"),
        ("refunded", "Reembolsada"),
        ("pending", "Pendiente")
    ]
    
    occurrence = models.ForeignKey('RecurringSchedule', on_delete=models.PROTECT, related_name="bookings", null=True, blank=True)
    event = models.ForeignKey('Event', on_delete=models.PROTECT, related_name="event_bookings", null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings")
    guest = models.ForeignKey(GuestProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings")
    payment = models.ForeignKey(Payment, on_delete=models.SET_NULL, null=True, blank=True, related_name="bookings")
    status = models.CharField(max_length=12, choices=STATUS, default="reserved")
    metadata = models.JSONField(default=dict, blank=True)
    start_datetime = models.DateTimeField(db_index=True, null=True)
    end_datetime = models.DateTimeField(null=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["user", "guest"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=~(models.Q(user__isnull=False) & models.Q(guest__isnull=False)),
                name="booking_user_xor_guest",
            ),
            # CLAVE: Cambiado de 'occurrence' a 'occurrence' en la validación XOR
            models.CheckConstraint(
                check=(
                    (models.Q(occurrence__isnull=False) & models.Q(event__isnull=True)) |
                    (models.Q(occurrence__isnull=True) & models.Q(event__isnull=False))
                ),
                name="booking_occurrence_xor_event",
            )
            
        ]

    def __str__(self):
        # CLAVE: Cambiado de 'occurrence' a 'occurrence' en __str__
        target = self.occurrence_id or f"event:{self.event_id}"
        who = self.user_id or f"guest:{self.guest_id}"
        return f"Booking({who} -> {target})"


# ===========
# PRE-REGISTRO / LEADS (sin cambios)
# ===========

class ContactUser(TimeStampedSoftDelete):
    name = models.CharField(max_length=120)
    email = models.EmailField(db_index=True)
    subject = models.CharField(max_length=255)
    
    
class Lead(TimeStampedSoftDelete):
    # ... (código del modelo Lead)
    name = models.CharField(max_length=120)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=40, blank=True, null=True)
    birth_date = models.DateField(blank=True, null=True)
    city = models.CharField(max_length=120, blank=True, null=True)
    whatThinkFeel = models.CharField(max_length=120, blank=True, null=True)
    whatSee = models.CharField(max_length=120, blank=True, null=True)
    whatListen = models.CharField(max_length=120, blank=True, null=True)
    whatsay = models.CharField(max_length=120, blank=True, null=True)
    frustated = models.CharField(max_length=120, blank=True, null=True)
    desires = models.CharField(max_length=120, blank=True, null=True)
    experience_level = models.CharField(
        max_length=20,
        blank=True, null=True
    )
    gender = models.CharField(
        max_length=20,
        blank=True, null=True
    )
    goal_primary = models.CharField(
        max_length=40,
        blank=True, null=True
    )

    source = models.CharField(max_length=60, blank=True, null=True)
    consent = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["city"]),
        ]

    def __str__(self):
        return f"Lead({self.email})"

class BroadcastEmail(models.Model):
    subject = models.CharField(max_length=150, help_text="Asunto del correo")
    title = models.CharField(max_length=150, help_text="Título principal dentro del email")
    description = models.TextField(help_text="Cuerpo del mensaje")
    highlighted_text = models.TextField(blank=True, null=True, help_text="Texto destacado opcional")

    # Canales del envío masivo: email, notificación push al móvil, o ambos.
    send_email = models.BooleanField(default=True)
    send_push = models.BooleanField(default=True)
    push_url = models.CharField(
        max_length=300, blank=True, default='',
        help_text="Página que abre la notificación push (p. ej. /calendar). Vacío = inicio",
    )
    emails_sent = models.PositiveIntegerField(default=0)
    pushes_sent = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    
    def __str__(self):
        return f"{self.subject} ({self.created_at.strftime('%d/%m/%Y')})"

class UserClassPreference(TimeStampedSoftDelete):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='class_preferences'
    )
    schedule = models.ForeignKey(
        RecurringSchedule, on_delete=models.CASCADE, related_name='preferences'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'schedule'],
                name='unique_active_preference',
                condition=Q(deleted_at__isnull=True),
            )
        ]

    def __str__(self):
        return f"{self.user.email} -> {self.schedule.class_type.title} ({self.schedule.weekday} {self.schedule.start_time})"


class PushSubscription(TimeStampedSoftDelete):
    """Suscripción Web Push de un navegador de un usuario (puede tener varias:
    móvil, portátil…). El endpoint lo emite el navegador y es único."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=300, blank=True, null=True)

    def __str__(self):
        return f"Push({self.user_id} · {self.endpoint[:40]}…)"


class SiteImage(TimeStampedSoftDelete):
    SECTION_CHOICES = [
        ('hero', 'Hero Principal'),
        ('classes', 'Sección Clases'),
        ('events', 'Eventos'),
        ('gallery', 'Galería'),
        ('about', 'Sobre Nosotros'),
        ('contact', 'Contacto'),
    ]
    section = models.CharField(max_length=30, choices=SECTION_CHOICES)
    image = models.URLField(max_length=500)
    title = models.CharField(max_length=200, blank=True, null=True)
    subtitle = models.CharField(max_length=300, blank=True, null=True)
    link = models.URLField(blank=True, null=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"en": {"title": "...", "subtitle": "..."}, "fr": {...}}')
    title_en = models.CharField(max_length=200, blank=True, default='')
    subtitle_en = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        ordering = ['section', 'order']

    def __str__(self):
        return f"{self.section} - {self.title or self.image[:50]}"


class MembershipNudge(models.Model):
    """Registro de cada recomendación de membresía a una clienta regular:
    sirve para no repetir (frecuencia máxima por canal) y para medir qué
    canal convierte."""
    CHANNELS = [('app', 'Panel'), ('checkout', 'Checkout'), ('email', 'Email'),
                ('push', 'Push'), ('crm', 'Estudio (panel)')]
    ACTIONS = [('shown', 'Mostrado'), ('sent', 'Enviado'), ('dismissed', 'Descartado'),
               ('clicked', 'Pulsado'), ('contacted', 'Contactada'), ('converted', 'Suscrita')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='membership_nudges')
    channel = models.CharField(max_length=12, choices=CHANNELS)
    action = models.CharField(max_length=12, choices=ACTIONS)
    plan = models.ForeignKey('Plan', on_delete=models.SET_NULL, null=True, blank=True)
    segment = models.CharField(max_length=12, blank=True, default='')
    saving_per_month = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'channel', 'action', 'created_at'])]

    def __str__(self):
        return f"{self.user_id} {self.channel}:{self.action}"


# ===========
# CONFIGURACIÓN DEL ESTUDIO (editable desde el panel, sin redesplegar)
# ===========
from api.crypto import EncryptedTextField  # noqa: E402


class SiteConfig(models.Model):
    """Configuración única del estudio: marca, contacto, aspecto de la web e
    integraciones opcionales (email, Stripe, avisos push).

    Es un singleton (siempre id=1). Se rellena en el asistente de bienvenida
    del panel y la web la lee de /api/v1/site-config/public/. Los secretos se
    guardan cifrados y NUNCA se devuelven por la API.
    """
    # ── Marca y contacto ──
    studio_name = models.CharField(max_length=120, default='Mi Estudio')
    tagline = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='',
                                   help_text='Texto corto para Google y redes (1-2 frases).')
    logo_url = models.URLField(max_length=500, blank=True, default='')
    logo_light_url = models.URLField(max_length=500, blank=True, default='',
                                     help_text='Versión clara del logo para fondos oscuros.')
    favicon_url = models.URLField(max_length=500, blank=True, default='')
    icon_url = models.URLField(max_length=500, blank=True, default='',
                               help_text='Icono CUADRADO para la app del móvil y la pestaña del navegador. '
                                         'Vacío = se genera uno con la inicial del estudio.')
    og_image_url = models.URLField(max_length=500, blank=True, default='',
                                   help_text='Imagen al compartir la web (1200x630).')
    contact_email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=40, blank=True, default='')
    whatsapp = models.CharField(max_length=40, blank=True, default='',
                                help_text='Número con prefijo de país, p. ej. +34600000000')
    instagram = models.CharField(max_length=80, blank=True, default='',
                                 help_text='Usuario sin @')
    address = models.CharField(max_length=200, blank=True, default='')
    city = models.CharField(max_length=80, blank=True, default='')
    postal_code = models.CharField(max_length=12, blank=True, default='')
    country = models.CharField(max_length=2, default='ES')
    maps_url = models.URLField(max_length=500, blank=True, default='')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    area_served = models.CharField(max_length=300, blank=True, default='',
                                   help_text='Zonas o barrios desde donde vienen tus clientas, separados por comas '
                                             '(Google y los asistentes de IA lo usan para recomendarte).')

    # ── Textos de la web (español / inglés) ──
    tagline_en = models.CharField(max_length=200, blank=True, default='')
    description_en = models.TextField(blank=True, default='')
    hero_title = models.CharField(max_length=160, blank=True, default='',
                                  help_text='Titular grande de la portada. Vacío = el nombre del estudio.')
    hero_title_en = models.CharField(max_length=160, blank=True, default='')
    hero_subtitle = models.CharField(max_length=300, blank=True, default='')
    hero_subtitle_en = models.CharField(max_length=300, blank=True, default='')
    about_title = models.CharField(max_length=160, blank=True, default='')
    about_title_en = models.CharField(max_length=160, blank=True, default='')
    about_text = models.TextField(blank=True, default='', help_text='Quiénes sois. Párrafos separados por una línea en blanco.')
    about_text_en = models.TextField(blank=True, default='')
    about_image_url = models.URLField(max_length=500, blank=True, default='')

    # ── Datos legales (términos y condiciones, aviso legal) ──
    legal_name = models.CharField(max_length=160, blank=True, default='',
                                  help_text='Nombre de la empresa o autónomo')
    tax_id = models.CharField(max_length=30, blank=True, default='', help_text='NIF/CIF')

    # ── Aspecto ──
    color_primary = models.CharField(max_length=9, default='#A0897C')
    color_secondary = models.CharField(max_length=9, default='#85786B')
    color_dark = models.CharField(max_length=9, default='#3D3228')
    color_background = models.CharField(max_length=9, default='#F5F0EA')
    font_heading = models.CharField(max_length=60, default='Playfair Display')
    font_body = models.CharField(max_length=60, default='Jost')

    # ── Negocio ──
    currency = models.CharField(max_length=3, default='EUR')
    drop_in_price = models.DecimalField(max_digits=8, decimal_places=2, default=12,
                                        help_text='Precio de referencia de una clase suelta')

    # ── Email (SMTP propio del estudio: Gmail, Resend, Brevo…) ──
    email_enabled = models.BooleanField(default=False)
    smtp_host = models.CharField(max_length=120, blank=True, default='')
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_user = models.CharField(max_length=160, blank=True, default='')
    smtp_password = EncryptedTextField(blank=True, default='')
    smtp_use_tls = models.BooleanField(default=True)
    smtp_use_ssl = models.BooleanField(default=False)
    email_from_address = models.EmailField(blank=True, default='',
                                           help_text='Vacío = el usuario SMTP')
    email_from_name = models.CharField(max_length=120, blank=True, default='',
                                       help_text='Vacío = el nombre del estudio')

    # ── Acceso con Google (opcional): Client ID de Google Cloud (es público) ──
    google_client_id = models.CharField(max_length=200, blank=True, default='')

    # ── Pagos online (Stripe) ──
    payments_enabled = models.BooleanField(default=False)
    stripe_secret_key = EncryptedTextField(blank=True, default='')
    stripe_publishable_key = models.CharField(max_length=255, blank=True, default='')
    stripe_webhook_secret = EncryptedTextField(blank=True, default='')
    stripe_webhook_id = models.CharField(max_length=80, blank=True, default='')

    # ── Avisos push (VAPID): se generan solas la primera vez ──
    vapid_public_key = models.CharField(max_length=200, blank=True, default='')
    vapid_private_key = EncryptedTextField(blank=True, default='')

    # ── Dominios propios (vacío = las direcciones que da el servidor) ──
    web_domain = models.CharField(max_length=253, blank=True, default='',
                                  help_text='Dominio de la web de reservas, p. ej. www.tuestudio.com')
    panel_domain = models.CharField(max_length=253, blank=True, default='',
                                    help_text='Dominio del panel, p. ej. panel.tuestudio.com')

    # ── Asistente de bienvenida ──
    setup_completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración del estudio'
        verbose_name_plural = 'Configuración del estudio'

    def __str__(self):
        return self.studio_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        from api.utils.site import clear_site_config_cache
        clear_site_config_cache()

    def delete(self, *args, **kwargs):
        pass  # nunca se borra

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class StoredFile(models.Model):
    """Archivo subido desde el panel (sobre todo fotos), guardado dentro de la
    base de datos. Las fotos se reducen a tamaño web al subirlas, así que un
    estudio con cientos de imágenes ocupa unas decenas de MB. Se sirven en
    /media/<id> con caché de un año (el id nunca cambia)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    data = models.BinaryField()
    content_type = models.CharField(max_length=100)
    filename = models.CharField(max_length=255, blank=True, default='')
    size = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='uploaded_files')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.filename or self.id} ({self.size // 1024} KB)"


class FAQItem(TimeStampedSoftDelete):
    """Pregunta frecuente. Se muestran en la web (portada y precios), van en el
    marcado FAQPage para Google y en /llms.txt para los asistentes de IA: es
    el contenido que más usan para recomendar un negocio."""
    PAGES = [('home', 'Portada'), ('prices', 'Precios'), ('both', 'Portada y precios')]
    question = models.CharField(max_length=240)
    answer = models.TextField()
    question_en = models.CharField(max_length=240, blank=True, default='')
    answer_en = models.TextField(blank=True, default='')
    page = models.CharField(max_length=8, choices=PAGES, default='both')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.question


class Testimonial(TimeStampedSoftDelete):
    """Opinión de una clienta para la portada (con su permiso)."""
    author = models.CharField(max_length=120)
    text = models.TextField()
    text_en = models.TextField(blank=True, default='')
    rating = models.PositiveSmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(5)])
    source = models.CharField(max_length=60, blank=True, default='', help_text='p. ej. Google, Instagram')
    photo_url = models.URLField(max_length=500, blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.author}: {self.text[:40]}"
