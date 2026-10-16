# Seguridad de Corelia

Lo que protege a cada instalación sin que tengas que hacer nada, y lo poco que
puedes ajustar. Todo funciona igual sin configurar ninguna variable.

## Lo que viene activado

| Protección | Qué hace |
|---|---|
| **Límite de intentos** | Si alguien (o un programa) repite mucho una acción sensible —entrar, crear cuenta, pedir contraseña nueva, reenviar el código del email, pagar sin cuenta, formularios públicos— recibe «Demasiados intentos seguidos. Espera X minutos». Se cuenta por IP y, donde tiene sentido, por email. |
| **Bloqueo temporal de la cuenta** | Tras **5 contraseñas (o códigos) incorrectos en 15 minutos** para el mismo email, ese email no puede entrar durante 15 minutos, ni siquiera con la contraseña buena. Se avisa en lenguaje llano y se ofrece «¿Has olvidado tu contraseña?»: crear una contraseña nueva con el enlace del email la desbloquea. Pasa igual exista o no la cuenta, así nadie puede averiguar qué emails están registrados. Cada bloqueo queda en los logs (`security.account_locked`). |
| **Verificación en dos pasos (panel)** | Cada persona del panel puede activar en **Seguridad** un código de 6 cifras que cambia cada 30 s en su móvil (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Con ella, quien averigüe una contraseña no puede entrar sin el móvil. Incluye 10 códigos de recuperación de un solo uso. |
| **Cabeceras de seguridad** | El API y la web dicen al navegador: solo HTTPS (HSTS, 1 año), no adivinar tipos de archivo, no meter el panel en un `<iframe>` de otra web, no enviar rutas a otras webs y no usar cámara, micrófono ni ubicación. La web añade una política de contenido (CSP) en modo **solo informe**. |
| **Tamaño máximo de envío** | Las peticiones de más de `MAX_REQUEST_MB` (por defecto el tamaño de una foto + 1 MB) se rechazan antes de leerlas. |

## Verificación en dos pasos (panel)

**Activarla:** panel → menú → **Seguridad** → «Activar la verificación en dos pasos»:

1. Instala una app de códigos en el móvil.
2. Escanea el QR (o escribe la clave a mano).
3. Escribe el código de 6 cifras que muestra la app.
4. Guarda los **10 códigos de recuperación** (Descargar / Imprimir / Copiar). Solo se ven una vez.

**Entrar:** email y contraseña → «Último paso»: el código de la app, o «¿No tienes el
móvil? Usa un código de recuperación». Si pasan más de 5 minutos entre los dos pasos
hay que volver a escribir la contraseña.

**Exigirla a todo el equipo:** en la misma pantalla, «Exigir la verificación en dos
pasos a todo el equipo» (antes tienes que tenerla activada tú). Quien no la tenga solo
podrá activarla: el resto del panel queda bloqueado hasta que lo haga.

**Si alguien pierde el móvil y los códigos de recuperación:** otra persona con acceso al
servidor ejecuta

```bash
python manage.py disable_2fa persona@estudio.com
```

(en Railway: servicio **api** → *Settings* → consola). Le quita la verificación y el
bloqueo; al entrar podrá activarla de nuevo.

Detalles técnicos: TOTP RFC 6238 (SHA-1, 6 cifras, 30 s, ±30 s de margen) hecho con la
biblioteca estándar (`api/api/utils/totp.py`); un mismo código no vale dos veces; el
secreto se guarda **cifrado** con la `SECRET_KEY` (como las claves de Stripe) y los
códigos de recuperación solo resumidos. El admin de Django (`/django-admin/`) también
pide el código. «Entrar con Google» nunca abre el panel, así que no se lo salta.

> Si cambias la `SECRET_KEY`, las verificaciones en dos pasos dejan de valer (igual que
> las claves de Stripe guardadas): cada persona tendría que activarla de nuevo, o usa
> `disable_2fa`.

## Captcha con Cloudflare Turnstile (opcional)

Una casilla «Verifica que eres una persona» que casi siempre se marca sola, gratuita y
sin cookies de seguimiento. Sin configurarla todo funciona como siempre. Con ella se pide:

- al **crear cuenta** en la web,
- al **pedir una contraseña nueva** (web y panel),
- al **pagar sin cuenta** (antes de abrir el pago de Stripe),
- al **entrar** solo **después de 3 fallos** desde esa IP o para ese email (web y panel),
  para no molestar a quien entra bien.

Si Cloudflare no responde, por seguridad no se deja pasar y se pide probar en un momento.

**Cómo conseguir las claves (5 minutos, gratis):**

1. Entra en [dash.cloudflare.com](https://dash.cloudflare.com) (crea una cuenta gratuita
   si no tienes; **no** hace falta tener el dominio en Cloudflare).
2. Menú **Turnstile** → **Add widget** (Añadir widget).
3. Nombre: el de tu estudio. **Hostnames**: el dominio de tu web y el de tu panel
   (p. ej. `www.tuestudio.com`, `panel.tuestudio.com`, y los `*.up.railway.app` si los usas).
4. Modo del widget: **Managed** (recomendado). Pulsa **Create**.
5. Copia la **Site Key** y la **Secret Key** y ponlas en las variables del servicio **api**:
   `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`. Reinicia el servicio.

La web y el panel leen la clave pública solos (no hay que tocar el servicio web). La
política de cookies de la web lo menciona automáticamente como servicio de seguridad
estrictamente necesario.

Para probar en local, Cloudflare publica claves de prueba (no sirven en producción):
`TURNSTILE_SITE_KEY=1x00000000000000000000AA` y
`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (siempre pasa;
`2x0000000000000000000000000000000AA` siempre falla).

## Variables de entorno (servicio api)

Todas opcionales.

| Variable | Por defecto | Para qué |
|---|---|---|
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | vacías (apagado) | Captcha Turnstile (ver arriba). |
| `LOGIN_LOCKOUT_ATTEMPTS` | `5` | Fallos seguidos que bloquean un email. |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Ventana para contar fallos y duración del bloqueo. |
| `LOGIN_CAPTCHA_AFTER` | `3` | Fallos tras los que se pide el captcha al entrar. |
| `THROTTLE_<NOMBRE>` | ver abajo | Cambia un límite, formato `número/periodo`: `10/m`, `5/15m`, `20/h`, `50/d`. |
| `RATE_LIMITS_ENABLED` | `1` | `0` apaga todos los límites (no recomendado). |
| `TRUSTED_PROXY_CIDRS` | vacío | Rangos públicos (CIDR, separados por comas) de proxies propios delante del API. |
| `SECURE_HSTS_SECONDS` | `31536000` (1 año) | HSTS del API (`0` lo apaga). |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | `0` | Extiende HSTS a todos los subdominios. |
| `SECURE_HSTS_PRELOAD` | `0` | Pide entrar en la lista *preload* de los navegadores. |
| `SECURE_COOKIES` | `1` | Cookies del admin de Django solo por HTTPS. |
| `SECURE_SSL_REDIRECT` | `0` | Redirigir http → https en Django (Railway ya lo hace en su proxy). |
| `MAX_REQUEST_MB` | `MAX_UPLOAD_MB + 1` | Tamaño máximo de una petición. |
| `MAX_JSON_MB` | `2.5` | Tamaño máximo de los datos que no son archivos. |
| `TWO_FACTOR_PENDING_SECONDS` | `300` | Tiempo entre la contraseña y el código. |
| `TWO_FACTOR_ISSUER` | nombre del estudio | Nombre que sale en la app de códigos. |

Límites por defecto (`THROTTLE_…`): `LOGIN=10/m` (por IP: panel, clientas y Google),
`LOGIN_EMAIL=30/h`, `TWO_FACTOR=10/m`, `TWO_FACTOR_MANAGE=20/h`, `SIGNUP=20/h`,
`PASSWORD_RESET=10/h`, `PASSWORD_RESET_EMAIL=3/h`, `PASSWORD_RESET_CONFIRM=20/h`,
`EMAIL_VERIFY=20/h`, `EMAIL_VERIFY_EMAIL=5/h`, `CHECKOUT=30/h`, `PUBLIC_FORM=30/h`,
`TEST_EMAIL=10/h`. Las altas de clientas desde el panel no tienen límite.

Los contadores viven en Redis (`REDIS_URL`), compartidos entre procesos. Sin Redis
(desarrollo) se guardan en la memoria de cada proceso.

### Variables del servicio web

| Variable | Por defecto | Para qué |
|---|---|---|
| `HSTS_INCLUDE_SUBDOMAINS` | `0` | `1` añade `includeSubDomains` al HSTS de la web. |
| `CSP_ENFORCE` | `0` | `1` pasa la CSP de «solo informe» a bloqueante. Hazlo solo tras revisar que la consola del navegador no muestra avisos `Content-Security-Policy-Report-Only` en tu web (portada, reservas, pago, entrar con Google, vídeo…). |

## Decisiones a tener en cuenta

- **HSTS sin subdominios por defecto.** Si el estudio usa su dominio propio
  (`panel.tuestudio.com`), `includeSubDomains` obligaría a HTTPS en *todos* los
  subdominios de `tuestudio.com` (también los que no son de Corelia, como un correo web
  o una tienda antigua sin HTTPS). Actívalo solo si sabes que todos tienen HTTPS.
- **La IP real.** Para contar por IP, el API recorre `X-Forwarded-For` de derecha a
  izquierda saltando las direcciones privadas (los proxies de Railway, Docker…), así
  nadie puede inventarse una IP. Si delante del API hay un proxy con IP **pública**
  (otro CDN, o la web desplegada en **Vercel**, que llama al API por internet), todas
  las visitas parecerían venir de esa IP: añade sus rangos a `TRUSTED_PROXY_CIDRS`, o
  sube los límites `THROTTLE_*`. Con la web en Railway (lo recomendado) no hace falta.
- **CSP en modo informe.** No bloquea nada; sirve para comprobar que la lista de
  servicios es correcta antes de activarla con `CSP_ENFORCE=1`.
- **El mapa de «Cómo llegar».**
  - Pide estilo, teselas, letras e iconos a `https://tiles.openfreemap.org`, en
    `connect-src`.
  - MapLibre pinta en un worker propio o `blob:`: `worker-src` y `child-src` incluyen
    `'self' blob:`.
  - Ya no hay iframe de OpenStreetMap, así que `frame-src` no lo incluye.
  - Con `PUBLIC_MAP_STYLE_URL`, su dominio se añade solo.
  - Sin cookies ni consentimiento: `docs/ESTILOS.md` («Mapa»).
- **Coordenadas del estudio.** Se buscan en Nominatim (OpenStreetMap) solo al guardar la
  dirección en el panel, nunca al servir la web pública. Como mucho 1 petición por
  segundo, con un User-Agent propio (`NOMINATIM_USER_AGENT` lo cambia) y con límites de
  tiempo. Los fallos se registran y el panel pide colocar el punto a mano.
