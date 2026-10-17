// Rejilla de horas del calendario: vista Semana (7 días) y Día (una columna
// por sala). CSS grid propio (las vistas por sala de FullCalendar son de pago):
// cabeceras y columna de horas fijas, hoy resaltado, línea de «ahora», horas
// sin clases plegadas, clases solapadas en paralelo y arrastrar para mover o
// crear (pointer events, ajuste a 15 min).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Paper, Popper, Stack, Typography } from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import BlockIcon from '@mui/icons-material/Block';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import type { Blackout, CalendarData, Occurrence } from './types';
import type { ClassTone } from './classColors';
import { DAYS, DS, dayNum, initials, m2t, minOf, weekdayOf } from './dates';
import { occLabel, occupancyPct } from './helpers';

export interface Column {
  key: string;
  date: string;
  roomId?: number;
}

export interface MoveTarget { date: string; startMin: number; roomId?: number }
export interface NewSlot { date: string; startMin: number; endMin: number; roomId?: number }

interface Props {
  view: 'day' | 'week';
  columns: Column[];
  occurrences: Occurrence[];
  closedDays: CalendarData['closed_days'];
  blackouts: Blackout[];
  rooms: { id: number; name: string; capacity: number }[];
  today: string;
  nowMin: number;
  compact: boolean;
  onToggleCompact: () => void;
  tone: (o: Occurrence) => ClassTone;
  onOpen: (o: Occurrence) => void;
  onMove: (o: Occurrence, to: MoveTarget) => void;
  onCreate: (slot: NewSlot) => void;
  onBlocked: (msg: string) => void;
  footer?: ReactNode;
}

const HH = 56; // px por hora
const BAND = 30; // alto de una franja plegada
const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

interface Seg { a: number; b: number; c: boolean }
interface Laid { o: Occurrence; s: number; e: number; lane: number; lanes: number }

const span = (o: Occurrence) => {
  const s = minOf(o.start);
  return { s, e: Math.min(24 * 60, s + Math.max(o.duration, 15)) };
};

function buildSegs(list: { s: number; e: number }[], compact: boolean): Seg[] {
  let lo = 7 * 60;
  let hi = 22 * 60;
  for (const o of list) {
    lo = Math.min(lo, Math.floor(o.s / 60) * 60);
    hi = Math.max(hi, Math.ceil(o.e / 60) * 60);
  }
  hi = Math.min(hi, 24 * 60);
  if (!compact || !list.length) return [{ a: lo, b: hi, c: false }];
  const hours: boolean[] = [];
  for (let h = lo / 60; h < hi / 60; h++) hours.push(list.some((o) => o.s < (h + 1) * 60 && o.e > h * 60));
  const first = hours.indexOf(true);
  const last = hours.lastIndexOf(true);
  const base = lo / 60;
  const segs: Seg[] = [];
  let h = first;
  while (h <= last) {
    let k = h;
    const v = hours[h];
    while (k <= last && hours[k] === v) k++;
    if (!v && k - h >= 2) segs.push({ a: (base + h) * 60, b: (base + k) * 60, c: true });
    else {
      const p = segs[segs.length - 1];
      if (p && !p.c) p.b = (base + k) * 60;
      else segs.push({ a: (base + h) * 60, b: (base + k) * 60, c: false });
    }
    h = k;
  }
  return segs;
}

function makeScale(segs: Seg[]) {
  const yOf = (m: number) => {
    let y = 0;
    for (const s of segs) {
      if (m <= s.a) return y;
      if (m < s.b) return y + (s.c ? (BAND * (m - s.a)) / (s.b - s.a) : ((m - s.a) / 60) * HH);
      y += s.c ? BAND : ((s.b - s.a) / 60) * HH;
    }
    return y;
  };
  const mOf = (y: number) => {
    let acc = 0;
    for (const s of segs) {
      const h = s.c ? BAND : ((s.b - s.a) / 60) * HH;
      if (y < acc + h) return s.c ? s.a : s.a + ((y - acc) / HH) * 60;
      acc += h;
    }
    return segs[segs.length - 1].b;
  };
  return { yOf, mOf, start: segs[0].a, end: segs[segs.length - 1].b };
}

