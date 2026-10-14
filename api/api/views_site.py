"""Configuración del estudio desde el panel (asistente de bienvenida y
pantalla de Ajustes) y su versión pública para la web."""
import logging
import re

from django.conf import settings
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import SiteConfig
from api.utils.site import ensure_vapid_keys, get_site_config

logger = logging.getLogger(__name__)

HEX_COLOR = r'^#[0-9A-Fa-f]{6}$'
DOMAIN_RE = re.compile(r'^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')

# ── Google Business, redes, verificación y analítica ──────────────────────────
# Estos valores la web los mete en <meta> y en scripts (gtag, píxel de Meta),
# así que SOLO se guardan si cumplen el patrón exacto: nada de HTML libre.
TRACKING_PATTERNS = {
    'google_site_verification': re.compile(r'^[A-Za-z0-9_\-]{10,120}$'),
    'bing_site_verification': re.compile(r'^[A-Za-z0-9]{8,120}$'),
    'ga4_measurement_id': re.compile(r'^G-[A-Z0-9]{4,15}$'),
    'google_ads_id': re.compile(r'^AW-\d{6,15}$'),
    'google_ads_purchase_label': re.compile(r'^[A-Za-z0-9_\-]{4,60}$'),
    'google_ads_signup_label': re.compile(r'^[A-Za-z0-9_\-]{4,60}$'),
    'meta_pixel_id': re.compile(r'^\d{10,20}$'),
}
SOCIAL_URL_FIELDS = {
    'google_business_url': 500, 'google_review_url': 500,
    'facebook_url': 300, 'tiktok_url': 300, 'youtube_url': 300,
}
_META_CONTENT_RE = re.compile(r'''content\s*=\s*["']?([^"'\s>]*)''', re.IGNORECASE)


def _meta_content(value: str) -> str:
    """Si pegan la etiqueta <meta … content="X"> entera, devuelve solo X."""
    value = (value or '').strip()
    if '<' in value or 'content' in value.lower():
        m = _META_CONTENT_RE.search(value)
        return m.group(1).strip() if m else value
    # Registro TXT del método DNS de Search Console: «google-site-verification=X»
    return re.sub(r'^google-site-verification\s*[=:]\s*', '', value, flags=re.IGNORECASE)


def _clean_public_url(value: str, max_length: int) -> str:
    """URL pública http(s). Sin esquema se asume https:// (pegan «facebook.com/…»)."""
    from django.core.validators import URLValidator
    from django.core.exceptions import ValidationError as DjangoValidationError
    value = (value or '').strip()
    if not value:
        return ''
    if not re.match(r'^[a-z][a-z0-9+.\-]*:', value, re.IGNORECASE):
        value = f'https://{value.lstrip("/")}'
    try:
        URLValidator(schemes=['http', 'https'])(value)
    except DjangoValidationError:
        raise serializers.ValidationError(
            'Pega el enlace completo, que empiece por https:// (cópialo de la barra del navegador).')
    if len(value) > max_length:
        raise serializers.ValidationError(f'El enlace es demasiado largo (máximo {max_length} caracteres).')
    return value


def safe_tracking_value(field: str, value: str) -> str:
    """El valor solo si cumple su patrón (por si se editó saltándose el API)."""
    value = value or ''
    return value if TRACKING_PATTERNS[field].match(value) else ''


def safe_public_url(value: str) -> str:
    value = value or ''
    return value if re.match(r'^https?://[^\s"\'<>]+$', value) else ''


