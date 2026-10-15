import { API_BASE_URL } from '../config';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';
import type { StepKey } from './copy';

export type StepStatus = 'done' | 'skipped' | 'todo' | 'blocked';

export interface StepState {
  key: StepKey;
  required: boolean;
  status: StepStatus;
  done: boolean;
  /** Pasos que hay que hacer antes (solo si status = 'blocked') */
  blocked_by: StepKey[];
  /** Cuántos hay (salas, profesores…) si aplica */
  count: number | null;
  /** «Tu estudio»: qué datos faltan (name, contact, address) */
  missing: string[];
  /** Sub-tareas (logo, emails, stripe, hero…). `state`: solo en «stripe»
   *  (active | none | onboarding | pending | restricted | mismatch). */
  items: { key: string; done: boolean; state?: string }[];
  /** Hay datos de ejemplo (p. ej. la instructora de ejemplo) */
  sample: boolean;
  can_skip: boolean;
}

/** GET /api/v1/setup/progress/ (api/api/setup_guide.py) */
export interface SetupProgress {
  /** Web publicada (SiteConfig.setup_completed): se deja indexar en Google */
  published: boolean;
  can_publish: boolean;
  welcome_done: boolean;
  total: number;
  done_count: number;
  required_total: number;
  required_done: number;
  next_step: StepKey | null;
  missing_to_publish: StepKey[];
  counts: Record<string, number>;
  steps: StepState[];
  /** Puesta en marcha obligatoria (8 pasos en orden; ver ./flow.ts) */
  flow: FlowState;
}

export type FlowKey = 'studio' | 'style' | 'rooms' | 'instructors' | 'class_types' | 'schedule' | 'plans' | 'launch';

export interface FlowState {
  steps: { key: FlowKey; done: boolean; data_done: boolean; confirmed: boolean }[];
  total: number;
  /** Número (1…8) del primer paso sin terminar; 9 = todo hecho */
  reached: number;
  current: FlowKey | null;
  /** Pasos que quedan (incluido publicar) */
  left: number;
  finished: boolean;
  /** «Guardar y seguir luego»: el panel se abre limitado en vez de en la puesta en marcha */
  later: boolean;
}

export interface ClassTemplate {
  key: string;
  title: string;
  title_en: string;
  category: string;
  category_name: string;
  duration_minutes: number;
  credits: number;
  level: string;
  capacity: number;
  description: string;
  description_en: string;
  exists: boolean;
  /** Id del tipo de clase si ya existe */
  id: number | null;
}

export interface TemplateItem {
  key: string;
  title?: string;
  duration_minutes?: number;
  credits?: number;
  instructor_id?: number | null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: authHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
  });
  if (!res.ok) {
    let message = '';
    try {
      message = (await res.clone().json())?.error || '';
    } catch { /* sin cuerpo JSON */ }
    throw new Error(message || (await friendlyError(res)));
  }
  return res.json();
}

export const fetchProgress = () => call<SetupProgress>('v1/setup/progress/');

export const setStepStatus = (key: StepKey | 'welcome', status: 'done' | 'skipped' | 'todo') =>
  call<SetupProgress>(`v1/setup/steps/${key}/`, { method: 'POST', body: JSON.stringify({ status }) });

export const publishSite = () => call<SetupProgress>('v1/setup/publish/', { method: 'POST' });

export const listClassTemplates = () => call<{ templates: ClassTemplate[] }>('v1/setup/class-templates/');

export const createClassTypesFromTemplates = (items: TemplateItem[]) =>
  call<{ created: { key: string; id: number; title: string }[]; skipped: { key: string; title: string }[]; progress: SetupProgress }>(
    'v1/setup/class-templates/', { method: 'POST', body: JSON.stringify({ items }) },
  );

/** Crea una sala con lo mínimo (nombre y plazas). */
export const createRoom = (name: string, capacity: number) =>
  call<{ id: number; name: string; capacity: number }>('v1/rooms/', {
    method: 'POST', body: JSON.stringify({ name, capacity }),
  });

