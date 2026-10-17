// Clientes del estudio (plan mensual que se cobra en el estudio, sin Stripe) y
// atajos de «Créditos». API: api/api/views_studio_plans.py.
import { API_BASE_URL } from '../../config';
import { authHeaders } from '../../utils/auth';
import { friendlyError } from '../../utils/errors';
import { dashPost, dashRequest } from '../kit/api';

export type PayMethod = 'cash' | 'bizum' | 'card' | 'transfer';
export type CarryOver = 'lose' | 'keep' | 'cap';

export const METHODS: { value: PayMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'card', label: 'Tarjeta / datáfono' },
  { value: 'transfer', label: 'Transferencia' },
];
export const methodLabel = (m?: string) => METHODS.find((x) => x.value === m)?.label || '';

export interface ClientLite {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
}

export interface ShortcutClient extends ClientLite {
  name: string;
  balance: number;
  last_at: string | null;
  low: boolean;
  plan: { id: number; status: string; next_due_date: string | null; overdue: boolean } | null;
}

export interface Cutoff {
  balance_before: number;
  leftover: number;
  expired: number;
  kept: number;
  added: number;
  balance_after: number;
  pool_after: number;
}

export interface StudioPlan {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  email: string;
  title: string;
  credits_per_month: number;
  price: number;
  currency: string;
  payment_method: PayMethod;
  method_label: string;
  cycle_day: number;
  carry_over: CarryOver;
  carry_over_cap: number | null;
  status: 'active' | 'paused' | 'ended';
  started_on: string | null;
  next_due_date: string | null;
  days_to_due: number | null;
  overdue: boolean;
  due_soon: boolean;
  can_renew: boolean;
  last_renewed_at: string | null;
  credits_pool: number;
  balance: number;
  remind_client: boolean;
  notes: string;
  fixed_schedules: { id: number; title: string; weekday: number; start_time: string }[];
  preview?: Cutoff;
  renewals?: Renewal[];
}

export interface Renewal {
  id: number;
  plan_id: number;
  period_start: string;
  period_end: string;
  balance_before: number;
  leftover: number;
  expired: number;
  kept: number;
  added: number;
  balance_after: number;
  amount: number;
  currency: string;
  method: string;
  method_label: string;
  paid: boolean;
  paid_at: string | null;
  payment_id: number | null;
  created_at: string;
  by: string;
}

export interface RenewalsCardData {
  items: StudioPlan[];
  this_week: number;
  overdue: number;
  unpaid: number;
}

export interface PlanInput {
  user: number;
  credits_per_month: number;
  price: number | string;
  payment_method: PayMethod;
  cycle_day: number;
  carry_over: CarryOver;
  carry_over_cap?: number | null;
  fixed_schedule_ids?: number[];
  remind_client?: boolean;
  notes?: string;
  name?: string;
  start_date?: string;
  start: 'paid' | 'later' | 'none';
  method?: PayMethod;
}

/** Sesión del calendario (GET v1/calendar/) */
export interface Session {
  id: string;
  kind: 'class' | 'event';
  schedule_id: number | null;
  date: string;
  start: string;
  end: string;
  title: string;
  room: { id: number; name: string };
  capacity: number;
  booked: number;
  canceled: boolean;
  blackout: unknown;
  past: boolean;
  started: boolean;
  price_credits: string;
}

/** Clase del horario semanal (GET v1/recurrences/) */
export interface WeeklyClass {
  id: number;
  class_type: { id: number; title: string };
  room: { id: number; name: string };
  weekday: number;
  start_time: string;
  end_time: string;
  capacity_max?: number;
  price_credits_override?: string | null;
}

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const list = <T,>(d: unknown): T[] => (Array.isArray(d) ? d : ((d as { results?: T[] })?.results || [])) as T[];

