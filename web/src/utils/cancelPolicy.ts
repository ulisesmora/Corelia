// Plazo para que un cliente cancele su reserva (y recupere los créditos).
// Sale de la config del estudio (cancel_min_hours = BOOKING_CANCEL_MIN_HOURS de
// la API, que es quien lo exige). 8 h si no llega.
import { getSiteClient } from '../lib/site';

const FALLBACK_HOURS = 8;

/** Horas mínimas de antelación para cancelar (según la config del estudio). */
export function cancelMinHours(): number {
  const h = Number(getSiteClient().cancel_min_hours);
  return Number.isFinite(h) && h >= 0 ? h : FALLBACK_HOURS;
}

/** ¿Se puede cancelar todavía una clase que empieza en `iso`? */
export const canCancelBooking = (iso: string) =>
  new Date(iso).getTime() - Date.now() > cancelMinHours() * 60 * 60 * 1000;
