"""Las clientas cancelan hasta BOOKING_CANCEL_MIN_HOURS antes; el estudio, siempre."""
from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Booking
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio


@override_settings(BOOKING_CANCEL_MIN_HOURS=8)
class CancelWindowTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio()
        self.user = make_client()

    def _booking(self, hours_ahead):
        start = timezone.now() + timedelta(hours=hours_ahead)
        return Booking.objects.create(user=self.user, occurrence=self.sched, status='reserved',
                                      start_datetime=start, end_datetime=start + timedelta(minutes=55))

    def _cancel(self, booking, as_user):
        c = APIClient()
        c.force_authenticate(as_user)
        return c.post(f'/api/v1/bookings/{booking.id}/cancel/')

    def test_client_can_cancel_with_enough_notice(self):
        b = self._booking(30)
        self.assertEqual(self._cancel(b, self.user).status_code, 200)
        b.refresh_from_db()
        self.assertEqual(b.status, 'canceled')

    def test_client_cannot_cancel_too_late(self):
        b = self._booking(7.9)
        r = self._cancel(b, self.user)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'cancel_window_closed')
        b.refresh_from_db()
        self.assertEqual(b.status, 'reserved')

    def test_studio_can_always_cancel(self):
        b = self._booking(1)
        self.assertEqual(self._cancel(b, make_admin()).status_code, 200)

    def test_other_client_cannot_cancel(self):
        b = self._booking(30)
        other = make_client('otra@test.local')
        self.assertIn(self._cancel(b, other).status_code, (403, 404))
        b.refresh_from_db()
        self.assertEqual(b.status, 'reserved')
