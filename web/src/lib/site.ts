// Configuración del estudio (marca, contacto, colores, fuentes, pagos…).
// Sale del backend: GET /api/v1/site-config/public/. Se edita desde el panel
// (Ajustes), así que re-marcar la web NO requiere tocar código.
//
//  - Servidor: `await getSiteConfig()` (caché en memoria ~60 s). Si el backend
//    no responde devuelve los VALORES POR DEFECTO: la web nunca se cae por esto.
//  - Navegador: el <head> (components/SiteHead.astro) serializa la config en
//    `window.__SITE__`; los componentes React la leen con `useSite()` o
//    `getSiteClient()`.
import { serverApiRoot } from '../config';

export interface SiteContact {
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  maps_url: string;
  latitude: number | null;
  longitude: number | null;
  /** Zonas que atiende el estudio (barrios, ciudades cercanas…). */
  area_served: string[];
}

export interface SiteTheme {
  primary: string;
  secondary: string;
  dark: string;
  background: string;
  font_heading: string;
  font_body: string;
}

/** Textos editables de la portada (panel → Ajustes → Contenido de la web). */
export interface SiteContent {
  hero_title: string;
  hero_title_en: string;
  hero_subtitle: string;
  hero_subtitle_en: string;
  about_title: string;
  about_title_en: string;
  about_text: string;
  about_text_en: string;
  about_image_url: string;
}

export interface SiteConfig {
  /** URL pública de la web (dominio propio del panel o WEB_URL del servidor). */
  site_url: string;
  studio_name: string;
  tagline: string;
  tagline_en: string;
  description: string;
  description_en: string;
  content: SiteContent;
  logo_url: string;
  logo_light_url: string;
  favicon_url: string;
  og_image_url: string;
  contact: SiteContact;
  legal: { name: string; tax_id: string };
  theme: SiteTheme;
  currency: string;
  drop_in_price: string;
  timezone: string;
  cancel_min_hours: number;
  payments_enabled: boolean;
  stripe_publishable_key: string;
  google_login_enabled: boolean;
  /** Client ID de Google Identity Services ('' = sin botón de Google). */
  google_client_id: string;
  vapid_public_key: string;
  setup_completed: boolean;
}

/** Valores por defecto: los mismos que usa el backend para un estudio recién creado. */
export const DEFAULT_SITE: SiteConfig = {
  site_url: '',
  studio_name: 'Mi Estudio',
  tagline: '',
  tagline_en: '',
  description: '',
  description_en: '',
  content: {
    hero_title: '',
    hero_title_en: '',
    hero_subtitle: '',
    hero_subtitle_en: '',
    about_title: '',
    about_title_en: '',
    about_text: '',
    about_text_en: '',
    about_image_url: '',
  },
  logo_url: '',
  logo_light_url: '',
  favicon_url: '',
  og_image_url: '',
  contact: {
    email: '',
    phone: '',
    whatsapp: '',
    instagram: '',
    address: '',
    city: '',
    postal_code: '',
    country: '',
    maps_url: '',
    latitude: null,
    longitude: null,
    area_served: [],
  },
  legal: { name: '', tax_id: '' },
  theme: {
    primary: '#A0897C',
    secondary: '#85786B',
    dark: '#3D3228',
    background: '#F5F0EA',
    font_heading: 'Playfair Display',
    font_body: 'Jost',
  },
  currency: 'EUR',
  drop_in_price: '12',
  timezone: 'Europe/Madrid',
  cancel_min_hours: 8,
  payments_enabled: false,
  stripe_publishable_key: '',
  google_login_enabled: false,
  google_client_id: '',
  vapid_public_key: '',
  setup_completed: false,
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// Nombres de Google Fonts: letras, números, espacios y guiones (nada que pueda
// romper el CSS o la URL donde se inyectan).
const FONT = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,60}$/;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fallback);
const font = (v: unknown, fallback: string) => (typeof v === 'string' && FONT.test(v.trim()) ? v.trim() : fallback);

/** Origen (https://dominio) de una URL absoluta http(s), o '' si no es válida. */
export function originOf(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

/** Zona horaria IANA válida para Intl (o '' si no lo es). */
function validTimeZone(tz: string): string {
  if (!tz) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return '';
  }
}

