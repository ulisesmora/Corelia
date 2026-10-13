"""Endpoints que antes estaban abiertos."""
import io

from rest_framework.test import APIClient

from api.models import CreditWallet, Lead, StoredFile
from api.tests.factories import StudioTestCase, make_admin, make_client


def _png_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (2400, 1200), (200, 100, 50)).save(buf, 'PNG')
    buf.seek(0)
    buf.name = 'foto.png'
    return buf


class SecurityTests(StudioTestCase):
    def test_wallet_not_readable_anonymously_or_by_others(self):
        owner = make_client()
        wallet = CreditWallet.objects.get(user=owner)
        self.assertIn(APIClient().get(f'/api/v1/wallets/{wallet.id}/').status_code, (401, 403))
        other = APIClient()
        other.force_authenticate(make_client('otra@test.local'))
        self.assertEqual(other.get(f'/api/v1/wallets/{wallet.id}/').status_code, 404)
        mine = APIClient()
        mine.force_authenticate(owner)
        self.assertEqual(mine.get(f'/api/v1/wallets/{wallet.id}/').status_code, 200)

    def test_lead_update_only_touches_preferences_and_leaks_nothing(self):
        Lead.objects.create(name='Eva', email='eva@test.local', phone='600000000')
        r = APIClient().patch('/api/v1/checkleads/update-by-email/', {
            'email': 'eva@test.local', 'desires': 'mañanas', 'phone': '699999999', 'name': 'Hacker',
        }, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('600000000', r.content.decode())
        lead = Lead.objects.get(email='eva@test.local')
        self.assertEqual(lead.desires, 'mañanas')
        self.assertEqual(lead.phone, '600000000')
        self.assertEqual(lead.name, 'Eva')

    def test_upload_requires_admin(self):
        self.assertIn(APIClient().post('/api/upload/', {'file': _png_bytes()}).status_code, (401, 403))
        c = APIClient()
        c.force_authenticate(make_client())
        self.assertEqual(c.post('/api/upload/', {'file': _png_bytes()}).status_code, 403)


class UploadTests(StudioTestCase):
    def test_photo_is_shrunk_stored_in_db_and_served_with_cache(self):
        c = APIClient()
        c.force_authenticate(make_admin())
        r = c.post('/api/upload/', {'file': _png_bytes()})
        self.assertEqual(r.status_code, 201, r.content)
        url = r.json()['file_url']
        stored = StoredFile.objects.get()
        self.assertLessEqual(max(stored.width, stored.height), 1920)
        path = url.split('://', 1)[1].split('/', 1)[1]
        resp = self.client.get('/' + path)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('immutable', resp['Cache-Control'])
        self.assertTrue(resp['Content-Type'].startswith('image/'))
        again = self.client.get('/' + path, HTTP_IF_NONE_MATCH=resp['ETag'])
        self.assertEqual(again.status_code, 304)

    def test_unknown_media_is_404(self):
        self.assertEqual(self.client.get('/media/00000000-0000-0000-0000-000000000000.jpg').status_code, 404)
