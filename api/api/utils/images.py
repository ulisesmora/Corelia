"""Reducción de fotos al subirlas desde el CRM.

Las fotos de móvil llegaban a S3 tal cual (hasta 4 MB y 4000 px) y la web las
descargaba enteras. Aquí se reducen a 1920 px como máximo, se respeta la
orientación EXIF y se recomprimen. Si algo falla, se sube el archivo original.
"""
import io
import logging

logger = logging.getLogger(__name__)

MAX_SIDE = 1920
MIN_BYTES_TO_PROCESS = 350 * 1024
IMAGE_TYPES = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}


def shrink_image(fileobj, content_type: str, filename: str):
    """Devuelve (fileobj, content_type, extensión). Sin cambios si no es una
    foto, si ya es pequeña o si no se puede procesar."""
    ext = ('.' + filename.rsplit('.', 1)[-1].lower()) if '.' in filename else ''
    if (content_type or '').lower() not in IMAGE_TYPES:
        return fileobj, content_type, ext
    try:
        size = getattr(fileobj, 'size', None)
        from PIL import Image, ImageOps
        fileobj.seek(0)
        img = Image.open(fileobj)
        img.load()
        too_big = max(img.size) > MAX_SIDE
        if not too_big and (size is None or size < MIN_BYTES_TO_PROCESS):
            fileobj.seek(0)
            return fileobj, content_type, ext
        img = ImageOps.exif_transpose(img)
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        out = io.BytesIO()
        has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
        if has_alpha:
            img.save(out, 'WEBP', quality=82, method=6)
            new_type, new_ext = 'image/webp', '.webp'
        else:
            img.convert('RGB').save(out, 'JPEG', quality=82, optimize=True, progressive=True)
            new_type, new_ext = 'image/jpeg', '.jpg'
        # Si no hacía falta reducir dimensiones y recomprimir no ahorra, se
        # deja el original; una foto demasiado grande se reduce SIEMPRE.
        if size is not None and out.tell() >= size and not too_big:
            fileobj.seek(0)
            return fileobj, content_type, ext
        logger.info("upload.image.shrunk from=%s to=%s dims=%sx%s", size, out.tell(), *img.size)
        out.seek(0)
        return out, new_type, new_ext
    except Exception:
        logger.warning("upload.image.shrink_failed name=%s", filename, exc_info=True)
        try:
            fileobj.seek(0)
        except Exception:
            pass
        return fileobj, content_type, ext