/** Mezcla lo que llega del API con los valores por defecto y lo valida. */
export function normalizeSite(raw: unknown): SiteConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = DEFAULT_SITE;
  const c = (r.contact || {}) as Record<string, unknown>;
  const t = (r.theme || {}) as Record<string, unknown>;
  const l = (r.legal || {}) as Record<string, unknown>;
  const ct = (r.content || {}) as Record<string, unknown>;
  const hours = Number(r.cancel_min_hours);
  const coord = (v: unknown, max: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
  };
  return {
    site_url: originOf(str(r.site_url)),
    studio_name: str(r.studio_name) || d.studio_name,
    tagline: str(r.tagline),
    tagline_en: str(r.tagline_en),
    description: str(r.description),
    description_en: str(r.description_en),
    content: {
      hero_title: str(ct.hero_title),
      hero_title_en: str(ct.hero_title_en),
      hero_subtitle: str(ct.hero_subtitle),
      hero_subtitle_en: str(ct.hero_subtitle_en),
      about_title: str(ct.about_title),
      about_title_en: str(ct.about_title_en),
      about_text: str(ct.about_text),
      about_text_en: str(ct.about_text_en),
      about_image_url: str(ct.about_image_url),
    },
    logo_url: str(r.logo_url),
    logo_light_url: str(r.logo_light_url) || str(r.logo_url),
    favicon_url: str(r.favicon_url) || str(r.logo_url),
    og_image_url: str(r.og_image_url),
    contact: {
      email: str(c.email),
      phone: str(c.phone),
      whatsapp: str(c.whatsapp),
      instagram: str(c.instagram),
      address: str(c.address),
      city: str(c.city),
      postal_code: str(c.postal_code),
      country: str(c.country),
      maps_url: str(c.maps_url),
      latitude: coord(c.latitude, 90),
      longitude: coord(c.longitude, 180),
      area_served: Array.isArray(c.area_served)
        ? (c.area_served as unknown[]).map((x) => str(x)).filter(Boolean).slice(0, 30)
        : [],
    },
    legal: { name: str(l.name), tax_id: str(l.tax_id) },
    theme: {
      primary: color(t.primary, d.theme.primary),
      secondary: color(t.secondary, d.theme.secondary),
      dark: color(t.dark, d.theme.dark),
      background: color(t.background, d.theme.background),
      font_heading: font(t.font_heading, d.theme.font_heading),
      font_body: font(t.font_body, d.theme.font_body),
    },
    currency: /^[A-Z]{3}$/.test(str(r.currency).toUpperCase()) ? str(r.currency).toUpperCase() : d.currency,
    drop_in_price: str(r.drop_in_price != null ? String(r.drop_in_price) : '') || d.drop_in_price,
    timezone: validTimeZone(str(r.timezone)) || d.timezone,
    cancel_min_hours: Number.isFinite(hours) && hours >= 0 ? hours : d.cancel_min_hours,
    payments_enabled: r.payments_enabled === true,
    stripe_publishable_key: str(r.stripe_publishable_key),
    google_login_enabled: r.google_login_enabled === true && !!str(r.google_client_id),
    google_client_id: str(r.google_client_id),
    vapid_public_key: str(r.vapid_public_key),
    setup_completed: r.setup_completed === true,
  };
}

// ── Servidor ────────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
// Si el backend está caído no lo martilleamos en cada visita: reintento cada 10 s.
const FAIL_TTL_MS = 10 * 1000;
let cached: { at: number; ttl: number; data: SiteConfig } | null = null;
let inflight: Promise<SiteConfig> | null = null;

