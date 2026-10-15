from django.core.management.base import BaseCommand, CommandError

from api.models import User


class Command(BaseCommand):
    help = (
        'Desactiva la verificación en dos pasos de una persona del panel que ha perdido el móvil '
        'y sus códigos de recuperación (y quita su bloqueo por intentos fallidos). '
        'Al entrar de nuevo podrá activarla otra vez desde Seguridad.'
    )

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='Email de la persona del panel')

    def handle(self, *args, **options):
        from api.utils import lockout, two_factor
        user = User.objects.filter(email__iexact=options['email'].strip()).first()
        if not user:
            raise CommandError('No hay ninguna cuenta con ese email.')
        had = two_factor.get_device(user) is not None
        two_factor.disable(user, by='manage.py')
        lockout.unlock(user.email)
        if had:
            self.stdout.write(self.style.SUCCESS(f'Verificación en dos pasos desactivada para {user.email}.'))
        else:
            self.stdout.write(f'{user.email} no tenía la verificación en dos pasos activada.')
        if two_factor.studio_requires_2fa():
            self.stdout.write(self.style.WARNING(
                'El estudio la exige: al entrar tendrá que activarla de nuevo antes de usar el panel.'))
