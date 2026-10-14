"""Portada de la web: foto, vídeo de YouTube (con póster propio) o ilustración."""
import io
from unittest import mock

import requests
from PIL import Image
from rest_framework.test import APIClient

from api.models import SiteConfig, StoredFile
from api.tests.factories import StudioTestCase, make_admin
from api.utils.youtube import youtube_id

VID = 'dQw4w9WgXcQ'


def _jpeg(width=1280, height=720) -> bytes:
    out = io.BytesIO()
    Image.new('RGB', (width, height), (180, 120, 90)).save(out, 'JPEG', quality=90)
    return out.getvalue()


def _resp(status=200, content=b'', content_type='image/jpeg'):
    r = mock.Mock()
    r.status_code = status
    r.content = content
    r.headers = {'Content-Type': content_type}
    return r


class YoutubeIdTests(StudioTestCase):
    def test_accepts_the_usual_links(self):
        for url in (
            f'https://www.youtube.com/watch?v={VID}',
            f'https://youtube.com/watch?v={VID}&t=42s&list=PL123',
            f'http://m.youtube.com/watch?feature=share&v={VID}',
            f'https://youtu.be/{VID}',
            f'https://youtu.be/{VID}?si=abcdef',
            f'youtu.be/{VID}',
            f'https://www.youtube.com/shorts/{VID}',
            f'https://www.youtube.com/embed/{VID}?autoplay=1',
            f'https://www.youtube-nocookie.com/embed/{VID}',
            f'https://www.youtube.com/live/{VID}?feature=shared',
        ):
            self.assertEqual(youtube_id(url), VID, url)

    def test_rejects_other_links(self):
        for url in (
            '', 'hola', 'https://vimeo.com/123456', f'https://evil.com/watch?v={VID}',
            'https://www.youtube.com/watch?v=corto', 'https://www.youtube.com/@miestudio',
            f'https://www.youtube.com.evil.com/watch?v={VID}', f'javascript://youtu.be/{VID}',
            'https://www.youtube.com/watch?v=<script>abc', 'https://youtu.be/',
        ):
            self.assertEqual(youtube_id(url), '', url)


