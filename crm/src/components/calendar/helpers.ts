// Utilidades compartidas por las vistas del calendario.
import type { Occurrence } from './types';
import { DAYS, addDays, startOfMonth, startOfWeek, weekdayOf } from './dates';

export const occupancyPct = (list: Occurrence[]) => {
  const live = list.filter((o) => !o.canceled && !o.blackout);
  const cap = live.reduce((a, o) => a + o.capacity, 0);
  return cap ? Math.round((live.reduce((a, o) => a + o.booked, 0) / cap) * 100) : 0;
};

export function occLabel(o: Occurrence) {
  const full = o.booked >= o.capacity && !o.canceled;
  return `${o.title}, ${DAYS[weekdayOf(o.date)]} de ${o.start.slice(11)} a ${o.end.slice(11)}` +
    `${o.instructor ? `, con ${o.instructor.name}` : ''}, ${o.room.name}, ${o.booked} de ${o.capacity} plazas` +
    `${o.waitlist ? `, ${o.waitlist} en lista de espera` : ''}${full ? ', llena' : ''}` +
    `${o.canceled ? ', cancelada' : ''}${o.blackout ? `, cerrada (${o.blackout.reason || 'cierre'})` : ''}` +
    `${o.recurring ? ', se repite cada semana' : ', clase puntual'}`;
}

export const monthGridRange = (anchor: string) => {
  const first = startOfWeek(startOfMonth(anchor));
  return { start: first, end: addDays(first, 41) };
};

