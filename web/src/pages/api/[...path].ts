// Proxy del API: el navegador llama a `/api/...` en esta misma web y aquí se
// reenvía al backend (`${API_URL}/api/...`). Así no hay CORS, la URL del
// backend puede ser privada (red interna de Railway, Docker…) y basta UNA
// variable de entorno (API_URL) para conectar la web con su backend.
//
// Reenvía cualquier método, la query string, el cuerpo tal cual (JSON,
// multipart con fotos, binario) y las cabeceras relevantes; devuelve el
// status, las cabeceras y el cuerpo del backend sin tocarlos.
import type { APIRoute } from 'astro';
import { backendOrigin } from '../../config';

export const prerender = false;

// Cabeceras de la petición que se pasan al backend.
const FORWARD_REQUEST = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'origin',
  'referer',
  'stripe-signature',
  'user-agent',
  'x-csrftoken',
  'x-requested-with',
];

// Cabeceras de la respuesta que NO se copian: las de salto (hop-by-hop) y las
// que dependen de cómo viajó el cuerpo. fetch ya descomprime la respuesta, así
// que content-encoding/content-length del backend serían falsos aquí.
const DROP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
]);

const TIMEOUT_MS = 60_000;

const proxy: APIRoute = async ({ request, clientAddress }) => {
  const incoming = new URL(request.url);
  // Ruta cruda (sin decodificar) y con su barra final, que Django exige en casi
  // todas las rutas: /api/v1/plans/?x=1 → ${API_URL}/api/v1/plans/?x=1
  const path = incoming.pathname.replace(/^\/api(?=\/|$)/, '');
  const target = `${backendOrigin()}/api${path}${incoming.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Datos del cliente real para los logs y límites de peticiones del backend.
  // OJO: el clientAddress de Astro es el PRIMER valor de X-Forwarded-For, que
  // puede escribirlo el propio navegador. Si la cabecera ya viene (nos la puso
  // el proxy HTTPS de entrada: Railway, Docker…), se reenvía tal cual: la
  // última IP la añadió ese proxy y es la fiable (el backend la busca de
  // derecha a izquierda). Solo sin cabecera se usa la IP de la conexión.
  const prevFor = request.headers.get('x-forwarded-for');
  let ip = '';
  try { ip = clientAddress; } catch { /* sin IP disponible */ }
  if (prevFor) headers.set('x-forwarded-for', prevFor);
  else if (ip) headers.set('x-forwarded-for', ip);
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', request.headers.get('x-forwarded-proto') || incoming.protocol.replace(':', ''));

  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  // El cuerpo se lee entero como binario: vale para JSON, multipart y ficheros,
  // y evita los problemas de reenviar streams (duplex) entre runtimes.
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: 'manual',
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const timeout = (err as Error)?.name === 'AbortError';
    console.error(`[api-proxy] ${method} ${target} → ${timeout ? 'timeout' : (err as Error)?.message}`);
    return new Response(
      JSON.stringify({
        detail: timeout ? 'El servidor tarda demasiado en responder.' : 'No se puede conectar con el servidor.',
        code: timeout ? 'upstream_timeout' : 'upstream_unavailable',
      }),
      { status: timeout ? 504 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    const n = name.toLowerCase();
    if (DROP_RESPONSE.has(n) || n === 'set-cookie') return;
    responseHeaders.append(name, value);
  });
  // Set-Cookie puede venir repetida: se copia una a una
  const cookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of cookies) responseHeaders.append('set-cookie', c);

  // Redirecciones del backend: si apuntan a su propio dominio, se reescriben a /api
  const location = responseHeaders.get('location');
  if (location && location.startsWith(backendOrigin())) {
    responseHeaders.set('location', location.slice(backendOrigin().length));
  }

  const noBody = method === 'HEAD' || [101, 204, 205, 304].includes(upstream.status);
  const payload = noBody ? null : await upstream.arrayBuffer();
  clearTimeout(timer);
  return new Response(payload, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
