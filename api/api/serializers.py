from django.utils import timezone
from rest_framework import serializers
from django.contrib.auth.hashers import make_password
from .models import BroadcastEmail, ContactUser
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
from django.contrib.auth import get_user_model

from .models import (
    TimeStampedSoftDelete, Role, GuestProfile,
    Category, Instructor, Room, ClassType,
    RecurringSchedule, Event,
    Payment, CreditWallet, CreditLedgerEntry,
    Plan, Subscription, Coupon, CouponRedemption,
    Booking, Lead, ClassOccurrence, ScheduleBlackout, UserClassPreference, SiteImage,
)

User = get_user_model()


class MadridWallDateTimeField(serializers.DateTimeField):
    """Datetime que interpreta las horas SIN zona horaria como hora de pared de
    Europe/Madrid (lo que envían el CRM y la web: "2026-10-07T10:00"), en vez
    de asumir el TIME_ZONE del proyecto (UTC), que corría las horas 2 horas.
    Usarlo en TODO campo datetime que escriba un frontend."""

    def enforce_timezone(self, value):
        if timezone.is_naive(value):
            from api.utils.availability import MADRID_TZ
            return value.replace(tzinfo=MADRID_TZ)
        return super().enforce_timezone(value)



class SignInSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    reset_token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True)
    
    
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['isAdmin'] = user.is_staff
        # Agrega el rol y los permisos al token
        token['role'] = user.role.name if user.role else None
        token['permissions'] = user.role.permissions if user.role and user.role.permissions else {}

        return token
    

        

class TimeStampedSerializerMixin(serializers.ModelSerializer):
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    deleted_at = serializers.DateTimeField(read_only=True)

    class Meta:
        abstract = True


# ---------
# SIMPLE SERIALIZERS
# ---------
class RoleSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = Role
        fields = "__all__"


# Campos que NUNCA deben salir en una respuesta: antes /v1/users/ devolvía el
# hash de la contraseña y los tokens de recuperación/verificación de todas las
# clientas (con el token de recuperación se podía cambiar su contraseña).
USER_SECRET_FIELDS = (
    'password', 'reset_token', 'reset_token_expires',
    'verification_token', 'verification_token_expires',
    'verification_code_hash', 'verification_code_expires', 'verification_code_attempts',
    'verification_last_sent', 'verification_reminders_sent',
    'user_permissions', 'groups',
)


