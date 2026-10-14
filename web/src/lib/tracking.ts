// Analítica y conversiones CON CONSENTIMIENTO (RGPD / LSSI).
//
// Única puerta para medir algo desde la web:
//
//   track('sign_up', { method: 'email' })
//   track('purchase', { value: 45, currency: 'EUR', transaction_id: 'abc123' })
//   track('book', { class_name: 'Pilates Mat' })
//   track('contact', { method: 'whatsapp' })
//
// No hace NADA si:
//  - el estudio no tiene ningún ID (GA4, Google Ads, píxel de Meta o Clarity):
//    entonces SiteHead no pinta <CookieConsent> y `window.__TRK__` no existe;
//  - la visitante no ha aceptado la categoría que toca (analítica / publicidad).
//
// Consent Mode v2 «básico»: el <head> deja `gtag('consent','default', …denied)`
// y NINGÚN script de terceros se pide hasta que se acepta. Al aceptar se
// actualiza el consentimiento y se cargan solo los scripts de las categorías
// aceptadas:
//  - Analítica  → GA4 (gtag.js) y Microsoft Clarity.
//  - Publicidad → Google Ads (gtag.js) y píxel de Meta (fbevents.js).
//
// El banner (lib/cookie-consent.ts) guarda la elección con saveConsent().

export type TrackEvent = 'sign_up' | 'purchase' | 'book' | 'contact';

export interface TrackData {
  /** sign_up: 'email' | 'google'. contact: 'whatsapp' | 'phone' | 'email'. */
  method?: string;
  /** purchase: importe total. */
  value?: number;
  /** purchase: moneda ISO (EUR…). */
  currency?: string;
  /** purchase: id de la transacción (evita contarla dos veces si se recarga). */
  transaction_id?: string;
  /** book: nombre de la clase. */
  class_name?: string;
  /** purchase: líneas (opcional). */
  items?: { item_name: string; price?: number; quantity?: number }[];
}

/** IDs del estudio para esta página (los deja el <head>: components/CookieConsent.astro). */
export interface TrackingConfig {
  ga4?: string;
  ads?: string;
  adsPurchase?: string;
  adsSignup?: string;
  pixel?: string;
  clarity?: string;
  /**
   * Página sin analítica automática (legales, resultado del pago, enlaces con
   * token): ni page_view ni Clarity. Los eventos (compra…) sí se envían.
   */
  lazy?: boolean;
}

/** Elección guardada en localStorage (con versión y fecha). */
export interface ConsentChoice {
  v: number;
  at: string;
  analytics: boolean;
  ads: boolean;
}

type Fn = (...args: unknown[]) => void;

declare global {
  interface Window {
    __TRK__?: TrackingConfig;
    dataLayer?: unknown[];
    gtag?: Fn;
    fbq?: Fn & { callMethod?: Fn; queue?: unknown[] };
    _fbq?: unknown;
    clarity?: Fn & { q?: unknown[] };
  }
}

export const CONSENT_KEY = 'cookie.consent';
/** Súbela si cambian las categorías o los proveedores: se vuelve a preguntar. */
export const CONSENT_VERSION = 1;
/** La elección se vuelve a pedir pasados 12 meses (criterio de la AEPD: máx. 24). */
const CONSENT_MAX_AGE_MS = 365 * 24 * 3600 * 1000;
const SENT_KEY = 'trk.sent';

const isBrowser = () => typeof window !== 'undefined';

/** IDs configurados en esta página, o null si no hay ninguno. */
export function trackingConfig(): TrackingConfig | null {
  if (!isBrowser()) return null;
  const c = window.__TRK__;
  return c && (c.ga4 || c.ads || c.pixel || c.clarity) ? c : null;
}

/** Categorías que existen según lo configurado. */
export function availableCategories(cfg: TrackingConfig | null = trackingConfig()) {
  return { analytics: !!(cfg?.ga4 || cfg?.clarity), ads: !!(cfg?.ads || cfg?.pixel) };
}

/** Elección vigente (misma versión y de menos de 12 meses) o null. */
export function readConsent(): ConsentChoice | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || c.v !== CONSENT_VERSION) return null;
    const at = Date.parse(c.at);
    if (!Number.isFinite(at) || Date.now() - at > CONSENT_MAX_AGE_MS) return null;
    return { v: c.v, at: c.at, analytics: c.analytics === true, ads: c.ads === true };
  } catch {
    return null;
  }
}

/** Guarda la elección, la aplica (carga o retira scripts) y avisa con el evento `cookie-consent`. */
export function saveConsent(analytics: boolean, ads: boolean): ConsentChoice {
  const c: ConsentChoice = { v: CONSENT_VERSION, at: new Date().toISOString(), analytics, ads };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch { /* modo privado: vale para esta página */ }
  applyConsent(c);
  try {
    window.dispatchEvent(new CustomEvent('cookie-consent', { detail: c }));
  } catch { /* navegadores muy antiguos */ }
  return c;
}

