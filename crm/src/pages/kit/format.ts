import { formatMoney } from '../../site/money';
import { STUDIO_TZ } from '../../site/timezone';

export const fmtMoney = (v: number | null | undefined, currency: string) =>
  formatMoney(v ?? 0, currency, { decimals: 'auto' });

export const fmtCount = (n: number) => new Intl.NumberFormat('es-ES').format(n);

const MINUS = '−';

/** «+12%», «−3 pts», «+5» */
export function fmtDelta(value: number, kind: 'pct' | 'abs' | 'pts') {
  const sign = value > 0 ? '+' : value < 0 ? MINUS : '±';
  const n = Math.abs(value);
  if (kind === 'pct') return `${sign}${n}%`;
  if (kind === 'pts') return `${sign}${n} pts`;
  return `${sign}${fmtCount(n)}`;
}

/** Fecha (AAAA-MM-DD) → Date a mediodía (sin sustos de zona horaria). */
export const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

export const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(iso: string, n: number) {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

const WEEKDAY = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const LONG = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const longDate = (iso: string) => cap(LONG.format(dateOf(iso)));
export const shortDate = (iso: string) => SHORT.format(dateOf(iso)).replace('.', '');

/** «Hoy, 16» · «Mañana, 17» · «Ayer, 15» · «Lunes, 19» */
export function dayLabel(iso: string, today: string) {
  const d = dateOf(iso);
  const diff = Math.round((d.getTime() - dateOf(today).getTime()) / 86400000);
  const name = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : cap(WEEKDAY.format(d));
  return `${name}, ${d.getDate()}`;
}

/** «hace 4 min», «hace 2 h», «ayer», «12 oct» */
export function ago(isoInstant: string, now = Date.now()) {
  const t = new Date(isoInstant).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'ahora mismo';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: STUDIO_TZ });
  const day = fmt.format(new Date(t));
  const yesterday = fmt.format(new Date(now - 86400000));
  if (day === yesterday) return 'ayer';
  return shortDate(day);
}

/** Hora del día del estudio para saludar. */
export function greeting() {
  const h = Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: STUDIO_TZ }).format(new Date()));
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export const plural = (n: number, one: string, many: string) => `${fmtCount(n)} ${n === 1 ? one : many}`;
