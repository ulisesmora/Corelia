// Reservar una sesión del horario desde cualquier sitio de la web (portada,
// horario, ficha de clase): la añade a «mis clases elegidas» (carrito) y lleva
// al checkout, que ya sabe pagar con créditos, con tarjeta o pedir que entres.
// Un solo toque en «Reservar» → confirmar en el checkout.
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
  /** Lista de espera (fase 3 del API). Si no viene, no se ofrece. */
  waitlist_enabled?: boolean;
  waitlist?: boolean | { enabled?: boolean; joined?: boolean; position?: number | null };
  waitlist_joined?: boolean;
}

/** Plazas que quedan para avisar «Quedan pocas» (en el horario y la portada). */
export const FEW_SPOTS = 3;

/** ¿La sesión admite lista de espera? Solo si el API lo dice (si no, «Completa»). */
export function waitlistEnabled(s: Pick<ScheduleSession, 'waitlist_enabled' | 'waitlist'>, site?: unknown): boolean {
  if (s.waitlist_enabled === true) return true;
  if (s.waitlist === true) return true;
  if (s.waitlist && typeof s.waitlist === 'object' && s.waitlist.enabled === true) return true;
  // Interruptor general en la config pública (si el API lo publica algún día)
  const cfg = site as { waitlist_enabled?: unknown } | undefined;
  return cfg?.waitlist_enabled === true;
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

/**
 * Apuntarse a la lista de espera de una sesión completa. El endpoint lo añade
 * la fase 3 del API: si aún no existe (404) se avisa con `false` y la web
 * ofrece escribir al estudio.
 */
export async function joinWaitlist(sessionId: string): Promise<'joined' | 'login' | 'unavailable'> {
  let token = '';
  try { token = localStorage.getItem('accessToken') || ''; } catch { /* sin almacenamiento */ }
  if (!token) return 'login';
  try {
    const res = await fetch(`${API_V1}/waitlist/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session: sessionId }),
    });
    if (res.status === 401) return 'login';
    return res.ok ? 'joined' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
