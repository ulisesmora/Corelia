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
  /**
   * Estilo visual (acabado) de la web: 'natural' | 'minimal' | 'editorial' |
   * 'glass' | 'brutalist' | 'energy' | 'pop' | 'neon'. Cada uno es un bloque
   * `[data-style="…"]` en styles/presets.css (ver docs/ESTILOS.md). Un valor
   * sin bloque CSS se ve como 'natural'.
   */
  style: string;
  /** Familia de iconos: 'line' (Lucide) | 'soft' (Phosphor) | 'solid' (FontAwesome). */
  icons: 'line' | 'soft' | 'solid';
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

  // ── Google Business y redes (enlaces públicos http(s) o '') ──
  /** Ficha de Google Business (maps.app.goo.gl, g.page, google.com/maps…). */
  google_business_url: string;
  /** Enlace «Escribir una reseña» de la ficha de Google. */
  google_review_url: string;
  facebook_url: string;
  tiktok_url: string;
  youtube_url: string;

  // ── Verificación de buscadores (solo el código) ──
  google_site_verification: string;
  bing_site_verification: string;

  // ── Portada (lib/hero.ts) ──
  /** Qué se ve en la portada: foto, vídeo de YouTube o ilustración (lib/hero-art.ts). */
  hero_mode: 'image' | 'video' | 'illustration';
  /** Foto elegida en Ajustes → Portada ('' = la primera de Imágenes → Portada). */
  hero_image_url: string;
  /** ID del vídeo de YouTube (11 caracteres) o ''. */
  hero_video_id: string;
  /** Miniatura del vídeo guardada en el propio servidor (nada de pedirla a YouTube). */
  hero_video_poster_url: string;
  /** Postura de la ilustración (HERO_POSES de lib/hero-art.ts). */
  hero_illustration: string;

  // ── Analítica y publicidad (IDs públicos; solo con consentimiento: lib/tracking.ts) ──
  ga4_measurement_id: string;
  google_ads_id: string;
  google_ads_purchase_label: string;
  google_ads_signup_label: string;
  meta_pixel_id: string;
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
    style: 'natural',
    icons: 'line',
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
  google_business_url: '',
  google_review_url: '',
  facebook_url: '',
  tiktok_url: '',
  youtube_url: '',
  google_site_verification: '',
  bing_site_verification: '',
  hero_mode: 'image',
  hero_image_url: '',
  hero_video_id: '',
  hero_video_poster_url: '',
  hero_illustration: 'reformer',
  ga4_measurement_id: '',
  google_ads_id: '',
  google_ads_purchase_label: '',
  google_ads_signup_label: '',
  meta_pixel_id: '',
};

/**
 * Patrones de los IDs de verificación/analítica (los mismos que valida el
 * backend). Se vuelven a comprobar aquí porque van dentro de <meta> y de
 * scripts: un valor que no cumpla el patrón se descarta.
 */
export const TRACKING_PATTERNS = {
  google_site_verification: /^[A-Za-z0-9_-]{10,120}$/,
  bing_site_verification: /^[A-Za-z0-9]{8,120}$/,
  ga4_measurement_id: /^G-[A-Z0-9]{4,15}$/,
  google_ads_id: /^AW-\d{6,15}$/,
  google_ads_purchase_label: /^[A-Za-z0-9_-]{4,60}$/,
  google_ads_signup_label: /^[A-Za-z0-9_-]{4,60}$/,
  meta_pixel_id: /^\d{10,20}$/,
} as const;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// Nombres de Google Fonts: letras, números, espacios y guiones (nada que pueda
// romper el CSS o la URL donde se inyectan).
const FONT = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,60}$/;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fallback);
const font = (v: unknown, fallback: string) => (typeof v === 'string' && FONT.test(v.trim()) ? v.trim() : fallback);
// Slug de estilo: solo minúsculas, números y guiones (va a un atributo HTML y a
// selectores CSS). No hay lista cerrada: añadir un estilo nuevo = backend + su
// bloque en presets.css; si el bloque no existe se ve como 'natural'.
const STYLE = /^[a-z][a-z0-9-]{0,23}$/;
const ICON_FAMILIES = ['line', 'soft', 'solid'] as const;
const HERO_MODES = ['image', 'video', 'illustration'] as const;
/** ID de un vídeo de YouTube: va dentro de la URL del iframe, así que solo este patrón. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

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

/**
 * ID del proyecto de Microsoft Clarity (variable PUBLIC_CLARITY_ID del
 * servidor o fijada en el build), o '' si no hay o no es válido. Solo se carga
 * con consentimiento de «Analítica» (lib/tracking.ts).
 */
