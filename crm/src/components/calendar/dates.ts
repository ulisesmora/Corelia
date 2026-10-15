// Fechas del calendario. Todo va en HORA DE PARED del estudio: el API ya
// devuelve «YYYY-MM-DDTHH:MM» en la zona del estudio, así que aquí no se
// convierte de zona: se opera con fechas «sin hora» y minutos del día.

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const D1 = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → Date (mediodía UTC, para que sumar días no cruce zonas). */
export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};
export const fmtDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s: string, n: number) => {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDay(d);
};
/** 0 = lunes … 6 = domingo (como en el API). */
export const weekdayOf = (s: string) => (parseDay(s).getUTCDay() + 6) % 7;
export const startOfWeek = (s: string) => addDays(s, -weekdayOf(s));
export const startOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
export const addMonths = (s: string, n: number) => {
  const d = parseDay(startOfMonth(s));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fmtDay(d);
};
export const dayNum = (s: string) => Number(s.slice(8, 10));
export const monthIdx = (s: string) => Number(s.slice(5, 7)) - 1;

/** «HH:MM» → minutos del día */
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const m2t = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60))}`;
/** Minutos del día de un «YYYY-MM-DDTHH:MM» */
export const minOf = (wall: string) => toMin(wall.slice(11, 16));

/** Fecha de hoy y minutos de ahora en la zona del estudio. */
export function studioNow(tz: string): { date: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  } catch {
    const d = new Date();
    return { date: fmtDay(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12))), minutes: d.getHours() * 60 + d.getMinutes() };
  }
}

/** «lunes» → «lunes», «sábado» → «sábados» (para «todos los …») */
export const plural = (day: string) => (day.endsWith('s') ? day : `${day}s`);

export const longDay = (s: string) => `${DAYS[weekdayOf(s)]} ${dayNum(s)} ${MON[monthIdx(s)]}`;
export const shortDay = (s: string) => `${DS[weekdayOf(s)].toLowerCase()} ${dayNum(s)}`;

export function rangeLabel(view: 'day' | 'week' | 'month', anchor: string): string {
  if (view === 'month') {
    const m = MONTHS[monthIdx(anchor)];
    return `${m[0].toUpperCase()}${m.slice(1)} ${anchor.slice(0, 4)}`;
  }
  if (view === 'day') return longDay(anchor);
  const a = startOfWeek(anchor);
  const b = addDays(a, 6);
  return monthIdx(a) === monthIdx(b)
    ? `${dayNum(a)} – ${dayNum(b)} ${MON[monthIdx(b)]} ${b.slice(0, 4)}`
    : `${dayNum(a)} ${MON[monthIdx(a)]} – ${dayNum(b)} ${MON[monthIdx(b)]}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '·';
