from django.core.management.base import BaseCommand

from api.models import User
from api.utils.verification import is_placeholder_email, send_verification


class Command(BaseCommand):
    help = ('Reenvía un código de verificación NUEVO a las cuentas que siguen sin '
            'confirmar su email (por defecto solo lista; usa --send para enviar).')

    def add_arguments(self, parser):
        parser.add_argument('--send', action='store_true', help='Enviar de verdad (sin esto, solo lista)')

    def handle(self, *args, **options):
        pending = [u for u in User.objects.filter(is_staff=False).exclude(is_verified=True).order_by('-date_joined')
                   if not is_placeholder_email(u.email)]
        self.stdout.write(f'Cuentas sin verificar con email real: {len(pending)}')
        for u in pending:
            self.stdout.write(f'  - {u.email} · alta {u.date_joined:%d/%m/%Y}')
        if not options['send']:
            self.stdout.write(self.style.WARNING('\nSolo lista. Añade --send para enviar los códigos.'))
            return
        ok = sum(1 for u in pending if send_verification(u, reminder=True))
        self.stdout.write(self.style.SUCCESS(f'Enviados {ok}/{len(pending)}'))
