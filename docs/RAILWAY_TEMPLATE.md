# Crear la plantilla de Railway (para el botón «Deploy on Railway»)

Esto lo hace **una vez** quien mantiene el repositorio. El resultado es una URL
de plantilla: cualquiera que la abra despliega su estudio con un clic.

Editor de plantillas: Railway → *Workspace settings* → **Templates** → **New Template**.

## Servicios

### 1. Postgres
*Add New* → **Database → PostgreSQL**. Sin cambios.

### 2. Redis
*Add New* → **Database → Redis**. Sin cambios.

### 3. `api` (backend + panel)
- **Source**: GitHub → este repositorio (rama `main`).
- **Root Directory**: *(vacío: la raíz del repo; usa el `Dockerfile` de la raíz)*.
- **Public Networking**: HTTP, puerto `8000`.
- **Healthcheck Path**: `/healthz`
- **Variables**:

| Variable | Valor |
|---|---|
| `PORT` | `8000` |
| `SECRET_KEY` | `${{secret(50)}}` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `API_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `WEB_URL` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| `ADMIN_EMAIL` | *(vacío, obligatorio — lo rellena quien despliega)* · descripción: «Tu email: con él entrarás al panel» |
| `ADMIN_PASSWORD` | *(vacío, obligatorio)* · descripción: «Contraseña para entrar al panel (mínimo 8 caracteres)» |
| `STUDIO_NAME` | `Mi Estudio` · descripción: «Nombre de tu estudio (podrás cambiarlo)» |
| `SEED_DEMO` | `1` · descripción: «1 = carga clases de ejemplo para ver la web funcionando» |
| `STUDIO_TIMEZONE` | `Europe/Madrid` |

### 4. `web` (web pública de reservas)
- **Source**: GitHub → este repositorio (rama `main`).
- **Root Directory**: `web`
- **Public Networking**: HTTP, puerto `4321`.
- **Healthcheck Path**: `/`
- **Variables**:

| Variable | Valor |
|---|---|
| `PORT` | `4321` |
| `API_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |
| `PUBLIC_SITE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |

La web habla con el API por la **red privada** de Railway (más rápido y sin
salir a internet). El navegador nunca llama al API directamente: la web
reenvía `/api/*`.

## Texto de la plantilla (descripción para el marketplace)

> **Corelia** — web de reservas + panel de gestión para estudios de pilates,
> yoga y fitness. Clases y horarios, bonos y membresías con créditos, reservas
> online, avisos al móvil (app instalable), emails desde tu propio Gmail y
> pagos con Stripe opcionales. Tras desplegar, entra en el dominio del servicio
> **api** con tu email y contraseña: un asistente te guía en 5 minutos.

## Después de crear la plantilla

1. Copia la URL de la plantilla y ponla en el botón del `README.md`
   (sustituye `TU-CODIGO-DE-PLANTILLA`).
2. Pruébala en una cuenta limpia de principio a fin (ver
   `docs/CHECKLIST_LANZAMIENTO.md`).
3. Opcional: *Publish* para que aparezca en el marketplace de Railway (los
   autores de plantillas open source reciben una parte del consumo).
