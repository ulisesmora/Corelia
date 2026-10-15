// Datos del catálogo para renderizar en SERVIDOR (SEO): los buscadores y las
// IA leen el HTML inicial; si las clases solo se pintan con JavaScript, no las ven.
import { serverApiRoot } from '../config';
import { getSiteClient } from '../lib/site';
import type { Lang } from './site';

export interface ApiCategory {
  id: number; name: string; slug: string;
  name_en?: string; description?: string | null; description_en?: string;
}
export interface ApiInstructor {
  id: number; name: string; slug: string; image?: string | null;
  short_bio?: string | null; short_bio_en?: string;
  description?: string | null; description_en?: string;
  experience_years?: number; instagram?: string | null; website?: string | null;
  created_at?: string;
}
export interface ApiRoom {
  id: number; name: string; title?: string | null; title_en?: string;
  description?: string | null; description_en?: string;
  capacity?: number; image?: string | null; is_active?: boolean;
}
export interface ApiPlan {
  id: number; name: string; name_en?: string; slug?: string; type: 'pack' | 'sub' | string;
  credits: number; price_eur: string | number; price_credit?: string | number | null;
  interval?: string | null; interval_count?: number | null; credits_expire_days?: number | null;
  is_active?: boolean; description?: string | null; description_en?: string; saving?: string | null;
  translations?: Record<string, Record<string, string>> | null;
}
export interface ApiFaq {
  id: number; question: string; answer: string; question_en?: string; answer_en?: string;
  page?: string; order?: number; is_active?: boolean;
  /** Pregunta de ejemplo (datos de demostración): no va en FAQPage ni en llms.txt. */
  is_sample?: boolean;
}
export interface ApiTestimonial {
  id: number; author: string; text: string; text_en?: string; rating?: number | null;
  source?: string | null; photo_url?: string | null; order?: number;
}
export interface ApiSiteImage {
  id: number; section: string; image: string; title?: string | null; title_en?: string;
  subtitle?: string | null; subtitle_en?: string; order?: number;
}
export interface ApiClassType {
  id: number; title: string; slug: string; description?: string | null;
  title_en?: string; description_en?: string;
  duration_minutes?: number; level?: string; is_active?: boolean;
  default_price_credits?: string | number; default_price_eur?: string | number;
  image?: string | null; updated_at?: string; created_at?: string;
  category?: ApiCategory | null; instructor?: ApiInstructor | null;
  translations?: Record<string, Record<string, string> | undefined>;
}
export interface ApiSchedule {
  id: number; weekday: number | null; start_time: string; end_time: string;
  is_active: boolean; is_recurrent?: boolean | null;
  start_date?: string | null; end_date?: string | null;
  capacity_max?: number;
  class_type: ApiClassType | number;
  room?: { id: number; name: string; title?: string | null; title_en?: string } | null;
  override_instructor?: ApiInstructor | null;
}

const TTL_MS = 10 * 60 * 1000;
// Contenido que el estudio edita a menudo desde el panel (FAQs, opiniones,
// precios, fotos): caché corta para que los cambios se vean enseguida.
const SHORT_TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

async function getJson<T>(path: string, ttl = TTL_MS): Promise<T | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${serverApiRoot()}/${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return hit ? (hit.data as T) : null;
    const raw = await res.json();
    const data = (Array.isArray(raw) ? raw : raw?.results ?? raw) as T;
    cache.set(path, { at: Date.now(), data });
    return data;
  } catch {
    return hit ? (hit.data as T) : null;
  }
}

export const getClassTypes = () => getJson<ApiClassType[]>('v1/class-types/?page_size=500');
export const getInstructors = () => getJson<ApiInstructor[]>('v1/instructors/?page_size=200');
export const getRooms = () => getJson<ApiRoom[]>('v1/rooms/?is_active=true&page_size=200');
export const getPlans = async () =>
  ((await getJson<ApiPlan[]>('v1/plans/?is_active=true&ordering=credits&page_size=200', SHORT_TTL_MS)) || [])
    .filter((p) => p.is_active !== false);
