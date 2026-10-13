"""Datos mínimos para los tests: un estudio con una clase semanal."""
from datetime import date, datetime, time, timedelta, timezone as dt_tz

from django.test import TestCase

from api.models import (
    Category, ClassType, CreditLedgerEntry, CreditWallet, Instructor,
    RecurringSchedule, Room, User,
)
from api.utils.availability import MADRID_TZ


def make_studio(weekday=1, start=time(10, 0), end=time(10, 55), credits=1):
    cat = Category.objects.create(name='Pilates', slug='pilates')
    inst = Instructor.objects.create(name='Ana', slug='ana')
    room = Room.objects.create(name='Sala 1', capacity=8)
    ct = ClassType.objects.create(title='Mat', slug='mat', category=cat,
                                  instructor=inst, default_price_credits=credits)
    sched = RecurringSchedule.objects.create(
        class_type=ct, room=room, weekday=weekday, is_recurrent=True,
        start_time=start, end_time=end, capacity_min=1, capacity_max=8, is_active=True,
    )
    return sched


def make_admin(email='admin@test.local'):
    return User.objects.create_user(email=email, password='x-admin-pass', is_staff=True,
                                    is_superuser=True, first_name='Admin')


def make_client(email='clienta@test.local', credits=10):
    user = User.objects.create_user(email=email, password='x-client-pass',
                                    first_name='Carla', is_verified=True)
    wallet, _ = CreditWallet.objects.get_or_create(user=user)
    if credits:
        CreditLedgerEntry.objects.create(wallet=wallet, kind='grant', amount=credits, reference='test')
    return user


def next_weekday(weekday, min_days=1):
    d = date.today() + timedelta(days=min_days)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d


def madrid(d, hour, minute=0):
    """Instante real (UTC) de una hora de pared del estudio."""
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=MADRID_TZ).astimezone(dt_tz.utc)


class StudioTestCase(TestCase):
    """TestCase que limpia la caché de SiteConfig entre tests (la BD se
    revierte, pero la caché en memoria del proceso no)."""

    def setUp(self):
        super().setUp()
        from api.utils.site import clear_site_config_cache
        clear_site_config_cache()
        self.addCleanup(clear_site_config_cache)
