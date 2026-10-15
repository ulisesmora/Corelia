# Desplegar Corelia paso a paso

Esta guía es para la persona que pone en marcha el estudio (o para quien lo
instala para otra persona). Tiempo: unos 10 minutos, más la espera del dominio.

## Cómo está montado

```
                ┌──────────────── Railway (un solo proyecto) ────────────────┐
 Clientas ───▶  │  web   (web de reservas)  ──red privada──▶  api  (API + panel) │ ◀── Tú
                │                                             │      │          │
                │                                         Postgres  Redis       │
                └────────────────────────────────────────────────────────────────┘
```

- **web**: la web pública donde tus clientas ven el horario y reservan.
- **api**: el corazón (reservas, créditos, emails…) y además **tu panel de gestión**.
- **Postgres**: la base de datos (incluye las fotos que subes).
- **Redis**: para las tareas programadas (recordatorios, caducidad de créditos…).

Todo vive en **Railway**, en una sola cuenta y una sola factura (unos 5-10 € al mes).

## 1. Desplegar (un clic)

1. Crea una cuenta en [railway.com](https://railway.com) y añade una tarjeta (*Account → Billing*).
2. Abre el enlace **Deploy on Railway** del README.
3. Railway te pide tres datos:
   - `ADMIN_EMAIL`: tu email. Con él entrarás al panel.
   - `ADMIN_PASSWORD`: una contraseña para el panel (mínimo 8 caracteres).
   - `STUDIO_NAME`: el nombre de tu estudio (lo podrás cambiar).
4. Pulsa **Deploy** y espera a que los cuatro servicios estén en verde (3-6 minutos la primera vez).

## 2. Encontrar tus dos direcciones

En el proyecto de Railway:

- Pulsa el servicio **api** → pestaña *Settings* → *Networking*: verás algo como
  `api-production-1234.up.railway.app`. **Ese es tu panel.**
- Pulsa el servicio **web** → *Settings* → *Networking*: `web-production-5678.up.railway.app`.
  **Esa es tu web.**

> Si alguno no tiene dirección, pulsa **Generate Domain** en esa misma pantalla.

## 3. Configurar el estudio (5 minutos)

Abre la dirección del panel, entra con tu email y contraseña y sigue el **asistente
de bienvenida**: nombre, logo, colores, emails y pagos. Ver [PRIMEROS_PASOS.md](PRIMEROS_PASOS.md).

## 4. Tu propio dominio (opcional)

Para que tu web sea `www.tuestudio.com` (y, si quieres, el panel `panel.tuestudio.com`):

1. **Compra el dominio** si no lo tienes (IONOS, DonDominio, GoDaddy, Namecheap, Cloudflare… unos 10-15 € al año).
2. En Railway, servicio **web** → *Settings* → *Networking* → **Custom Domain** → escribe
   `www.tuestudio.com` → **Add**. Railway te muestra un registro **CNAME** (y a veces un **TXT**).
3. En la web donde compraste el dominio, ve a **DNS** / **Zona DNS** y crea esos registros
   copiando exactamente el *nombre* y el *valor*.
   - Cloudflare: deja la nube en **gris** («Solo DNS»).
   - Para que `tuestudio.com` (sin www) también funcione, crea en tu proveedor una
     **redirección** a `https://www.tuestudio.com`.
4. Espera de unos minutos a unas horas. Railway crea el certificado https solo.
5. En tu panel → **Ajustes → Tu dominio**: escribe `www.tuestudio.com`, pulsa
   **Comprobar** y, cuando diga que funciona, **Usar este dominio**.

Desde ese momento los emails, el sitemap, Google y los avisos usan tu dominio. Para el
panel, igual pero en el servicio **api** y con `panel.tuestudio.com`. Si tenías Stripe
conectado, el aviso automático de pagos se mueve solo al dominio nuevo.

> ¿Instalas Corelia para otros estudios y quieres que cobren con un solo botón, sin pegar
> claves? Mira [«Conectar pagos» con Stripe Connect](STRIPE_CONNECT.md).

> ¿Usas el acceso con Google? Añade también `https://www.tuestudio.com` en Google Cloud →
> tu cliente OAuth → *Orígenes de JavaScript autorizados*.

## 5. Actualizar a versiones nuevas

Al desplegar con el botón, Railway crea una copia del código en tu GitHub y despliega
desde ella. Cuando publiquemos una versión nueva:

- Railway te **avisa en el proyecto** de que hay una actualización y prepara una rama con
  ella para que la pruebes; si todo va bien, la aceptas y se despliega.
- Si en vez de la plantilla hiciste *fork* del repositorio, usa *Sync fork* en GitHub y
  Railway redespliega solo.

Las migraciones de la base de datos se aplican solas al arrancar.

## 6. Copias de seguridad

Railway → servicio **Postgres** → pestaña *Backups*: activa las copias automáticas. Como
las fotos están en la base de datos, con eso se guarda todo.

## 7. Seguridad

Ya viene protegido: límite de intentos, bloqueo temporal tras 5 contraseñas
incorrectas y cabeceras de seguridad. Dos cosas recomendadas (5 minutos):

1. En el panel → **Seguridad**, activa la **verificación en dos pasos** (código del
   móvil al entrar) y, si sois varias personas, «Exigirla a todo el equipo».
2. Opcional: captcha gratuito de **Cloudflare Turnstile** contra registros falsos y
   robots. Pon `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` en el servicio **api**.

Todo explicado, con las variables, en [SEGURIDAD.md](SEGURIDAD.md).

---

## Alternativa: la web en Vercel

No es lo recomendado: son dos cuentas, el plan gratuito de Vercel **no permite uso
comercial** (la web de un estudio lo es, así que hace falta Vercel Pro) y la web habla
con el API por internet en lugar de por la red privada. Si aun así lo prefieres:

1. Despliega en Railway como arriba (te sirve igual para el API y el panel). Puedes borrar el servicio **web**.
2. En Vercel: *Add New → Project* → importa el repositorio → **Root Directory**: `web`.
3. Variables de entorno en Vercel:
   - `API_URL` = la dirección del servicio **api** con https (p. ej. `https://api-production-1234.up.railway.app`).
4. *Deploy*. El dominio propio se añade en Vercel → *Settings → Domains*, y luego en el
   panel → Ajustes → Tu dominio, como en el paso 4.

La web detecta sola que está en Vercel y usa su adaptador.

Ojo con los límites de intentos por IP: desde Vercel todas las visitas llegan al API
desde las IP de Vercel. Lee «La IP real» en [SEGURIDAD.md](SEGURIDAD.md).
