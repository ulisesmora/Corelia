#!/bin/sh
# Arranque del contenedor del API.
set -e

echo "→ Aplicando migraciones…"
python manage.py migrate --noinput

echo "→ Preparando la instalación (admin inicial, claves, datos de ejemplo)…"
python manage.py bootstrap

# Tareas programadas (recordatorios, caducidad de créditos, auto-reservas):
# worker + beat de Celery en este mismo contenedor. Solo con Redis configurado.
if [ -n "$REDIS_URL" ]; then
  echo "→ Arrancando tareas programadas (Celery)…"
  celery -A config worker --beat --concurrency=1 --loglevel=info \
    --schedule=/tmp/celerybeat-schedule &
else
  echo "⚠ Sin REDIS_URL: las tareas programadas (recordatorios, caducidad de créditos…) no se ejecutarán."
fi

echo "→ Arrancando el servidor web en el puerto ${PORT:-8000}…"
exec granian --interface asginl config.asgi:application \
  --host 0.0.0.0 --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" --loop uvloop
