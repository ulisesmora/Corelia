"""Reservar como invitada (sin cuenta): pago con tarjeta (create-session) y
«pagar en el estudio» (guest-reserve) cuando el estudio no cobra online."""
from datetime import time, timedelta
from decimal import Decimal
from unittest import mock

import stripe
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Booking, GuestProfile, Payment, RecurringSchedule
from api.tests.factories import StudioTestCase, madrid, make_client, make_studio, next_weekday

CREATE = '/api/v1/checkout/create-session/'
RESERVE = '/api/v1/checkout/guest-reserve/'


def fake_stripe(secret='cs_test_secret_123'):
    client = mock.MagicMock()
    client.v1.checkout.sessions.create.return_value = mock.MagicMock(id='cs_test_1', client_secret=secret)
    return client


class GuestCheckoutBase(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio(weekday=2, start=time(10, 0), end=time(10, 55))
        ct = self.sched.class_type
        ct.default_price_eur = Decimal('14.00')
        ct.save()
        # Una segunda clase el mismo día, para carritos de varias clases
        self.sched2 = RecurringSchedule.objects.create(
            class_type=ct, room=self.sched.room, weekday=2, is_recurrent=True,
            start_time=time(18, 0), end_time=time(18, 55), capacity_min=1, capacity_max=8, is_active=True,
        )
        self.day = next_weekday(2)
        self.c = APIClient()

    def item(self, sched=None, hour=10, day=None):
        sched = sched or self.sched
        start = madrid(day or self.day, hour)
        return {
            'id': f'R_{sched.id}_{(day or self.day).isoformat()}',
            'id_source': sched.id, 'title': 'Mat', 'credits': 1, 'price': 14,
            'sessionDate': start.isoformat().replace('+00:00', 'Z'),
            'sessionDateEnd': (start + timedelta(minutes=55)).isoformat().replace('+00:00', 'Z'),
        }

    def guest(self, **extra):
        return {'email': 'Invitada@Example.com', 'name': 'Inés Invitada', 'phone': '+34 600 111 222', **extra}

    def fill(self, sched, n):
        start = madrid(self.day, sched.start_time.hour)
        for i in range(n):
            u = make_client(email=f'llena{sched.id}-{i}@test.local', credits=0)
            Booking.objects.create(user=u, occurrence=sched, start_datetime=start,
                                   end_datetime=start + timedelta(minutes=55), status='reserved')


class CardCheckoutTests(GuestCheckoutBase):
    def post(self, body, client=None):
        with mock.patch('api.utils.payments.stripe_client', return_value=client or fake_stripe()), \
                mock.patch('api.utils.payments.current_stripe_account', return_value=''):
            return self.c.post(CREATE, body, format='json')

    def test_creates_guest_payment_and_pending_bookings_for_several_classes(self):
        stripe_client = fake_stripe()
        r = self.post({**self.guest(), 'cart_items': [self.item(), self.item(self.sched2, 18)]}, stripe_client)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['clientSecret'], 'cs_test_secret_123')
        guest = GuestProfile.objects.get()
        self.assertEqual(guest.email, 'invitada@example.com')
        self.assertEqual(guest.name, 'Inés Invitada')
        pay = Payment.objects.get()
        self.assertEqual((pay.guest_id, pay.status, pay.amount_eur), (guest.id, 'pending', Decimal('28.00')))
        self.assertEqual(Booking.objects.filter(guest=guest, payment=pay, status='pending').count(), 2)
        params = stripe_client.v1.checkout.sessions.create.call_args.kwargs['params']
        self.assertEqual(len(params['line_items']), 2)
        self.assertEqual(params['line_items'][0]['price_data']['unit_amount'], 1400)
        self.assertIn('10:00', params['line_items'][0]['price_data']['product_data']['name'])
        self.assertEqual(params['metadata'], {'local_payment_id': pay.id})
        self.assertNotIn('discounts', params)  # antes iba discounts=None

    def test_full_second_class_leaves_no_orphan_payment_or_bookings(self):
        self.fill(self.sched2, 8)
        r = self.post({**self.guest(), 'cart_items': [self.item(), self.item(self.sched2, 18)]})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'class_full')
        self.assertFalse(Payment.objects.exists())
        self.assertFalse(Booking.objects.filter(guest__isnull=False).exists())

    def test_stripe_error_rolls_back(self):
        client = fake_stripe()
        client.v1.checkout.sessions.create.side_effect = stripe.APIConnectionError('caído')
        r = self.post({**self.guest(), 'cart_items': [self.item()]}, client)
        self.assertEqual(r.status_code, 502)
        self.assertFalse(Payment.objects.exists())
        self.assertFalse(Booking.objects.exists())

    def test_reuses_soft_deleted_guest_with_same_email(self):
        old = GuestProfile.objects.create(email='invitada@example.com', name='Antigua')
        old.deleted_at = timezone.now()
        old.save()
        r = self.post({**self.guest(), 'cart_items': [self.item()]})
        self.assertEqual(r.status_code, 201, r.content)  # antes: 500 (email único)
        old.refresh_from_db()
        self.assertIsNone(old.deleted_at)
        self.assertEqual(old.name, 'Inés Invitada')
        self.assertEqual(GuestProfile.all_objects.count(), 1)

    def test_name_is_optional(self):
        r = self.post({'email': 'sin.nombre@example.com', 'cart_items': [self.item()]})
        self.assertEqual(r.status_code, 201, r.content)  # antes: 500 (name NOT NULL)
        self.assertEqual(GuestProfile.objects.get().name, 'sin.nombre')

    def test_invalid_email_past_session_and_events_are_rejected(self):
        r = self.post({**self.guest(email='no-es-email'), 'cart_items': [self.item()]})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'guest_email'))
        past = self.item(day=self.day - timedelta(days=14))
        r = self.post({**self.guest(), 'cart_items': [past]})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'past'))
        r = self.post({**self.guest(), 'cart_items': [{**self.item(), 'id': 'E_999', 'id_source': 999}]})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'not_found'))
        self.assertFalse(Payment.objects.exists())

    def test_without_online_payments_says_so(self):
        r = self.c.post(CREATE, {**self.guest(), 'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()['code'], 'payments_disabled')

    def test_webhook_confirms_guest_bookings(self):
        r = self.post({**self.guest(), 'cart_items': [self.item(), self.item(self.sched2, 18)]})
        self.assertEqual(r.status_code, 201)
        pay = Payment.objects.get()
        from api.views import StripeWebhookView
        view = StripeWebhookView()
        view.stripe_account = ''
        with mock.patch('api.utils.booking_notify.notify_booking_confirmation'), \
                mock.patch('api.signals.send_templated_email', return_value=True):
            view._fulfill_booking_purchase({'metadata': {'local_payment_id': pay.id}, 'payment_intent': 'pi_1',
                                            'amount_total': 2800, 'currency': 'eur'})
        pay.refresh_from_db()
        self.assertEqual(pay.status, 'succeeded')
        self.assertEqual(Booking.objects.filter(payment=pay, status='reserved').count(), 2)


class PayAtStudioTests(GuestCheckoutBase):
    @mock.patch('api.utils.emailing.send_templated_email', return_value=True)
    def test_guest_reserves_several_classes_and_pays_at_the_studio(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [self.item(), self.item(self.sched2, 18)]},
                            format='json')
        self.assertEqual(r.status_code, 201, r.content)
        data = r.json()
        self.assertTrue(data['pay_at_studio'])
        self.assertEqual((data['total'], data['currency']), ('28.00', 'EUR'))
        self.assertEqual(len(data['bookings']), 2)
        guest = GuestProfile.objects.get()
        bookings = Booking.objects.filter(guest=guest)
        self.assertEqual(bookings.filter(status='reserved', payment__isnull=True).count(), 2)
        self.assertEqual(bookings.first().metadata['pay_at_studio'], True)
        self.assertEqual(bookings.first().metadata['price'], '14.00')
        self.assertFalse(Payment.objects.exists())  # no ensucia las ventas
        send.assert_called_once()
        self.assertEqual(send.call_args.kwargs['to_email'], 'invitada@example.com')
        self.assertIn('en el estudio', send.call_args.kwargs['dynamic_data']['intro_copy'])

    def test_counts_for_capacity_and_blocks_duplicates(self):
        self.fill(self.sched, 7)
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        # La misma invitada otra vez en la misma sesión
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'already_booked'))
        # Otra persona: ya está llena (8/8)
        r = self.c.post(RESERVE, {**self.guest(email='otra@example.com'), 'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'class_full'))
        self.assertEqual(Booking.objects.filter(guest__isnull=False).count(), 1)

    def test_not_available_when_the_studio_charges_online(self):
        with mock.patch('api.utils.payments.payments_enabled', return_value=True):
            r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [self.item()]}, format='json')
        # Automático: con tarjeta en la web no se paga en el estudio (antes code='pay_online')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['card']), (409, 'pay_at_studio_disabled', True))
        self.assertFalse(Booking.objects.exists())

    def test_rejects_times_that_are_not_a_session_of_the_class(self):
        wrong_hour = {**self.item(), 'sessionDate': madrid(self.day, 8, 28).isoformat()}
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [wrong_hour]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'bad_slot'))
        wrong_day = self.item(day=self.day + timedelta(days=1))
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [wrong_day]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'bad_slot'))
        self.assertFalse(Booking.objects.exists())

    def test_rejects_bad_carts(self):
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': []}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'empty_cart'))
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [{**self.item(), 'id_source': 999999}]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'not_found'))
        r = self.c.post(RESERVE, {'email': '', 'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'guest_email'))
        self.assertFalse(GuestProfile.objects.exists())

    def test_expired_token_does_not_block_guests(self):
        self.c.credentials(HTTP_AUTHORIZATION='Bearer token-caducado')
        r = self.c.post(RESERVE, {**self.guest(), 'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
