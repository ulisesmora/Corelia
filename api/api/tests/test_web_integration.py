"""Lo que la web pública necesita del API tras el reconcepto:

- Horario público: plazas libres por sesión (reservas + plazas ofrecidas a la
  lista de espera), `waitlist_enabled` y sin consultas por sesión.
- Lista de espera desde la web: enlace /lista-espera y aviso claro si a la
  clienta no le quedan clases al aceptar.
- «Mi web» → Secciones (SiteConfig.web_sections): se guardan en el servidor,
  se publican en la config pública y apagan opiniones, preguntas y galería.
- Vista previa del panel: PANEL_URL entre los orígenes que pueden enmarcar la web.
"""
from datetime import time, timedelta
from unittest.mock import patch

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Booking, CreditLedgerEntry, CreditWallet, FAQItem, RecurringSchedule, Room, SiteConfig, SiteImage, Testimonial,
    WaitlistEntry, WaitlistSettings,
)
from api.tests.factories import StudioTestCase, madrid, make_admin, make_client, make_studio, next_weekday
from api.utils import waitlist as wl


def schedule_for(day):
    r = APIClient().get('/api/v1/schedule/schedule/', {'start_date': day.isoformat(), 'end_date': day.isoformat()})
    assert r.status_code == 200, r.content
    return r.json()


class PublicScheduleTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.sched = make_studio(weekday=2, start=time(10, 0), end=time(10, 55))
        self.sched.capacity_max = 2
        self.sched.save()
        self.day = next_weekday(2, min_days=2)
        self.start = madrid(self.day, 10)

    def book(self, user, schedule=None):
        return Booking.objects.create(user=user, occurrence=schedule or self.sched, status='reserved',
                                      start_datetime=self.start, end_datetime=self.start + timedelta(minutes=55))

    def row(self, data, schedule=None):
        sid = (schedule or self.sched).id
        return next(e for e in data if e['source_id'] == sid and e['type'] != 'EVENT')

    def test_seats_are_counted_per_class_not_per_time(self):
        # Otra clase a la misma hora en otra sala: sus reservas no cuentan aquí
        other = RecurringSchedule.objects.create(
            class_type=self.sched.class_type, room=Room.objects.create(name='Sala 2', capacity=8), weekday=2,
            is_recurrent=True, start_time=time(10, 0), end_time=time(10, 55), capacity_min=1, capacity_max=8,
            is_active=True)
        self.book(make_client('a@test.local'))
        for i in range(3):
            self.book(make_client(f'o{i}@test.local'), schedule=other)
        data = schedule_for(self.day)
        self.assertEqual((self.row(data)['occupied_seats'], self.row(data)['available_seats']), (1, 1))
        self.assertEqual(self.row(data, other)['occupied_seats'], 3)

    def test_live_offer_holds_the_seat_and_flag_is_published(self):
        self.book(make_client('a@test.local'))
        WaitlistEntry.objects.create(schedule=self.sched, start_datetime=self.start, user=make_client('b@test.local'),
                                     status='offered', offer_expires_at=timezone.now() + timedelta(hours=1))
        WaitlistEntry.objects.create(schedule=self.sched, start_datetime=self.start, user=make_client('c@test.local'),
                                     status='offered', offer_expires_at=timezone.now() - timedelta(minutes=1))
        row = self.row(schedule_for(self.day))
        self.assertEqual(row['available_seats'], 0)  # 1 reserva + 1 oferta viva (la caducada no)
        self.assertTrue(row['waitlist_enabled'])
        WaitlistSettings.objects.update_or_create(pk=1, defaults={'enabled': False})
        self.assertFalse(self.row(schedule_for(self.day))['waitlist_enabled'])

    def test_no_query_per_session(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                schedule_for(self.day)
            return len(ctx.captured_queries)
        schedule_for(self.day)  # la primera vez crea WaitlistSettings
        base = count()
        for h in range(11, 16):
            s = RecurringSchedule.objects.create(
                class_type=self.sched.class_type, room=self.sched.room, weekday=2, is_recurrent=True,
                start_time=time(h, 0), end_time=time(h, 50), capacity_min=1, capacity_max=8, is_active=True)
            Booking.objects.create(user=make_client(f'n{h}@test.local'), occurrence=s, status='reserved',
                                   start_datetime=madrid(self.day, h), end_datetime=madrid(self.day, h, 50))
        self.assertEqual(count(), base)


class WaitlistFromWebTests(StudioTestCase):
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

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_claim_link_points_to_the_web_page(self):
        entry = WaitlistEntry.objects.create(schedule=self.sched, start_datetime=self.start,
                                             user=make_client('w@test.local'))
        self.assertTrue(wl.claim_url(entry).endswith(f'/lista-espera?token={entry.claim_token}'))

    @patch('api.utils.waitlist._notify_offer')
    def test_claim_without_credits_explains_what_to_do(self, notify):
        broke = make_client('broke@test.local', credits=0)
        r = self.api(broke).post('/api/v1/waitlist/', {
            'schedule_id': self.sched.id, 'start_datetime': f'{self.day.isoformat()}T10:00:00'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        with self.captureOnCommitCallbacks(execute=True):
            self.api(self.first).post(f'/api/v1/bookings/{self.booking.id}/cancel/')
        entry = WaitlistEntry.objects.get(user=broke)
        self.assertEqual(entry.status, 'offered')
        r = self.api(broke).post('/api/v1/waitlist/claim/', {'token': str(entry.claim_token)}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'insufficient_credits')
        self.assertIn('No te quedan clases', r.json()['error'])
        # Compra un bono y vuelve al enlace: ahora sí
        wallet = CreditWallet.objects.get(user=broke)
        CreditLedgerEntry.objects.create(wallet=wallet, kind='grant', amount=5, reference='bono')
        r = self.api(broke).post('/api/v1/waitlist/claim/', {'token': str(entry.claim_token)}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        booking_id = r.json()['booking_id']
        # Volver a abrir el enlace: no es un error, ya tiene su plaza
        r = self.api(broke).post('/api/v1/waitlist/claim/', {'token': str(entry.claim_token)}, format='json')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['booking_id']), (200, 'already_claimed', booking_id))
        # Mis listas: ya no aparece (la aceptó)
        self.assertEqual(self.api(broke).get('/api/v1/waitlist/').json(), [])

    def test_my_waitlists_and_leave(self):
        ana = make_client('ana@test.local')
        r = self.api(ana).post('/api/v1/waitlist/', {
            'schedule_id': self.sched.id, 'start_datetime': f'{self.day.isoformat()}T10:00:00'}, format='json')
        mine = self.api(ana).get('/api/v1/waitlist/').json()
        self.assertEqual([(e['id'], e['position'], e['start_datetime'][:16]) for e in mine],
                         [(r.json()['id'], 1, f'{self.day.isoformat()}T10:00')])
        self.assertEqual(self.api(ana).post(f"/api/v1/waitlist/{mine[0]['id']}/leave/").json()['status'], 'left')
        self.assertEqual(self.api(ana).get('/api/v1/waitlist/').json(), [])
        # La lista de otra no se puede tocar
        bea = make_client('bea@test.local')
        e = WaitlistEntry.objects.create(schedule=self.sched, start_datetime=self.start, user=bea)
        self.assertEqual(self.api(ana).post(f'/api/v1/waitlist/{e.id}/leave/').status_code, 404)

    def test_public_waitlist_settings(self):
        self.assertEqual(APIClient().get('/api/v1/waitlist/settings/').json(), {'enabled': True})


class WebSectionsTests(StudioTestCase):
    def setUp(self):
        super().setUp()
        self.admin = APIClient()
        self.admin.force_authenticate(make_admin())
        FAQItem.objects.create(question='¿Hay que llevar esterilla?', answer='No')
        Testimonial.objects.create(author='Lucía', text='Me encanta')
        SiteImage.objects.create(section='gallery', image='https://example.com/a.jpg')
        SiteImage.objects.create(section='hero', image='https://example.com/h.jpg')

    def public(self):
        return APIClient().get('/api/v1/site-config/public/').json()['sections']

    def toggle(self, key, visible):
        r = self.admin.post('/api/v1/dashboard/web/sections/', {'section': key, 'visible': visible}, format='json')
        return r

    def test_default_all_visible(self):
        self.assertEqual(SiteConfig.load().web_sections, {})
        self.assertTrue(all(self.public().values()))
        self.assertEqual(set(self.public()), {'next', 'classes', 'prices', 'team', 'location', 'testimonials',
                                              'faqs', 'gallery'})

    def test_toggle_is_saved_on_the_server_and_published(self):
        r = self.toggle('prices', False)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()['sections']['prices'])
        self.assertEqual(SiteConfig.load().web_sections, {'prices': False})
        self.assertFalse(self.public()['prices'])
        summary = self.admin.get('/api/v1/dashboard/web/').json()
        prices = next(s for s in summary['sections'] if s['key'] == 'prices')
        self.assertEqual((prices['toggle'], prices['enabled'], prices['visible']), (True, False, False))
        hero = next(s for s in summary['sections'] if s['key'] == 'hero')
        self.assertFalse(hero['toggle'])
        self.toggle('prices', True)
        self.assertEqual(SiteConfig.load().web_sections, {})
        self.assertTrue(self.public()['prices'])
        # Claves antiguas del panel
        self.toggle('upcoming', False)
        self.assertFalse(self.public()['next'])
        self.assertEqual(self.toggle('about', False).status_code, 400)
        self.assertEqual(self.toggle('nada', False).status_code, 400)

    def test_hidden_content_disappears_from_public_lists_but_not_for_the_studio(self):
        anon = APIClient()

        def listing(r):
            data = r.json()
            return data['results'] if isinstance(data, dict) else data

        def public_counts():
            return (len(listing(anon.get('/api/v1/faqs/'))), len(listing(anon.get('/api/v1/testimonials/'))),
                    len(listing(anon.get('/api/v1/site-images/', {'section': 'gallery'}))))
        self.assertEqual(public_counts(), (1, 1, 1))
        for key in ('faqs', 'testimonials', 'gallery'):
            self.toggle(key, False)
        self.assertEqual(public_counts(), (0, 0, 0))
        # La portada sigue teniendo su foto, y el estudio lo sigue viendo todo
        self.assertEqual(len(listing(anon.get('/api/v1/site-images/', {'section': 'hero'}))), 1)
        self.assertEqual(len(listing(self.admin.get('/api/v1/faqs/'))), 1)
        # Nada se ha desactivado: al encender, se ve todo igual que antes
        self.assertTrue(FAQItem.objects.get().is_active)
        for key in ('faqs', 'testimonials', 'gallery'):
            self.toggle(key, True)
        self.assertEqual(public_counts(), (1, 1, 1))


class PreviewFrameOriginsTests(StudioTestCase):
    @override_settings(API_URL='https://api.example.com', PANEL_URL='http://localhost:5173')
    def test_panel_url_can_frame_the_web(self):
        origins = APIClient().get('/api/v1/site-config/public/').json()['preview_frame_origins']
        self.assertEqual(origins, ['https://api.example.com', 'http://localhost:5173'])

    @override_settings(API_URL='https://api.example.com', PANEL_URL='https://api.example.com')
    def test_default_panel_is_the_api(self):
        origins = APIClient().get('/api/v1/site-config/public/').json()['preview_frame_origins']
        self.assertEqual(origins, ['https://api.example.com'])
