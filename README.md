<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/corelia-logo-reversed.svg">
    <img src="docs/brand/corelia-logo.svg" alt="Corelia" height="56">
  </picture>
</p>

<p align="center"><b>El centro de tu estudio.</b></p>

# Corelia

**Web de reservas + panel de gestión para estudios de pilates, yoga y fitness.**
Gratis, de código abierto y pensado para que lo use alguien que no sabe de informática.

Nació para un estudio real de pilates en España y lleva meses gestionando sus
reservas, bonos y clientas a diario. Ahora cualquier estudio puede tenerlo con su
propio nombre, logo y colores.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/TU-CODIGO-DE-PLANTILLA)

> **¿Prefieres no instalar nada?** [Corelia Cloud](https://corelia.com) te lo deja funcionando con tu
> marca en 2 minutos, alojado y mantenido por nosotros: 3 meses gratis, sin tarjeta. Es el mismo
> código que ves aquí.

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
- 8 estilos visuales (natural, minimal, editorial, liquid glass, brutalista, energía, pop y neón) y
  3 familias de iconos, que se cambian con un clic sin perder nada.
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

Con [Docker Desktop](https://www.docker.com/products/docker-desktop/) abierto:

```bash
./start-local.sh
```

Te pide los mismos tres datos que Railway (nombre del estudio, tu email y una contraseña),
lo arranca todo y te abre el panel:

- Panel: http://localhost:8000
- Web: http://localhost:4321
- Emails: http://localhost:8025 (buzón de pruebas: ves cada email que recibirían tus clientas, sin enviar nada de verdad)

En local no se puede conectar Stripe (necesita https); todo lo demás funciona igual que publicado.

Para programar, cada parte por separado:

```bash
# API (Python 3.11, dependencias con uv: https://docs.astral.sh/uv/)
cd api && uv sync                          # crea .venv con las versiones de uv.lock
DEBUG=1 uv run python manage.py migrate
DEBUG=1 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=cambia-esta-clave SEED_DEMO=1 uv run python manage.py bootstrap
DEBUG=1 uv run python manage.py runserver 8000

# Panel (Node 20)
cd crm && pnpm install && pnpm dev          # http://localhost:5173

# Web (Node 20)
cd web && pnpm install && API_URL=http://localhost:8000 pnpm dev   # http://localhost:4321
```

Tests del API: `cd api && DEBUG=1 uv run python manage.py test api`

Dependencias del API: se declaran en `api/pyproject.toml` y se fijan en `api/uv.lock`
(`uv add paquete==x.y` para añadir o subir una). `api/requirements.txt` se genera desde el lock
para quien prefiera pip (`pip install -r requirements.txt`); regenéralo con el comando de su cabecera.

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