export const getFaqs = async (page: 'home' | 'prices') =>
  ((await getJson<ApiFaq[]>(`v1/faqs/?page=${page}`, SHORT_TTL_MS)) || [])
    .filter((f) => f.is_active !== false && f.question && f.answer)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const getTestimonials = async () =>
  ((await getJson<ApiTestimonial[]>('v1/testimonials/', SHORT_TTL_MS)) || [])
    .filter((t) => t.text && t.author)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const getSiteImages = async (section: string) =>
  ((await getJson<ApiSiteImage[]>(`v1/site-images/?section=${encodeURIComponent(section)}&is_active=true&ordering=order`, SHORT_TTL_MS)) || [])
    .filter((i) => typeof i.image === 'string' && i.image);
export const getSchedules = () => getJson<ApiSchedule[]>('v1/recurrences/?is_active=true&page_size=500');

export async function getClassBySlug(slug: string): Promise<ApiClassType | null> {
  const list = await getJson<ApiClassType[]>(`v1/class-types/?slug=${encodeURIComponent(slug)}`);
  return list?.find((c) => c.slug === slug) ?? null;
}

/** Texto en el idioma pedido: campo *_en, después translations.en, después el español. */
export function tr<T extends object>(obj: T | null | undefined, field: string, lang: Lang): string {
  if (!obj) return '';
  const o = obj as Record<string, unknown>;
  if (lang === 'en') {
    const en = o[`${field}_en`];
    if (typeof en === 'string' && en.trim()) return en;
    const t = (o.translations as Record<string, Record<string, string>> | undefined)?.en?.[field];
    if (t && t.trim()) return t;
  }
  const v = o[field];
  return typeof v === 'string' ? v : '';
}

// Hoy en la zona horaria del estudio (la config ya está cargada por el <head>)
const todayIso = () => new Intl.DateTimeFormat('sv-SE', { timeZone: getSiteClient().timezone || 'Europe/Madrid' }).format(new Date());

/** Sesiones semanales vigentes de una clase (activas, recurrentes, sin terminar). */
export function currentWeeklySlots(schedules: ApiSchedule[] | null, classId: number): ApiSchedule[] {
  const today = todayIso();
  return (schedules || [])
    .filter((s) => {
      const ct = typeof s.class_type === 'object' ? s.class_type?.id : s.class_type;
      return ct === classId && s.is_active && s.is_recurrent !== false && s.weekday != null
        && (!s.end_date || s.end_date >= today);
    })
    .sort((a, b) => (a.weekday! - b.weekday!) || a.start_time.localeCompare(b.start_time));
}

export const WEEKDAYS: Record<Lang, string[]> = {
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};
export const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const LEVELS: Record<string, Record<Lang, string>> = {
  all: { es: 'Todos los niveles', en: 'All levels' },
  beg: { es: 'Principiante', en: 'Beginner' },
  int: { es: 'Intermedio', en: 'Intermediate' },
  adv: { es: 'Avanzado', en: 'Advanced' },
};

export const hhmm = (t: string) => (t || '').slice(0, 5);

/** Clases que se ofrecen ahora: activas y con al menos un horario semanal vigente. */
export function offeredClasses(classes: ApiClassType[] | null, schedules: ApiSchedule[] | null) {
  return (classes || [])
    .filter((c) => c.is_active !== false)
    .map((c) => ({ cls: c, slots: currentWeeklySlots(schedules, c.id) }))
    .filter((x) => x.slots.length > 0);
}

/** «Ahora» en la zona del estudio, como el API: YYYY-MM-DDTHH:mm:ss. */
export function studioNow(): string {
  const tz = getSiteClient().timezone || 'Europe/Madrid';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date()).replace(' ', 'T');
}

/** Sesiones del horario de los próximos `days` días (plazas libres incluidas). Caché 1 min. */
export async function getUpcomingSessions(days = 8) {
  const start = studioNow().slice(0, 10);
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  return (await getJson<import('../lib/booking').ScheduleSession[]>(
    `v1/schedule/schedule/?start_date=${start}&end_date=${end}`, SHORT_TTL_MS)) || [];
}
