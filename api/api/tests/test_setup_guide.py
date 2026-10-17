"""Guía de puesta en marcha: estado de los pasos, publicar la web y plantillas."""
from datetime import date, timedelta

from rest_framework.test import APIClient

from api.models import Category, ClassType, Instructor, Plan, RecurringSchedule, Room, SiteConfig
from api.tests.factories import StudioTestCase, make_admin, make_client, make_studio

PROGRESS = '/api/v1/setup/progress/'
PUBLISH = '/api/v1/setup/publish/'
TEMPLATES = '/api/v1/setup/class-templates/'


def step(data, key):
    return next(s for s in data['steps'] if s['key'] == key)


def fill_studio():
    cfg = SiteConfig.load()
    cfg.studio_name = 'Estudio Luna'
    cfg.phone = '+34600000000'
    cfg.city = 'Madrid'
    cfg.save()


def make_plan():
    return Plan.objects.create(name='Bono 5', slug='bono-5', credits=5, price_eur=60)


class SetupProgressTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_empty_studio(self):
        r = self.admin.get(PROGRESS)
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['total'], 11)
        self.assertEqual(data['required_total'], 7)
        self.assertEqual(data['done_count'], 0)
        self.assertFalse(data['published'])
        self.assertFalse(data['can_publish'])
        self.assertFalse(data['welcome_done'])
        self.assertEqual(data['next_step'], 'studio')
        self.assertEqual([s['key'] for s in data['steps']], [
            'studio', 'style', 'rooms', 'instructors', 'class_types', 'schedule', 'plans',
            'payments', 'content', 'google', 'launch'])
        studio = step(data, 'studio')
        self.assertEqual(studio['status'], 'todo')
        self.assertEqual(studio['missing'], ['name', 'contact', 'address'])
        # El horario necesita salas y tipos de clase
        sched = step(data, 'schedule')
        self.assertEqual(sched['status'], 'blocked')
        self.assertEqual(sched['blocked_by'], ['rooms', 'class_types'])
        self.assertEqual(step(data, 'launch')['status'], 'blocked')
        self.assertEqual(data['missing_to_publish'], [
            'studio', 'style', 'rooms', 'instructors', 'class_types', 'schedule', 'plans'])

    def test_partial_studio(self):
        fill_studio()
        Room.objects.create(name='Sala 1', capacity=8)
        Instructor.objects.create(name='Laura (ejemplo)', slug='laura')  # de ejemplo: no cuenta
        data = self.admin.get(PROGRESS).json()
        self.assertTrue(step(data, 'studio')['done'])
        self.assertEqual(step(data, 'style')['status'], 'todo')
        self.assertTrue(step(data, 'rooms')['done'])
        instructors = step(data, 'instructors')
        self.assertFalse(instructors['done'])
        self.assertTrue(instructors['sample'])
        # Horario: ya hay sala, falta el tipo de clase
        self.assertEqual(step(data, 'schedule')['blocked_by'], ['class_types'])
        self.assertEqual(data['next_step'], 'style')
        self.assertEqual(data['done_count'], 2)

    def test_style_counts_when_changed_or_confirmed(self):
        data = self.admin.get(PROGRESS).json()
        self.assertFalse(step(data, 'style')['done'])
        r = self.admin.post('/api/v1/setup/steps/style/', {'status': 'done'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(step(r.json(), 'style')['done'])
        self.admin.post('/api/v1/setup/steps/style/', {'status': 'todo'}, format='json')
        cfg = SiteConfig.load()
        cfg.style_preset = 'minimal'
        cfg.save()
        self.assertTrue(step(self.admin.get(PROGRESS).json(), 'style')['done'])

    def test_complete_studio_can_publish(self):
        fill_studio()
        self.admin.post('/api/v1/setup/steps/style/', {'status': 'done'}, format='json')
        make_studio()  # sala, instructor, tipo de clase y una clase semanal
        r = self.admin.post(PUBLISH)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['missing'], ['plans'])
        self.assertFalse(SiteConfig.load().setup_completed)

        make_plan()
        data = self.admin.get(PROGRESS).json()
        self.assertTrue(data['can_publish'])
        self.assertEqual(data['required_done'], 7)
        self.assertEqual(data['next_step'], 'payments')
        self.assertEqual(step(data, 'launch')['status'], 'todo')

        r = self.admin.post(PUBLISH)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['published'])
        self.assertTrue(step(r.json(), 'launch')['done'])
        self.assertTrue(SiteConfig.load().setup_completed)
        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertTrue(public['setup_completed'])

    def test_optional_steps_can_be_skipped(self):
        r = self.admin.post('/api/v1/setup/steps/google/', {'status': 'skipped'}, format='json')
        self.assertEqual(step(r.json(), 'google')['status'], 'skipped')
        self.assertEqual(r.json()['done_count'], 1)
        # Lo obligatorio no se puede saltar
        r = self.admin.post('/api/v1/setup/steps/rooms/', {'status': 'skipped'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.admin.post('/api/v1/setup/steps/style/', {'status': 'skipped'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_ended_schedules_do_not_count(self):
        sched = make_studio()
        sched.end_date = date.today() - timedelta(days=1)
        sched.save()
        self.assertFalse(step(self.admin.get(PROGRESS).json(), 'schedule')['done'])

    def test_welcome_creates_the_main_room_once(self):
        r = self.admin.post('/api/v1/setup/steps/welcome/', {'status': 'done'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['welcome_done'])
        self.assertEqual(list(Room.objects.values_list('name', 'capacity')), [('Sala principal', 10)])
        self.assertTrue(step(r.json(), 'rooms')['done'])
        self.admin.post('/api/v1/setup/steps/welcome/', {'status': 'done'}, format='json')
        self.assertEqual(Room.objects.count(), 1)

    def test_welcome_keeps_existing_rooms(self):
        Room.objects.create(name='Sala Zen', capacity=6)
        self.admin.post('/api/v1/setup/steps/welcome/', {'status': 'done'}, format='json')
        self.assertEqual(list(Room.objects.values_list('name', flat=True)), ['Sala Zen'])

    def test_setup_steps_not_writable_from_site_config(self):
        r = self.admin.patch('/api/v1/site-config/', {'setup_steps': {'style': 'done'}}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('setup_steps', r.json())
        self.assertEqual(SiteConfig.load().setup_steps, {})

    def test_studios_already_published_stay_published(self):
        cfg = SiteConfig.load()
        cfg.setup_completed = True
        cfg.save()
        data = self.admin.get(PROGRESS).json()
        self.assertTrue(data['published'])
        self.assertTrue(data['welcome_done'])
        # «Publicar» no la despublica aunque falten pasos
        r = self.admin.post(PUBLISH)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(SiteConfig.load().setup_completed)


class SetupPermissionsTests(StudioTestCase):
    def test_anonymous_and_clients_are_rejected(self):
        client = APIClient()
        client.force_authenticate(make_client())
        for c, code in ((APIClient(), 401), (client, 403)):
            self.assertEqual(c.get(PROGRESS).status_code, code)
            self.assertEqual(c.post(PUBLISH).status_code, code)
            self.assertEqual(c.post('/api/v1/setup/steps/style/', {'status': 'done'}, format='json').status_code, code)
            self.assertEqual(c.get(TEMPLATES).status_code, code)
            self.assertEqual(c.post(TEMPLATES, {'items': [{'key': 'mat'}]}, format='json').status_code, code)
        self.assertFalse(SiteConfig.load().setup_completed)
        self.assertFalse(ClassType.objects.exists())

    def test_public_config_lists_panel_origin_for_the_preview(self):
        data = APIClient().get('/api/v1/site-config/public/').json()
        self.assertIsInstance(data['preview_frame_origins'], list)
        self.assertNotIn('setup_steps', data)


class ClassTemplatesTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())

    def test_lists_templates_with_english(self):
        data = self.admin.get(TEMPLATES).json()
        keys = [t['key'] for t in data['templates']]
        for k in ('reformer', 'mat', 'barre', 'yoga', 'hatha', 'vinyasa', 'funcional'):
            self.assertIn(k, keys)
        reformer = next(t for t in data['templates'] if t['key'] == 'reformer')
        self.assertEqual(reformer['credits'], 2)
        self.assertTrue(reformer['description_en'])
        self.assertFalse(reformer['exists'])

    def test_creates_class_types_and_categories(self):
        inst = Instructor.objects.create(name='Ana', slug='ana')
        r = self.admin.post(TEMPLATES, {'items': [
            {'key': 'reformer'}, {'key': 'hatha', 'title': 'Hatha suave', 'duration_minutes': 75},
        ]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()['created']), 2)
        reformer = ClassType.objects.get(title='Pilates Reformer')
        self.assertEqual(reformer.category.slug, 'pilates')
        self.assertEqual(reformer.title_en, 'Reformer Pilates')
        self.assertTrue(reformer.description_en)
        self.assertEqual(reformer.default_price_credits, 2)
        self.assertEqual(reformer.instructor, inst)  # el único instructor
        hatha = ClassType.objects.get(title='Hatha suave')
        self.assertEqual(hatha.duration_minutes, 75)
        self.assertEqual(hatha.category.slug, 'yoga')
        self.assertEqual(hatha.title_en, '')  # nombre cambiado: sin traducción inventada
        self.assertTrue(step(r.json()['progress'], 'class_types')['done'])

        # Repetir no duplica
        r = self.admin.post(TEMPLATES, {'items': [{'key': 'reformer'}]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()['skipped']), 1)
        self.assertEqual(ClassType.objects.filter(title='Pilates Reformer').count(), 1)

    def test_reuses_existing_category_by_name(self):
        Category.objects.create(name='Pilates', slug='mi-pilates')
        self.admin.post(TEMPLATES, {'items': [{'key': 'mat'}]}, format='json')
        self.assertEqual(Category.objects.filter(name='Pilates').count(), 1)
        self.assertEqual(ClassType.objects.get().category.slug, 'mi-pilates')

    def test_brings_back_a_deleted_class(self):
        self.admin.post(TEMPLATES, {'items': [{'key': 'mat'}]}, format='json')
        ct = ClassType.objects.get()
        ct.soft_delete()
        r = self.admin.post(TEMPLATES, {'items': [{'key': 'mat'}]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(ClassType.objects.get().id, ct.id)

    def test_rejects_bad_input(self):
        for body in ({}, {'items': []}, {'items': [{'key': 'zumba-nope'}]},
                     {'items': [{'key': 'mat', 'duration_minutes': 5}]},
                     {'items': [{'key': 'mat', 'title': '  '}]},
                     {'items': [{'key': 'mat', 'instructor_id': 999}]}):
            r = self.admin.post(TEMPLATES, body, format='json')
            self.assertEqual(r.status_code, 400, body)
            self.assertIn('error', r.json())
        self.assertFalse(ClassType.objects.exists())

    def test_schedule_from_template_completes_the_step(self):
        self.admin.post(TEMPLATES, {'items': [{'key': 'mat'}]}, format='json')
        room = Room.objects.create(name='Sala 1', capacity=8)
        from datetime import time
        RecurringSchedule.objects.create(
            class_type=ClassType.objects.get(), room=room, weekday=0, is_recurrent=True,
            start_time=time(9, 0), end_time=time(9, 55), is_active=True, start_date=date.today())
        self.assertTrue(step(self.admin.get(PROGRESS).json(), 'schedule')['done'])