function layoutLanes(list: { o: Occurrence; s: number; e: number }[]): Laid[] {
  const sorted = [...list].sort((a, b) => a.s - b.s || a.o.room.name.localeCompare(b.o.room.name));
  const out: Laid[] = [];
  let group: Laid[] = [];
  let end = -1;
  const flush = () => {
    const lanes: number[] = [];
    for (const g of group) {
      let l = lanes.findIndex((x) => x <= g.s);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = g.e;
      g.lane = l;
    }
    for (const g of group) g.lanes = lanes.length;
    out.push(...group);
  };
  for (const it of sorted) {
    if (group.length && it.s >= end) { flush(); group = []; end = -1; }
    group.push({ ...it, lane: 0, lanes: 1 });
    end = Math.max(end, it.e);
  }
  if (group.length) flush();
  return out;
}

interface Drag {
  kind: 'move' | 'create';
  o?: Occurrence;
  colKey: string;
  x0: number;
  y0: number;
  grab: number;
  m0: number;
  started: boolean;
}
interface Ghost { colKey: string; s: number; e: number; o?: Occurrence; label: string }

export default function WeekGrid(props: Props) {
  const {
    view, columns, occurrences, closedDays, blackouts, rooms, today, nowMin, compact, onToggleCompact,
    tone, onOpen, onMove, onCreate, onBlocked, footer,
  } = props;

  const byCol = useMemo(() => {
    const map = new Map<string, { o: Occurrence; s: number; e: number }[]>();
    for (const c of columns) map.set(c.key, []);
    for (const o of occurrences) {
      if (closedDays[o.date] && !o.canceled) continue; // festivo: no se pintan (están cerradas)
      for (const c of columns) {
        if (c.date === o.date && (c.roomId == null || c.roomId === o.room.id)) map.get(c.key)!.push({ o, ...span(o) });
      }
    }
    return map;
  }, [columns, occurrences, closedDays]);

  const segs = useMemo(() => buildSegs([...byCol.values()].flat(), compact), [byCol, compact]);
  const scale = useMemo(() => makeScale(segs), [segs]);
  const { yOf, mOf } = scale;
  const totalH = yOf(scale.end);

  // ── Arrastrar ──
  const colEls = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const showGhost = useCallback((g: Ghost | null) => { ghostRef.current = g; setGhost(g); }, []);
  const [hover, setHover] = useState<{ el: HTMLElement; o: Occurrence } | null>(null);
  const live = useRef({ scale, columns, closedDays, onMove, onCreate });
  live.current = { scale, columns, closedDays, onMove, onCreate };

  const colAt = (x: number) => {
    for (const [key, el] of colEls.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x < r.right) return { key, el };
    }
    return null;
  };
  const roomName = useCallback((id?: number) => rooms.find((r) => r.id === id)?.name || '', [rooms]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.started && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    const { scale: sc, columns: cols, closedDays: closed } = live.current;
    if (!d.started) { d.started = true; document.body.classList.add('kc-dragging'); setHover(null); }
    if (d.kind === 'move' && d.o) {
      const hit = colAt(e.clientX) || { key: d.colKey, el: colEls.current.get(d.colKey)! };
      const col = cols.find((c) => c.key === hit.key);
      if (!col || closed[col.date]) return;
      const dur = Math.max(d.o.duration, 15);
      const top = hit.el.getBoundingClientRect().top;
      const st = Math.max(sc.start, Math.min(sc.end - dur, snap(sc.mOf(e.clientY - d.grab - top))));
      showGhost({
        colKey: col.key, s: st, e: st + dur, o: d.o,
        label: `${DS[weekdayOf(col.date)]} ${dayNum(col.date)} · ${m2t(st)}–${m2t(st + dur)}${col.roomId ? ` · ${roomName(col.roomId)}` : ''}`,
      });
    } else {
      const el = colEls.current.get(d.colKey);
      if (!el) return;
      const m = snap(sc.mOf(e.clientY - el.getBoundingClientRect().top));
      const m1 = Math.max(d.m0 + 30, Math.min(sc.end, m));
      showGhost({ colKey: d.colKey, s: d.m0, e: m1, label: `${m2t(d.m0)} – ${m2t(m1)}` });
    }
  }, [roomName, showGhost]);

  const finish = useCallback((cancel = false) => {
    window.removeEventListener('pointermove', onPointerMove);
    document.body.classList.remove('kc-dragging');
    const d = drag.current;
    drag.current = null;
    const g = ghostRef.current;
    showGhost(null);
    if (!d || cancel) return;
    const { columns: cols, onMove: mv, onCreate: cr } = live.current;
    if (d.kind === 'move' && d.o) {
      if (!d.started || !g) return;
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 60);
      const col = cols.find((c) => c.key === g.colKey);
      if (!col) return;
      const same = col.date === d.o.date && g.s === minOf(d.o.start) && (col.roomId == null || col.roomId === d.o.room.id);
      if (!same) mv(d.o, { date: col.date, startMin: g.s, roomId: col.roomId });
    } else {
      const col = cols.find((c) => c.key === d.colKey);
      if (!col) return;
      cr({ date: col.date, startMin: g ? g.s : d.m0, endMin: g ? g.e : d.m0 + 60, roomId: col.roomId });
    }
  }, [onPointerMove, showGhost]);

  useEffect(() => {
    const up = () => finish();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) finish(true); };
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [finish, onPointerMove]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const target = e.target as HTMLElement;
    const colEl = target.closest<HTMLElement>('[data-col]');
    if (!colEl) return;
    const colKey = colEl.dataset.col!;
    const col = columns.find((c) => c.key === colKey);
    if (!col) return;
    const evEl = target.closest<HTMLElement>('[data-ev]');
    if (evEl) {
      const o = occurrences.find((x) => x.id === evEl.dataset.ev);
      if (!o || o.started || o.canceled || o.kind === 'event' || o.blackout) return;
      drag.current = { kind: 'move', o, colKey, x0: e.clientX, y0: e.clientY, grab: e.clientY - evEl.getBoundingClientRect().top, m0: 0, started: false };
    } else {
      if (closedDays[col.date]) { onBlocked(`Ese día está cerrado: ${closedDays[col.date].reason || 'festivo'}.`); return; }
      const top = colEl.getBoundingClientRect().top;
      const m = Math.max(scale.start, Math.min(scale.end - 60, snap(mOf(e.clientY - top) - 15)));
      if (col.date < today || (col.date === today && m < nowMin)) { onBlocked('Esa hora ya ha pasado.'); return; }
      drag.current = { kind: 'create', colKey, x0: e.clientX, y0: e.clientY, grab: 0, m0: m, started: false };
      e.preventDefault();
    }
    window.addEventListener('pointermove', onPointerMove);
  };

  // ── Vista previa al pasar el ratón ──
  const hoverT = useRef<number | undefined>(undefined);
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  const enter = (el: HTMLElement, o: Occurrence) => {
    if (!canHover || drag.current) return;
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(() => setHover({ el, o }), 350);
  };
  const leave = () => { window.clearTimeout(hoverT.current); setHover(null); };
  useEffect(() => () => window.clearTimeout(hoverT.current), []);

  // ── Scroll inicial a primera hora con clases ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstMin = useMemo(() => Math.min(...[...byCol.values()].flat().map((x) => x.s), 8 * 60), [byCol]);
  useEffect(() => {
    if (scrollRef.current && !compact) scrollRef.current.scrollTop = Math.max(0, yOf(firstMin) - 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, compact]);

  const hours: number[] = [];
  segs.forEach((s) => { if (!s.c) for (let h = s.a / 60; h < s.b / 60; h++) hours.push(h); });
  const nowVisible = nowMin > scale.start && nowMin < scale.end;
  const showNowT = nowVisible && columns.some((c) => c.date === today);

  const header = (c: Column) => {
    const list = (byCol.get(c.key) || []).map((x) => x.o);
    if (view === 'day') {
      const room = rooms.find((r) => r.id === c.roomId);
      return (
        <div className="kc-dh" role="columnheader" key={c.key}>
          <b className="rm">{room?.name || 'Sala'}</b>
          <span className="kc-sum">{room ? `${room.capacity} plazas · ` : ''}{list.length} clase{list.length === 1 ? '' : 's'}</span>
        </div>
      );
    }
    const isToday = c.date === today;
    const closed = closedDays[c.date];
    const live2 = list.filter((o) => !o.canceled);
    return (
      <div className={`kc-dh ${isToday ? 'today' : ''}`} role="columnheader" key={c.key}
        aria-label={`${DAYS[weekdayOf(c.date)]} ${dayNum(c.date)}${isToday ? ', hoy' : ''}${closed ? ', cerrado' : ''}`}>
        <small>{DS[weekdayOf(c.date)]}</small>
        <b>{dayNum(c.date)}</b>
        <span className="kc-sum">
          {closed ? (closed.reason || 'Cerrado') : live2.length ? `${live2.length} clase${live2.length > 1 ? 's' : ''} · ${occupancyPct(live2)}%` : 'Sin clases'}
        </span>
      </div>
    );
  };

  const shades = (c: Column) => {
    if (closedDays[c.date]) return null;
    const d0 = `${c.date}T00:00`;
    const d1 = `${c.date}T24:00`;
    return blackouts
      .filter((b) => b.start < d1 && b.end > d0)
      .map((b) => {
        const s = b.start <= d0 ? 0 : minOf(b.start);
        const e = b.end >= d1 ? 24 * 60 : minOf(b.end);
        const top = yOf(Math.max(s, scale.start));
        const h = yOf(Math.min(e, scale.end)) - top;
        if (h <= 0) return null;
        return (
          <div className="kc-shade" key={`b${b.id}`} style={{ top, height: h }} aria-hidden="true">
            <span>{b.reason || 'Cerrado'}</span>
          </div>
        );
      });
  };

  const block = (it: Laid) => {
    const { o } = it;
    const t = tone(o);
    const full = o.booked >= o.capacity && !o.canceled;
    const top = yOf(it.s) + 1;
    const h = Math.max(20, yOf(it.e) - yOf(it.s) - 3);
    const cls = ['kc-ev', o.past ? 'past' : '', o.canceled ? 'cancel' : '', o.blackout ? 'blocked' : '',
      o.kind === 'event' ? 'event' : '', ghost?.o?.id === o.id ? 'dragging' : ''].join(' ');
    const style = {
      top, height: h,
      left: `calc(${(it.lane / it.lanes) * 100}% + 3px)`, width: `calc(${100 / it.lanes}% - 6px)`,
      '--ct': t.tint, '--cd': t.dot,
    } as CSSProperties;
    const tag = o.canceled ? 'Cancelada' : o.blackout ? (o.blackout.kind === 'private' ? 'Privada' : 'Cerrada') : full ? 'Llena' : '';
    return (
      <button
        key={o.id}
        type="button"
        className={cls}
        style={style}
        data-ev={o.id}
        data-tour="cal-event"
        aria-label={occLabel(o)}
        onClick={() => { if (!suppressClick.current) { leave(); onOpen(o); } }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && enter(e.currentTarget, o)}
        onPointerLeave={leave}
      >
        <span className="l1" aria-hidden="true">
          <span className="n">{o.title}</span>
          {o.recurring && <span className="rep" title="Se repite cada semana"><RepeatIcon /></span>}
          <span className="sp" />
          {tag && <span className={`kc-tag ${full && !o.canceled && !o.blackout ? 'full' : ''}`}>{tag}</span>}
        </span>
        {h > 34 && (
          <span className="l2" aria-hidden="true">
            {o.instructor && <span className="tav">{initials(o.instructor.name)}</span>}
            <span className="t">{o.start.slice(11)}</span>
            <span className="sp" />
            {o.waitlist > 0 && !o.canceled && <span className="kc-wl">+{o.waitlist}</span>}
            <b className="o">{o.booked}/{o.capacity}</b>
          </span>
        )}
        <i className="kc-evbar" aria-hidden="true"><i style={{ width: `${Math.min(100, (o.booked / Math.max(1, o.capacity)) * 100)}%` }} /></i>
      </button>
    );
  };

  return (
    <>
      <div className="kc-wrap">
        <div className="kc-scroll" ref={scrollRef}>
          <div
            className="kc-grid"
            style={{ '--cols': columns.length, '--colw': view === 'day' ? '220px' : '116px', gridTemplateRows: `auto ${totalH}px` } as CSSProperties}
            role="grid"
            aria-label={view === 'day' ? 'Calendario del día por salas' : 'Calendario semanal'}
            onPointerDown={onPointerDown}
          >
            <div className="kc-corner" aria-hidden="true" />
            {columns.map(header)}
            <div className="kc-hours" aria-hidden="true">
              {hours.map((h, i) => (
                <span key={h} className={i === 0 ? 'first' : ''} style={{ top: yOf(h * 60) }}>{String(h).padStart(2, '0')}:00</span>
              ))}
              {showNowT && <span className="now-t" style={{ top: yOf(nowMin) }}>{m2t(nowMin)}</span>}
            </div>
            {columns.map((c, ci) => {
              const closed = closedDays[c.date];
              const laid = layoutLanes(byCol.get(c.key) || []);
              return (
                <div
                  key={c.key}
                  ref={(el) => { if (el) colEls.current.set(c.key, el); else colEls.current.delete(c.key); }}
                  className={`kc-col ${c.date === today && view === 'week' ? 'today' : ''} ${closed ? 'closed' : ''}`}
                  style={{ gridColumn: ci + 2 }}
                  data-col={c.key}
                >
                  <div className="kc-lines" aria-hidden="true">
                    {segs.map((s) => (
                      <div key={`${s.a}`} className={s.c ? 'kc-bandbg' : 'kc-seg'}
                        style={{ top: yOf(s.a), height: s.c ? BAND : ((s.b - s.a) / 60) * HH }} />
                    ))}
                  </div>
                  {closed && (
                    <div className="kc-closed-lbl">
                      <BlockIcon fontSize="small" />
                      <b>Cerrado</b>
                      <span>{closed.reason || (closed.kind === 'vacation' ? 'Vacaciones o festivo' : 'Cierre')}</span>
                    </div>
                  )}
                  {shades(c)}
                  {laid.map(block)}
                  {ghost && ghost.colKey === c.key && (
                    ghost.o ? (
                      <div className="kc-ghost" aria-hidden="true"
                        style={{ top: yOf(ghost.s) + 1, height: Math.max(20, yOf(ghost.e) - yOf(ghost.s) - 3), left: 3, right: 3,
                          '--ct': tone(ghost.o).tint, '--cd': tone(ghost.o).dot } as CSSProperties}>
                        <span className="kc-tip">{ghost.label}</span>
                        {ghost.o.title}
                      </div>
                    ) : (
                      <div className="kc-ghost new" aria-hidden="true"
                        style={{ top: yOf(ghost.s), height: Math.max(20, yOf(ghost.e) - yOf(ghost.s) - 2), left: 3, right: 3 }}>
                        <span className="kc-tip">{ghost.label}</span>
                        + Nueva clase
                      </div>
                    )
                  )}
                  {c.date === today && nowVisible && <div className="kc-now" style={{ top: yOf(nowMin) }} aria-hidden="true" />}
                </div>
              );
            })}
            {segs.filter((s) => s.c).map((s) => (
              <button key={`band${s.a}`} type="button" className="kc-band" onClick={onToggleCompact}
                style={{ marginTop: yOf(s.a), height: BAND }} aria-label={`Mostrar de ${m2t(s.a)} a ${m2t(s.b)}`}>
                <ExpandMoreIcon sx={{ fontSize: 16 }} /> {m2t(s.a)} – {m2t(s.b)} · sin clases
              </button>
            ))}
          </div>
        </div>
      </div>
      {footer}
      <Popper open={!!hover} anchorEl={hover?.el} placement="right-start" sx={{ zIndex: 1300, pointerEvents: 'none' }}
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }, { name: 'flip', options: { fallbackPlacements: ['left-start', 'bottom'] } }]}>
        {hover && <HoverCard o={hover.o} tone={tone(hover.o)} />}
      </Popper>
    </>
  );
}

