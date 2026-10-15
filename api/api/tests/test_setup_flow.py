"""Puesta en marcha obligatoria (8 pasos en orden), su semana tipo, los bonos
sugeridos y los consejos ya vistos por cada persona (api/setup_flow.py)."""
from datetime import date, time
from unittest.mock import patch

from rest_framework.test import APIClient

from api.models import Booking, ClassType, Instructor, Plan, RecurringSchedule, Room, SiteConfig
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio

PROGRESS = '/api/v1/setup/progress/'
FLOW = '/api/v1/setup/flow/'
PUBLISH = '/api/v1/setup/publish/'
TEMPLATES = '/api/v1/setup/class-templates/'
WEEK = '/api/v1/setup/week/'
PACKS = '/api/v1/setup/packs/'
TIPS = '/api/v1/setup/tips/'
INSTRUCTORS = '/api/v1/setup/instructors/'


def fill_studio():
    cfg = SiteConfig.load()
    cfg.studio_name = 'Estudio Luna'
    cfg.phone = '+34600000000'
    cfg.city = 'Valencia'
    cfg.save()


class SetupFlowTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin_user = make_admin()
        self.admin = APIClient()
        self.admin.force_authenticate(self.admin_user)

    def flow(self):
        return self.admin.get(PROGRESS).json()['flow']

    def confirm(self, key):
        return self.admin.post(FLOW, {'confirm': key}, format='json')

    def test_new_studio_starts_at_step_one(self):
        flow = self.flow()
        self.assertEqual(flow['total'], 8)
        self.assertEqual(flow['reached'], 1)
        self.assertEqual(flow['current'], 'studio')
        self.assertEqual(flow['left'], 8)
        self.assertFalse(flow['finished'])
        self.assertFalse(flow['later'])
        self.assertEqual([s['key'] for s in flow['steps']], [
            'studio', 'style', 'rooms', 'instructors', 'class_types', 'schedule', 'plans', 'launch'])

    def test_continue_needs_the_data(self):
        r = self.confirm('studio')
        self.assertEqual(r.status_code, 400)
        self.assertIn('error', r.json())
        self.assertEqual(r.json()['missing'], ['name', 'contact', 'address'])
        fill_studio()
        r = self.confirm('studio')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['flow']['current'], 'style')

    def test_data_alone_does_not_complete_a_step(self):
        """Una sala creada en otra pantalla no se salta el paso «Salas»."""
        fill_studio()
        Room.objects.create(name='Sala 1', capacity=8)
        flow = self.flow()
        self.assertEqual(flow['current'], 'studio')
        rooms = next(s for s in flow['steps'] if s['key'] == 'rooms')
        self.assertTrue(rooms['data_done'])
        self.assertFalse(rooms['done'])

    def test_steps_cannot_be_skipped(self):
        Room.objects.create(name='Sala 1', capacity=8)
        r = self.confirm('rooms')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['missing'], ['studio', 'style'])

    def test_style_can_keep_the_default_look(self):
        fill_studio()
        self.confirm('studio')
        r = self.confirm('style')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['flow']['current'], 'rooms')
        self.assertEqual(SiteConfig.load().setup_steps.get('style'), 'done')

    def test_unknown_or_launch_step_rejected(self):
        self.assertEqual(self.confirm('nope').status_code, 400)
        self.assertEqual(self.confirm('launch').status_code, 400)

    def test_later_flag(self):
        r = self.admin.post(FLOW, {'later': True}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['flow']['later'])
        r = self.admin.post(FLOW, {'later': False}, format='json')
        self.assertFalse(r.json()['flow']['later'])

    @patch('api.views_site._ping_search_engines')
    def test_full_flow_then_publish(self, _ping):
        fill_studio()
        self.assertEqual(self.confirm('studio').status_code, 200)
        self.assertEqual(self.confirm('style').status_code, 200)
        Room.objects.create(name='Sala 1', capacity=8)
        self.assertEqual(self.confirm('rooms').status_code, 200)
        self.assertEqual(self.admin.post(INSTRUCTORS, {'name': 'Laura Gil'}, format='json').status_code, 201)
        self.assertEqual(self.confirm('instructors').status_code, 200)
        self.admin.post(TEMPLATES, {'items': [{'key': 'mat'}]}, format='json')
        self.assertEqual(self.confirm('class_types').status_code, 200)
        ct = ClassType.objects.get()
        r = self.admin.post(WEEK, {'weekday': 0, 'start_time': '09:30', 'class_type_id': ct.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.confirm('schedule').status_code, 200)
        self.admin.post(PACKS, {'key': 'pack5', 'on': True}, format='json')
        r = self.confirm('plans')
        self.assertEqual(r.status_code, 200, r.content)
        flow = r.json()['flow']
        self.assertEqual(flow['current'], 'launch')
        self.assertEqual(flow['left'], 1)
        r = self.admin.post(PUBLISH)
        self.assertEqual(r.status_code, 200, r.content)
        flow = r.json()['flow']
        self.assertTrue(flow['finished'])
        self.assertEqual(flow['reached'], 9)
        self.assertEqual(flow['left'], 0)

    def test_published_studio_is_finished_without_confirmations(self):
        """Estudios que ya tenían la web publicada: todo desbloqueado, nunca a la puesta en marcha."""
        cfg = SiteConfig.load()
        cfg.setup_completed = True
        cfg.save()
        flow = self.flow()
        self.assertTrue(flow['finished'])
        self.assertEqual(flow['left'], 0)
        self.assertTrue(all(s['done'] for s in flow['steps']))
        self.assertFalse(flow['later'])

    def test_flow_keys_not_writable_from_site_config(self):
        r = self.admin.patch('/api/v1/site-config/', {'setup_steps': {'flow': ['studio']}}, format='json')
        self.assertIn(r.status_code, (200, 400))
        self.assertNotIn('flow', SiteConfig.load().setup_steps or {})

    def test_admin_only(self):
        anon = APIClient()
        client = APIClient()
        client.force_authenticate(make_client())
        for c in (anon, client):
            self.assertIn(c.post(FLOW, {'later': True}, format='json').status_code, (401, 403))
            self.assertIn(c.get(WEEK).status_code, (401, 403))
            self.assertIn(c.get(PACKS).status_code, (401, 403))
            self.assertIn(c.get(TIPS).status_code, (401, 403))


class SetupInstructorTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_create_with_unique_slug(self):
        Instructor.objects.create(name='Otra', slug='laura')
        r = self.admin.post(INSTRUCTORS, {'name': ' Laura '}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        inst = Instructor.objects.get(pk=r.json()['id'])
        self.assertEqual(inst.name, 'Laura')
        self.assertEqual(inst.slug, 'laura-2')

    def test_same_name_is_not_duplicated(self):
        first = self.admin.post(INSTRUCTORS, {'name': 'Laura'}, format='json').json()['id']
        r = self.admin.post(INSTRUCTORS, {'name': 'laura'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['id'], first)

    def test_rejects_empty_name(self):
        self.assertEqual(self.admin.post(INSTRUCTORS, {'name': '  '}, format='json').status_code, 400)


class SetupWeekTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        make_studio()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())
        self.ct = ClassType.objects.first()
        self.room = Room.objects.order_by('id').first()

    def test_list(self):
        r = self.admin.get(WEEK)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn('slots', data)
        self.assertTrue(any(c['id'] == self.ct.id for c in data['class_types']))
        self.assertTrue(any(rm['id'] == self.room.id for rm in data['rooms']))

    @patch('api.signals.do_bulk_email_after_commit')
    def test_add_slot_repeats_weekly_without_emailing(self, bulk):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.admin.post(WEEK, {'weekday': 4, 'start_time': '19:15', 'class_type_id': self.ct.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        sched = RecurringSchedule.objects.get(weekday=4, start_time=time(19, 15))
        self.assertTrue(sched.is_recurrent)
        self.assertEqual(sched.start_date, date.today())
        self.assertEqual(sched.room_id, self.room.id)
        self.assertEqual(sched.capacity_max, self.room.capacity)
        self.assertEqual(sched.duration_minutes, self.ct.duration_minutes)
        bulk.assert_not_called()
        self.assertTrue(any(s['id'] == sched.id for s in r.json()['slots']))

    def test_overlap_is_explained(self):
        self.admin.post(WEEK, {'weekday': 5, 'start_time': '10:00', 'class_type_id': self.ct.id}, format='json')
        r = self.admin.post(WEEK, {'weekday': 5, 'start_time': '10:15', 'class_type_id': self.ct.id}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('error', r.json())

    def test_bad_input(self):
        for body in ({'weekday': 9, 'start_time': '10:00', 'class_type_id': self.ct.id},
                     {'weekday': 1, 'start_time': '25:00', 'class_type_id': self.ct.id},
                     {'weekday': 1, 'start_time': '10:00', 'class_type_id': 99999}):
            self.assertEqual(self.admin.post(WEEK, body, format='json').status_code, 400, body)

    def test_change_and_remove_slot(self):
        r = self.admin.post(WEEK, {'weekday': 6, 'start_time': '11:00', 'class_type_id': self.ct.id}, format='json')
        slot = next(s for s in r.json()['slots'] if s['weekday'] == 6)
        r = self.admin.delete(f"{WEEK}{slot['id']}/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(any(s['id'] == slot['id'] for s in r.json()['slots']))

    def test_slot_with_bookings_is_kept(self):
        sched = RecurringSchedule.objects.filter(is_active=True).first()
        Booking.objects.create(occurrence=sched, user=make_client())
        r = self.admin.delete(f'{WEEK}{sched.id}/')
        self.assertEqual(r.status_code, 400)
        self.assertIsNone(RecurringSchedule.objects.get(pk=sched.id).deleted_at)


class SetupClassTypeDeleteTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        make_studio()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_templates_carry_the_id_of_existing_classes(self):
        self.admin.post(TEMPLATES, {'items': [{'key': 'yoga'}]}, format='json')
        tpl = next(t for t in self.admin.get(TEMPLATES).json()['templates'] if t['key'] == 'yoga')
        self.assertTrue(tpl['exists'])
        self.assertEqual(tpl['id'], ClassType.objects.get(title='Yoga').id)

    def test_remove_class_and_its_slots(self):
        self.admin.post(TEMPLATES, {'items': [{'key': 'yoga'}]}, format='json')
        ct = ClassType.objects.get(title='Yoga')
        room = Room.objects.order_by('id').first()
        sched = RecurringSchedule.objects.create(
            class_type=ct, room=room, weekday=3, start_time=time(8, 0), end_time=time(9, 0),
            is_recurrent=True, start_date=date.today())
        r = self.admin.delete(f'/api/v1/setup/class-types/{ct.id}/')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(ClassType.objects.filter(pk=ct.id).exists())
        self.assertFalse(RecurringSchedule.objects.filter(pk=sched.id).exists())

    def test_class_with_bookings_is_kept(self):
        sched = RecurringSchedule.objects.filter(is_active=True).first()
        Booking.objects.create(occurrence=sched, user=make_client())
        r = self.admin.delete(f'/api/v1/setup/class-types/{sched.class_type_id}/')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(ClassType.objects.filter(pk=sched.class_type_id).exists())


class SetupPacksTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())
        Plan.objects.all().delete()

    def test_suggestions_from_drop_in_price(self):
        cfg = SiteConfig.load()
        cfg.drop_in_price = 15
        cfg.save()
        packs = {p['key']: p for p in self.admin.get(PACKS).json()['packs']}
        self.assertEqual(packs['single']['price'], '15')
        self.assertEqual(packs['pack10']['price'], '120')
        self.assertTrue(packs['pack5']['suggested_on'])
        self.assertFalse(packs['pack5']['on'])

    def test_turn_on_edit_price_and_off(self):
        r = self.admin.post(PACKS, {'key': 'pack5', 'on': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        plan = Plan.objects.get(name='Bono 5 clases')
        self.assertTrue(plan.is_active)
        self.assertEqual(plan.credits, 5)
        self.assertEqual(plan.credits_expire_days, 60)
        r = self.admin.post(PACKS, {'key': 'pack5', 'price': '72.5'}, format='json')
        plan.refresh_from_db()
        self.assertEqual(str(plan.price_eur), '72.50')
        self.assertEqual(str(plan.price_credit), '14.50')
        r = self.admin.post(PACKS, {'key': 'pack5', 'on': False}, format='json')
        plan.refresh_from_db()
        self.assertFalse(plan.is_active)
        self.assertFalse(next(p for p in r.json()['packs'] if p['key'] == 'pack5')['on'])
        self.assertEqual(Plan.objects.filter(name='Bono 5 clases').count(), 1)

    def test_off_without_plan_creates_nothing(self):
        self.admin.post(PACKS, {'key': 'trial', 'on': False}, format='json')
        self.assertFalse(Plan.objects.exists())

    def test_bad_input(self):
        self.assertEqual(self.admin.post(PACKS, {'key': 'nope', 'on': True}, format='json').status_code, 400)
        self.assertEqual(self.admin.post(PACKS, {'key': 'single', 'price': '-3'}, format='json').status_code, 400)
        self.assertEqual(self.admin.post(PACKS, {'key': 'single', 'price': 'abc'}, format='json').status_code, 400)


class SetupTipsTests(StudioTestCase):
    def test_seen_is_per_person(self):
        a, b = APIClient(), APIClient()
        a.force_authenticate(make_admin('a@test.local'))
        b.force_authenticate(make_admin('b@test.local'))
        self.assertEqual(a.get(TIPS).json(), {'seen': []})
        self.assertEqual(a.post(TIPS, {'key': 'tour:welcome'}, format='json').json(), {'seen': ['tour:welcome']})
        a.post(TIPS, {'key': 'tour:welcome'}, format='json')
        a.post(TIPS, {'key': 'tip:calendar'}, format='json')
        self.assertEqual(a.get(TIPS).json()['seen'], ['tour:welcome', 'tip:calendar'])
        self.assertEqual(b.get(TIPS).json()['seen'], [])
        self.assertEqual(a.post(TIPS, {'reset': True}, format='json').json(), {'seen': []})

    def test_rejects_bad_keys(self):
        a = APIClient()
        a.force_authenticate(make_admin())
        for key in ('', 'Con Espacios', 'x' * 60, None):
            self.assertEqual(a.post(TIPS, {'key': key}, format='json').status_code, 400, key)