class UserSerializer(serializers.ModelSerializer):
    role = RoleSerializer(read_only=True)
    class Meta:
        model = User
        # Ajusta según tu User
        fields = "__all__"
        extra_kwargs = {'password': {'write_only': True}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in USER_SECRET_FIELDS:
            data.pop(field, None)
        return data




class GuestProfileSerializer(TimeStampedSerializerMixin):
    linked_user = UserSerializer(read_only=True)
    linked_user_id = serializers.PrimaryKeyRelatedField(
        write_only=True, queryset=User.objects.all(), source="linked_user", required=False, allow_null=True
    )

    class Meta:
        model = GuestProfile
        fields = "__all__"


class CategorySerializer(TimeStampedSerializerMixin):
    class Meta:
        model = Category
        fields = "__all__"


class InstructorSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = Instructor
        fields = "__all__"


class RoomSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = Room
        fields = "__all__"


class ClassTypeWriteSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = ClassType
        fields = "__all__"
        

class EmailVerificationSerializer(serializers.Serializer):
    """
    Serializer para validar el token de verificación Y el user_id.
    """
    token = serializers.UUIDField()
    user_id = serializers.IntegerField() # O CharField si tu ID de usuario no es un número

    def validate(self, data):
        token = data.get('token')
        user_id = data.get('user_id')
        
        try:
            # 1. Buscar al usuario por el ID (mucho más directo)
            user = User.objects.get(id=user_id)
        
        except User.DoesNotExist:
            raise serializers.ValidationError("Usuario no encontrado.")

        # 2. Comprobar si el usuario ya está verificado
        if user.is_verified:
            raise serializers.ValidationError("La cuenta ya ha sido verificada.")

        # 3. Comprobar si el token coincide
        if user.verification_token != token:
            raise serializers.ValidationError("Token inválido.")

        # 4. Comprobar si el token ha expirado
        if timezone.now() > user.verification_token_expires:
            raise serializers.ValidationError("El token ha expirado. Por favor, solicita uno nuevo.")

        # Si todo está bien, adjuntamos el usuario para la vista
        data['user'] = user
        return data


class ClassTypeReadSerializer(TimeStampedSerializerMixin):
    category = CategorySerializer(read_only=True)
    instructor = InstructorSerializer(read_only=True)
    all_instructors = serializers.SerializerMethodField()

    class Meta:
        model = ClassType
        fields = "__all__"
    
    def get_all_instructors(self, obj):
        # 'obj' es la instancia de ClassType
        # Gracias al prefetch, esto NO hace nuevas consultas a la BD
        
        instructors = set()
        
        # 1. Añadir el instructor principal (cargado con prefetch)
        if obj.instructor:
            instructors.add(obj.instructor)
            
        # 2. Añadir los de las recurrencias (cargados con prefetch)
        # obj.recurrences.all() usará los datos pre-cargados
        for recurrence in obj.recurrences.all(): 
            if recurrence.override_instructor:
                instructors.add(recurrence.override_instructor)
        
        # Serializamos los datos (ej. solo los nombres)
        return [inst.name for inst in instructors]


class RecurringScheduleSerializer(TimeStampedSerializerMixin):
    class_type = ClassTypeReadSerializer(read_only=True)
    room = RoomSerializer(read_only=True)
    override_instructor = InstructorSerializer(read_only=True)
    
    class Meta:
        model = RecurringSchedule
        fields = "__all__"
        
class RecurringScheduleReadSerializer(TimeStampedSerializerMixin):
    # Usamos serializers anidados (objetos) para la LECTURA
    class_type = ClassTypeReadSerializer(read_only=True)
    room = RoomSerializer(read_only=True)
    override_instructor = InstructorSerializer(read_only=True)
    
    class Meta:
        model = RecurringSchedule
        fields = "__all__"


class RecurringScheduleWriteSerializer(TimeStampedSerializerMixin):
    # Usamos PrimaryKeyRelatedField para la ESCRITURA (acepta IDs)
    
    class_type = serializers.PrimaryKeyRelatedField(
        queryset=ClassType.objects.all(),
        required=True 
    )
    room = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(),
        required=True
    )
    override_instructor = serializers.PrimaryKeyRelatedField(
        queryset=Instructor.objects.all(),
        required=False, 
        allow_null=True # Permite que el valor entrante sea `null` o `None`
    )
    
    class Meta:
        model = RecurringSchedule
        # Incluye todos los demás campos que tu frontend envía
        fields = (
            'id', 'class_type', 'room', 'override_instructor', 'weekday', 
            'start_time', 'end_time', 'duration_minutes', 'capacity_min', 
            'capacity_max', 'start_date', 'end_date', 'is_active', 
            'price_credits_override', 'price_eur_override', 'is_recurrent'
        )

class ClassOccurrenceWriteSerializer(TimeStampedSerializerMixin):
    
    class Meta:
        model = ClassOccurrence
        fields = "__all__"


class ClassOccurrenceReadSerializer(TimeStampedSerializerMixin):
    class_type = ClassTypeReadSerializer(read_only=True)
    room = RoomSerializer(read_only=True)
    override_instructor = InstructorSerializer(read_only=True)

    instructor = serializers.SerializerMethodField()

    def get_instructor(self, obj):
        # 'obj' es la instancia de RecurringSchedule
        
        # Primero, revisamos si hay un instructor de override
        if obj.override_instructor:
            return obj.override_instructor.name

        # Si no hay override, usamos el instructor por defecto del ClassType
        if obj.class_type and obj.class_type.instructor:
            return obj.class_type.instructor.name
        
        return "Instructor no asignado"

    class Meta:
        model = ClassOccurrence
        fields = "__all__"


