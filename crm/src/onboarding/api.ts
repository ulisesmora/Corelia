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
}

export interface TemplateItem {
  key: string;
  title?: string;
  duration_minutes?: number;
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
