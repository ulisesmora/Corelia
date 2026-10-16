from collections import defaultdict
from datetime import datetime, timedelta
import decimal
import json
import logging
from django.utils import timezone
from zoneinfo import ZoneInfo
from api.filters import UserFilter
from api.utils.emailing import send_templated_email
from api.utils.payment_plan import fulfill_plan_purchase
from api.utils.recurring_calendar import generate_recurring_occurrences
import uuid
import os
import stripe
from django.http import JsonResponse
from django.views import View
from rest_framework.response import Response
from decimal import Decimal
from api.utils.sms import notify_cancellation_email, send_whatsapp_cancellation
from api.pagination import StandardPagination
from .serializers import (
    BookingListSerializer, BroadcastEmailSerializer, ContactUserSerializer, CustomTokenObtainPairSerializer, EmailVerificationSerializer, FileUploadSerializer, RecurringScheduleReadSerializer, RecurringScheduleWriteSerializer, ResetPasswordSerializer, SignInSerializer, UserClassPreferenceSerializer, UserClassPreferenceWriteSerializer,
)
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework import viewsets, permissions, filters, status
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction

from django.contrib.auth import get_user_model


from django.db import IntegrityError

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from django.contrib.auth.hashers import check_password, make_password
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.db.models import ForeignKey
from .models import (
    BroadcastEmail, ContactUser, Role, GuestProfile,
    Category, Instructor, Room, ClassType,
    RecurringSchedule, Event,
    Payment, CreditWallet, CreditLedgerEntry,
    Plan, Subscription, Coupon, CouponRedemption,
    Booking, Lead, ClassOccurrence, PushSubscription, ScheduleBlackout, UserClassPreference, SiteImage,
    MembershipNudge, SiteConfig, WaitlistEntry, WaitlistSettings,
)
from api.utils.availability import (
    MADRID_TZ, UNAVAILABLE_MESSAGES, blackouts_overlapping,
    slot_unavailable_reason, to_madrid_wall,
)
from .serializers import (
    RoleSerializer, GuestProfileSerializer,
    CategorySerializer, InstructorSerializer, RoomSerializer,
    ClassTypeWriteSerializer, ClassTypeReadSerializer,
    RecurringScheduleSerializer,
    EventWriteSerializer, EventReadSerializer,
    PaymentSerializer, CreditWalletSerializer, CreditLedgerEntrySerializer,
    PlanSerializer, SubscriptionSerializer, CouponSerializer, CouponRedemptionSerializer,
    BookingWriteSerializer, BookingReadSerializer,
    LeadSerializer, UserSerializer, ClassOccurrenceWriteSerializer, ClassOccurrenceReadSerializer,
    UserClassPreferenceSerializer, UserClassPreferenceWriteSerializer, SiteImageSerializer,
    ScheduleBlackoutSerializer,
)

User = get_user_model()

logger = logging.getLogger(__name__)

from rest_framework.parsers import MultiPartParser, FormParser
from django.http import HttpResponse
import csv
from rest_framework.decorators import action
from api.utils.site import placeholder_email, web_url
from api.utils.payments import from_stripe_amount, stripe_currency, to_stripe_amount
from io import TextIOWrapper
from django.conf import settings

from django.utils.dateparse import parse_datetime

from django.db.models import Count, Q
from api.throttling import check_throttles, scoped
from api.utils import lockout
from api.utils.turnstile import check_captcha
from api.views_security import (
    check_credentials, login_failed, login_gate, panel_session, two_factor_challenge,
)


from datetime import datetime, date, timedelta, timezone as dt_timezone 

class HasPermission(BasePermission):
    def has_permission(self, request, view):
        # Verify if the token is present and valid
        if not hasattr(request, 'auth') or not request.auth:
            logger.debug("has_permission.denied reason=no_jwt")
            return False

        # Extract permissions from the token
        permissions = request.auth.get('permissions', {})

        endpoint = request.path.rstrip('/').split('/')[3]
        logger.debug("has_permission.check endpoint=%s permissions=%s", endpoint, permissions)

        # Check if permissions are provided as a dictionary
        if not isinstance(permissions, dict):
            logger.debug("has_permission.denied reason=permissions_not_dict")
            return False

        # For read operations, check 'read' permission
        if view.action in ['list', 'retrieve']:
            has_read_permission = permissions.get(endpoint) == 'read'
            has_write_permission = permissions.get(endpoint) == 'write'
            logger.debug(f"Permiso de lectura para {endpoint}: {has_read_permission}")
            logger.debug(f"Permiso de escritura para {endpoint}: {has_write_permission}")
            # Si no tiene ni permiso de lectura ni de escritura, se deniega el acceso
            if not (has_read_permission or has_write_permission):
                return False

        # Para operaciones de escritura, se valida el permiso 'write'
        if view.action in ['create', 'update', 'partial_update', 'destroy']:
            has_write_permission = permissions.get(endpoint) == 'write'
            logger.debug(f"Permiso de escritura para {endpoint}: {has_write_permission}")
            if not has_write_permission:
                return False

        return True

class UserViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter] 
    queryset = User.objects.select_related("role").all()
    serializer_class = UserSerializer
    
    # 🎯 CLAVE 2: Asignar la clase de filtro que define is_superuser
    filterset_class = UserFilter
    
    # search_fields es opcional si quieres búsquedas de texto
    search_fields = ["username", "email", "first_name", "phone"]
    
    def get_permissions(self):
        # Antes list/retrieve eran públicos: cualquiera descargaba las fichas
        # de todas las clientas. Ahora: listar = solo administración; ver una
        # ficha = administración o la propia clienta (ver get_queryset).
        if self.action == 'retrieve':
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [IsAdminUser]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action == 'retrieve' and not (user.is_staff or user.is_superuser):
            return qs.filter(id=user.id)
        return qs

    def update(self, request, *args, **kwargs):
        # Perform a partial update (PATCH) instead of full update
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)
    
    
    @action(detail=False, methods=['get'])
    def export_csv(self, request, *args, **kwargs):
    # Query the data
        users = self.queryset

    # Create the HttpResponse object with CSV content type
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="users.csv"'

    # Write the data to the CSV
        writer = csv.writer(response)
    # Define headers
        writer.writerow(['ID','NAME', 'EMAIL', 'CREATED_DATE', 'UPDATE_DATE', 'STATUS', 'STAFF'])

    # Write rows
        return response

    
    