// ── Estado de esta página ───────────────────────────────────────────────────

let applied: ConsentChoice | null = null;
let gtagLoaded = false;
const gtagConfigured = new Set<string>();
let pixelLoaded = false;
let pixelRevoked = false;
let pixelPageView = false;
let clarityLoaded = false;
let clarityConsent = '';

/** Llamada a gtag (encola en dataLayer aunque gtag.js aún no haya llegado). */
function gtag(...args: unknown[]) {
  const w = window;
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag) {
    // gtag.js necesita el objeto `arguments`, no un array
    w.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  w.gtag(...args);
}

function injectScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

// Parámetros de la URL que nunca deben llegar a terceros (tokens, sesión de pago…)
const SENSITIVE_PARAM = /^(session_id|token|code|uid|uidb64|key|email|password|access|refresh)$/i;

function hasSensitiveParams(): boolean {
  try {
    return [...new URLSearchParams(location.search).keys()].some((k) => SENSITIVE_PARAM.test(k));
  } catch {
    return false;
  }
}

/** URL actual sin parámetros sensibles (para page_location). */
function cleanLocation(): string {
  try {
    const u = new URL(location.href);
    for (const k of [...u.searchParams.keys()]) if (SENSITIVE_PARAM.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return location.origin + location.pathname;
  }
}

/** ¿Esta página registra visitas sola (page_view, Clarity)? */
function autoPageView(cfg: TrackingConfig): boolean {
  return !cfg.lazy && !hasSensitiveParams();
}

/** Carga (una vez) los scripts de las categorías aceptadas. */
function load(c: ConsentChoice, cfg: TrackingConfig) {
  const pageView = autoPageView(cfg);

  // Google: un solo gtag.js para GA4 (analítica) y Google Ads (publicidad)
  const googleIds = [c.analytics ? cfg.ga4 : '', c.ads ? cfg.ads : ''].filter(Boolean) as string[];
  if (googleIds.length) {
    if (!gtagLoaded) {
      gtagLoaded = true;
      injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleIds[0])}`);
      gtag('js', new Date());
    }
    for (const id of googleIds) {
      if (gtagConfigured.has(id)) continue;
      gtagConfigured.add(id);
      gtag('config', id, { send_page_view: pageView, page_location: cleanLocation() });
    }
  }

  // Píxel de Meta: solo con «Publicidad»
  if (c.ads && cfg.pixel) {
    if (!pixelLoaded) {
      pixelLoaded = true;
      loadPixel(cfg.pixel);
    } else if (pixelRevoked) {
      pixelRevoked = false;
      window.fbq?.('consent', 'grant');
    }
    if (pageView && !pixelPageView) {
      pixelPageView = true;
      window.fbq?.('track', 'PageView');
    }
  }

  // Microsoft Clarity: solo con «Analítica» y en páginas con analítica automática
  if (c.analytics && cfg.clarity && pageView) {
    if (!clarityLoaded) {
      clarityLoaded = true;
      loadClarity(cfg.clarity);
    }
    const consent = c.ads ? 'granted' : 'denied';
    if (clarityConsent !== consent) {
      if (clarityConsent === 'revoked') window.clarity?.('consent');
      clarityConsent = consent;
      window.clarity?.('consentv2', { ad_Storage: consent, analytics_Storage: 'granted' });
    }
  }
}

function loadPixel(id: string) {
  const w = window;
  if (!w.fbq) {
    // Fragmento oficial de Meta, sin el PageView automático
    const n = function () {
      // eslint-disable-next-line prefer-rest-params
      if (n.callMethod) n.callMethod.apply(n, arguments as unknown as unknown[]);
      // eslint-disable-next-line prefer-rest-params
      else n.queue!.push(arguments);
    } as unknown as NonNullable<Window['fbq']> & Record<string, unknown>;
    w.fbq = n;
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    injectScript('https://connect.facebook.net/en_US/fbevents.js');
  }
  w.fbq!('init', id);
}

function loadClarity(id: string) {
  const w = window;
  if (!w.clarity) {
    const c = function () {
      // eslint-disable-next-line prefer-rest-params
      (c.q = c.q || []).push(arguments);
    } as NonNullable<Window['clarity']>;
    w.clarity = c;
  }
  injectScript(`https://www.clarity.ms/tag/${encodeURIComponent(id)}`);
}

// Cookies propias que dejan estos proveedores (se borran al retirar el permiso)
const ANALYTICS_COOKIES = /^(_ga|_ga_.*|_gid|_gat.*|_clck|_clsk)$/;
const ADS_COOKIES = /^(_gcl_.*|_fbp|_fbc)$/;

function deleteCookies(re: RegExp) {
  const host = location.hostname;
  const parts = host.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join('.')}`);
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (!name || !re.test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    }
  }
}

/** Retira el permiso de lo que se haya cargado y borra sus cookies. */
function revoke(c: ConsentChoice) {
  if (!c.ads) {
    if (pixelLoaded && !pixelRevoked) {
      pixelRevoked = true;
      window.fbq?.('consent', 'revoke');
    }
    deleteCookies(ADS_COOKIES);
  }
  if (!c.analytics) {
    if (clarityLoaded && clarityConsent !== 'revoked') {
      clarityConsent = 'revoked';
      window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
      window.clarity?.('consent', false);
    }
    deleteCookies(ANALYTICS_COOKIES);
  }
}

/**
 * Aplica una elección en esta página: actualiza Consent Mode, carga lo
 * aceptado (en páginas con analítica automática) y retira lo rechazado.
 */
export function applyConsent(c: ConsentChoice) {
  const cfg = trackingConfig();
  if (!cfg) return;
  applied = c;
  if (cfg.ga4 || cfg.ads) {
    const ad = c.ads ? 'granted' : 'denied';
    gtag('consent', 'update', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: ad,
      ad_user_data: ad,
      ad_personalization: ad,
    });
  }
  revoke(c);
  if (autoPageView(cfg)) load(c, cfg);
}

// ── Conversiones ────────────────────────────────────────────────────────────

function alreadySent(id: string): boolean {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SENT_KEY) || '[]');
    return Array.isArray(list) && list.includes(id);
  } catch {
    return false;
  }
}

function markSent(id: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(SENT_KEY) || '[]');
    const next = [...(Array.isArray(list) ? list : []).filter((x) => x !== id), id].slice(-30);
    localStorage.setItem(SENT_KEY, JSON.stringify(next));
  } catch { /* sin almacenamiento: puede duplicarse al recargar */ }
}

/**
 * Registra un evento de conversión. Sin IDs o sin consentimiento no hace nada
 * (ni carga scripts). Nunca lanza.
 */
export function track(event: TrackEvent, data: TrackData = {}): void {
  try {
    const cfg = trackingConfig();
    if (!cfg) return;
    const c = applied ?? readConsent();
    if (!c || (!c.analytics && !c.ads)) return;

    const ga = c.analytics && cfg.ga4 ? cfg.ga4 : '';
    const ads = c.ads && cfg.ads ? cfg.ads : '';
    const fb = c.ads && !!cfg.pixel;
    if (!ga && !ads && !fb) return;

    if (event === 'purchase') {
      if (!data.transaction_id || alreadySent(`purchase:${data.transaction_id}`)) return;
      markSent(`purchase:${data.transaction_id}`);
    }

    // Páginas sin analítica automática: los scripts aceptados se cargan ahora
    load(c, cfg);

    const value = Number.isFinite(data.value) ? Math.round(Number(data.value) * 100) / 100 : undefined;
    const currency = (data.currency || '').toUpperCase() || undefined;

    switch (event) {
      case 'sign_up':
        if (ga) gtag('event', 'sign_up', { send_to: ga, method: data.method || 'email' });
        if (ads && cfg.adsSignup) gtag('event', 'conversion', { send_to: `${ads}/${cfg.adsSignup}` });
        if (fb) window.fbq?.('track', 'CompleteRegistration', { status: true });
        break;
      case 'purchase':
        if (ga) {
          gtag('event', 'purchase', {
            send_to: ga, transaction_id: data.transaction_id, value, currency,
            ...(data.items?.length ? { items: data.items } : {}),
          });
        }
        if (ads && cfg.adsPurchase) {
          gtag('event', 'conversion', {
            send_to: `${ads}/${cfg.adsPurchase}`, value, currency, transaction_id: data.transaction_id,
          });
        }
        if (fb) {
          window.fbq?.('track', 'Purchase', { value: value ?? 0, currency: currency || 'EUR' },
            { eventID: data.transaction_id });
        }
        break;
      case 'book':
        if (ga) gtag('event', 'book_class', { send_to: ga, class_name: data.class_name || '' });
        if (fb) window.fbq?.('track', 'Schedule', data.class_name ? { content_name: data.class_name } : {});
        break;
      case 'contact':
        if (ga) gtag('event', 'contact', { send_to: ga, method: data.method || '' });
        if (fb) window.fbq?.('track', 'Contact');
        break;
    }
  } catch {
    /* la medición nunca debe romper la web */
  }
}

/**
 * Tipo de contacto de un enlace (WhatsApp, teléfono o email) o null. Para
 * `track('contact', { method })` en los enlaces y botones de contacto.
 */
export function contactMethod(href: string): 'whatsapp' | 'phone' | 'email' | null {
  const h = (href || '').trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith('tel:')) return 'phone';
  if (h.startsWith('mailto:')) return 'email';
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\//.test(h)) return 'whatsapp';
  return null;
}

/**
 * Id corto y estable para una transacción a partir de un id sensible (p. ej.
 * la sesión de pago de Stripe): a los terceros nunca les llega el original.
 */
export function hashId(input: string): string {
  // cyrb53 (hash no criptográfico de 53 bits): suficiente para deduplicar
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `t${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
