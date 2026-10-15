// Calendario en el móvil: tira de la semana con puntos de colores y la
// agenda del día (con separador «Ahora»), deslizando para cambiar de día.
// En la vista Semana, la semana entera como lista por días.
import { Fragment, useRef, type CSSProperties } from 'react';
import RepeatIcon from '@mui/icons-material/Repeat';
import BlockIcon from '@mui/icons-material/Block';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type { CalendarData, Occurrence } from './types';
import type { ClassTone } from './classColors';
import { D1, DAYS, addDays, dayNum, m2t, minOf, startOfWeek, weekdayOf } from './dates';
import { occLabel } from './helpers';

interface Props {
  view: 'day' | 'week';
  anchor: string;
  occurrences: Occurrence[];
  closedDays: CalendarData['closed_days'];
  today: string;
  nowMin: number;
  tone: (o: Occurrence) => ClassTone;
  onOpen: (o: Occurrence) => void;
  onPickDay: (date: string) => void;
}

function Item({ o, tone, onOpen }: { o: Occurrence; tone: ClassTone; onOpen: (o: Occurrence) => void }) {
  const full = o.booked >= o.capacity && !o.canceled;
  return (
    <button type="button" className={`kc-ag ${o.canceled ? 'cancel' : ''} ${o.past ? 'past' : ''}`}
      style={{ '--ct': tone.tint, '--cd': tone.dot } as CSSProperties} onClick={() => onOpen(o)} aria-label={occLabel(o)} data-tour="cal-event">
      <span className="tm" aria-hidden="true"><b>{o.start.slice(11)}</b><small>{o.duration} min</small></span>
      <span className="bd" aria-hidden="true">
        <b>
          {o.title}
          {o.recurring && <RepeatIcon sx={{ fontSize: 16, opacity: 0.7 }} />}
          {o.canceled ? <span className="kc-tag">Cancelada</span> : o.blackout ? <span className="kc-tag">Cerrada</span> : full ? <span className="kc-tag full">Llena</span> : null}
        </b>
        <small>{o.instructor ? `con ${o.instructor.name} · ` : ''}{o.room.name}</small>
        <span className="occ">
          <span className="kc-bar-i"><i style={{ width: `${Math.min(100, (o.booked / Math.max(1, o.capacity)) * 100)}%` }} /></span>
          <b style={{ fontSize: '.88rem' }}>{o.booked}/{o.capacity}</b>
          {o.waitlist > 0 && !o.canceled && <span className="kc-wl"><HourglassEmptyIcon sx={{ fontSize: 12, verticalAlign: '-2px' }} />+{o.waitlist}</span>}
        </span>
      </span>
      <ChevronRightIcon sx={{ opacity: 0.6 }} aria-hidden="true" />
    </button>
  );
}

export default function MobileAgenda({ view, anchor, occurrences, closedDays, today, nowMin, tone, onOpen, onPickDay }: Props) {
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const of = (d: string) => occurrences.filter((o) => o.date === d).sort((a, b) => a.start.localeCompare(b.start));
  const touch = useRef<{ x: number; y: number } | null>(null);

  const closedBox = (d: string) => (
    <div className="kc-ag-closed"><BlockIcon fontSize="small" /> Cerrado · {closedDays[d].reason || 'festivo'}</div>
  );

  if (view === 'week') {
    return (
      <div className="kc-agenda">
        {week.map((d) => (
          <Fragment key={d}>
            <h3 style={{ margin: '10px 4px 0', fontSize: '.8rem', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--k-muted)' }}>
              {DAYS[weekdayOf(d)]} {dayNum(d)}{d === today ? ' · hoy' : ''}
            </h3>
            {closedDays[d] ? closedBox(d) : of(d).length ? of(d).map((o) => <Item key={o.id} o={o} tone={tone(o)} onOpen={onOpen} />)
              : <p style={{ margin: '0 4px', color: 'var(--k-muted)' }}>Sin clases</p>}
          </Fragment>
        ))}
      </div>
    );
  }

  const list = closedDays[anchor] ? [] : of(anchor);
  let nowShown = false;
  return (
    <>
      <div className="kc-strip" role="tablist" aria-label="Día de la semana">
        {week.map((d) => {
          const n = of(d);
          const types = [...new Map(n.map((o) => [o.class_type.id, o])).values()].slice(0, 3);
          return (
            <button key={d} type="button" role="tab" aria-selected={d === anchor} className={d === today ? 'today' : ''}
              onClick={() => onPickDay(d)}
              aria-label={`${DAYS[weekdayOf(d)]} ${dayNum(d)}${closedDays[d] ? ', cerrado' : `, ${n.length} clases`}`}>
              <small>{D1[weekdayOf(d)]}</small>{dayNum(d)}
              <span className="d" aria-hidden="true">
                {!closedDays[d] && types.map((o) => <i key={o.class_type.id} style={{ background: tone(o).dot }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="kc-agenda"
        aria-live="polite"
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const t0 = touch.current;
          touch.current = null;
          if (!t0) return;
          const dx = e.changedTouches[0].clientX - t0.x;
          const dy = e.changedTouches[0].clientY - t0.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onPickDay(addDays(anchor, dx < 0 ? 1 : -1));
        }}
      >
        {closedDays[anchor] ? closedBox(anchor) : list.length ? list.map((o, i) => {
          const showNow = anchor === today && !nowShown && minOf(o.start) > nowMin && (i === 0 || minOf(list[i - 1].start) <= nowMin);
          if (showNow) nowShown = true;
          return (
            <Fragment key={o.id}>
              {showNow && <div className="kc-nowsep" role="separator" aria-label={`Ahora, ${m2t(nowMin)}`}><span>Ahora · {m2t(nowMin)}</span></div>}
              <Item o={o} tone={tone(o)} onOpen={onOpen} />
            </Fragment>
          );
        }) : <p style={{ padding: '20px 4px', color: 'var(--k-muted)', margin: 0 }}>Sin clases este día.</p>}
      </div>
      <p style={{ textAlign: 'center', marginTop: 12, fontSize: '.8rem', color: 'var(--k-muted)' }}>Desliza para cambiar de día</p>
    </>
  );
}
