"""Pantallas de resumen del panel (solo administración).

  GET  /api/v1/dashboard/today/                 «Hoy»: cifras, avisos, día, gráfico, actividad, extras
  GET  /api/v1/dashboard/day/?date=AAAA-MM-DD   «Hoy en el estudio» de otro día
  POST /api/v1/dashboard/actions/               botón de un aviso {"kind": …}
  GET  /api/v1/dashboard/sales/?period=month    «Ventas» (week|month|quarter|year, &offset=N)
  GET  /api/v1/dashboard/sales/export/?period=  «Cierre para la gestoría» (CSV)
  GET  /api/v1/dashboard/web/                   «Mi web»: secciones, dominio, app
  POST /api/v1/dashboard/web/sections/          {"section": "faqs", "visible": false}  (SiteConfig.web_sections)
  GET  /api/v1/dashboard/checklist/             extras opcionales y «Revisa esto» (Ajustes)

La lógica vive en api/utils/dashboard.py.
"""
import logging
from datetime import date

from django.http import HttpResponse
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.utils import dashboard as dash
from api.utils.waitlist import WaitlistError

logger = logging.getLogger(__name__)


def _err(e: WaitlistError):
    return Response(e.payload(), status=e.status)


def _int(v, default=0, lo=0, hi=50):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return default


class DashboardTodayView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(dash.today_payload())


class DashboardDayView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            d = date.fromisoformat(request.query_params.get('date') or '')
        except ValueError:
            d = dash.local_today()
        return Response(dash.day_timeline(d))


class DashboardActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        try:
            return Response(dash.run_action(request.data, admin=request.user))
        except WaitlistError as e:
            return _err(e)


class DashboardSalesView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        period = request.query_params.get('period') or 'month'
        return Response(dash.sales_summary(period, _int(request.query_params.get('offset'))))


class DashboardSalesExportView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        period = request.query_params.get('period') or 'month'
        body, filename = dash.sales_csv(period, _int(request.query_params.get('offset')))
        logger.info("dashboard.sales_export period=%s admin=%s", period, request.user.id)
        resp = HttpResponse(body, content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        resp['Access-Control-Expose-Headers'] = 'Content-Disposition'
        return resp


class DashboardWebView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(dash.web_summary())


class DashboardWebSectionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        visible = request.data.get('visible')
        if isinstance(visible, str):
            visible = visible.lower() in ('1', 'true', 'yes', 'si', 'sí')
        try:
            return Response(dash.set_section_visible(request.data.get('section'), bool(visible)))
        except WaitlistError as e:
            return _err(e)


class DashboardChecklistView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(dash.checklist(request.user))