class SiteConfigSerializer(serializers.ModelSerializer):
    """Lo que el panel puede leer/editar. Los secretos son de solo escritura:
    el panel sabe si están puestos (has_*), nunca su valor."""
    smtp_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_smtp_password = serializers.SerializerMethodField()
    has_stripe = serializers.SerializerMethodField()
    stripe_mode = serializers.SerializerMethodField()
    color_primary = serializers.RegexField(HEX_COLOR, required=False)
    color_secondary = serializers.RegexField(HEX_COLOR, required=False)
    color_dark = serializers.RegexField(HEX_COLOR, required=False)
    color_background = serializers.RegexField(HEX_COLOR, required=False)
    # Sin max_length aquí: se puede pegar la etiqueta <meta> entera o el enlace
    # sin https://; el validate_* de cada uno limpia y comprueba el resultado.
    google_business_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    google_review_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    facebook_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    tiktok_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    youtube_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    google_site_verification = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    bing_site_verification = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    ga4_measurement_id = serializers.CharField(required=False, allow_blank=True, max_length=200)
    google_ads_id = serializers.CharField(required=False, allow_blank=True, max_length=200)
    google_ads_purchase_label = serializers.CharField(required=False, allow_blank=True, max_length=300)
    google_ads_signup_label = serializers.CharField(required=False, allow_blank=True, max_length=300)
    meta_pixel_id = serializers.CharField(required=False, allow_blank=True, max_length=200)
    # ── Portada ──
    hero_mode = serializers.ChoiceField(
        choices=SiteConfig.HERO_MODES, required=False,
        error_messages={'invalid_choice': 'Elige qué quieres en la portada: foto, vídeo o ilustración.'})
    hero_illustration = serializers.ChoiceField(
        choices=SiteConfig.HERO_ILLUSTRATIONS, required=False,
        error_messages={'invalid_choice': 'Elige una de las ilustraciones de la lista.'})
    hero_image_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    hero_video_url = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    hero_video_id = serializers.SerializerMethodField()
    # ── País y moneda (listas cerradas: api/utils/locale.py) ──
    currency = serializers.CharField(required=False, max_length=10)
    country = serializers.CharField(required=False, max_length=10)

    class Meta:
        model = SiteConfig
        exclude = ('id', 'stripe_secret_key', 'stripe_webhook_secret', 'stripe_webhook_id',
                   'vapid_private_key', 'vapid_public_key')
        read_only_fields = ('payments_enabled', 'stripe_publishable_key', 'updated_at', 'hero_video_poster_url')

    # ── País y moneda ──
    def validate_currency(self, value):
        from api.utils.locale import CURRENCIES
        code = (value or '').strip().upper()
        if code not in CURRENCIES:
            raise serializers.ValidationError(
                'Elige una de las monedas de la lista (' + ', '.join(CURRENCIES) + ').')
        return code

    def validate_country(self, value):
        from api.utils.locale import COUNTRIES
        code = (value or '').strip().upper()
        if code not in COUNTRIES:
            raise serializers.ValidationError('Elige el país de tu estudio en la lista.')
        return code

    # ── Portada ──
    def validate_hero_image_url(self, value):
        return _clean_public_url(value, 500)

    def validate_hero_video_url(self, value):
        from api.utils.youtube import watch_url, youtube_id
        value = (value or '').strip()
        if not value:
            return ''
        video_id = youtube_id(value)
        if not video_id:
            raise serializers.ValidationError(
                'Ese enlace no es de un vídeo de YouTube. Abre el vídeo en YouTube, pulsa «Compartir» → '
                '«Copiar» y pégalo aquí (algo como https://youtu.be/… o https://www.youtube.com/watch?v=…).')
        return watch_url(video_id)

    def validate(self, attrs):
        mode = attrs.get('hero_mode', getattr(self.instance, 'hero_mode', 'image'))
        video = attrs.get('hero_video_url', getattr(self.instance, 'hero_video_url', ''))
        if mode == 'video' and not video:
            raise serializers.ValidationError(
                {'hero_video_url': 'Pega el enlace del vídeo de YouTube que quieres en la portada.'})
        return attrs

    def get_hero_video_id(self, obj):
        from api.utils.youtube import youtube_id
        return youtube_id(obj.hero_video_url)

    def _clean_domain(self, value):
        value = (value or '').strip().lower()
        value = re.sub(r'^https?://', '', value).split('/')[0].rstrip('.')
        if value and not DOMAIN_RE.match(value):
            raise serializers.ValidationError('Escribe solo el dominio, por ejemplo www.tuestudio.com')
        return value

    def validate_web_domain(self, value):
        return self._clean_domain(value)

    def validate_panel_domain(self, value):
        return self._clean_domain(value)

    # ── Google Business y redes ──
    def validate_google_business_url(self, value):
        return _clean_public_url(value, SOCIAL_URL_FIELDS['google_business_url'])

    def validate_google_review_url(self, value):
        return _clean_public_url(value, SOCIAL_URL_FIELDS['google_review_url'])

    def validate_facebook_url(self, value):
        return _clean_public_url(value, SOCIAL_URL_FIELDS['facebook_url'])

    def validate_tiktok_url(self, value):
        return _clean_public_url(value, SOCIAL_URL_FIELDS['tiktok_url'])

    def validate_youtube_url(self, value):
        return _clean_public_url(value, SOCIAL_URL_FIELDS['youtube_url'])

    # ── Verificación de buscadores ──
    def _check(self, field, value, message):
        if value and not TRACKING_PATTERNS[field].match(value):
            raise serializers.ValidationError(message)
        return value

    def validate_google_site_verification(self, value):
        return self._check('google_site_verification', _meta_content(value),
                           'Pega el código de verificación de Google Search Console (lo que va dentro de '
                           'content="…") o la etiqueta <meta name="google-site-verification"> entera.')

    def validate_bing_site_verification(self, value):
        return self._check('bing_site_verification', _meta_content(value),
                           'Pega el código de Bing Webmaster Tools (lo que va dentro de content="…") '
                           'o la etiqueta <meta name="msvalidate.01"> entera.')

    # ── Analítica y publicidad ──
    def validate_ga4_measurement_id(self, value):
        value = re.sub(r'\s+', '', value or '').upper()
        return self._check('ga4_measurement_id', value,
                           'Pega el ID de medición de Google Analytics, el que empieza por G-, como G-AB12CD34EF '
                           '(Administrar → Flujos de datos → tu web).')

    def validate_google_ads_id(self, value):
        value = re.sub(r'\s+', '', value or '').upper()
        # Si pegan el send_to completo («AW-123456789/AbC…»), nos quedamos con el ID
        value = value.split('/')[0]
        return self._check('google_ads_id', value,
                           'Pega el ID de Google Ads que empieza por AW-, como AW-123456789.')

    def _ads_label(self, field, value):
        value = re.sub(r'\s+', '', value or '')
        if '/' in value:  # «AW-123456789/AbCdEf» → «AbCdEf»
            value = value.split('/', 1)[1]
        return self._check(field, value,
                           'Pega la etiqueta de la conversión de Google Ads (lo que va después de la barra en '
                           '«AW-123456789/etiqueta»): solo letras, números, guiones y guiones bajos.')

    def validate_google_ads_purchase_label(self, value):
        return self._ads_label('google_ads_purchase_label', value)

    def validate_google_ads_signup_label(self, value):
        return self._ads_label('google_ads_signup_label', value)

    def validate_meta_pixel_id(self, value):
        value = re.sub(r'\s+', '', value or '')
        return self._check('meta_pixel_id', value,
                           'Pega el identificador del píxel de Meta: solo números, entre 10 y 20 cifras '
                           '(Administrador de eventos → Orígenes de datos).')

    def get_has_smtp_password(self, obj):
        return bool(obj.smtp_password)

    def get_has_stripe(self, obj):
        return bool(obj.payments_enabled and obj.stripe_secret_key)

    def get_stripe_mode(self, obj):
        key = obj.stripe_secret_key or ''
        if not key:
            return None
        return 'live' if key.startswith(('sk_live_', 'rk_live_')) else 'test'

    def update(self, instance, validated_data):
        # Contraseña vacía = no cambiarla (el panel no la conoce)
        if not validated_data.get('smtp_password'):
            validated_data.pop('smtp_password', None)
        # Vídeo nuevo → copia propia de su miniatura (la web no pide nada a
        # YouTube hasta que la visitante acepta). Si falla, queda vacía y se
        # vuelve a intentar la próxima vez que se guarde el mismo enlace.
        if 'hero_video_url' in validated_data and (
                validated_data['hero_video_url'] != instance.hero_video_url
                or not instance.hero_video_poster_url):
            from api.utils.youtube import fetch_poster, youtube_id
            new_id = youtube_id(validated_data['hero_video_url'])
            validated_data['hero_video_poster_url'] = fetch_poster(new_id) if new_id else ''
        return super().update(instance, validated_data)