class SignUpView(APIView):
    # Crea administradores del CRM: antes era AllowAny y cualquiera podía
    # darse de alta como superusuario.
    permission_classes = [IsAdminUser]

    def post(self, request):
        data = request.data.copy()
        data['is_first_login'] = False
        user_serializer = UserSerializer(data=data)
        if user_serializer.is_valid():
            # Guarda primero al usuario
            user = user_serializer.save() 
            user.is_staff = True
            user.is_superuser = True
            
            # 2. Hashea la contraseña y asigna el hash al objeto en memoria
            user.password = make_password(data['password'])
            
            # 3. ¡GUARDA EL CAMBIO EN LA BASE DE DATOS! ⬅️ CORRECCIÓN CLAVE
            user.save() 
            return Response({"message": "User and Client created successfully"}, status=status.HTTP_201_CREATED)

        return Response({"user_errors": user_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    

    
class SignUpClientView(APIView):
    """Registro de clientas.

    - Público (web/app): email y contraseña obligatorios. La cuenta queda
      ACTIVA al momento (verificación suave): devolvemos la sesión para que
      pueda reservar ya, y se le envía un código de 6 dígitos para confirmar
      el email cuando quiera (obligatorio solo para contratar membresía).
    - Desde el CRM (sesión de admin): se permite dar de alta sin email; se
      genera una dirección interna y una contraseña INUTILIZABLE (antes era
      la fija "dom2024", con la que cualquiera podía entrar en esas cuentas).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data.copy()
        if hasattr(data, '_mutable'):
            data._mutable = True

        is_admin = bool(getattr(request.user, 'is_authenticated', False) and request.user.is_staff)
        if not is_admin:
            # Registro público: límite por IP y captcha (si está configurado).
            # Las altas desde el panel no tienen límite.
            check_throttles(request, scoped('signup'))
            captcha = check_captcha(request)
            if captcha:
                return captcha
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if is_admin and not email:
            name = (data.get('first_name') or '').strip()
            phone = (data.get('phone') or '').strip()
            if name:
                import re, unicodedata
                ascii_name = unicodedata.normalize('NFKD', name.lower()).encode('ascii', 'ignore').decode()
                slug = re.sub(r'[^a-z0-9]+', '.', ascii_name).strip('.') or 'cliente'
                email = placeholder_email(f"{slug}.{uuid.uuid4().hex[:4]}")
            elif phone:
                email = placeholder_email(f"cliente{phone.replace('+', '').replace(' ', '')[-6:]}")
            else:
                email = placeholder_email(f"cliente{uuid.uuid4().hex[:8]}")

        if not email:
            return Response({"user_errors": {"email": ["Escribe tu email."]}}, status=status.HTTP_400_BAD_REQUEST)
        if not is_admin and len(password) < 6:
            return Response({"user_errors": {"password": ["La contraseña debe tener al menos 6 caracteres."]}},
                            status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=email).exists():
            return Response({"user_errors": {"email": ["Ya hay una cuenta con este email. Inicia sesión o recupera tu contraseña."]}},
                            status=status.HTTP_400_BAD_REQUEST)

        data['email'] = email
        data['username'] = email
        data['password'] = password or uuid.uuid4().hex  # se sustituye abajo
        for extra in ('turnstile_token', 'cf-turnstile-response'):
            data.pop(extra, None)

        user_serializer = UserSerializer(data=data)
        if not user_serializer.is_valid():
            return Response({"user_errors": user_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        user = user_serializer.save()
        user.is_staff = False
        user.is_superuser = False
        if is_admin and not password:
            user.set_unusable_password()
            user.created_by_admin = True
        else:
            user.password = make_password(password)
        # Solo estos campos: un save() completo pisaría el código de
        # verificación que la señal acaba de generar y enviar por email.
        user.save(update_fields=['is_staff', 'is_superuser', 'password', 'created_by_admin'])

        if is_admin:
            return Response({"message": "Clienta creada", "email": email, "user_id": user.id},
                            status=status.HTTP_201_CREATED)

        # Sesión inmediata (verificación suave)
        refresh = RefreshToken.for_user(user)
        access = CustomTokenObtainPairSerializer.get_token(user).access_token
        logger.info("auth.signup user_id=%s", user.id)
        return Response({
            "message": "Cuenta creada",
            "email": email,
            "refresh": str(refresh),
            "access": str(access),
            "userid": user.id,
            "username": user.first_name,
            "is_verified": False,
        }, status=status.HTTP_201_CREATED)


class SignInView(APIView):
    """POST /api/signin/ {email, password[, turnstile_token]} — entrada al panel.

    - Email bloqueado por intentos fallidos → 429 (code='account_locked').
    - Tras varios fallos, si el captcha está configurado, hay que mandarlo.
    - Con la verificación en dos pasos activada NO devuelve la sesión sino
      {two_factor_required, two_factor_token}: el código va a /api/v1/auth/2fa/verify/.
    """
    permission_classes = [AllowAny]
    throttle_classes = [scoped('login'), scoped('login_email', 'email')]

    def post(self, request):
        serializer = SignInSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        email = serializer.validated_data['email'].strip()
        blocked = login_gate(request, email)
        if blocked:
            return blocked
        user = check_credentials(email, serializer.validated_data['password'])
        if user and user.is_staff and user.is_superuser:
            from api.utils import two_factor
            lockout.clear_failures(email)
            if two_factor.is_enabled(user):
                return Response(two_factor_challenge(user))
            logger.info("auth.panel_login user_id=%s two_factor=none", user.id)
            return Response(panel_session(user))
        return login_failed(request, email, "Invalid credentials")


class SignInViewClient(APIView):
    """POST /api/signinClient/ {email, password[, turnstile_token]} — entrada de clientas.
    Mismos límites, bloqueo y captcha que el panel. Una cuenta del panel aquí
    recibe la misma respuesta que una contraseña incorrecta (antes un mensaje
    distinto delataba que la contraseña de un administrador era buena)."""
    permission_classes = [AllowAny]
    throttle_classes = [scoped('login'), scoped('login_email', 'email')]

    def post(self, request):
        serializer = SignInSerializer(data=request.data)
        if not serializer.is_valid():
            # Si los datos enviados no son válidos (ej. 'email' mal formateado)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        email = serializer.validated_data['email'].strip()
        blocked = login_gate(request, email)
        if blocked:
            return blocked
        user = check_credentials(email, serializer.validated_data['password'])

        if user and not user.is_staff and not user.is_superuser:
            lockout.clear_failures(email)
            # Verificación suave: una cuenta sin confirmar también entra (antes
            # quedaba bloqueada para siempre si el email se perdía, sin forma de
            # reenviarlo). El front le pide el código; solo la membresía exige
            # email confirmado.
            refresh = RefreshToken.for_user(user)
            access_token = CustomTokenObtainPairSerializer.get_token(user).access_token
            return Response({
                "refresh": str(refresh),
                "access": str(access_token),
                "role": user.role.name if user.role else None,
                "permissions": user.role.permissions if user.role else {},
                "userid": user.id,
                "username": user.first_name,
                "is_verified": bool(user.is_verified),
            }, status=status.HTTP_200_OK)

        # Email o contraseña incorrectos, o cuenta del panel
        return login_failed(request, email, "Email o contraseña incorrectos.")


class EmailVerificationView(APIView):

    permission_classes = [AllowAny]
    throttle_classes = [scoped('email_verify')]

    def post(self, request):
        serializer = EmailVerificationSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.validated_data['user']
            from api.utils.verification import mark_verified
            mark_verified(user)

            return Response(
                {"message": "Email verificado correctamente. Ya puedes iniciar sesión."}, 
                status=status.HTTP_200_OK
            )
        
        # Si no es válido, devuelve los errores (ej: "Token inválido", "Token ha expirado")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    
class RequestPasswordResetView(APIView):
    """Envía el enlace de recuperación. Nunca devuelve el token (antes iba en
    la respuesta: cualquiera podía cambiar la contraseña de otra persona) y
    responde lo mismo exista o no el email (no revela quién tiene cuenta).
    Límite por IP y por email, y captcha si está configurado."""
    permission_classes = [AllowAny]
    throttle_classes = [scoped('password_reset'), scoped('password_reset_email', 'email')]

    def post(self, request):
        captcha = check_captcha(request)
        if captcha:
            return captcha
        email = (request.data.get("email") or '').strip()
        user = User.objects.filter(email__iexact=email).first() if email else None
        if user:
            user.set_reset_token()
            data = {
                "name": user.first_name or "",
                "verification_url": web_url(f"/recover-password?email={user.email}&token={user.reset_token}"),
            }
            send_templated_email(
                to_email=user.email,
                template_id="password-recovery",
                dynamic_data=data,
            )
            logger.info("auth.password_reset_requested user_id=%s", user.id)
        return Response(
            {"message": "Si hay una cuenta con ese email, te hemos enviado un enlace para crear una contraseña nueva."},
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [scoped('password_reset_confirm')]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = User.objects.filter(
                email__iexact=serializer.validated_data['email'],
                reset_token=serializer.validated_data['reset_token'],
            ).first()
            if not user or (user.reset_token_expires and timezone.now() > user.reset_token_expires):
                return Response({"error": "El enlace no es válido o ha caducado. Pide uno nuevo."},
                                status=status.HTTP_400_BAD_REQUEST)
            new_password = serializer.validated_data['new_password']
            if len(new_password) < 6:
                return Response({"error": "La contraseña debe tener al menos 6 caracteres."},
                                status=status.HTTP_400_BAD_REQUEST)
            user.password = make_password(new_password)
            user.reset_token = None
            user.reset_token_expires = None
            # Si recibió el enlace en su correo, el email también queda demostrado
            user.is_verified = True
            # Antes faltaba este save(): la contraseña nunca se cambiaba de verdad
            user.save(update_fields=['password', 'reset_token', 'reset_token_expires', 'is_verified'])
            # Quien recibe el enlace en su correo puede desbloquear su cuenta
            lockout.unlock(user.email)
            logger.info("auth.password_reset_done user_id=%s", user.id)
            return Response({"message": "Contraseña actualizada. Ya puedes iniciar sesión."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ValidateJWTView(APIView):
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        try:
            

            return Response({'message': 'JWT is valid'}, status=status.HTTP_200_OK)

        except (InvalidToken, TokenError) as e:
            return Response({'error': 'Invalid token'}, status=status.HTTP_401_UNAUTHORIZED)

        # ... (other exception handling)


class FileUploadViewTwo(APIView):
    """Sube un archivo (fotos de clases, instructores, logo…) y devuelve su
    URL pública. Se guarda en la base de datos (StoredFile), ya reducido a
    tamaño web: no hace falta S3. Solo administración."""
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAdminUser]

    def post(self, request, *args, **kwargs):
        serializer = FileUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        file = serializer.validated_data["file"]
        if file.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
            return Response({"error": f"El archivo pesa más de {settings.MAX_UPLOAD_MB} MB."}, status=400)

        from api.models import StoredFile
        from api.utils.images import shrink_image
        upload, content_type, ext = shrink_image(file, file.content_type, file.name)
        data = upload.read()
        width = height = None
        try:
            from PIL import Image
            import io as _io
            with Image.open(_io.BytesIO(data)) as im:
                width, height = im.size
        except Exception:
            pass
        stored = StoredFile.objects.create(
            data=data, content_type=content_type or 'application/octet-stream',
            filename=file.name[:255], size=len(data), width=width, height=height,
            uploaded_by=request.user,
        )
        from api.utils.site import api_url
        file_url = api_url(f"/media/{stored.id}{ext or ''}")
        logger.info("upload.stored id=%s size=%s type=%s", stored.id, stored.size, stored.content_type)
        return Response({"file_url": file_url, "id": str(stored.id)}, status=201)


def serve_stored_file(request, file_id, ext=''):
    """GET /media/<uuid>[.ext] — sirve un archivo guardado en la BD con caché
    de un año (el id nunca cambia, así que el navegador y la CDN lo guardan)."""
    from django.http import Http404
    from api.models import StoredFile
    etag = f'"{file_id}"'
    if request.headers.get('If-None-Match') == etag:
        resp = HttpResponse(status=304)
        resp['ETag'] = etag
        return resp
    try:
        f = StoredFile.objects.only('data', 'content_type').get(id=file_id)
    except (StoredFile.DoesNotExist, ValueError):
        raise Http404
    resp = HttpResponse(bytes(f.data), content_type=f.content_type)
    resp['Cache-Control'] = 'public, max-age=31536000, immutable'
    resp['ETag'] = etag
    resp['Access-Control-Allow-Origin'] = '*'
    return resp


class SoftDeleteModelViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        model = self.queryset.model if self.queryset is not None else self.get_serializer_class().Meta.model
        if self.request and self.request.query_params.get("include_deleted") == "1":
            return model.all_objects.all()
        return super().get_queryset()

    def perform_destroy(self, instance):
        instance.soft_delete()


class RoleViewSet(SoftDeleteModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    search_fields = ["name", "description"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]


class GuestProfileViewSet(SoftDeleteModelViewSet):
    queryset = GuestProfile.objects.select_related("linked_user").all()
    serializer_class = GuestProfileSerializer
    filterset_fields = ["email"]
    search_fields = ["email", "name"]

    def get_permissions(self):
        # Antes list/retrieve eran públicos (datos de 236 invitadas: email,
        # teléfono, fecha de nacimiento). Ahora solo administración.
        if self.action == 'claim':
            return [permissions.IsAuthenticated()]
        return [IsAdminUser()]

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def claim(self, request, pk=None):
        """
        Vincula este guest al usuario autenticado y migra su historial.
        (Versión simple: reasigna bookings, payments, redemptions y leads por email)
        """
        guest: GuestProfile = self.get_object()
        from .services.accounts import merge_guest_into_user  # si creaste el servicio
        res = merge_guest_into_user(guest=guest, user=request.user)
        return Response({"status": "ok", "migrated": res})


class CategoryViewSet(SoftDeleteModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    search_fields = ["name", "slug"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]


class InstructorViewSet(SoftDeleteModelViewSet):
    queryset = Instructor.objects.all()
    serializer_class = InstructorSerializer
    search_fields = ["name", "slug"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]


class RoomViewSet(SoftDeleteModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    search_fields = ["name", "location"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]


class ClassTypeViewSet(SoftDeleteModelViewSet):
    queryset = ClassType.objects.select_related("category", "instructor").prefetch_related("recurrences__override_instructor")
    filterset_fields = ["category", "level", "instructor", "slug"]
    search_fields = ["title", "slug", "description", "slug"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return ClassTypeReadSerializer
        return ClassTypeWriteSerializer


    
class RecurringScheduleViewSet(SoftDeleteModelViewSet):
    queryset = RecurringSchedule.objects.select_related(
        "class_type__instructor",
        "class_type__category",
        "room",
        "override_instructor"
    )
    
    filterset_fields = ["class_type", "room", "weekday", "is_active", "is_recurrent"]
    search_fields = []
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        # ⬅️ LECTURA: Envía objetos anidados
        if self.action in ["list", "retrieve"]:
            return RecurringScheduleReadSerializer

        # ⬅️ ESCRITURA: Acepta IDs
        return RecurringScheduleWriteSerializer

    def perform_destroy(self, instance):
        # DELETE desde el CRM: antes solo hacía soft-delete y las clientas se
        # quedaban con reservas pagadas de una clase que desaparecía del
        # calendario, sin reembolso ni aviso. Ahora cancela las reservas
        # futuras (reembolso + email/WhatsApp/push) y activa el flujo de
        # reemplazo para las suscriptoras con la clase en preferencias.
        from api.utils.cancel_bookings import cancel_all_schedule_bookings
        result = cancel_all_schedule_bookings(instance.id)
        logger.info(
            "schedule.destroy schedule_id=%s cancelled=%s refunded=%s replaced=%s",
            instance.id, result.get('cancelled'), result.get('refunded'),
            result.get('preferences_replaced', result.get('affected_users')),
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def apply_from(self, request, pk=None):
        """Cambio de horario con fecha de efecto.

        POST /v1/recurrences/{id}/apply_from/
        body: {
          "effective_date": "2026-10-01",
          "changes": {"start_time": "18:00", "end_time": "19:00", ...},  # opcional
          "end_only": false   # true = la clase TERMINA en esa fecha (sin sustituta)
        }
        La regla actual sigue vigente hasta la víspera (end_date = effective_date - 1)
        y, salvo end_only, se crea una regla nueva vigente desde effective_date.
        Las reservas ya hechas no se tocan.

        Campos admitidos en changes: weekday, start_time, end_time, room,
        capacity_min, capacity_max, price_credits_override, price_eur_override,
        override_instructor, class_type.

        Si el cambio NO altera sala/día/hora (p. ej. solo la profesora o las
        plazas), también vale: la regla vieja queda con fecha de fin y la BD
        solo exige una regla ABIERTA por sala/día/hora.
        """
        schedule = self.get_object()

        eff_str = request.data.get('effective_date')
        try:
            effective_date = datetime.strptime(str(eff_str), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({'error': 'effective_date requerido (YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.now().date()
        if effective_date <= today:
            return Response(
                {'error': 'effective_date debe ser futura. Para cambios inmediatos edita la regla directamente.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if schedule.end_date and schedule.end_date < effective_date:
            return Response(
                {'error': f'La regla ya termina el {schedule.end_date}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        end_only = str(request.data.get('end_only', '')).lower() in ('1', 'true', 'yes')
        changes = request.data.get('changes') or {}

        # ¿Qué hacer con las reservas YA HECHAS a partir de la fecha de efecto?
        #   keep   → se mantienen tal cual (comportamiento anterior)
        #   move   → se trasladan a la hora/sala nueva conservando su fecha
        #            (requiere que el día de la semana no cambie)
        #   cancel → se cancelan, se reembolsan créditos y se avisa
        existing_mode = str(request.data.get('existing_bookings', 'keep')).lower()
        if existing_mode not in ('keep', 'move', 'cancel'):
            return Response({'error': "existing_bookings debe ser 'keep', 'move' o 'cancel'."},
                            status=status.HTTP_400_BAD_REQUEST)
        new_weekday = changes.get('weekday', schedule.weekday)
        if existing_mode == 'move' and (end_only or new_weekday != schedule.weekday):
            return Response(
                {'error': 'Solo se pueden MOVER las reservas si la clase mantiene el mismo día '
                          'de la semana (y no estás terminándola). Usa "cancel" o "keep".'},
                status=status.HTTP_400_BAD_REQUEST)

        # La lógica vive en api/utils/calendar_ops.py (la usa también el
        # calendario del panel: «Esta y las siguientes»).
        from api.utils.calendar_ops import CalendarError, apply_schedule_from
        try:
            result = apply_schedule_from(
                schedule, effective_date, changes, end_only=end_only,
                existing_mode=existing_mode, user=request.user,
            )
        except CalendarError as e:
            return Response({'error': e.message}, status=status.HTTP_400_BAD_REQUEST)
        new_schedule = result['new_schedule']
        moved = result['bookings_moved']
        cancelled = result['bookings_cancelled']
        refunded = result['bookings_refunded']

        return Response({
            'status': 'success',
            'old_schedule': RecurringScheduleReadSerializer(schedule).data,
            'new_schedule': RecurringScheduleReadSerializer(new_schedule).data if new_schedule else None,
            'bookings_moved': moved,
            'bookings_cancelled': cancelled,
            'bookings_refunded': refunded,
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def move_session(self, request, pk=None):
        """Mueve UNA sola fecha de la clase a otra hora/sala, sin tocar la
        recurrencia ("el martes 14 pasa a las 18:00, el resto de martes igual").

        POST /v1/recurrences/{id}/move_session/
        body: {"date": "2026-10-14", "new_start_time": "18:00",
               "new_end_time": "19:00" (opcional: por defecto misma duración),
               "new_room": 2 (opcional)}

        Hace tres cosas de forma atómica: cierra el hueco original de ese día
        (blackout), crea una sesión puntual con la clase a la hora nueva, y
        TRASLADA a los ya reservados avisándoles por email + push.
        """
        schedule = self.get_object()

        try:
            the_date = datetime.strptime(str(request.data.get('date')), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({'error': 'date requerida (YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)
        if the_date < timezone.now().astimezone(MADRID_TZ).date():
            return Response({'error': 'La fecha ya pasó.'}, status=status.HTTP_400_BAD_REQUEST)
        if schedule.is_recurrent and the_date.weekday() != schedule.weekday:
            return Response(
                {'error': f'Esa clase no ocurre ese día (es un día {the_date.weekday()}, '
                          f'la clase es del día {schedule.weekday}).'},
                status=status.HTTP_400_BAD_REQUEST)

        try:
            new_start = datetime.strptime(str(request.data.get('new_start_time'))[:5], '%H:%M').time()
        except (ValueError, TypeError):
            return Response({'error': 'new_start_time requerida (HH:MM).'}, status=status.HTTP_400_BAD_REQUEST)

        if request.data.get('new_end_time'):
            try:
                new_end = datetime.strptime(str(request.data['new_end_time'])[:5], '%H:%M').time()
            except (ValueError, TypeError):
                return Response({'error': 'new_end_time inválida (HH:MM).'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Misma duración que la clase original
            dur = (datetime.combine(the_date, schedule.end_time)
                   - datetime.combine(the_date, schedule.start_time))
            new_end = (datetime.combine(the_date, new_start) + dur).time()

        from api.utils.reschedule import move_bookings_to
        with transaction.atomic():
            # 1. Sesión puntual a la hora nueva (solo ese día)
            one_off = RecurringSchedule(
                class_type_id=schedule.class_type_id,
                room_id=request.data.get('new_room') or schedule.room_id,
                weekday=None,
                is_recurrent=False,
                start_time=new_start,
                end_time=new_end,
                capacity_min=schedule.capacity_min,
                capacity_max=schedule.capacity_max,
                price_credits_override=schedule.price_credits_override,
                price_eur_override=schedule.price_eur_override,
                override_instructor_id=schedule.override_instructor_id,
                is_active=True,
                start_date=the_date,
                end_date=the_date,
            )
            one_off._skip_broadcast = True  # es un traslado, no una clase nueva
            one_off.save()

            # 2. Cerrar el hueco original de ESE día (el resto de semanas sigue igual)
            blackout = ScheduleBlackout.objects.create(
                schedule=schedule,
                start_datetime=datetime.combine(the_date, schedule.start_time).replace(tzinfo=MADRID_TZ),
                end_datetime=datetime.combine(the_date, schedule.end_time).replace(tzinfo=MADRID_TZ),
                kind='closed',
                reason=f'Sesión movida a las {new_start:%H:%M}',
                created_by=request.user,
            )

        # 3. Trasladar a los ya reservados de ese día (notifica push + email)
        moved = move_bookings_to(schedule, one_off, new_start, new_end,
                                 from_date=the_date, only_date=the_date)

        logger.info(
            "schedule.move_session schedule_id=%s date=%s new_time=%s one_off=%s "
            "blackout=%s moved=%s admin_id=%s",
            schedule.id, the_date, new_start, one_off.id, blackout.id, moved, request.user.id,
        )
        return Response({
            'status': 'success',
            'message': f'{schedule.class_type.title} del {the_date} movida a las {new_start:%H:%M}. '
                       f'{moved} reserva(s) trasladadas y avisadas.',
            'new_session_id': one_off.id,
            'blackout_id': blackout.id,
            'bookings_moved': moved,
        })

class ClassOccurrenceViewSet(SoftDeleteModelViewSet):
    queryset = ClassOccurrence.objects.select_related(
        "class_type__instructor", "class_type__category", "room", "schedule", "override_instructor"
    )
    filterset_fields = ["class_type", "room", "status", "start_datetime"]
    ordering_fields = ["start_datetime"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return ClassOccurrenceReadSerializer
        return ClassOccurrenceWriteSerializer

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        occ: ClassOccurrence = self.get_object()
        occ.confirm_if_ready()
        return Response({"status": occ.status})

    @action(detail=True, methods=["post"])
    def cancel_if_not_enough(self, request, pk=None):
        hours = int(request.data.get("deadline_hours", 3))
        occ: ClassOccurrence = self.get_object()
        occ.cancel_if_not_enough(deadline_hours=hours)
        return Response({"status": occ.status})




class EventViewSet(SoftDeleteModelViewSet):
    queryset = Event.objects.select_related(
        "category", "class_type__instructor", "class_type__category", "room", "override_instructor"
    )
    filterset_fields = ["category", "class_type", "room", "status", "start_datetime"]
    ordering_fields = ["start_datetime"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return EventReadSerializer
        return EventWriteSerializer

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        ev: Event = self.get_object()
        ev.confirm_if_ready()
        return Response({"status": ev.status})

    @action(detail=True, methods=["post"])
    def cancel_if_not_enough(self, request, pk=None):
        hours = int(request.data.get("deadline_hours", 3))
        ev: Event = self.get_object()
        ev.cancel_if_not_enough(deadline_hours=hours)
        return Response({"status": ev.status})


class PaymentViewSet(SoftDeleteModelViewSet):
    queryset = Payment.objects.select_related("user__role", "guest")
    pagination_class = StandardPagination
    serializer_class = PaymentSerializer
    filterset_fields = {
        "status": ["exact"], "method": ["exact"], "currency": ["exact"], "user": ["exact"], "guest": ["exact"],
        "created_at": ["gte", "lte", "date"],
    }
    ordering_fields = ["created_at", "amount_eur"]
    search_fields = ["user__first_name", "user__last_name", "stripe_payment_intent_id", "stripe_charge_id", "user__email", "guest__email", "guest__name", "id", "amount_eur"]
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        # Antes el detalle era AllowAny: /v1/payments/<id>/ exponía los datos de
        # la clienta a cualquiera. Solo lo usa el CRM.
        permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]


class CreditWalletViewSet(SoftDeleteModelViewSet):
    queryset = CreditWallet.objects.select_related("user")
    serializer_class = CreditWalletSerializer
    filterset_fields = ["user"]

    def get_permissions(self):
        # Ver un monedero: la propia clienta o el estudio (antes era público:
        # bastaba ir probando ids). El resto de acciones, solo el estudio.
        if self.action == 'retrieve':
            return [permissions.IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action == 'retrieve' and not user.is_staff:
            return qs.filter(user=user)
        return qs


class CreditLedgerEntryViewSet(SoftDeleteModelViewSet):
    queryset = CreditLedgerEntry.objects.select_related("wallet")
    serializer_class = CreditLedgerEntrySerializer
    filterset_fields = ["wallet", "kind"]
    ordering_fields = ["created_at"]

    def create(self, request, *args, **kwargs):
        """Permite pasar `user` en lugar de `wallet`: si el usuario todavía no
        tiene monedero (usuarios recién creados), se crea al vuelo. Antes esto
        fallaba y el panel no podía añadir créditos a usuarios nuevos."""
        data = request.data.copy()
        if not data.get('wallet') and data.get('user'):
            try:
                target = User.objects.get(id=data['user'])
            except (User.DoesNotExist, ValueError, TypeError):
                return Response({'error': 'Usuario no encontrado.'}, status=status.HTTP_400_BAD_REQUEST)
            wallet, _ = CreditWallet.objects.get_or_create(user=target)
            data['wallet'] = wallet.id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save()
        logger.info(
            "credits.adjusted wallet_id=%s kind=%s amount=%s admin_id=%s",
            entry.wallet_id, entry.kind, entry.amount, request.user.id,
        )
        return Response(self.get_serializer(entry).data, status=status.HTTP_201_CREATED)

    def get_permissions(self):
        if self.action == 'retrieve':
            return [permissions.IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action == 'retrieve' and not user.is_staff:
            return qs.filter(wallet__user=user)
        return qs


class PlanViewSet(SoftDeleteModelViewSet):
    queryset = Plan.objects.all()
    serializer_class = PlanSerializer
    filterset_fields = ["type", "is_active"]
    search_fields = ["name", "slug"]
    ordering_fields = ["created_at", "price_eur"]
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve' or self.action == 'list':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]


class SubscriptionViewSet(SoftDeleteModelViewSet):
    queryset = Subscription.objects.select_related("user", "plan")
    serializer_class = SubscriptionSerializer
    filterset_fields = ["user", "plan", "status"]

    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action in ('retrieve', 'list', 'cancel', 'reactivate'):
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [IsAdminUser]

        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            return qs.filter(user=user)
        return qs

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """
        Marca la suscripción para cancelarse al final del período actual.
        Solo el propietario puede cancelar su propia suscripción.
        """
        from api.utils.payments import payments_disabled_response, stripe_client
        subscription = self.get_object()
        # En la cuenta de Stripe de la suscripción ('' = la de las claves)
        client = stripe_client(account=subscription.stripe_account or '')
        if client is None:
            return payments_disabled_response()

        if subscription.user != request.user:
            return Response(
                {'error': 'No tienes permiso para cancelar esta suscripción.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if subscription.status != 'active':
            return Response(
                {'error': 'Solo se puede cancelar una suscripción activa.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if subscription.cancel_at_period_end:
            return Response(
                {'error': 'La suscripción ya está programada para cancelarse.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Actualizar en Stripe (si existe stripe_subscription_id)
        if subscription.stripe_subscription_id:
            try:
                client.v1.subscriptions.update(
                    subscription.stripe_subscription_id,
                    params={'cancel_at_period_end': True},
                )
            except stripe.StripeError as e:
                return Response(
                    {'error': f'Error de Stripe: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        subscription.cancel_at_period_end = True
        subscription.save(update_fields=['cancel_at_period_end', 'updated_at'])

        return Response({
            'status': 'scheduled_cancellation',
            'message': 'La suscripción se cancelará al final del período actual.',
            'current_period_end': subscription.current_period_end,
        })

    @action(detail=True, methods=['post'], url_path='reactivate')
    def reactivate(self, request, pk=None):
        """
        Reactiva una suscripción que estaba programada para cancelarse.
        """
        from api.utils.payments import payments_disabled_response, stripe_client
        subscription = self.get_object()
        # En la cuenta de Stripe de la suscripción ('' = la de las claves)
        client = stripe_client(account=subscription.stripe_account or '')
        if client is None:
            return payments_disabled_response()

        if subscription.user != request.user:
            return Response(
                {'error': 'No tienes permiso para reactivar esta suscripción.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not subscription.cancel_at_period_end:
            return Response(
                {'error': 'La suscripción no está programada para cancelarse.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if subscription.stripe_subscription_id:
            try:
                client.v1.subscriptions.update(
                    subscription.stripe_subscription_id,
                    params={'cancel_at_period_end': False},
                )
            except stripe.StripeError as e:
                return Response(
                    {'error': f'Error de Stripe: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        subscription.cancel_at_period_end = False
        subscription.save(update_fields=['cancel_at_period_end', 'updated_at'])

        return Response({
            'status': 'reactivated',
            'message': 'La suscripción ha sido reactivada.',
        })


class CouponViewSet(SoftDeleteModelViewSet):
    queryset = Coupon.objects.all()
    lookup_field = 'code'
    serializer_class = CouponSerializer
    filterset_fields = ["discount_type", "is_active", "applicable_category", "applicable_class_type", "applicable_plan", "applicable_event"]
    search_fields = ["code"]
    
    def get_permissions(self):
        """
        Instancia y devuelve la lista de permisos que esta vista requiere.
        """
        if self.action == 'retrieve':
            # GET /cupones/{id}/ (Método retrieve)
            permission_classes = [AllowAny]
        else:
            # Todos los demás métodos (list, create, update, destroy, etc.)
            permission_classes = [IsAdminUser]
        
        return [permission() for permission in permission_classes]



class CouponRedemptionViewSet(SoftDeleteModelViewSet):
    # Antes todo era público (listar/crear/borrar canjes). Ahora solo
    # administración, salvo check-usage (lo usa el checkout de invitadas).
    permission_classes = [IsAdminUser]

    def get_permissions(self):
        if self.action == 'check_usage':
            return [AllowAny()]
        return super().get_permissions()
    
    # Optimizamos la consulta trayendo las relaciones necesarias
    queryset = CouponRedemption.objects.select_related("coupon", "user", "guest", "payment")
    serializer_class = CouponRedemptionSerializer
    filterset_fields = ["coupon", "user", "guest"]

    @action(detail=False, methods=['get'], url_path='check-usage')
    def check_usage(self, request):
        if not request.user.is_authenticated:
            check_throttles(request, scoped('public_form'))
        email = request.query_params.get('email')
        coupon_id = request.query_params.get('coupon_id')
        
        # Empezamos con el queryset base
        queryset = self.get_queryset()

        # 1. Filtro por Cupón (si se envía)
        if coupon_id:
            queryset = queryset.filter(coupon_id=coupon_id)

        # 2. Filtro por Usuario/Email
        if request.user.is_authenticated:
            # CASO A: Usuario Logueado -> Filtramos por su ID directo
            queryset = queryset.filter(user=request.user)
        else:
            # CASO B: Invitado -> Validamos email obligatorio
            if not email:
                return Response(
                    {'error': 'Para usuarios no autenticados, se requiere el parámetro "email".'}, 
                    status=400
                )
            # Buscamos coincidencias en User o Guest
            queryset = queryset.filter(
                Q(user__email__iexact=email) | Q(guest__email__iexact=email)
            )

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
class ContactUserViewSet(SoftDeleteModelViewSet):
    # El formulario de contacto es público para ENVIAR; leer/borrar los
    # mensajes (datos personales) es solo para administración.
    permission_classes = [IsAdminUser]
    queryset = ContactUser.objects.all()
    serializer_class = ContactUserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        # Formulario público: límite por IP para que nadie llene la bandeja
        if not (request.user and request.user.is_staff):
            check_throttles(request, scoped('public_form'))
        return super().create(request, *args, **kwargs)


class BookingViewSet(SoftDeleteModelViewSet):
    permission_classes = [AllowAny]
    pagination_class = StandardPagination
    queryset = Booking.objects.select_related(
        "event", "user__role", "guest", "payment",
        "occurrence__class_type",
        "occurrence__room",
        "occurrence__class_type__instructor",
        "occurrence__override_instructor"
    )
    filterset_fields = { 'status': ['exact'],'user': ['exact'],'guest': ['exact'],'event': ['exact'],'start_datetime': ['gte', 'lte', 'gt', 'lt', 'exact', 'date']}
    search_fields = ["user__email", "user__first_name", "user__last_name", "user__phone",
                     "guest__email", "guest__name", "guest__phone",
                     "occurrence__class_type__title", "occurrence__room__name", "status"]
    ordering_fields = ["created_at", "start_datetime"]
    

    serializer_class = BookingReadSerializer

    def get_permissions(self):
        # Antes TODO era público: cualquiera sin sesión podía listar las
        # 2.600 reservas con nombre/email/teléfono, y crear/editar/borrar.
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminUser()]
        return super().get_permissions()  # acciones con permisos propios (cancel, cancel_session…)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.action in ('list', 'retrieve', 'cancel') and not (user.is_staff or user.is_superuser):
            return qs.filter(user=user)  # cada clienta solo ve SUS reservas
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return BookingWriteSerializer
        if self.action == 'list':
            return BookingListSerializer
        
        return super().get_serializer_class()

    @action(
        detail=True, 
        methods=['post'], 
        permission_classes=[IsAuthenticated] # 1. Solo usuarios logueados
    )
    def cancel(self, request, pk=None):
        """
        Cancela una reserva y reembolsa los créditos correspondientes
        al wallet del usuario.
        Los guests no pueden cancelar.
        """
        booking = self.get_object()

        # 1. Verificación de permisos:
        # Esta línea asegura que solo el dueño de la reserva puede cancelarla.
        # Si la reserva es de un guest (booking.user es None),
        # la condición (None != request.user) será Verdadera, y se denegará.
        if booking.user != request.user and not request.user.is_staff:
            return Response(
                {"error": "No tienes permiso para cancelar esta reserva."}, 
                status=status.HTTP_403_FORBIDDEN
            )

        # 2. Verificación de estado: Solo se puede cancelar si está "reservada" o "pendiente"
        if booking.status not in ["reserved"]:
            return Response(
                {"error": f"Esta reserva no se puede cancelar (estado actual: {booking.status})."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Plazo: la clienta puede cancelar hasta N horas antes (settings.
        # BOOKING_CANCEL_MIN_HOURS). El estudio (CRM) puede cancelar siempre.
        if not request.user.is_staff:
            min_hours = settings.BOOKING_CANCEL_MIN_HOURS
            if booking.start_datetime - timezone.now() < timedelta(hours=min_hours):
                return Response(
                    {
                        "error": (
                            f"Solo se puede cancelar hasta {min_hours} horas antes de la clase. "
                            "Si no puedes venir, escríbenos por WhatsApp."
                        ),
                        "code": "cancel_window_closed",
                        "min_hours": min_hours,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # 3. Calcular créditos a reembolsar
        # En este punto, sabemos que booking.user existe (no es un guest).
        credits_to_refund = None
        
        if booking.occurrence:
            schedule = booking.occurrence # RecurringSchedule
            
            credits_to_refund = (
                schedule.price_credits_override 
                if schedule.price_credits_override is not None 
                else schedule.class_type.default_price_credits
            )
            
        elif booking.event:
            # Eventos sueltos: como una clase, se devuelve su precio en créditos
            credits_to_refund = booking.event.price_credits

        # 4. Ejecutar la cancelación y reembolso en una transacción atómica
        try:
            with transaction.atomic():
                # Re-verificar el estado CON LOCK: dos cancelaciones concurrentes
                # pasarían ambas el check de arriba y duplicarían el reembolso.
                booking = Booking.objects.select_for_update().get(pk=booking.pk)
                if booking.status not in ["reserved"]:
                    return Response(
                        {"error": f"Esta reserva no se puede cancelar (estado actual: {booking.status})."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Las reservas asignadas sin coste (p. ej. por un admin) no gastaron
                # créditos, así que no deben reembolsarse.
                if booking.metadata and booking.metadata.get('no_charge'):
                    credits_to_refund = None

                # 4a. Cambiar estado de la reserva
                booking.status = "canceled"
                booking.save(update_fields=['status', 'updated_at'])

                response_message = "Reserva cancelada."

                # 4b. Reembolsar créditos si la clase tenía un coste (las invitadas
                # pagaron con tarjeta: se les devuelve en Stripe tras la transacción)
                if credits_to_refund and credits_to_refund > 0 and booking.user_id:
                    try:
                        # Sabemos que el wallet existe porque booking.user existe
                        wallet = booking.user.wallet 
                    except CreditWallet.DoesNotExist:
                        raise Exception(f"Wallet no encontrada para el usuario {booking.user.id}.")

                    CreditLedgerEntry.objects.create(
                        wallet=wallet,
                        kind="refund",
                        amount=credits_to_refund,
                        reference=f"refund_booking_{booking.id}",
                        metadata={
                            "booking_id": booking.id, 
                            "reason": "User cancellation"
                        }
                    )
                    response_message = f"Reserva cancelada. {credits_to_refund} créditos reembolsados."
                
                else:
                    response_message = "Reserva cancelada (la clase no tenía coste en créditos)."

            logger.info(
                "booking.canceled booking_id=%s user_id=%s refund_credits=%s",
                booking.id, request.user.id, credits_to_refund or 0,
            )

            person = booking.user or booking.guest
            if booking.guest_id:
                from api.utils.guest_refund import refund_guest_booking_stripe
                if refund_guest_booking_stripe(booking, reason='admin_cancellation'):
                    response_message = "Reserva cancelada. Se le devuelve el pago a su tarjeta."
            # Si la cancela el estudio (no ella misma), se le avisa siempre
            if person and booking.user_id != request.user.id:
                title = (booking.occurrence.class_type.title if booking.occurrence
                         else (booking.event.title if booking.event else "Clase"))
                try:
                    notify_cancellation_email(person, title, booking.start_datetime)
                except Exception:
                    logger.warning("booking.cancel.email_failed booking_id=%s", booking.id, exc_info=True)
                if getattr(person, 'phone', None):
                    try:
                        send_whatsapp_cancellation(person, title, booking.start_datetime)
                    except Exception:
                        logger.warning("booking.cancel.whatsapp_failed booking_id=%s", booking.id, exc_info=True)
                if booking.user_id:
                    from api.utils.push import send_cancellation_push
                    send_cancellation_push(booking.user, title, booking.start_datetime)

            # 5. Devolver respuesta exitosa
            serializer = self.get_serializer(booking) # Devolvemos la reserva actualizada
            return Response({
                "message": response_message,
                "booking": serializer.data
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": f"Error crítico al procesar la cancelación: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    
    @action(
        detail=False, 
        methods=['post'], 
        permission_classes=[IsAdminUser] 
    )
    def cancel_session(self, request):
        """
        Cancela todas las reservas de una sesión específica.
        """
        occurrence_id = request.data.get('occurrence_id')
        start_datetime = request.data.get('start_datetime')
        
        # Validación básica
        if not occurrence_id or not start_datetime:
            return Response(
                {"error": "Se requiere occurrence_id y start_datetime"}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        bookings_to_cancel = Booking.objects.filter(
            occurrence_id=occurrence_id,
            start_datetime=start_datetime, 
            status='reserved'
        ).select_related('user', 'user__wallet', 'occurrence', 'occurrence__class_type')

        if not bookings_to_cancel.exists():
            return Response(
                {"message": "No se encontraron reservas activas para esta fecha y hora."}, 
                status=status.HTTP_200_OK
            )
        
        cancelled_count = 0
        refunded_count = 0

        # Usamos una lista para guardar los datos necesarios para notificar DESPUÉS de procesar
        notifications_queue = []
        guest_refund_queue = []

        try:
            with transaction.atomic():
                for booking in bookings_to_cancel:
                    # 1. Calcular Créditos a devolver
                    credits_to_refund = 0
                    if booking.occurrence:
                        schedule = booking.occurrence
                        credits_to_refund = (
                            schedule.price_credits_override 
                            if schedule.price_credits_override is not None 
                            else schedule.class_type.default_price_credits
                        )

                    # 2. Reembolsar (las asignadas sin coste no gastaron créditos)
                    if booking.metadata and booking.metadata.get('no_charge'):
                        credits_to_refund = 0
                    if booking.user and credits_to_refund > 0:
                        try:
                            # Verificamos que el usuario tenga wallet
                            if hasattr(booking.user, 'wallet'):
                                CreditLedgerEntry.objects.create(
                                    wallet=booking.user.wallet,
                                    kind="refund",
                                    amount=credits_to_refund,
                                    reference=f"session_cancel_{occurrence_id}_{booking.id}",
                                    metadata={
                                        "booking_id": booking.id, 
                                        "reason": "Session cancellation by admin",
                                        "session_date": start_datetime
                                    }
                                )
                                refunded_count += 1
                        except Exception as e:
                            logger.error(f"Error refunding user {booking.user.id}: {e}")
                    # 2b. Invitada: pagó con tarjeta → reembolso Stripe tras cancelar
                    if booking.guest_id:
                        guest_refund_queue.append(booking)

                    # 3. Cancelar reserva
                    booking.status = "canceled"
                    booking.save(update_fields=['status', 'updated_at'])
                    cancelled_count += 1

                    # 4. Preparar notificación (usuaria o invitada)
                    person = booking.user or booking.guest
                    if person:
                        notifications_queue.append({
                            'user': person,
                            'date': booking.start_datetime,
                            'title': booking.occurrence.class_type.title if booking.occurrence else "Clase"
                        })
            
            # --- REEMBOLSO STRIPE A INVITADAS (fuera de la transacción) ---
            from api.utils.guest_refund import refund_guest_booking_stripe
            for gbooking in guest_refund_queue:
                if refund_guest_booking_stripe(gbooking, reason='session_cancellation'):
                    refunded_count += 1

            # --- NOTIFICACIONES (Fuera del bucle de bookings para claridad) ---
            # Procesamos la cola de notificaciones
            from api.utils.push import send_cancellation_push
            for item in notifications_queue:
                user_obj = item['user']
                session_date = item['date']
                class_title = item['title']

                if user_obj.phone:
                    try:
                        send_whatsapp_cancellation(user_obj, class_title, session_date)
                    except Exception as e:
                        logger.error(f"Error enviando WhatsApp a {user_obj.email}: {e}")
                # 2. Enviar Email
                try:
                    notify_cancellation_email(user_obj, class_title, session_date)
                except Exception as e:
                    logger.error(f"Error enviando Email a {user_obj.email}: {e}")
                # 3. Push (faltaba: este flujo avisaba solo por email/WhatsApp; invitadas sin push)
                if hasattr(user_obj, 'push_subscriptions'):
                    send_cancellation_push(user_obj, class_title, session_date)
            return Response({
                "message": "Clase cancelada exitosamente.",
                "details": {
                    "cancelled_bookings": cancelled_count,
                    "refunded_users": refunded_count,
                    "target_time": start_datetime
                }
            }, status=status.HTTP_200_OK)

        except Exception as e:
            # Imprimir el error completo en la consola para depuración
            import traceback
            traceback.print_exc()
            return Response(
                {"error": f"Error crítico: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[IsAdminUser],
        url_path='cancel-schedule',
    )
    def cancel_schedule(self, request):
        schedule_id = request.data.get('schedule_id')
        if not schedule_id:
            return Response(
                {"error": "Se requiere schedule_id"},
                status=status.HTTP_400_BAD_REQUEST
            )

        from api.utils.cancel_bookings import cancel_all_schedule_bookings
        result = cancel_all_schedule_bookings(schedule_id)

        if 'error' in result:
            return Response(result, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "message": "Schedule y todas sus reservas futuras canceladas exitosamente.",
            "details": result,
        }, status=status.HTTP_200_OK)

class LeadViewSet(SoftDeleteModelViewSet):
    permission_classes=[IsAdminUser]
    queryset = Lead.objects.all()   
    serializer_class = LeadSerializer
    filterset_fields = ["email", "city", "experience_level"]
    search_fields = ["email", "name"]
    
    

class CheckLeadEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [scoped('public_form')]
    """
    Checks if a Lead with the given email exists.
    Expects GET request with 'email' query parameter.
    """
    def get(self, request, *args, **kwargs):
        email = request.query_params.get('email', None)
        if not email:
            return Response({"error": "Email parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            Lead.objects.get(email__iexact=email) # Case-insensitive check
            # Email exists, return success (no data needed)
            return Response(status=status.HTTP_200_OK)
        except Lead.DoesNotExist:
            # Email not found
            return Response({"error": "Email not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            # General server error
            logger.error(f"Error checking email: {e}")
            return Response({"error": "An internal server error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- NEW: View to update a Lead by email ---
class UpdateLeadByEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [scoped('public_form')]
    PREFERENCE_FIELDS = ('whatThinkFeel', 'experience_level', 'birth_date', 'desires',
                         'goal_primary', 'whatSee', 'whatListen', 'whatsay', 'frustated')
    """
    Updates Lead preferences based on the provided email.
    Expects PUT or PATCH request with 'email' and preference fields in the body.
    """
    def patch(self, request, *args, **kwargs): # Using PATCH for partial updates
        email = request.data.get('email', None)
        if not email:
            return Response({"error": "Email is required in the request body."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Find the lead by email (case-insensitive)
            lead_instance = Lead.objects.get(email__iexact=email)

            # Es público (formulario de preferencias de la web): solo se dejan
            # cambiar las PREFERENCIAS y no se devuelven los datos del lead.
            # Antes cualquiera que supiera un email podía cambiar el nombre o
            # el teléfono y leer la ficha completa.
            allowed = {k: request.data[k] for k in self.PREFERENCE_FIELDS if k in request.data}
            serializer = LeadSerializer(lead_instance, data=allowed, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response({"ok": True}, status=status.HTTP_200_OK)
            else:
                # Return validation errors from the serializer
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Lead.DoesNotExist:
            return Response({"error": "Email not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error updating lead by email: {e}")
            return Response({"error": "An internal server error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Optional: Implement PUT if you want to require all fields for update
    # def put(self, request, *args, **kwargs):
    #     # Similar logic but without partial=True
    #     pass


class GoogleLoginView(APIView):
    """POST /api/google-login/ {credential}

    «Iniciar sesión con Google» (Google Identity Services). La web obtiene de
    Google un ID token firmado y aquí se verifica contra el Client ID del
    estudio (Ajustes → Acceso con Google). Si la clienta no tenía cuenta, se
    crea; si ya la tenía con ese email, entra en la suya. Sin Firebase ni
    claves secretas: el Client ID es público.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [scoped('login')]

    def post(self, request, format=None):
        token = request.data.get('credential') or request.data.get('id_token')
        if not token:
            return Response({"detail": "Falta el token de Google."}, status=status.HTTP_400_BAD_REQUEST)

        from api.utils.site import get_site_config
        client_id = get_site_config().google_client_id
        if not client_id:
            return Response({"detail": "El acceso con Google no está activado en este estudio."},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
        try:
            info = google_id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
        except ValueError:
            logger.info("auth.google.invalid_token")
            return Response({"detail": "No se ha podido comprobar tu cuenta de Google. Vuelve a intentarlo."},
                            status=status.HTTP_401_UNAUTHORIZED)

        email = (info.get('email') or '').strip().lower()
        if not email or not info.get('email_verified'):
            return Response({"detail": "Tu cuenta de Google no tiene un email verificado."},
                            status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        created = False
        if user is None:
            user = User.objects.create_user(
                email=email, password=None,
                first_name=(info.get('given_name') or '')[:150],
                last_name=(info.get('family_name') or '')[:150],
                is_verified=True,
            )
            user.set_unusable_password()
            user.save(update_fields=['password'])
            created = True
        elif user.is_staff:
            # El panel tiene su propio acceso: una cuenta de administración
            # no entra como clienta por la web. Así Google tampoco puede
            # saltarse la verificación en dos pasos del panel.
            return Response({"detail": "Esta cuenta es de administración: entra desde el panel."},
                            status=status.HTTP_403_FORBIDDEN)
        elif not user.is_verified:
            from api.utils.verification import mark_verified
            mark_verified(user)

        refresh = RefreshToken.for_user(user)
        access = CustomTokenObtainPairSerializer.get_token(user).access_token
        logger.info("auth.google user_id=%s created=%s", user.id, created)
        return Response({
            "refresh": str(refresh),
            "access": str(access),
            "userid": user.id,
            "user_id": user.id,
            "username": user.first_name,
            "name": f"{user.first_name} {user.last_name}".strip(),
            "email": user.email,
            "is_verified": True,
            "created": created,
        }, status=status.HTTP_200_OK)


class ScheduleViewSet(viewsets.GenericViewSet):
    """
    ViewSet principal que construye el calendario final fusionando
    recurrencias, eventos y sesiones únicas.
    """
    queryset = RecurringSchedule.objects.none()
    permission_classes = [AllowAny]
    
    
    @action(detail=False, methods=['get'])
    def schedule(self, request):
        """
        Endpoint que devuelve todos los eventos y ocurrencias recurrentes en un rango de fechas,
        incluyendo el conteo de plazas ocupadas y libres.
        URL: /api/v1/schedule/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
        """
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        if not start_date_str or not end_date_str:
            return Response({"error": "start_date y end_date son obligatorios."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({"error": "Formato de fecha inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        # --- PASO 1: CREAR EL MAPA DE CONTEO DE BOOKINGS ---
        
        # Fijamos la zona horaria de la lógica de negocio (Madrid)
        local_tz = MADRID_TZ

        # 1. Convertir las fechas 'naive' del request a 'aware' en la zona local
        start_dt_local = datetime.combine(start_date, datetime.min.time(), tzinfo=local_tz)
        end_dt_local = datetime.combine(end_date, datetime.max.time(), tzinfo=local_tz)
        
        # 2. Convertir los rangos locales a UTC (como están tus bookings en la BBDD)
        start_dt_utc = start_dt_local.astimezone(dt_timezone.utc) 
        end_dt_utc = end_dt_local.astimezone(dt_timezone.utc)   

        # 3. Plazas ocupadas de cada sesión en DOS consultas para todo el rango
        #    (nada de una por sesión): reservas activas + plazas ofrecidas a la
        #    lista de espera y aún sin caducar (las guarda para esa persona,
        #    igual que api/utils/waitlist.py:seats_taken).
        #    Clave: ('S', regla, inicio UTC) para clases y ('E', evento, inicio UTC).
        booking_counts = defaultdict(int)
        for occ_id, ev_id, start in Booking.objects.filter(
            start_datetime__gte=start_dt_utc,
            start_datetime__lte=end_dt_utc,
            status__in=['reserved', 'attended'],
        ).values_list('occurrence_id', 'event_id', 'start_datetime'):
            key = ('S', occ_id) if occ_id else ('E', ev_id)
            booking_counts[(*key, start)] += 1
        for sid, start in WaitlistEntry.objects.filter(
            status='offered', offer_expires_at__gt=timezone.now(),
            start_datetime__gte=start_dt_utc, start_datetime__lte=end_dt_utc,
        ).values_list('schedule_id', 'start_datetime'):
            booking_counts[('S', sid, start)] += 1
        waitlist_on = WaitlistSettings.load().enabled


        # --- PASO 2: GENERAR LA LISTA 'final_schedule' (Tu lógica actual) ---
        
        # 2.1. Generar Ocurrencias Recurrentes (en memoria)
        # Llama a la función del utils.py
        recurring_schedule = generate_recurring_occurrences(start_date, end_date)
        
        # 2.2. Obtener Eventos Fijos y Sesiones Únicas (de la BBDD)
        
        # Eventos Fijos (modelo Event)
        # Solo los activos y no cancelados (antes salían también los desactivados)
        qs_events = Event.objects.filter(
            start_datetime__date__gte=start_date,
            start_datetime__date__lte=end_date,
            is_active=True,
        ).exclude(status='canceled').select_related('class_type','class_type__instructor' ,'room', 'override_instructor')
        
        # Sesiones Únicas (Reglas No Recurrentes)
        qs_single_sessions = RecurringSchedule.objects.filter(
            is_recurrent=False,
            is_active=True,
            start_date__gte=start_date,
            start_date__lte=end_date
        ).select_related('class_type','class_type__instructor' ,'room', 'override_instructor')

        # 2.3. Serializar y Fusionar (Tu lógica actual)
        
        final_schedule = []
        
        # Serializar Eventos Fijos
        for event in qs_events:
             final_schedule.append({
                'id': f'E_{event.id}',
                'type': 'EVENT',
                'title': event.title,
                'title_en': event.title_en or event.title,
                # Hora de pared del estudio y sin zona, como las clases: la web
                # (portada, horario) las lee igual (antes «…+00:00» daba fecha
                # inválida en «Próximas clases» y la hora en UTC)
                'start_datetime': to_madrid_wall(event.start_datetime).isoformat(timespec='seconds'),
                'end_datetime': to_madrid_wall(event.end_datetime).isoformat(timespec='seconds'),
                'room': event.room.name,
                'room_en': event.room.title_en or event.room.name,
                'instructor': event.instructor.name if event.instructor else None,
                'capacity_max': event.capacity_max,
                'capacity_min': event.capacity_min, # <--- AÑADIDO
                'is_recurrent': False,
                'source_id': event.id,
                'price_eur_overwrite': event.price_eur,
                'price_credit_overwrite': event.price_credits,
                'image': event.image, 
               
             })
             
        # Serializar Sesiones Únicas (Reglas No Recurrentes)
        for session in qs_single_sessions:
            start_dt = datetime.combine(session.start_date, session.start_time)
            end_dt = datetime.combine(session.start_date, session.end_time)
            
            
            if session.end_time <= session.start_time:
                 end_dt += timedelta(days=1)
                 
            final_schedule.append({
                'id': f'S_{session.id}',
                'type': 'SINGLE_SESSION',
                'title': session.class_type.title,
                'title_en': session.class_type.title_en or session.class_type.title,
                'start_datetime': start_dt.isoformat(), # String 'naive' local
                'end_datetime': end_dt.isoformat(),
                'room': session.room.name,
                'room_en': session.room.title_en or session.room.name,
                'instructor': (
                    session.override_instructor.name if session.override_instructor
                    else (session.class_type.instructor.name if session.class_type.instructor else None)
                ),
                'capacity_max': session.capacity_max,
                'capacity_min': session.capacity_min, # <--- AÑADIDO
                'is_recurrent': False,
                'source_id': session.id,
                'class_type_id': session.class_type.id,
                'class_type_slug': session.class_type.slug,
                'price_eur_overwrite': session.price_eur_override,
                'price_credit_overwrite': session.price_credits_override,
                'image': session.class_type.image,
                'price_eur': session.class_type.default_price_eur,
                'price_credit': session.class_type.default_price_credits, 
            })

        # 2.4. Fusionar con Ocurrencias Recurrentes
        final_schedule.extend(recurring_schedule)
        
        
        # --- PASO 3: ENRIQUECER 'final_schedule' CON EL CONTEO ---
        
        # Modificamos 'final_schedule' directamente para no perder ningún evento.
        
        for event in final_schedule:
            # Establecemos valores por defecto para CADA evento
            occupied_seats = 0
            capacity = event.get('capacity_max', 0) 

            try:
                # 1. Convertir el string ISO (naive, local) de vuelta a un datetime naive
                naive_dt = datetime.fromisoformat(event['start_datetime'])
                
                # 2. Localizarlo (decirle "esta hora es de 'Europe/Madrid'");
                #    los eventos ya vienen con zona
                local_dt = naive_dt.replace(tzinfo=local_tz) if naive_dt.tzinfo is None else naive_dt
                
                # 3. Convertirlo a UTC para usarlo como clave en nuestro mapa
                utc_dt = local_dt.astimezone(dt_timezone.utc)
                
                # 4. Buscar en el mapa de conteo (con 0 como valor por defecto)
                kind = 'E' if event.get('type') == 'EVENT' else 'S'
                occupied_seats = booking_counts.get((kind, event.get('source_id'), utc_dt), 0)
                
            except Exception as e:
                # Si algo falla (ej. un 'start_datetime' nulo o inválido),
                # lo registramos y dejamos 'occupied_seats' en 0.
                logger.error(f"Error calculando bookings para evento {event.get('id')}: {e}")
                pass 

            # 5. Añadir los nuevos campos al evento (esto ahora SIEMPRE se ejecuta)
            event['occupied_seats'] = occupied_seats
            event['available_seats'] = max(0, capacity - occupied_seats) # Evitar negativos
            # La web ofrece «Apuntarme a la lista de espera» si está llena
            # (solo clases del horario: los eventos no tienen lista)
            event['waitlist_enabled'] = bool(waitlist_on and event.get('type') != 'EVENT')
        
        
        # --- PASO 3.5: EXCLUIR SLOTS BLOQUEADOS (vacaciones/cierres/privadas) ---
        range_start_wall = datetime.combine(start_date, datetime.min.time())
        range_end_wall = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
        blks = blackouts_overlapping(range_start_wall, range_end_wall)
        if blks:
            def _is_blocked(entry):
                try:
                    wall = datetime.fromisoformat(entry['start_datetime'])
                    if wall.tzinfo is not None:
                        wall = wall.astimezone(local_tz).replace(tzinfo=None)
                except Exception:
                    return False
                # Los blackouts de una clase concreta solo afectan a sus slots;
                # los globales (schedule=None) afectan a todo, eventos incluidos.
                sid = entry.get('source_id') if entry.get('type') != 'EVENT' else None
                for b, b_start, b_end in blks:
                    if not (b_start <= wall < b_end):
                        continue
                    if b.schedule_id is None or (sid is not None and b.schedule_id == sid):
                        return True
                return False

            final_schedule = [e for e in final_schedule if not _is_blocked(e)]

        # --- PASO 4: ORDENAR Y RETORNAR LA RESPUESTA ENRIQUECIDA ---

        final_schedule.sort(key=lambda x: x['start_datetime'])

        return Response(final_schedule)


class MeView(APIView):
    """Perfil propio del usuario autenticado.

    Existe porque UserViewSet exige IsAdminUser para escribir: un cliente
    normal recibía 403 al intentar guardar su teléfono. Aquí solo puede
    tocar SUS datos y SOLO campos seguros (nunca is_staff, email, etc.).
    """
    permission_classes = [IsAuthenticated]

    ALLOWED_FIELDS = ('phone', 'first_name', 'last_name', 'birth_date', 'city')

    def _payload(self, user):
        return {
            'id': user.id,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'phone': user.phone,
            'birth_date': user.birth_date,
            'city': user.city,
            'is_verified': user.is_verified,
        }

    def get(self, request):
        return Response(self._payload(request.user))

    def patch(self, request):
        user = request.user
        updated = []
        for field in self.ALLOWED_FIELDS:
            if field in request.data:
                setattr(user, field, request.data[field])
                updated.append(field)
        if not updated:
            return Response(
                {'error': f'Nada que actualizar. Campos permitidos: {", ".join(self.ALLOWED_FIELDS)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user.full_clean(validate_unique=False)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        user.save(update_fields=updated)
        logger.info("user.profile_updated user_id=%s fields=%s", user.id, updated)
        return Response(self._payload(user))


class VapidPublicKeyView(APIView):
    """Clave pública VAPID que el navegador necesita para suscribirse a push."""
    permission_classes = [AllowAny]

    def get(self, request):
        from api.utils.site import ensure_vapid_keys
        return Response({'publicKey': ensure_vapid_keys()[0]})


class PushSubscribeView(APIView):
    """Alta/baja de la suscripción Web Push del navegador del usuario."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sub = request.data.get('subscription') or request.data
        endpoint = sub.get('endpoint')
        keys = sub.get('keys') or {}
        if not endpoint or not keys.get('p256dh') or not keys.get('auth'):
            return Response(
                {'error': 'Suscripción inválida: faltan endpoint o keys (p256dh/auth).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        subscription, created = PushSubscription.all_objects.update_or_create(
            endpoint=endpoint,
            defaults={
                'user': request.user,
                'p256dh': keys['p256dh'],
                'auth': keys['auth'],
                'user_agent': (request.META.get('HTTP_USER_AGENT') or '')[:300],
                'deleted_at': None,
            },
        )
        logger.info("push.subscribed user_id=%s sub_id=%s created=%s", request.user.id, subscription.id, created)
        return Response({'status': 'ok', 'created': created}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request):
        endpoint = (request.data or {}).get('endpoint')
        if not endpoint:
            return Response({'error': 'endpoint requerido'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = PushSubscription.all_objects.filter(endpoint=endpoint, user=request.user).delete()
        logger.info("push.unsubscribed user_id=%s deleted=%s", request.user.id, deleted)
        return Response({'status': 'ok', 'deleted': deleted})


class MyWalletBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        # Gracias a IsAuthenticated, 'request.user' es el usuario
        # que corresponde al JWT enviado.
        user = request.user

        # Usamos get_or_create para manejar de forma segura a usuarios
        # que quizás aún no tengan un monedero creado.
        try:
            wallet, created = CreditWallet.objects.get_or_create(user=user)
        except Exception as e:
            # Esto podría pasar si hay un error de base de datos
            return Response(
                {"error": f"Error al acceder al monedero: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        # Obtenemos el saldo usando la propiedad que arreglamos
        # (La propiedad .balance ya hace todo el cálculo de expiración)
        current_balance = wallet.balance
        
        return Response({"balance": current_balance})
        
class CreateCheckoutSessionView(APIView):
    """Pago como invitada (sin cuenta): crea su ficha y la sesión de Stripe.
    Límite por IP y captcha (si está configurado) para quien no ha entrado.

    Todo va en una transacción y las plazas se comprueban (con bloqueo) ANTES
    de crear nada: si una clase está llena, o Stripe falla, no quedan pagos ni
    reservas pendientes huérfanos. La validación del carrito y de la invitada
    es la misma que la de «pagar en el estudio» (api/utils/guest_checkout.py).

    Sirve para clases del horario y eventos sueltos (con su precio), y también
    para una clienta con cuenta (sesión iniciada): entonces el pago y las
    reservas van a su nombre y no hacen falta los datos de invitada."""
    permission_classes = [AllowAny]
    throttle_classes = [scoped('checkout')]

    def post(self, request, *args, **kwargs):
        from api.utils.guest_checkout import guest_details, guest_profile, validate_cart
        from api.utils.payment_options import option_error, payment_options
        from api.utils.payments import current_stripe_account, payments_disabled_response, stripe_client
        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        # «Formas de cobro» (Ajustes → Cobros): tarjeta en la web, clase suelta
        # online y reservar sin cuenta
        opts = payment_options(online_ready=True)
        if not opts['card']:
            return option_error('card_disabled')
        if not opts['drop_in_online']:
            return option_error('drop_in_not_online')
        if not request.user.is_authenticated and not opts['guest_booking']:
            return option_error('guest_booking_disabled')
        stripe_account = current_stripe_account() or ''
        if not request.user.is_authenticated:
            captcha = check_captcha(request)
            if captcha:
                return captcha

        registered = request.user if request.user.is_authenticated else None
        if registered is None:
            details, error = guest_details(request.data)
            if error:
                return error

        coupon_code = (request.data.get('couponCode') or '').strip()
        coupon_obj = None
        if coupon_code:
            try:
                coupon_obj = Coupon.objects.get(code=coupon_code)
            except Coupon.DoesNotExist:
                return Response({'error': 'El cupón no existe.'}, status=status.HTTP_404_NOT_FOUND)
            now = timezone.now()
            if not coupon_obj.is_active:
                return Response({'error': 'El cupón no está activo.'}, status=status.HTTP_400_BAD_REQUEST)
            if (coupon_obj.valid_from and now < coupon_obj.valid_from) or (coupon_obj.valid_to and now > coupon_obj.valid_to):
                return Response({'error': 'El cupón ha caducado o no es válido.'}, status=status.HTTP_400_BAD_REQUEST)
            if coupon_obj.usage_limit and coupon_obj.redemptions.count() >= coupon_obj.usage_limit:
                return Response({'error': 'Este cupón ha agotado sus usos.'}, status=status.HTTP_400_BAD_REQUEST)

        # Todo el dinero va en la moneda del estudio (Ajustes → Mi estudio)
        currency = stripe_currency()
        try:
            with transaction.atomic():
                if registered is not None:
                    owner, email = {'user': registered}, registered.email
                else:
                    guest, created = guest_profile(details['email'], details['name'], details['phone'])
                    logger.info("checkout.guest guest_id=%s created=%s", guest.public_id, created)
                    owner, email = {'guest': guest}, guest.email

                lines, error = validate_cart(request.data.get('cart_items'), lock=True, **owner)
                if error:
                    transaction.set_rollback(True)
                    return error

                line_items = []
                total = decimal.Decimal(0)
                for line in lines:
                    title = line.title
                    if line.price is None or line.price <= 0:
                        transaction.set_rollback(True)
                        return Response(
                            {'error': f'La clase "{title}" no tiene precio y no se puede comprar con tarjeta.',
                             'code': 'no_price'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    total += line.price
                    # Nombre en la pasarela con la fecha en la hora del estudio
                    when = to_madrid_wall(line.start)
                    line_items.append({
                        'price_data': {
                            'currency': currency,
                            'product_data': {'name': f"{title} ({when:%d-%m-%Y %H:%M})" if when else title},
                            # Unidad mínima de la moneda (céntimos; CLP tal cual)
                            'unit_amount': to_stripe_amount(line.price, currency),
                        },
                        'quantity': 1,
                    })

                stripe_discounts = []
                final_amount = total
                if coupon_obj:
                    params = {'duration': 'once', 'name': f"Cupón: {coupon_obj.code}"}
                    if coupon_obj.discount_type == 'percent':
                        params['percent_off'] = float(coupon_obj.value)
                        final_amount = total - total * (coupon_obj.value / 100)
                    elif coupon_obj.discount_type == 'amount':
                        params['amount_off'] = to_stripe_amount(coupon_obj.value, currency)
                        params['currency'] = currency
                        final_amount = total - coupon_obj.value
                    stripe_coupon = client.v1.coupons.create(params=params)
                    stripe_discounts.append({'coupon': stripe_coupon.id})
                final_amount = max(final_amount, decimal.Decimal(0))

                payment = Payment.objects.create(
                    **owner, amount_eur=final_amount, status='pending',
                    currency=currency.upper(), method='stripe', stripe_account=stripe_account,
                )
                if coupon_obj:
                    CouponRedemption.objects.create(
                        coupon=coupon_obj, **owner, payment=payment, times_used=1,
                        metadata={'original_price': str(total)},
                    )
                # Reservas PENDIENTES: el webhook las confirma al cobrar
                for line in lines:
                    Booking.objects.create(
                        **owner, payment=payment, **line.target(),
                        start_datetime=line.start, end_datetime=line.end, status='pending',
                    )

                session_params = {
                    'ui_mode': 'embedded_page',
                    'line_items': line_items,
                    'mode': 'payment',
                    'customer_email': email,
                    'tax_id_collection': {'enabled': False},
                    'invoice_creation': {'enabled': True},
                    'metadata': {'local_payment_id': payment.id},
                    'return_url': web_url('/checkout') + '/success?session_id={CHECKOUT_SESSION_ID}',
                }
                if stripe_discounts:
                    session_params['discounts'] = stripe_discounts
                # Reservas sin métodos de pago que tardan días (OXXO, Multibanco,
                # domiciliación…): dejarían la plaza retenida sin cobrar. Con la
                # configuración «Reservas» de la plataforma, esa; si no, se quitan
                # aquí (api/utils/payment_methods.py → booking_excluded_types).
                if stripe_account and settings.STRIPE_CONNECT_BOOKING_PMC:
                    session_params['payment_method_configuration'] = settings.STRIPE_CONNECT_BOOKING_PMC
                else:
                    from api.utils.payment_methods import booking_excluded_types
                    session_params['excluded_payment_method_types'] = booking_excluded_types()
                checkout_session = client.v1.checkout.sessions.create(
                    params=session_params,
                    options={'idempotency_key': f"checkout_{payment.id}_{uuid.uuid4().hex[:8]}"},
                )
                logger.info("checkout.guest.session payment_id=%s bookings=%s amount=%s %s",
                            payment.id, len(lines), final_amount, currency)

            return Response({'clientSecret': checkout_session.client_secret}, status=status.HTTP_201_CREATED)

        except stripe.StripeError as e:
            logger.error("checkout.guest.stripe_error %s", getattr(e, 'user_message', None) or str(e))
            return Response(
                {'error': 'Ocurrió un error al procesar el pago con Stripe.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception:
            logger.exception("checkout.guest.error")
            return Response(
                {'error': 'No se pudo crear la sesión de pago.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )



def _session_amount(session) -> dict:
    """Importe total y moneda de una sesión de Stripe Checkout (para la
    conversión de compra de la web). Vacío si Stripe no los trae."""
    try:
        total = session.get('amount_total') if hasattr(session, 'get') else getattr(session, 'amount_total', None)
        currency = session.get('currency') if hasattr(session, 'get') else getattr(session, 'currency', None)
        if total is None:
            return {}
        return {'amount_total': str(from_stripe_amount(total, currency)), 'currency': (currency or '').upper()}
    except Exception:
        return {}


class VerifyCheckoutSessionView(APIView):
    """
    Verifica el estado de un pago de checkout de Stripe.
    NO otorga créditos ni confirma reservas — eso lo hace el webhook.
    """
    permission_classes = [AllowAny] 

    def post(self, request, *args, **kwargs):
        from api.utils.payments import payments_disabled_response, stripe_client
        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({'error': 'No se proporcionó session_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = client.v1.checkout.sessions.retrieve(session_id)

            if session.payment_status == 'paid':
                return Response({
                    'status': 'success',
                    'message': 'Pago confirmado. Tu reserva será procesada en breve.',
                    'payment_status': session.payment_status,
                    # Importe y moneda para la conversión de compra (analítica, con consentimiento)
                    **_session_amount(session),
                }, status=status.HTTP_200_OK)

            return Response({
                'status': 'pending',
                'message': 'El pago aún no se ha completado.',
                'payment_status': session.payment_status,
            }, status=status.HTTP_200_OK)

        except stripe.StripeError as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        

class CreatePlanCheckoutSessionView(APIView):
    """
    Crea una sesión de checkout de Stripe para comprar un Plan (paquete de créditos).
    Requiere que el usuario esté autenticado.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        from api.utils.payments import current_stripe_account, payments_disabled_response, stripe_client
        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        stripe_account = current_stripe_account() or ''

        user = request.user
        plan_id = request.data.get('plan_id')

        if not plan_id:
            return Response({'error': 'Se requiere un "plan_id".'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # 3. Obtener el Plan
            plan = Plan.objects.get(id=plan_id, is_active=True)
        except (Plan.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'El plan no existe o no está activo.'}, status=status.HTTP_404_NOT_FOUND)

        # «Formas de cobro»: tarjeta en la web y qué se vende online
        from api.utils.payment_options import option_error, payment_options
        opts = payment_options(online_ready=True)
        if not opts['card']:
            return option_error('card_disabled')
        if plan.type == 'sub' and not opts['memberships_online']:
            return option_error('memberships_not_online')
        if plan.type != 'sub' and not opts['packs_online']:
            return option_error('packs_not_online')

        # 4. Validar precio base
        if plan.price_eur is None or plan.price_eur <= 0:
            return Response({'error': f'El plan "{plan.name}" no tiene precio válido.'}, status=status.HTTP_400_BAD_REQUEST)

        # Verificación suave: la membresía (cobro recurrente, avisos por email)
        # es lo único que exige tener el email confirmado.
        if plan.type == 'sub' and not user.is_verified:
            return Response({
                'error': 'Confirma tu email para activar la membresía. Te hemos enviado un código.',
                'code': 'email_not_verified',
            }, status=status.HTTP_403_FORBIDDEN)

        # --- NUEVO: VALIDACIÓN DEL CUPÓN ---
        coupon_code = request.data.get('couponCode')
        coupon_obj = None

        if coupon_code:
            try:
                coupon_obj = Coupon.objects.get(code=coupon_code)
                
                # Validaciones
                now = timezone.now()
                if not coupon_obj.is_active:
                    return Response({'error': 'El cupón no está activo.'}, status=status.HTTP_400_BAD_REQUEST)
                if now < coupon_obj.valid_from or now > coupon_obj.valid_to:
                    return Response({'error': 'El cupón ha caducado o no es válido.'}, status=status.HTTP_400_BAD_REQUEST)
                
                # Validar si aplica a este plan específico (Opcional, según tu lógica de negocio)
                # if coupon_obj.applicable_plan and coupon_obj.applicable_plan != plan:
                #     return Response({'error': 'Este cupón no es válido para este plan.'}, status=status.HTTP_400_BAD_REQUEST)
                
                # Validar límite de uso global
                if coupon_obj.usage_limit and coupon_obj.redemptions.count() >= coupon_obj.usage_limit:
                     return Response({'error': 'Este cupón ha agotado sus usos.'}, status=status.HTTP_400_BAD_REQUEST)

            except Coupon.DoesNotExist:
                return Response({'error': 'El cupón no existe.'}, status=status.HTTP_404_NOT_FOUND)


        try:
            currency = stripe_currency()
            price_in_cents = to_stripe_amount(plan.price_eur, currency)

            line_items = [{
                'price_data': {
                    'currency': currency,
                    'product_data': {
                        'name': plan.name,
                        'description': f"{plan.credits} créditos" + (f" (Caduca en {plan.credits_expire_days} días)" if plan.credits_expire_days else ""),
                    },
                    'unit_amount': price_in_cents,
                },
                'quantity': 1,
            }]
            
            # --- NUEVO: INTEGRACIÓN CON STRIPE Y CÁLCULO DE PRECIO FINAL ---
            stripe_discounts = []
            final_payment_amount = plan.price_eur # Precio base

            if coupon_obj:
                try:
                    # Crear cupón temporal en Stripe
                    stripe_coupon_params = {
                        'duration': 'once',
                        'name': f"Cupón: {coupon_obj.code}"
                    }

                    if coupon_obj.discount_type == 'percent':
                        stripe_coupon_params['percent_off'] = float(coupon_obj.value)
                        # Calcular descuento para BD
                        discount_amount = plan.price_eur * (coupon_obj.value / 100)
                        final_payment_amount = plan.price_eur - discount_amount

                    elif coupon_obj.discount_type == 'amount':
                        stripe_coupon_params['amount_off'] = to_stripe_amount(coupon_obj.value, currency)
                        stripe_coupon_params['currency'] = currency
                        final_payment_amount = plan.price_eur - coupon_obj.value

                    stripe_coupon = client.v1.coupons.create(params=stripe_coupon_params)
                    stripe_discounts.append({'coupon': stripe_coupon.id})

                except Exception as e:
                    logger.error(f"Error creando cupón Stripe: {e}")
                    return Response({'error': 'Error al procesar el descuento.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Evitar negativos
            if final_payment_amount < 0: final_payment_amount = 0


            # --- Crear Sesión Stripe ---
            if plan.type == 'sub':
                # Suscripción: el webhook crea el Payment vía get_or_create(stripe_checkout_session_id).
                # No creamos un Payment aquí para evitar registros pending huérfanos.
                # El precio guardado solo vale en la cuenta de Stripe donde se creó
                if plan.stripe_price_id and (plan.stripe_price_account or '') == stripe_account:
                    sub_line_items = [{'price': plan.stripe_price_id, 'quantity': 1}]
                else:
                    interval = getattr(plan, 'interval', None) or 'month'
                    interval_count = getattr(plan, 'interval_count', None) or 1
                    sub_line_items = [{
                        'price_data': {
                            'currency': currency,
                            'product_data': {
                                'name': plan.name,
                                'description': f"{plan.credits} créditos/{interval}",
                            },
                            'unit_amount': price_in_cents,
                            'recurring': {
                                'interval': interval,
                                'interval_count': interval_count,
                            },
                        },
                        'quantity': 1,
                    }]
                checkout_session_kwargs = {
                    'ui_mode': 'embedded_page',
                    'line_items': sub_line_items,
                    'mode': 'subscription',
                    'customer_email': user.email,
                    'metadata': {
                        'plan_id': plan.id,
                        'user_id': user.id,
                    },
                    'return_url': web_url('/checkout') + '?session_id={CHECKOUT_SESSION_ID}',
                }
                if stripe_discounts:
                    checkout_session_kwargs['discounts'] = stripe_discounts

                checkout_session = client.v1.checkout.sessions.create(
                    params=checkout_session_kwargs,
                    options={'idempotency_key': f"plan_{plan.id}_{user.id}_{uuid.uuid4().hex[:8]}"},
                )
                return Response({'clientSecret': checkout_session.client_secret}, status=status.HTTP_201_CREATED)

            else:
                # Pack (pago único): creamos el Payment antes para incluir su id en metadata.
                new_payment = Payment.objects.create(
                    user=user,
                    amount_eur=final_payment_amount,
                    status='pending',
                    currency=currency.upper(),
                    method='stripe',
                    stripe_account=stripe_account,
                )

                if coupon_obj:
                    CouponRedemption.objects.create(
                        coupon=coupon_obj,
                        user=user,
                        guest=None,
                        payment=new_payment,
                        times_used=1,
                        metadata={'original_price': str(plan.price_eur)}
                    )

                checkout_session_kwargs = {
                    'ui_mode': 'embedded_page',
                    'line_items': line_items,
                    'mode': 'payment',
                    'customer_email': user.email,
                    'tax_id_collection': {'enabled': False},
                    'invoice_creation': {'enabled': True},
                    'metadata': {
                        'plan_id': plan.id,
                        'user_id': user.id,
                        'local_payment_id': new_payment.id,
                    },
                    'return_url': web_url('/checkout') + '?session_id={CHECKOUT_SESSION_ID}',
                }
                if stripe_discounts:
                    checkout_session_kwargs['discounts'] = stripe_discounts

                checkout_session = client.v1.checkout.sessions.create(
                    params=checkout_session_kwargs,
                    options={'idempotency_key': f"plan_{plan.id}_{user.id}_{uuid.uuid4().hex[:8]}"},
                )
                return Response({'clientSecret': checkout_session.client_secret}, status=status.HTTP_201_CREATED)

        except stripe.StripeError as e:
            return Response(
                {'error': f"Error de Stripe: {e.user_message if hasattr(e, 'user_message') else str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            logger.error(f"Error creando checkout session: {e}")
            return Response(
                {'error': 'No se pudo crear la sesión de pago.'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )



# ─── Lectura de objetos de Stripe según la versión de la API ─────────────────
# El SDK fija su versión de la API en cada llamada, pero los webhooks llegan con
# la versión del endpoint (puede ser anterior). Se leen los dos formatos.

def _stripe_field(obj, key):
    """Campo de un objeto de Stripe (StripeObject es un dict) o de un dict."""
    if obj is None or isinstance(obj, str):
        return None
    try:
        return obj.get(key)
    except AttributeError:
        return getattr(obj, key, None)


def _stripe_id(value):
    """Id de un campo expandible: venga como texto o expandido."""
    return value if isinstance(value, str) else (_stripe_field(value, 'id') or None)


def _invoice_subscription_id(invoice):
    """Suscripción de una factura: invoice.parent.subscription_details.subscription
    (API 2025-03-31.basil en adelante) o invoice.subscription (API anterior)."""
    details = _stripe_field(_stripe_field(invoice, 'parent'), 'subscription_details')
    return _stripe_id(_stripe_field(details, 'subscription')) or _stripe_id(_stripe_field(invoice, 'subscription'))


def _subscription_period(subscription):
    """(inicio, fin) del período actual en timestamps: arriba en la suscripción
    (API anterior) o en items.data[0] (API 2025-03-31.basil en adelante)."""
    start = _stripe_field(subscription, 'current_period_start')
    end = _stripe_field(subscription, 'current_period_end')
    if not start or not end:
        items = _stripe_field(_stripe_field(subscription, 'items'), 'data') or []
        first = items[0] if items else None
        start = start or _stripe_field(first, 'current_period_start')
        end = end or _stripe_field(first, 'current_period_end')
    return start, end


def _subscription_client_secret(subscription):
    """client_secret para confirmar el primer pago: latest_invoice.confirmation_secret
    (API 2025-03-31.basil en adelante) o latest_invoice.payment_intent (API anterior)."""
    invoice = _stripe_field(subscription, 'latest_invoice')
    for key in ('confirmation_secret', 'payment_intent'):
        secret = _stripe_field(_stripe_field(invoice, key), 'client_secret')
        if secret:
            return secret
    return None


class StripeWebhookView(APIView):
    """Avisos de Stripe de la cuenta de las CLAVES del estudio (el webhook que
    crea connect_stripe). Los de la cuenta conectada llegan a
    ConnectWebhookView, que usa la misma lógica (process_event)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    # Cuenta de Stripe del evento que se procesa ('' = la de las claves;
    # acct_… = la conectada). Se guarda en los pagos y suscripciones nuevos.
    stripe_account = ''

    def post(self, request, *args, **kwargs):
        from api.utils.payments import parse_webhook_event, stripe_keys
        secret_key, _, wh_secret = stripe_keys()
        # Aunque el estudio ya cobre con «Conectar pagos», mientras tenga sus
        # claves este aviso sigue llegando (suscripciones de antes, reembolsos).
        if not secret_key:
            return HttpResponse("Payments disabled", status=503)
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE') or ''

        # 1. VERIFICAR FIRMA (el evento queda como dict normal)
        try:
            event = parse_webhook_event(request.body, sig_header, wh_secret)
        except ValueError:
            logger.warning("stripe.webhook.invalid_payload")
            return HttpResponse("Invalid payload", status=400)
        except stripe.SignatureVerificationError:
            logger.warning("stripe.webhook.invalid_signature")
            return HttpResponse("Invalid signature", status=400)

        logger.info("stripe.webhook.received type=%s event_id=%s", event['type'], event.get('id'))
        self.process_event(event, account='')
        # Siempre responder 200 a Stripe
        return HttpResponse(status=200)

    def process_event(self, event, account=''):
        """Enruta un evento ya verificado (dict). `account`: la cuenta de
        Stripe de la que viene ('' = la de las claves)."""
        self.stripe_account = account or ''
        event_type = event.get('type')
        obj = (event.get('data') or {}).get('object') or {}

        if event_type == 'checkout.session.completed':
            if obj.get('payment_status') == 'paid':
                if obj.get('mode') == 'subscription':
                    self._fulfill_subscription_creation(obj)
                else:
                    self._route_payment_logic(obj)
            # Métodos asíncronos (Klarna, Afterpay…): el pago se confirmará más tarde
            # via checkout.session.async_payment_succeeded — no hacer nada aquí todavía.

        elif event_type == 'checkout.session.async_payment_succeeded':
            # Klarna, Afterpay, Sofort… el pago se ha confirmado asíncronamente
            if obj.get('mode') == 'subscription':
                self._fulfill_subscription_creation(obj)
            else:
                self._route_payment_logic(obj)

        elif event_type == 'checkout.session.async_payment_failed':
            # El pago asíncrono ha fallado — registrar para depuración
            logger.warning(
                "stripe.payment.async_failed session=%s account=%s",
                obj.get('id'), self.stripe_account or '-',
            )

        elif event_type == 'invoice.paid':
            self._handle_invoice_paid(obj)

        elif event_type == 'customer.subscription.updated':
            self._handle_subscription_updated(obj)

        elif event_type == 'customer.subscription.deleted':
            self._handle_subscription_deleted(obj)

    def _route_payment_logic(self, session):
        """
        Decide si es una compra de PLAN o una RESERVA basándose en la metadata.
        """
        metadata = session.get('metadata', {})
        
        try:
            # CASO A: COMPRA DE PLAN (Tu lógica personalizada)
            if 'plan_id' in metadata:
                self._fulfill_plan_purchase(session)
            
            # CASO B: RESERVA / BOOKING (Lógica estándar)
            # Asumimos que si no hay plan_id, pero hay local_payment_id, es una reserva
            elif 'local_payment_id' in metadata:
                self._fulfill_booking_purchase(session)
            
            else:
                logger.warning("stripe.webhook.unroutable session=%s (sin plan_id ni local_payment_id)", session['id'])

        except Exception:
            # Logueamos y re-lanzamos: la vista devolverá 500 y Stripe
            # reintentará el evento, evitando pagos cobrados sin procesar.
            logger.exception("Error procesando lógica de negocio en webhook (session=%s)", session.get('id'))
            raise

    # =========================================================================
    # LÓGICA 1: COMPRA DE PLAN (Tu código integrado)
    # =========================================================================
    @transaction.atomic
    def _fulfill_plan_purchase(self, session):
        """
        Procesa la compra de un plan de créditos (pack).
        Toda la lógica corre dentro de una única transacción atómica para
        serializar correctamente el webhook vs. cualquier llamada concurrente.
        """
        metadata = session.get('metadata', {})
        payment_intent_id = session.get('payment_intent')

        user_id = metadata.get('user_id')
        plan_id = metadata.get('plan_id')
        payment_id = metadata.get('local_payment_id')

        logger.info("plan.fulfill.start user_id=%s plan_id=%s payment_id=%s", user_id, plan_id, payment_id)

        if not user_id or not plan_id:
            raise ValueError(f"Metadata incompleta en sesión {session.get('id')}")

        # 1. Obtener o crear el Payment con LOCK para serializar concurrencia
        try:
            payment = Payment.objects.select_for_update().get(id=payment_id)
        except Payment.DoesNotExist:
            logger.info("plan.fulfill.payment_missing payment_id=%s — creando registro", payment_id)
            session_currency = session.get('currency') or stripe_currency()
            amount_eur = from_stripe_amount(session.get('amount_total'), session_currency)
            payment = Payment.objects.create(
                id=payment_id,
                user_id=user_id,
                amount_eur=amount_eur,
                currency=session_currency.upper(),
                method='stripe',
                stripe_account=self.stripe_account,
                raw_response=session,
            )

        # 2. Idempotencia: salir si ya fue procesado
        if payment.status == 'succeeded':
            logger.info("plan.fulfill.skip payment_id=%s reason=already_succeeded", payment.id)
            return

        if CreditLedgerEntry.objects.filter(metadata__payment_id=str(payment_id)).exists():
            logger.warning("plan.fulfill.skip payment_id=%s reason=credits_already_granted", payment_id)
            payment.status = 'succeeded'
            payment.save(update_fields=['status'])
            return

        # 3. Obtener objetos necesarios
        user = User.objects.get(id=user_id)
        plan = Plan.objects.get(id=plan_id)
        wallet, _ = CreditWallet.objects.get_or_create(user_id=user_id)

        # 4. Otorgar créditos
        expires_at = None
        if plan.credits_expire_days:
            expires_at = timezone.now() + timedelta(days=plan.credits_expire_days)

        CreditLedgerEntry.objects.create(
            wallet=wallet,
            kind="grant",
            amount=plan.credits,
            expires_at=expires_at,
            reference=f"Compra del plan '{plan.name}'",
            metadata={'payment_id': payment.id, 'plan_id': plan.id}
        )

        # 5. Marcar el pago como completado
        payment.status = 'succeeded'
        payment.stripe_payment_intent_id = payment_intent_id
        payment.stripe_account = self.stripe_account
        payment.save()

        logger.info(
            "plan.fulfill.done payment_id=%s user_id=%s plan_id=%s credits=%s wallet_id=%s amount_eur=%s",
            payment.id, user_id, plan.id, plan.credits, wallet.id, payment.amount_eur,
        )

    def _notify_unconfirmed_bookings(self, items):
        """Push + email a quien pagó una reserva que no pudo confirmarse
        (la clase se llenó mientras pagaba, o el horario desapareció).
        Cubre usuarias registradas (push+email) e invitadas (solo email).
        El dinero se devuelve en Stripe; aquí solo avisamos. Nunca lanza."""
        from api.utils.push import send_push_to_user
        from api.utils.availability import to_madrid_wall
        for user, class_title, start_dt in items:
            wall = to_madrid_wall(start_dt)
            cuando = f' del {wall:%d/%m a las %H:%M}' if wall else ''
            if hasattr(user, 'push_subscriptions'):  # las invitadas no tienen push
                try:
                    send_push_to_user(
                        user,
                        title='❌ No había plaza — te devolvemos el pago',
                        body=f'La clase de {class_title}{cuando} se llenó justo mientras '
                             f'pagabas. Te devolvemos el importe a tu tarjeta (2-5 días). '
                             f'Elige otra hora en el calendario.',
                        url='/calendar',
                    )
                except Exception:
                    logger.warning("booking.fulfill.push_failed user_id=%s", user.pk, exc_info=True)
            if user.email:
                try:
                    send_templated_email(
                        to_email=user.email,
                        template_id='generic-notice',
                        dynamic_data={
                            'name': getattr(user, 'first_name', None) or getattr(user, 'name', '') or '',
                            'headline': 'No había plaza — pago devuelto',
                            'intro_copy': (
                                f'Justo mientras completabas el pago, la clase de {class_title}'
                                f'{cuando} se quedó sin plazas. Hemos devuelto el importe '
                                f'a tu tarjeta (puede tardar 2-5 días laborables en aparecer). '
                                f'Sentimos el contratiempo — hay más horarios disponibles en el calendario.'
                            ),
                            'cta_text': 'Elegir otra clase',
                            'cta_url': web_url('/calendar'),
                        },
                    )
                except Exception:
                    logger.warning("booking.fulfill.email_failed user_id=%s", user.id, exc_info=True)

    # =========================================================================
    # LÓGICA 2: PAGO DE RESERVA (Bookings)
    # =========================================================================
    @transaction.atomic
    def _fulfill_booking_purchase(self, session):
        """
        Lógica para confirmar reservas cuando se paga el carrito.
        """
        metadata = session.get('metadata', {})
        local_payment_id = metadata.get('local_payment_id')
        
        logger.info("booking.fulfill.start payment_id=%s", local_payment_id)

        try:
            # Bloqueamos el payment para evitar concurrencia
            payment = Payment.objects.select_for_update().get(id=local_payment_id)

            # Idempotencia
            if payment.status == 'succeeded':
                logger.info("booking.fulfill.skip payment_id=%s reason=already_succeeded", local_payment_id)
                return

            # Actualizar Payment
            payment.status = 'succeeded'
            payment.stripe_payment_intent_id = session.get('payment_intent')
            session_currency = session.get('currency') or payment.currency
            payment.amount_eur = from_stripe_amount(session.get('amount_total'), session_currency)
            payment.currency = session_currency.upper()
            payment.stripe_account = self.stripe_account
            payment.raw_response = session
            payment.save()

            # Confirmar bookings con control de capacidad (evita race conditions)
            pending_bookings = list(
                payment.bookings.select_related('occurrence__class_type').all()
            )
            updated_count = 0
            refund_cents = 0  # importe a devolver en Stripe por bookings cancelados
            not_confirmed = []  # (persona, título, start_datetime) para avisar tras el commit
            confirmed_bookings = []  # reservas confirmadas → push+email de confirmación
            for booking in pending_bookings:
                if booking.occurrence_id:
                    try:
                        locked_schedule = RecurringSchedule.objects.select_for_update().select_related(
                            'class_type'
                        ).get(id=booking.occurrence_id)
                    except RecurringSchedule.DoesNotExist:
                        booking.status = 'canceled'
                        booking.save(update_fields=['status', 'updated_at'])
                        refund_cents += self._booking_price_cents(booking, session_currency)
                        if booking.user or booking.guest:
                            not_confirmed.append((booking.user or booking.guest, 'tu clase', booking.start_datetime))
                        continue

                    reserved_count = Booking.objects.filter(
                        occurrence_id=locked_schedule.id,
                        start_datetime=booking.start_datetime,
                        status__in=['reserved', 'attended'],
                    ).count()

                    if reserved_count >= locked_schedule.capacity_max:
                        booking.status = 'canceled'
                        booking.save(update_fields=['status', 'updated_at'])
                        refund_cents += self._booking_price_cents(booking, session_currency)
                        if booking.user or booking.guest:
                            not_confirmed.append(
                                (booking.user or booking.guest,
                                 locked_schedule.class_type.title, booking.start_datetime)
                            )
                        logger.warning(
                            "booking.fulfill.canceled booking_id=%s reason=class_full class=%s occupancy=%s/%s",
                            booking.id, locked_schedule.class_type.title,
                            reserved_count, locked_schedule.capacity_max,
                        )
                        continue
                elif booking.event_id:
                    # Evento suelto: mismo control de aforo que una clase
                    locked_event = Event.objects.select_for_update().filter(id=booking.event_id).first()
                    taken = Booking.objects.filter(
                        event_id=booking.event_id, status__in=['reserved', 'attended'],
                    ).count()
                    if locked_event is None or not locked_event.is_active or locked_event.status == 'canceled' \
                            or taken >= locked_event.capacity_max:
                        booking.status = 'canceled'
                        booking.save(update_fields=['status', 'updated_at'])
                        refund_cents += self._booking_price_cents(booking, session_currency)
                        if booking.user or booking.guest:
                            not_confirmed.append((booking.user or booking.guest,
                                                  locked_event.title if locked_event else 'tu clase',
                                                  booking.start_datetime))
                        logger.warning("booking.fulfill.canceled booking_id=%s reason=event_unavailable", booking.id)
                        continue

                booking.status = 'reserved'
                booking.save(update_fields=['status', 'updated_at'])
                updated_count += 1
                confirmed_bookings.append(booking)

            # Devolver en Stripe lo pagado por bookings que no pudieron confirmarse.
            # Se hace tras el commit para no emitir un refund si la transacción se revierte.
            if refund_cents > 0:
                payment_intent_id = session.get('payment_intent')
                amount_paid_cents = int(session.get('amount_total') or 0)
                to_refund = min(refund_cents, amount_paid_cents)
                account = self.stripe_account
                transaction.on_commit(
                    lambda: self._issue_stripe_refund(payment_intent_id, to_refund, payment.id, account)
                )

            # Avisar a quien pagó pero se quedó sin plaza (antes: refund mudo —
            # la clienta creía tener la reserva y se enteraba en el estudio).
            if not_confirmed:
                transaction.on_commit(
                    lambda items=list(not_confirmed): self._notify_unconfirmed_bookings(items)
                )

            # Confirmación de reserva: solo push. El email ya lo manda el recibo
            # del Payment (signal, plantilla de invitada con el detalle del pago);
            # con los dos activos llegaban 2 emails por la misma reserva.
            if confirmed_bookings:
                from api.utils.booking_notify import notify_booking_confirmation
                transaction.on_commit(
                    lambda items=list(confirmed_bookings): notify_booking_confirmation(items, send_email=False)
                )

            logger.info(
                "booking.fulfill.done payment_id=%s confirmed=%s refund_cents=%s",
                local_payment_id, updated_count, refund_cents,
            )

        except Payment.DoesNotExist:
            logger.error("booking.fulfill.payment_missing payment_id=%s", local_payment_id)
            # No lanzamos error para que Stripe deje de enviar el evento, es un error de datos nuestros.

    @staticmethod
    def _booking_price_cents(booking, currency):
        """Precio de un booking en la unidad mínima de Stripe de `currency`
        (la del cobro), según su schedule o evento."""
        price = None
        if booking.occurrence_id:
            schedule = booking.occurrence
            price = (
                schedule.price_eur_override
                if schedule.price_eur_override is not None
                else schedule.class_type.default_price_eur
            )
        elif booking.event_id:
            price = booking.event.price_eur
        if not price or price <= 0:
            return 0
        return to_stripe_amount(price, currency)

    @staticmethod
    def _issue_stripe_refund(payment_intent_id, amount_cents, payment_id, account=''):
        if not payment_intent_id or amount_cents <= 0:
            logger.error(
                "No se pudo emitir refund para Payment %s: intent=%s amount=%s",
                payment_id, payment_intent_id, amount_cents,
            )
            return
        try:
            from api.utils.payments import stripe_client
            # En la cuenta donde se cobró ('' = la de las claves)
            client = stripe_client(account=account or '')
            if client is None:
                raise RuntimeError('Stripe ya no está conectado')
            client.v1.refunds.create(params={'payment_intent': payment_intent_id, 'amount': amount_cents})
            logger.info(
                "Refund de %s (unidad mínima de la moneda) emitido en Stripe para Payment %s (bookings sin plaza).",
                amount_cents, payment_id,
            )
        except Exception:
            # Requiere intervención manual: el cliente pagó por una plaza que no existe.
            logger.critical(
                "FALLO emitiendo refund de %s (unidad mínima) para Payment %s (intent=%s). Reembolsar manualmente.",
                amount_cents, payment_id, payment_intent_id, exc_info=True,
            )

    @transaction.atomic
    def _fulfill_subscription_creation(self, session):
        metadata = session.get('metadata', {})
        user_id = metadata.get('user_id')
        plan_id = metadata.get('plan_id')
        subscription_stripe_id = session.get('subscription')
        checkout_session_id = session.get('id')

        if not user_id or not plan_id or not subscription_stripe_id:
            logger.warning("subscription.create.invalid_metadata session=%s", checkout_session_id)
            return

        try:
            user = User.objects.get(id=user_id)
            plan = Plan.objects.get(id=plan_id)

            if plan.type != 'sub':
                logger.info("subscription.create.skip plan_id=%s reason=not_sub", plan.id)
                return

            # ── Idempotency guard #1: Subscription row ──────────────────────
            # Either verify-plan (frontend) or this webhook fires first.
            # get_or_create on stripe_subscription_id prevents a duplicate row
            # and a double credit grant.
            subscription, created = Subscription.objects.get_or_create(
                stripe_subscription_id=subscription_stripe_id,
                defaults=dict(
                    user=user,
                    plan=plan,
                    status='active',
                    current_period_start=timezone.now(),
                    current_period_end=timezone.now() + timedelta(days=30),
                    cancel_at_period_end=False,
                    stripe_account=self.stripe_account,
                ),
            )

            if not created:
                logger.info("subscription.create.skip stripe_sub=%s reason=already_exists", subscription_stripe_id)
                return

            # ── Initial credit grant ─────────────────────────────────────────
            wallet, _ = CreditWallet.objects.get_or_create(user=user)

            expires_at = None
            if plan.credits_expire_days:
                expires_at = timezone.now() + timedelta(days=plan.credits_expire_days)

            CreditLedgerEntry.objects.create(
                wallet=wallet,
                kind='grant',
                amount=plan.credits,
                expires_at=expires_at,
                reference=f"Suscripción inicial al plan '{plan.name}'",
                metadata={
                    'subscription_id': subscription.id,
                    'plan_id': plan.id,
                    'stripe_subscription_id': subscription_stripe_id,
                    'stripe_checkout_session_id': checkout_session_id,
                }
            )

            # ── Idempotency guard #2: Payment row ────────────────────────────
            session_currency = session.get('currency') or stripe_currency()
            amount_eur = from_stripe_amount(session.get('amount_total', 0), session_currency)
            Payment.objects.get_or_create(
                stripe_checkout_session_id=checkout_session_id,
                defaults=dict(
                    user=user,
                    amount_eur=amount_eur,
                    currency=session_currency.upper(),
                    status='succeeded',
                    method='stripe',
                    stripe_payment_intent_id=session.get('payment_intent'),
                    stripe_account=self.stripe_account,
                ),
            )

            if session.get('customer'):
                User.objects.filter(id=user_id).update(stripe_customer_id=session.get('customer'),
                                                       stripe_customer_account=self.stripe_account)

            logger.info(
                "subscription.created source=webhook user_id=%s plan=%s credits=%s stripe_sub=%s",
                user.id, plan.name, plan.credits, subscription_stripe_id,
            )

            # Medición: ¿llegó por una recomendación de membresía reciente?
            last_nudge = MembershipNudge.objects.filter(
                user=user, created_at__gte=timezone.now() - timedelta(days=45),
            ).exclude(action__in=['dismissed', 'converted']).order_by('-created_at').first()
            if last_nudge:
                MembershipNudge.objects.create(user=user, channel=last_nudge.channel,
                                               action='converted', plan=plan)

        except (User.DoesNotExist, Plan.DoesNotExist) as e:
            logger.error("subscription.create.error session=%s error=%s", checkout_session_id, e)

    def _handle_invoice_paid(self, invoice):
        subscription_stripe_id = _invoice_subscription_id(invoice)
        if not subscription_stripe_id:
            return

        # 'subscription_create' means this is the very first invoice — credits
        # were already granted by _fulfill_subscription_creation (checkout.session.completed).
        # Skip to avoid double-crediting on the initial billing cycle.
        billing_reason = invoice.get('billing_reason', '')
        if billing_reason == 'subscription_create':
            logger.info("invoice.paid.skip stripe_sub=%s reason=subscription_create", subscription_stripe_id)
            return

        try:
            subscription = Subscription.objects.select_related('user', 'plan').get(
                stripe_subscription_id=subscription_stripe_id
            )
        except Subscription.DoesNotExist:
            logger.warning("invoice.paid.unknown_subscription stripe_sub=%s", subscription_stripe_id)
            return

        if subscription.status != 'active' and subscription.status != 'past_due':
            logger.info("invoice.paid.skip subscription_id=%s status=%s", subscription.id, subscription.status)
            return

        plan = subscription.plan

        if CreditLedgerEntry.objects.filter(
            wallet__user=subscription.user,
            kind='grant',
            metadata__stripe_invoice_id=invoice.get('id'),
        ).exists():
            logger.info("invoice.paid.skip invoice=%s reason=already_processed", invoice.get('id'))
            return

        wallet, _ = CreditWallet.objects.get_or_create(user=subscription.user)

        expires_at = None
        if plan.credits_expire_days:
            expires_at = timezone.now() + timedelta(days=plan.credits_expire_days)

        CreditLedgerEntry.objects.create(
            wallet=wallet,
            kind='grant',
            amount=plan.credits,
            expires_at=expires_at,
            reference=f"Renovación suscripción '{plan.name}'",
            metadata={
                'subscription_id': subscription.id,
                'plan_id': plan.id,
                'stripe_subscription_id': subscription_stripe_id,
                'stripe_invoice_id': invoice.get('id'),
            }
        )

        period = invoice.get('lines', {}).get('data', [{}])[0].get('period', {})
        if period.get('start'):
            subscription.current_period_start = datetime.fromtimestamp(period['start'], tz=dt_timezone.utc)
        if period.get('end'):
            subscription.current_period_end = datetime.fromtimestamp(period['end'], tz=dt_timezone.utc)
        subscription.status = 'active'
        subscription.save(update_fields=['current_period_start', 'current_period_end', 'status', 'updated_at'])

        logger.info(
            "subscription.renewed user_id=%s plan=%s credits=%s invoice=%s",
            subscription.user.id, plan.name, plan.credits, invoice.get('id'),
        )

    def _handle_subscription_updated(self, stripe_subscription):
        subscription_stripe_id = stripe_subscription.get('id')

        try:
            subscription = Subscription.objects.get(stripe_subscription_id=subscription_stripe_id)
        except Subscription.DoesNotExist:
            logger.warning("subscription.updated.unknown stripe_sub=%s", subscription_stripe_id)
            return

        stripe_status = stripe_subscription.get('status')
        cancel_at_period_end = stripe_subscription.get('cancel_at_period_end', False)

        status_mapping = {
            'active': 'active',
            'past_due': 'past_due',
            'unpaid': 'past_due',
            'incomplete': 'active',
            'incomplete_expired': 'canceled',
            'trialing': 'active',
        }

        new_status = status_mapping.get(stripe_status, subscription.status)
        old_status = subscription.status

        subscription.status = new_status
        subscription.cancel_at_period_end = cancel_at_period_end

        period_start, period_end = _subscription_period(stripe_subscription)
        if period_start:
            subscription.current_period_start = datetime.fromtimestamp(period_start, tz=dt_timezone.utc)
        if period_end:
            subscription.current_period_end = datetime.fromtimestamp(period_end, tz=dt_timezone.utc)

        subscription.save(update_fields=[
            'status', 'cancel_at_period_end',
            'current_period_start', 'current_period_end', 'updated_at'
        ])

        logger.info(
            "subscription.updated subscription_id=%s status=%s cancel_at_period_end=%s",
            subscription.id, new_status, cancel_at_period_end,
        )

        # Aviso al pasar a impago: sin él, la clienta solo nota que sus clases
        # dejaron de auto-reservarse "sin motivo". Solo en la TRANSICIÓN
        # (old != past_due) para no repetir con cada webhook de Stripe.
        if new_status == 'past_due' and old_status != 'past_due':
            self._notify_subscription_problem(subscription)

    def _notify_subscription_problem(self, subscription):
        """Email + push de «tu pago no se pudo procesar». Nunca lanza."""
        from api.utils.push import send_push_to_user
        user = subscription.user
        plan_name = subscription.plan.name
        # La reserva automática solo se menciona a quien tiene clases fijas
        # (las asigna el estudio): a las demás no se les explica nada de eso.
        fixed = _has_fixed_classes(user)
        try:
            send_push_to_user(
                user,
                title='⚠️ Problema con tu suscripción',
                body=(f'No pudimos cobrar tu plan {plan_name}. Actualiza tu método de '
                      f'pago para que tus clases se sigan reservando automáticamente.' if fixed else
                      f'No pudimos cobrar tu plan {plan_name}. Revisa tu método de pago.'),
                url='/dashboard?tab=suscripcion',
            )
        except Exception:
            logger.warning("subscription.past_due.push_failed user_id=%s", user.id, exc_info=True)
        if user.email:
            try:
                send_templated_email(
                    to_email=user.email,
                    template_id='generic-notice',
                    dynamic_data={
                        'name': user.first_name or '',
                        'headline': 'No pudimos procesar tu pago',
                        'intro_copy': (
                            f'El cobro de tu plan {plan_name} no se pudo completar. '
                            + ('Stripe lo reintentará automáticamente, pero mientras tanto '
                               'tus clases NO se reservarán de forma automática. ' if fixed else
                               'Stripe lo reintentará automáticamente. ')
                            + 'Revisa tu método de pago desde tu panel para reactivarlo.'
                        ),
                        'cta_text': 'Revisar mi suscripción',
                        'cta_url': web_url('/dashboard?tab=suscripcion'),
                    },
                )
            except Exception:
                logger.warning("subscription.past_due.email_failed user_id=%s", user.id, exc_info=True)

    def _handle_subscription_deleted(self, stripe_subscription):
        subscription_stripe_id = stripe_subscription.get('id')

        try:
            subscription = Subscription.objects.get(stripe_subscription_id=subscription_stripe_id)
        except Subscription.DoesNotExist:
            logger.warning("subscription.deleted.unknown stripe_sub=%s", subscription_stripe_id)
            return

        already_canceled = subscription.status == 'canceled'
        subscription.status = 'canceled'
        subscription.cancel_at_period_end = False
        subscription.save(update_fields=['status', 'cancel_at_period_end', 'updated_at'])

        logger.info("subscription.deleted subscription_id=%s user_id=%s", subscription.id, subscription.user.id)

        # Despedida honesta: la suscripción terminó y con ella la auto-reserva.
        # Las preferencias se conservan por si vuelve a suscribirse.
        if not already_canceled:
            from api.utils.push import send_push_to_user
            user = subscription.user
            fixed = _has_fixed_classes(user)
            try:
                send_push_to_user(
                    user,
                    title='Tu suscripción ha finalizado',
                    body=('Tus clases ya no se reservarán automáticamente. '
                          'Tus preferencias se guardan por si quieres volver. 💛' if fixed else
                          'Gracias por estos meses. Tus créditos siguen valiendo hasta que caduquen. 💛'),
                    url='/prices',
                )
            except Exception:
                logger.warning("subscription.deleted.push_failed user_id=%s", user.id, exc_info=True)
            if user.email:
                try:
                    send_templated_email(
                        to_email=user.email,
                        template_id='generic-notice',
                        dynamic_data={
                            'name': user.first_name or '',
                            'headline': 'Tu suscripción ha finalizado',
                            'intro_copy': (
                                f'Tu plan {subscription.plan.name} ha llegado a su fin'
                                + (' y tus clases ya no se reservarán automáticamente. Hemos guardado '
                                   'tus clases de cada semana: si vuelves a suscribirte, todo seguirá '
                                   'donde lo dejaste.' if fixed else '.')
                                + ' Los créditos que ya tengas siguen siendo válidos hasta su caducidad.'
                            ),
                            'cta_text': 'Ver planes',
                            'cta_url': web_url('/prices'),
                        },
                    )
                except Exception:
                    logger.warning("subscription.deleted.email_failed user_id=%s", user.id, exc_info=True)

class ConnectWebhookView(APIView):
    """POST /api/v1/webhooks/connect/ — avisos del endpoint «Connect» de la
    plataforma (STRIPE_CONNECT_WEBHOOK_SECRET). Llegan los de TODAS las
    cuentas conectadas a la plataforma: solo se procesan los de la cuenta de
    este estudio y del mismo modo (test/live); el resto, 200 sin hacer nada.

    account.updated → se vuelve a leer la cuenta (sync_status);
    account.application.deauthorized → se desenlaza;
    el resto (pagos, suscripciones) → la misma lógica que el webhook de claves."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        from api.utils.payments import connect_configured, parse_webhook_event, platform_live
        secret = settings.STRIPE_CONNECT_WEBHOOK_SECRET
        if not secret or not connect_configured():
            return HttpResponse("Connect disabled", status=503)
        try:
            event = parse_webhook_event(request.body, request.META.get('HTTP_STRIPE_SIGNATURE') or '', secret)
        except ValueError:
            logger.warning("stripe.connect_webhook.invalid_payload")
            return HttpResponse("Invalid payload", status=400)
        except stripe.SignatureVerificationError:
            logger.warning("stripe.connect_webhook.invalid_signature")
            return HttpResponse("Invalid signature", status=400)

        event_type = event.get('type')
        account = event.get('account') or ''
        cfg = SiteConfig.load()
        if bool(event.get('livemode')) != platform_live():
            logger.info("stripe.connect_webhook.ignored reason=livemode type=%s event_id=%s", event_type, event.get('id'))
            return HttpResponse(status=200)
        if not account or account != cfg.stripe_account_id:
            logger.info("stripe.connect_webhook.ignored reason=other_account account=%s type=%s event_id=%s",
                        account or '-', event_type, event.get('id'))
            return HttpResponse(status=200)

        logger.info("stripe.connect_webhook.received type=%s account=%s event_id=%s", event_type, account, event.get('id'))
        from api.utils.stripe_connect import sync_status, unlink
        if event_type == 'account.updated':
            sync_status(reason='webhook')  # siempre se relee la cuenta en Stripe
        elif event_type == 'account.application.deauthorized':
            unlink('deauthorized')
        else:
            StripeWebhookView().process_event(event, account=account)
        return HttpResponse(status=200)


class VerifyPlanPurchaseView(APIView):
    """
    Verifica el estado de una sesión de Stripe sin otorgar créditos.
    Los créditos los otorga el webhook (StripeWebhookView._fulfill_plan_purchase).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        from api.utils.payments import payments_disabled_response, stripe_client
        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({'error': 'No se proporcionó session_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = client.v1.checkout.sessions.retrieve(session_id)

            from api.utils.payments import to_dict
            metadata = to_dict(getattr(session, 'metadata', None))
            if str(request.user.id) != str(metadata.get('user_id', '')):
                return Response({'error': 'No autorizado para verificar esta sesión.'}, status=status.HTTP_403_FORBIDDEN)

            if session.payment_status == 'paid' or session.payment_status == 'no_payment_required':
                return Response({
                    'status': 'success',
                    'message': 'Pago completado. Si los créditos aún no aparecen, se actualizarán en breve.',
                    'payment_status': session.payment_status,
                    **_session_amount(session),
                }, status=status.HTTP_200_OK)

            return Response({
                'status': 'pending',
                'message': 'El pago aún no se ha completado.',
                'payment_status': session.payment_status,
            }, status=status.HTTP_200_OK)

        except stripe.StripeError as e:
            return Response(
                {'error': e.user_message if hasattr(e, 'user_message') else str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as e:
            return Response(
                {'error': f'Error inesperado: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @transaction.atomic
    def _fulfill_subscription(self, session, metadata):
        """
        Crea la Subscription en BD y otorga los créditos iniciales.
        Idempotente: si la suscripción ya existe, no hace nada.
        """
        user_id = metadata.get('user_id')
        plan_id = metadata.get('plan_id')
        subscription_stripe_id = session.get('subscription') or getattr(session, 'subscription', None)

        if not user_id or not plan_id or not subscription_stripe_id:
            raise ValueError(f"Metadata incompleta para suscripción: {session.get('id')}")

        # ── Idempotencia: salir si la suscripción ya fue procesada ──────────
        if Subscription.objects.filter(stripe_subscription_id=subscription_stripe_id).exists():
            logger.info(f"Suscripción {subscription_stripe_id} ya procesada. Sin cambios.")
            return

        user = User.objects.get(id=user_id)
        plan = Plan.objects.get(id=plan_id, type='sub')

        subscription = Subscription.objects.create(
            user=user,
            plan=plan,
            status='active',
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timedelta(days=30),
            stripe_subscription_id=subscription_stripe_id,
            cancel_at_period_end=False,
        )

        wallet, _ = CreditWallet.objects.get_or_create(user=user)
        expires_at = None
        if plan.credits_expire_days:
            expires_at = timezone.now() + timedelta(days=plan.credits_expire_days)

        CreditLedgerEntry.objects.create(
            wallet=wallet,
            kind='grant',
            amount=plan.credits,
            expires_at=expires_at,
            reference=f"Suscripción inicial al plan '{plan.name}'",
            metadata={
                'subscription_id': subscription.id,
                'plan_id': plan.id,
                'stripe_subscription_id': subscription_stripe_id,
            }
        )

        amount_total = getattr(session, 'amount_total', None) or 0
        session_currency = getattr(session, 'currency', None) or stripe_currency()
        Payment.objects.get_or_create(
            stripe_checkout_session_id=session.get('id') or getattr(session, 'id', None),
            defaults={
                'user': user,
                'amount_eur': from_stripe_amount(amount_total, session_currency),
                'currency': session_currency.upper(),
                'status': 'succeeded',
                'method': 'stripe',
                'stripe_payment_intent_id': getattr(session, 'payment_intent', None),
            }
        )

        customer_id = getattr(session, 'customer', None)
        if customer_id:
            User.objects.filter(id=user_id).update(stripe_customer_id=customer_id)

        logger.info(f"Suscripción creada (verify): user={user_id}, plan={plan.name}, stripe_sub={subscription_stripe_id}")
class CreateBookingWithCreditsView(APIView):
    """Reserva con créditos de una clienta con cuenta (clases del horario y
    eventos sueltos). Todo en una transacción con el monedero y las sesiones
    bloqueados. La validación es la misma que la de las invitadas
    (api/utils/guest_checkout.py:validate_cart): cada línea tiene que ser una
    sesión real (día y hora de la clase, o el inicio del evento), activa, sin
    cierre, que no haya empezado, con plaza (las ofertas de la lista de espera
    cuentan, salvo la suya) y que no tenga ya reservada."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        from api.utils.guest_checkout import validate_cart

        user = request.user
        cart_items = request.data.get('cart_items')
        if not cart_items or not isinstance(cart_items, list):
            return Response(
                {'error': 'La solicitud debe contener una lista de items.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Monedero con LOCK: serializa peticiones concurrentes de la misma
        # usuaria para que la comprobación de saldo sea fiable.
        try:
            wallet = CreditWallet.objects.select_for_update().get(user=user)
        except CreditWallet.DoesNotExist:
            return Response(
                {'error': 'No se encontró un monedero de créditos para este usuario.'},
                status=status.HTTP_404_NOT_FOUND
            )

        lines, error = validate_cart(cart_items, user=user, lock=True, max_items=30)
        if error:
            transaction.set_rollback(True)
            return error

        total_credits_cost = decimal.Decimal(0)
        for line in lines:
            if line.credits is None or line.credits <= 0:
                transaction.set_rollback(True)
                return Response(
                    {'error': f'La clase "{line.title}" no tiene un precio en créditos válido.', 'code': 'no_credits'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            total_credits_cost += line.credits

        current_balance = wallet.balance
        if current_balance < total_credits_cost:
            transaction.set_rollback(True)
            return Response(
                {
                    'error': 'Créditos insuficientes.',
                    'code': 'insufficient_credits',
                    'balance': current_balance,
                    'cost': total_credits_cost
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        created_bookings = []
        for line in lines:
            created_bookings.append(Booking.objects.create(
                user=user, **line.target(),
                start_datetime=line.start, end_datetime=line.end, status='reserved',
                metadata={'credits': str(line.credits)},
            ))
        created_booking_ids = [b.id for b in created_bookings]

        # Confirmación tras el commit: solo push. El email detallado ("clase
        # reservada", con créditos gastados y saldo) lo manda el signal del
        # ledger al crear el spend; con los dos activos llegaban 2 emails.
        from api.utils.booking_notify import notify_booking_confirmation
        transaction.on_commit(
            lambda items=created_bookings: notify_booking_confirmation(items, send_email=False)
        )

        CreditLedgerEntry.objects.create(
            wallet=wallet,
            kind="spend",
            amount=-total_credits_cost,
            reference="Reserva de clases",
            metadata={
                'booking_ids': created_booking_ids,
                'cart_items': cart_items,
            }
        )

        logger.info(
            "booking.credits.created user_id=%s booking_ids=%s credits_spent=%s balance=%s",
            user.id, created_booking_ids, total_credits_cost, wallet.balance,
        )
        return Response(
            {
                'status': 'success',
                'message': 'Reserva completada con éxito.',
                'credits_spent': total_credits_cost,
                'new_balance': wallet.balance,
                'booking_ids': created_booking_ids,
            },
            status=status.HTTP_201_CREATED
        )



class BroadcastEmailViewSet(viewsets.ModelViewSet):
    """
    Vista para crear envíos masivos de correos.
    Solo administradores pueden acceder.
    """
    queryset = BroadcastEmail.objects.all().order_by('-created_at')
    serializer_class = BroadcastEmailSerializer
    permission_classes = [IsAdminUser] # ¡IMPORTANTE! Solo admins

    def create(self, request, *args, **kwargs):
        # El flujo estándar de create guardará el modelo
        # y la signal 'post_save' disparará el envío automáticamente.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Guardamos quien lo creó
        self.perform_create(serializer)
        
        headers = self.get_success_headers(serializer.data)
        return Response(
            {
                "message": "Envío creado. Se está procesando en segundo plano.",
                "data": serializer.data
            },
            status=status.HTTP_201_CREATED,
            headers=headers
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def audience(self, request):
        """Alcance de un envío masivo, para mostrarlo en el CRM antes de enviar:
        cuántas personas reciben el email y cuántos dispositivos/personas la push."""
        emails = User.objects.filter(is_active=True).exclude(email__isnull=True).exclude(email='').count()
        devices = PushSubscription.objects.count()
        push_people = PushSubscription.objects.values('user_id').distinct().count()
        return Response({
            'email_recipients': emails,
            'push_devices': devices,
            'push_people': push_people,
        })


class CreateStripeSubscriptionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, *args, **kwargs):
        from api.utils.payments import current_stripe_account, payments_disabled_response, stripe_client
        client = stripe_client()
        if client is None:
            return payments_disabled_response()
        stripe_account = current_stripe_account() or ''
        user_id = request.data.get('user_id')
        plan_id = request.data.get('plan_id')

        if not user_id or not plan_id:
            return Response(
                {'error': 'Se requiere user_id y plan_id.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(id=user_id)
            plan = Plan.objects.get(id=plan_id)
        except User.DoesNotExist:
            return Response({'error': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        except Plan.DoesNotExist:
            return Response({'error': 'Plan no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if plan.type != 'sub':
            return Response(
                {'error': 'El plan debe ser de tipo sub (suscripción).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not plan.stripe_price_id:
            return Response(
                {'error': 'El plan no tiene stripe_price_id configurado.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Un precio de Stripe solo existe en la cuenta donde se creó
        if (plan.stripe_price_account or '') != stripe_account:
            return Response(
                {'error': 'El stripe_price_id del plan es de otra cuenta de Stripe (la de antes de conectar '
                          'pagos). Crea el precio en tu cuenta actual o déjalo vacío.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # El cliente de Stripe también es de una cuenta: si es de otra, se crea uno nuevo
            if not user.stripe_customer_id or (user.stripe_customer_account or '') != stripe_account:
                customer = client.v1.customers.create(params={
                    'email': user.email,
                    'metadata': {'user_id': user.id},
                })
                user.stripe_customer_id = customer.id
                user.stripe_customer_account = stripe_account
                user.save(update_fields=['stripe_customer_id', 'stripe_customer_account'])
        except stripe.StripeError as e:
            return Response(
                {'error': f'Error creando cliente Stripe: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        try:
            stripe_subscription = client.v1.subscriptions.create(params={
                'customer': user.stripe_customer_id,
                'items': [{'price': plan.stripe_price_id}],
                'metadata': {
                    'user_id': user.id,
                    'plan_id': plan.id,
                },
                'payment_behavior': 'default_incomplete',
                'expand': ['latest_invoice.confirmation_secret'],
            })
            period_start, period_end = _subscription_period(stripe_subscription)

            subscription = Subscription.objects.create(
                user=user,
                plan=plan,
                status='active' if stripe_subscription.status == 'active' else stripe_subscription.status,
                current_period_start=(
                    datetime.fromtimestamp(period_start, tz=dt_timezone.utc) if period_start else timezone.now()
                ),
                current_period_end=(
                    datetime.fromtimestamp(period_end, tz=dt_timezone.utc) if period_end
                    else timezone.now() + timedelta(days=30)
                ),
                stripe_subscription_id=stripe_subscription.id,
                stripe_account=stripe_account,
                cancel_at_period_end=False,
            )

            return Response({
                'status': 'success',
                'subscription_id': subscription.id,
                'stripe_subscription_id': stripe_subscription.id,
                'client_secret': _subscription_client_secret(stripe_subscription),
            }, status=status.HTTP_201_CREATED)

        except stripe.StripeError as e:
            return Response(
                {'error': f'Error creando suscripción en Stripe: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


def _has_fixed_classes(user) -> bool:
    """¿Tiene clases fijas (plaza guardada cada semana, las asigna el estudio)?"""
    return UserClassPreference.objects.filter(user=user, is_active=True).exists()


class UserClassPreferenceViewSet(viewsets.ModelViewSet):
    """Clases fijas (plaza guardada cada semana). Es una herramienta del
    estudio: las asigna el panel (for_user / for_user_delete, solo
    administradoras). La clienta puede VER las suyas (my-class-preferences,
    GET); elegirlas o cambiarlas ella misma desde la web solo si el estudio lo
    enciende (SiteConfig.client_fixed_classes, apagado por defecto): si no,
    403 code='fixed_classes_admin_only'."""
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ['created_at', 'schedule__weekday', 'schedule__start_time']
    ADMIN_ACTIONS = ('for_user', 'for_user_delete')
    CLIENT_WRITES = ('create', 'update', 'partial_update', 'destroy')

    def get_permissions(self):
        # Las rutas users/<id>/class-preferences/ se montan a mano en urls.py
        # (sin router), así que el permission_classes de @action no se aplica:
        # se exige aquí.
        if self.action in self.ADMIN_ACTIONS:
            return [IsAdminUser()]
        return super().get_permissions()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.action in self.CLIENT_WRITES and not request.user.is_staff:
            from api.utils.payment_options import CODES
            from api.utils.site import get_site_config
            if not get_site_config().client_fixed_classes:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied({'error': CODES['fixed_classes_admin_only'], 'code': 'fixed_classes_admin_only'})

    def get_queryset(self):
        # Only expose truly recurring schedules — non-recurrent sessions and
        # one-off events must never appear in subscription preferences.
        return UserClassPreference.objects.filter(
            user=self.request.user,
            schedule__is_recurrent=True,
            schedule__weekday__isnull=False,
        ).select_related('schedule', 'schedule__class_type', 'schedule__room')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UserClassPreferenceWriteSerializer
        return UserClassPreferenceSerializer

    def perform_create(self, serializer):
        schedule = serializer.validated_data.get('schedule')
        # Guard: reject non-recurring schedules — they have no weekday and
        # would cause "Invalid Date" / broken auto-booking behaviour.
        if not schedule or not schedule.is_recurrent or schedule.weekday is None:
            raise ValidationError({
                'schedule': (
                    'Solo se pueden añadir clases recurrentes a las preferencias. '
                    'Los eventos y sesiones únicas no son compatibles con la reserva automática.'
                )
            })
        serializer.save(user=self.request.user)
        # Immediately book any remaining slots of the current week so
        # mid-week subscribers are not left waiting until the Sunday cron.
        try:
            from api.tasks import auto_reserve_for_user_now
            auto_reserve_for_user_now.delay(self.request.user.id)
        except Exception:
            # El fallo al encolar nunca debe bloquear la respuesta, pero sí
            # quedar registrado: el usuario se queda sin auto-reserva inmediata.
            logger.warning(
                "auto_reserve.enqueue_failed user_id=%s (¿broker Redis caído?)",
                self.request.user.id, exc_info=True,
            )

    @action(
        detail=False,
        methods=['get', 'post'],
        permission_classes=[IsAdminUser],
        url_path=r'for-user/(?P<user_id>\d+)',
    )
    def for_user(self, request, user_id=None):
        if request.method == 'GET':
            preferences = UserClassPreference.objects.filter(
                user_id=user_id,
            ).select_related('schedule', 'schedule__class_type', 'schedule__room')
            serializer = UserClassPreferenceSerializer(preferences, many=True)
            return Response(serializer.data)

        if request.method == 'POST':
            schedule_id = request.data.get('schedule_id')
            if not schedule_id:
                return Response({'error': 'schedule_id requerido'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                schedule = RecurringSchedule.objects.get(id=schedule_id)
            except RecurringSchedule.DoesNotExist:
                return Response({'error': 'Schedule no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            pref, created = UserClassPreference.objects.get_or_create(
                user_id=user_id,
                schedule=schedule,
                defaults={'is_active': True},
            )
            if not created and not pref.is_active:
                pref.is_active = True
                pref.save(update_fields=['is_active', 'updated_at'])

            serializer = UserClassPreferenceSerializer(pref)
            return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(
        detail=False,
        methods=['delete'],
        permission_classes=[IsAdminUser],
        url_path=r'for-user/(?P<user_id>\d+)/delete/(?P<pk>\d+)',
    )
    def for_user_delete(self, request, user_id=None, pk=None):
        try:
            pref = UserClassPreference.objects.get(id=pk, user_id=user_id)
        except UserClassPreference.DoesNotExist:
            return Response({'error': 'Preferencia no encontrada'}, status=status.HTTP_404_NOT_FOUND)
        pref.soft_delete()
        return Response({'message': 'Preferencia eliminada'}, status=status.HTTP_200_OK)


class MyReplacementStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user

        if not user.needs_class_replacement:
            return Response({'needs_replacement': False})

        return Response({
            'needs_replacement': True,
            'replacement_class_options': user.replacement_class_options or [],
            'replacement_deadline': user.replacement_deadline,
        })


class ChooseReplacementView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        schedule_id = request.data.get('schedule_id')
        start_datetime_str = request.data.get('start_datetime')

        if not schedule_id or not start_datetime_str:
            return Response(
                {'error': 'schedule_id y start_datetime requeridos'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.needs_class_replacement:
            return Response(
                {'error': 'No tienes clases pendientes de reemplazo.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            schedule = RecurringSchedule.objects.get(id=schedule_id)
        except RecurringSchedule.DoesNotExist:
            return Response({'error': 'Clase no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            start_datetime = datetime.fromisoformat(start_datetime_str.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            return Response({'error': 'Formato de fecha inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        # Un datetime sin zona es hora de pared de Madrid; se guarda como
        # instante real (UTC en BD), igual que las reservas de la web, para
        # que los conteos de aforo por igualdad cuadren entre sí.
        if start_datetime.tzinfo is None:
            start_datetime = start_datetime.replace(tzinfo=MADRID_TZ)

        # Vigencia del horario + excepciones (vacaciones/cierres/privadas)
        unavailable = slot_unavailable_reason(schedule, start_datetime)
        if unavailable:
            return Response(
                {'error': UNAVAILABLE_MESSAGES[unavailable]},
                status=status.HTTP_400_BAD_REQUEST
            )

        price_credits = (
            schedule.price_credits_override
            if schedule.price_credits_override is not None
            else schedule.class_type.default_price_credits
        )

        with transaction.atomic():
            # Lock de la wallet ANTES de leer el saldo: sin él, dos peticiones
            # concurrentes pasan ambas el check y el saldo queda en negativo.
            try:
                wallet = CreditWallet.objects.select_for_update().get(user=user)
            except CreditWallet.DoesNotExist:
                return Response(
                    {'error': 'No tienes monedero de créditos.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if wallet.balance < price_credits:
                return Response(
                    {'error': f'Créditos insuficientes. Necesitas {price_credits}, tienes {wallet.balance}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            locked_schedule = RecurringSchedule.objects.select_for_update().get(id=schedule.id)

            reserved_count = Booking.objects.filter(
                occurrence_id=locked_schedule.id,
                start_datetime=start_datetime,
                status__in=['reserved', 'attended'],
            ).count()

            if reserved_count >= locked_schedule.capacity_max:
                return Response(
                    {'error': 'La clase está llena.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if Booking.objects.filter(
                user=user,
                occurrence_id=locked_schedule.id,
                start_datetime=start_datetime,
                status__in=['reserved', 'attended'],
            ).exists():
                return Response(
                    {'error': 'Ya tienes una reserva en esta clase.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            new_booking = Booking.objects.create(
                occurrence=locked_schedule,
                user=user,
                status='reserved',
                start_datetime=start_datetime,
            )

            CreditLedgerEntry.objects.create(
                wallet=wallet,
                kind='spend',
                amount=-price_credits,
                reference=f'Reemplazo: {locked_schedule.class_type.title}',
                metadata={'schedule_id': schedule.id, 'replacement': True}
            )

            from api.utils.booking_notify import notify_booking_confirmation
            transaction.on_commit(lambda b=new_booking: notify_booking_confirmation([b]))

        user.needs_class_replacement = False
        user.replacement_class_options = None
        user.replacement_deadline = None
        user.save(update_fields=['needs_class_replacement', 'replacement_class_options', 'replacement_deadline'])

        logger.info(
            "booking.replacement.created user_id=%s schedule_id=%s credits_spent=%s",
            user.id, locked_schedule.id, price_credits,
        )

        return Response({
            'status': 'success',
            'message': f'Clase {locked_schedule.class_type.title} reservada como reemplazo.',
            'credits_spent': str(price_credits),
            'new_balance': str(wallet.balance),
        })


class AssignRecurringClassesView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        schedule_id = request.data.get('schedule_id')
        end_date_str = request.data.get('end_date')

        if not schedule_id:
            return Response({'error': 'schedule_id requerido'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=user_id)
            schedule = RecurringSchedule.objects.select_related('class_type', 'room').get(id=schedule_id)
        except User.DoesNotExist:
            return Response({'error': 'Usuario no encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except RecurringSchedule.DoesNotExist:
            return Response({'error': 'Schedule no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        if not schedule.is_active:
            return Response({'error': 'El horario no está activo'}, status=status.HTTP_400_BAD_REQUEST)

        end_date = timezone.now().date() + timedelta(days=90)
        if end_date_str:
            try:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                return Response({'error': 'Formato de end_date inválido (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

        pref, created = UserClassPreference.objects.get_or_create(
            user=user, schedule=schedule,
            defaults={'is_active': True},
        )
        if not created and not pref.is_active:
            pref.is_active = True
            pref.save(update_fields=['is_active', 'updated_at'])

        price_credits = (
            schedule.price_credits_override
            if schedule.price_credits_override is not None
            else schedule.class_type.default_price_credits
        )

        today = timezone.now().astimezone(MADRID_TZ).date()
        weekday = schedule.weekday
        if weekday is None:
            return Response({'error': 'El schedule no tiene weekday definido'}, status=status.HTTP_400_BAD_REQUEST)

        booked_count = 0
        skipped_count = 0

        # Generar todos los slots del rango en memoria (sin queries)
        madrid_tz = MADRID_TZ
        slots = []
        current = today
        while current <= end_date:
            if current.weekday() == weekday and schedule.is_date_in_window(current):
                start_dt = datetime.combine(current, schedule.start_time).replace(tzinfo=madrid_tz)
                end_dt = datetime.combine(current, schedule.end_time).replace(tzinfo=madrid_tz)
                if start_dt > timezone.now():
                    slots.append((start_dt, end_dt))
            current += timedelta(days=1)

        # Excluir slots dentro de excepciones (vacaciones/cierres/privadas)
        if slots:
            blks = blackouts_overlapping(
                to_madrid_wall(slots[0][0]), to_madrid_wall(slots[-1][1]), [schedule.id]
            )
            if blks:
                before = len(slots)
                slots = [
                    (s, e) for s, e in slots
                    if not any(bs <= to_madrid_wall(s) < be for _, bs, be in blks)
                ]
                skipped_count += before - len(slots)

        with transaction.atomic():
            # Un solo lock del schedule y dos queries agregadas para todo el rango,
            # en lugar de 3-4 queries y una transacción por semana.
            locked = RecurringSchedule.objects.select_for_update().get(id=schedule.id)
            slot_starts = [s for s, _ in slots]

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
                    occurrence_id=locked.id,
                    start_datetime__in=slot_starts,
                    status__in=['reserved', 'attended'],
                ).values('start_datetime').annotate(c=Count('id'))
            }

            bookings_to_create = []
            for start_dt, end_dt in slots:
                if start_dt in already_booked:
                    continue
                if occupancy.get(start_dt, 0) >= locked.capacity_max:
                    skipped_count += 1
                    continue
                bookings_to_create.append(Booking(
                    occurrence=schedule,
                    user=user,
                    status='reserved',
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    # No se cobran créditos por esta asignación: marcarlo para
                    # que una cancelación posterior NO reembolse créditos nunca gastados.
                    metadata={'assigned_by_admin': True, 'no_charge': True},
                ))

            Booking.objects.bulk_create(bookings_to_create)
            booked_count = len(bookings_to_create)
            if bookings_to_create:
                from api.utils.booking_notify import notify_fixed_class_assigned
                first_start = bookings_to_create[0].start_datetime
                last_start = bookings_to_create[-1].start_datetime
                transaction.on_commit(lambda: notify_fixed_class_assigned(
                    user, schedule, booked_count, first_start, last_start))

        logger.info(
            "booking.admin_assigned user_id=%s schedule_id=%s booked=%s skipped=%s admin_id=%s",
            user.id, schedule.id, booked_count, skipped_count, request.user.id,
        )

        return Response({
            'status': 'success',
            'message': f'{booked_count} clases reservadas de {schedule.class_type.title} para {user.email}',
            'preference_created': created,
            'booked': booked_count,
            'skipped': skipped_count,
            'end_date': end_date.isoformat(),
            'class_title': schedule.class_type.title,
            'room': schedule.room.name,
            'weekday': schedule.weekday,
            'start_time': schedule.start_time.strftime('%H:%M'),
        })


class CancelAllUserBookingsView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Usuario no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            # Wallet única (todas las reservas son del mismo usuario), con lock
            # para serializar frente a otros movimientos de créditos.
            wallet = CreditWallet.objects.select_for_update().filter(user=user).first()

            # Lock de las reservas para evitar doble cancelación/reembolso concurrente,
            # y select_related para no disparar 3-4 queries por reserva.
            future_bookings = list(
                Booking.objects.select_for_update(of=('self',)).select_related(
                    'occurrence__class_type'
                ).filter(
                    user=user,
                    start_datetime__gte=timezone.now(),
                    status__in=['reserved', 'pending'],
                )
            )

            if not future_bookings:
                return Response({'message': 'No hay reservas futuras para cancelar.', 'cancelled': 0})

            refund_entries = []
            for booking in future_bookings:
                # Solo reembolsar reservas confirmadas que sí gastaron créditos:
                # las 'pending' (checkout en EUR sin completar) y las marcadas
                # 'no_charge' (asignadas por admin) no gastaron créditos.
                if (
                    wallet
                    and booking.status == 'reserved'
                    and booking.occurrence_id
                    and not (booking.metadata or {}).get('no_charge')
                ):
                    credits_to_refund = (
                        booking.occurrence.price_credits_override
                        if booking.occurrence.price_credits_override is not None
                        else booking.occurrence.class_type.default_price_credits
                    )
                    if credits_to_refund and credits_to_refund > 0:
                        refund_entries.append(CreditLedgerEntry(
                            wallet=wallet,
                            kind='refund',
                            amount=credits_to_refund,
                            reference=f'admin_cancel_all_{user_id}',
                            metadata={'booking_id': booking.id, 'reason': 'Admin cancel all'}
                        ))

            CreditLedgerEntry.objects.bulk_create(refund_entries)
            refunded = len(refund_entries)
            cancelled = Booking.objects.filter(pk__in=[b.pk for b in future_bookings]).update(
                status='canceled', updated_at=timezone.now()
            )

        logger.info(
            "booking.admin_cancel_all user_id=%s cancelled=%s refunded=%s admin_id=%s",
            user_id, cancelled, refunded, request.user.id,
        )

        # Avisar a la clienta (antes: cancelación masiva muda)
        if cancelled:
            from api.utils.push import send_push_to_user
            try:
                send_push_to_user(
                    user,
                    title='Tus reservas han sido canceladas',
                    body=f'Se han cancelado {cancelled} reserva(s) futura(s) y los créditos '
                         f'han vuelto a tu monedero. Si no lo esperabas, escríbenos.',
                    url='/dashboard',
                )
            except Exception:
                logger.warning("admin_cancel_all.push_failed user_id=%s", user_id, exc_info=True)
            if user.email:
                try:
                    send_templated_email(
                        to_email=user.email,
                        template_id='generic-notice',
                        dynamic_data={
                            'name': user.first_name or '',
                            'headline': 'Tus reservas han sido canceladas',
                            'intro_copy': (
                                f'Se han cancelado {cancelled} reserva(s) futura(s) de tu cuenta '
                                f'y los créditos correspondientes han vuelto a tu monedero. '
                                f'Si no reconoces este cambio, responde a este correo o '
                                f'escríbenos por WhatsApp y lo revisamos.'
                            ),
                            'cta_text': 'Ver mi cuenta',
                            'cta_url': web_url('/dashboard'),
                        },
                    )
                except Exception:
                    logger.warning("admin_cancel_all.email_failed user_id=%s", user_id, exc_info=True)

        return Response({
            'message': f'{cancelled} reservas canceladas ({refunded} con devolución de créditos).',
            'cancelled': cancelled,
            'refunded': refunded,
        })


class ScheduleBlackoutViewSet(SoftDeleteModelViewSet):
    """Excepciones de calendario (vacaciones, franjas cerradas, clases privadas).

    Crear acepta dos formatos:
    - Días completos:   {"start_date": "2026-10-06", "end_date": "2026-10-12", ...}
      (end_date inclusive; se expande a 00:00→24:00 hora de Madrid)
    - Franja/slot:      {"start_datetime": "2026-10-06T10:00", "end_datetime": "2026-10-06T12:00", ...}
      (hora de pared de Madrid)
    Campos comunes: schedule (opcional; vacío = global), kind, reason,
    cancel_existing (bool): cancela y reembolsa las reservas ya hechas dentro
    del rango, avisando a los clientes por email/WhatsApp.
    """
    permission_classes = [IsAdminUser]
    queryset = ScheduleBlackout.objects.select_related('schedule__class_type').all()
    serializer_class = ScheduleBlackoutSerializer
    filterset_fields = ['schedule', 'kind']

    def create(self, request, *args, **kwargs):
        data = request.data.copy()

        # Expandir días completos a rango horario de Madrid
        if data.get('start_date'):
            try:
                d_start = datetime.strptime(str(data['start_date']), '%Y-%m-%d').date()
                d_end = datetime.strptime(str(data.get('end_date') or data['start_date']), '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Fechas inválidas (YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)
            if d_end < d_start:
                return Response({'error': 'end_date no puede ser anterior a start_date.'}, status=status.HTTP_400_BAD_REQUEST)
            data['start_datetime'] = datetime.combine(d_start, datetime.min.time()).replace(tzinfo=MADRID_TZ).isoformat()
            data['end_datetime'] = (datetime.combine(d_end, datetime.min.time()) + timedelta(days=1)).replace(tzinfo=MADRID_TZ).isoformat()

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        blackout = serializer.save(created_by=request.user)

        result = {'blackout': self.get_serializer(blackout).data, 'cancelled': 0, 'refunded': 0}

        if str(data.get('cancel_existing', '')).lower() in ('1', 'true', 'yes'):
            cancelled, refunded = self._cancel_affected_bookings(blackout)
            result.update({'cancelled': cancelled, 'refunded': refunded})

        logger.info(
            "blackout.created id=%s schedule=%s kind=%s range=%s→%s cancelled=%s admin_id=%s",
            blackout.id, blackout.schedule_id or 'global', blackout.kind,
            blackout.start_datetime, blackout.end_datetime, result['cancelled'], request.user.id,
        )
        return Response(result, status=status.HTTP_201_CREATED)

    def _cancel_affected_bookings(self, blackout):
        """Cancela y reembolsa las reservas futuras que caen dentro del blackout."""
        wall_start = to_madrid_wall(blackout.start_datetime)
        wall_end = to_madrid_wall(blackout.end_datetime)

        candidates = Booking.objects.filter(
            status='reserved',
            occurrence__isnull=False,
            start_datetime__gte=timezone.now() - timedelta(days=1),
            start_datetime__lte=blackout.end_datetime + timedelta(days=1),
        ).select_related('user', 'guest', 'payment', 'occurrence__class_type')
        if blackout.schedule_id:
            candidates = candidates.filter(occurrence_id=blackout.schedule_id)

        def in_window(dt):
            # Datos históricos con convención mixta: probamos ambas lecturas
            for wall in (to_madrid_wall(dt), dt.replace(tzinfo=None)):
                if wall_start <= wall < wall_end:
                    return True
            return False

        affected = [b for b in candidates if in_window(b.start_datetime)]
        cancelled = refunded = 0
        users_to_notify = []
        guest_refund_queue = []

        with transaction.atomic():
            for booking in affected:
                schedule = booking.occurrence
                credits_to_refund = (
                    schedule.price_credits_override
                    if schedule.price_credits_override is not None
                    else schedule.class_type.default_price_credits
                )
                if (
                    booking.user
                    and credits_to_refund and credits_to_refund > 0
                    and not (booking.metadata or {}).get('no_charge')
                    and hasattr(booking.user, 'wallet')
                ):
                    CreditLedgerEntry.objects.create(
                        wallet=booking.user.wallet,
                        kind='refund',
                        amount=credits_to_refund,
                        reference=f'blackout_{blackout.id}_booking_{booking.id}',
                        metadata={'booking_id': booking.id, 'blackout_id': blackout.id,
                                  'reason': blackout.reason or blackout.get_kind_display()},
                    )
                    refunded += 1
                elif booking.guest_id:
                    guest_refund_queue.append(booking)
                booking.status = 'canceled'
                booking.save(update_fields=['status', 'updated_at'])
                cancelled += 1
                person = booking.user or booking.guest
                if person:
                    users_to_notify.append((person, schedule.class_type.title, booking.start_datetime))

        # Reembolso Stripe a invitadas (fuera de la transacción)
        from api.utils.guest_refund import refund_guest_booking_stripe
        for booking in guest_refund_queue:
            if refund_guest_booking_stripe(booking, reason='blackout'):
                refunded += 1

        for user, class_title, start_dt in users_to_notify:
            try:
                notify_cancellation_email(user, class_title, start_dt)
                send_whatsapp_cancellation(user, class_title, start_dt)
            except Exception:
                logger.warning("blackout.notify_failed pk=%s", user.pk, exc_info=True)
            # Push al móvil (además de email/WhatsApp) — invitadas sin push
            if hasattr(user, 'push_subscriptions'):
                from api.utils.push import send_cancellation_push
                send_cancellation_push(user, class_title, start_dt)

        return cancelled, refunded


class SiteImageViewSet(SoftDeleteModelViewSet):
    permission_classes = [IsAdminUser]

    def get_permissions(self):
        # La web pública pinta estas fotos sin sesión; editar sigue siendo admin
        if self.action in ('list', 'retrieve'):
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = super().get_queryset()
        if not (self.request.user and self.request.user.is_staff):
            qs = qs.filter(is_active=True)
            from api.utils.site import web_section_on
            if not web_section_on('gallery'):
                qs = qs.exclude(section='gallery')  # galería apagada en «Mi web»
        return qs
    queryset = SiteImage.objects.all()
    serializer_class = SiteImageSerializer
    filterset_fields = ['section', 'is_active']
    search_fields = ['title']
    ordering_fields = ['order', 'created_at']
    ordering = ['section', 'order']


# ─────────────────────────────────────────────────────────────────────────────
# RECOMENDACIÓN DE MEMBRESÍA A CLIENTAS REGULARES
# ─────────────────────────────────────────────────────────────────────────────

APP_NUDGE_COOLDOWN_DAYS = 21


class MembershipSuggestionView(APIView):
    """GET /v1/me/membership-suggestion/ → análisis de la clienta y si hay que
    mostrarle la tarjeta (regular, sin membresía, sin haberla descartado hace
    poco). Lo usan el panel, el checkout y la pantalla de éxito de reserva."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from api.utils.membership import analyze_user
        data = analyze_user(request.user) or {'eligible': False}
        recently_dismissed = MembershipNudge.objects.filter(
            user=request.user, action='dismissed',
            created_at__gte=timezone.now() - timedelta(days=APP_NUDGE_COOLDOWN_DAYS),
        ).exists()
        data['show'] = bool(data.get('eligible') and data.get('plan') and not recently_dismissed)
        return Response(data)


class MembershipNudgeEventView(APIView):
    """POST /v1/me/membership-suggestion/event/ {channel, action}
    Registra que la tarjeta se mostró, se pulsó o se descartó (frecuencia y
    medición de conversión)."""
    permission_classes = [IsAuthenticated]
    ALLOWED = {'shown', 'clicked', 'dismissed'}

    def post(self, request):
        action = request.data.get('action')
        channel = request.data.get('channel', 'app')
        if action not in self.ALLOWED or channel not in ('app', 'checkout'):
            return Response({'error': 'Evento no válido.'}, status=status.HTTP_400_BAD_REQUEST)
        plan_id = request.data.get('plan_id')
        MembershipNudge.objects.create(
            user=request.user, channel=channel, action=action,
            plan_id=plan_id if Plan.objects.filter(id=plan_id).exists() else None,
            segment=str(request.data.get('segment', ''))[:12],
        )
        return Response({'status': 'ok'})


class DashboardStatsView(APIView):
    """GET /v1/stats/dashboard/ (admin) → cifras del panel de Inicio del CRM:
    ventas del mes frente al mismo tramo del mes anterior, altas, primeras
    clases, cuántas vuelven, clases más/menos llenas y clientas que han
    dejado de venir."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from api.utils.stats import dashboard_stats
        try:
            months = max(3, min(12, int(request.query_params.get('months', 6))))
        except ValueError:
            months = 6
        return Response(dashboard_stats(months=months))


class MembershipCandidatesView(APIView):
    """GET /v1/membership-candidates/ (admin) → regulares sin membresía con su
    clase fija, plan sugerido, ahorro y último contacto. Para que el estudio les
    escriba personalmente (canal que más convierte en un estudio pequeño)."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from api.utils.membership import candidates
        rows = []
        pairs = candidates()
        last = {}
        for n in MembershipNudge.objects.filter(
            user_id__in=[u.id for u, _ in pairs]
        ).order_by('created_at'):
            last[(n.user_id, n.channel)] = n
        for user, a in pairs:
            contacted = last.get((user.id, 'crm'))
            emailed = last.get((user.id, 'email'))
            rows.append({
                'user_id': user.id,
                'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
                'first_name': user.first_name or '',
                'email': user.email,
                'phone': user.phone,
                **a,
                'last_contacted': contacted.created_at if contacted else None,
                'last_emailed': emailed.created_at if emailed else None,
            })
        return Response(rows)


class MembershipCandidateContactedView(APIView):
    """POST /v1/membership-candidates/<user_id>/contacted/ (admin): el estudio marca
    que ya le escribió, para no repetir y medir el canal."""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({'error': 'Clienta no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        MembershipNudge.objects.create(user=user, channel='crm', action='contacted',
                                       plan_id=request.data.get('plan_id') or None)
        return Response({'status': 'ok', 'contacted_at': timezone.now()})


# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN DE EMAIL POR CÓDIGO
# ─────────────────────────────────────────────────────────────────────────────

class VerifyEmailCodeView(APIView):
    """POST /v1/auth/verify-code/ {code} — confirma el email con el código."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [scoped('email_verify', 'user')]

    def post(self, request):
        from api.utils.verification import verify_code
        ok, error = verify_code(request.user, request.data.get('code'))
        if not ok:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
        logger.info("verification.code_ok user_id=%s", request.user.id)
        return Response({'status': 'ok', 'is_verified': True})


class ResendVerificationView(APIView):
    """POST /v1/auth/resend-verification/ — nuevo código (máx. 1 por minuto).
    Con sesión: a la propia cuenta. Sin sesión: {email}, con respuesta
    genérica para no revelar qué emails existen."""
    permission_classes = [AllowAny]
    throttle_classes = [scoped('email_verify', 'user'), scoped('email_verify_email', 'email')]

    def post(self, request):
        from api.utils.verification import seconds_until_resend, send_verification
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        if user is None:
            email = (request.data.get('email') or '').strip().lower()
            user = User.objects.filter(email__iexact=email).first() if email else None
            generic = {'status': 'ok', 'message': 'Si hay una cuenta con ese email, te hemos enviado un código.'}
            if not user or user.is_verified:
                return Response(generic)
            if seconds_until_resend(user) == 0:
                send_verification(user)
            return Response(generic)

        if user.is_verified:
            return Response({'status': 'ok', 'is_verified': True})
        wait = seconds_until_resend(user)
        if wait > 0:
            return Response({'error': f'Espera {wait} s para pedir otro código.', 'retry_in': wait},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        sent = send_verification(user)
        if not sent:
            return Response({'error': 'No hemos podido enviar el código. Inténtalo en un momento.'},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'status': 'ok', 'retry_in': 60})


class AdminVerifyUserView(APIView):
    """POST /v1/users/<id>/verify-email/ (admin) — el estudio confirma a mano a una
    clienta que conoce en persona."""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        from api.utils.verification import mark_verified
        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({'error': 'Clienta no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        mark_verified(user)
        logger.info("verification.manual user_id=%s admin_id=%s", user.id, request.user.id)
        return Response({'status': 'ok', 'is_verified': True})
