"""Vídeo de YouTube de la portada.

- `youtube_id(url)`: saca el ID (11 caracteres) de cualquier enlace habitual:
  youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ (con o sin www,
  m., music., youtube-nocookie.com).
- `fetch_poster(video_id)`: descarga la miniatura (maxresdefault y, si no
  existe, hqdefault) y la guarda como StoredFile. Así la web enseña una imagen
  propia y no pide nada a Google/YouTube antes del consentimiento.
"""
import io
import logging
import re
from urllib.parse import parse_qs, urlparse

import requests

logger = logging.getLogger(__name__)

ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')
_HOSTS = {'youtube.com', 'youtu.be', 'youtube-nocookie.com'}
_PATH_PREFIXES = ('shorts', 'embed', 'live', 'v', 'e')
POSTER_TIMEOUT = 4  # segundos por intento: guardar no debe quedarse colgado


def youtube_id(url: str) -> str:
    """ID del vídeo, o '' si el enlace no es de un vídeo de YouTube."""
    raw = (url or '').strip()
    if not raw:
        return ''
    if not re.match(r'^[a-z][a-z0-9+.\-]*://', raw, re.IGNORECASE):
        raw = f'https://{raw.lstrip("/")}'
    try:
        u = urlparse(raw)
    except ValueError:
        return ''
    if u.scheme not in ('http', 'https'):
        return ''
    host = (u.hostname or '').lower()
    for prefix in ('www.', 'm.', 'music.'):
        if host.startswith(prefix):
            host = host[len(prefix):]
    if host not in _HOSTS:
        return ''
    parts = [p for p in u.path.split('/') if p]
    candidate = ''
    if host == 'youtu.be':
        candidate = parts[0] if parts else ''
    elif parts[:1] == ['watch']:
        candidate = (parse_qs(u.query).get('v') or [''])[0]
    elif len(parts) >= 2 and parts[0] in _PATH_PREFIXES:
        candidate = parts[1]
    return candidate if ID_RE.match(candidate or '') else ''


def watch_url(video_id: str) -> str:
    return f'https://www.youtube.com/watch?v={video_id}'


def fetch_poster(video_id: str) -> str:
    """URL de la miniatura guardada en /media/, o '' si no se ha podido bajar."""
    if not ID_RE.match(video_id or ''):
        return ''
    from api.models import StoredFile
    from api.utils.images import shrink_image
    from api.utils.site import api_url
    for name in ('maxresdefault', 'hqdefault'):
        url = f'https://i.ytimg.com/vi/{video_id}/{name}.jpg'
        try:
            r = requests.get(url, timeout=POSTER_TIMEOUT)
        except requests.RequestException as e:
            logger.warning("hero.poster_failed video=%s size=%s error=%s", video_id, name, e)
            continue
        content_type = (r.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        # Sin esa calidad YouTube responde 404 con una imagen gris de 120x90
        if r.status_code != 200 or not content_type.startswith('image/') or len(r.content) < 2000:
            continue
        data = r.content
        width = height = None
        try:
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                width, height = im.size
            if width and width < 200:
                continue
        except Exception:
            continue
        upload, content_type, ext = shrink_image(io.BytesIO(data), content_type, f'{name}.jpg')
        data = upload.read()
        stored = StoredFile.objects.create(
            data=data, content_type=content_type, filename=f'youtube-{video_id}-{name}.jpg'[:255],
            size=len(data), width=width, height=height,
        )
        logger.info("hero.poster_stored video=%s size=%s id=%s", video_id, name, stored.id)
        return api_url(f'/media/{stored.id}{ext or ".jpg"}')
    return ''
