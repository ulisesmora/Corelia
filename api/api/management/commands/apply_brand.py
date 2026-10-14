"""Aplica una marca completa de golpe. Pensado para preparar DEMOS de venta:
en 1 minuto una instalación muestra la web «como sería» con el logo y los
colores de un estudio concreto.

    python manage.py apply_brand --name "Estudio Luna" --color "#5B8A9A" \\
        --logo https://…/logo.png --style natural --tagline "Pilates junto al mar"

--color genera la paleta completa a partir de un solo color (igual que el
panel). --logo descarga la imagen y la guarda en la base de datos.
"""
import io

import requests
from django.core.management.base import BaseCommand, CommandError

from api.models import SiteConfig, StoredFile


def _mix(a: str, b: str, t: float) -> str:
    ca = [int(a.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    cb = [int(b.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02X}' for x, y in zip(ca, cb))


class Command(BaseCommand):
    help = 'Aplica nombre, logo, colores y estilo de un estudio (demos de venta).'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True)
        parser.add_argument('--color', help='Color principal de la marca (#RRGGBB)')
        parser.add_argument('--logo', help='URL del logo')
        parser.add_argument('--style', choices=[s for s, _ in SiteConfig.STYLE_PRESETS])
        parser.add_argument('--icons', choices=[s for s, _ in SiteConfig.ICON_STYLES])
        parser.add_argument('--tagline', default=None)
        parser.add_argument('--city', default=None)

    def handle(self, *args, **o):
        cfg = SiteConfig.load()
        cfg.studio_name = o['name']
        if o['tagline'] is not None:
            cfg.tagline = o['tagline']
        if o['city']:
            cfg.city = o['city']
        if o['style']:
            cfg.style_preset = o['style']
        if o['icons']:
            cfg.icon_style = o['icons']
        if o['color']:
            c = o['color'].upper()
            if len(c) != 7 or not c.startswith('#'):
                raise CommandError('--color debe ser #RRGGBB')
            cfg.color_primary = c
            cfg.color_secondary = _mix(c, '#000000', 0.22)
            cfg.color_dark = _mix(c, '#141414', 0.78)
            cfg.color_background = _mix(c, '#FFFFFF', 0.92)
        if o['logo']:
            r = requests.get(o['logo'], timeout=15)
            if not r.ok:
                raise CommandError(f'No se pudo descargar el logo ({r.status_code}).')
            from PIL import Image
            from django.conf import settings
            from api.utils.site import api_url
            img = Image.open(io.BytesIO(r.content))
            f = StoredFile.objects.create(
                data=r.content, content_type=r.headers.get('Content-Type', 'image/png').split(';')[0],
                filename='logo', size=len(r.content), width=img.width, height=img.height,
            )
            ext = '.png' if 'png' in f.content_type else '.jpg' if 'jpeg' in f.content_type else ''
            cfg.logo_url = api_url(f'/media/{f.id}{ext}')
        cfg.save()
        self.stdout.write(self.style.SUCCESS(
            f'Marca aplicada: {cfg.studio_name} · {cfg.style_preset} · {cfg.color_primary}. '
            'La web la muestra en menos de un minuto.'))
