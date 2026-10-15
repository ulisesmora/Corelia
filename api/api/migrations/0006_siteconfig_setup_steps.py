# Guía de puesta en marcha: pasos marcados a mano (api/setup_guide.py).
# Solo añade un campo con valor por defecto: no toca datos existentes.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_panel_follows_style'),
    ]

    operations = [
        migrations.AddField(
            model_name='siteconfig',
            name='setup_steps',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