def _payment_currencies() -> list:
    """[{currency, count}] de los pagos cobrados, por moneda (sin distinguir
    mayúsculas: los pagos antiguos la guardaban en minúsculas)."""
    from collections import Counter
    from api.models import Payment
    counts = Counter(
        (c or 'EUR').upper()
        for c in Payment.objects.filter(status__in=['succeeded', 'refunded']).values_list('currency', flat=True)
    )
    return [{'currency': c, 'count': n} for c, n in counts.most_common()]


def _web_url():
    from api.utils.site import web_url
    return web_url()


def _hero_payload(cfg: SiteConfig) -> dict:
    from api.utils.youtube import youtube_id
    modes = {m for m, _ in SiteConfig.HERO_MODES}
    poses = {p for p, _ in SiteConfig.HERO_ILLUSTRATIONS}
    return {
        'hero_mode': cfg.hero_mode if cfg.hero_mode in modes else 'image',
        'hero_image_url': safe_public_url(cfg.hero_image_url),
        'hero_video_id': youtube_id(cfg.hero_video_url),
        'hero_video_poster_url': safe_public_url(cfg.hero_video_poster_url),
        'hero_illustration': cfg.hero_illustration if cfg.hero_illustration in poses else 'reformer',
    }


def public_config_payload(cfg: SiteConfig) -> dict:
    from api.utils.locale import normalize_country, normalize_currency
    from api.utils.payments import payments_enabled, stripe_keys
    vapid_public, _ = ensure_vapid_keys(cfg)
    return {
        'studio_name': cfg.studio_name,
        'tagline': cfg.tagline,
        'description': cfg.description,
        'tagline_en': cfg.tagline_en,
        'description_en': cfg.description_en,
        'logo_url': cfg.logo_url,
        'logo_light_url': cfg.logo_light_url or cfg.logo_url,
        'favicon_url': cfg.favicon_url or cfg.logo_url,
        'og_image_url': cfg.og_image_url,
        'contact': {
            'email': cfg.contact_email,
            'phone': cfg.phone,
            'whatsapp': cfg.whatsapp,
            'instagram': cfg.instagram,
            'address': cfg.address,
            'city': cfg.city,
            'postal_code': cfg.postal_code,
            'country': cfg.country,
            'maps_url': cfg.maps_url,
            'latitude': float(cfg.latitude) if cfg.latitude is not None else None,
            'longitude': float(cfg.longitude) if cfg.longitude is not None else None,
            'area_served': [a.strip() for a in cfg.area_served.split(',') if a.strip()],
        },
        'content': {
            'hero_title': cfg.hero_title, 'hero_title_en': cfg.hero_title_en,
            'hero_subtitle': cfg.hero_subtitle, 'hero_subtitle_en': cfg.hero_subtitle_en,
            'about_title': cfg.about_title, 'about_title_en': cfg.about_title_en,
            'about_text': cfg.about_text, 'about_text_en': cfg.about_text_en,
            'about_image_url': cfg.about_image_url,
        },
        'icons': {
            'favicon': '/api/v1/site-config/icon/32.png',
            'apple_touch': '/api/v1/site-config/icon/180.png',
            'icon_192': '/api/v1/site-config/icon/192.png',
            'icon_512': '/api/v1/site-config/icon/512.png',
            'maskable_512': '/api/v1/site-config/icon/512.png?maskable=1',
            'og_image': cfg.og_image_url or '/api/v1/site-config/og.png',
            'badge': '/api/v1/site-config/badge.png',
        },
        # Portada: foto, vídeo de YouTube (solo el ID y el póster propio) o ilustración
        **_hero_payload(cfg),
        'legal': {'name': cfg.legal_name, 'tax_id': cfg.tax_id},
        'theme': {
            'primary': cfg.color_primary,
            'secondary': cfg.color_secondary,
            'dark': cfg.color_dark,
            'background': cfg.color_background,
            'font_heading': cfg.font_heading,
            'font_body': cfg.font_body,
            'style': cfg.style_preset,
            'icons': cfg.icon_style,
        },
        'currency': normalize_currency(cfg.currency),
        'country': normalize_country(cfg.country),
        'drop_in_price': str(cfg.drop_in_price),
        'timezone': settings.STUDIO_TIMEZONE,
        'cancel_min_hours': settings.BOOKING_CANCEL_MIN_HOURS,
        'payments_enabled': payments_enabled(),
        'stripe_publishable_key': stripe_keys()[1] if payments_enabled() else '',
        'google_login_enabled': bool(cfg.google_client_id),
        'google_client_id': cfg.google_client_id,
        'vapid_public_key': vapid_public,
        'setup_completed': cfg.setup_completed,
        'site_url': _web_url(),
        # Google Business y redes (enlaces públicos)
        **{f: safe_public_url(getattr(cfg, f)) for f in SOCIAL_URL_FIELDS},
        # Verificación de buscadores y analítica/publicidad: IDs públicos que la
        # web solo usa en <meta> o, con consentimiento, en gtag / píxel de Meta
        **{f: safe_tracking_value(f, getattr(cfg, f)) for f in TRACKING_PATTERNS},
    }


