import { API_BASE_URL } from '../../config';
import { authHeaders } from '../../utils/auth';
import { friendlyError } from '../../utils/errors';

/** Moneda que admite el estudio (lista cerrada del API: api/utils/locale.py). */
export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

/** País con la moneda y la zona horaria que se proponen al elegirlo. */
export interface CountryOption {
  code: string;
  name: string;
  /** '' = su moneda no está entre las admitidas */
  currency: string;
  timezone: string;
}

export type StudioPayMethod = 'cash' | 'bizum' | 'card' | 'transfer';

/** «Formas de cobro» efectivas (GET /api/v1/site-config/ → payment_options). */
export interface PaymentOptions {
  online_ready: boolean;
  card: boolean;
  drop_in_online: boolean;
  packs_online: boolean;
  memberships_online: boolean;
  guest_booking: boolean;
  pay_at_studio: { auto: boolean; enabled: boolean; guests: boolean; clients: boolean };
  credits: boolean;
  studio_methods: StudioPayMethod[];
  studio_note: string;
  studio_note_en: string;
  client_fixed_classes: boolean;
}

/** Campos de «Formas de cobro» que se guardan desde el panel. */
export const PAYMENT_OPTION_FIELDS = [
  'online_card_enabled', 'pay_at_studio_enabled', 'pay_at_studio_guests', 'pay_at_studio_clients',
  'guest_booking_enabled', 'sell_drop_in_online', 'sell_packs_online', 'sell_memberships_online',
  'studio_payment_methods', 'studio_payment_note', 'studio_payment_note_en', 'client_fixed_classes',
] as const;

/** Ajustes completos del estudio tal y como los devuelve GET /api/v1/site-config/ (admin). */
export interface StudioSettings {
  studio_name: string;
  tagline: string;
  description: string;
  logo_url: string;
  logo_light_url: string;
  favicon_url: string;
  icon_url: string;
  og_image_url: string;
  contact_email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: string;
  city: string;
  postal_code: string;
  /** País (ISO-2): formato de los importes y moneda que se propone */
  country: string;
  maps_url: string;
  latitude: string | null;
  longitude: string | null;
  area_served: string;
  tagline_en: string;
  description_en: string;
  hero_title: string;
  hero_title_en: string;
  hero_subtitle: string;
  hero_subtitle_en: string;
  about_title: string;
  about_title_en: string;
  about_text: string;
  about_text_en: string;
  about_image_url: string;
  // Portada (Ajustes → Portada)
  hero_mode: 'image' | 'video' | 'illustration';
  hero_image_url: string;
  /** Se guarda normalizado: https://www.youtube.com/watch?v=ID */
  hero_video_url: string;
  hero_illustration: string;
  /** Solo lectura: miniatura del vídeo copiada en el servidor ('' si no se pudo). */
  hero_video_poster_url: string;
  /** Solo lectura: ID del vídeo de YouTube. */
  hero_video_id: string;
  google_client_id: string;
  // Google y anuncios
  google_business_url: string;
  google_review_url: string;
  facebook_url: string;
  tiktok_url: string;
  youtube_url: string;
  google_site_verification: string;
  bing_site_verification: string;
  ga4_measurement_id: string;
  google_ads_id: string;
  google_ads_purchase_label: string;
  google_ads_signup_label: string;
  meta_pixel_id: string;
  web_domain: string;
  panel_domain: string;
  legal_name: string;
  tax_id: string;
  color_primary: string;
  color_secondary: string;
  color_dark: string;
  color_background: string;
  font_heading: string;
  font_body: string;
  style_preset: string;
  /** Paleta del estilo ('' = colores propios). Al elegirla, el API escribe sus colores en color_* */
  palette: string;
  /** Pareja de letra del estilo ('' = letra propia) */
  font_pair: string;
  icon_style: string;
  /** El panel usa también el estilo de la web (si no, su aspecto clásico) */
  panel_follows_style: boolean;
  /** Moneda (ISO 4217). Cambiarla NO convierte los precios ya puestos. */
  currency: string;
  drop_in_price: string;
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_use_tls: boolean;
  smtp_use_ssl: boolean;
  email_from_address: string;
  email_from_name: string;
  payments_enabled: boolean;
  stripe_publishable_key: string;
  // «Formas de cobro» (Ajustes → Cobros; api/utils/payment_options.py)
  online_card_enabled: boolean;
  /** null = automático: solo cuando la web no cobra con tarjeta */
  pay_at_studio_enabled: boolean | null;
  pay_at_studio_guests: boolean;
  pay_at_studio_clients: boolean;
  guest_booking_enabled: boolean;
  sell_drop_in_online: boolean;
  sell_packs_online: boolean;
  sell_memberships_online: boolean;
  studio_payment_methods: StudioPayMethod[];
  studio_payment_note: string;
  studio_payment_note_en: string;
  /** Las clientas eligen sus clases fijas en la web (si no, solo el estudio) */
  client_fixed_classes: boolean;
  /** Solo lectura: lo que la web ofrece de verdad con estos ajustes */
  payment_options: PaymentOptions;
  setup_completed: boolean;
  /** Solo lectura («Conectar pagos»): '' | 'keys' | 'connect' */
  payments_provider: '' | 'keys' | 'connect';
  stripe_account_id: string;
  // Solo lectura
  has_smtp_password: boolean;
  has_stripe: boolean;
  stripe_mode: 'live' | 'test' | null;
  webhook_url: string;
  api_url: string;
  web_url: string;
  default_web_url: string;
  default_api_url: string;
  email_ready: boolean;
  push_devices: number;
  push_clients: number;
  /** Solo lectura: listas para los selectores de país y moneda */
  locale_options: { currencies: CurrencyOption[]; countries: CountryOption[] };
  /** Solo lectura: pagos cobrados por moneda (los antiguos guardan la suya) */
  payment_currencies: { currency: string; count: number }[];
}