class EventWriteSerializer(TimeStampedSerializerMixin):
    # El CRM envía las horas del evento sin zona (datetime-local): son hora de Madrid
    start_datetime = MadridWallDateTimeField()
    end_datetime = MadridWallDateTimeField()

    class Meta:
        model = Event
        fields = "__all__"


class EventReadSerializer(TimeStampedSerializerMixin):
    category = CategorySerializer(read_only=True)
    class_type = ClassTypeReadSerializer(read_only=True)
    room = RoomSerializer(read_only=True)
    override_instructor = InstructorSerializer(read_only=True)
    instructor = serializers.SerializerMethodField()

    def get_instructor(self, obj):
        ins = obj.instructor
        if not ins:
            return None
        return InstructorSerializer(ins).data

    class Meta:
        model = Event
        fields = "__all__"


class PaymentSerializer(TimeStampedSerializerMixin):
    guest = GuestProfileSerializer(read_only=True)
    user = UserSerializer(read_only=True)
    class Meta:
        model = Payment
        fields = "__all__"

    def validate(self, attrs):
        user = attrs.get("user") or getattr(self.instance, "user", None)
        guest = attrs.get("guest") or getattr(self.instance, "guest", None)
        if user and guest:
            raise serializers.ValidationError("Payment: user y guest no pueden estar ambos presentes (XOR).")
        return attrs


class CreditWalletSerializer(TimeStampedSerializerMixin):
    balance = serializers.DecimalField(read_only=True, max_digits=12, decimal_places=2)

    class Meta:
        model = CreditWallet
        fields = "__all__"


class CreditLedgerEntrySerializer(TimeStampedSerializerMixin):
    class Meta:
        model = CreditLedgerEntry
        fields = "__all__"


class PlanSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = Plan
        fields = "__all__"


class PlanMiniSerializer(serializers.ModelSerializer):
    """Lightweight plan snapshot embedded in SubscriptionSerializer."""
    class Meta:
        model = Plan
        fields = ('id', 'name', 'credits', 'price_eur', 'description', 'type', 'interval')


class SubscriptionSerializer(TimeStampedSerializerMixin):
    plan = PlanMiniSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = (
            'id', 'user', 'plan', 'status',
            'current_period_start', 'current_period_end',
            'cancel_at_period_end', 'stripe_subscription_id',
            'created_at', 'updated_at',
        )


class CouponSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = Coupon
        fields = "__all__"


class CouponRedemptionSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = CouponRedemption
        fields = "__all__"
        
    
class ContactUserSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = ContactUser
        fields = "__all__"
    



class ScheduleBlackoutSerializer(TimeStampedSerializerMixin):
    schedule_title = serializers.SerializerMethodField(read_only=True)
    start_datetime = MadridWallDateTimeField()
    end_datetime = MadridWallDateTimeField()

    class Meta:
        model = ScheduleBlackout
        fields = (
            'id', 'schedule', 'schedule_title', 'start_datetime', 'end_datetime',
            'kind', 'reason', 'created_by', 'created_at',
        )
        read_only_fields = ('created_by', 'created_at')

    def get_schedule_title(self, obj):
        if not obj.schedule_id:
            return None
        return f"{obj.schedule.class_type.title} ({obj.schedule.start_time:%H:%M})"

    def validate(self, attrs):
        start = attrs.get('start_datetime') or getattr(self.instance, 'start_datetime', None)
        end = attrs.get('end_datetime') or getattr(self.instance, 'end_datetime', None)
        if start and end and end <= start:
            raise serializers.ValidationError("end_datetime debe ser posterior a start_datetime.")
        return attrs