/** Config del estudio para el servidor. Nunca lanza: si falla, valores por defecto. */
export async function getSiteConfig(): Promise<SiteConfig> {
  if (cached && Date.now() - cached.at < cached.ttl) return cached.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${serverApiRoot()}/v1/site-config/public/`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`site-config ${res.status}`);
      const data = normalizeSite(await res.json());
      cached = { at: Date.now(), ttl: TTL_MS, data };
      return data;
    } catch {
      // Mejor la última config buena (aunque caducada) que los valores por defecto
      const data = cached?.data ?? DEFAULT_SITE;
      cached = { at: Date.now(), ttl: FAIL_TTL_MS, data };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// ── Navegador ───────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __SITE__?: SiteConfig;
  }
}

/** Config del estudio en el navegador (la deja el <head> en window.__SITE__). */
export function getSiteClient(): SiteConfig {
  if (typeof window !== 'undefined') return window.__SITE__ ?? DEFAULT_SITE;
  // En el servidor (islas React que se pre-renderizan con client:visible…): la
  // última config que cargó el <head> de esta misma petición. Es la misma para
  // todas las peticiones (un estudio por despliegue), así que no hay mezcla, y
  // el HTML del servidor coincide con el del navegador al hidratar.
  return cached?.data ?? DEFAULT_SITE;
}

/**
 * Hook para componentes React. La config no cambia mientras la página está
 * abierta, así que basta con leerla (sin estado ni efectos).
 */
export function useSite(): SiteConfig {
  return getSiteClient();
}

// ── Utilidades compartidas ─────────────────────────────────────────────────

/** JSON seguro para incrustar en <script> (sin `</script>` ni separadores de línea). */
export function siteJsonForScript(cfg: SiteConfig): string {
  return JSON.stringify(cfg)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Variables CSS de marca que usan todos los estilos (`var(--brand-primary)`…). */
export function themeCss(cfg: SiteConfig): string {
  const t = cfg.theme;
  return `:root{--brand-primary:${t.primary};--brand-secondary:${t.secondary};--brand-dark:${t.dark};--brand-bg:${t.background};--font-heading:"${t.font_heading}",Georgia,serif;--font-body:"${t.font_body}",system-ui,-apple-system,"Segoe UI",sans-serif;}`;
}

/** URL de Google Fonts con las dos familias de la config. */
export function googleFontsHref(cfg: SiteConfig): string {
  const fam = (name: string, axis: string) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}${axis}`;
  const families = cfg.theme.font_heading === cfg.theme.font_body
    ? [fam(cfg.theme.font_body, ':wght@300;400;500;600;700')]
    : [fam(cfg.theme.font_heading, ':wght@400;600;700'), fam(cfg.theme.font_body, ':wght@300;400;500;600;700')];
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/**
 * Texto de la config en el idioma pedido: en inglés usa el campo `_en` si
 * existe; si no, el español. `lt(site, 'tagline', 'en')`,
 * `lt(site.content, 'hero_title', lang)`.
 */
export function lt<T extends object>(obj: T, field: string, lang: string): string {
  const o = obj as Record<string, unknown>;
  if (lang === 'en') {
    const en = o[`${field}_en`];
    if (typeof en === 'string' && en.trim()) return en;
  }
  const v = o[field];
  return typeof v === 'string' ? v : '';
}

/** Solo dígitos (para wa.me y tel:). */
const digits = (s: string) => (s || '').replace(/[^\d]/g, '');

/** Enlace de WhatsApp (o '' si no hay). Acepta número o URL completa. */
export function whatsappUrl(cfg: SiteConfig, text?: string): string {
  const raw = cfg.contact.whatsapp || '';
  if (!raw) return '';
  const base = /^https?:\/\//.test(raw) ? raw : (digits(raw) ? `https://wa.me/${digits(raw)}` : '');
  if (!base || !text) return base;
  return `${base}${base.includes('?') ? '&' : '?'}text=${encodeURIComponent(text)}`;
}

/**
 * Mejor canal para escribir al estudio con un mensaje: WhatsApp; si no hay,
 * email; si no, teléfono. '' si el estudio no tiene ninguno.
 */
export function contactUrl(cfg: SiteConfig, text?: string): string {
  return whatsappUrl(cfg, text)
    || (cfg.contact.email ? `mailto:${cfg.contact.email}${text ? `?body=${encodeURIComponent(text)}` : ''}` : '')
    || phoneHref(cfg);
}

/** Enlace tel: (o '' si no hay teléfono). */
export function phoneHref(cfg: SiteConfig): string {
  const d = digits(cfg.contact.phone);
  return d ? `tel:${cfg.contact.phone.trim().startsWith('+') ? '+' : ''}${d}` : '';
}

/** Usuario de Instagram sin @ ni URL (o ''). */
export function instagramHandle(cfg: SiteConfig): string {
  const raw = (cfg.contact.instagram || '').trim();
  if (!raw) return '';
  const m = raw.match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : raw).replace(/^@/, '');
}

/** Enlace a Instagram (o ''). */
export function instagramUrl(cfg: SiteConfig): string {
  const h = instagramHandle(cfg);
  return h ? `https://www.instagram.com/${h}/` : '';
}

/** Dirección en una línea: "Calle X, 29000 Ciudad" (solo las partes que existan). */
export function addressLine(cfg: SiteConfig): string {
  const c = cfg.contact;
  const cityPart = [c.postal_code, c.city].filter(Boolean).join(' ');
  return [c.address, cityPart].filter(Boolean).join(', ');
}

/** Enlace a Google Maps: el de la config o una búsqueda con la dirección. */
export function mapsUrl(cfg: SiteConfig): string {
  if (cfg.contact.maps_url) return cfg.contact.maps_url;
  const q = [cfg.studio_name, addressLine(cfg)].filter(Boolean).join(', ');
  return addressLine(cfg) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

// Iconos que genera el backend a partir del icono/logo del estudio. La web los
// pide por su proxy /api (rutas relativas: valen en el navegador y en el HTML).
export const ICON_URL = {
  favicon: '/api/v1/site-config/icon/32.png',
  appleTouch: '/api/v1/site-config/icon/180.png',
  icon192: '/api/v1/site-config/icon/192.png',
  icon512: '/api/v1/site-config/icon/512.png',
  maskable512: '/api/v1/site-config/icon/512.png?maskable=1',
  og: '/api/v1/site-config/og.png',
} as const;

/** Nombre corto para la app instalada (iOS/Android lo cortan a ~12 caracteres). */
export function shortName(cfg: SiteConfig, max = 12): string {
  const n = cfg.studio_name.trim();
  return n.length <= max ? n : `${n.slice(0, max - 1).trimEnd()}…`;
}

/** Iniciales para el logo de texto / icono genérico ("Mi Estudio" → "ME"). */
export function studioInitials(cfg: SiteConfig): string {
  const words = cfg.studio_name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || 'S').slice(0, 1)).toUpperCase();
}

/** Formatea un importe en la moneda del estudio ("12 €", "€12.00"…). */
export function formatMoney(amount: number | string, cfg: SiteConfig = getSiteClient(), lang: 'es' | 'en' = 'es'): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'es-ES', {
      style: 'currency',
      currency: cfg.currency || 'EUR',
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} ${cfg.currency || 'EUR'}`;
  }
}