/** Lo que se guarda en el paso «Tu estilo» (asistente, guía y Ajustes → Aspecto). */
export const STYLE_FIELDS = [
  'style_preset', 'palette', 'font_pair', 'icon_style', 'color_primary', 'color_secondary', 'color_dark',
  'color_background', 'font_heading', 'font_body',
] as const;

/** Campos que se pueden escribir (más la contraseña SMTP, que nunca se lee). */
export type StudioSettingsPatch = Partial<Omit<StudioSettings,
  'has_smtp_password' | 'has_stripe' | 'stripe_mode' | 'webhook_url' | 'api_url' | 'web_url' | 'email_ready'
  | 'default_web_url' | 'default_api_url' | 'push_devices' | 'push_clients'
  | 'payments_enabled' | 'stripe_publishable_key' | 'hero_video_poster_url' | 'hero_video_id'
  | 'payments_provider' | 'stripe_account_id'
  | 'locale_options' | 'payment_currencies' | 'payment_options'>> & { smtp_password?: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: authHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
  });
  if (!res.ok) {
    // Los endpoints de ajustes devuelven {error: "frase clara"}
    let message = '';
    try {
      const data = await res.clone().json();
      message = data?.error || '';
    } catch { /* sin cuerpo JSON */ }
    throw new Error(message || (await friendlyError(res)));
  }
  return res.json();
}

export const loadSettings = () => call<StudioSettings>('v1/site-config/');

export const saveSettings = (patch: StudioSettingsPatch) =>
  call<StudioSettings>('v1/site-config/', { method: 'PATCH', body: JSON.stringify(patch) });

/** Envía un email de prueba. Si se pasan datos SMTP se prueban SIN guardarlos. */
export const sendTestEmail = (body: Record<string, unknown>) =>
  call<{ ok: boolean; to: string }>('v1/site-config/test-email/', { method: 'POST', body: JSON.stringify(body) });

export const connectStripe = (secret_key: string, publishable_key: string) =>
  call<{
    ok: boolean; account_name: string; live_mode: boolean;
    /** Moneda en la que Stripe paga al estudio ('' si no se sabe) */
    stripe_currency?: string;
    studio_currency?: string;
  }>('v1/site-config/stripe/', {
    method: 'POST', body: JSON.stringify({ secret_key, publishable_key }),
  });

export const disconnectStripe = () => call<{ ok: boolean }>('v1/site-config/stripe/', { method: 'DELETE' });

// ─── «Conectar pagos» (Stripe Connect; api/api/views_payments.py) ───────────

