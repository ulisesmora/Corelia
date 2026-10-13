"use client";

import { useEffect, useState } from 'react';
import { useLangStore } from './stores/lang.store';
import { planDisplayName } from '../utils/planUtils';
import { API_ROOT } from '../config';
import { formatPrice } from '../i18n';

const API = `${API_ROOT}/`;

export interface MembershipSuggestion {
  eligible: boolean;
  show: boolean;
  weeks_active: number;
  window_weeks: number;
  classes_per_month: number;
  segment: 'fixed' | 'flexible' | 'intense';
  fixed_slots: { schedule_id: number; title: string; title_en?: string; label: string; weeks: number }[];
  plan: {
    id: number; name: string; name_en?: string | null; price: number; months: number;
    monthly_price: number; credits: number; price_per_class: number;
  } | null;
  current_price_per_class?: number;
  saving_per_month?: number;
}

const C = {
  brand: 'var(--brand-primary)',
  brandDark: 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))',
  brown: 'var(--brand-dark)',
  muted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))',
  olive: '#536030',
};

function authToken(): string | null {
  try { return localStorage.getItem('accessToken'); } catch { return null; }
}

// Una sola petición por carga de página aunque haya varias tarjetas
let pending: Promise<MembershipSuggestion | null> | null = null;

export function fetchMembershipSuggestion(): Promise<MembershipSuggestion | null> {
  const t = authToken();
  if (!t) return Promise.resolve(null);
  if (!pending) {
    pending = fetch(`${API}v1/me/membership-suggestion/`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MembershipSuggestion | null) => {
        // Lo aprovecha el aviso de instalar la app ("tu clase de los martes")
        try {
          if (d?.eligible) {
            localStorage.setItem('domIsRegular', '1');
            if (d.fixed_slots?.[0]) localStorage.setItem('domFixedSlot', d.fixed_slots[0].label);
          } else {
            localStorage.removeItem('domIsRegular');
            localStorage.removeItem('domFixedSlot');
          }
        } catch {}
        return d;
      })
      .catch(() => null);
  }
  return pending;
}

export function membershipLink(s: MembershipSuggestion): string {
  const prefer = s.fixed_slots.map((f) => f.schedule_id).join(',');
  return `/checkout?tab=subscription&plan_id=${s.plan!.id}${prefer ? `&prefer=${prefer}` : ''}`;
}

function logEvent(action: 'shown' | 'clicked' | 'dismissed', channel: 'app' | 'checkout', s: MembershipSuggestion) {
  const t = authToken();
  if (!t) return;
  if (action === 'shown') {
    const key = `domNudgeShown_${channel}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch {}
  }
  fetch(`${API}v1/me/membership-suggestion/event/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, channel, plan_id: s.plan?.id, segment: s.segment }),
  }).catch(() => {});
}

