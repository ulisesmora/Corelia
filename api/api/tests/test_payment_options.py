"""«Formas de cobro» (Ajustes → Cobros): lo que la web ofrece y lo que cada
ruta de pago acepta según los interruptores de SiteConfig
(api/utils/payment_options.py), y las clases fijas como herramienta del
estudio (los clientes solo las eligen si el estudio lo enciende)."""
from datetime import time, timedelta
from decimal import Decimal
from unittest import mock

from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Booking, Payment, Plan, SiteConfig, UserClassPreference
from api.tests.factories import StudioTestCase, madrid, make_admin, make_client, make_studio, next_weekday

PUBLIC = '/api/v1/site-config/public/'
ADMIN = '/api/v1/site-config/'
GUEST_RESERVE = '/api/v1/checkout/guest-reserve/'
STUDIO_RESERVE = '/api/v1/checkout/studio-reserve/'
CARD = '/api/v1/checkout/create-session/'
PLAN = '/api/v1/checkout/pay-plan/'
CREDITS = '/api/v1/checkout/reserve/'
SALES = '/api/v1/dashboard/sales/'
ACTIONS = '/api/v1/dashboard/actions/'


def set_cfg(**fields):
    cfg = SiteConfig.load()
    for k, v in fields.items():
        setattr(cfg, k, v)
    cfg.save()


def online(on=True):
    """Stripe listo (o no) para cobrar: lo que miran la web y las rutas."""
    return mock.patch('api.utils.payments.payments_enabled', return_value=on)


def fake_stripe():
    client = mock.MagicMock()
    client.v1.checkout.sessions.create.return_value = mock.MagicMock(id='cs_test_1', client_secret='cs_secret')
    return client


