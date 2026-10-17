"""
«Cómo se cobra» (crm/src/components/charging): los datos reales del estudio
para que las explicaciones del panel usen SUS números, no ejemplos inventados.

  GET /api/v1/guide/charging/   (solo administración, solo lectura)

Devuelve la moneda, el precio de la clase suelta, el plazo para cancelar
(BOOKING_CANCEL_MIN_HOURS), la lista de espera (activada, oferta automática y
minutos para aceptar), si se cobra online, las «Formas de cobro» de Ajustes →
Cobros (`options`: tarjeta, pagar en el estudio, invitados, qué se vende
online, formas de pago en el estudio; api/utils/payment_options.py) y un
ejemplo de cada cosa que se vende (bono, membresía y créditos por tipo de
clase).
"""
from decimal import Decimal

from django.conf import settings
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import ClassType, Plan, WaitlistSettings
from api.utils.site import get_site_config

MAX_CLASS_TYPES = 6


def _num(value) -> str:
    """Decimal → texto sin ceros de sobra («12.00» → «12», «1.50» → «1.5»)."""
    if value is None:
        return '0'
    d = Decimal(value)
    return format(d.quantize(Decimal(1)) if d == d.to_integral() else d.normalize(), 'f')


def _plan(plan):
    if plan is None:
        return None
    return {
        'id': plan.id,
        'name': plan.name,
        'credits': plan.credits,
        'price': _num(plan.price_eur),
        'expire_days': plan.credits_expire_days,
        'interval': plan.interval or '',
        'interval_count': plan.interval_count or 1,
    }


def charging_facts() -> dict:
    from api.utils.locale import normalize_currency
    from api.utils.payment_options import payment_options
    from api.utils.payments import payments_status

    cfg = get_site_config()
    wl = WaitlistSettings.load()
    pay = payments_status(cfg)

    plans = list(Plan.objects.filter(is_active=True).order_by('credits', 'price_eur', 'id'))
    packs = [p for p in plans if p.type == 'pack']
    subs = [p for p in plans if p.type == 'sub']
    single = next((p for p in packs if p.credits == 1), None)
    # Un bono «de verdad» (más de una clase): el más pequeño, que es el típico
    pack = next((p for p in packs if p.credits > 1), None)

    types = list(ClassType.objects.filter(is_active=True).order_by('default_price_credits', 'title')[:MAX_CLASS_TYPES])
    credits = {Decimal(t.default_price_credits) for t in types}

    return {
        'currency': normalize_currency(cfg.currency),
        # Como la web (PlanFinder.dropInPrice): el bono de 1 clase si lo hay;
        # si no, el precio de referencia de Ajustes
        'drop_in_price': _num(single.price_eur if single else cfg.drop_in_price),
        'drop_in_from_plan': bool(single),
        'cancel_min_hours': settings.BOOKING_CANCEL_MIN_HOURS,
        'waitlist': {'enabled': wl.enabled, 'auto_offer': wl.auto_offer, 'claim_minutes': wl.claim_minutes},
        # provider: 'keys' (claves propias) | 'connect' («Conectar pagos») | '' (sin cobro online)
        'payments': {'enabled': bool(pay['ready']), 'provider': (pay['provider'] or '') if pay['ready'] else ''},
        # Lo que la web ofrece de verdad (Ajustes → Cobros → «Formas de cobro»)
        'options': payment_options(cfg, bool(pay['ready'])),
        'class_types': [
            {'id': t.id, 'title': t.title, 'credits': _num(t.default_price_credits), 'price': _num(t.default_price_eur)}
            for t in types
        ],
        'credits_vary': len(credits) > 1,
        'pack': _plan(pack),
        'subscription': _plan(subs[0] if subs else None),
        'counts': {
            'packs': len(packs),
            'subscriptions': len(subs),
            'class_types': ClassType.objects.filter(is_active=True).count(),
        },
    }


class ChargingGuideView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(charging_facts())