function HoverCard({ o, tone }: { o: Occurrence; tone: ClassTone }) {
  return (
    <Paper elevation={6} sx={{ p: 1.75, maxWidth: 300, borderRadius: 3, border: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <span className="kc-dot" style={{ background: tone.dot, width: 12, height: 12 }} />
        <Typography sx={{ fontWeight: 700 }}>{o.title}</Typography>
        {!o.recurring && <Typography variant="caption" sx={{ px: 0.75, borderRadius: 1, bgcolor: 'action.hover' }}>Puntual</Typography>}
      </Stack>
      <Stack spacing={0.5} sx={{ fontSize: '.86rem', '& svg': { fontSize: 16, verticalAlign: '-3px', mr: 0.5, color: 'text.secondary' } }}>
        <span><AccessTimeIcon />{DAYS[weekdayOf(o.date)]} · {o.start.slice(11)}–{o.end.slice(11)}</span>
        <span><PersonOutlineIcon />{o.instructor?.name || 'Sin profesor'} · {o.room.name}</span>
        <span><GroupOutlinedIcon />{o.booked} de {o.capacity} plazas{o.waitlist ? ` · ${o.waitlist} en espera` : ''}</span>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {o.canceled ? 'Cancelada · clic para ver o reactivar' : `Clic para ver quién viene${o.started || o.kind === 'event' ? '' : ' · arrastra para mover'}`}
      </Typography>
    </Paper>
  );
}