const fmt = (n: number, es: boolean) =>
  (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', es ? ',' : '.');

/** Precio en la moneda del estudio: "12,50 €" (es) · "€12.50" (en) con EUR. */
const money = (n: number, es: boolean) => formatPrice(n, es ? 'es' : 'en', 'auto');

const WEEKDAYS_EN: Record<string, string> = {
  lunes: 'Mondays', martes: 'Tuesdays', 'miércoles': 'Wednesdays', miercoles: 'Wednesdays',
  jueves: 'Thursdays', viernes: 'Fridays', 'sábados': 'Saturdays', sabados: 'Saturdays',
  domingos: 'Sundays', 'sábado': 'Saturdays', domingo: 'Sundays',
};

/**
 * La API manda la franja fija ya redactada en español ("los martes a las 9:30").
 * En inglés la reconstruimos ("on Tuesdays at 9:30"); si el formato no encaja,
 * se deja tal cual.
 */
export function slotLabel(label: string, lang: string): string {
  if (lang !== 'en' || !label) return label;
  const m = label.trim().match(/^l[oa]s\s+(\S+)\s+a\s+las\s+(\d{1,2}[:.]\d{2})$/i);
  if (!m) return label;
  const day = WEEKDAYS_EN[m[1].toLowerCase()];
  return day ? `on ${day} at ${m[2]}` : label;
}

/**
 * Tarjeta personal "te guardamos tu plaza": solo para clientas REGULARES sin
 * membresía. Habla de SU clase fija y solo menciona precio si de verdad le
 * sale más barato (si no, el valor es la comodidad).
 *
 * - variant="dashboard": en su panel, con "No, gracias" (descansa 21 días).
 * - variant="checkout": al comprar otro bono; `onChoose` cambia a membresía.
 * - variant="success": tras reservar su clase fija.
 */
export default function MembershipSuggestionCard({
  variant = 'dashboard', balance, onChoose,
}: {
  variant?: 'dashboard' | 'checkout' | 'success';
  balance?: number | null;
  onChoose?: (planId: number, preferIds: number[]) => void;
}) {
  const lang = useLangStore((s) => s.lang);
  const es = lang !== 'en';
  const [s, setS] = useState<MembershipSuggestion | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => { fetchMembershipSuggestion().then(setS); }, []);

  const visible = !!s && s.show && !!s.plan && !hidden;
  const channel = variant === 'checkout' ? 'checkout' : 'app';
  useEffect(() => { if (visible && s) logEvent('shown', channel, s); }, [visible]); // eslint-disable-line

  if (!visible || !s || !s.plan) return null;

  const rawSlot = s.fixed_slots[0];
  const slot = rawSlot ? { ...rawSlot, label: slotLabel(rawSlot.label, lang) } : undefined;
  const plan = s.plan;
  const cheaper = s.current_price_per_class != null && plan.price_per_class < s.current_price_per_class;
  const lowBalance = balance != null && balance <= 1;
  const planName = planDisplayName(plan, lang);
  const cycle = plan.months === 1
    ? (es ? '/mes' : '/month')
    : (es ? `cada ${plan.months} meses` : `every ${plan.months} months`);

  const go = () => {
    logEvent('clicked', channel, s);
    if (onChoose) onChoose(plan.id, s.fixed_slots.map((f) => f.schedule_id));
    else window.location.href = membershipLink(s);
  };
  const dismiss = () => { logEvent('dismissed', channel, s); setHidden(true); };

  const title = variant === 'success'
    ? (es ? '¿Te la reservamos cada semana?' : 'Shall we book it for you every week?')
    : lowBalance
      ? (es ? `Te queda ${balance} crédito` : `You have ${balance} credit left`)
      : slot
        ? (es ? `Te guardamos tu plaza de ${slot.label}` : `We'll keep your spot ${slot.label}`)
        : (es ? 'Vienes casi cada semana 💛' : 'You come almost every week 💛');

  const habit = slot
    ? (es ? `Llevas ${slot.weeks} semanas viniendo ${slot.label}.` : `You've been coming ${slot.label} for ${slot.weeks} weeks.`)
    : (es ? `Has venido ${s.weeks_active} de las últimas ${s.window_weeks} semanas.`
          : `You've come ${s.weeks_active} of the last ${s.window_weeks} weeks.`);

  const pitch = es
    ? `Con la membresía ${planName} ${slot ? 'esa plaza se reserva sola' : 'tus clases fijas se reservan solas'} cada semana${
        cheaper ? ` y cada clase te sale a ${money(plan.price_per_class, es)} (ahora ${money(s.current_price_per_class!, es)})` : ''}.`
    : `With the ${planName} membership ${slot ? 'that spot books itself' : 'your regular classes book themselves'} every week${
        cheaper ? ` and each class costs ${money(plan.price_per_class, es)} (now ${money(s.current_price_per_class!, es)})` : ''}.`;

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden', fontFamily: 'var(--font-body)',
      border: '1.5px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)', background: '#fff',
      boxShadow: '0 8px 26px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)) 14%, transparent)',
    }}>
      <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)) 100%)', color: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
          {es ? 'Para ti' : 'For you'}
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.3 }}>{title}</div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.55, marginBottom: 12 }}>
          {habit} {pitch}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <span style={{ padding: '5px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: C.brandDark, fontWeight: 800, fontSize: 13 }}>
            {planName} · {money(plan.price, es)} {cycle}
          </span>
          {plan.months > 1 && (
            <span style={{ padding: '5px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', color: C.brandDark, fontWeight: 700, fontSize: 13 }}>
              = {money(Math.round(plan.monthly_price), es)} {es ? 'al mes' : 'a month'}
            </span>
          )}
          {cheaper && (s.saving_per_month ?? 0) >= 5 && (
            <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(107,123,60,0.10)', color: C.olive, fontWeight: 800, fontSize: 13 }}>
              {es ? `≈ ${money(Math.round(s.saving_per_month!), es)} menos al mes` : `≈ ${money(Math.round(s.saving_per_month!), es)} less a month`}
            </span>
          )}
          <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(45,125,70,0.08)', color: '#2D7D46', fontWeight: 700, fontSize: 13 }}>
            {es ? 'Sin permanencia' : 'No commitment'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={go} style={{
            flex: 1, minWidth: 180, minHeight: 46, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)))', color: '#fff', fontWeight: 800, fontSize: '0.92rem',
            fontFamily: 'var(--font-body)', boxShadow: '0 5px 16px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)) 28%, transparent)',
          }}>
            {variant === 'checkout'
              ? (es ? `Cambiar a ${planName}` : `Switch to ${planName}`)
              : (es ? `Ver membresía ${planName}` : `See ${planName} membership`)}
          </button>
          {variant === 'dashboard' && (
            <button type="button" onClick={dismiss} style={{
              background: 'none', border: 'none', color: 'color-mix(in srgb, var(--brand-secondary) 95%, white)', fontWeight: 600, cursor: 'pointer',
              minHeight: 44, padding: '0 10px', fontSize: '0.85rem', fontFamily: 'var(--font-body)',
            }}>
              {es ? 'No, gracias' : 'No, thanks'}
            </button>
          )}
        </div>
        {(s.segment === 'fixed' || variant !== 'checkout') && (
          <div style={{ fontSize: '0.75rem', color: 'color-mix(in srgb, var(--brand-secondary) 72%, white)', marginTop: 10 }}>
            {es ? 'Los créditos que ya tienes se conservan.' : 'You keep the credits you already have.'}
          </div>
        )}
      </div>
    </div>
  );
}
