#!/bin/sh
# Corelia en tu ordenador, como si lo desplegaras: te pide los mismos datos
# que el botón de Railway, lo arranca todo y te abre el panel.
set -e
cd "$(dirname "$0")"

if ! docker info >/dev/null 2>&1; then
  echo "Necesitas Docker Desktop abierto: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Primera vez: como en Railway, dime tres datos (Enter = valor por defecto)."
  printf "  Nombre del estudio [Mi Estudio]: ";      read -r NAME
  printf "  Tu email para entrar al panel [admin@example.com]: "; read -r EMAIL
  printf "  Contraseña del panel [cambia-esta-clave]: ";          read -r PASS
  SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 50)
  cat > .env <<ENV
SECRET_KEY="$SECRET"
STUDIO_NAME="${NAME:-Mi Estudio}"
ADMIN_EMAIL="${EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${PASS:-cambia-esta-clave}"
SEED_DEMO=1
ENV
  echo "  Guardado en .env (bórralo para empezar de cero)."
fi

echo "→ Construyendo y arrancando (la primera vez tarda unos minutos)…"
docker compose up -d --build

printf "→ Esperando a que todo esté listo"
until curl -sf http://localhost:8000/healthz >/dev/null 2>&1 && curl -sf http://localhost:4321/ >/dev/null 2>&1; do
  printf "."; sleep 2
done
echo " ¡listo!"

ADMIN_EMAIL=$(sed -n 's/^ADMIN_EMAIL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .env)
cat <<MSG

  Panel del estudio  →  http://localhost:8000      (entra con $ADMIN_EMAIL)
  Web de reservas    →  http://localhost:4321
  Emails enviados    →  http://localhost:8025      (buzón de pruebas)

  Parar:              docker compose down
  Empezar de cero:    docker compose down -v && rm .env && ./start-local.sh

MSG
command -v open >/dev/null 2>&1 && open http://localhost:8000 || true
