from django.core.management.base import BaseCommand
from api.tasks import auto_reserve_monthly_classes
from api.models import UserClassPreference, User


class Command(BaseCommand):
    help = 'Ejecuta manualmente la auto-reserva mensual para todos los usuarios con preferencias activas'

    def add_arguments(self, parser):
        parser.add_argument('--user', type=str, help='Email del usuario. Si no se especifica, todos.')
        parser.add_argument('--dry-run', action='store_true', help='Solo mostrar qué se reservaría, sin ejecutar')

    def handle(self, *args, **options):
        user_email = options.get('user')
        dry_run = options.get('dry_run')

        if user_email:
            try:
                user = User.objects.get(email=user_email)
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'Usuario {user_email} no encontrado'))
                return

            prefs = UserClassPreference.objects.filter(user=user, is_active=True).select_related(
                'schedule', 'schedule__class_type', 'schedule__room'
            )
            if not prefs.exists():
                self.stdout.write(self.style.WARNING(f'{user_email} no tiene preferencias activas'))
                return

            self.stdout.write(self.style.SUCCESS(f'Preferencias de {user_email}:'))
            for p in prefs:
                self.stdout.write(
                    f'  - {p.schedule.class_type.title} · {p.schedule.room.name} · '
                    f'Día {p.schedule.weekday} a las {p.schedule.start_time}'
                )

        if dry_run:
            self.stdout.write(self.style.WARNING('\nDry run — no se ejecutó la reserva.'))
            return

        self.stdout.write('\nEjecutando auto-reserva...')
        result = auto_reserve_monthly_classes()
        self.stdout.write(self.style.SUCCESS(f'Resultado: {result}'))
