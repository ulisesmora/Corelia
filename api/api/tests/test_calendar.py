"""Calendario del panel (api/views_calendar.py + api/utils/calendar_ops.py)."""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from api.models import (
    Booking, CreditLedgerEntry, GuestProfile, Instructor, Payment, RecurringSchedule, Room,
    ScheduleBlackout, User,
)
from api.tests.factories import StudioTestCase, madrid, make_admin, make_client, make_studio, next_weekday


def balance(user):
    return sum((e.amount for e in CreditLedgerEntry.objects.filter(wallet__user=user)), Decimal('0'))


class CalendarBase(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio(weekday=1, start=time(10, 0), end=time(10, 55))
        self.day = next_weekday(1, min_days=2)
        self.admin = make_admin()
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.client_user = make_client()

    def book(self, user=None, day=None, sched=None, status='reserved', guest=None, payment=None, **meta):
        day = day or self.day
        sched = sched or self.sched
        return Booking.objects.create(
            user=None if guest else (user or self.client_user), guest=guest, payment=payment,
            occurrence=sched, status=status,
            start_datetime=madrid(day, sched.start_time.hour, sched.start_time.minute),
            end_datetime=madrid(day, sched.end_time.hour, sched.end_time.minute), metadata=meta,
        )

    def week(self):
        start = self.day - timedelta(days=self.day.weekday())
        return start, start + timedelta(days=6)

    def get_range(self, start=None, end=None, **params):
        start, end = (start, end) if start else self.week()
        return self.api.get('/api/v1/calendar/', {'start': start.isoformat(), 'end': end.isoformat(), **params})

    def occ(self, data, schedule_id=None, d=None):
        sid = schedule_id or self.sched.id
        d = (d or self.day).isoformat()
        return next((o for o in data['occurrences'] if o['schedule_id'] == sid and o['date'] == d), None)


class CalendarPermissionsTests(CalendarBase):
    def test_anonymous_and_clients_are_rejected(self):
        anon = APIClient()
        client = APIClient()
        client.force_authenticate(self.client_user)
        start, end = self.week()
        for c in (anon, client):
            self.assertIn(c.get('/api/v1/calendar/', {'start': start, 'end': end}).status_code, (401, 403))
            self.assertIn(c.post('/api/v1/calendar/occurrence/cancel/',
                                 {'schedule': self.sched.id, 'date': self.day}).status_code, (401, 403))
            self.assertIn(c.post('/api/v1/calendar/occurrence/move/', {}).status_code, (401, 403))
        b = self.book()
        self.assertIn(client.post(f'/api/v1/calendar/bookings/{b.id}/check-in/', {}).status_code, (401, 403))


class CalendarRangeTests(CalendarBase):
    def test_week_with_occupancy_and_flags(self):
        self.book()
        self.book(user=make_client('b@test.local'), status='attended')
        self.book(user=make_client('c@test.local'), status='canceled')
        r = self.get_range(catalog=1)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        o = self.occ(data)
        self.assertIsNotNone(o)
        self.assertEqual(o['booked'], 2)
        self.assertEqual(o['attended'], 1)
        self.assertEqual(o['capacity'], 8)
        self.assertTrue(o['recurring'])
        self.assertFalse(o['canceled'])
        self.assertEqual(o['start'], f'{self.day.isoformat()}T10:00')
        self.assertEqual(o['instructor']['name'], 'Ana')
        self.assertIn('rooms', data['catalog'])
        self.assertTrue(data['catalog']['has_schedule'])
        self.assertTrue(data['catalog']['waitlist']['enabled'])

    def test_range_is_validated(self):
        self.assertEqual(self.api.get('/api/v1/calendar/', {'start': '2026-01-01'}).status_code, 400)
        self.assertEqual(self.get_range(date(2026, 1, 1), date(2026, 6, 1)).status_code, 400)

    def test_blackout_day_and_canceled_session(self):
        start, end = self.week()
        # Festivo todo el día (global) → closed_days + la clase marcada con blackout
        ScheduleBlackout.objects.create(start_datetime=madrid(self.day, 0), end_datetime=madrid(self.day + timedelta(days=1), 0),
                                        kind='vacation', reason='Fiesta')
        data = self.get_range().json()
        self.assertEqual(data['closed_days'][self.day.isoformat()]['reason'], 'Fiesta')
        self.assertEqual(self.occ(data)['blackout']['kind'], 'vacation')

    def test_moved_sessions_are_hidden(self):
        ScheduleBlackout.objects.create(schedule=self.sched, start_datetime=madrid(self.day, 10),
                                        end_datetime=madrid(self.day, 10, 55), kind='moved')
        self.assertIsNone(self.occ(self.get_range().json()))

    def test_no_n_plus_one(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.get_range().status_code, 200)
            return len(ctx.captured_queries)
        base = count()
        room2 = Room.objects.create(name='Sala 2', capacity=10)
        for wd in range(7):
            s = RecurringSchedule.objects.create(class_type=self.sched.class_type, room=room2, weekday=wd,
                                                 is_recurrent=True, start_time=time(18, 0), end_time=time(19, 0),
                                                 capacity_max=10, is_active=True)
            self.book(sched=s, day=self.week()[0] + timedelta(days=wd))
        self.assertEqual(count(), base)

    def test_occurrence_detail_lists_people_and_balance(self):
        self.book()
        r = self.api.get('/api/v1/calendar/occurrence/', {'schedule': self.sched.id, 'date': self.day.isoformat()})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data['attendees']), 1)
        self.assertEqual(data['attendees'][0]['paid_with'], 'credits')
        self.assertEqual(Decimal(data['attendees'][0]['balance']), Decimal('10'))
        self.assertEqual(data['free_seats'], 7)


