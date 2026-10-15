# «Mi web» → Secciones: el estudio enciende o apaga secciones de la web
# (próximas clases, clases, precios, equipo, dónde estamos, opiniones,
# preguntas y galería) sin borrar su contenido. {} = todas visibles.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0009_calendar_waitlist'),
    ]

    operations = [
        migrations.AddField(
            model_name='siteconfig',
            name='web_sections',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='Secciones de la web ocultas desde «Mi web» ({"faqs": false}). Vacío = todas visibles.'),
        ),
    ]
