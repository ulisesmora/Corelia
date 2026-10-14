"""La lista de reservas del panel: buscar, ordenar y filtrar por día."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Booking
from .factories import StudioTestCase, make_admin, make_client, make_studio


class BookingListTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio()
        self.ana = make_client('ana@test.local')
        self.bea = make_client('bea@test.local')
        now = timezone.now()
        self.later = self._book(self.ana, now + timedelta(days=2))
        self.sooner = self._book(self.bea, now + timedelta(days=1))
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def _book(self, user, start):
        return Booking.objects.create(user=user, occurrence=self.sched, status='reserved',
                                      start_datetime=start, end_datetime=start + timedelta(minutes=55))

    def _ids(self, query):
        res = self.admin.get(f'/api/v1/bookings/?{query}')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        return [b['id'] for b in (data['results'] if isinstance(data, dict) else data)]

    def test_search_filters_by_client(self):
        self.assertEqual(self._ids('search=bea@test.local'), [self.sooner.id])

    def test_ordering_is_applied(self):
        self.assertEqual(self._ids('ordering=start_datetime'), [self.sooner.id, self.later.id])
        self.assertEqual(self._ids('ordering=-start_datetime'), [self.later.id, self.sooner.id])

    def test_day_window(self):
        day = (timezone.now() + timedelta(days=1)).date()
        nxt = day + timedelta(days=1)
        ids = self._ids(f'start_datetime__gte={day}&start_datetime__lt={nxt}&ordering=start_datetime')
        self.assertIn(self.sooner.id, ids)
        self.assertNotIn(self.later.id, ids)