class Base(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio(weekday=3, start=time(9, 0), end=time(9, 55))
        ct = self.sched.class_type
        ct.default_price_eur = Decimal('15.00')
        ct.save()
        self.day = next_weekday(3)
        self.c = APIClient()

    def item(self):
        start = madrid(self.day, 9)
        return {
            'id': f'R_{self.sched.id}_{self.day.isoformat()}', 'id_source': self.sched.id, 'title': 'Mat',
            'credits': 1, 'price': 15, 'sessionDate': start.isoformat().replace('+00:00', 'Z'),
            'sessionDateEnd': (start + timedelta(minutes=55)).isoformat().replace('+00:00', 'Z'),
        }

    def guest(self):
        return {'email': 'ines@example.com', 'name': 'Inés', 'phone': '+34 600 111 222', 'cart_items': [self.item()]}

    def public_options(self, on=False):
        with online(on):
            return self.c.get(PUBLIC).json()['payment_options']


class PublicOptionsTests(Base):
    def test_defaults_without_online_payments_keep_pay_at_studio_for_guests(self):
        o = self.public_options(on=False)
        self.assertEqual((o['card'], o['drop_in_online'], o['packs_online'], o['memberships_online']),
                         (False, False, False, False))
        self.assertEqual(o['pay_at_studio'], {'guests': True, 'clients': False})
        self.assertTrue(o['guest_booking'])
        self.assertTrue(o['credits'])
        self.assertFalse(o['client_fixed_classes'])
        self.assertEqual((o['studio_methods'], o['studio_note']), ([], ''))

    def test_defaults_with_online_payments_sell_everything_by_card_and_no_pay_at_studio(self):
        o = self.public_options(on=True)
        self.assertEqual((o['card'], o['drop_in_online'], o['packs_online'], o['memberships_online']),
                         (True, True, True, True))
        self.assertEqual(o['pay_at_studio'], {'guests': False, 'clients': False})

    def test_card_switched_off_turns_automatic_pay_at_studio_on_and_hides_online_products(self):
        set_cfg(online_card_enabled=False)
        with online(True):
            data = self.c.get(PUBLIC).json()
        o = data['payment_options']
        self.assertFalse(data['payments_enabled'])
        self.assertEqual(data['stripe_publishable_key'], '')
        self.assertEqual((o['card'], o['packs_online']), (False, False))
        self.assertEqual(o['pay_at_studio'], {'guests': True, 'clients': False})

    def test_explicit_switches_and_methods(self):
        set_cfg(pay_at_studio_enabled=True, pay_at_studio_clients=True, pay_at_studio_guests=False,
                sell_packs_online=False, studio_payment_methods=['bizum', 'cash'],
                studio_payment_note='Paga al llegar, 5 min antes')
        o = self.public_options(on=True)
        self.assertEqual(o['pay_at_studio'], {'guests': False, 'clients': True})
        self.assertEqual((o['packs_online'], o['memberships_online'], o['drop_in_online']), (False, True, True))
        self.assertEqual(o['studio_methods'], ['bizum', 'cash'])
        self.assertEqual(o['studio_note'], 'Paga al llegar, 5 min antes')

    def test_guest_booking_off_also_turns_off_pay_at_studio_for_guests(self):
        set_cfg(guest_booking_enabled=False, pay_at_studio_enabled=True)
        o = self.public_options(on=False)
        self.assertFalse(o['guest_booking'])
        self.assertEqual(o['pay_at_studio']['guests'], False)


class AdminSettingsTests(Base):
    def setUp(self):
        super().setUp()
        self.c.force_authenticate(make_admin())

    def test_patch_round_trip_and_effective_options(self):
        r = self.c.patch(ADMIN, {
            'pay_at_studio_enabled': True, 'pay_at_studio_clients': True,
            'studio_payment_methods': ['Cash', 'bizum', 'cash'], 'studio_payment_note': '  Paga   al llegar ',
            'sell_memberships_online': False, 'client_fixed_classes': True,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['studio_payment_methods'], ['cash', 'bizum'])
        self.assertEqual(data['studio_payment_note'], 'Paga al llegar')
        self.assertTrue(data['client_fixed_classes'])
        self.assertEqual(data['payment_options']['pay_at_studio'],
                         {'auto': False, 'enabled': True, 'guests': True, 'clients': True})
        # Volver a automático
        r = self.c.patch(ADMIN, {'pay_at_studio_enabled': None}, format='json')
        self.assertTrue(r.json()['payment_options']['pay_at_studio']['auto'])

    def test_rejects_unknown_methods(self):
        r = self.c.patch(ADMIN, {'studio_payment_methods': ['cheque']}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('studio_payment_methods', r.json())

    def test_guide_facts_read_the_real_settings(self):
        set_cfg(pay_at_studio_enabled=True, studio_payment_methods=['cash'])
        with online(False):
            facts = self.c.get('/api/v1/guide/charging/').json()
        self.assertEqual(facts['options']['pay_at_studio']['enabled'], True)
        self.assertEqual(facts['options']['studio_methods'], ['cash'])


class GuestPayAtStudioTests(Base):
    def test_default_without_card_books(self):
        with online(False):
            r = self.c.post(GUEST_RESERVE, self.guest(), format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def test_switched_on_also_with_card(self):
        set_cfg(pay_at_studio_enabled=True)
        with online(True):
            r = self.c.post(GUEST_RESERVE, self.guest(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(Booking.objects.get().metadata['pay_at_studio'])

    def test_switched_off_without_card(self):
        set_cfg(pay_at_studio_enabled=False)
        with online(False):
            r = self.c.post(GUEST_RESERVE, self.guest(), format='json')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['card']), (409, 'pay_at_studio_disabled', False))
        self.assertFalse(Booking.objects.exists())

    def test_only_for_clients_with_account(self):
        set_cfg(pay_at_studio_enabled=True, pay_at_studio_guests=False, pay_at_studio_clients=True)
        with online(False):
            r = self.c.post(GUEST_RESERVE, self.guest(), format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'pay_at_studio_disabled'))

    def test_guest_booking_off(self):
        set_cfg(guest_booking_enabled=False)
        with online(False):
            r = self.c.post(GUEST_RESERVE, self.guest(), format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'guest_booking_disabled'))
        self.assertFalse(Booking.objects.exists())


class ClientPayAtStudioTests(Base):
    def setUp(self):
        super().setUp()
        self.user = make_client(credits=0)
        self.c.force_authenticate(self.user)

    def test_off_by_default(self):
        with online(False):
            r = self.c.post(STUDIO_RESERVE, {'cart_items': [self.item()]}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'pay_at_studio_disabled'))

    def test_needs_an_account(self):
        set_cfg(pay_at_studio_enabled=True, pay_at_studio_clients=True)
        r = APIClient().post(STUDIO_RESERVE, {'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_books_in_her_name_and_shows_in_who_owes_me_until_marked_paid(self):
        set_cfg(pay_at_studio_enabled=True, pay_at_studio_clients=True)
        with online(True):
            r = self.c.post(STUDIO_RESERVE, {'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['total'], r.json()['pay_at_studio']), ('15.00', True))
        b = Booking.objects.get()
        self.assertEqual((b.user_id, b.status, b.payment_id), (self.user.id, 'reserved', None))
        self.assertEqual((b.metadata['pay_at_studio'], b.metadata['price']), (True, '15.00'))

        admin = APIClient()
        admin.force_authenticate(make_admin())
        sales = admin.get(SALES, {'period': 'month'}).json()
        rows = [o for o in sales['owed'] if o['kind'] == 'studio']
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['booking_id'], rows[0]['amount'], rows[0]['status']), (b.id, 15.0, 'pay_at_studio'))
        self.assertEqual(sales['kpis']['pending_studio'], 1)

        r = admin.post(ACTIONS, {'kind': 'mark_studio_paid', 'booking_id': b.id, 'method': 'bizum'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        pay = Payment.objects.get()
        self.assertEqual((pay.user_id, pay.method, pay.status, pay.amount_eur), (self.user.id, 'bizum', 'succeeded', Decimal('15.00')))
        b.refresh_from_db()
        self.assertEqual(b.payment_id, pay.id)
        sales = admin.get(SALES, {'period': 'month'}).json()
        self.assertFalse([o for o in sales['owed'] if o['kind'] == 'studio'])
        self.assertTrue(any(c['payment_id'] == pay.id and c['method'] == 'Bizum' for c in sales['collected']))
        # Dos veces, no
        r = admin.post(ACTIONS, {'kind': 'mark_studio_paid', 'booking_id': b.id}, format='json')
        self.assertEqual(r.status_code, 409)

    def test_canceled_bookings_are_not_owed(self):
        set_cfg(pay_at_studio_enabled=True, pay_at_studio_clients=True)
        with online(False):
            self.c.post(STUDIO_RESERVE, {'cart_items': [self.item()]}, format='json')
        Booking.objects.update(status='canceled')
        from api.utils.dashboard import owed_items
        self.assertFalse([o for o in owed_items() if o['kind'] == 'studio'])


class CardCheckoutOptionsTests(Base):
    def post(self, body, client=None):
        c = client or self.c
        with mock.patch('api.utils.payments.stripe_client', return_value=fake_stripe()), \
                mock.patch('api.utils.payments.current_stripe_account', return_value=''):
            return c.post(CARD, body, format='json')

    def test_card_switched_off(self):
        set_cfg(online_card_enabled=False)
        r = self.post(self.guest())
        self.assertEqual((r.status_code, r.json()['code']), (409, 'card_disabled'))
        self.assertFalse(Payment.objects.exists())

    def test_drop_in_not_sold_online(self):
        set_cfg(sell_drop_in_online=False)
        r = self.post(self.guest())
        self.assertEqual((r.status_code, r.json()['code']), (409, 'drop_in_not_online'))

    def test_guest_booking_off_blocks_guests_but_not_clients(self):
        set_cfg(guest_booking_enabled=False)
        r = self.post(self.guest())
        self.assertEqual((r.status_code, r.json()['code']), (409, 'guest_booking_disabled'))
        client = APIClient()
        client.force_authenticate(make_client(credits=0))
        r = self.post({'cart_items': [self.item()]}, client)
        self.assertEqual(r.status_code, 201, r.content)

    def test_defaults_still_work(self):
        r = self.post(self.guest())
        self.assertEqual(r.status_code, 201, r.content)


class PlanCheckoutOptionsTests(Base):
    def setUp(self):
        super().setUp()
        self.c.force_authenticate(make_client(credits=0))
        self.pack = Plan.objects.create(name='Bono 5', credits=5, price_eur=Decimal('50'), type='pack')
        self.sub = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')

    def post(self, plan):
        fake = fake_stripe()
        with mock.patch('api.utils.payments.stripe_client', return_value=fake), \
                mock.patch('api.utils.payments.current_stripe_account', return_value=''):
            return self.c.post(PLAN, {'plan_id': plan.id}, format='json')

    def test_packs_not_sold_online(self):
        set_cfg(sell_packs_online=False)
        r = self.post(self.pack)
        self.assertEqual((r.status_code, r.json()['code']), (409, 'packs_not_online'))
        self.assertEqual(self.post(self.sub).status_code, 201)

    def test_memberships_not_sold_online(self):
        set_cfg(sell_memberships_online=False)
        r = self.post(self.sub)
        self.assertEqual((r.status_code, r.json()['code']), (409, 'memberships_not_online'))
        self.assertEqual(self.post(self.pack).status_code, 201)

    def test_card_switched_off(self):
        set_cfg(online_card_enabled=False)
        self.assertEqual(self.post(self.pack).json()['code'], 'card_disabled')


class CreditsAlwaysWorkTests(Base):
    def test_credits_booking_ignores_the_online_switches(self):
        set_cfg(online_card_enabled=False, guest_booking_enabled=False, pay_at_studio_enabled=False,
                sell_drop_in_online=False, sell_packs_online=False, sell_memberships_online=False)
        self.c.force_authenticate(make_client(credits=3))
        r = self.c.post(CREDITS, {'cart_items': [self.item()]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)


class FixedClassesAreAdminOnlyTests(Base):
    def setUp(self):
        super().setUp()
        self.user = make_client(credits=0)
        self.c.force_authenticate(self.user)

    def test_client_cannot_pick_fixed_classes_by_default(self):
        r = self.c.post('/api/v1/my-class-preferences/', {'schedule': self.sched.id}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'fixed_classes_admin_only'))
        self.assertFalse(UserClassPreference.objects.exists())
        # Ver las suyas sí
        self.assertEqual(self.c.get('/api/v1/my-class-preferences/').status_code, 200)

    def test_client_can_pick_them_when_the_studio_allows_it(self):
        set_cfg(client_fixed_classes=True)
        with mock.patch('api.tasks.auto_reserve_for_user_now.delay'):
            r = self.c.post('/api/v1/my-class-preferences/', {'schedule': self.sched.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def test_client_cannot_delete_hers_when_admin_only(self):
        pref = UserClassPreference.objects.create(user=self.user, schedule=self.sched)
        r = self.c.delete(f'/api/v1/my-class-preferences/{pref.id}/')
        self.assertEqual(r.status_code, 403)

    def test_admin_routes_need_an_admin(self):
        url = f'/api/v1/users/{self.user.id}/class-preferences/'
        self.assertEqual(self.c.get(url).status_code, 403)
        self.assertEqual(self.c.post(url, {'schedule_id': self.sched.id}, format='json').status_code, 403)
        admin = APIClient()
        admin.force_authenticate(make_admin())
        self.assertEqual(admin.get(url).status_code, 200)
        r = admin.post(url, {'schedule_id': self.sched.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)


class FixedClassesCopyTests(StudioTestCase):
    """Los avisos a clientes no explican ni venden las clases fijas salvo que
    el estudio deje que las elijan en la web."""

    def facts(self):
        return {
            'plan': {'id': 1, 'name': 'Mensual', 'price_per_class': Decimal('7'), 'currency': 'EUR'},
            'fixed_slots': [{'schedule_id': 3, 'label': 'los martes a las 9:30'}],
            'weeks_active': 6, 'window_weeks': 8, 'current_price_per_class': Decimal('12'),
            'saving_per_month': Decimal('20'), 'segment': 'fixed',
        }

    def test_membership_nudge_is_neutral_by_default(self):
        from api.tasks import _membership_message
        habit, body = _membership_message(make_client(credits=0), self.facts())
        text = f'{habit} {body}'.lower()
        self.assertEqual(habit, '')
        for word in ('fija', 'se reserva sola', 'se reservan solas', 'cada semana', 'llevas'):
            self.assertNotIn(word, text)
        self.assertIn('mensual', text)

    def test_membership_nudge_mentions_the_slot_when_clients_pick_fixed_classes(self):
        from api.tasks import _membership_message
        set_cfg(client_fixed_classes=True)
        habit, body = _membership_message(make_client(credits=0), self.facts())
        self.assertIn('los martes a las 9:30', habit)
        self.assertIn('se reserva sola', body)

    def test_past_due_notice_mentions_auto_booking_only_with_fixed_classes(self):
        from api.models import Subscription
        from api.views import StripeWebhookView
        sched = make_studio()
        user = make_client(credits=0)
        plan = Plan.objects.create(name='Mensual', credits=8, price_eur=Decimal('60'), type='sub')
        now = timezone.now()
        sub = Subscription.objects.create(user=user, plan=plan, status='past_due',
                                          current_period_start=now, current_period_end=now + timedelta(days=30))
        sent = []
        with mock.patch('api.views.send_templated_email', side_effect=lambda **kw: sent.append(kw)), \
                mock.patch('api.utils.push.send_push_to_user'):
            StripeWebhookView()._notify_subscription_problem(sub)
            UserClassPreference.objects.create(user=user, schedule=sched)
            StripeWebhookView()._notify_subscription_problem(sub)
        self.assertNotIn('reservarán', sent[0]['dynamic_data']['intro_copy'])
        self.assertIn('reservarán de forma automática', sent[1]['dynamic_data']['intro_copy'])
