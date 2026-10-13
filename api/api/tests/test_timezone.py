"""Las horas que mandan el panel y la web sin zona horaria son hora del
estudio (no UTC). Bug real: los cierres y clases privadas se aplicaban
2 horas más tarde."""
from datetime import datetime, timedelta

from rest_framework.test import APIClient

from api.models import Booking, Event, ScheduleBlackout
from api.tests.factories import StudioTestCase, madrid, make_admin, make_studio, next_weekday
from api.utils.availability import slot_unavailable_reason, to_madrid_wall


class NaiveDatetimesAreStudioTime(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio()
        self.client = APIClient()
        self.client.force_authenticate(make_admin())
        self.day = next_weekday(1)

    def test_blackout_without_timezone_blocks_the_right_slot(self):
        d = self.day
        r = self.client.post('/api/v1/blackouts/', {
            'schedule': self.sched.id, 'kind': 'private',
            'start_datetime': f'{d}T10:00', 'end_datetime': f'{d}T10:55',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        b = ScheduleBlackout.objects.latest('id')
        self.assertEqual(to_madrid_wall(b.start_datetime), datetime(d.year, d.month, d.day, 10, 0))
        self.assertEqual(slot_unavailable_reason(self.sched, f'{d}T10:00:00'), 'blocked')
        self.assertIsNone(slot_unavailable_reason(self.sched, f'{d}T12:00:00'))

    def test_blackout_with_explicit_offset_is_respected(self):
        d = self.day
        r = self.client.post('/api/v1/blackouts/', {
            'kind': 'closed',
            'start_datetime': f'{d}T16:00:00+02:00', 'end_datetime': f'{d}T18:00:00+02:00',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        b = ScheduleBlackout.objects.latest('id')
        self.assertEqual(b.start_datetime, datetime.fromisoformat(f'{d}T16:00:00+02:00'))

    def test_full_day_blackout(self):
        d = self.day
        r = self.client.post('/api/v1/blackouts/', {'kind': 'vacation', 'start_date': str(d)}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        b = ScheduleBlackout.objects.latest('id')
        self.assertEqual(to_madrid_wall(b.start_datetime), datetime(d.year, d.month, d.day))
        self.assertEqual(to_madrid_wall(b.end_datetime), datetime(d.year, d.month, d.day) + timedelta(days=1))

    def test_event_without_timezone(self):
        d = self.day
        sched = self.sched
        r = self.client.post('/api/v1/events/', {
            'title': 'Taller', 'slug': 'taller', 'category': sched.class_type.category_id,
            'class_type': sched.class_type_id, 'room': sched.room_id,
            'capacity_min': 1, 'capacity_max': 10, 'price_eur': '25.00', 'is_active': True,
            'start_datetime': f'{d}T18:00', 'end_datetime': f'{d}T19:30',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(to_madrid_wall(Event.objects.latest('id').start_datetime).hour, 18)

    def test_admin_booking_naive_and_utc_are_the_same_instant(self):
        d = self.day
        r = self.client.post('/api/v1/bookings/', {
            'user': make_admin('otro@test.local').id, 'occurrence': self.sched.id, 'status': 'reserved',
            'start_datetime': f'{d}T10:00', 'end_datetime': f'{d}T10:55',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Booking.objects.latest('id').start_datetime, madrid(d, 10))
