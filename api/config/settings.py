"""
Ajustes de Django para Corelia.

Todo lo que cambia entre instalaciones viene de VARIABLES DE ENTORNO (ver
.env.example en la raíz del repo). No hay ningún valor por defecto que apunte
a servicios reales: sin configurar nada, el proyecto arranca en modo local
(SQLite, tareas en el mismo proceso, emails desactivados).

Lo que configura el propio estudio desde el panel (nombre, colores, emails,
Stripe…) NO está aquí: vive en la base de datos (modelo SiteConfig) y se
edita en el asistente de bienvenida del panel, sin redesplegar.
"""
import os
from datetime import timedelta
from pathlib import Path

from celery.schedules import crontab
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / '.env')  # .env en la raíz del monorepo (desarrollo)
load_dotenv(BASE_DIR / '.env')


def env(name, default=None):
    value = os.getenv(name)
    return default if value is None or value == '' else value


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None or value == '':
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default=''):
    return [v.strip() for v in (env(name, default) or '').split(',') if v.strip()]


# ── Básicos ───────────────────────────────────────────────────────────────────
DEBUG = env_bool('DEBUG', False)

SECRET_KEY = env('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG or env_bool('ALLOW_INSECURE_SECRET', False):
        SECRET_KEY = 'insecure-local-development-key-change-me'
    else:
        raise ImproperlyConfigured(
            'Falta SECRET_KEY. Genera una con: python -c "import secrets; print(secrets.token_urlsafe(50))" '
            '(la plantilla de Railway la crea sola). Para desarrollo local usa DEBUG=1.'
        )

# URLs públicas. En Railway se rellenan solas con los dominios de cada servicio.
#   API_URL → donde vive este backend (y el panel de administración)
#   WEB_URL → la web pública de reservas
_railway_domain = env('RAILWAY_PUBLIC_DOMAIN')
API_URL = (env('API_URL') or (f'https://{_railway_domain}' if _railway_domain else 'http://localhost:8000')).rstrip('/')
WEB_URL = (env('WEB_URL') or 'http://localhost:4321').rstrip('/')

# Por defecto se acepta cualquier dominio: así el estudio puede poner su
# dominio propio desde el panel sin tocar variables. Es seguro en Railway,
# Render, Fly… porque su proxy solo envía a este servicio los dominios que el
# estudio ha añadido, y los enlaces de los emails no se construyen con la
# cabecera Host sino con los dominios guardados en la configuración.
# Quien lo sirva directamente (sin proxy) debe fijar ALLOWED_HOSTS.
ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', '*')

CSRF_TRUSTED_ORIGINS = list({API_URL, WEB_URL, *env_list('CSRF_TRUSTED_ORIGINS')})
CORS_ALLOWED_ORIGINS = list({WEB_URL, API_URL, *env_list('CORS_ALLOWED_ORIGINS')})
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOW_HEADERS = ['*']

# Detrás del proxy HTTPS de Railway/Render/Fly
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Cabeceras de seguridad (SecurityMiddleware y XFrameOptionsMiddleware).
# El navegador no adivina tipos de archivo, no deja meter el panel en un
# <iframe> de otra web y solo envía el dominio (no la ruta) a otras webs.
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
if not DEBUG:
    # HSTS: «este dominio solo por HTTPS» durante un año. Django solo la envía
    # en respuestas HTTPS. includeSubDomains va APAGADO por defecto: si el
    # estudio usa su dominio propio (panel.tuestudio.com), afectaría también a
    # otros subdominios suyos que quizá no tengan HTTPS. Actívalo solo si sabes
    # que todos tus subdominios tienen HTTPS.
    SECURE_HSTS_SECONDS = int(env('SECURE_HSTS_SECONDS', str(365 * 24 * 3600)))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool('SECURE_HSTS_INCLUDE_SUBDOMAINS', False)
    SECURE_HSTS_PRELOAD = env_bool('SECURE_HSTS_PRELOAD', False)
    # Cookies (admin de Django) solo por HTTPS. SECURE_COOKIES=0 para servirlo
    # sin HTTPS en una red local.
    SESSION_COOKIE_SECURE = env_bool('SECURE_COOKIES', True)
    CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
    # Railway, Render y Fly ya redirigen http → https en su proxy. Quien sirva
    # el API directamente puede activarlo aquí (/healthz sigue por http).
    SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', False)
    SECURE_REDIRECT_EXEMPT = [r'^healthz$']
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'

# Zona horaria del estudio: horarios, recordatorios y tareas nocturnas.
STUDIO_TIMEZONE = env('STUDIO_TIMEZONE', 'Europe/Madrid')

# Plazo mínimo para que una clienta cancele su reserva (el estudio puede siempre).
# La web lo recibe de /api/v1/site-config/public/ para mostrar el mismo valor.
BOOKING_CANCEL_MIN_HOURS = int(env('BOOKING_CANCEL_MIN_HOURS', '8'))

# Dominio inventado para clientas dadas de alta en el panel sin email.
# .invalid es un dominio reservado: nunca se le envía nada.
PLACEHOLDER_EMAIL_DOMAIN = env('PLACEHOLDER_EMAIL_DOMAIN', 'sin-email.invalid')


# ── Aplicación ────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'whitenoise.runserver_nostatic',
    'django.contrib.staticfiles',
    'api',
    'rest_framework',
    'django_filters',
    'corsheaders',
    'drf_spectacular',
]

