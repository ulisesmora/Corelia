# «Conectar pagos» (Stripe Connect). Solo añade campos con valor por defecto;
# el paso de datos marca payments_provider='keys' en los estudios que ya
# tenían las claves de Stripe pegadas en el panel (nada cambia para ellos).

from django.db import migrations, models


def mark_keys_provider(apps, schema_editor):
    SiteConfig = apps.get_model('api', 'SiteConfig')
    # encrypt('') == '': una clave vacía se guarda vacía
    SiteConfig.objects.exclude(stripe_secret_key='').exclude(stripe_secret_key__isnull=True) \
        .update(payments_provider='keys')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_siteconfig_setup_steps'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='stripe_account',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='plan',
            name='stripe_price_account',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='payments_provider',
            field=models.CharField(blank=True, choices=[('', 'Sin pagos online'), ('keys', 'Claves de Stripe'), ('connect', 'Conectar pagos')], default='', max_length=10),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='stripe_account_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='stripe_connect_status',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='stripe_connected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='subscription',
            name='stripe_account',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='user',
            name='stripe_customer_account',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.RunPython(mark_keys_provider, migrations.RunPython.noop),
    ]
