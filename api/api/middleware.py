"""Middlewares de seguridad del API."""
from django.conf import settings
from django.http import JsonResponse


class RequestSizeLimitMiddleware:
    """Rechaza con 413 las peticiones más grandes que MAX_REQUEST_MB (por
    defecto, el tamaño máximo de una foto + 1 MB) mirando Content-Length, antes
    de leer el cuerpo. Así nadie puede tener ocupado el servidor subiendo
    archivos enormes. El límite de cada foto lo sigue comprobando la subida
    (MAX_UPLOAD_MB) y el de los datos que no son archivos, Django
    (DATA_UPLOAD_MAX_MEMORY_SIZE)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        limit = settings.MAX_REQUEST_MB * 1024 * 1024
        try:
            length = int(request.META.get('CONTENT_LENGTH') or 0)
        except (TypeError, ValueError):
            length = 0
        if length > limit:
            return JsonResponse(
                {'error': f'El envío es demasiado grande (máximo {settings.MAX_REQUEST_MB} MB).',
                 'code': 'request_too_large'},
                status=413,
            )
        return self.get_response(request)