class HeroConfigTests(StudioTestCase):
    def setUp(self):
        self.c = APIClient()
        self.c.force_authenticate(make_admin())

    def test_defaults_keep_todays_behaviour(self):
        data = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(data['hero_mode'], 'image')
        self.assertEqual(data['hero_image_url'], '')
        self.assertEqual(data['hero_video_id'], '')
        self.assertEqual(data['hero_video_poster_url'], '')
        self.assertEqual(data['hero_illustration'], 'reformer')

    def test_photo_mode(self):
        r = self.c.patch('/api/v1/site-config/', {
            'hero_mode': 'image', 'hero_image_url': 'https://cdn.example.com/portada.jpg',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(public['hero_image_url'], 'https://cdn.example.com/portada.jpg')

    def test_bad_photo_url_is_rejected_in_spanish(self):
        r = self.c.patch('/api/v1/site-config/', {'hero_image_url': 'no es un enlace'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('https://', r.json()['hero_image_url'][0])

    @mock.patch('api.utils.youtube.requests.get')
    def test_video_is_normalized_and_poster_stored(self, get):
        get.return_value = _resp(content=_jpeg())
        r = self.c.patch('/api/v1/site-config/', {
            'hero_mode': 'video', 'hero_video_url': f'https://youtu.be/{VID}?si=xyz',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body['hero_video_url'], f'https://www.youtube.com/watch?v={VID}')
        self.assertEqual(body['hero_video_id'], VID)
        get.assert_called_once()
        self.assertIn(f'i.ytimg.com/vi/{VID}/maxresdefault.jpg', get.call_args[0][0])
        self.assertIn('timeout', get.call_args[1])
        # El póster es una copia propia (/media/<id>), nunca la URL de YouTube
        poster = body['hero_video_poster_url']
        self.assertIn('/media/', poster)
        self.assertNotIn('ytimg', poster)
        self.assertEqual(StoredFile.objects.count(), 1)
        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(public['hero_mode'], 'video')
        self.assertEqual(public['hero_video_id'], VID)
        self.assertEqual(public['hero_video_poster_url'], poster)
        self.assertNotIn('hero_video_url', public)

    @mock.patch('api.utils.youtube.requests.get')
    def test_poster_falls_back_to_hq(self, get):
        # Sin maxres YouTube devuelve 404 con una imagen gris pequeña
        get.side_effect = [_resp(404, _jpeg(120, 90)), _resp(content=_jpeg(480, 360))]
        r = self.c.patch('/api/v1/site-config/', {'hero_video_url': f'https://www.youtube.com/shorts/{VID}'},
                         format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(get.call_count, 2)
        self.assertIn('hqdefault', get.call_args_list[1][0][0])
        self.assertIn('/media/', r.json()['hero_video_poster_url'])

    @mock.patch('api.utils.youtube.requests.get', side_effect=requests.Timeout('lento'))
    def test_poster_failure_still_saves_the_video(self, get):
        r = self.c.patch('/api/v1/site-config/', {
            'hero_mode': 'video', 'hero_video_url': f'https://www.youtube.com/watch?v={VID}',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['hero_video_poster_url'], '')
        self.assertEqual(SiteConfig.load().hero_mode, 'video')

    @mock.patch('api.utils.youtube.requests.get')
    def test_same_video_does_not_download_again(self, get):
        get.return_value = _resp(content=_jpeg())
        url = f'https://www.youtube.com/watch?v={VID}'
        self.c.patch('/api/v1/site-config/', {'hero_video_url': url}, format='json')
        self.c.patch('/api/v1/site-config/', {'hero_video_url': url, 'hero_mode': 'video'}, format='json')
        self.assertEqual(get.call_count, 1)

    @mock.patch('api.utils.youtube.requests.get')
    def test_removing_the_video_clears_the_poster(self, get):
        get.return_value = _resp(content=_jpeg())
        self.c.patch('/api/v1/site-config/', {'hero_video_url': f'https://youtu.be/{VID}'}, format='json')
        r = self.c.patch('/api/v1/site-config/', {'hero_mode': 'image', 'hero_video_url': ''}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['hero_video_poster_url'], '')
        self.assertEqual(r.json()['hero_video_id'], '')

    def test_poster_cannot_be_written_from_the_panel(self):
        self.c.patch('/api/v1/site-config/', {'hero_video_poster_url': 'https://evil.com/x.jpg'}, format='json')
        self.assertEqual(SiteConfig.load().hero_video_poster_url, '')

    def test_bad_video_link_is_rejected_in_spanish(self):
        r = self.c.patch('/api/v1/site-config/', {'hero_video_url': 'https://vimeo.com/12345'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('YouTube', r.json()['hero_video_url'][0])

    def test_video_mode_needs_a_video(self):
        r = self.c.patch('/api/v1/site-config/', {'hero_mode': 'video'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('enlace', r.json()['hero_video_url'][0])

    def test_illustration_mode(self):
        r = self.c.patch('/api/v1/site-config/', {'hero_mode': 'illustration', 'hero_illustration': 'warrior'},
                         format='json')
        self.assertEqual(r.status_code, 200, r.content)
        public = APIClient().get('/api/v1/site-config/public/').json()
        self.assertEqual(public['hero_mode'], 'illustration')
        self.assertEqual(public['hero_illustration'], 'warrior')

    def test_unknown_illustration_or_mode_is_rejected(self):
        r = self.c.patch('/api/v1/site-config/', {'hero_illustration': 'headstand'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ilustraciones', r.json()['hero_illustration'][0])
        r = self.c.patch('/api/v1/site-config/', {'hero_mode': 'gif'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('foto, vídeo o ilustración', r.json()['hero_mode'][0])