/** Cambia el nombre o las plazas de una sala. */
export const updateRoom = (id: number, patch: { name?: string; capacity?: number }) =>
  call<{ id: number; name: string; capacity: number }>(`v1/rooms/${id}/`, {
    method: 'PATCH', body: JSON.stringify(patch),
  });

// ── Puesta en marcha obligatoria (api/api/setup_flow.py) ─────────────────

/** «Continuar» en un paso (exige sus datos y los anteriores hechos). */
export const confirmFlowStep = (key: FlowKey) =>
  call<SetupProgress>('v1/setup/flow/', { method: 'POST', body: JSON.stringify({ confirm: key }) });

/** «Guardar y seguir luego». */
export const setSetupLater = (later: boolean) =>
  call<SetupProgress>('v1/setup/flow/', { method: 'POST', body: JSON.stringify({ later }) });

export const createInstructor = (name: string) =>
  call<{ id: number; name: string }>('v1/setup/instructors/', { method: 'POST', body: JSON.stringify({ name }) });

export const renameInstructor = (id: number, name: string) =>
  call<{ id: number; name: string }>(`v1/instructors/${id}/`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const listInstructors = () => call<{ id: number; name: string }[]>('v1/instructors/');

async function remove(path: string) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 404) {
    let message = '';
    try { message = (await res.clone().json())?.error || ''; } catch { /* sin cuerpo */ }
    throw new Error(message || (await friendlyError(res)));
  }
}

export const deleteInstructor = (id: number) => remove(`v1/instructors/${id}/`);
export const deleteRoom = (id: number) => remove(`v1/rooms/${id}/`);
export const listRooms = () => call<{ id: number; name: string; capacity: number }[]>('v1/rooms/');

/** Quita una clase elegida por error (y sus huecos de la semana). */
export const deleteClassType = (id: number) => remove(`v1/setup/class-types/${id}/`);

export const updateClassType = (id: number, patch: { title?: string; duration_minutes?: number; default_price_credits?: number }) =>
  call<{ id: number }>(`v1/class-types/${id}/`, { method: 'PATCH', body: JSON.stringify(patch) });

export interface WeekSlot {
  id: number;
  weekday: number;
  start_time: string;
  class_type_id: number;
  title: string;
  room_id: number;
  duration_minutes: number | null;
}

export interface WeekData {
  slots: WeekSlot[];
  class_types: { id: number; title: string; duration_minutes: number; credits: number; category: string }[];
  rooms: { id: number; name: string; capacity: number }[];
}

export const loadWeek = () => call<WeekData>('v1/setup/week/');
export const addWeekSlot = (body: { weekday: number; start_time: string; class_type_id: number; room_id?: number }) =>
  call<WeekData>('v1/setup/week/', { method: 'POST', body: JSON.stringify(body) });
export const changeWeekSlot = (id: number, class_type_id: number) =>
  call<WeekData>(`v1/setup/week/${id}/`, { method: 'PATCH', body: JSON.stringify({ class_type_id }) });
export const removeWeekSlot = (id: number) => call<WeekData>(`v1/setup/week/${id}/`, { method: 'DELETE' });

export interface PackSuggestion {
  key: string;
  name: string;
  description: string;
  credits: number;
  price: string;
  expire_days: number;
  on: boolean;
  plan_id: number | null;
  suggested_on: boolean;
}

export const loadPacks = () => call<{ packs: PackSuggestion[]; currency: string }>('v1/setup/packs/');
export const savePack = (body: { key: string; on?: boolean; price?: string }) =>
  call<{ packs: PackSuggestion[]; currency: string }>('v1/setup/packs/', { method: 'POST', body: JSON.stringify(body) });

/** Visitas guiadas y consejos ya vistos (por persona, en el servidor). */
export const loadSeenTips = () => call<{ seen: string[] }>('v1/setup/tips/');
export const markTipSeen = (key: string) =>
  call<{ seen: string[] }>('v1/setup/tips/', { method: 'POST', body: JSON.stringify({ key }) });
export const resetTips = () =>
  call<{ seen: string[] }>('v1/setup/tips/', { method: 'POST', body: JSON.stringify({ reset: true }) });
