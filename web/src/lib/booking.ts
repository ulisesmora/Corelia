// Reservar una sesión del horario desde cualquier sitio de la web (portada,
// horario, ficha de clase): la añade a «mis clases elegidas» (carrito) y lleva
// al checkout, que ya sabe pagar con créditos, con tarjeta o pedir que entres.
// Un solo toque en «Reservar» → confirmar en el checkout.
//
// Lista de espera (api/api/views_calendar.py + utils/waitlist.py):
//   POST /api/v1/waitlist/            {schedule_id, start_datetime} → apuntarme
//   GET  /api/v1/waitlist/            mis entradas activas (waiting / offered)
//   POST /api/v1/waitlist/<id>/leave/ borrarme
//   POST /api/v1/waitlist/claim/      {token} → aceptar la plaza ofrecida
import { useCartStore, type CartItem } from '../components/stores/car.store';
import { API_V1 } from '../config';

/** Sesión tal como la devuelve GET /api/v1/schedule/schedule/. */
export interface ScheduleSession {
  id: string;
  type?: string;
  title: string;
  title_en?: string;
  start_datetime: string;
  end_datetime: string;
  room?: string;
  room_en?: string;
  instructor?: string;
  capacity_max?: number;
  class_type_id?: number;
  class_type_slug?: string;
  source_id: number;
  image?: string | null;
  price_eur?: number | string | null;
  price_eur_overwrite?: number | string | null;
  price_credit?: number | string | null;
  price_credit_overwrite?: number | string | null;
  occupied_seats?: number;
  available_seats: number;
  /** El API lo pone a true en las sesiones con lista de espera (si el estudio la tiene activada). */
  waitlist_enabled?: boolean;
}

/** Plazas que quedan para avisar «Quedan pocas» (en el horario y la portada). */
export const FEW_SPOTS = 3;

/** ¿La sesión admite lista de espera? Solo si el API lo dice (si no, «Completa»). */
export function waitlistEnabled(s: Pick<ScheduleSession, 'waitlist_enabled' | 'type'>): boolean {
  return s.waitlist_enabled === true && s.type !== 'EVENT';
}

export function cartItemFromSession(s: ScheduleSession, start: Date, end: Date): CartItem {
  return {
    id: s.id,
    title: s.title,
    title_en: s.title_en || undefined,
    credits: Number(s.price_credit_overwrite ?? s.price_credit) || 0,
    image: s.image || null,
    sessionDate: start,
    sessionDateEnd: end,
    id_session: Number(s.class_type_id) || 0,
    id_source: Number(s.source_id),
    price: Number(s.price_eur_overwrite ?? s.price_eur) || 0,
  };
}

/** Añade la sesión (si no estaba) y va al checkout. */
export function bookNow(item: CartItem): void {
  const store = useCartStore.getState();
  if (!store.items.some((i) => i.id === item.id)) store.addItem(item);
  window.location.assign('/checkout');
}

// ── Lista de espera ───────────────────────────────────────────────────────

function accessToken(): string {
  try { return localStorage.getItem('accessToken') || ''; } catch { return ''; }
}

/** Página de entrar que vuelve aquí después (AuthPage lee ?next=). */
export function loginUrl(next = `${window.location.pathname}${window.location.search}`): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Clave de una sesión: regla + inicio en hora del estudio («AAAA-MM-DDTHH:MM»). */
export const sessionKey = (scheduleId: number | string, start: string) => `${scheduleId}|${String(start).slice(0, 16)}`;

export interface WaitlistEntry {
  id: number;
  status: 'waiting' | 'offered';
  /** Puesto en la lista (1 = la primera). */
  position: number | null;
  schedule_id: number;
  class_title: string;
  start_datetime: string;
  offer_expires_at: string | null;
  /** Solo con plaza ofrecida: para /lista-espera?token=… */
  claim_token: string | null;
}

export type JoinResult =
  | { kind: 'joined'; entry: WaitlistEntry }
  | { kind: 'login' }
  /** Quedan plazas: mejor reservarla directamente. */
  | { kind: 'has_space' }
  | { kind: 'already_waiting' }
  | { kind: 'already_booked' }
  | { kind: 'error'; message: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return {}; }
}

/** Apuntarse a la lista de espera de una sesión completa. */
export async function joinWaitlist(scheduleId: number, startDatetime: string): Promise<JoinResult> {
  const token = accessToken();
  if (!token) return { kind: 'login' };
  try {
    const res = await fetch(`${API_V1}/waitlist/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schedule_id: scheduleId, start_datetime: startDatetime }),
    });
    if (res.status === 401) return { kind: 'login' };
    const data = await readJson(res);
    if (res.ok) return { kind: 'joined', entry: data as unknown as WaitlistEntry };
    const code = String(data.code || '');
    if (code === 'has_space' || res.status === 409) return { kind: 'has_space' };
    if (code === 'already_waiting') return { kind: 'already_waiting' };
    if (code === 'already_booked') return { kind: 'already_booked' };
    return { kind: 'error', message: String(data.error || '') };
  } catch {
    return { kind: 'error', message: '' };
  }
}

/** Mis listas de espera activas ([] sin sesión, null si falla). */
export async function myWaitlist(): Promise<WaitlistEntry[] | null> {
  const token = accessToken();
  if (!token) return [];
  try {
    const res = await fetch(`${API_V1}/waitlist/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return res.status === 401 ? [] : null;
    const data = await res.json();
    return Array.isArray(data) ? (data as WaitlistEntry[]) : [];
  } catch {
    return null;
  }
}

/** Borrarme de una lista de espera. */
export async function leaveWaitlist(id: number): Promise<boolean> {
  const token = accessToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_V1}/waitlist/${id}/leave/`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ClaimResult =
  | { kind: 'booked' }
  /** Ya la había aceptado (vuelve a abrir el enlace del email) */
  | { kind: 'already' }
  | { kind: 'login' }
  | { kind: 'error'; code: string; message: string };

/** Aceptar la plaza ofrecida (enlace del email: /lista-espera?token=…). */
export async function claimWaitlist(claimToken: string): Promise<ClaimResult> {
  const token = accessToken();
  if (!token) return { kind: 'login' };
  try {
    const res = await fetch(`${API_V1}/waitlist/claim/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: claimToken }),
    });
    if (res.status === 401) return { kind: 'login' };
    const data = await readJson(res);
    if (res.ok) return data.code === 'already_claimed' ? { kind: 'already' } : { kind: 'booked' };
    return { kind: 'error', code: String(data.code || (res.status >= 500 ? 'server' : 'unknown')), message: String(data.error || '') };
  } catch {
    return { kind: 'error', code: 'network', message: '' };
  }
}
