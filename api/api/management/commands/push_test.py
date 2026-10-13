from django.core.management.base import BaseCommand

from api.models import PushSubscription, User


class Command(BaseCommand):
    help = (
        'Comprueba las notificaciones push: sin argumentos lista las suscripciones; '
        'con --email envía una push de prueba real a ese usuario.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--email', type=str, help='Enviar push de prueba a este usuario')

    def handle(self, *args, **options):
        email = options.get('email')

        if not email:
            subs = PushSubscription.objects.select_related('user').order_by('-created_at')
            total = subs.count()
            self.stdout.write(f'Suscripciones push activas: {total}')
            for s in subs[:20]:
                self.stdout.write(
                    f'  - {s.user.email} · {s.endpoint[:60]}… · {s.created_at:%d/%m %H:%M} '
                    f'· {(s.user_agent or "")[:40]}'
                )
            if total == 0:
                self.stdout.write(self.style.WARNING(
                    '\nNadie se ha suscrito aún. Para probar: entra en la web con tu '
                    'cuenta (app instalada o escritorio), acepta "Activar avisos" y '
                    'vuelve a ejecutar este comando con --email tu@correo.'
                ))
            return

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Usuario {email} no encontrado'))
            return

        n_subs = user.push_subscriptions.count()
        if n_subs == 0:
            self.stdout.write(self.style.WARNING(
                f'{email} no tiene suscripciones push. Activa los avisos desde la web primero.'
            ))
            return

        from api.utils.push import send_push_to_user
        sent = send_push_to_user(
            user,
            title='🔔 Prueba de notificaciones',
            body='Si estás leyendo esto, las push funcionan perfectamente.',
            url='/dashboard',
        )
        style = self.style.SUCCESS if sent else self.style.ERROR
        self.stdout.write(style(f'Enviadas {sent}/{n_subs} (las fallidas quedan en los logs).'))
