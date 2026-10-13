"""Prepara una instalación nueva. Se ejecuta en cada arranque del contenedor
(es idempotente: si ya está hecho, no toca nada).

  - Crea la cuenta de administración del panel con ADMIN_EMAIL/ADMIN_PASSWORD
    (solo si todavía no existe ninguna).
  - Pone el nombre inicial del estudio (STUDIO_NAME) la primera vez.
  - Genera las claves de los avisos push.
  - Con SEED_DEMO=1 y la base de datos vacía, carga clases de ejemplo.
"""
import os

from django.core.management import call_command
from django.core.management.base import BaseCommand

from api.models import SiteConfig, User
from api.utils.site import ensure_vapid_keys


class Command(BaseCommand):
    help = 'Prepara una instalación nueva (idempotente).'

    def handle(self, *args, **options):
        cfg = SiteConfig.load()

        name = (os.getenv('STUDIO_NAME') or '').strip()
        if name and not cfg.setup_completed and cfg.studio_name == 'Mi Estudio':
            cfg.studio_name = name
            cfg.save(update_fields=['studio_name', 'updated_at'])
            self.stdout.write(f'Nombre del estudio: {name}')

        email = (os.getenv('ADMIN_EMAIL') or '').strip().lower()
        password = os.getenv('ADMIN_PASSWORD') or ''
        if not User.objects.filter(is_staff=True, is_superuser=True).exists():
            if email and password:
                User.objects.create_superuser(email=email, password=password, first_name='Admin')
                self.stdout.write(self.style.SUCCESS(f'Cuenta de administración creada: {email}'))
            else:
                self.stdout.write(self.style.WARNING(
                    'No hay ninguna cuenta de administración. Define ADMIN_EMAIL y ADMIN_PASSWORD '
                    'y reinicia, o ejecuta: python manage.py createsuperuser'))

        ensure_vapid_keys(cfg)

        if os.getenv('SEED_DEMO', '').lower() in ('1', 'true', 'yes'):
            call_command('seed_demo', '--only-if-empty')
