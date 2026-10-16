"""Clientas del estudio: la tarea diaria a mano (lo mismo que hace Celery cada
mañana, api.tasks.studio_plans_daily) y, solo en desarrollo, «pasar días»
para probar los cortes sin esperar un mes.

  python manage.py studio_plans_daily                 marca los vencidos y avisos opcionales
  python manage.py studio_plans_daily --date 2026-11-01
  DEBUG=1 python manage.py studio_plans_daily --advance-days 31
        (pruebas) como si hubieran pasado 31 días: adelanta el corte de los
        planes abiertos y sus renovaciones. Nunca con DEBUG apagado.
"""
from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import StudioPlan, StudioPlanRenewal
from api.utils import studio_plans as sp


class Command(BaseCommand):
    help = 'Clientas del estudio: marca los planes que vencen (y, en pruebas, simula que pasan días).'

    def add_arguments(self, parser):
        parser.add_argument('--date', help='Día del estudio a usar (AAAA-MM-DD). Por defecto, hoy.')
        parser.add_argument('--advance-days', type=int, default=0,
                            help='SOLO PRUEBAS (DEBUG=1): como si hubieran pasado N días.')

    def handle(self, *args, **opts):
        n = opts['advance_days']
        if n:
            if not settings.DEBUG:
                raise CommandError('--advance-days solo se puede usar en pruebas (DEBUG=1).')
            if not 1 <= n <= 400:
                raise CommandError('--advance-days entre 1 y 400.')
            with transaction.atomic():
                plans = list(StudioPlan.objects.filter(status__in=['active', 'paused']))
                for p in plans:
                    if p.next_due_date:
                        p.next_due_date -= timedelta(days=n)
                    if p.started_on:
                        p.started_on -= timedelta(days=n)
                    p.save(update_fields=['next_due_date', 'started_on', 'updated_at'])
                for r in StudioPlanRenewal.objects.filter(plan__in=plans):
                    r.period_start -= timedelta(days=n)
                    r.period_end -= timedelta(days=n)
                    r.save(update_fields=['period_start', 'period_end', 'updated_at'])
            self.stdout.write(self.style.WARNING(f'Pruebas: {len(plans)} planes como si hubieran pasado {n} días.'))
        d = None
        if opts.get('date'):
            try:
                d = date.fromisoformat(opts['date'])
            except ValueError:
                raise CommandError('--date con formato AAAA-MM-DD.')
        out = sp.daily(d)
        self.stdout.write(self.style.SUCCESS(f"Vencen: {out['marked']} · avisos enviados: {out['reminded']}"))
