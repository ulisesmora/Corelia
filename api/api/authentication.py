"""Autenticación del API: JWT + la norma «verificación en dos pasos obligatoria».

Si el estudio exige la verificación en dos pasos (Seguridad → «Exigirla a todo
el equipo») y una persona del panel aún no la ha activado, su sesión solo sirve
para activarla: cualquier otra petición recibe un 403 con
code='two_factor_setup_required' y el panel la lleva a la pantalla Seguridad.
"""
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

# Lo único que puede hacer una sesión a la que le falta activar la verificación
SETUP_ALLOWED_PREFIXES = ('/api/v1/auth/2fa/', '/api/v1/me/')
SETUP_ALLOWED_READ_ONLY = ('/api/v1/site-config/',)


class TwoFactorSetupRequired(PermissionDenied):
    default_detail = ('Tu estudio exige la verificación en dos pasos. Actívala en Seguridad '
                      'para seguir usando el panel.')
    default_code = 'two_factor_setup_required'


def _allowed_during_setup(request) -> bool:
    path = request.path
    if path.startswith(SETUP_ALLOWED_PREFIXES):
        return True
    return request.method in ('GET', 'HEAD', 'OPTIONS') and path in SETUP_ALLOWED_READ_ONLY


class PanelJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result
        if user.is_staff and not _allowed_during_setup(request):
            from api.utils.two_factor import setup_required
            if setup_required(user):
                exc = TwoFactorSetupRequired()
                exc.detail = {'detail': exc.default_detail, 'error': exc.default_detail,
                              'code': 'two_factor_setup_required'}
                raise exc
        return user, token
