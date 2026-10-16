'use client';
// «Próximas clases» de la portada: las 6 siguientes sesiones con plazas, con
// «Reservar» de un toque (añade la clase y lleva al checkout). El servidor ya
// pinta la lista (SEO y sin saltos); al cargar se refrescan las plazas.
// Sin Chakra: clases .w-* de styles/site.css.
import { useEffect, useMemo, useState } from 'react';
import { API_V1 } from '../../config';
import { addToCart, cartItemFromSession, FEW_SPOTS, type ScheduleSession } from '../../lib/booking';
import { getSiteClient } from '../../lib/site';
import { useCartStore } from '../stores/car.store';
import { useHydrated } from '../../utils/useHydrated';

interface Props {
  lang: 'es' | 'en';
  initial: ScheduleSession[];
  /** «Ahora» en la zona del estudio (YYYY-MM-DDTHH:mm:ss) calculado en el servidor. */
  now: string;
  limit?: number;
}

const TX = {
  es: { book: 'Reservar', booked: 'Elegida', today: 'Hoy', tomorrow: 'Mañana', left: (n: number) => (n === 1 ? 'Queda 1 plaza' : `Quedan ${n} plazas`), spots: (n: number) => `${n} plazas libres`, empty: 'No hay clases con plazas libres en los próximos días.', see: 'Ver el horario completo' },
  en: { book: 'Book', booked: 'Selected', today: 'Today', tomorrow: 'Tomorrow', left: (n: number) => (n === 1 ? '1 spot left' : `${n} spots left`), spots: (n: number) => `${n} spots available`, empty: 'No classes with free spots in the next few days.', see: 'See the full timetable' },
};

/** Fecha y hora "naive" del API (hora del estudio) → Date real. */
function toDate(naive: string, tz: string): Date {
  // Diferencia entre la hora del estudio y UTC en ese instante
  const guess = new Date(`${naive}Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(guess).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const asTz = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asTz - guess.getTime()));
}

export function pickUpcoming(list: ScheduleSession[], now: string, limit: number) {
  return list
    .filter((s) => s.end_datetime > now && s.available_seats > 0)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
    .slice(0, limit);
}

export default function UpcomingClasses({ lang, initial, now, limit = 6 }: Props) {
  const tx = TX[lang];
  const [sessions, setSessions] = useState(initial);
  const inCart = useCartStore((s) => s.items);
  // El carrito vive en el navegador: hasta hidratar se pinta como el servidor
  const hydrated = useHydrated();

  // Plazas al día (el HTML puede venir de una caché corta)
  useEffect(() => {
    const start = now.slice(0, 10);
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + 8 * 86400000).toISOString().slice(0, 10);
    fetch(`${API_V1}/schedule/schedule/?start_date=${start}&end_date=${end}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d)) setSessions(d); })
      .catch(() => { /* nos quedamos con lo del servidor */ });
  }, [now]);

  const list = useMemo(() => pickUpcoming(sessions, now, limit), [sessions, now, limit]);
  const today = now.slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  const dayLabel = (iso: string) => {
    const d = iso.slice(0, 10);
    if (d === today) return tx.today;
    if (d === tomorrow) return tx.tomorrow;
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  };

  if (list.length === 0) {
    return (
      <div className="w-card" style={{ padding: 'var(--w-5)' }}>
        <p className="w-muted" style={{ margin: '0 0 var(--w-3)' }}>{tx.empty}</p>
        <a className="w-more" href="/calendar">{tx.see} →</a>
      </div>
    );
  }

  const book = (s: ScheduleSession) => {
    const tz = getSiteClient().timezone || 'Europe/Madrid';
    addToCart(cartItemFromSession(s, toDate(s.start_datetime, tz), toDate(s.end_datetime, tz)));
  };

  return (
    <ul className="w-next" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {list.map((s) => {
        const title = (lang === 'en' && s.title_en) || s.title;
        const few = s.available_seats <= FEW_SPOTS;
        const chosen = hydrated && inCart.some((i) => i.id === s.id);
        return (
          <li key={s.id} className="w-card w-slot">
            <div className="w-slot-time">
              <small>{dayLabel(s.start_datetime)}</small>
              <b>{s.start_datetime.slice(11, 16)}</b>
            </div>
            <div className="w-slot-info">
              <b>{title}</b>
              <span>{[s.instructor, (lang === 'en' && s.room_en) || s.room].filter(Boolean).join(' · ')}</span>
              <span className={`w-chip ${few ? 'w-chip--warn' : 'w-chip--ok'}`}>{few ? tx.left(s.available_seats) : tx.spots(s.available_seats)}</span>
            </div>
            <button type="button" className="w-btn w-btn--sm sk-btn" onClick={() => book(s)} aria-label={`${tx.book}: ${title} · ${dayLabel(s.start_datetime)} ${s.start_datetime.slice(11, 16)}`}>
              {chosen ? tx.booked : tx.book}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
