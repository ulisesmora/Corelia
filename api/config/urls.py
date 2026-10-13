from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404, HttpResponse
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from api.views import serve_stored_file
from api.views_site import panel_manifest


def healthcheck(request):
    return HttpResponse('ok', content_type='text/plain')


def panel_index(request, *args, **kwargs):
    """Panel de administración (SPA de /crm): cualquier ruta que no sea del
    API devuelve su index.html y React Router hace el resto."""
    index = settings.PANEL_DIST_DIR / 'index.html'
    if not index.exists():
        if request.path in ('', '/'):
            return HttpResponse(
                'Studio Kit API funcionando. El panel no está compilado en esta '
                'instalación (en desarrollo, arráncalo con: cd crm && pnpm dev).',
                content_type='text/plain; charset=utf-8',
            )
        raise Http404
    resp = FileResponse(open(index, 'rb'), content_type='text/html; charset=utf-8')
    # El HTML nunca se cachea: así cada despliegue llega al momento
    resp['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp


urlpatterns = [
    path('healthz', healthcheck),
    path('panel.webmanifest', panel_manifest),
    path('django-admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    re_path(r'^media/(?P<file_id>[0-9a-f-]{36})(?P<ext>\.[A-Za-z0-9]{1,5})?$', serve_stored_file),
    # Todo lo demás: el panel (SPA). Va al final para no tapar nada.
    re_path(r'^(?!api/|django-admin/|static/|media/|panel\.webmanifest).*$', panel_index),
]
