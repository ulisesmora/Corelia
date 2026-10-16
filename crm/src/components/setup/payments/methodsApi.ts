// «Formas de pago en tu web» (api/api/views_payments.py → PaymentMethods*View).
import { API_BASE_URL } from '../../../config';
import { authHeaders } from '../../../utils/auth';
import { friendlyError } from '../../../utils/errors';

/** Ancla de la tarjeta (Ajustes → Cobros) y ruta para enlazarla desde otras pantallas */
export const METHODS_ANCHOR = 'formas-de-pago';
export const METHODS_PATH = `/ajustes?tab=pagos#${METHODS_ANCHOR}`;

export type MethodStatus = 'on' | 'off' | 'pending' | 'unavailable';
/** api: se cambia desde aquí · dashboard: solo en el panel de Stripe · locked: siempre activa · none: nada que hacer */
export type MethodToggle = 'api' | 'dashboard' | 'locked' | 'none';

export interface PayMethod {
  key: string;
  name: string;
  icon: string;
  group: 'instant' | 'delayed';
  status: MethodStatus;
  toggle: MethodToggle;
  works: { drop_in: boolean; packs: boolean; subs: boolean };
  why: string;
  limits: string;
  needs_domain: boolean;
  recommended: boolean;
  note: string;
  warning?: string;
}

export interface DomainRow {
  domain: string;
  enabled: boolean;
  /** active · inactive · missing (sin registrar) · error */
  apple_pay: string;
  google_pay: string;
  link: string;
  error: string;
}

export interface MethodsOverview {
  ready: boolean;
  provider: '' | 'keys' | 'connect';
  country: string;
  country_name: string;
  live: boolean;
  config_id: string;
  dashboard_url: string;
  /** pmc: configuración «Reservas» de la plataforma · excluded: se quitan al crear el pago */
  booking_protection: 'pmc' | 'excluded';
  recommended: { label: string; keys: string[] };
  domains: DomainRow[];
  apple_pay_ready: boolean;
  error: string;
  methods: PayMethod[];
}

export interface ChangeResult {
  changed: string[];
  skipped: { key: string; reason: string; dashboard?: boolean }[];
  booking_synced: boolean | null;
  overview: MethodsOverview;
}

/** Error del API con su código y, si aplica, el enlace al panel de Stripe. */
export class MethodsApiError extends Error {
  code: string;
  dashboardUrl: string;
  constructor(message: string, code = '', dashboardUrl = '') {
    super(message);
    this.code = code;
    this.dashboardUrl = dashboardUrl;
  }
}

const BASE = 'v1/site-config/stripe/payment-methods/';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: authHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let data: { error?: string; code?: string; dashboard_url?: string } = {};
    try { data = await res.clone().json(); } catch { /* sin JSON */ }
    throw new MethodsApiError(data.error || (await friendlyError(res)), data.code || '', data.dashboard_url || '');
  }
  return res.json();
}

export const loadMethods = () => call<MethodsOverview>('');
export const toggleMethod = (method: string, enabled: boolean) => call<ChangeResult>('toggle/', { method, enabled });
export const applyRecommended = () => call<ChangeResult>('recommended/', {});
export const verifyDomains = () => call<{ domains: DomainRow[]; apple_pay_ready: boolean }>('verify-domains/', {});