export const studioApi = {
  shortcuts: () => dashRequest<{ recent: ShortcutClient[]; low: ShortcutClient[] }>('v1/studio-plans/shortcuts/'),
  plans: (q = '') => dashRequest<StudioPlan[]>(`v1/studio-plans/${q ? `?${q}` : ''}`),
  planOf: async (userId: number) => (await dashRequest<StudioPlan[]>(`v1/studio-plans/?user=${userId}&status=open`))[0] || null,
  plan: (id: number) => dashRequest<StudioPlan>(`v1/studio-plans/${id}/`),
  create: (body: PlanInput) => dashPost<{ plan: StudioPlan; renewal: Renewal | null }>('v1/studio-plans/', body),
  update: (id: number, body: Partial<PlanInput>) =>
    dashRequest<StudioPlan>(`v1/studio-plans/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
  renew: (id: number, body: { charge: 'paid' | 'later'; method?: PayMethod; period_start?: string | null }) =>
    dashPost<{ done: string; renewal: Renewal; plan: StudioPlan }>(`v1/studio-plans/${id}/renew/`, body),
  setStatus: (id: number, what: 'pause' | 'resume' | 'end') => dashPost<StudioPlan>(`v1/studio-plans/${id}/${what}/`, {}),
  payRenewal: (id: number, method: PayMethod) =>
    dashPost<{ done: string; renewal: Renewal }>(`v1/studio-plans/renewals/${id}/pay/`, { method }),
  upcoming: () => dashRequest<RenewalsCardData>('v1/studio-plans/upcoming/'),
  creditSale: (body: { user: number; credits: number; expires_days?: number | null; expires_at?: string | null; amount?: number | string; method?: PayMethod; reason?: string }) =>
    dashPost<{ entry_id: number; payment_id: number | null; balance: number; expires_at: string | null }>('v1/studio-plans/credit-sale/', body),

  // Reutiliza las rutas de siempre
  sessions: async (start: string, end: string) =>
    (await dashRequest<{ occurrences: Session[] }>(`v1/calendar/?start=${start}&end=${end}`)).occurrences,
  addToClass: (schedule: number, date: string, user: number, charge: 'credits' | 'free') =>
    dashPost<{ booking_id: number; status: string }>('v1/calendar/occurrence/add-client/', { schedule, date, user, charge, notify: false }),
  weeklyClasses: async () => {
    const list_ = list<WeeklyClass>(await dashRequest<unknown>('v1/recurrences/?is_active=true&is_recurrent=true'));
    return list_.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  },
  fixedClasses: async (userId: number) =>
    list<{ id: number; schedule: number; schedule_title: string; weekday: number; start_time: string; room_name: string; is_active: boolean }>(
      await dashRequest<unknown>(`v1/users/${userId}/class-preferences/`)),
  addFixedClass: (userId: number, scheduleId: number) =>
    dashPost<unknown>(`v1/users/${userId}/class-preferences/`, { schedule_id: scheduleId }),
  searchClients: async (q: string) =>
    list<ClientLite>(await dashRequest<unknown>(`v1/users/?is_superuser=false&is_staff=false&search=${encodeURIComponent(q)}&ordering=email`)),
  user: (id: number) => dashRequest<ClientLite>(`v1/users/${id}/`),

  /** Alta de una ficha desde el panel (sin contraseña: no necesita cuenta en la web). */
  signup: async (body: { first_name: string; last_name?: string; phone?: string; email?: string }): Promise<ClientLite> => {
    const res = await fetch(`${API_BASE_URL}signupClient/`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = '';
      try {
        const data = await res.clone().json();
        if (data?.user_errors) msg = await friendlyError(new Response(JSON.stringify(data.user_errors), { status: 400 }));
      } catch { /* sin JSON */ }
      throw new Error(msg || (await friendlyError(res)));
    }
    const data = await res.json();
    return { id: data.user_id, email: data.email, first_name: body.first_name, last_name: body.last_name || '', phone: body.phone || null };
  },
};

export const clientName = (u: { first_name?: string; last_name?: string; email?: string; name?: string } | null) =>
  !u ? '' : (u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || (u.email || '').split('@')[0]);

export const creditsText = (n: number) => {
  const v = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
  return `${v} ${Math.abs(n) === 1 ? 'clase' : 'clases'}`;
};

/** «Le quedan 2 de 8: el mes que viene empieza con 8 / con 10» */
export function carryExample(perMonth: number, carry: CarryOver, cap?: number | null, left = 2) {
  const l = Math.min(left, perMonth);
  const kept = carry === 'keep' ? l : carry === 'cap' ? Math.min(l, cap || 0) : 0;
  return `Le quedan ${l} de ${perMonth}: el mes que viene empieza con ${perMonth + kept}.`;
}

export const carryLabel = (carry: CarryOver, cap?: number | null) =>
  carry === 'keep' ? 'Las que sobran se acumulan' : carry === 'cap' ? `Se acumulan hasta ${cap || 0}` : 'Las que sobran se pierden';
