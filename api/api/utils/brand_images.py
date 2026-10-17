"""Iconos de la app (favicon, iPhone, Android) e imagen para compartir en
redes, generados a partir de la marca del estudio.

- Icono: el «icono de la app» que sube el estudio (cuadrado). Si no hay, el
  logo si es casi cuadrado; si tampoco, la inicial del estudio sobre su color.
- Imagen para compartir (1200x630): fondo suave, logo o nombre, y la frase.

Se generan bajo demanda y se guardan en memoria del proceso hasta que cambia
la configuración (SiteConfig.updated_at).
"""
import io
import logging
import re

from PIL import Image, ImageDraw, ImageFont, ImageOps

logger = logging.getLogger(__name__)

ICON_SIZES = {16, 32, 48, 64, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512}
_cache: dict = {}
_MEDIA_RE = re.compile(r'/media/([0-9a-f-]{36})')


def _hex(color: str, fallback=(61, 50, 40)):
    try:
        c = color.lstrip('#')
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return fallback


def _load_image(url: str):
    """Abre una imagen subida (de la BD) o, si es externa, la descarga."""
    if not url:
        return None
    try:
        m = _MEDIA_RE.search(url)
        if m:
            from api.models import StoredFile
            f = StoredFile.objects.only('data').filter(id=m.group(1)).first()
            if f:
                return Image.open(io.BytesIO(bytes(f.data)))
        import requests
        r = requests.get(url, timeout=5)
        if r.ok and len(r.content) < 8 * 1024 * 1024:
            return Image.open(io.BytesIO(r.content))
    except Exception:
        logger.warning("brand_images.load_failed url=%s", url, exc_info=True)
    return None


_font_files: dict = {}


def _google_font_bytes(family: str, weight: int):
    """TTF de una fuente de Google Fonts (se descarga una vez por proceso).
    Sin User-Agent de navegador, Google sirve TTF en vez de WOFF2."""
    key = (family, weight)
    if key not in _font_files:
        _font_files[key] = None
        try:
            import requests
            css = requests.get('https://fonts.googleapis.com/css2',
                               params={'family': f'{family}:wght@{weight}'}, timeout=5,
                               headers={'User-Agent': 'Mozilla/4.0'}).text
            m = re.search(r'url\((https://[^)]+\.ttf)\)', css)
            if m:
                r = requests.get(m.group(1), timeout=8)
                if r.ok:
                    _font_files[key] = r.content
        except Exception:
            logger.info("brand_images.font_download_failed family=%s", family)
    return _font_files[key]


def _font(size: int, family: str = '', weight: int = 700):
    data = _google_font_bytes(family, weight) if family else None
    if data is None and family and weight != 400:
        data = _google_font_bytes(family, 400)
    if data:
        try:
            return ImageFont.truetype(io.BytesIO(data), size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size=size)
    except Exception:  # Pillow sin FreeType
        return ImageFont.load_default()


def _has_alpha(img: Image.Image) -> bool:
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        return img.convert('RGBA').getextrema()[3][0] < 250
    return False


def _monogram(cfg, size: int, panel: bool = False) -> Image.Image:
    bg = _hex(cfg.color_dark) if panel else _hex(cfg.color_primary, (160, 137, 124))
    img = Image.new('RGB', (size, size), bg)
    initial = (cfg.studio_name or 'S').strip()[:1].upper() or 'S'
    draw = ImageDraw.Draw(img)
    font = _font(int(size * 0.56), cfg.font_heading)
    box = draw.textbbox((0, 0), initial, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), initial, fill=(255, 255, 255), font=font)
    return img


def _source_icon(cfg):
    src = _load_image(cfg.icon_url)
    if src is None:
        logo = _load_image(cfg.logo_url)
        if logo is not None and max(logo.size) / max(1, min(logo.size)) <= 1.3:
            src = logo
    return src


