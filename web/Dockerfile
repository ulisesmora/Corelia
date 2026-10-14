# Web pública de Corelia (Astro + adaptador Node standalone).
#
#   docker build -t corelia-web .
#   docker run -p 4321:4321 -e API_URL=http://backend:8000 -e PUBLIC_SITE_URL=https://mi-estudio.com corelia-web
#
# Variables de entorno (en tiempo de ejecución, no hace falta reconstruir):
#   API_URL          URL del backend (p. ej. http://localhost:8000 o la URL privada de Railway). Obligatoria.
#   PUBLIC_SITE_URL  Dominio público de la web si el estudio aún no lo ha puesto en el panel
#                    (Ajustes → Tu dominio, que tiene prioridad).
#   PORT             Puerto (por defecto 4321). HOST queda fijado a 0.0.0.0.
#   PUBLIC_CLARITY_ID  (opcional) Microsoft Clarity.
#   NOINDEX=1        (opcional) robots.txt bloquea buscadores (entornos de prueba).
#
# El build NO necesita el backend: todas las páginas se renderizan en el servidor.

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Versión de pnpm: la del campo packageManager de package.json
RUN corepack enable
WORKDIR /app

# ── Dependencias (capa cacheable) ──────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build ──────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm build

# ── Dependencias de producción ─────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ── Imagen final ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