export function clarityProjectId(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw = env?.PUBLIC_CLARITY_ID || (import.meta.env.PUBLIC_CLARITY_ID as string | undefined) || '';
  return /^[a-z0-9]{4,20}$/i.test(raw) ? raw : '';
}

/** Enlace público http(s) válido (o ''). */
function publicUrl(v: unknown): string {
  const raw = str(v);
  if (!raw || !/^https?:\/\//i.test(raw)) return '';
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !/["'<>\s]/.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

const tracking = (key: keyof typeof TRACKING_PATTERNS, v: unknown): string => {
  const raw = str(v);
  return TRACKING_PATTERNS[key].test(raw) ? raw : '';
};

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
      style: typeof t.style === 'string' && STYLE.test(t.style.trim()) ? t.style.trim() : d.theme.style,
      icons: (ICON_FAMILIES as readonly string[]).includes(t.icons as string)
        ? (t.icons as SiteTheme['icons'])
        : d.theme.icons,
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
    google_business_url: publicUrl(r.google_business_url),
    google_review_url: publicUrl(r.google_review_url),
    facebook_url: publicUrl(r.facebook_url),
    tiktok_url: publicUrl(r.tiktok_url),
    youtube_url: publicUrl(r.youtube_url),
    google_site_verification: tracking('google_site_verification', r.google_site_verification),
    bing_site_verification: tracking('bing_site_verification', r.bing_site_verification),
    hero_mode: (HERO_MODES as readonly string[]).includes(r.hero_mode) ? r.hero_mode : 'image',
    hero_image_url: publicUrl(r.hero_image_url),
    hero_video_id: typeof r.hero_video_id === 'string' && YOUTUBE_ID.test(r.hero_video_id) ? r.hero_video_id : '',
    hero_video_poster_url: publicUrl(r.hero_video_poster_url),
    hero_illustration: typeof r.hero_illustration === 'string' && STYLE.test(r.hero_illustration) ? r.hero_illustration : 'reformer',
    ga4_measurement_id: tracking('ga4_measurement_id', r.ga4_measurement_id),
    google_ads_id: tracking('google_ads_id', r.google_ads_id),
    google_ads_purchase_label: tracking('google_ads_purchase_label', r.google_ads_purchase_label),
    google_ads_signup_label: tracking('google_ads_signup_label', r.google_ads_signup_label),
    meta_pixel_id: tracking('meta_pixel_id', r.meta_pixel_id),
  };
}

// ── Servidor ────────────────────────────────────────────────────────────────

const TTL_MS = 60 * 1000;
// Si el backend está caído no lo martilleamos en cada visita: reintento cada 10 s.
const FAIL_TTL_MS = 10 * 1000;
let cached: { at: number; ttl: number; data: SiteConfig } | null = null;
let inflight: Promise<SiteConfig> | null = null;

/**
 * true si `cfg` son los valores por defecto porque el backend no respondió
 * (nunca se ha cargado una config real). Útil para no publicar decisiones de
 * SEO (robots.txt) basadas en datos que no son del estudio.
 */
export function isFallbackSite(cfg: SiteConfig): boolean {
  return cfg === DEFAULT_SITE;
}

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

// ── Colores derivados (contraste) ──────────────────────────────────────────
// Se calculan aquí, una vez y en el servidor, para que presets.css pueda dar
// siempre texto legible sea cual sea la paleta del panel.

function rgbOf(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexOf = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
/** Luminancia relativa (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contraste WCAG entre dos colores (1…21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Mezcla `a` con `b` (t = 0 → a, t = 1 → b). */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return hexOf(x.map((v, i) => v + (y[i] - v) * t));
}
/** Acerca `color` a `towards` hasta tener `min` de contraste contra `against`. */
function ensureContrast(color: string, against: string, min: number, towards: string): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(color, towards, t);
    if (contrast(c, against) >= min) return c;
  }
  return towards;
}

