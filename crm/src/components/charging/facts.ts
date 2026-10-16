import { useEffect, useState } from 'react';
import { dashRequest } from '../../pages/kit/api';
import { useSite } from '../../site/SiteProvider';
import { formatMoney } from '../../site/money';
import type { PaymentOptions } from '../setup/api';

// Datos reales del estudio para las explicaciones de «Cómo se cobra»
// (GET /api/v1/guide/charging/, api/api/views_guide.py). Mientras llegan (o
// si fallan) se usan los de la configuración pública del estudio.

export interface PlanFact {
  id: number;
  name: string;
  credits: number;
  price: string;
  expire_days: number | null;
  interval: string;
  interval_count: number;
}

export interface ChargingFacts {
  currency: string;
  drop_in_price: string;
  drop_in_from_plan: boolean;
  cancel_min_hours: number;
  waitlist: { enabled: boolean; auto_offer: boolean; claim_minutes: number };
  payments: { enabled: boolean; provider: '' | 'keys' | 'connect' };
  /** «Formas de cobro» efectivas (Ajustes → Cobros) */
  options: PaymentOptions;
  class_types: { id: number; title: string; credits: string; price: string }[];
  credits_vary: boolean;
  pack: PlanFact | null;
  subscription: PlanFact | null;
  counts: { packs: number; subscriptions: number; class_types: number };
}

let cache: ChargingFacts | null = null;
let inflight: Promise<ChargingFacts> | null = null;

function load(force = false): Promise<ChargingFacts> {
  if (!force && inflight) return inflight;
  inflight = dashRequest<ChargingFacts>('v1/guide/charging/')
    .then((f) => { cache = f; return f; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Los datos se vuelven a pedir la próxima vez (p. ej. tras cambiar precios). */
export function invalidateChargingFacts() {
  cache = null;
}

/** Datos para las explicaciones (`ready` = ya son los del API). Cambiar `version` los vuelve a pedir. */
export function useChargingFacts(active = true, version: unknown = 0): { facts: ChargingFacts; ready: boolean } {
  const { config } = useSite();
  const [facts, setFacts] = useState<ChargingFacts | null>(cache);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    load(true).then((f) => { if (alive) setFacts(f); }).catch(() => { /* se quedan los de la config pública */ });
    return () => { alive = false; };
  }, [active, version]);
  const fallback: ChargingFacts = {
    currency: config.currency || 'EUR',
    drop_in_price: String(config.drop_in_price || 12),
    drop_in_from_plan: false,
    cancel_min_hours: config.cancel_min_hours || 8,
    waitlist: { enabled: true, auto_offer: true, claim_minutes: 120 },
    payments: { enabled: Boolean(config.payments_enabled), provider: '' },
    options: defaultOptions(Boolean(config.payments_enabled)),
    class_types: [],
    credits_vary: false,
    pack: null,
    subscription: null,
    counts: { packs: 0, subscriptions: 0, class_types: 0 },
  };
  return { facts: facts || fallback, ready: Boolean(facts) };
}

/** Mientras no llegan los datos: lo de siempre (con tarjeta se vende todo online). */
export function defaultOptions(card: boolean): PaymentOptions {
  return {
    online_ready: card, card, drop_in_online: card, packs_online: card, memberships_online: card,
    guest_booking: true, pay_at_studio: { auto: true, enabled: !card, guests: !card, clients: false },
    credits: true, studio_methods: [], studio_note: '', studio_note_en: '', client_fixed_classes: false,
  };
}

const METHOD_WORDS: Record<string, string> = { cash: 'efectivo', bizum: 'Bizum', card: 'tarjeta', transfer: 'transferencia' };

/** «efectivo, Bizum o tarjeta» (o '' si no lo ha elegido). */
export function methodsText(f: ChargingFacts): string {
  const w = (f.options?.studio_methods || []).map((m) => METHOD_WORDS[m] || m);
  if (w.length <= 1) return w[0] || '';
  return `${w.slice(0, -1).join(', ')} o ${w[w.length - 1]}`;
}

// ── Formatos ─────────────────────────────────────────────────────────────

/** Importe en la moneda del estudio, sin céntimos si es entero: «12 €». */
export const price = (f: ChargingFacts, amount: string | number) => formatMoney(amount, f.currency, { decimals: 'auto' });

/** 120 → «2 horas»; 45 → «45 minutos»; 1440 → «1 día». */
export function minutesText(m: number): string {
  if (m < 60) return `${m} minutos`;
  if (m % 1440 === 0) return m === 1440 ? '1 día' : `${m / 1440} días`;
  const h = m / 60;
  const hs = Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ',');
  return h === 1 ? '1 hora' : `${hs} horas`;
}

/** 90 → «3 meses»; 30 → «1 mes»; 45 → «45 días». */
export function daysText(d: number): string {
  if (d % 30 === 0) return d === 30 ? '1 mes' : `${d / 30} meses`;
  if (d % 7 === 0) return d === 7 ? '1 semana' : `${d / 7} semanas`;
  return d === 1 ? '1 día' : `${d} días`;
}

/** «1 crédito» / «2 créditos» / «1,5 créditos». */
export function creditsText(v: string | number): string {
  const n = Number(v);
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${s} ${n === 1 ? 'crédito' : 'créditos'}`;
}

/** «cada mes», «cada 3 meses», «cada semana»… */
export function periodText(interval: string, count: number): string {
  const n = count || 1;
  const one: Record<string, string> = { month: 'mes', week: 'semana', year: 'año', day: 'día' };
  const many: Record<string, string> = { month: 'meses', week: 'semanas', year: 'años', day: 'días' };
  const unit = n === 1 ? one[interval] || 'mes' : many[interval] || 'meses';
  return n === 1 ? `cada ${unit}` : `cada ${n} ${unit}`;
}
