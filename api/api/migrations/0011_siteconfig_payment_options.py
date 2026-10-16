# Ajustes → Cobros → «Formas de cobro»: tarjeta en la web, pagar en el
# estudio (invitadas / clientas con cuenta), reservar sin cuenta, qué se vende
# online, formas de pago en el estudio + nota, y si las clientas eligen sus
# clases fijas en la web. Todo con valores por defecto que mantienen lo de
# antes (pagar en el estudio = automático: solo sin tarjeta en la web).


from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_siteconfig_web_sections'),
    ]

    operations = [
        migrations.AddField(
            model_name='siteconfig',
            name='client_fixed_classes',
            field=models.BooleanField(default=False, help_text='Las clientas con membresía eligen sus clases fijas en la web. Apagado = solo las asigna el estudio.'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='guest_booking_enabled',
            field=models.BooleanField(default=True, help_text='Se puede reservar sin cuenta (como invitada).'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='online_card_enabled',
            field=models.BooleanField(default=True, help_text='Ofrecer el pago con tarjeta en la web (solo si los pagos online están conectados).'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='pay_at_studio_clients',
            field=models.BooleanField(default=False, help_text='Pueden pagar en el estudio las clientas con cuenta.'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='pay_at_studio_enabled',
            field=models.BooleanField(blank=True, default=None, help_text='«Pagar en el estudio». Vacío = automático: solo cuando la web no cobra con tarjeta.', null=True),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='pay_at_studio_guests',
            field=models.BooleanField(default=True, help_text='Pueden pagar en el estudio las invitadas (sin cuenta).'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='sell_drop_in_online',
            field=models.BooleanField(default=True, help_text='Clase suelta: se puede pagar cada clase con tarjeta al reservar.'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='sell_memberships_online',
            field=models.BooleanField(default=True, help_text='Las membresías se pueden contratar en la web.'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='sell_packs_online',
            field=models.BooleanField(default=True, help_text='Los bonos se pueden comprar en la web.'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='studio_payment_methods',
            field=models.JSONField(blank=True, default=list, help_text='Cómo se puede pagar en el estudio (cash, bizum, card, transfer). Vacío = sin especificar.'),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='studio_payment_note',
            field=models.CharField(blank=True, default='', help_text='Nota corta para quien paga en el estudio, p. ej. «Paga al llegar, 5 min antes».', max_length=140),
        ),
        migrations.AddField(
            model_name='siteconfig',
            name='studio_payment_note_en',
            field=models.CharField(blank=True, default='', max_length=140),
        ),
    ]
