// Cabeceras de seguridad de la web (todas las páginas y el proxy /api).
//
//  - Strict-Transport-Security: «esta web solo por HTTPS» (solo si ya llega
//    por HTTPS; includeSubDomains apagado salvo HSTS_INCLUDE_SUBDOMAINS=1,
//    porque el estudio puede usar su propio dominio con otros subdominios).
//  - X-Content-Type-Options, Referrer-Policy, X-Frame-Options y
//    Permissions-Policy (sin cámara, micrófono ni ubicación).
//  - Content-Security-Policy en modo SOLO INFORME (Report-Only): el navegador
//    avisa en la consola si algo se sale de la lista, pero NO bloquea nada.
//    Lista lo que la web carga de verdad: Stripe, Google Analytics/Ads, píxel
//    de Meta, Microsoft Clarity, YouTube sin cookies, OpenStreetMap, «Entrar
//    con Google», Turnstile y Google Fonts. Cuando lleve tiempo sin avisos se
//    puede pasar a Content-Security-Policy (bloqueante) con CSP_ENFORCE=1.
//  - frame-ancestors (siempre aplicado): solo la propia web y el panel del
//    estudio pueden enseñarla dentro de un marco (vista previa del panel).
import { defineMiddleware } from 'astro:middleware';
import { getPreviewFrameOrigins } from './lib/site';

function env(name: string): string {
  const e = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return e?.[name] || (import.meta.env[name] as string | undefined) || '';
}

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline': la web usa scripts en línea (tema, datos estructurados, consentimiento)
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com https://www.googletagmanager.com"
    + ' https://*.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net'
    + ' https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms https://accounts.google.com'
    + ' https://challenges.cloudflare.com',
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.google-analytics.com"
    + ' https://*.analytics.google.com https://www.googletagmanager.com https://*.g.doubleclick.net'
    + ' https://www.google.com https://www.googleadservices.com https://www.facebook.com https://*.clarity.ms'
    + ' https://accounts.google.com https://challenges.cloudflare.com',
  'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com'
    + ' https://www.youtube-nocookie.com https://www.openstreetmap.org https://accounts.google.com'
    + ' https://challenges.cloudflare.com https://td.doubleclick.net https://www.googletagmanager.com',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
];

/**
 * Quién puede enseñar la web dentro de un marco: ella misma y el panel del
 * estudio (vista previa de la guía de puesta en marcha). Va en una cabecera
 * Content-Security-Policy que SÍ se aplica (también en modo informe), así
 * que sustituye a X-Frame-Options sin perder la protección contra clickjacking.
 */
function frameAncestors(panelOrigins: string[]): string {
  return ["frame-ancestors 'self'", ...panelOrigins].join(' ');
}

function securityHeaders(request: Request, panelOrigins: string[]): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  // Sin panel conocido (o fuera de páginas HTML): la cabecera clásica basta
  if (!panelOrigins.length) h['X-Frame-Options'] = 'SAMEORIGIN';
  const proto = (request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', ''))
    .split(',')[0].trim();
  if (proto === 'https') {
    h['Strict-Transport-Security'] = `max-age=31536000${env('HSTS_INCLUDE_SUBDOMAINS') === '1' ? '; includeSubDomains' : ''}`;
  }
  return h;
}

export const onRequest = defineMiddleware(async (context, next) => {
  let response = await next();
  const isHtml = (response.headers.get('content-type') || '').includes('text/html');
  const panelOrigins = isHtml ? await getPreviewFrameOrigins().catch(() => []) : [];
  const headers = securityHeaders(context.request, panelOrigins);
  if (isHtml) {
    const ancestors = frameAncestors(panelOrigins);
    if (env('CSP_ENFORCE') === '1') {
      headers['Content-Security-Policy'] = [...CSP, ancestors].join('; ');
    } else {
      headers['Content-Security-Policy-Report-Only'] = CSP.join('; ');
      if (panelOrigins.length) headers['Content-Security-Policy'] = ancestors;
    }
  }
  try {
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  } catch {
    // Algunas respuestas (Response.redirect) traen cabeceras inmutables: se copian
    response = new Response(response.body, response);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  }
  return response;
});