def render_icon(cfg, size: int, maskable: bool = False, panel: bool = False) -> bytes:
    """panel=True: variante del panel de administración (fondo oscuro de la
    marca) para no confundirla con la app de los clientes en el móvil."""
    key = ('icon', size, maskable, panel, cfg.updated_at)
    if key in _cache:
        return _cache[key]

    src = _source_icon(cfg)
    if src is None:
        out = _monogram(cfg, size, panel)
    else:
        src = ImageOps.exif_transpose(src).convert('RGBA')
        transparent = _has_alpha(src)
        # Fondo: el color de fondo de la marca si el icono es transparente
        # (el oscuro en el panel)
        if panel:
            bg = _hex(cfg.color_dark)
        else:
            bg = _hex(cfg.color_background, (245, 240, 234)) if transparent else (255, 255, 255)
        out = Image.new('RGB', (size, size), bg)
        # Android recorta los iconos «maskable» en círculo: el dibujo debe caber
        # en el 80 % central. Los transparentes llevan además un margen.
        scale = 0.62 if maskable else (0.8 if transparent or panel else 1.0)
        inner = max(1, int(size * scale))
        fitted = ImageOps.contain(src, (inner, inner), Image.LANCZOS)
        out.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2), fitted)

    buf = io.BytesIO()
    out.save(buf, 'PNG', optimize=True)
    data = buf.getvalue()
    _cache[key] = data
    return data


def render_badge(cfg, size: int = 96) -> bytes:
    """Icono pequeño de las notificaciones (barra de estado de Android).
    Android solo usa la silueta (canal alfa): fondo transparente y figura
    blanca. Con un icono transparente se usa su forma; si no, la inicial."""
    key = ('badge', size, cfg.updated_at)
    if key in _cache:
        return _cache[key]
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    src = _source_icon(cfg)
    if src is not None:
        src = ImageOps.exif_transpose(src).convert('RGBA')
    if src is not None and _has_alpha(src):
        fitted = ImageOps.contain(src, (int(size * 0.9), int(size * 0.9)), Image.LANCZOS)
        white = Image.new('RGBA', fitted.size, (255, 255, 255, 255))
        white.putalpha(fitted.getchannel('A'))
        out.paste(white, ((size - fitted.width) // 2, (size - fitted.height) // 2), white)
    else:
        initial = (cfg.studio_name or 'S').strip()[:1].upper() or 'S'
        draw = ImageDraw.Draw(out)
        font = _font(int(size * 0.8), cfg.font_heading)
        box = draw.textbbox((0, 0), initial, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
        draw.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), initial, fill=(255, 255, 255, 255), font=font)
    buf = io.BytesIO()
    out.save(buf, 'PNG', optimize=True)
    data = buf.getvalue()
    _cache[key] = data
    return data


def render_og_image(cfg) -> bytes:
    """Imagen 1200x630 para WhatsApp, Instagram, Facebook… al compartir la web."""
    key = ('og', cfg.updated_at)
    if key in _cache:
        return _cache[key]

    W, H = 1200, 630
    bg = _hex(cfg.color_background, (245, 240, 234))
    dark = _hex(cfg.color_dark)
    primary = _hex(cfg.color_primary, (160, 137, 124))
    img = Image.new('RGB', (W, H), bg)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, H - 24, W, H], fill=primary)

    x, y = 90, 150
    logo = _load_image(cfg.logo_url)
    if logo is not None:
        logo = ImageOps.exif_transpose(logo).convert('RGBA')
        logo = ImageOps.contain(logo, (620, 200), Image.LANCZOS)
        img.paste(logo, (x, y), logo)
        y += logo.height + 50
    else:
        font = _font(96, cfg.font_heading)
        draw.text((x, y), cfg.studio_name or 'Mi Estudio', fill=dark, font=font)
        y += 150

    tagline = (cfg.tagline or cfg.description or '').strip()
    if tagline:
        font = _font(44, cfg.font_body, 400)
        words, line, lines = tagline.split(), '', []
        for w in words:
            test = f"{line} {w}".strip()
            if draw.textlength(test, font=font) > W - 2 * x:
                lines.append(line)
                line = w
            else:
                line = test
        lines.append(line)
        for ln in lines[:3]:
            draw.text((x, y), ln, fill=dark, font=font)
            y += 60

    try:
        from urllib.parse import urlparse

        from api.utils.site import web_url
        host = urlparse(web_url()).hostname or ''
        if host and host not in ('localhost', '127.0.0.1'):
            draw.text((x, H - 90), host, fill=primary, font=_font(32, cfg.font_body, 600))
    except Exception:
        pass

    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    data = buf.getvalue()
    _cache[key] = data
    return data