MIDDLEWARE = [
    # Primero: mide la duración completa y asigna el request_id a todos los logs
    'api.logging_utils.RequestLogMiddleware',
    # Rechaza (413) peticiones más grandes que MAX_REQUEST_MB antes de leerlas
    'api.middleware.RequestSizeLimitMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
AUTH_USER_MODEL = 'api.User'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': (
        'api.renderers.ORJSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ),
    # El JWT pasa además por la comprobación de «verificación en dos pasos
    # obligatoria» del estudio (api/authentication.py).
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'api.authentication.PanelJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_FILTER_BACKENDS': ['django_filters.rest_framework.DjangoFilterBackend'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    # 429 con un mensaje en español claro (ver api/throttling.py)
    'EXCEPTION_HANDLER': 'api.throttling.exception_handler',
}


# ── Seguridad: límites de peticiones, bloqueo de cuentas y captcha ───────────
# Todo funciona sin configurar nada; las variables solo ajustan los valores.
# Ver docs/SEGURIDAD.md.
#
# Límites por IP y por email (formato «número/periodo»: 10/m, 5/15m, 20/h, 50/d).
# Cada uno se cambia con THROTTLE_<NOMBRE>, p. ej. THROTTLE_LOGIN=20/m.
# RATE_LIMITS_ENABLED=0 los apaga todos (no recomendado en producción).
RATE_LIMITS_ENABLED = env_bool('RATE_LIMITS_ENABLED', True)
_THROTTLE_DEFAULTS = {
    'login': '10/m',                # entrar (panel, clientas, Google) por IP
    'login_email': '30/h',          # entrar, por cuenta (además del bloqueo de abajo)
    'two_factor': '10/m',           # segundo paso (código de 6 dígitos) por IP
    'two_factor_manage': '20/h',    # activar/desactivar la verificación en dos pasos, por usuario
    'signup': '20/h',               # crear cuenta de clienta, por IP
    'password_reset': '10/h',       # pedir el enlace de nueva contraseña, por IP
    'password_reset_email': '3/h',  # … y por email
    'password_reset_confirm': '20/h',
    'email_verify': '20/h',         # códigos/enlaces de verificación de email, por IP o usuario
    'email_verify_email': '5/h',    # reenviar el código, por email
    'checkout': '30/h',             # pago como invitada (crea ficha y sesión de Stripe), por IP
    'public_form': '30/h',          # formularios públicos (contacto, preferencias, cupones)
    'test_email': '10/h',           # email de prueba del panel, por usuario
    'stripe_connect': '30/h',       # «Conectar pagos»: enlaces de Stripe y comprobar estado, por usuario
    'payment_methods': '120/h',     # «Formas de pago en tu web»: leer, encender/apagar y verificar dominios
}
THROTTLE_RATES = {scope: env(f'THROTTLE_{scope.upper()}', rate) for scope, rate in _THROTTLE_DEFAULTS.items()}
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = THROTTLE_RATES

# Proxies de confianza para saber la IP real de quien llama (X-Forwarded-For).
# Las direcciones privadas (redes internas de Railway, Docker…) ya se consideran
# de confianza; aquí se pueden añadir rangos públicos (CIDR, separados por comas).
TRUSTED_PROXY_CIDRS = env_list('TRUSTED_PROXY_CIDRS')

# Bloqueo temporal de una cuenta tras N contraseñas (o códigos) fallidos seguidos.
LOGIN_LOCKOUT_ATTEMPTS = int(env('LOGIN_LOCKOUT_ATTEMPTS', '5'))
LOGIN_LOCKOUT_MINUTES = int(env('LOGIN_LOCKOUT_MINUTES', '15'))
# Tras cuántos fallos (por IP o por email) se pide el captcha al entrar.
LOGIN_CAPTCHA_AFTER = int(env('LOGIN_CAPTCHA_AFTER', '3'))

# Captcha Cloudflare Turnstile (opcional, gratuito y sin cookies de seguimiento).
# Vacías = desactivado. Claves en dash.cloudflare.com → Turnstile.
TURNSTILE_SITE_KEY = env('TURNSTILE_SITE_KEY', '')
TURNSTILE_SECRET_KEY = env('TURNSTILE_SECRET_KEY', '')
TURNSTILE_TIMEOUT = float(env('TURNSTILE_TIMEOUT', '5'))

# Verificación en dos pasos (panel): cuánto dura el paso intermedio entre la
# contraseña y el código de 6 dígitos.
TWO_FACTOR_PENDING_SECONDS = int(env('TWO_FACTOR_PENDING_SECONDS', '300'))
TWO_FACTOR_ISSUER = env('TWO_FACTOR_ISSUER', '')  # vacío = nombre del estudio

SPECTACULAR_SETTINGS = {'TITLE': 'Corelia API', 'VERSION': '1.0.0'}

# Sesiones largas a propósito (las clientas usan la app instalada en el móvil y
# no queremos pedirles la contraseña cada semana), pero firmadas con la
# SECRET_KEY de cada instalación y sin caducidad infinita.
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=int(env('JWT_ACCESS_DAYS', '30'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(env('JWT_REFRESH_DAYS', '90'))),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'SIGNING_KEY': SECRET_KEY,
    'TOKEN_OBTAIN_SERIALIZER': 'api.serializers.CustomTokenObtainPairSerializer',
}


# ── Base de datos ─────────────────────────────────────────────────────────────
# DATABASE_URL (postgresql://user:pass@host:port/db). En Railway se referencia
# la del servicio Postgres. Sin ella: SQLite local (solo para probar).
_db_url = env('DATABASE_URL')
if _db_url:
    from urllib.parse import unquote, urlparse
    _p = urlparse(_db_url)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': _p.path.lstrip('/'),
            'USER': unquote(_p.username or ''),
            'PASSWORD': unquote(_p.password or ''),
            'HOST': _p.hostname or 'localhost',
            'PORT': str(_p.port or 5432),
            'CONN_MAX_AGE': 60,
            'CONN_HEALTH_CHECKS': True,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es'
TIME_ZONE = 'UTC'  # en BD siempre UTC; la hora "de pared" del estudio es STUDIO_TIMEZONE
USE_I18N = True
USE_TZ = True


# ── Archivos ──────────────────────────────────────────────────────────────────
# Estáticos (admin de Django + panel) servidos por WhiteNoise: sin S3 ni CDN.
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

# Panel de administración (build de /crm). En la imagen Docker se copia aquí y
# Django lo sirve en la raíz del dominio del API: un solo servicio, sin CORS.
PANEL_DIST_DIR = Path(env('PANEL_DIST_DIR', str(BASE_DIR / 'panel_dist')))
WHITENOISE_ROOT = PANEL_DIST_DIR if PANEL_DIST_DIR.exists() else None


def _panel_asset_is_immutable(path, url):
    # Los assets de Vite llevan hash en el nombre: se pueden cachear un año
    return url.startswith('/assets/')


WHITENOISE_IMMUTABLE_FILE_TEST = _panel_asset_is_immutable

# Las fotos que sube el estudio se guardan EN LA BASE DE DATOS (modelo
# StoredFile), ya reducidas a tamaño web: no hace falta S3 ni volúmenes.
MAX_UPLOAD_MB = int(env('MAX_UPLOAD_MB', '8'))
# Tamaño máximo de una petición entera (foto + campos del formulario). Lo
# comprueba api.middleware.RequestSizeLimitMiddleware antes de leer nada: 413.
MAX_REQUEST_MB = int(env('MAX_REQUEST_MB', str(MAX_UPLOAD_MB + 1)))
# Datos que NO son archivos (JSON, campos de formulario): con 2,5 MB sobra.
DATA_UPLOAD_MAX_MEMORY_SIZE = int(float(env('MAX_JSON_MB', '2.5')) * 1024 * 1024)


# ── Email ─────────────────────────────────────────────────────────────────────
# El servidor SMTP (Gmail, Resend, Brevo…) se configura desde el panel y se
# guarda en BD. Estas variables solo sirven de alternativa para quien prefiera
# configurarlo por entorno; si no hay ninguna de las dos, los emails se omiten.
EMAIL_HOST = env('EMAIL_HOST', '')
EMAIL_PORT = int(env('EMAIL_PORT', '587'))
EMAIL_HOST_USER = env('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = env_bool('EMAIL_USE_TLS', True)
EMAIL_USE_SSL = env_bool('EMAIL_USE_SSL', False)
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'no-reply@localhost')
EMAIL_TIMEOUT = 20


# ── Integraciones opcionales (todas apagadas si no se configuran) ─────────────
# Stripe: lo normal es conectarlo desde el panel; estas variables son la
# alternativa por entorno.
STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', '')
STRIPE_PUBLISHABLE_KEY = env('STRIPE_PUBLISHABLE_KEY', '')
STRIPE_WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET', '')

# «Conectar pagos» (Stripe Connect, opcional). Quien gestiona la instalación
# (una agencia, o Corelia Cloud) tiene una plataforma de Stripe Connect y el
# estudio solo pulsa «Conectar pagos»: Stripe le crea su propia cuenta (con
# su panel de Stripe completo), el dinero va a SU banco y la plataforma no
# cobra comisión. Sin estas variables, todo sigue como siempre (claves en el
# panel). Guía completa: docs/STRIPE_CONNECT.md.
#   STRIPE_CONNECT_PLATFORM_KEY      clave secreta de la plataforma (sk_live_… / sk_test_…)
#   STRIPE_CONNECT_PUBLISHABLE_KEY   clave publicable de la plataforma (pk_…, mismo modo)
#   STRIPE_CONNECT_WEBHOOK_SECRET    whsec_… del endpoint «Connect» (…/api/v1/webhooks/connect/)
#   STRIPE_CONNECT_AVAILABILITY_CHECK  opcional: ruta a una función f(site_config) -> bool que
#                                    decide si se ofrece «Conectar pagos» (despliegue gradual)
#   STRIPE_CONNECT_COUNTRIES         países donde se ofrece (ISO-2 separados por comas)
#   STRIPE_CONNECT_BOOKING_PMC       opcional: configuración de métodos de pago (pmc_…, la
#                                    «padre» de la plataforma) solo para reservas de clase:
#                                    sin métodos asíncronos (OXXO, Multibanco…) que retendrían plazas
STRIPE_CONNECT_PLATFORM_KEY = env('STRIPE_CONNECT_PLATFORM_KEY', '')
STRIPE_CONNECT_PUBLISHABLE_KEY = env('STRIPE_CONNECT_PUBLISHABLE_KEY', '')
STRIPE_CONNECT_WEBHOOK_SECRET = env('STRIPE_CONNECT_WEBHOOK_SECRET', '')
STRIPE_CONNECT_AVAILABILITY_CHECK = env('STRIPE_CONNECT_AVAILABILITY_CHECK', '')
# Países de Corelia (api/utils/locale.py) donde Stripe abre cuentas
# (https://stripe.com/global, consultado el 15-10-2026). Fuera quedan, por
# ahora, Andorra, Mónaco, Puerto Rico y Latinoamérica salvo México y Brasil.
STRIPE_CONNECT_COUNTRIES = [c.upper() for c in env_list(
    'STRIPE_CONNECT_COUNTRIES',
    'ES,PT,FR,DE,IT,NL,BE,AT,LU,FI,GR,IE,GB,CH,LI,US,CA,MX,BR',
)]
STRIPE_CONNECT_BOOKING_PMC = env('STRIPE_CONNECT_BOOKING_PMC', '')
# Plan B sin Connect: el estudio pega sus propias claves de Stripe (Ajustes →
# Cobros → «Avanzado»). 0 = no se ofrece (p. ej. en un servicio gestionado,
# donde todos cobran con «Conectar pagos»). Las claves ya guardadas siguen
# cobrando y se pueden desconectar.
STRIPE_KEYS_FALLBACK_ENABLED = env_bool('STRIPE_KEYS_FALLBACK_ENABLED', True)
# Dirección del panel a la que se vuelve desde Stripe (vacío = la del API, que
# es donde se sirve el panel; en desarrollo con Vite: http://localhost:5173).
PANEL_URL = (env('PANEL_URL') or API_URL).rstrip('/')

# WhatsApp automático (servidor whatsmeow propio, avanzado). Sin él, el
# panel usa enlaces wa.me para escribir a las clientas.
WHATSAPP_OUTBOX_URL = env('WHATSAPP_OUTBOX_URL', '')

# IndexNow (aviso a Bing cuando cambian las clases). Clave publicada en la web.
INDEXNOW_KEY = env('INDEXNOW_KEY', '')

SENTRY_DSN = env('SENTRY_DSN', '')
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env('SENTRY_ENVIRONMENT', env('RAILWAY_ENVIRONMENT_NAME', 'production')),
        release=env('RAILWAY_GIT_COMMIT_SHA'),
        enable_logs=True,
        traces_sample_rate=float(env('SENTRY_TRACES_SAMPLE_RATE', '0.2')),
        send_default_pii=env_bool('SENTRY_SEND_PII', False),
    )