/** Estado de la cuenta conectada (api/utils/payments.py → connect_state). */
export type ConnectState = 'none' | 'onboarding' | 'pending' | 'restricted' | 'active' | 'mismatch';

/** GET /api/v1/site-config/stripe/connect/status/ */
export interface PaymentsStatus {
  /** Con qué se cobra ahora: claves, cuenta conectada o nada */
  provider: '' | 'keys' | 'connect';
  /** Se puede cobrar online ahora mismo */
  ready: boolean;
  state: ConnectState;
  /** La instalación ofrece «Conectar pagos» (si no, solo claves, como siempre) */
  connect_available: boolean;
  live: boolean;
  requirements_due: string[];
  account_id: string;
  countries: { code: string; name: string }[];
  default_country: string;
  account_country: string;
  display_name: string;
  /** Moneda en la que Stripe paga a la cuenta conectada (ISO, '' si no se sabe) */
  default_currency: string;
  dashboard_url: string;
  /** Hay claves pegadas en el panel (Avanzado) */
  has_keys: boolean;
  /** Las claves se eligieron como forma de cobro */
  keys_provider: boolean;
  /** Se ofrece pegar claves propias (plan B sin Connect; STRIPE_KEYS_FALLBACK_ENABLED) */
  keys_fallback: boolean;
}

/** A qué pantalla del panel se vuelve desde Stripe (lista cerrada en el API) */
export type ConnectReturnTo = 'settings' | 'welcome';

export const loadPaymentsStatus = () => call<PaymentsStatus>('v1/site-config/stripe/connect/status/');

/** Crea la cuenta (una vez) y devuelve el enlace al alta en Stripe (null si ya está activa). */
export const startConnect = (body: { country?: string; return_to: ConnectReturnTo }) =>
  call<{ url: string | null; created?: boolean; status: PaymentsStatus }>('v1/site-config/stripe/connect/start/', {
    method: 'POST', body: JSON.stringify({ ...body, origin: window.location.origin }),
  });

export const syncConnect = () =>
  call<PaymentsStatus>('v1/site-config/stripe/connect/sync/', { method: 'POST' });

export const disconnectConnect = () =>
  call<PaymentsStatus>('v1/site-config/stripe/connect/disconnect/', { method: 'POST' });

// ─── Preguntas frecuentes y opiniones ─────────────────────────────────────────

export interface FAQItem {
  id?: number;
  question: string;
  answer: string;
  question_en: string;
  answer_en: string;
  page: 'home' | 'prices' | 'both';
  order: number;
  is_active: boolean;
  /** Pregunta de ejemplo sin editar: no se publica como datos para Google. */
  is_sample?: boolean;
}

export interface Testimonial {
  id?: number;
  author: string;
  text: string;
  text_en: string;
  rating: number;
  source: string;
  photo_url: string;
  order: number;
  is_active: boolean;
}

export const listFaqs = () => call<FAQItem[]>('v1/faqs/');
export const saveFaq = (f: FAQItem) => f.id
  ? call<FAQItem>(`v1/faqs/${f.id}/`, { method: 'PATCH', body: JSON.stringify(f) })
  : call<FAQItem>('v1/faqs/', { method: 'POST', body: JSON.stringify(f) });
export const deleteFaq = (id: number) =>
  fetch(`${API_BASE_URL}v1/faqs/${id}/`, { method: 'DELETE', headers: authHeaders() });

export const listTestimonials = () => call<Testimonial[]>('v1/testimonials/');
export const saveTestimonial = (t: Testimonial) => t.id
  ? call<Testimonial>(`v1/testimonials/${t.id}/`, { method: 'PATCH', body: JSON.stringify(t) })
  : call<Testimonial>('v1/testimonials/', { method: 'POST', body: JSON.stringify(t) });
export const deleteTestimonial = (id: number) =>
  fetch(`${API_BASE_URL}v1/testimonials/${id}/`, { method: 'DELETE', headers: authHeaders() });

export const checkDomain = (domain: string, kind: 'web' | 'panel') =>
  call<{ ok: boolean; domain?: string; error?: string }>('v1/site-config/check-domain/', {
    method: 'POST', body: JSON.stringify({ domain, kind }),
  });
