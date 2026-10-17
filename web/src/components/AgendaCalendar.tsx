"use client";
// Horario con reserva: tira de la semana + lista del día (agenda), plazas que
// quedan y «Reservar» de un toque (añade la clase y lleva al checkout, donde
// se confirma). Una sesión completa ofrece «Apuntarme a la lista de espera»
// solo si el API lo dice (waitlist_enabled en cada sesión); si no, «Completa».
// Con sesión iniciada se marcan las listas en las que ya está (y la plaza
// ofrecida, con su enlace para aceptarla).
//
// Se usa en /calendar y, compacto y filtrado a una clase, en su ficha
// (ClassDetails). Sin Chakra ni animaciones: clases .w-cal-* de styles/site.css.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { es, enUS } from 'date-fns/locale';
import {
  format, addDays, subDays, startOfWeek, isSameDay, isBefore, startOfToday, addMonths,
} from 'date-fns';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Icon } from './ui/Icon';
import { useCartStore } from './stores/car.store';
import { toaster, Toaster } from './ui/toaster';
import { useLangStore } from './stores/lang.store';
import { tr, classUrl } from '../utils/localized';
import { useT, formatPrice } from '../i18n';
import 'react-day-picker/dist/style.css';
import { API_ROOT } from '../config';
import { getSiteClient } from '../lib/site';
import {
  addToCart, cartItemFromSession, FEW_SPOTS, joinWaitlist, loginUrl, myWaitlist, sessionKey, waitlistEnabled,
  type ScheduleSession, type WaitlistEntry,
} from '../lib/booking';

dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = `${API_ROOT}/`;
// Zona horaria del estudio (config → timezone)
const TIMEZONE = getSiteClient().timezone || 'Europe/Madrid';

export interface ApiScheduleEvent extends ScheduleSession {
  type: string; title: string; title_en?: string;
  room: string; room_en?: string; instructor?: string;
  capacity_max: number; is_recurrent: boolean;
  capacity_min: number; occupied_seats: number; available_seats: number;
  image: string; price_eur_overwrite?: number; price_credit_overwrite?: number;
  price_eur?: number; price_credit: number;
}

export interface CalendarEvent {
  id: string; title: string; start: Date; end: Date;
  resource: ApiScheduleEvent;
}

export type CalendarFilter =
  | { type: 'class'; slug: string }
  | { type: 'event'; id: number };

interface AgendaCalendarProps {
  filter?: CalendarFilter;
  /** Aviso tras elegir una sesión (la ficha de clase cierra su modal). */
  onSelectEvent: (event: CalendarEvent) => void;
  compact?: boolean;
  /** Sin enlace a la ficha (cuando ya estás en ella). */
  hideDetailLink?: boolean;
}

type Status = 'available' | 'limited' | 'full' | 'past';

function getStatus(event: CalendarEvent): Status {
  if (event.end < new Date()) return 'past';
  if (event.resource.available_seats <= 0) return 'full';
  if (event.resource.available_seats <= FEW_SPOTS) return 'limited';
  return 'available';
}