class BookingWriteSerializer(TimeStampedSerializerMixin):
    # Mismo criterio que blackouts/eventos: hora sin zona = hora de Madrid.
    # (Los flujos reales mandan instantes UTC con "Z" y no cambian.)
    # required=False y allow_null porque el modelo los permite null.
    start_datetime = MadridWallDateTimeField(required=False, allow_null=True)
    end_datetime = MadridWallDateTimeField(required=False, allow_null=True)

    class Meta:
        model = Booking
        fields = "__all__"

    def validate(self, attrs):
        # XOR user/guest
        user = attrs.get("user") or getattr(self.instance, "user", None)
        guest = attrs.get("guest") or getattr(self.instance, "guest", None)
        if user and guest:
            raise serializers.ValidationError("Booking: user y guest no pueden estar ambos presentes (XOR).")

        # XOR occurrence/event
        occurrence = attrs.get("occurrence") or getattr(self.instance, "occurrence", None)
        event = attrs.get("event") or getattr(self.instance, "event", None)
        if bool(occurrence) == bool(event):
            raise serializers.ValidationError("Booking: debes especificar occurrence O event (XOR).")

        # Disponibilidad/aforo (simple, opcional)
        if occurrence:
            if not occurrence.is_active:
                raise serializers.ValidationError("La sesión no está activa.")

            # Ventana de vigencia + excepciones de calendario (vacaciones,
            # franjas cerradas, clases privadas)
            slot_start = attrs.get("start_datetime") or (
                self.instance.start_datetime if self.instance else None
            )
            if slot_start is not None:
                from api.utils.availability import slot_unavailable_reason, UNAVAILABLE_MESSAGES
                reason = slot_unavailable_reason(occurrence, slot_start)
                if reason:
                    raise serializers.ValidationError(UNAVAILABLE_MESSAGES[reason])

            if occurrence.capacity_max is not None:
                start_dt = attrs.get("start_datetime") or (
                    self.instance.start_datetime if self.instance else None
                )
                existing_qs = occurrence.bookings.filter(status__in=["reserved", "attended"])
                if start_dt:
                    existing_qs = existing_qs.filter(start_datetime=start_dt)
                if self.instance:
                    existing_qs = existing_qs.exclude(id=self.instance.id)
                if existing_qs.count() >= occurrence.capacity_max:
                    raise serializers.ValidationError("No quedan plazas para esta sesión.")
        if event:
            if event.status == "canceled":
                raise serializers.ValidationError("El evento está cancelado.")
            if event.capacity_max is not None and event.event_bookings.filter(
                status__in=["reserved", "attended"]
            ).count() >= event.capacity_max:
                raise serializers.ValidationError("No quedan plazas para este evento.")

        return attrs

# Serializador MÍNIMO (para la lista)
class BookingListSerializer(serializers.ModelSerializer):
    # Muestra el nombre/email del usuario o invitado
    who = serializers.SerializerMethodField()
    who_email = serializers.SerializerMethodField()
    who_phone = serializers.SerializerMethodField()
    
    
    # Muestra el título de la clase o evento
    what = serializers.SerializerMethodField()
    what_en = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
    room_name_en = serializers.SerializerMethodField()
    teacher = serializers.SerializerMethodField()
    occurrence_id = serializers.IntegerField(source='occurrence.id', read_only=True) # <--- AÑADIR ESTO

    class Meta:
        model = Booking
        # Define solo los campos mínimos que quieres en la lista
        fields = [
            'id', 
            'status', 
            'start_datetime', 
            'end_datetime', 
            'who',
            'who_email',
            'who_phone', 
            'what',
            'what_en',
            'room_name',
            'room_name_en',
            'teacher',
            'occurrence_id'
        ]

    def get_who(self, obj):
        if obj.user:
            return obj.user.get_full_name() 
        if obj.guest:
            return obj.guest.name
        return None
    
    def get_who_email(self, obj):
        if obj.user:
            return obj.user.email
        if obj.guest:
            return obj.guest.email
        return None
    
    def get_who_phone(self, obj):
        if obj.user:
            return obj.user.phone
        if obj.guest:
            return obj.guest.phone
        return None

    def get_what(self, obj):
        if obj.occurrence:
            # Asumiendo que RecurringSchedule tiene un class_type con title
            return obj.occurrence.class_type.title
        if obj.event:
            return obj.event.title
        return None

    def get_what_en(self, obj):
        if obj.occurrence:
            ct = obj.occurrence.class_type
            return ct.title_en or ct.title
        if obj.event:
            return obj.event.title_en or obj.event.title
        return None

    def _room(self, obj):
        if obj.occurrence:
            return obj.occurrence.room
        if obj.event:
            return obj.event.room
        return None

    def get_room_name(self, obj):
        room = self._room(obj)
        return room.name if room else None

    def get_room_name_en(self, obj):
        room = self._room(obj)
        return (room.title_en or room.name) if room else None
        
    def get_teacher(self, obj):
        if not obj.occurrence:
            ins = getattr(obj.event, 'instructor', None) if obj.event else None
            return getattr(ins, 'name', None)
        if obj.occurrence.override_instructor:
            return obj.occurrence.override_instructor.name
        if obj.occurrence.class_type and obj.occurrence.class_type.instructor:
            return obj.occurrence.class_type.instructor.name
        return None



