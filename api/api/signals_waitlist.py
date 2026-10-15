"""Lista de espera: cuando una reserva deja de ocupar su plaza (se cancela,
se reembolsa o se mueve a otra sesión), se ofrece la plaza a la primera de la
lista (api/utils/waitlist.py:offer_next). Y si alguien de la lista reserva por
la web normal, su entrada pasa a «claimed».

Se guarda el estado con el que se cargó cada Booking (post_init, sin
consultas extra) para saber qué ha cambiado al guardar."""
from django.db import transaction
from django.db.models.signals import post_init, post_save
from django.dispatch import receiver

from api.models import Booking

ACTIVE = ('reserved', 'attended')


@receiver(post_init, sender=Booking)
def _remember_booking_slot(sender, instance, **kwargs):
    d = instance.__dict__  # sin disparar la carga de campos diferidos
    instance._wl_loaded = (d.get('status'), d.get('occurrence_id'), d.get('start_datetime'))


@receiver(post_save, sender=Booking)
def _booking_slot_changed(sender, instance, created, **kwargs):
    from api.utils.waitlist import mark_claimed_by_booking, offer_next, wall_date
    if created:
        if instance.status in ACTIVE and instance.user_id and instance.occurrence_id:
            transaction.on_commit(lambda: mark_claimed_by_booking(instance))
    else:
        old_status, old_sid, old_start = getattr(instance, '_wl_loaded', (None, None, None))
        if old_status in ACTIVE and old_sid and old_start is not None:
            freed = (instance.status not in ACTIVE
                     or instance.occurrence_id != old_sid
                     or instance.start_datetime != old_start)
            if freed:
                d = wall_date(old_start)
                transaction.on_commit(lambda: offer_next(old_sid, d))
    instance._wl_loaded = (instance.status, instance.occurrence_id, instance.start_datetime)
