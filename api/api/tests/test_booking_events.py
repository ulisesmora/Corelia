"""Reserva con créditos (validación de la sesión) y eventos sueltos («E_…»)
en todas las rutas: créditos, tarjeta (invitado y con cuenta), pagar en el
estudio, cancelar/devolver y el horario público."""
from datetime import timedelta, timezone as dt_tz
from decimal import Decimal
from unittest import mock

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Booking, CreditLedgerEntry, Event, Payment, ScheduleBlackout, WaitlistEntry,
)
from api.tests.factories import madrid, make_admin, make_client
from api.tests.test_guest_checkout import GuestCheckoutBase, fake_stripe

RESERVE_CREDITS = '/api/v1/checkout/reserve/'
CREATE = '/api/v1/checkout/create-session/'
GUEST_RESERVE = '/api/v1/checkout/guest-reserve/'


def z(dt):
    return dt.astimezone(dt_tz.utc).isoformat().replace('+00:00', 'Z')


class EventBase(GuestCheckoutBase):
    def setUp(self):
        super().setUp()
        ct = self.sched.class_type
        start = madrid(self.day, 12)
        # Mismo id que la clase del horario a propósito: antes se reservaba la clase
        self.event = Event.objects.create(
            id=self.sched.id, title='Taller de respiración', slug='taller', category=ct.category,
            class_type=ct, room=self.sched.room, start_datetime=start, end_datetime=start + timedelta(hours=2),
            capacity_max=3, price_credits=Decimal('2'), price_eur=Decimal('25'),
        )

    def event_item(self, event=None, start=None):
        event = event or self.event
        return {
            'id': f'E_{event.id}', 'id_source': event.id, 'title': event.title, 'credits': 2, 'price': 25,
            'sessionDate': z(start or event.start_datetime), 'sessionDateEnd': z(event.end_datetime),
        }

    def client_api(self, credits=10, email='clara@test.local'):
        user = make_client(email=email, credits=credits)
        c = APIClient()
        c.force_authenticate(user)
        return user, c

    def fill_event(self, n):
        for i in range(n):
            u = make_client(email=f'ev{i}@test.local', credits=0)
            Booking.objects.create(user=u, event=self.event, start_datetime=self.event.start_datetime,
                                   end_datetime=self.event.end_datetime, status='reserved')


class CreditsSlotValidationTests(EventBase):
    def test_rejects_times_that_are_not_a_session(self):
        user, c = self.client_api()
        wrong = {**self.item(), 'sessionDate': z(madrid(self.day, 8, 28))}
        r = c.post(RESERVE_CREDITS, {'cart_items': [wrong]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'bad_slot'))
        other_day = self.item(day=self.day + timedelta(days=1))
        r = c.post(RESERVE_CREDITS, {'cart_items': [other_day]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'bad_slot'))
        self.assertFalse(Booking.objects.exists())
        self.assertEqual(user.wallet.balance, Decimal('10'))

    def test_rejects_started_inactive_and_blocked_sessions(self):
        user, c = self.client_api()
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.item(day=self.day - timedelta(days=14))]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'past'))
        ScheduleBlackout.objects.create(schedule=None, start_datetime=madrid(self.day, 0),
                                        end_datetime=madrid(self.day, 23, 59), kind='vacation')
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'blocked'))
        ScheduleBlackout.objects.all().delete()
        self.sched.is_active = False
        self.sched.save()
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Booking.objects.exists())

    def test_waitlist_offers_count_for_capacity_except_her_own(self):
        self.fill(self.sched, 7)  # 7/8
        bea = make_client(email='bea@test.local', credits=0)
        start = madrid(self.day, 10)
        offer = WaitlistEntry.objects.create(schedule=self.sched, start_datetime=start, user=bea, status='offered',
                                             offered_at=timezone.now(),
                                             offer_expires_at=timezone.now() + timedelta(hours=2))
        user, c = self.client_api()
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'class_full'))
        # A quien se le ofreció la plaza sí puede quedársela
        CreditLedgerEntry.objects.create(wallet=bea.wallet, kind='grant', amount=5, reference='t')
        cb = APIClient()
        cb.force_authenticate(bea)
        r = cb.post(RESERVE_CREDITS, {'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        offer.refresh_from_db()

    def test_books_the_real_session_time_and_blocks_duplicates(self):
        user, c = self.client_api()
        item = {**self.item(), 'sessionDate': z(madrid(self.day, 10)).replace('Z', '.123Z')}
        r = c.post(RESERVE_CREDITS, {'cart_items': [item]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        b = Booking.objects.get(user=user)
        self.assertEqual(b.start_datetime, madrid(self.day, 10))  # sin los milisegundos del navegador
        self.assertEqual(b.end_datetime, madrid(self.day, 10, 55))
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'already_booked'))
        self.assertIn('Ya tienes una reserva', r.json()['error'])

    def test_insufficient_credits_creates_nothing(self):
        user, c = self.client_api(credits=1)
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.item(), self.item(self.sched2, 18)]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'insufficient_credits'))
        self.assertFalse(Booking.objects.exists())


