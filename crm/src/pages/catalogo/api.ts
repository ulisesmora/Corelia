// Datos de «Clases y precios»: los mismos endpoints de siempre
// (/api/v1/class-types/, plans/, instructors/, categories/, rooms/).
import { API_BASE_URL } from '../../config';
import { authHeaders } from '../../utils/auth';
import { friendlyError } from '../../utils/errors';

export interface CategoryRow { id: number; name: string; slug: string; color: string | null; description: string | null }
export interface InstructorRow { id: number; name: string; slug: string; image: string | null; short_bio: string | null }
export interface RoomRow { id: number; name: string; title: string | null; capacity: number; location: string | null; image: string | null }
export interface ClassTypeRow {
  id: number;
  title: string;
  slug: string;
  category: { id: number; name: string } | null;
  instructor: { id: number; name: string } | null;
  duration_minutes: number;
  default_price_credits: string;
  default_price_eur: string;
  is_active: boolean;
  image: string | null;
}
export interface PlanRow {
  id: number;
  name: string;
  type: 'pack' | 'sub';
  credits: number;
  price_eur: string;
  interval: string | null;
  interval_count: number | null;
  credits_expire_days: number | null;
  is_active: boolean;
  stripe_price_id: string | null;
  price_credit: string | null;
}

export class CatalogError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: authHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
    });
  } catch {
    throw new CatalogError('No hay conexión. Revisa internet y vuelve a intentarlo.');
  }
  if (!res.ok) throw new CatalogError(await friendlyError(res));
  return res.status === 204 ? (undefined as T) : res.json();
}

const list = async <T,>(path: string): Promise<T[]> => {
  const d = await call<T[] | { results: T[] }>(path);
  return Array.isArray(d) ? d : d.results || [];
};

export const catalogApi = {
  classTypes: () => list<ClassTypeRow>('v1/class-types/'),
  plans: () => list<PlanRow>('v1/plans/'),
  instructors: () => list<InstructorRow>('v1/instructors/'),
  categories: () => list<CategoryRow>('v1/categories/'),
  rooms: () => list<RoomRow>('v1/rooms/'),
  patch: <T,>(kind: 'class-types' | 'plans' | 'instructors' | 'categories' | 'rooms', id: number, body: Record<string, unknown>) =>
    call<T>(`v1/${kind}/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
};

/** «12.00» → 12 */
export const num = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
