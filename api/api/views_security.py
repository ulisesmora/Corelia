"""Seguridad de las cuentas: entrada en dos pasos del panel, bloqueo tras
intentos fallidos y captcha.

Endpoints de la verificación en dos pasos (solo personas del panel):

    GET  /api/v1/auth/2fa/                    estado (activada, códigos que quedan, norma del estudio)
    POST /api/v1/auth/2fa/setup/              empezar: QR + clave para escribir a mano
    POST /api/v1/auth/2fa/confirm/            {code} → activa y devuelve 10 códigos de recuperación
    POST /api/v1/auth/2fa/disable/            {code | recovery_code | password} → desactiva
    POST /api/v1/auth/2fa/recovery-codes/     {code | password} → códigos de recuperación nuevos
    POST /api/v1/auth/2fa/policy/             {require: bool} → exigirla a todo el equipo
    POST /api/v1/auth/2fa/verify/             {token, code | recovery_code} → sesión (segundo paso al entrar)
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from api.throttling import client_ip, scoped
from api.utils import lockout, two_factor
from api.utils import totp
from api.utils.turnstile import check_captcha, turnstile_enabled

logger = logging.getLogger(__name__)
User = get_user_model()

BAD_CODE = 'El código no es correcto o ya ha caducado. Escribe el que se ve ahora en la app (cambia cada 30 segundos).'
BAD_RECOVERY = 'Ese código de recuperación no es válido o ya se ha usado.'


# ── Piezas comunes de la entrada (panel y clientes) ──────────────────────────

_DUMMY_HASH = None


def check_credentials(email: str, password: str):
    """Usuario si email y contraseña coinciden; None si no. Si el email no
    existe se calcula igualmente un hash para que el tiempo de respuesta no
    revele qué emails tienen cuenta."""
    global _DUMMY_HASH
    user = User.objects.filter(email__iexact=(email or '').strip()).first()
    if user is None:
        if _DUMMY_HASH is None:
            _DUMMY_HASH = make_password('corelia-dummy-password')
        check_password(password, _DUMMY_HASH)
        return None
    if not user.is_active or not check_password(password, user.password):
        return None
    return user


def login_gate(request, email: str):
    """Antes de mirar la contraseña: ¿está bloqueado este email? ¿hace falta captcha?
    Devuelve la respuesta de error o None si se puede seguir."""
    seconds = lockout.locked_for(email)
    if seconds:
        return Response(lockout.locked_response_data(seconds), status=status.HTTP_429_TOO_MANY_REQUESTS)
    if turnstile_enabled() and lockout.failures(request, email) >= settings.LOGIN_CAPTCHA_AFTER:
        return check_captcha(request)
    return None


def login_failed(request, email: str, message: str, reason: str = 'password'):
    """Respuesta a un intento fallido (y lo apunta para el bloqueo)."""
    if lockout.register_failure(request, email, reason=reason):
        seconds = settings.LOGIN_LOCKOUT_MINUTES * 60
        return Response(lockout.locked_response_data(seconds), status=status.HTTP_429_TOO_MANY_REQUESTS)
    data = {'error': message}
    if turnstile_enabled() and lockout.failures(request, email) >= settings.LOGIN_CAPTCHA_AFTER:
        data['captcha_required'] = True  # el siguiente intento ya debe traer el captcha
    return Response(data, status=status.HTTP_401_UNAUTHORIZED)


def panel_session(user) -> dict:
    """Sesión (JWT) del panel tal y como la devolvía /api/signin/."""
    refresh = RefreshToken.for_user(user)
    refresh['isAdmin'] = True
    refresh['role'] = user.role.name if user.role else None
    access = refresh.access_token
    access['isAdmin'] = True
    return {
        'refresh': str(refresh),
        'access': str(access),
        'role': user.role.name if user.role else None,
        'permissions': user.role.permissions if user.role else {},
        'name': (user.first_name or '').strip(),
        'email': user.email,
        'two_factor_enabled': two_factor.is_enabled(user),
        'two_factor_setup_required': two_factor.setup_required(user),
    }


def two_factor_challenge(user) -> dict:
    """Contraseña buena con la verificación activada: falta el código."""
    return {
        'two_factor_required': True,
        'two_factor_token': two_factor.make_pending_token(user),
        'expires_in': settings.TWO_FACTOR_PENDING_SECONDS,
    }


def _password_or_code_ok(request, user) -> bool:
    """Para acciones delicadas: vale el código de la app, uno de recuperación o la contraseña."""
    data = request.data
    code = data.get('code') or ''
    recovery = data.get('recovery_code') or ''
    password = data.get('password') or ''
    if (code or recovery) and two_factor.check_code_or_recovery(user, code, recovery):
        return True
    if password and check_password(password, user.password):
        return True
    return False


# ── Segundo paso al entrar ────────────────────────────────────────────────────

class TwoFactorVerifyView(APIView):
    """POST /api/v1/auth/2fa/verify/ {token, code} o {token, recovery_code}."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [scoped('two_factor')]

    def post(self, request):
        user = two_factor.read_pending_token(request.data.get('token') or '')
        if user is None or not user.is_staff:
            return Response(
                {'error': 'Han pasado más de 5 minutos. Vuelve a escribir tu email y tu contraseña.',
                 'code': 'two_factor_expired'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        seconds = lockout.locked_for(user.email)
        if seconds:
            return Response(lockout.locked_response_data(seconds), status=status.HTTP_429_TOO_MANY_REQUESTS)

        code = request.data.get('code') or ''
        recovery = request.data.get('recovery_code') or ''
        if not code and not recovery:
            return Response({'error': 'Escribe el código de 6 cifras de tu app.'}, status=status.HTTP_400_BAD_REQUEST)
        used = two_factor.check_code_or_recovery(user, code, recovery)
        if not used:
            if lockout.register_failure(request, user.email, reason='two_factor'):
                seconds = settings.LOGIN_LOCKOUT_MINUTES * 60
                return Response(lockout.locked_response_data(seconds), status=status.HTTP_429_TOO_MANY_REQUESTS)
            return Response({'error': BAD_RECOVERY if recovery and not code else BAD_CODE, 'code': 'two_factor_invalid'},
                            status=status.HTTP_400_BAD_REQUEST)
        lockout.clear_failures(user.email)
        logger.info("auth.panel_login user_id=%s two_factor=%s ip=%s", user.id, used, client_ip(request))
        data = panel_session(user)
        if used == 'recovery':
            data['recovery_codes_left'] = two_factor.recovery_codes_left(user)
        return Response(data)


# ── Gestión desde el panel ────────────────────────────────────────────────────

class _PanelUserView(APIView):
    permission_classes = [IsAdminUser]
    throttle_classes = [scoped('two_factor_manage', 'user')]


class TwoFactorStatusView(_PanelUserView):
    throttle_classes = []

    def get(self, request):
        device = two_factor.get_device(request.user)
        enabled = bool(device and device.enabled)
        return Response({
            'enabled': enabled,
            'confirmed_at': device.confirmed_at if enabled else None,
            'recovery_codes_left': len(device.recovery_codes or []) if enabled else 0,
            'required_by_studio': two_factor.studio_requires_2fa(),
            'setup_required': two_factor.setup_required(request.user),
        })


class TwoFactorSetupView(_PanelUserView):
    def post(self, request):
        if two_factor.is_enabled(request.user):
            return Response({'error': 'Ya la tienes activada. Para cambiar de móvil, desactívala y vuelve a activarla.'},
                            status=status.HTTP_400_BAD_REQUEST)
        device = two_factor.start_setup(request.user)
        uri = totp.provisioning_uri(device.secret, request.user.email, two_factor.issuer_name())
        return Response({
            'otpauth_uri': uri,
            'qr_svg': two_factor.qr_svg_data_url(uri),
            'secret': totp.format_secret(device.secret),
            'issuer': two_factor.issuer_name(),
            'account': request.user.email,
        })


class TwoFactorConfirmView(_PanelUserView):
    def post(self, request):
        codes = two_factor.confirm_setup(request.user, request.data.get('code'))
        if codes is None:
            return Response({'error': BAD_CODE, 'code': 'two_factor_invalid'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'enabled': True, 'recovery_codes': codes})


class TwoFactorDisableView(_PanelUserView):
    def post(self, request):
        if not two_factor.get_device(request.user):
            return Response({'enabled': False})
        if two_factor.is_enabled(request.user) and not _password_or_code_ok(request, request.user):
            return Response({'error': 'Para desactivarla escribe el código de tu app (o tu contraseña).'},
                            status=status.HTTP_400_BAD_REQUEST)
        two_factor.disable(request.user, by=request.user)
        return Response({'enabled': False, 'required_by_studio': two_factor.studio_requires_2fa()})


class TwoFactorRecoveryCodesView(_PanelUserView):
    def post(self, request):
        if not two_factor.is_enabled(request.user):
            return Response({'error': 'Primero activa la verificación en dos pasos.'}, status=status.HTTP_400_BAD_REQUEST)
        if not _password_or_code_ok(request, request.user):
            return Response({'error': 'Escribe el código de tu app (o tu contraseña) para crear códigos nuevos.'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'recovery_codes': two_factor.regenerate_recovery_codes(request.user)})


class TwoFactorPolicyView(_PanelUserView):
    """Exigir (o no) la verificación en dos pasos a todo el equipo del panel."""

    def post(self, request):
        from api.models import SiteConfig
        require = request.data.get('require')
        if not isinstance(require, bool):
            return Response({'error': 'Indica require: true o false.'}, status=status.HTTP_400_BAD_REQUEST)
        if require and not two_factor.is_enabled(request.user):
            return Response({'error': 'Antes de exigirla al equipo, actívala tú en esta misma pantalla.'},
                            status=status.HTTP_400_BAD_REQUEST)
        cfg = SiteConfig.load()
        cfg.require_panel_2fa = require
        cfg.save(update_fields=['require_panel_2fa', 'updated_at'])
        logger.warning("security.2fa_policy require=%s admin_id=%s", require, request.user.id)
        return Response({'required_by_studio': require})
