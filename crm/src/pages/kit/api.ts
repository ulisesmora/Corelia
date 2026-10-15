// Llamadas de las pantallas de resumen (Hoy, Ventas, Mi web, Ajustes) al API:
// api/api/views_dashboard.py.
import { API_BASE_URL } from '../../config';
import { authHeaders } from '../../utils/auth';

export class DashError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function dashRequest<T>(path: string, init: RequestInit & { keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: authHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
    });
  } catch {
    throw new DashError('No hay conexión. Revisa internet y vuelve a intentarlo.', 'network', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.error || data.detail))
      || (res.status === 401 || res.status === 403 ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No se ha podido hacer. Inténtalo otra vez.');
    throw new DashError(String(msg), String(data?.code || res.status), res.status);
  }
  return data as T;
}

export const dashPost = <T,>(path: string, body: unknown, keepalive = false) =>
  dashRequest<T>(path, { method: 'POST', body: JSON.stringify(body), keepalive });

/** Descarga un archivo del API con la sesión del panel (CSV de la gestoría…). */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new DashError('No se ha podido descargar. Inténtalo otra vez.', String(res.status), res.status);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

// ── Tipos ────────────────────────────────────────────────────────────────

export type Tint = 'reformer' | 'mat' | 'barre' | 'yoga' | 'privada';

export interface Kpi {
  key: string;
  label: string;
  icon: string;
  tint: Tint;
  value: number | null;
  format: 'count' | 'money' | 'pct';
  spark: number[] | null;
  delta: { value: number; kind: 'pct' | 'abs' | 'pts'; label: string; trend: 'up' | 'down' | 'flat' } | null;
  hint: string;
  to: string;
}

export type AttentionAction =
  | { type: 'api'; label: string; done: string; payload: Record<string, unknown> }
  | { type: 'navigate'; label: string; to: string }
  | { type: 'copy'; label: string; done: string; value: string };

export interface AttentionItem {
  id: string;
  kind: string;
  tone: 'info' | 'bad' | 'warn' | 'p';
  icon: string;
  title: string;
  subtitle: string;
  action: AttentionAction;
}

export interface TimelineSession {
  id: string;
  kind: 'class' | 'event';
  schedule_id: number | null;
  event_id: number | null;
  date: string;
  title: string;
  class_type_id: number;
  start: string;
  end: string;
  duration: number;
  room: string;
  instructor: string;
  capacity: number;
  booked: number;
  waitlist: number;
  canceled: boolean;
  blackout: string | null;
  past: boolean;
  started: boolean;
  next: boolean;
  people: { name: string; initials: string }[];
  people_total: number;
}

export interface DayTimeline {
  date: string;
  is_today: boolean;
  closed: { kind: string; reason: string } | null;
  sessions: TimelineSession[];
}

export interface Extra { key: string; label: string; done: boolean; to: string }

export interface TodayData {
  today: string;
  now: string;
  currency: string;
  summary: { classes: number; bookings: number; closed: DayTimeline['closed'] };
  has_bookings: boolean;
  kpis: Kpi[];
  attention: AttentionItem[];
  timeline: DayTimeline;
  chart: { date: string; count: number; closed: string | null }[];
  feed: { id: string; name: string; initials: string; text: string; at: string }[];
  extras: Extra[];
  web_url: string;
  published: boolean;
}

export interface OwedRow {
  id: string;
  kind: 'payment' | 'subscription';
  payment_id: number | null;
  subscription_id: number | null;
  name: string;
  email: string;
  concept: string;
  amount: number;
  status: string;
  status_label: string;
  date: string;
}

export interface CollectedRow {
  id: string;
  payment_id: number | null;
  date: string;
  time: string;
  name: string;
  email: string;
  concept: string;
  kind: 'classes' | 'packs' | 'memberships' | 'other';
  kind_label: string;
  method: string;
  amount: number;
  status: 'succeeded' | 'refunded';
  receipt_no: string;
  receipt_url: string;
}

export type Period = 'week' | 'month' | 'quarter' | 'year';

export interface SalesData {
  period: Period;
  currency: string;
  label: string;
  start: string;
  end: string;
  compare_label: string;
  kpis: {
    revenue: number; revenue_prev: number; revenue_change_pct: number | null; count: number;
    pending: number; pending_count: number; pending_failed: number;
    packs_sold: number; packs_sold_prev: number;
    subscriptions_active: number; monthly_recurring: number; refunded: number;
  };
  chart: { label: string; start: string; value: number | null; prev: number }[];
  owed: OwedRow[];
  collected: CollectedRow[];
  collected_total: number;
  plans: { id: number; name: string; type: string; credits: number; price: number; active: boolean; sold: number; revenue: number; subscribers: number }[];
  studio: { name: string; legal_name: string; tax_id: string; address: string; email: string };
}

export interface WebSection {
  key: string;
  label: string;
  hint: string;
  icon: string;
  edit: string;
  visible: boolean;
  count: number | null;
  toggle: boolean;
  total: number | null;
  empty: string;
}

export interface WebData {
  web_url: string;
  default_url: string;
  domain: string;
  published: boolean;
  sections: WebSection[];
  app: { devices: number; clients: number };
  month: { label: string; bookings: number; signups: number };
}

export interface Checklist {
  extras: Extra[];
  review: { key: string; title: string; action: string; to: string; tone: 'warn' | 'info' }[];
  booking_cancel_min_hours: number;
  currency: string;
  country: string;
}

export const dashApi = {
  today: () => dashRequest<TodayData>('v1/dashboard/today/'),
  day: (date: string) => dashRequest<DayTimeline>(`v1/dashboard/day/?date=${date}`),
  action: (payload: Record<string, unknown>, keepalive = false) =>
    dashPost<{ done: string; undo?: Record<string, unknown> }>('v1/dashboard/actions/', payload, keepalive),
  sales: (period: Period) => dashRequest<SalesData>(`v1/dashboard/sales/?period=${period}`),
  exportSales: (period: Period) => downloadFile(`v1/dashboard/sales/export/?period=${period}`, `cierre-${period}.csv`),
  web: () => dashRequest<WebData>('v1/dashboard/web/'),
  setSection: (section: string, visible: boolean, ids?: number[]) =>
    dashPost<{ ids: number[]; active: number; total: number }>('v1/dashboard/web/sections/', { section, visible, ids }),
  checklist: () => dashRequest<Checklist>('v1/dashboard/checklist/'),
};
