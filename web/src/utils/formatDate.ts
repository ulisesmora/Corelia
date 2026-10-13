/**
 * formatDate.ts — fechas y horas siempre en la zona horaria del estudio
 * (config → timezone, p. ej. Europe/Madrid).
 *
 * Úsalas siempre que muestres la fecha u hora de una clase: así quien mira
 * desde otra zona horaria ve el horario del estudio.
 */
import { getSiteClient } from '../lib/site';

/** Zona horaria del estudio (IANA). */
export function studioTimeZone(): string {
  return getSiteClient().timezone || 'Europe/Madrid';
}

/** Fecha localizada en la hora del estudio. */
export function fmtDate(
  date: Date | string | number,
  locale: string,
  opts: Omit<Intl.DateTimeFormatOptions, 'timeZone'> = {},
): string {
  return new Date(date).toLocaleDateString(locale, { ...opts, timeZone: studioTimeZone() });
}

/** Hora localizada en la hora del estudio. */
export function fmtTime(
  date: Date | string | number,
  locale: string,
  opts: Omit<Intl.DateTimeFormatOptions, 'timeZone'> = {},
): string {
  return new Date(date).toLocaleTimeString(locale, { ...opts, timeZone: studioTimeZone() });
}