class EventCreditsTests(EventBase):
    def test_client_books_event_with_its_credit_cost(self):
        user, c = self.client_api(credits=10)
        with mock.patch('api.signals.send_templated_email', return_value=True) as send, \
                self.captureOnCommitCallbacks(execute=True):
            r = c.post(RESERVE_CREDITS, {'cart_items': [self.event_item(), self.item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(str(r.json()['credits_spent'])), Decimal('3'))  # 2 del evento + 1 de la clase
        ev = Booking.objects.get(user=user, event__isnull=False)
        self.assertEqual((ev.event_id, ev.occurrence_id), (self.event.id, None))
        self.assertEqual(ev.start_datetime, self.event.start_datetime)
        cls = Booking.objects.get(user=user, occurrence__isnull=False)
        self.assertEqual(cls.occurrence_id, self.sched.id)
        user.wallet.refresh_from_db()
        self.assertEqual(user.wallet.balance, Decimal('7'))
        # El email de «clase reservada» incluye el evento (antes fallaba con occurrence=None)
        titles = [l['clase'] for l in send.call_args.kwargs['dynamic_data']['bookings_list']]
        self.assertIn('Taller de respiración', titles)

    def test_event_checks(self):
        user, c = self.client_api()
        wrong = self.event_item(start=self.event.start_datetime + timedelta(hours=1))
        r = c.post(RESERVE_CREDITS, {'cart_items': [wrong]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'bad_slot'))
        self.fill_event(3)
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.event_item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['waitlist']), (400, 'class_full', False))
        Booking.objects.all().delete()
        self.event.status = 'canceled'
        self.event.save()
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.event_item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'inactive'))
        self.event.status = 'scheduled'
        self.event.save()
        ScheduleBlackout.objects.create(schedule=None, start_datetime=madrid(self.day, 0),
                                        end_datetime=madrid(self.day, 23, 59), kind='vacation')
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.event_item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'blocked'))
        self.assertFalse(Booking.objects.exists())

    def test_client_cancels_event_and_gets_credits_back(self):
        user, c = self.client_api(credits=10)
        self.event.start_datetime = timezone.now() + timedelta(days=3)
        self.event.end_datetime = self.event.start_datetime + timedelta(hours=1)
        self.event.save()
        r = c.post(RESERVE_CREDITS, {'cart_items': [self.event_item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        b = Booking.objects.get(user=user)
        r = c.post(f'/api/v1/bookings/{b.id}/cancel/')
        self.assertEqual(r.status_code, 200, r.content)  # antes: 501
        b.refresh_from_db()
        self.assertEqual(b.status, 'canceled')
        user.wallet.refresh_from_db()
        self.assertEqual(user.wallet.balance, Decimal('10'))

    def test_studio_removes_event_booking_with_refund(self):
        user, c = self.client_api(credits=10)
        c.post(RESERVE_CREDITS, {'cart_items': [self.event_item()]}, format='json')
        b = Booking.objects.get(user=user)
        admin = APIClient()
        admin.force_authenticate(make_admin())
        r = admin.post(f'/api/v1/calendar/bookings/{b.id}/remove/', {'refund': 'credits'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['refunded_credits'], 1)
        user.wallet.refresh_from_db()
        self.assertEqual(user.wallet.balance, Decimal('10'))


class EventCardAndStudioTests(EventBase):
    def post_card(self, c, body, stripe_client=None):
        with mock.patch('api.utils.payments.stripe_client', return_value=stripe_client or fake_stripe()), \
                mock.patch('api.utils.payments.current_stripe_account', return_value=''):
            return c.post(CREATE, body, format='json')

    def test_guest_pays_event_by_card_and_webhook_confirms_it(self):
        stripe_client = fake_stripe()
        r = self.post_card(self.c, {**self.guest(), 'cart_items': [self.event_item()]}, stripe_client)
        self.assertEqual(r.status_code, 201, r.content)
        params = stripe_client.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['line_items'][0]['price_data']['unit_amount'], 2500)
        self.assertIn('Taller de respiración', params['line_items'][0]['price_data']['product_data']['name'])
        b = Booking.objects.get()
        self.assertEqual((b.event_id, b.occurrence_id, b.status), (self.event.id, None, 'pending'))
        pay = Payment.objects.get()
        from api.views import StripeWebhookView
        view = StripeWebhookView()
        view.stripe_account = ''
        with mock.patch('api.utils.booking_notify.notify_booking_confirmation'), \
                mock.patch('api.signals.send_templated_email', return_value=True) as send:
            view._fulfill_booking_purchase({'metadata': {'local_payment_id': pay.id}, 'payment_intent': 'pi_1',
                                            'amount_total': 2500, 'currency': 'eur'})
        b.refresh_from_db()
        self.assertEqual(b.status, 'reserved')
        self.assertEqual(send.call_args.kwargs['dynamic_data']['bookings_list'][0]['clase'], 'Taller de respiración')

    def test_webhook_refunds_event_that_filled_up_while_paying(self):
        self.post_card(self.c, {**self.guest(), 'cart_items': [self.event_item()]})
        self.fill_event(3)
        pay = Payment.objects.get()
        from api.views import StripeWebhookView
        view = StripeWebhookView()
        view.stripe_account = ''
        with mock.patch.object(StripeWebhookView, '_issue_stripe_refund') as refund, \
                mock.patch.object(StripeWebhookView, '_notify_unconfirmed_bookings'), \
                mock.patch('api.signals.send_templated_email', return_value=True), \
                self.captureOnCommitCallbacks(execute=True):
            view._fulfill_booking_purchase({'metadata': {'local_payment_id': pay.id}, 'payment_intent': 'pi_1',
                                            'amount_total': 2500, 'currency': 'eur'})
        self.assertEqual(Booking.objects.get(payment=pay).status, 'canceled')
        self.assertEqual(refund.call_args.args[1], 2500)

    def test_registered_client_pays_class_and_event_by_card(self):
        user, c = self.client_api(credits=0)
        stripe_client = fake_stripe()
        r = self.post_card(c, {'cart_items': [self.event_item(), self.item()]}, stripe_client)
        self.assertEqual(r.status_code, 201, r.content)
        pay = Payment.objects.get()
        self.assertEqual((pay.user_id, pay.guest_id, pay.amount_eur), (user.id, None, Decimal('39.00')))
        self.assertEqual(Booking.objects.filter(user=user, payment=pay, status='pending').count(), 2)
        params = stripe_client.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(params['customer_email'], user.email)
        from api.views import StripeWebhookView
        view = StripeWebhookView()
        view.stripe_account = ''
        with mock.patch('api.utils.booking_notify.notify_booking_confirmation'), \
                mock.patch('api.signals.send_templated_email', return_value=True) as send:
            view._fulfill_booking_purchase({'metadata': {'local_payment_id': pay.id}, 'payment_intent': 'pi_2',
                                            'amount_total': 3900, 'currency': 'eur'})
        self.assertEqual(Booking.objects.filter(user=user, status='reserved').count(), 2)
        # Recibo de reservas, no el de «compra de créditos»
        templates = [call.kwargs['template_id'] for call in send.call_args_list]
        self.assertIn('booking-guest', templates)
        self.assertNotIn('plan-purchase', templates)

    @mock.patch('api.utils.emailing.send_templated_email', return_value=True)
    def test_guest_reserves_event_to_pay_at_the_studio(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.c.post(GUEST_RESERVE, {**self.guest(), 'cart_items': [self.event_item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['total'], r.json()['bookings'][0]['kind']), ('25.00', 'event'))
        b = Booking.objects.get()
        self.assertEqual((b.event_id, b.occurrence_id, b.status), (self.event.id, None, 'reserved'))
        self.assertEqual(b.metadata['price'], '25.00')
        self.assertIn('Taller de respiración', send.call_args.kwargs['dynamic_data']['intro_copy'])


class PublicScheduleEventTests(EventBase):
    def test_events_are_listed_in_studio_time_and_inactive_ones_hidden(self):
        hidden = Event.objects.create(
            title='Oculto', slug='oculto', category=self.event.category, class_type=self.event.class_type,
            room=self.event.room, start_datetime=self.event.start_datetime + timedelta(hours=3),
            end_datetime=self.event.start_datetime + timedelta(hours=4), is_active=False,
        )
        d = self.day.isoformat()
        r = self.c.get(f'/api/v1/schedule/schedule/?start_date={d}&end_date={d}')
        self.assertEqual(r.status_code, 200)
        events = [e for e in r.json() if e['type'] == 'EVENT']
        self.assertEqual([e['source_id'] for e in events], [self.event.id])
        self.assertEqual(events[0]['start_datetime'], f'{d}T12:00:00')  # hora del estudio, sin zona
        self.assertEqual(events[0]['available_seats'], 3)
        self.assertNotIn(hidden.id, [e['source_id'] for e in events])