const TX = {
  es: {
    book: 'Reservar', chosen: 'Elegida', waitlist: 'Apuntarme a la lista de espera', full: 'Completa', ended: 'Terminada',
    onWaitlist: (n: number | null) => (n ? `En la lista · nº ${n}` : 'En la lista'), claim: '¡Tienes plaza! Aceptar', booked: 'Ya tienes plaza',
    left: (n: number) => (n === 1 ? 'Queda 1 plaza' : `Quedan ${n} plazas`), free: (n: number) => `${n} plazas libres`,
    today: 'Hoy', pick: 'Elegir fecha', nextDay: 'Ver el siguiente día con clases',
    wlJoined: (n: number | null) => (n ? `Estás en la lista (nº ${n}). Te avisaremos si se libera una plaza.` : 'Te avisaremos si se libera una plaza.'),
    wlLogin: 'Entra en tu cuenta para apuntarte a la lista de espera', wlLoginBtn: 'Entrar',
    wlSpace: 'Se ha liberado una plaza: puedes reservarla ya.', wlAlready: 'Ya estabas en la lista de espera de esta clase.',
    wlBooked: 'Ya tienes plaza en esta clase.', wlNo: 'Ahora no se puede apuntar a la lista. Escríbenos y te ayudamos.',
    guideQ: '¿No sabes qué clase elegir?', guideA: 'Responde 2 preguntas y te recomendamos una.', guideBtn: 'Ayúdame',
    credits: (n: number) => (n === 1 ? '1 crédito' : `${n} créditos`),
  },
  en: {
    book: 'Book', chosen: 'Selected', waitlist: 'Join the waitlist', full: 'Full', ended: 'Finished',
    onWaitlist: (n: number | null) => (n ? `On the waitlist · #${n}` : 'On the waitlist'), claim: 'Spot for you! Accept', booked: 'You have a spot',
    left: (n: number) => (n === 1 ? '1 spot left' : `${n} spots left`), free: (n: number) => `${n} spots available`,
    today: 'Today', pick: 'Pick a date', nextDay: 'See the next day with classes',
    wlJoined: (n: number | null) => (n ? `You're on the waitlist (#${n}). We'll let you know if a spot opens up.` : "We'll let you know if a spot opens up."),
    wlLogin: 'Sign in to join the waitlist', wlLoginBtn: 'Sign in',
    wlSpace: 'A spot just opened up: you can book it now.', wlAlready: "You're already on this class's waitlist.",
    wlBooked: 'You already have a spot in this class.', wlNo: "The waitlist isn't available right now. Message us and we'll help.",
    guideQ: 'Not sure which class to pick?', guideA: 'Answer 2 questions and we’ll recommend one.', guideBtn: 'Help me',
    credits: (n: number) => (n === 1 ? '1 credit' : `${n} credits`),
  },
};

// ─── Una sesión de la lista ───────────────────────────────────────
function SessionRow({ event, onBook, onWaitlist, entry, mine, busy, hideDetailLink }: {
  event: CalendarEvent;
  onBook: (e: CalendarEvent) => void;
  onWaitlist: (e: CalendarEvent) => void;
  /** Su entrada en la lista de espera de esta sesión (si se ha apuntado). */
  entry?: WaitlistEntry;
  /** Ya tiene plaza (lo dijo el API al intentar apuntarse) */
  mine?: boolean;
  busy: boolean;
  hideDetailLink?: boolean;
}) {
  const lang = useLangStore((s) => s.lang);
  const tx = TX[lang === 'en' ? 'en' : 'es'];
  const status = getStatus(event);
  const inCart = useCartStore((s) => s.items.some((i) => i.id === event.id));
  const r = event.resource;
  const title = tr(r, 'title', lang) || event.title;
  const credits = Number(r.price_credit_overwrite ?? r.price_credit) || 0;
  const price = Number(r.price_eur_overwrite ?? r.price_eur) || 0;
  const wl = status === 'full' && waitlistEnabled(r);
  const meta = [r.instructor, tr(r, 'room', lang)].filter(Boolean).join(' · ');
  const cost = credits > 0 ? tx.credits(credits) : price > 0 ? formatPrice(price, lang, 'auto') : '';

  return (
    <li className={`w-card w-cal-row is-${status}`}>
      <div className="w-cal-time">
        <b>{dayjs(event.start).tz(TIMEZONE).format('HH:mm')}</b>
        <span>{dayjs(event.end).tz(TIMEZONE).format('HH:mm')}</span>
      </div>
      <div className="w-cal-info">
        {!hideDetailLink && r.class_type_slug
          ? <a className="w-cal-title" href={classUrl(r.class_type_slug, lang)}>{title}</a>
          : <span className="w-cal-title">{title}</span>}
        {meta && <span className="w-cal-meta">{meta}</span>}
        <span className="w-cal-tags">
          {status === 'available' && <span className="w-chip w-chip--ok">{tx.free(r.available_seats)}</span>}
          {status === 'limited' && <span className="w-chip w-chip--warn">{tx.left(r.available_seats)}</span>}
          {status === 'full' && <span className="w-chip w-chip--full">{tx.full}</span>}
          {cost && status !== 'past' && <span className="w-cal-cost">{cost}</span>}
        </span>
      </div>
      <div className="w-cal-act">
        {(status === 'available' || status === 'limited') && (
          <button type="button" className={`w-btn w-btn--sm ${inCart ? 'sk-btn-ghost' : 'sk-btn'}`}
            onClick={() => onBook(event)} aria-label={`${inCart ? tx.chosen : tx.book}: ${title} ${dayjs(event.start).tz(TIMEZONE).format('HH:mm')}`}>
            {inCart && <Icon name="check" size={12} aria-hidden />}{inCart ? tx.chosen : tx.book}
          </button>
        )}
        {mine ? (
          <span className="w-chip w-chip--ok">{tx.booked}</span>
        ) : entry?.status === 'offered' && entry.claim_token ? (
          <a className="w-btn w-btn--sm sk-btn" href={`${lang === 'en' ? '/en/waitlist' : '/lista-espera'}?token=${entry.claim_token}`}>
            {tx.claim}
          </a>
        ) : entry ? (
          <span className="w-chip w-chip--ok">{tx.onWaitlist(entry.position)}</span>
        ) : wl && (
          <button type="button" className="w-btn w-btn--sm sk-btn-ghost" disabled={busy} aria-busy={busy}
            onClick={() => onWaitlist(event)} aria-label={`${tx.waitlist}: ${title} ${dayjs(event.start).tz(TIMEZONE).format('HH:mm')}`}>
            {tx.waitlist}
          </button>
        )}
        {status === 'past' && <span className="w-cal-ended">{tx.ended}</span>}
      </div>
    </li>
  );
}