class CalendarMoveTests(CalendarBase):
    @patch('api.utils.reschedule._notify_change_email')
    @patch('api.utils.push.send_schedule_change_push')
    def test_move_recurring_session_moves_bookings_and_notifies(self, push, email):
        b = self.book()
        new_day = self.day + timedelta(days=1)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.api.post('/api/v1/calendar/occurrence/move/', {
                'schedule': self.sched.id, 'date': self.day.isoformat(),
                'new_date': new_day.isoformat(), 'new_start': '18:00', 'notify': True,
            }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        res = r.json()
        self.assertEqual(res['moved'], 1)
        self.assertEqual(res['notified'], 1)
        email.assert_called_once()
        b.refresh_from_db()
        self.assertEqual(b.occurrence_id, res['schedule_id'])
        self.assertEqual(b.start_datetime, madrid(new_day, 18))
        self.assertEqual(b.end_datetime, madrid(new_day, 18, 55))
        one_off = RecurringSchedule.objects.get(pk=res['schedule_id'])
        self.assertFalse(one_off.is_recurrent)
        self.assertEqual(one_off.start_date, new_day)
        self.assertTrue(ScheduleBlackout.objects.filter(schedule=self.sched, kind='moved').exists())
        data = self.get_range(self.day, new_day).json()
        self.assertIsNone(self.occ(data))
        self.assertEqual(self.occ(data, one_off.id, new_day)['booked'], 1)

        # Deshacer: vuelve a su sitio
        with self.captureOnCommitCallbacks(execute=True):
            r = self.api.post('/api/v1/calendar/occurrence/undo-move/', {'undo': res['undo']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.occurrence_id, self.sched.id)
        self.assertEqual(b.start_datetime, madrid(self.day, 10))
        self.assertFalse(ScheduleBlackout.objects.filter(schedule=self.sched, kind='moved').exists())
        self.assertFalse(RecurringSchedule.objects.filter(pk=one_off.id).exists())

    def test_move_without_notify_sends_nothing(self):
        self.book()
        with patch('api.utils.reschedule._notify_change_email') as email, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.api.post('/api/v1/calendar/occurrence/move/', {
                'schedule': self.sched.id, 'date': self.day.isoformat(), 'new_start': '11:00', 'notify': False,
            }, format='json')
        self.assertEqual(r.status_code, 200)
        email.assert_not_called()

    def test_room_clash_needs_force(self):
        other = RecurringSchedule.objects.create(class_type=self.sched.class_type, room=self.sched.room,
                                                 weekday=1, is_recurrent=True, start_time=time(18, 0),
                                                 end_time=time(19, 0), capacity_max=8, is_active=True)
        payload = {'schedule': self.sched.id, 'date': self.day.isoformat(), 'new_start': '18:30'}
        r = self.api.post('/api/v1/calendar/occurrence/move/', payload, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'room_busy')
        self.assertEqual(r.json()['clash']['schedule_id'], other.id)
        r = self.api.post('/api/v1/calendar/occurrence/move/', {**payload, 'force': True}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_one_off_session_is_edited_in_place(self):
        one = RecurringSchedule.objects.create(class_type=self.sched.class_type, room=self.sched.room,
                                               is_recurrent=False, start_date=self.day, start_time=time(12, 0),
                                               end_time=time(13, 0), capacity_max=8, is_active=True)
        b = self.book(sched=one)
        room2 = Room.objects.create(name='Sala 2', capacity=10)
        r = self.api.post('/api/v1/calendar/occurrence/move/', {
            'schedule': one.id, 'date': self.day.isoformat(), 'new_start': '15:00', 'new_room': room2.id,
            'notify': False}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        one.refresh_from_db()
        self.assertEqual((one.start_time, one.room_id), (time(15, 0), room2.id))
        b.refresh_from_db()
        self.assertEqual(b.start_datetime, madrid(self.day, 15))
        self.assertIsNone(r.json()['undo']['blackout'])
        r = self.api.post('/api/v1/calendar/occurrence/undo-move/', {'undo': r.json()['undo']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        one.refresh_from_db()
        self.assertEqual((one.start_time, one.room_id), (time(12, 0), self.sched.room_id))

    def test_cannot_move_past_session(self):
        past = self.day - timedelta(days=14)
        r = self.api.post('/api/v1/calendar/occurrence/move/', {
            'schedule': self.sched.id, 'date': past.isoformat(), 'new_start': '11:00'}, format='json')
        self.assertEqual(r.status_code, 400)


class CalendarEditTests(CalendarBase):
    def test_this_only_changes_instructor_for_that_day(self):
        b = self.book()
        other = Instructor.objects.create(name='Bea', slug='bea')
        r = self.api.post('/api/v1/calendar/occurrence/edit/', {
            'schedule': self.sched.id, 'date': self.day.isoformat(), 'scope': 'this',
            'changes': {'instructor': other.id, 'capacity_max': 10}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = self.get_range().json()
        o = next(o for o in data['occurrences'] if o['date'] == self.day.isoformat())
        self.assertEqual(o['instructor']['name'], 'Bea')
        self.assertEqual(o['capacity'], 10)
        self.assertEqual(o['booked'], 1)
        b.refresh_from_db()
        self.assertEqual(b.start_datetime, madrid(self.day, 10))
        # La semana siguiente sigue igual
        nxt = self.occ(self.get_range(self.day + timedelta(days=7), self.day + timedelta(days=7)).json(),
                       d=self.day + timedelta(days=7))
        self.assertEqual(nxt['instructor']['name'], 'Ana')

    def test_following_splits_series_even_without_time_change(self):
        b_now = self.book()
        later = self.day + timedelta(days=7)
        b_later = self.book(day=later, user=make_client('l@test.local'))
        other = Instructor.objects.create(name='Bea', slug='bea')
        r = self.api.post('/api/v1/calendar/occurrence/edit/', {
            'schedule': self.sched.id, 'date': later.isoformat(), 'scope': 'following',
            'changes': {'instructor': other.id}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.sched.refresh_from_db()
        self.assertEqual(self.sched.end_date, later - timedelta(days=1))
        new = RecurringSchedule.objects.get(pk=r.json()['schedule_id'])
        self.assertEqual((new.start_date, new.override_instructor_id, new.start_time),
                         (later, other.id, time(10, 0)))
        b_now.refresh_from_db()
        b_later.refresh_from_db()
        self.assertEqual(b_now.occurrence_id, self.sched.id)
        self.assertEqual(b_later.occurrence_id, new.id)

    @patch('api.utils.reschedule._notify_change_email')
    def test_following_with_new_time_moves_bookings(self, email):
        b = self.book()
        r = self.api.post('/api/v1/calendar/occurrence/edit/', {
            'schedule': self.sched.id, 'date': self.day.isoformat(), 'scope': 'following',
            'changes': {'start_time': '18:00'}, 'existing_bookings': 'move'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.start_datetime, madrid(self.day, 18))
        new = RecurringSchedule.objects.get(pk=r.json()['schedule_id'])
        self.assertEqual(new.end_time, time(18, 55))
        # Era la primera sesión: la regla vieja (sin sesiones ni reservas) se borra
        self.assertFalse(RecurringSchedule.objects.filter(pk=self.sched.id, end_date__isnull=True).exists())


class CalendarCancelTests(CalendarBase):
    def cancel(self, **extra):
        with self.captureOnCommitCallbacks(execute=True):
            return self.api.post('/api/v1/calendar/occurrence/cancel/', {
                'schedule': self.sched.id, 'date': self.day.isoformat(), **extra}, format='json')

    @patch('api.utils.emailing.send_templated_email', return_value=True)
    def test_cancel_this_returns_credits_and_notifies(self, send):
        b = self.book()
        before = balance(self.client_user)
        r = self.cancel(refund='credits', notify=True)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['cancelled'], 1)
        self.assertEqual(r.json()['refunded_credits'], 1)
        self.assertEqual(balance(self.client_user), before + 1)
        b.refresh_from_db()
        self.assertEqual(b.status, 'canceled')
        self.assertEqual(send.call_count, 1)
        o = self.occ(self.get_range().json())
        self.assertTrue(o['canceled'])
        # «Deshacer» justo después: vuelve la reserva y se anula la devolución
        with self.captureOnCommitCallbacks(execute=True):
            r = self.api.post('/api/v1/calendar/occurrence/reactivate/', {
                'schedule': self.sched.id, 'date': self.day.isoformat(), 'restore_bookings': True}, format='json')
        self.assertEqual(r.json()['restored'], 1)
        b.refresh_from_db()
        self.assertEqual(b.status, 'reserved')
        self.assertEqual(balance(self.client_user), before)
        self.assertEqual(send.call_count, 2)  # «tu clase sigue en pie»
        self.cancel(refund='credits', notify=False)
        # Reactivar más tarde: vuelve a estar disponible (las reservas no se rehacen)
        r = self.api.post('/api/v1/calendar/occurrence/reactivate/',
                          {'schedule': self.sched.id, 'date': self.day.isoformat()}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(self.occ(self.get_range().json())['canceled'])

    def test_cancel_without_refund(self):
        self.book()
        before = balance(self.client_user)
        r = self.cancel(refund='none', notify=False)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(balance(self.client_user), before)

    def test_free_bookings_get_nothing_back(self):
        self.book(no_charge=True)
        before = balance(self.client_user)
        self.cancel(refund='credits', notify=False)
        self.assertEqual(balance(self.client_user), before)

    def _stripe(self):
        client = MagicMock()
        client.v1.payment_intents.retrieve.return_value = {'amount_received': 1500, 'latest_charge': {'amount_refunded': 0}}
        return client

    def _card_payment(self, **who):
        return Payment.objects.create(amount_eur=Decimal('15'), method='stripe', status='succeeded',
                                      stripe_payment_intent_id='pi_test_1', currency='EUR', **who)

    def test_cancel_money_refunds_card_bookings_with_stripe(self):
        self.sched.price_eur_override = Decimal('15')
        self.sched.save()
        guest = GuestProfile.objects.create(name='Invitada', email='inv@test.local')
        self.book(guest=guest, payment=self._card_payment(guest=guest))
        card_user = make_client('card@test.local', credits=0)
        self.book(user=card_user, payment=self._card_payment(user=card_user))
        credit_user_before = balance(self.client_user)
        self.book()
        stripe = self._stripe()
        with patch('api.utils.payments.stripe_client', return_value=stripe):
            r = self.cancel(refund='money', notify=False)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['refunded_card'], 2)
        self.assertEqual(r.json()['refunded_credits'], 1)
        self.assertEqual(stripe.v1.refunds.create.call_count, 2)
        self.assertEqual(stripe.v1.refunds.create.call_args.kwargs['params']['amount'], 1500)
        self.assertEqual(balance(self.client_user), credit_user_before + 1)

    def test_cancel_credits_still_refunds_guests_by_card(self):
        self.sched.price_eur_override = Decimal('15')
        self.sched.save()
        guest = GuestProfile.objects.create(name='Invitada', email='inv@test.local')
        self.book(guest=guest, payment=self._card_payment(guest=guest))
        stripe = self._stripe()
        with patch('api.utils.payments.stripe_client', return_value=stripe):
            r = self.cancel(refund='credits', notify=False)
        self.assertEqual(r.json()['refunded_card'], 1)

    def test_cancel_following_ends_the_series(self):
        later = self.day + timedelta(days=7)
        b1 = self.book()
        b2 = self.book(day=later, user=make_client('x@test.local'))
        r = self.cancel(scope='following', refund='credits', notify=False)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['cancelled'], 2)
        self.sched.refresh_from_db()
        self.assertEqual(self.sched.end_date, self.day - timedelta(days=1))
        for b in (b1, b2):
            b.refresh_from_db()
            self.assertEqual(b.status, 'canceled')


class CalendarPeopleTests(CalendarBase):
    def test_check_in_toggle(self):
        b = self.book()
        r = self.api.post(f'/api/v1/calendar/bookings/{b.id}/check-in/', {'attended': True}, format='json')
        self.assertEqual(r.json()['status'], 'attended')
        r = self.api.post(f'/api/v1/calendar/bookings/{b.id}/check-in/', {'attended': False}, format='json')
        self.assertEqual(r.json()['status'], 'reserved')
        r = self.api.post(f'/api/v1/calendar/bookings/{b.id}/check-in/', {'no_show': True}, format='json')
        self.assertEqual(r.json()['status'], 'no_show')
        b.status = 'canceled'
        b.save()
        r = self.api.post(f'/api/v1/calendar/bookings/{b.id}/check-in/', {'attended': True}, format='json')
        self.assertEqual(r.status_code, 400)

    def add(self, user, **extra):
        with self.captureOnCommitCallbacks(execute=True):
            return self.api.post('/api/v1/calendar/occurrence/add-client/', {
                'schedule': self.sched.id, 'date': self.day.isoformat(), 'user': user.id, **extra}, format='json')

    def test_add_client_with_credits_then_remove(self):
        before = balance(self.client_user)
        r = self.add(self.client_user, charge='credits')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(balance(self.client_user), before - 1)
        b = Booking.objects.get(pk=r.json()['booking_id'])
        self.assertEqual(b.start_datetime, madrid(self.day, 10))
        self.assertEqual(self.add(self.client_user).json()['code'], 'already_booked')
        r = self.api.post(f'/api/v1/calendar/bookings/{b.id}/remove/', {'refund': 'credits'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(balance(self.client_user), before)

    def test_add_client_without_credits(self):
        poor = make_client('poor@test.local', credits=0)
        r = self.add(poor, charge='credits')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'insufficient_credits')
        r = self.add(poor, charge='free')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Booking.objects.get(pk=r.json()['booking_id']).metadata['no_charge'])

    def test_add_client_to_full_class(self):
        self.sched.capacity_max = 1
        self.sched.save()
        self.book(user=make_client('first@test.local'))
        r = self.add(self.client_user)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'full')
        self.assertEqual(self.add(self.client_user, force=True).status_code, 200)

    @patch('api.utils.emailing.send_templated_email', return_value=True)
    def test_notify_attendees(self, send):
        self.book()
        self.book(user=make_client('b@test.local'))
        r = self.api.post('/api/v1/calendar/occurrence/notify/', {
            'schedule': self.sched.id, 'date': self.day.isoformat(), 'message': 'Traed calcetines'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['people'], 2)
        self.assertEqual(send.call_count, 2)
        r = self.api.post('/api/v1/calendar/occurrence/notify/', {
            'schedule': self.sched.id, 'date': self.day.isoformat(), 'message': ''}, format='json')
        self.assertEqual(r.status_code, 400)


class ApplyFromStillWorksTests(CalendarBase):
    def test_apply_from_endpoint_uses_shared_logic(self):
        later = self.day + timedelta(days=7)
        r = self.api.post(f'/api/v1/recurrences/{self.sched.id}/apply_from/', {
            'effective_date': later.isoformat(), 'changes': {'capacity_max': 12}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['new_schedule']['capacity_max'], 12)
        self.sched.refresh_from_db()
        self.assertEqual(self.sched.end_date, later - timedelta(days=1))
        self.assertEqual(User.objects.filter(is_staff=True).count(), 1)
