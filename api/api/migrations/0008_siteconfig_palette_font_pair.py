# Paletas y parejas de letra por estilo (design/tokens). Solo añade dos campos
# con valor por defecto ('' = colores / letra propios). El paso de datos marca
# la paleta (o la letra) de un estudio SOLO si sus colores (o sus fuentes)
# coinciden exactamente con una del estilo que tiene; si no, se quedan como
# propios. Nunca cambia sus colores ni sus fuentes.

from django.db import migrations, models


def map_existing(apps, schema_editor):
    from api.utils.palettes import match_font_pair, match_palette
    SiteConfig = apps.get_model('api', 'SiteConfig')
    for cfg in SiteConfig.objects.all():
        colors = {f: getattr(cfg, f) for f in ('color_primary', 'color_secondary', 'color_dark', 'color_background')}
        palette = match_palette(cfg.style_preset, colors)
        font_pair = match_font_pair(cfg.style_preset, cfg.font_heading, cfg.font_body)
        if palette or font_pair:
            SiteConfig.objects.filter(pk=cfg.pk).update(palette=palette, font_pair=font_pair)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_stripe_connect'),
    ]

    operations = [
        migrations.AddField(
            model_name='siteconfig',
            name='palette',
            field=models.CharField(blank=True, default='', help_text='Paleta de colores del estilo (slug). Vacío = colores propios del estudio.', max_length=24),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='font_pair',
            field=models.CharField(blank=True, default='', help_text='Pareja de letra del estilo (slug). Vacío = letra propia.', max_length=48),
        ),
        migrations.RunPython(map_existing, migrations.RunPython.noop),
    ]