# ── Tareas programadas (Celery + Redis) ───────────────────────────────────────
# Sin REDIS_URL (desarrollo) las tareas se ejecutan en el mismo proceso y las
# programadas no corren: suficiente para probar.
REDIS_URL = env('REDIS_URL', '')
CELERY_BROKER_URL = REDIS_URL or 'memory://'
CELERY_RESULT_BACKEND = REDIS_URL or 'cache+memory://'
CELERY_TASK_ALWAYS_EAGER = not REDIS_URL
CELERY_TIMEZONE = STUDIO_TIMEZONE

# Caché: contadores de los límites de peticiones y del bloqueo de cuentas.
# Con Redis se comparten entre todos los procesos del servidor; sin él (desarrollo)
# cada proceso lleva su propia cuenta en memoria.
CACHES = {
    'default': (
        {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': REDIS_URL,
         'KEY_PREFIX': 'corelia', 'TIMEOUT': 300}
        if REDIS_URL else
        {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'corelia'}
    ),
}
# En los tests la caché se vacía antes de cada prueba (límites y bloqueos limpios).
TEST_RUNNER = 'api.tests.runner.CleanCacheTestRunner'

CELERY_BEAT_SCHEDULE = {
    # Cada 15 min — recordatorio push ~2h antes de cada clase
    'recordatorios-push-clases': {
        'task': 'api.tasks.send_class_reminders',
        'schedule': crontab(minute='*/15'),
    },
    # 08:00 — resumen push del día a quien tiene clase hoy
    'resumen-push-manana': {
        'task': 'api.tasks.send_morning_digest',
        'schedule': crontab(minute=0, hour=8),
    },
    # 00:00 — caducar créditos vencidos
    'expirar-creditos-cada-noche': {
        'task': 'api.tasks.expire_old_credits_task',
        'schedule': crontab(minute=0, hour=0),
    },
    # Domingo 03:00 — auto-reserva de la semana siguiente
    'auto-reserva-semanal': {
        'task': 'api.tasks.auto_reserve_weekly_classes',
        'schedule': crontab(minute=0, hour=3, day_of_week=0),
    },
    # 10:30 — recomendación de membresía a regulares (máx. 1 email/30 días)
    'recomendacion-membresia': {
        'task': 'api.tasks.send_membership_suggestions',
        'schedule': crontab(minute=30, hour=10),
    },
    # 11:00 — recordatorio a quien no ha verificado su email (24 h y 72 h)
    'recordatorio-verificacion-email': {
        'task': 'api.tasks.send_verification_reminders',
        'schedule': crontab(minute=0, hour=11),
    },
    # 04:00 — limpiar avisos de reemplazo caducados
    'limpiar-flags-reemplazo-expirados': {
        'task': 'api.tasks.clean_expired_replacement_flags',
        'schedule': crontab(minute=0, hour=4),
    },
    # Cada 10 min — lista de espera: plazas ofrecidas sin aceptar → a la siguiente
    'lista-espera-ofertas-caducadas': {
        'task': 'api.tasks.expire_waitlist_offers',
        'schedule': crontab(minute='*/10'),
    },
    # 07:30 — clientas del estudio: marcar los planes que vencen (salen en Hoy) y aviso opcional
    'clientas-estudio-renovaciones': {
        'task': 'api.tasks.studio_plans_daily',
        'schedule': crontab(minute=30, hour=7),
    },
}


