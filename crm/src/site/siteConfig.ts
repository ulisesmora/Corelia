import { API_BASE_URL } from '../config';
import { cleanFontName } from './fonts';
import { DEFAULT_STUDIO_TZ } from './timezone';

// ====================================================================
// Configuración pública del estudio (GET /api/v1/site-config/public/)
// Nombre, logo, contacto, colores y fuentes: todo lo que en el panel antes
// estaba escrito a mano para un estudio concreto.
// ====================================================================

export interface SiteContact {
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: string;
  city: string;
  postal_code?: string;
  country?: string;
  maps_url?: string;
}

export interface SiteThemeConfig {
  /** Colores "#RRGGBB" */
  primary: string;
  secondary: string;
  dark: string;
  background: string;
  /** Nombres de Google Fonts */
  font_heading: string;
  font_body: string;
}

export interface SiteConfigPublic {
  studio_name: string;
  tagline: string;
  logo_url: string;
  logo_light_url: string;
  favicon_url: string;
  contact: SiteContact;
  theme: SiteThemeConfig;
  /** Moneda del estudio (ISO 4217): EUR, USD, MXN… */
  currency: string;
  /** País del estudio (ISO-2): formato de los importes (es-ES, es-MX…) */
  country: string;
  /** Precio de la clase suelta, en la moneda del estudio (0 = sin poner) */
  drop_in_price: number;
  cancel_min_hours: number;
  payments_enabled: boolean;
  setup_completed: boolean;
  /** Zona horaria IANA del estudio */
  timezone: string;
  /** Web pública del estudio, si el backend la incluye en la config pública */
  web_url?: string;
}

export const DEFAULT_SITE_CONFIG: SiteConfigPublic = {
  studio_name: 'Mi Estudio',
  tagline: '',
  logo_url: '',
  logo_light_url: '',
  favicon_url: '',
  contact: { email: '', phone: '', whatsapp: '', instagram: '', address: '', city: '' },
  theme: {
    primary: '#A0897C',
    secondary: '#85786B',
    dark: '#3D3228',
    background: '#F5F0EA',
    font_heading: 'Playfair Display',
    font_body: 'Jost',
  },
  currency: 'EUR',
  country: 'ES',
  drop_in_price: 0,
  cancel_min_hours: 12,
  payments_enabled: false,
  setup_completed: false,
  timezone: DEFAULT_STUDIO_TZ,
  web_url: '',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fallback);

/** Mezcla lo que llega del backend con los valores por defecto (nada vacío ni inválido). */
export function normalizeSiteConfig(raw: unknown): SiteConfigPublic {
  const d = DEFAULT_SITE_CONFIG;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = (r.theme && typeof r.theme === 'object' ? r.theme : {}) as Record<string, unknown>;
  const c = (r.contact && typeof r.contact === 'object' ? r.contact : {}) as Record<string, unknown>;
  const contact = { ...d.contact } as SiteContact & Record<string, string>;
  for (const [k, v] of Object.entries(c)) if (typeof v === 'string') contact[k] = v;
  return {
    studio_name: str(r.studio_name, d.studio_name),
    tagline: str(r.tagline, ''),
    logo_url: str(r.logo_url, ''),
    logo_light_url: str(r.logo_light_url, ''),
    favicon_url: str(r.favicon_url, ''),
    contact,
    theme: {
      primary: color(t.primary, d.theme.primary),
      secondary: color(t.secondary, d.theme.secondary),
      dark: color(t.dark, d.theme.dark),
      background: color(t.background, d.theme.background),
      font_heading: cleanFontName(t.font_heading as string, d.theme.font_heading),
      font_body: cleanFontName(t.font_body as string, d.theme.font_body),
    },
    currency: /^[A-Z]{3}$/.test(str(r.currency, '').toUpperCase()) ? str(r.currency, '').toUpperCase() : d.currency,
    country: [r.country, c.country].map((v) => str(v, '').toUpperCase()).find((v) => /^[A-Z]{2}$/.test(v)) || d.country,
    drop_in_price: Number.isFinite(Number(r.drop_in_price)) ? Math.max(0, Number(r.drop_in_price)) : 0,
    cancel_min_hours: typeof r.cancel_min_hours === 'number' ? r.cancel_min_hours : d.cancel_min_hours,
    payments_enabled: Boolean(r.payments_enabled),
    setup_completed: Boolean(r.setup_completed),
    timezone: str(r.timezone, d.timezone),
    web_url: str(r.web_url, ''),
  };
}

/**
 * Descarga la configuración pública. Nunca falla: si el backend no responde
 * (o tarda más de `timeoutMs`), devuelve los valores por defecto.
 */
export async function fetchPublicSiteConfig(timeoutMs = 5000): Promise<SiteConfigPublic> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Sin caché del navegador: el API la sirve con max-age para la web, pero el
    // panel tiene que ver al momento lo que acaba de guardar en Ajustes.
    const res = await fetch(`${API_BASE_URL}v1/site-config/public/`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return normalizeSiteConfig(await res.json());
  } catch {
    return DEFAULT_SITE_CONFIG;
  } finally {
    window.clearTimeout(timer);
  }
}
