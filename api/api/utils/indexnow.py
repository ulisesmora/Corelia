"""IndexNow (opcional): avisa al instante a Bing (que usa ChatGPT/Copilot),
Yandex, Seznam… cuando una clase se crea o cambia. Google no usa IndexNow:
para Google está /sitemap-classes.xml en la web.

Para activarlo: INDEXNOW_KEY=<clave> en el API y la misma clave en la web
(la web la publica sola en /<clave>.txt).
"""
import logging
from urllib.parse import urlparse

import requests
from django.conf import settings

from api.utils.site import web_url

logger = logging.getLogger(__name__)

ENDPOINT = 'https://api.indexnow.org/indexnow'


def class_urls(slug: str) -> list[str]:
    return [web_url(f"/classdetail/{slug}"), web_url(f"/en/classdetail/{slug}"),
            web_url("/classes"), web_url("/en/classes")]


def ping(urls: list[str]) -> bool:
    key = getattr(settings, 'INDEXNOW_KEY', '')
    site = web_url()
    if not key or not urls or not site.startswith('https://'):
        return False
    try:
        r = requests.post(ENDPOINT, json={
            'host': urlparse(site).hostname,
            'key': key,
            'keyLocation': f"{site}/{key}.txt",
            'urlList': urls,
        }, timeout=8)
        logger.info("indexnow.ping status=%s urls=%s", r.status_code, len(urls))
        return r.status_code in (200, 202)
    except Exception:
        logger.warning("indexnow.ping_failed", exc_info=True)
        return False