# ── Logs ──────────────────────────────────────────────────────────────────────
# Todo a stdout (lo que muestran Railway/Render/Docker). Cada línea lleva un
# request_id que correlaciona los logs de una misma petición.
#   DJANGO_LOG_LEVEL → INFO (defecto), DEBUG, WARNING…
#   LOG_FORMAT       → 'console' (defecto) o 'json'
LOG_LEVEL = env('DJANGO_LOG_LEVEL', 'INFO')
LOG_FORMAT = env('LOG_FORMAT', 'console')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'request_id': {'()': 'api.logging_utils.RequestIdFilter'},
    },
    'formatters': {
        'console': {'format': '{levelname} [{name}] [rid={request_id}] {message}', 'style': '{'},
        'json': {'()': 'api.logging_utils.JsonFormatter'},
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'filters': ['request_id'],
            'formatter': 'json' if LOG_FORMAT == 'json' else 'console',
        },
    },
    'root': {'handlers': ['console'], 'level': LOG_LEVEL},
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'django.db.backends': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'api': {'handlers': ['console'], 'level': LOG_LEVEL, 'propagate': False},
    },
}

# Grafana Cloud Loki (opcional): solo con las tres variables definidas.
LOKI_URL = env('LOKI_URL', '')
LOKI_USER = env('LOKI_USER', '')
LOKI_API_KEY = env('LOKI_API_KEY', '')
if LOKI_URL and LOKI_USER and LOKI_API_KEY:
    LOGGING['handlers']['loki'] = {
        '()': 'api.logging_utils.LokiHandler',
        'url': LOKI_URL,
        'username': LOKI_USER,
        'password': LOKI_API_KEY,
        'labels': {'service': 'corelia-api', 'env': env('RAILWAY_ENVIRONMENT_NAME', 'production')},
        'filters': ['request_id'],
        'formatter': 'json',
        'level': LOG_LEVEL,
    }
    LOGGING['root']['handlers'].append('loki')
    for _logger_cfg in LOGGING['loggers'].values():
        _logger_cfg['handlers'].append('loki')