/**
 * Variables CSS de marca que usan todos los estilos (`var(--brand-primary)`…)
 * más unas derivadas para garantizar contraste:
 *  - --on-primary: texto sobre un relleno del color primario (blanco u oscuro).
 *  - --on-secondary: lo mismo sobre el secundario.
 *  - --brand-primary-2: segundo tono del primario (degradados, hover) con el
 *    que --on-primary sigue siendo legible.
 *  - --brand-bg-light / --brand-bg-dark: el fondo de la marca si ya es claro /
 *    oscuro; si no, una versión que lo sea (los estilos claros usan el primero
 *    y los oscuros el segundo, así una paleta "equivocada" sigue siendo legible).
 *  - --brand-primary-on-light / --brand-primary-on-dark: el primario como TEXTO
 *    legible sobre fondo claro / oscuro (≥ 4.5:1).
 */
export function themeCss(cfg: SiteConfig): string {
  const t = cfg.theme;
  const NEAR_BLACK = '#0b0b10';
  const onFill = (fill: string) => (contrast(fill, '#ffffff') >= 3 ? '#ffffff' : (contrast(t.dark, fill) >= 4.5 ? t.dark : NEAR_BLACK));
  const bgLight = luminance(t.background) >= 0.6 ? t.background : mix(t.background, '#ffffff', 0.88);
  const bgDark = luminance(t.background) <= 0.06 ? t.background : mix(t.background, NEAR_BLACK, 0.9);
  const primaryOnLight = ensureContrast(t.primary, '#ffffff', 4.5, t.dark);
  const primaryOnDark = ensureContrast(t.primary, bgDark, 4.5, '#ffffff');
  const onPrimary = onFill(t.primary);
  // Segundo tono del primario para degradados y hover: más oscuro si el texto
  // encima es blanco, más claro si es oscuro (el texto sigue leyéndose).
  const primary2 = onPrimary === '#ffffff' ? mix(t.primary, t.dark, 0.35) : mix(t.primary, '#ffffff', 0.3);
  return `:root{--brand-primary:${t.primary};--brand-secondary:${t.secondary};--brand-dark:${t.dark};--brand-bg:${t.background};`
    + `--on-primary:${onPrimary};--on-secondary:${onFill(t.secondary)};--brand-primary-2:${primary2};`
    + `--brand-bg-light:${bgLight};--brand-bg-dark:${bgDark};`
    + `--brand-primary-on-light:${primaryOnLight};--brand-primary-on-dark:${primaryOnDark};`
    + `--font-heading:"${t.font_heading}",Georgia,serif;--font-body:"${t.font_body}",system-ui,-apple-system,"Segoe UI",sans-serif;}`;
}

/**
 * Atributos de <html> con el estilo y la familia de iconos: `data-style` y
 * `data-icons`. Ponlos en el <html> de cada página (`<html {...htmlThemeAttrs(site)}>`)
 * para que presets.css aplique desde el primer pintado, sin parpadeo.
 */
export function htmlThemeAttrs(cfg: SiteConfig): { 'data-style': string; 'data-icons': string } {
  return { 'data-style': cfg.theme.style, 'data-icons': cfg.theme.icons };
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

export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'google-business';

/**
 * Perfiles públicos del estudio (Instagram, Facebook, TikTok, YouTube y la
 * ficha de Google), en ese orden y solo los que existen. Para enlaces de la
 * web y `sameAs` del JSON-LD.
 */
export function socialProfiles(cfg: SiteConfig): { network: SocialNetwork; label: string; url: string }[] {
  return ([
    { network: 'instagram', label: 'Instagram', url: instagramUrl(cfg) },
    { network: 'facebook', label: 'Facebook', url: cfg.facebook_url },
    { network: 'tiktok', label: 'TikTok', url: cfg.tiktok_url },
    { network: 'youtube', label: 'YouTube', url: cfg.youtube_url },
    { network: 'google-business', label: 'Google', url: cfg.google_business_url },
  ] as const).filter((p) => !!p.url).map((p) => ({ ...p }));
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
