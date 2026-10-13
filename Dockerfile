# Studio Kit — API + panel de administración en una sola imagen.
#
# 1) Compila el panel (crm/, React) a archivos estáticos.
# 2) Instala el backend (api/, Django) y copia el panel dentro: Django lo
#    sirve en la raíz del dominio y el API en /api/. Un solo servicio.
#
# La web pública (web/) es otro servicio con su propio Dockerfile.

# ── 1. Panel ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS panel
WORKDIR /crm
RUN corepack enable
COPY crm/package.json crm/pnpm-lock.yaml crm/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY crm/ ./
ARG RAILWAY_GIT_COMMIT_SHA
ENV RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
RUN pnpm build

# ── 2. API ────────────────────────────────────────────────────────────────────
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000
WORKDIR /app

COPY api/requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY api/ ./
COPY --from=panel /crm/dist ./panel_dist

# Estáticos del admin de Django (la SECRET_KEY real solo hace falta al arrancar)
RUN ALLOW_INSECURE_SECRET=1 python manage.py collectstatic --noinput -v0

RUN chmod +x start.sh
EXPOSE 8000
CMD ["./start.sh"]