class BookingReadSerializer(TimeStampedSerializerMixin):
    event = EventReadSerializer(read_only=True)
    occurrence = RecurringScheduleReadSerializer(read_only=True)
    user = UserSerializer(read_only=True)
    guest = GuestProfileSerializer(read_only=True)
    payment = PaymentSerializer(read_only=True)

    class Meta:
        model = Booking
        fields = "__all__"
        

class LeadSerializer(TimeStampedSerializerMixin):

    class Meta:
        model = Lead
        fields = "__all__"


class BroadcastEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = BroadcastEmail
        fields = ['id', 'subject', 'title', 'description', 'highlighted_text',
                  'send_email', 'send_push', 'push_url', 'emails_sent', 'pushes_sent',
                  'created_at', 'sent_at']
        read_only_fields = ['id', 'created_at', 'sent_at', 'emails_sent', 'pushes_sent']

    def validate(self, attrs):
        if not attrs.get('send_email', True) and not attrs.get('send_push', True):
            raise serializers.ValidationError('Elige al menos un canal: email o notificación push.')
        url = attrs.get('push_url') or ''
        if url and not url.startswith('/'):
            raise serializers.ValidationError(
                {'push_url': 'Usa una ruta de la web que empiece por «/», p. ej. /calendar.'})
        return attrs
        
        
        
class FileUploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class UserClassPreferenceSerializer(serializers.ModelSerializer):
    schedule_title = serializers.CharField(source='schedule.class_type.title', read_only=True)
    weekday = serializers.IntegerField(source='schedule.weekday', read_only=True)
    start_time = serializers.TimeField(source='schedule.start_time', read_only=True)
    room_name = serializers.CharField(source='schedule.room.name', read_only=True)
    schedule_title_en = serializers.SerializerMethodField()
    room_name_en = serializers.SerializerMethodField()
    credits_per_class = serializers.SerializerMethodField()

    def get_schedule_title_en(self, obj):
        ct = obj.schedule.class_type
        return ct.title_en or ct.title

    def get_room_name_en(self, obj):
        room = obj.schedule.room
        return room.title_en or room.name

    def get_credits_per_class(self, obj):
        if obj.schedule.price_credits_override is not None:
            return float(obj.schedule.price_credits_override)
        return float(obj.schedule.class_type.default_price_credits)

    class Meta:
        model = UserClassPreference
        fields = ('id', 'user', 'schedule', 'schedule_title', 'schedule_title_en', 'weekday', 'start_time', 'room_name', 'room_name_en', 'is_active', 'created_at', 'credits_per_class')
        read_only_fields = ('user', 'created_at')


class UserClassPreferenceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserClassPreference
        fields = ('schedule', 'is_active')


class SiteImageSerializer(TimeStampedSerializerMixin):
    class Meta:
        model = SiteImage
        fields = '__all__'