// ─── Componente principal ─────────────────────────────────────────
export default function AgendaCalendar({ filter, onSelectEvent, compact = false, hideDetailLink = false }: AgendaCalendarProps) {
  const lang = useLangStore((s) => s.lang);
  const tx = TX[lang === 'en' ? 'en' : 'es'];
  const locale = lang === 'es' ? es : enUS;
  const t = useT();
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(startOfToday(), { weekStartsOn: 1 }));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  // Mis listas de espera (con sesión): clave regla|inicio → entrada
  const [waitlist, setWaitlist] = useState<Record<string, WaitlistEntry>>({});
  const [wlBusy, setWlBusy] = useState<string | null>(null);
  const [mine, setMine] = useState<Record<string, boolean>>({});
  const pickerRef = useRef<HTMLDivElement>(null);

  // Primera visita (sin sesión ni guía vista): ofrecer la guía "Encuentra tu clase"
  const [showGuideHint, setShowGuideHint] = useState(false);
  useEffect(() => {
    if (filter || compact) return;
    try {
      setShowGuideHint(!localStorage.getItem('domFirstClassGuideSeen') && !localStorage.getItem('accessToken'));
    } catch { /* sin almacenamiento */ }
  }, [filter, compact]);

  const today = useMemo(() => startOfToday(), []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Con filtro (ficha de UNA clase) cargamos 8 semanas de golpe: así
  // podemos mostrar solo los días en que se da y saltar a su próxima fecha.
  const isFiltered = Boolean(filter);
  const fetchKey = isFiltered ? 'filtered' : format(weekStart, 'yyyy-MM-dd');

  useEffect(() => {
    let alive = true;
    const fetchEvents = async () => {
      setLoading(true);
      const rangeStart = isFiltered ? startOfToday() : weekStart;
      const startDate = format(rangeStart, 'yyyy-MM-dd');
      const endDate = format(addDays(rangeStart, isFiltered ? 62 : 13), 'yyyy-MM-dd');
      try {
        const res = await fetch(`${API_BASE_URL}v1/schedule/schedule/?start_date=${startDate}&end_date=${endDate}`);
        if (!res.ok) throw new Error('Error al cargar los datos.');
        const data: ApiScheduleEvent[] = await res.json();
        if (!alive) return;
        setEvents(data.map((e) => ({
          id: e.id, title: e.title,
          start: dayjs.tz(e.start_datetime, TIMEZONE).toDate(),
          end: dayjs.tz(e.end_datetime, TIMEZONE).toDate(),
          resource: e,
        })));
      } catch { /* sin conexión: lista vacía */ } finally { if (alive) setLoading(false); }
    };
    fetchEvents();
    return () => { alive = false; };
  }, [fetchKey]);

  const loadWaitlist = useCallback(async () => {
    const list = await myWaitlist();
    if (!list) return;
    setWaitlist(Object.fromEntries(list.map((e) => [sessionKey(e.schedule_id, e.start_datetime), e])));
  }, []);
  useEffect(() => { loadWaitlist(); }, [loadWaitlist]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPicker(false); };
    if (showPicker) { document.addEventListener('mousedown', handler); document.addEventListener('keydown', onKey); }
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, [showPicker]);

  const filteredEvents = useMemo(() => {
    let base = events;
    if (filter?.type === 'class') base = base.filter((e) => e.resource.class_type_slug === filter.slug);
    if (filter?.type === 'event') base = base.filter((e) => e.resource.type === 'EVENT' && e.resource.source_id === filter.id);
    return base;
  }, [events, filter]);

  const dayKey = (d: Date) => dayjs(d).tz(TIMEZONE).format('YYYY-MM-DD');
  const dayEvents = useMemo(() => {
    const selKey = dayKey(selectedDate);
    return filteredEvents.filter((e) => dayKey(e.start) === selKey).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filteredEvents, selectedDate]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEvents.forEach((e) => { const k = dayKey(e.start); map[k] = (map[k] || 0) + 1; });
    return map;
  }, [filteredEvents]);

  // Próximas fechas (futuras) con sesiones (para saltar al siguiente día con clases)
  const upcomingDays = useMemo(() => {
    const now = new Date();
    const keys = new Set<string>();
    const days: Date[] = [];
    filteredEvents.filter((e) => e.end > now).sort((a, b) => a.start.getTime() - b.start.getTime()).forEach((e) => {
      const k = dayKey(e.start);
      if (!keys.has(k)) { keys.add(k); days.push(dayjs.tz(k, TIMEZONE).toDate()); }
    });
    return days;
  }, [filteredEvents]);

  // Ficha de clase: seleccionar su próxima fecha al cargar
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!isFiltered || loading || autoSelectedRef.current || upcomingDays.length === 0) return;
    autoSelectedRef.current = true;
    const first = upcomingDays[0];
    setSelectedDate(first);
    setWeekStart(startOfWeek(first, { weekStartsOn: 1 }));
  }, [isFiltered, loading, upcomingDays]);

  const goToDay = useCallback((d: Date) => {
    setWeekStart(startOfWeek(d, { weekStartsOn: 1 }));
    setSelectedDate(d);
  }, []);

  // Horario general: si hoy ya no quedan clases, abrir el siguiente día que tenga
  const autoNextRef = useRef(false);
  useEffect(() => {
    if (isFiltered || loading || autoNextRef.current) return;
    autoNextRef.current = true;
    const now = new Date();
    const todayKey = dayKey(today);
    const leftToday = filteredEvents.some((e) => dayKey(e.start) === todayKey && e.end > now);
    if (!leftToday && upcomingDays[0] && isSameDay(selectedDate, today)) goToDay(upcomingDays[0]);
  }, [isFiltered, loading, filteredEvents, upcomingDays]);

  // Ficha de clase: la tira muestra SOLO los días de la semana en que se da
  const visibleDays = useMemo(() => (isFiltered ? weekDays.filter((d) => eventsByDay[dayKey(d)]) : weekDays), [isFiltered, weekDays, eventsByDay]);

  useEffect(() => {
    if (!isFiltered || visibleDays.length === 0) return;
    if (!visibleDays.some((d) => isSameDay(d, selectedDate))) setSelectedDate(visibleDays[0]);
  }, [isFiltered, visibleDays, selectedDate]);


  const handlePrevWeek = () => {
    const prev = subDays(weekStart, 7);
    if (!isBefore(addDays(prev, 6), today)) { setWeekStart(prev); setSelectedDate(isBefore(prev, today) ? today : prev); }
  };
  const handleNextWeek = () => {
    if (isBefore(weekStart, addMonths(today, 2))) { const next = addDays(weekStart, 7); setWeekStart(next); setSelectedDate(next); }
  };

  const handleBook = useCallback((event: CalendarEvent) => {
    if (event.end < new Date()) return;
    if (event.resource.available_seats <= 0) {
      toaster.create({ title: t('cart.full'), type: 'error', duration: 2000 });
      return;
    }
    onSelectEvent(event);
    addToCart(cartItemFromSession(event.resource, event.start, event.end));
  }, [onSelectEvent, t]);

  const handleWaitlist = useCallback(async (event: CalendarEvent) => {
    const r = event.resource;
    const key = sessionKey(r.source_id, r.start_datetime);
    setWlBusy(event.id);
    const res = await joinWaitlist(Number(r.source_id), r.start_datetime);
    setWlBusy(null);
    switch (res.kind) {
      case 'joined':
        setWaitlist((w) => ({ ...w, [key]: res.entry }));
        toaster.create({ title: tx.wlJoined(res.entry.position), type: 'success', duration: 4000 });
        break;
      case 'login':
        toaster.create({
          title: tx.wlLogin, type: 'info', duration: 6000,
          action: { label: tx.wlLoginBtn, onClick: () => window.location.assign(loginUrl()) },
        });
        break;
      case 'has_space':
        // Alguien ha cancelado mientras miraba: que la reserve directamente
        toaster.create({ title: tx.wlSpace, type: 'success', duration: 3000 });
        onSelectEvent(event);
        addToCart(cartItemFromSession(r, event.start, event.end));
        break;
      case 'already_waiting':
        toaster.create({ title: tx.wlAlready, type: 'info', duration: 3500 });
        loadWaitlist();
        break;
      case 'already_booked':
        setMine((m) => ({ ...m, [key]: true }));
        toaster.create({ title: tx.wlBooked, type: 'info', duration: 3500 });
        break;
      default:
        toaster.create({ title: res.message || tx.wlNo, type: 'error', duration: 4500 });
    }
  }, [tx, onSelectEvent, loadWaitlist]);

  const isPrevDisabled = isBefore(weekStart, addDays(today, 1));
  const nextAfterSelected = upcomingDays.find((d) => isBefore(selectedDate, d) && !isSameDay(d, selectedDate)) || null;
  const nextDayAfterWeek = upcomingDays.find((d) => !isBefore(d, addDays(weekStart, 7))) || null;
  const range = `${format(weekStart, 'd MMM', { locale })} – ${format(addDays(weekStart, 6), 'd MMM', { locale })}`;
  const dayTitle = lang === 'es' ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : format(selectedDate, 'EEEE, MMMM d', { locale: enUS });

  return (
    <div className={`w-cal${compact ? ' w-cal--compact' : ''}`}>
      <Toaster />

      {/* ── Semana: rango, anterior / siguiente, hoy y elegir fecha ── */}
      <div className="w-cal-bar">
        <p className="w-cal-range" aria-live="polite">{range}</p>
        <div className="w-cal-ctrl">
          <button type="button" className="w-cal-ib" aria-label={t('calendar.prevWeek')} disabled={isPrevDisabled} onClick={handlePrevWeek}>
            <Icon name="chevron-left" size={14} aria-hidden />
          </button>
          {!compact && (
            <button type="button" className="w-cal-pill" onClick={() => goToDay(today)}>{tx.today}</button>
          )}
          <div className="w-cal-pick" ref={pickerRef}>
            <button type="button" className="w-cal-ib" aria-label={tx.pick} aria-expanded={showPicker} onClick={() => setShowPicker((v) => !v)}>
              <Icon name="calendar" size={14} aria-hidden />
            </button>
            {showPicker && (
              <div className="sk-panel w-cal-pop" role="dialog" aria-label={tx.pick}>
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { goToDay(d); setShowPicker(false); } }}
                  locale={locale}
                  disabled={[{ before: today }, { after: addMonths(today, 2) }]}
                  weekStartsOn={1}
                  showOutsideDays={false}
                  style={{
                    '--rdp-accent-color': 'var(--accent)',
                    '--rdp-accent-background-color': 'var(--accent-soft)',
                    fontSize: '14px',
                  } as React.CSSProperties}
                />
              </div>
            )}
          </div>
          <button type="button" className="w-cal-ib" aria-label={t('calendar.nextWeek')} onClick={handleNextWeek}>
            <Icon name="chevron-right" size={14} aria-hidden />
          </button>
        </div>
      </div>

      {showGuideHint && (
        <a className="w-card w-cal-guide" href={`${t('nav.items.classes.href') || '/classes'}#guia`}>
          <span><b>{tx.guideQ}</b><small>{tx.guideA}</small></span>
          <span className="w-btn w-btn--sm sk-btn">{tx.guideBtn}</span>
        </a>
      )}

      {isFiltered && !loading && upcomingDays.length > 0 && <p className="w-cal-hint">{t('calendar.onlyDaysHint')}</p>}

      {isFiltered && !loading && upcomingDays.length === 0 ? (
        <div className="w-cal-empty">
          <Icon name="calendar" size={22} aria-hidden />
          <b>{t('calendar.noUpcomingTitle')}</b>
          <span>{t('calendar.noUpcomingDesc')}</span>
        </div>
      ) : (
        <>
          {/* ── Tira de la semana ── */}
          {isFiltered && !loading && visibleDays.length === 0 ? (
            <div className="w-cal-note">
              <span>{t('calendar.noDatesThisWeek')}</span>
              {nextDayAfterWeek && (
                <button type="button" className="w-btn w-btn--sm sk-btn" onClick={() => goToDay(nextDayAfterWeek)}>
                  {t('calendar.nextDate')} {format(nextDayAfterWeek, lang === 'es' ? 'EEEE d MMM' : 'EEEE, MMM d', { locale })}
                </button>
              )}
            </div>
          ) : (
            <div className="w-cal-week" role="tablist" aria-label={range} style={isFiltered ? { gridTemplateColumns: `repeat(${Math.max(visibleDays.length, 1)}, minmax(0, 1fr))` } : undefined}>
              {visibleDays.map((day) => {
                const active = isSameDay(day, selectedDate);
                const past = isBefore(day, today);
                const n = eventsByDay[dayKey(day)] || 0;
                return (
                  <button key={day.toISOString()} type="button" role="tab" aria-selected={active}
                    className={`w-cal-day${active ? ' is-on' : ''}${isSameDay(day, today) ? ' is-today' : ''}`}
                    disabled={past} onClick={() => setSelectedDate(day)}
                    aria-label={`${format(day, 'EEEE d MMMM', { locale })}${n ? ` · ${n}` : ''}`}>
                    <small>{format(day, 'EEE', { locale }).replace('.', '').slice(0, 3)}</small>
                    <b>{format(day, 'd')}</b>
                    <i aria-hidden className={n && !loading ? 'has' : ''} />
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Lista del día ── */}
          {!(isFiltered && !loading && visibleDays.length === 0) && (
            <div className="w-cal-daybox" role="tabpanel">
              <p className="w-cal-dayname">
                <span>{dayTitle}</span>
                {!loading && dayEvents.length > 0 && <span className="w-chip">{dayEvents.length} {dayEvents.length === 1 ? t('calendar.classCount_one') : t('calendar.classCount_other')}</span>}
              </p>
              {loading ? (
                <ul className="w-cal-list" aria-busy="true" aria-label={t('calendar.loading')}>
                  {[0, 1, 2].map((i) => <li key={i} className="w-skel" />)}
                </ul>
              ) : dayEvents.length === 0 ? (
                <div className="w-cal-empty">
                  <Icon name="calendar" size={22} aria-hidden />
                  <b>{t('calendar.noClasses')}</b>
                  {nextAfterSelected && (
                    <button type="button" className="w-btn w-btn--sm sk-btn-ghost" onClick={() => goToDay(nextAfterSelected)}>
                      {tx.nextDay} <Icon name="arrow-right" size={12} aria-hidden />
                    </button>
                  )}
                </div>
              ) : (
                <ul className="w-cal-list">
                  {dayEvents.map((event) => (
                    <SessionRow key={event.id} event={event} onBook={handleBook} onWaitlist={handleWaitlist}
                      entry={event.resource.type === 'EVENT' ? undefined : waitlist[sessionKey(event.resource.source_id, event.resource.start_datetime)]}
                      mine={!!mine[sessionKey(event.resource.source_id, event.resource.start_datetime)]}
                      busy={wlBusy === event.id} hideDetailLink={hideDetailLink} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
