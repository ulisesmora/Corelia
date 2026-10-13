"""
Infraestructura de logging estructurado.

- RequestIdFilter: añade request_id a cada registro (correlación de logs).
- JsonFormatter: salida JSON por línea (para Loki/Grafana); se activa con LOG_FORMAT=json.
- RequestLogMiddleware: una línea canónica por request (método, ruta, status,
  duración, usuario, request_id), el patrón "canonical log line".

IMPORTANTE: este módulo se importa al configurar LOGGING, antes de que el
registro de apps de Django esté listo. No importar modelos ni nada de api/ aquí.
"""
import atexit
import json
import logging
import queue
import threading
import time
import uuid
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Atributos estándar de LogRecord: todo lo demás se considera "extra" y se
# incluye en la salida JSON como campo propio.
_RESERVED_ATTRS = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "taskName", "message", "asctime", "request_id",
}


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in _RESERVED_ATTRS and not key.startswith("_"):
                payload[key] = value
        return json.dumps(payload, ensure_ascii=False, default=str)


class RequestLogMiddleware:
    """Emite una línea de log por request y propaga X-Request-ID."""

    EXCLUDED_PREFIXES = ("/static/", "/favicon")

    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = logging.getLogger("api.request")

    def __call__(self, request):
        rid = (request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12])[:64]
        token = request_id_var.set(rid)
        start = time.monotonic()
        try:
            response = self.get_response(request)
            duration_ms = round((time.monotonic() - start) * 1000)
            self._log_request(request, response.status_code, duration_ms)
            response["X-Request-ID"] = rid
            return response
        finally:
            request_id_var.reset(token)

    def _log_request(self, request, status_code, duration_ms):
        path = request.path
        if path.startswith(self.EXCLUDED_PREFIXES):
            return

        user_id = None
        try:
            # DRF escribe el usuario autenticado (JWT incluido) de vuelta en
            # request.user, así que en la fase de respuesta ya está resuelto.
            user = getattr(request, "user", None)
            if user is not None and user.is_authenticated:
                user_id = user.pk
        except Exception:
            pass

        if status_code >= 500:
            level = logging.ERROR
        elif status_code >= 400:
            level = logging.WARNING
        else:
            level = logging.INFO

        self.logger.log(
            level,
            "request method=%s path=%s status=%s duration_ms=%s user_id=%s ip=%s",
            request.method, path, status_code, duration_ms,
            user_id if user_id is not None else "-",
            # Detrás del proxy de la web y del de Railway, la IP real va en
            # X-Forwarded-For (solo informativa: el cliente puede falsearla)
            (request.META.get("HTTP_X_FORWARDED_FOR") or request.META.get("REMOTE_ADDR") or "-").split(",")[0].strip(),
        )


class LokiHandler(logging.Handler):
    """
    Envía logs a Grafana Cloud Loki (push API) en lotes, desde un hilo en
    segundo plano: no bloquea las requests y si Loki no responde, los logs
    se descartan en silencio (stdout/Railway sigue siendo la fuente primaria).

    Buenas prácticas Loki: pocas labels y de baja cardinalidad (service, env,
    level); el resto del contexto va dentro de la línea JSON.
    """

    def __init__(self, url, username, password, labels=None,
                 batch_size=100, flush_interval=2.0, queue_size=10000):
        super().__init__()
        self.endpoint = url.rstrip("/") + "/loki/api/v1/push"
        self.auth = (str(username), password)
        self.base_labels = labels or {}
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self._queue = queue.Queue(maxsize=queue_size)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._worker, daemon=True, name="loki-log-shipper")
        self._thread.start()
        atexit.register(self._shutdown)

    def emit(self, record):
        # Evitar recursión: el propio envío HTTP genera logs de urllib3/requests
        if record.name.startswith(("urllib3", "requests")):
            return
        try:
            line = self.format(record)
            ts_ns = str(int(record.created * 1_000_000_000))
            self._queue.put_nowait((ts_ns, line, record.levelname.lower()))
        except queue.Full:
            pass  # nunca bloquear ni romper la app por logging
        except Exception:
            self.handleError(record)

    def _worker(self):
        import requests as _requests
        while not self._stop.is_set() or not self._queue.empty():
            batch = []
            deadline = time.monotonic() + self.flush_interval
            while len(batch) < self.batch_size:
                timeout = deadline - time.monotonic()
                if timeout <= 0:
                    break
                try:
                    batch.append(self._queue.get(timeout=timeout))
                except queue.Empty:
                    break
            if not batch:
                continue
            # Agrupar por nivel (label de baja cardinalidad)
            streams = {}
            for ts_ns, line, level in batch:
                streams.setdefault(level, []).append([ts_ns, line])
            payload = {
                "streams": [
                    {"stream": {**self.base_labels, "level": level}, "values": values}
                    for level, values in streams.items()
                ]
            }
            try:
                _requests.post(self.endpoint, json=payload, auth=self.auth, timeout=5)
            except Exception:
                pass  # Loki caído no debe afectar a la app; Railway conserva los logs

    def _shutdown(self):
        self._stop.set()
        self._thread.join(timeout=5)
