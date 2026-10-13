# Studio Kit

**Web de reservas + panel de gestión para estudios de pilates, yoga y fitness.**
Gratis, de código abierto y pensado para que lo use alguien que no sabe de informática.

Nació para un estudio real de pilates en España y lleva meses gestionando sus
reservas, bonos y clientas a diario. Ahora cualquier estudio puede tenerlo con su
propio nombre, logo y colores.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/TU-CODIGO-DE-PLANTILLA)

---

## Qué incluye

**Para tus clientas (la web)**
- Horario semanal y fichas de cada clase, en español e inglés.
- Reserva en dos toques con créditos, o pago con tarjeta si activas Stripe.
- Bonos y membresías mensuales.
- Su cuenta: próximas clases, historial, cancelación (con el plazo que tú decidas),
  clases fijas que se reservan solas cada semana.
- **App instalable** en el móvil con avisos (confirmación, recordatorio 2 h antes,
  cambios de horario…), sin pasar por App Store ni Google Play.
- Entrar con email o con su cuenta de Google.
- Optimizada para Google y para buscadores con IA: todo el contenido se pinta en el servidor, con
  datos estructurados (negocio local, clases, precios, preguntas frecuentes), `sitemap.xml`,
  `llms.txt` y aviso automático a Bing/ChatGPT (IndexNow) cada vez que cambias algo.

**Para ti (el panel)**
- Un asistente de bienvenida y una pantalla de Ajustes para tu marca: nombre, logo, icono de la app,
  colores, tipografía, textos de la portada, preguntas frecuentes y opiniones. Sin tocar código.
- Clases, salas, instructores y horarios con fecha de efecto («desde el lunes 3, a las 10:00»).
- Vacaciones, cierres y clases privadas, con aviso y devolución automática a quien tenía reserva.
- Clientas, créditos, bonos, membresías, cupones y estadísticas.
- Mover o cancelar una sesión avisando a todas las afectadas.
- Funciona en el móvil y se instala como app. Se actualiza solo.

**Sin servicios obligatorios de pago**: las fotos se guardan en tu propia base de
datos, los emails salen desde tu Gmail y los pagos online son opcionales.

## Ponlo en marcha en 5 minutos

1. Crea una cuenta en [Railway](https://railway.com) (cuesta unos 5-10 € al mes según el uso).
2. Pulsa el botón **Deploy on Railway** de arriba.
3. Escribe tu email y una contraseña (con ellos entrarás al panel) y pulsa **Deploy**.
4. Cuando termine (unos minutos), abre el dominio del servicio **api**: es tu panel.
   Entra y sigue el **asistente de bienvenida**: nombre, logo, colores, emails y pagos.
5. El dominio del servicio **web** es tu web de reservas. Puedes poner tu propio
   dominio (`www.tuestudio.com`) en Railway → servicio web → *Settings → Domains*.

¿Te pierdes? Paso a paso en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) y, para el día a día, [docs/PRIMEROS_PASOS.md](docs/PRIMEROS_PASOS.md).

### Lo opcional (desde el panel → Ajustes)

| | Para qué | Qué necesitas |
|---|---|---|
| **Emails** | Confirmaciones, avisos y recordatorios por email | Tu Gmail + una «contraseña de aplicación» (el panel te guía) |
| **Pagos online** | Que paguen con tarjeta al reservar o comprar bonos | Cuenta de [Stripe](https://stripe.com) (pegas 2 claves; el resto se configura solo) |
| **Acceso con Google** | Que se registren con su cuenta de Google en un toque | Un «ID de cliente» de Google Cloud (público, sin claves secretas; el panel te guía) |

Sin ellos funciona todo: vendes los bonos en el estudio y añades los créditos desde el panel.

## En tu ordenador

Con [Docker](https://www.docker.com/):

```bash
cp .env.example .env    # opcional
docker compose up --build
```

- Panel: http://localhost:8000 (entra con `admin@example.com` / `cambia-esta-clave`)
- Web: http://localhost:4321

Para programar, cada parte por separado:

```bash
# API (Python 3.11)
cd api && python -m venv .venv && .venv/bin/pip install -r requirements.txt
DEBUG=1 .venv/bin/python manage.py migrate
DEBUG=1 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=cambia-esta-clave SEED_DEMO=1 .venv/bin/python manage.py bootstrap
DEBUG=1 .venv/bin/python manage.py runserver 8000

# Panel (Node 20)
cd crm && pnpm install && pnpm dev          # http://localhost:5173

# Web (Node 20)
cd web && pnpm install && API_URL=http://localhost:8000 pnpm dev   # http://localhost:4321
```

Tests del API: `cd api && DEBUG=1 .venv/bin/python manage.py test api`

## Cómo está hecho

```
api/   Django 5 + DRF — reservas, créditos, pagos, emails, avisos push, tareas (Celery + Redis)
crm/   React 19 + MUI — el panel; se compila y lo sirve el propio API en su dominio
web/   Astro 5 + React — la web pública; reenvía /api/* al API (sin CORS)
```

- **Configuración del estudio** (nombre, logo, colores, fuentes, contacto, datos
  legales, email, Stripe): en la base de datos, editable desde el panel. Los
  secretos se guardan cifrados.
- **Configuración del servidor**: variables de entorno, ver [.env.example](.env.example).
- **Fotos**: en la base de datos, reducidas a tamaño web al subirlas, servidas con caché de un año.
- **Iconos** (pestaña del navegador, iPhone, Android) e **imagen para compartir** en redes: los genera
  el API desde el icono, los colores y la tipografía del estudio. El panel usa una variante oscura
  para no confundirse con la app de las clientas.
- **Ubicación**: al guardar la dirección, el API calcula las coordenadas (OpenStreetMap) para Google.
- **Hora**: todo se guarda en UTC y se muestra en la zona del estudio (`STUDIO_TIMEZONE`).

## Limitaciones conocidas

- Pensado para **un estudio por instalación** (con varias salas e instructores).
- Panel y emails en español; la web en español e inglés.
- Cobros en euros y textos legales pensados para España.

## Contribuir

Los fallos y las ideas, en *Issues*. Antes de enviar cambios al API, pasa los tests.

## Licencia

[AGPL-3.0](LICENSE). Puedes usarlo, modificarlo y desplegarlo gratis para tu estudio.
Si ofreces una versión modificada como servicio a terceros, tienes que publicar tus cambios
con la misma licencia.
