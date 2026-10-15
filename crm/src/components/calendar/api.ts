// Llamadas del calendario al API (con la sesión del panel).
import { API_BASE_URL } from '../../config';
import { authHeaders } from '../../utils/auth';
import type { CalendarData, MoveResult, MoveUndo, OccurrenceDetail } from './types';

/** Error del API con su código estable (p. ej. 'room_busy', 'insufficient_credits'). */
export class ApiError extends Error {
  code: string;
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, code: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: authHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
    });
  } catch {
    throw new ApiError('No hay conexión. Revisa internet y vuelve a intentarlo.', 'network', 0, {});
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data && (data.error || data.detail)) ||
      (res.status === 401 || res.status === 403
        ? 'Tu sesión ha caducado. Vuelve a entrar.'
        : 'No se ha podido guardar. Inténtalo otra vez.');
    throw new ApiError(String(msg), String(data?.code || res.status), res.status, data || {});
  }
  return data as T;
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export interface SessionRef { schedule: number; date: string }

export const calendarApi = {
  range: (start: string, end: string, catalog = false) =>
    request<CalendarData>(`v1/calendar/?start=${start}&end=${end}${catalog ? '&catalog=1' : ''}`),
  detail: (s: SessionRef) => request<OccurrenceDetail>(`v1/calendar/occurrence/?schedule=${s.schedule}&date=${s.date}`),
  move: (s: SessionRef, body: { new_date?: string; new_start: string; new_end?: string; new_room?: number; notify: boolean; force?: boolean }) =>
    post<MoveResult>('v1/calendar/occurrence/move/', { ...s, ...body }),
  undoMove: (undo: MoveUndo) => post<{ moved: number }>('v1/calendar/occurrence/undo-move/', { undo }),
  edit: (s: SessionRef, body: { scope: 'this' | 'following'; changes: Record<string, unknown>; notify: boolean; existing_bookings?: string; force?: boolean }) =>
    post<{ scope: string; occurrence_id: string; schedule_id: number }>('v1/calendar/occurrence/edit/', { ...s, ...body }),
  cancel: (s: SessionRef, body: { scope: 'this' | 'following'; refund: 'credits' | 'money' | 'none'; notify: boolean; message?: string }) =>
    post<{ cancelled: number; refunded_credits: number; refunded_card: number; notified: number }>('v1/calendar/occurrence/cancel/', { ...s, ...body }),
  reactivate: (s: SessionRef, restoreBookings = false) =>
    post<{ reactivated: boolean; restored: number; not_restored: number }>('v1/calendar/occurrence/reactivate/', { ...s, restore_bookings: restoreBookings }),
  addClient: (s: SessionRef, body: { user: number; charge: 'credits' | 'free'; force?: boolean; notify?: boolean }) =>
    post<{ booking_id: number }>('v1/calendar/occurrence/add-client/', { ...s, ...body }),
  notify: (s: SessionRef, body: { message: string; subject?: string }) =>
    post<{ people: number; emails: number; pushes: number }>('v1/calendar/occurrence/notify/', { ...s, ...body }),
  checkIn: (bookingId: number, attended: boolean) =>
    post<{ status: string }>(`v1/calendar/bookings/${bookingId}/check-in/`, { attended }),
  removeBooking: (bookingId: number, refund: 'credits' | 'none', notify = false) =>
    post<{ removed: number }>(`v1/calendar/bookings/${bookingId}/remove/`, { refund, notify }),
  promote: (entryId: number, charge: 'credits' | 'free', force = false) =>
    post<{ booking_id: number }>(`v1/waitlist/${entryId}/promote/`, { charge, force }),
  removeWaitlist: (entryId: number) => post<{ status: string }>(`v1/waitlist/${entryId}/remove/`, {}),
  waitlistSettings: () => request<{ enabled: boolean; auto_offer?: boolean; claim_minutes?: number }>('v1/waitlist/settings/'),
  saveWaitlistSettings: (body: { enabled?: boolean; claim_minutes?: number }) =>
    request<{ enabled: boolean; claim_minutes: number }>('v1/waitlist/settings/', { method: 'PATCH', body: JSON.stringify(body) }),
  createSchedule: (body: Record<string, unknown>) => post<{ id: number }>('v1/recurrences/', body),
  searchUsers: async (q: string) => {
    const data = await request<unknown>(`v1/users/?search=${encodeURIComponent(q)}&ordering=first_name`);
    const list = (Array.isArray(data) ? data : (data as { results?: unknown[] }).results || []) as {
      id: number; email: string; first_name?: string; last_name?: string; phone?: string; is_staff?: boolean;
    }[];
    return list.filter((u) => !u.is_staff);
  },
};

/** Mensaje legible de cualquier error. */
export const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Algo ha fallado. Inténtalo otra vez.';
