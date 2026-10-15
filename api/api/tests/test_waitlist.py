"""Lista de espera: apuntarse con la clase llena, oferta automática al
liberarse una plaza, plazo para aceptar, «Dar plaza» desde el panel."""
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Booking, CreditLedgerEntry, WaitlistEntry, WaitlistSettings
from api.tests.factories import StudioTestCase, madrid, make_admin, make_client, make_studio, next_weekday
from api.utils.waitlist import expire_offers


def balance(user):
    return sum((e.amount for e in CreditLedgerEntry.objects.filter(wallet__user=user)), Decimal('0'))


class WaitlistTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio(weekday=1, start=time(10, 0), end=time(10, 55))
        self.sched.capacity_max = 1
        self.sched.save()
        self.day = next_weekday(1, min_days=2)
        self.start = madrid(self.day, 10)
        self.first = make_client('first@test.local')
        self.booking = Booking.objects.create(user=self.first, occurrence=self.sched, status='reserved',
                                              start_datetime=self.start, end_datetime=self.start + timedelta(minutes=55))
        self.ana = make_client('ana@test.local')
        self.bea = make_client('bea@test.local')
        self.admin = make_admin()

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def join(self, user):
        return self.api(user).post('/api/v1/waitlist/', {
            'schedule_id': self.sched.id, 'start_datetime': f'{self.day.isoformat()}T10:00:00'}, format='json')

    def free_the_spot(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.api(self.first).post(f'/api/v1/bookings/{self.booking.id}/cancel/')
        self.assertEqual(r.status_code, 200, r.content)

    def test_join_only_when_full_and_once(self):
        r = self.join(self.ana)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['position'], 1)
        self.assertEqual(self.join(self.bea).json()['position'], 2)
        self.assertEqual(self.join(self.ana).json()['code'], 'already_waiting')
        self.assertEqual(self.join(self.first).json()['code'], 'already_booked')
        self.sched.capacity_max = 5
        self.sched.save()
        r = self.join(make_client('c@test.local'))
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'has_space')
        self.assertEqual(APIClient().post('/api/v1/waitlist/', {}).status_code, 401)

    def test_full_class_booking_suggests_waitlist(self):
        r = self.api(self.ana).post('/api/v1/checkout/reserve/', {'cart_items': [{
            'id_source': self.sched.id, 'sessionDate': self.start.isoformat(),
            'sessionDateEnd': (self.start + timedelta(minutes=55)).isoformat()}]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'class_full')
        self.assertTrue(r.json()['waitlist'])

    @patch('api.utils.waitlist._notify_offer')
    def test_cancellation_offers_spot_to_first_who_claims_it(self, notify):
        self.join(self.ana)
        self.join(self.bea)
        self.free_the_spot()
        ana_entry = WaitlistEntry.objects.get(user=self.ana)
        self.assertEqual(ana_entry.status, 'offered')
        self.assertGreater(ana_entry.offer_expires_at, timezone.now())
        self.assertEqual(WaitlistEntry.objects.get(user=self.bea).status, 'waiting')
        notify.assert_called_once()

        # La plaza ofrecida está guardada: nadie más puede reservarla
        r = self.api(self.bea).post('/api/v1/checkout/reserve/', {'cart_items': [{
            'id_source': self.sched.id, 'sessionDate': self.start.isoformat(),
            'sessionDateEnd': (self.start + timedelta(minutes=55)).isoformat()}]}, format='json')
        self.assertEqual(r.json().get('code'), 'class_full')

        before = balance(self.ana)
        r = self.api(self.ana).post('/api/v1/waitlist/claim/', {'token': str(ana_entry.claim_token)}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(balance(self.ana), before - 1)
        ana_entry.refresh_from_db()
        self.assertEqual(ana_entry.status, 'claimed')
        self.assertEqual(Booking.objects.get(pk=r.json()['booking_id']).user, self.ana)
        # Otra persona no puede usar su enlace
        self.assertEqual(self.api(self.bea).post('/api/v1/waitlist/claim/',
                                                 {'token': str(ana_entry.claim_token)}, format='json').status_code, 404)

    @patch('api.utils.waitlist._notify_offer')
    def test_expired_offer_goes_to_next(self, notify):
        self.join(self.ana)
        self.join(self.bea)
        self.free_the_spot()
        WaitlistEntry.objects.filter(user=self.ana).update(offer_expires_at=timezone.now() - timedelta(minutes=1))
        r = self.api(self.ana).post('/api/v1/waitlist/claim/', {
            'token': str(WaitlistEntry.objects.get(user=self.ana).claim_token)}, format='json')
        self.assertEqual(r.json()['code'], 'offer_expired')
        with self.captureOnCommitCallbacks(execute=True):
            expire_offers()
        self.assertEqual(WaitlistEntry.objects.get(user=self.ana).status, 'expired')
        self.assertEqual(WaitlistEntry.objects.get(user=self.bea).status, 'offered')

    @patch('api.utils.waitlist._notify_offer')
    def test_leaving_an_offer_passes_it_on(self, notify):
        self.join(self.ana)
        self.join(self.bea)
        self.free_the_spot()
        entry = WaitlistEntry.objects.get(user=self.ana)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.api(self.ana).post(f'/api/v1/waitlist/{entry.id}/leave/')
        self.assertEqual(r.json()['status'], 'left')
        self.assertEqual(WaitlistEntry.objects.get(user=self.bea).status, 'offered')

    def test_admin_gives_place(self):
        self.join(self.ana)
        entry = WaitlistEntry.objects.get(user=self.ana)
        admin = self.api(self.admin)
        # Clase llena: hace falta force
        r = admin.post(f'/api/v1/waitlist/{entry.id}/promote/', {'charge': 'credits'}, format='json')
        self.assertEqual(r.status_code, 409)
        r = admin.post(f'/api/v1/waitlist/{entry.id}/promote/', {'charge': 'free', 'force': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        entry.refresh_from_db()
        self.assertEqual(entry.status, 'claimed')
        self.assertEqual(Booking.objects.filter(occurrence=self.sched, status='reserved').count(), 2)
        # Solo el estudio puede dar plaza
        other = WaitlistEntry.objects.create(schedule=self.sched, start_datetime=self.start, user=self.bea)
        self.assertEqual(self.api(self.bea).post(f'/api/v1/waitlist/{other.id}/promote/').status_code, 403)

    def test_admin_sees_waitlist_in_calendar(self):
        self.join(self.ana)
        admin = self.api(self.admin)
        start = self.day - timedelta(days=self.day.weekday())
        data = admin.get('/api/v1/calendar/', {'start': start.isoformat(), 'end': (start + timedelta(days=6)).isoformat()}).json()
        occ = next(o for o in data['occurrences'] if o['date'] == self.day.isoformat())
        self.assertEqual((occ['booked'], occ['waitlist']), (1, 1))
        detail = admin.get('/api/v1/calendar/occurrence/', {'schedule': self.sched.id, 'date': self.day.isoformat()}).json()
        self.assertEqual(detail['waitlist'][0]['name'], 'Carla')
        r = admin.post(f"/api/v1/waitlist/{detail['waitlist'][0]['id']}/remove/")
        self.assertEqual(r.json()['status'], 'removed')

    def test_settings_toggle(self):
        self.assertEqual(APIClient().get('/api/v1/waitlist/settings/').json(), {'enabled': True})
        self.assertEqual(self.api(self.ana).patch('/api/v1/waitlist/settings/', {'enabled': False}).status_code, 403)
        r = self.api(self.admin).patch('/api/v1/waitlist/settings/', {'enabled': False, 'claim_minutes': 30}, format='json')
        self.assertEqual(r.json()['claim_minutes'], 30)
        self.assertFalse(WaitlistSettings.load().enabled)
        self.assertEqual(self.join(self.ana).json()['code'], 'waitlist_disabled')
        self.assertEqual(self.api(self.admin).patch('/api/v1/waitlist/settings/', {'claim_minutes': 1},
                                                    format='json').status_code, 400)

    @patch('api.utils.waitlist._notify_offer')
    def test_canceled_class_does_not_offer(self, notify):
        self.join(self.ana)
        with self.captureOnCommitCallbacks(execute=True):
            self.api(self.admin).post('/api/v1/calendar/occurrence/cancel/', {
                'schedule': self.sched.id, 'date': self.day.isoformat(), 'refund': 'credits', 'notify': False},
                format='json')
        self.assertEqual(WaitlistEntry.objects.get(user=self.ana).status, 'removed')
        notify.assert_not_called()

    def test_my_entries(self):
        self.join(self.ana)
        r = self.api(self.ana).get('/api/v1/waitlist/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)
        self.assertEqual(r.json()[0]['class_title'], 'Mat')
        self.assertIsNone(r.json()[0]['claim_token'])