class SiteConfigPublicView(APIView):
    """GET /api/v1/site-config/public/ — marca, contacto y aspecto para la web.
    Sin secretos. Cacheable unos minutos."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        resp = Response(public_config_payload(get_site_config()))
        resp['Cache-Control'] = 'public, max-age=60'
        return resp


class SiteConfigAdminView(APIView):
    """GET/PATCH /api/v1/site-config/ — ajustes del estudio desde el panel."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        cfg = SiteConfig.load()
        data = SiteConfigSerializer(cfg).data
        from api.utils.site import api_url, stripe_webhook_url, web_url
        data['webhook_url'] = stripe_webhook_url()
        data['api_url'] = api_url()
        data['web_url'] = web_url()
        data['default_web_url'] = settings.WEB_URL
        data['default_api_url'] = settings.API_URL
        from api.utils.emailing import email_enabled
        data['email_ready'] = email_enabled()
        # Avisos al móvil: cuántas clientas los tienen activados (app instalada)
        from api.models import PushSubscription
        subs = PushSubscription.objects.all()
        data['push_devices'] = subs.count()
        data['push_clients'] = subs.values('user_id').distinct().count()
        # País y moneda: listas para los selectores y pagos ya cobrados en
        # otras monedas (cambiar la moneda NO convierte importes).
        from api.utils.locale import locale_options
        data['locale_options'] = locale_options()
        data['payment_currencies'] = _payment_currencies()
        return Response(data)

    def patch(self, request):
        cfg = SiteConfig.load()
        before = (cfg.address, cfg.city, cfg.postal_code)
        panel_before = cfg.panel_domain
        ser = SiteConfigSerializer(cfg, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        cfg = ser.save()
        # Dirección nueva → coordenadas nuevas (salvo que se manden a mano)
        if (cfg.address, cfg.city, cfg.postal_code) != before and 'latitude' not in request.data:
            from api.utils.geocode import geocode
            coords = geocode(cfg.address, cfg.city, cfg.postal_code, cfg.country)
            cfg.latitude, cfg.longitude = coords if coords else (None, None)
            cfg.save(update_fields=['latitude', 'longitude', 'updated_at'])
        # Panel en otro dominio → el aviso de pagos de Stripe tiene que ir al nuevo
        if cfg.panel_domain != panel_before and cfg.payments_enabled and cfg.stripe_secret_key:
            try:
                from api.utils.payments import connect_stripe
                from api.utils.site import stripe_webhook_url
                result = connect_stripe(cfg.stripe_secret_key, stripe_webhook_url())
                cfg.stripe_webhook_id = result['webhook_id']
                cfg.stripe_webhook_secret = result['webhook_secret']
                cfg.save(update_fields=['stripe_webhook_id', 'stripe_webhook_secret', 'updated_at'])
                logger.info("site_config.stripe_webhook_moved domain=%s", cfg.panel_domain)
            except Exception:
                logger.exception("site_config.stripe_webhook_move_failed")
        logger.info("site_config.updated fields=%s admin_id=%s",
                    sorted(k for k in request.data.keys() if k != 'smtp_password'), request.user.id)
        _ping_search_engines()
        return self.get(request)


class SiteConfigTestEmailView(APIView):
    """POST /api/v1/site-config/test-email/ {to?, smtp_*?}
    Prueba la configuración SMTP. Si vienen campos smtp_* se prueban SIN
    guardar (para que el asistente valide antes de activar)."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        from api.utils.emailing import send_test_email
        to = (request.data.get('to') or request.user.email or '').strip()
        override = None
        if request.data.get('smtp_host'):
            cfg = SiteConfig.load()
            password = request.data.get('smtp_password') or cfg.smtp_password
            use_ssl = bool(request.data.get('smtp_use_ssl', False))
            override = {
                'host': request.data['smtp_host'].strip(),
                'port': int(request.data.get('smtp_port') or 587),
                'username': (request.data.get('smtp_user') or '').strip(),
                'password': password,
                'use_ssl': use_ssl,
                'use_tls': (not use_ssl) and bool(request.data.get('smtp_use_tls', True)),
                'from_address': (request.data.get('email_from_address') or request.data.get('smtp_user') or '').strip(),
                'from_name': (request.data.get('email_from_name') or cfg.studio_name),
            }
        try:
            send_test_email(to, smtp_override=override)
        except Exception as e:
            logger.warning("site_config.test_email_failed error=%s", e)
            return Response({'ok': False, 'error': _explain_smtp_error(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'ok': True, 'to': to})


def _explain_smtp_error(e) -> str:
    """Traduce los errores SMTP típicos a algo que se entienda."""
    import smtplib
    import socket
    msg = str(e)
    if isinstance(e, (smtplib.SMTPAuthenticationError, smtplib.SMTPServerDisconnected)):
        return ('El servidor ha rechazado el usuario o la contraseña. Revisa que la dirección esté bien escrita. '
                'Si usas Gmail, necesitas una '
                '«contraseña de aplicación» (no tu contraseña normal): Cuenta de Google → Seguridad → '
                'Verificación en 2 pasos → Contraseñas de aplicaciones.')
    if isinstance(e, (socket.timeout, TimeoutError)) or 'timed out' in msg:
        return 'El servidor no responde. Revisa el servidor y el puerto (Gmail: smtp.gmail.com, 587).'
    if isinstance(e, (socket.gaierror, ConnectionRefusedError)):
        return 'No se encuentra ese servidor. Revisa que esté bien escrito (p. ej. smtp.gmail.com).'
    if isinstance(e, smtplib.SMTPSenderRefused):
        return 'El servidor no permite enviar desde esa dirección. Usa la misma dirección que el usuario.'
    return f'No se pudo enviar: {msg}'


class SiteConfigStripeView(APIView):
    """POST /api/v1/site-config/stripe/ {secret_key, publishable_key}
    Conecta Stripe: valida la clave y crea el webhook automáticamente.
    DELETE desconecta (los pagos online se apagan)."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        from api.utils.payments import connect_stripe
        secret = (request.data.get('secret_key') or '').strip()
        publishable = (request.data.get('publishable_key') or '').strip()
        if not publishable.startswith(('pk_live_', 'pk_test_')):
            return Response({'error': 'Falta la clave publicable (empieza por pk_live_ o pk_test_).'},
                            status=status.HTTP_400_BAD_REQUEST)
        if secret.startswith(('sk_live_', 'rk_live_')) != publishable.startswith('pk_live_'):
            return Response({'error': 'Las dos claves deben ser del mismo modo (las dos «live» o las dos «test»).'},
                            status=status.HTTP_400_BAD_REQUEST)
        from api.utils.site import stripe_webhook_url
        webhook_url = stripe_webhook_url()
        if webhook_url.startswith('http://'):
            return Response({'error': 'Stripe necesita que el servidor tenga https. Conecta Stripe '
                                      'una vez desplegado (no funciona en local).'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            result = connect_stripe(secret, webhook_url)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        cfg = SiteConfig.load()
        cfg.stripe_secret_key = secret
        cfg.stripe_publishable_key = publishable
        cfg.stripe_webhook_secret = result['webhook_secret']
        cfg.stripe_webhook_id = result['webhook_id']
        cfg.payments_enabled = True
        cfg.save()
        logger.info("site_config.stripe_connected account=%s live=%s admin_id=%s",
                    result['account_id'], result['live_mode'], request.user.id)
        from api.utils.locale import studio_currency
        return Response({
            'ok': True, 'account_name': result['account_name'], 'live_mode': result['live_mode'],
            # Si no coinciden, el panel avisa: Stripe convierte cada cobro (con comisión)
            'stripe_currency': result.get('default_currency', ''),
            'studio_currency': studio_currency(),
        })

    def delete(self, request):
        cfg = SiteConfig.load()
        if cfg.stripe_secret_key and cfg.stripe_webhook_id:
            try:
                import stripe
                stripe.StripeClient(cfg.stripe_secret_key).v1.webhook_endpoints.delete(cfg.stripe_webhook_id)
            except Exception:
                logger.warning("site_config.stripe_webhook_delete_failed", exc_info=True)
        cfg.payments_enabled = False
        cfg.stripe_secret_key = ''
        cfg.stripe_webhook_secret = ''
        cfg.stripe_webhook_id = ''
        cfg.save()
        logger.info("site_config.stripe_disconnected admin_id=%s", request.user.id)
        return Response({'ok': True})


# ─── Iconos e imagen para compartir ───────────────────────────────────────────

from django.http import Http404, HttpResponse  # noqa: E402


class SiteIconView(APIView):
    """GET /api/v1/site-config/icon/<size>.png[?maskable=1] — icono de la app
    (favicon, iPhone, Android) generado desde la marca del estudio."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, size):
        from api.utils.brand_images import ICON_SIZES, render_icon
        if size not in ICON_SIZES:
            raise Http404
        cfg = get_site_config()
        maskable = request.query_params.get('maskable') in ('1', 'true')
        panel = request.query_params.get('variant') == 'panel'
        etag = f'"icon-{size}-{int(maskable)}-{int(panel)}-{int(cfg.updated_at.timestamp())}"'
        if request.headers.get('If-None-Match') == etag:
            return HttpResponse(status=304)
        resp = HttpResponse(render_icon(cfg, size, maskable, panel), content_type='image/png')
        resp['Cache-Control'] = 'public, max-age=86400'
        resp['ETag'] = etag
        return resp


class SiteBadgeView(APIView):
    """GET /api/v1/site-config/badge.png — icono monocromo de las notificaciones."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from api.utils.brand_images import render_badge
        resp = HttpResponse(render_badge(get_site_config()), content_type='image/png')
        resp['Cache-Control'] = 'public, max-age=86400'
        return resp


class SiteOgImageView(APIView):
    """GET /api/v1/site-config/og.png — imagen al compartir la web (1200x630)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from api.utils.brand_images import render_og_image
        cfg = get_site_config()
        resp = HttpResponse(render_og_image(cfg), content_type='image/png')
        resp['Cache-Control'] = 'public, max-age=86400'
        return resp


# ─── Preguntas frecuentes y testimonios ───────────────────────────────────────

from rest_framework import viewsets  # noqa: E402

from api.models import FAQItem, Testimonial  # noqa: E402


class FAQItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQItem
        fields = ('id', 'question', 'answer', 'question_en', 'answer_en', 'page', 'order', 'is_active', 'is_sample')
        # Solo seed_demo crea preguntas de ejemplo; al editarla deja de serlo (perform_update)
        read_only_fields = ('is_sample',)


class TestimonialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimonial
        fields = ('id', 'author', 'text', 'text_en', 'rating', 'source', 'photo_url', 'order', 'is_active')


class _PublicReadAdminWrite(viewsets.ModelViewSet):
    """Lectura pública (solo los activos); escritura solo administración."""
    pagination_class = None

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        qs = self.queryset.model.objects.all()
        user = self.request.user
        if not (user and user.is_staff):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save()
        _ping_search_engines()

    def perform_update(self, serializer):
        serializer.save()
        _ping_search_engines()

    def perform_destroy(self, instance):
        instance.soft_delete()
        _ping_search_engines()


class FAQItemViewSet(_PublicReadAdminWrite):
    """/api/v1/faqs/ — ?page=home|prices filtra por página."""
    queryset = FAQItem.objects.all()
    serializer_class = FAQItemSerializer

    def perform_update(self, serializer):
        # Editada por el estudio → ya es suya: se publica como FAQPage
        serializer.save(is_sample=False)
        _ping_search_engines()

    def get_queryset(self):
        qs = super().get_queryset()
        page = self.request.query_params.get('page')
        if page in ('home', 'prices'):
            qs = qs.filter(page__in=(page, 'both'))
        return qs


class TestimonialViewSet(_PublicReadAdminWrite):
    queryset = Testimonial.objects.all()
    serializer_class = TestimonialSerializer


def _ping_search_engines():
    """Avisa a Bing/IndexNow de que la portada y los precios han cambiado."""
    try:
        from api.utils.indexnow import ping
        from api.utils.site import web_url
        ping([web_url('/'), web_url('/en'), web_url('/prices'), web_url('/llms.txt')])
    except Exception:
        logger.warning("indexnow.content_ping_failed", exc_info=True)


def panel_manifest(request):
    """/panel.webmanifest — la app del panel en el móvil, con el nombre y el
    icono (variante oscura) del estudio."""
    from django.http import JsonResponse
    cfg = get_site_config()
    full = f'Panel {cfg.studio_name}'.strip()
    icon = '/api/v1/site-config/icon/{size}.png?variant=panel'
    resp = JsonResponse({
        'id': '/',
        'name': f'{cfg.studio_name} · Panel',
        # iOS/Android cortan a ~12 caracteres; el icono oscuro ya distingue el panel
        'short_name': full if len(full) <= 12 else 'Panel',
        'description': f'Panel de {cfg.studio_name}: reservas, clientas, horarios y ventas',
        'start_url': '/',
        'scope': '/',
        'display': 'standalone',
        'orientation': 'any',
        'background_color': cfg.color_background,
        'theme_color': cfg.color_dark,
        'lang': 'es',
        'icons': [
            {'src': icon.format(size=192), 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': icon.format(size=512), 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': icon.format(size=512) + '&maskable=1', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }, content_type='application/manifest+json')
    resp['Cache-Control'] = 'public, max-age=300'
    return resp


class SiteConfigCheckDomainView(APIView):
    """POST /api/v1/site-config/check-domain/ {domain, kind: 'web'|'panel'}
    Comprueba que un dominio propio ya llega a esta instalación (DNS bien
    configurado y certificado https emitido) antes de guardarlo."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        import requests
        ser = SiteConfigSerializer()
        try:
            domain = ser._clean_domain(request.data.get('domain'))
        except serializers.ValidationError as e:
            return Response({'ok': False, 'error': e.detail[0]}, status=status.HTTP_400_BAD_REQUEST)
        if not domain:
            return Response({'ok': False, 'error': 'Escribe el dominio.'}, status=status.HTTP_400_BAD_REQUEST)
        kind = request.data.get('kind', 'web')
        path = '/healthz' if kind == 'panel' else '/'
        try:
            r = requests.get(f'https://{domain}{path}', timeout=10, allow_redirects=True)
        except requests.exceptions.SSLError:
            return Response({'ok': False, 'domain': domain, 'error':
                'El dominio ya apunta a algún sitio, pero el certificado de seguridad (https) aún no está listo. '
                'Railway lo crea solo en unos minutos después de que el DNS funcione: vuelve a probar en un rato.'})
        except requests.exceptions.ConnectionError:
            return Response({'ok': False, 'domain': domain, 'error':
                'Todavía no se puede abrir ese dominio. Si acabas de crear el registro DNS, puede tardar desde '
                'unos minutos hasta unas horas. Revisa que el registro CNAME esté bien escrito.'})
        except requests.exceptions.Timeout:
            return Response({'ok': False, 'domain': domain, 'error': 'El dominio no responde. Vuelve a probar en unos minutos.'})
        if kind == 'panel':
            ok = r.ok and r.text.strip() == 'ok'
        else:
            ok = r.ok
        if not ok:
            return Response({'ok': False, 'domain': domain, 'error':
                f'El dominio responde, pero no muestra {"tu panel" if kind == "panel" else "tu web"} (código {r.status_code}). '
                'Revisa que lo hayas añadido en el servicio correcto de Railway.'})
        return Response({'ok': True, 'domain': domain})
