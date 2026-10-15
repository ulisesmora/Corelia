// Calendario del estudio (ruta /calendar): Día por salas, Semana y Mes; ficha
// de cada clase con quién viene, arrastrar para mover o crear, cancelar con
// devolución y lista de espera. La gestión clásica (lista de clases
// semanales, vacaciones y cierres, horario para imprimir) sigue en
// /calendar/horarios (pages/Payments.tsx).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Snackbar,
  Stack, Switch, ToggleButton, ToggleButtonGroup, Tooltip, Typography, alpha, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import RepeatIcon from '@mui/icons-material/Repeat';
import CheckIcon from '@mui/icons-material/Check';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import BeachAccessOutlinedIcon from '@mui/icons-material/BeachAccessOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import '../components/calendar/calendar-grid.css';
import WeekGrid, { type Column, type MoveTarget, type NewSlot } from '../components/calendar/WeekGrid';
import MonthView from '../components/calendar/MonthView';
import { monthGridRange, occupancyPct } from '../components/calendar/helpers';
import MobileAgenda from '../components/calendar/MobileAgenda';
import ClassDrawer, { type Toast } from '../components/calendar/ClassDrawer';
import ClassFormDialog, { type CreatePreset } from '../components/calendar/ClassFormDialog';
import MoveDialog from '../components/calendar/MoveDialog';
import { calendarApi, errorText } from '../components/calendar/api';
import { classTypeColor } from '../components/calendar/classColors';
import { addDays, addMonths, rangeLabel, startOfWeek, studioNow } from '../components/calendar/dates';
import type { CalendarData, Catalog, Filters, Occurrence, View } from '../components/calendar/types';
import { ClassTemplatesDialog, QuickRoomDialog } from '../onboarding';
import { useSite } from '../site/SiteProvider';
import { panelPalette } from '../theme';
import { HowItWorks } from '../onboarding/coach';
import { STUDIO_TZ } from '../site/timezone';

const LS_VIEW = 'kcView';
const LS_COMPACT = 'kcCompact';
const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

const EMPTY_CATALOG: Catalog = { rooms: [], instructors: [], class_types: [], has_schedule: true, waitlist: { enabled: true } };

export default function CalendarPage() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [now, setNow] = useState(() => studioNow(STUDIO_TZ));
  useEffect(() => {
    const id = window.setInterval(() => setNow(studioNow(STUDIO_TZ)), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const today = now.date;

  const [view, setViewState] = useState<View>(() => {
    const v = read(LS_VIEW, '');
    if (v === 'day' || v === 'week' || v === 'month') return v;
    return window.matchMedia?.('(max-width: 599px)').matches ? 'day' : 'week';
  });
  const setView = (v: View) => { setViewState(v); write(LS_VIEW, v); };
  const [anchor, setAnchor] = useState(today);
  const [compact, setCompact] = useState(() => read(LS_COMPACT, '1') === '1');
  const [full, setFull] = useState(false);
  const [filters, setFilters] = useState<Filters>({ room: 'all', instructor: 'all', hiddenTypes: [] });

  const [data, setData] = useState<CalendarData | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openOcc, setOpenOcc] = useState<Occurrence | null>(null);
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; preset?: CreatePreset | null; occurrence?: Occurrence | null } | null>(null);
  const [move, setMove] = useState<{ o: Occurrence; to: MoveTarget } | null>(null);
  const [prereq, setPrereq] = useState<'room' | 'class' | null>(null);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [filterEl, setFilterEl] = useState<{ el: HTMLElement; kind: 'room' | 'instructor' | 'all' } | null>(null);
  const [snack, setSnack] = useState<{ msg: string; undo?: () => Promise<void> | void; severity: 'success' | 'error' | 'info' | 'warning'; key: number } | null>(null);

  const toast: Toast = useCallback((msg, opts) => {
    setSnack({ msg, undo: opts?.undo, severity: opts?.severity || 'success', key: Date.now() });
  }, []);

  // Rango a pedir: la semana (Día y Semana) o la rejilla del mes
  const range = useMemo(() => {
    if (view === 'month') return monthGridRange(anchor);
    const s = startOfWeek(anchor);
    return { start: s, end: addDays(s, 6) };
  }, [view, anchor]);

  const reqId = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const id = ++reqId.current;
    if (!quiet) setLoading(true);
    try {
      const d = await calendarApi.range(range.start, range.end, true);
      if (id !== reqId.current) return;
      setData(d);
      if (d.catalog) setCatalog(d.catalog);
      setError('');
    } catch (e) {
      if (id === reqId.current) setError(errorText(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [range.start, range.end]);
  useEffect(() => { load(); }, [load]);

  // Al volver a la pestaña, datos frescos (otras personas reservan)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  // Enlaces de siempre (?accion=nueva desde Inicio)
  const accion = params.get('accion');
  useEffect(() => {
    if (accion !== 'nueva' || loading) return;
    startCreate({ date: today });
    setParams((p) => { const n = new URLSearchParams(p); n.delete('accion'); return n; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion, loading]);

  // Escape sale de pantalla completa
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !openOcc && !form && !move) setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, openOcc, form, move]);

  // Tintes de la paleta del estudio (design/tokens → cls): siguen al estilo y a la paleta
  const { config: siteConfig } = useSite();
  const palette = useMemo(() => panelPalette(siteConfig), [siteConfig]);
  const tone = useCallback((o: Occurrence) => classTypeColor(palette, o.class_type.id, o.class_type.title), [palette]);

  const visible = useMemo(() => (data?.occurrences || []).filter((o) =>
    (filters.room === 'all' || o.room.id === filters.room) &&
    (filters.instructor === 'all' || o.instructor?.id === filters.instructor) &&
    !filters.hiddenTypes.includes(o.class_type.id)), [data, filters]);

  const legendTypes = useMemo(() => {
    const m = new Map<number, Occurrence>();
    (data?.occurrences || []).forEach((o) => { if (!m.has(o.class_type.id)) m.set(o.class_type.id, o); });
    return [...m.values()].sort((a, b) => a.class_type.title.localeCompare(b.class_type.title));
  }, [data]);

  const columns: Column[] = useMemo(() => {
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => { const d = addDays(range.start, i); return { key: d, date: d }; });
    const rooms = catalog.rooms.filter((r) => filters.room === 'all' || r.id === filters.room);
    if (!rooms.length) return [{ key: anchor, date: anchor }];
    return rooms.map((r) => ({ key: `${anchor}-${r.id}`, date: anchor, roomId: r.id }));
  }, [view, range.start, anchor, catalog.rooms, filters.room]);

  const scope = view === 'day' ? visible.filter((o) => o.date === anchor)
    : view === 'week' ? visible.filter((o) => o.date >= range.start && o.date <= range.end) : [];
  const stat = `${scope.filter((o) => !o.canceled).length} clases · ${occupancyPct(scope)}%`;

  // ── Navegación ──
  const step = (dir: number) => {
    if (view === 'month') setAnchor(addMonths(anchor, dir));
    else setAnchor(addDays(anchor, view === 'week' ? 7 * dir : dir));
  };
  const pickDay = (d: string) => { setAnchor(d); if (view === 'month') setView('day'); };

  // ── Crear ──
  const startCreate = (preset?: CreatePreset | null) => {
    if (!catalog.rooms.length) { setPrereq('room'); return; }
    if (!catalog.class_types.length) { setPrereq('class'); return; }
    setForm({ mode: 'create', preset: preset || { date: anchor < today ? today : anchor } });
  };
  const onCreateSlot = (slot: NewSlot) => startCreate({ date: slot.date, startMin: slot.startMin, endMin: slot.endMin, roomId: slot.roomId });

  // ── Mover (arrastrar) ──
  const onMove = (o: Occurrence, to: MoveTarget) => setMove({ o, to });

  const empty = !loading && !error && !catalog.has_schedule;

  const cssVars = useMemo(() => {
    const p = theme.palette;
    const dark = p.mode === 'dark';
    const br = Number(theme.shape.borderRadius) || 12;
    return {
      '--k-p': p.primary.main,
      '--k-on-p': p.primary.contrastText,
      '--k-p-text': dark ? p.primary.light : p.primary.dark,
      '--k-surf': p.background.paper,
      '--k-surf2': `color-mix(in srgb, ${p.text.primary} 5%, ${p.background.paper})`,
      '--k-border': p.divider,
      '--k-border-strong': alpha(p.text.primary, 0.3),
      '--k-ink': p.text.primary,
      '--k-muted': p.text.secondary,
      '--k-bad': p.error.main,
      '--k-on-bad': p.error.contrastText,
      '--k-warn': dark ? p.warning.light : p.warning.dark,
      '--k-warn-soft': alpha(p.warning.main, 0.16),
      '--k-r': `${Math.round(br * 1.25)}px`,
      '--k-r-sm': `${br}px`,
      '--k-r-xs': `${Math.max(0, Math.round(br * 0.66))}px`,
      '--k-fh': String(theme.typography.h1.fontFamily || theme.typography.fontFamily),
    } as CSSProperties;
  }, [theme]);

  if (params.get('tab') || accion === 'preparar-mes' || accion === 'vacaciones') {
    return <Navigate to={`/calendar/horarios?${params.toString()}`} replace />;
  }

  const filterCount = Number(filters.room !== 'all') + Number(filters.instructor !== 'all') + Number(filters.hiddenTypes.length > 0);
  const roomName = filters.room === 'all' ? 'Todas las salas' : catalog.rooms.find((r) => r.id === filters.room)?.name || 'Sala';
  const instName = filters.instructor === 'all' ? 'Todas las profesoras' : catalog.instructors.find((i) => i.id === filters.instructor)?.name || 'Profesora';

  const toolbar = (
    <div className="kc-bar">
      <div className="kc-nav">
        <Button variant="outlined" size="small" onClick={() => setAnchor(today)} sx={{ borderRadius: 99, minWidth: 0, px: 2 }}>Hoy</Button>
        <IconButton onClick={() => step(-1)} aria-label={`${view === 'day' ? 'Día' : view === 'month' ? 'Mes' : 'Semana'} anterior`}><ChevronLeftIcon /></IconButton>
        <IconButton onClick={() => step(1)} aria-label={`${view === 'day' ? 'Día' : view === 'month' ? 'Mes' : 'Semana'} siguiente`}><ChevronRightIcon /></IconButton>
        <h2 className="kc-range" aria-live="polite">{rangeLabel(view, view === 'week' ? range.start : anchor)}</h2>
      </div>
      <div className="kc-filters" data-tour="cal-filters">
        {mobile ? (
          <button type="button" className="kc-chip" onClick={(e) => setFilterEl({ el: e.currentTarget, kind: 'all' })} aria-haspopup="menu">
            <FilterListIcon sx={{ fontSize: 18 }} /> Filtros{filterCount ? ` · ${filterCount}` : ''}
          </button>
        ) : (
          <>
            <button type="button" className="kc-chip" onClick={(e) => setFilterEl({ el: e.currentTarget, kind: 'room' })} aria-haspopup="menu">
              <MeetingRoomOutlinedIcon sx={{ fontSize: 18 }} /> {roomName} <ExpandMoreIcon sx={{ fontSize: 18 }} />
            </button>
            <button type="button" className="kc-chip" onClick={(e) => setFilterEl({ el: e.currentTarget, kind: 'instructor' })} aria-haspopup="menu">
              <PersonOutlineIcon sx={{ fontSize: 18 }} /> {instName} <ExpandMoreIcon sx={{ fontSize: 18 }} />
            </button>
          </>
        )}
        {view !== 'month' && <span className="kc-stat">{stat}</span>}
      </div>
      <ToggleButtonGroup className="kc-views" data-tour="cal-views" exclusive size="small" value={view} onChange={(_, v) => v && setView(v)} aria-label="Vista"
        sx={{ '& .MuiToggleButton-root': { px: 2, textTransform: 'none', fontWeight: 600 }, ...(mobile && { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }) }}>
        <ToggleButton value="day">Día</ToggleButton>
        <ToggleButton value="week">Semana</ToggleButton>
        <ToggleButton value="month">Mes</ToggleButton>
      </ToggleButtonGroup>
    </div>
  );

  const legend = (
    <div className="kc-foot">
      <div className="kc-legend" role="group" aria-label="Tipos de clase (pulsa para mostrar u ocultar)">
        {legendTypes.map((o) => {
          const on = !filters.hiddenTypes.includes(o.class_type.id);
          return (
            <button type="button" key={o.class_type.id} aria-pressed={on}
              onClick={() => setFilters((f) => ({ ...f, hiddenTypes: on ? [...f.hiddenTypes, o.class_type.id] : f.hiddenTypes.filter((x) => x !== o.class_type.id) }))}>
              <i className="kc-dot" style={{ background: tone(o).dot }} />{o.class_type.title}
            </button>
          );
        })}
      </div>
      {!mobile && (
        <span className="kc-help">
          <span><RepeatIcon sx={{ fontSize: 15 }} /> semanal</span>
          <span><span className="kc-wl">+2</span> en espera</span>
          <span>Arrastra para mover o crear</span>
          {!compact
            ? <button type="button" className="kc-link" onClick={() => { setCompact(true); write(LS_COMPACT, '1'); }}>Ocultar horas sin clases</button>
            : <button type="button" className="kc-link" onClick={() => { setCompact(false); write(LS_COMPACT, '0'); }}>Ver todas las horas</button>}
        </span>
      )}
    </div>
  );

  const body = loading && !data ? (
    <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>
  ) : error && !data ? (
    <Alert severity="error" action={<Button onClick={() => load()}>Reintentar</Button>}>{error}</Alert>
  ) : empty ? (
    <EmptyCalendar onCreate={() => startCreate()} onTemplates={() => setPrereq('class')} />
  ) : view === 'month' ? (
    <>
      <MonthView anchor={anchor} occurrences={visible} closedDays={data?.closed_days || {}} today={today} tone={tone} onPickDay={pickDay} />
      {legend}
    </>
  ) : mobile ? (
    <>
      <MobileAgenda view={view} anchor={anchor} occurrences={visible} closedDays={data?.closed_days || {}} today={today}
        nowMin={now.minutes} tone={tone} onOpen={setOpenOcc} onPickDay={setAnchor} />
      {legend}
    </>
  ) : (
    <WeekGrid
      view={view}
      columns={columns}
      occurrences={visible}
      closedDays={data?.closed_days || {}}
      blackouts={data?.blackouts || []}
      rooms={catalog.rooms}
      today={today}
      nowMin={now.minutes}
      compact={compact}
      onToggleCompact={() => { setCompact((c) => { write(LS_COMPACT, c ? '0' : '1'); return !c; }); }}
      tone={tone}
      onOpen={setOpenOcc}
      onMove={onMove}
      onCreate={onCreateSlot}
      onBlocked={(m) => toast(m, { severity: 'info' })}
      footer={legend}
    />
  );

  const page = (
    <Box className={`kc ${full ? 'kc-full' : ''}`} style={cssVars}
      sx={full ? { position: 'fixed', inset: 0, zIndex: 1250, bgcolor: 'background.default', overflow: 'auto', p: { xs: 1.5, md: 2.5 } } : { pb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2, mt: { xs: 0.5, md: 0 } }} data-tour="page-head">
        <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', flex: 'none' }} aria-hidden="true">
          <CalendarMonthOutlinedIcon />
        </Box>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, minWidth: 0 }}>Calendario</Typography>
        <HowItWorks page="calendar" />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Más opciones del horario">
          <IconButton onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Más opciones del horario" aria-haspopup="menu"><MoreHorizIcon /></IconButton>
        </Tooltip>
        {!mobile && (
          <Tooltip title={full ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}>
            <IconButton onClick={() => setFull((f) => !f)} aria-pressed={full} aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'}>
              {full ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        )}
        {!mobile && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => startCreate()} sx={{ borderRadius: 99, px: 2.5 }}>Crear clase</Button>
        )}
      </Stack>
      {!empty && toolbar}
      {error && data && <Alert severity="warning" sx={{ mb: 1.5 }} action={<Button onClick={() => load()}>Reintentar</Button>}>{error}</Alert>}
      {body}
      {mobile && !empty && (
        <button type="button" className="kc-fab" onClick={() => startCreate()} aria-label="Crear clase"><AddIcon fontSize="large" /></button>
      )}
    </Box>
  );

  return (
    <>
      {page}

      <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
        <MenuItem onClick={() => navigate('/calendar/horarios')}>
          <ListItemIcon><ListAltOutlinedIcon /></ListItemIcon>
          <ListItemText primary="Lista de clases semanales" secondary="Terminar una clase, cambiarla desde una fecha…" />
        </MenuItem>
        <MenuItem onClick={() => navigate('/calendar/horarios?tab=cierres')}>
          <ListItemIcon><BeachAccessOutlinedIcon /></ListItemIcon>
          <ListItemText primary="Vacaciones y cierres" secondary="Festivos, franjas cerradas, clases privadas" />
        </MenuItem>
        <MenuItem onClick={() => navigate('/calendar/horarios?tab=imprimir')}>
          <ListItemIcon><PrintOutlinedIcon /></ListItemIcon>
          <ListItemText primary="Horario para imprimir" />
        </MenuItem>
        <MenuItem onClick={() => { setMenuEl(null); setPrereq('class'); }}>
          <ListItemIcon><LayersOutlinedIcon /></ListItemIcon>
          <ListItemText primary="Añadir tipos de clase" secondary="Desde plantillas (Reformer, Mat, Yoga…)" />
        </MenuItem>
        <WaitlistToggle enabled={catalog.waitlist.enabled} onChanged={(v) => { setCatalog((c) => ({ ...c, waitlist: { enabled: v } })); toast(v ? 'Lista de espera activada.' : 'Lista de espera desactivada.'); }} />
      </Menu>

      <Menu anchorEl={filterEl?.el} open={!!filterEl} onClose={() => setFilterEl(null)}>
        {(filterEl?.kind === 'room' || filterEl?.kind === 'all') && [
          filterEl?.kind === 'all' && <Typography key="h1" variant="overline" sx={{ px: 2 }}>Sala</Typography>,
          <MenuItem key="r-all" selected={filters.room === 'all'} onClick={() => { setFilters((f) => ({ ...f, room: 'all' })); setFilterEl(null); }}>
            <ListItemIcon>{filters.room === 'all' && <CheckIcon />}</ListItemIcon>Todas las salas
          </MenuItem>,
          ...catalog.rooms.map((r) => (
            <MenuItem key={`r${r.id}`} selected={filters.room === r.id} onClick={() => { setFilters((f) => ({ ...f, room: r.id })); setFilterEl(null); }}>
              <ListItemIcon>{filters.room === r.id && <CheckIcon />}</ListItemIcon>{r.name}
            </MenuItem>
          )),
        ]}
        {(filterEl?.kind === 'instructor' || filterEl?.kind === 'all') && [
          filterEl?.kind === 'all' && <Typography key="h2" variant="overline" sx={{ px: 2, display: 'block', mt: 1 }}>Profesora</Typography>,
          <MenuItem key="i-all" selected={filters.instructor === 'all'} onClick={() => { setFilters((f) => ({ ...f, instructor: 'all' })); setFilterEl(null); }}>
            <ListItemIcon>{filters.instructor === 'all' && <CheckIcon />}</ListItemIcon>Todas las profesoras
          </MenuItem>,
          ...catalog.instructors.map((i) => (
            <MenuItem key={`i${i.id}`} selected={filters.instructor === i.id} onClick={() => { setFilters((f) => ({ ...f, instructor: i.id })); setFilterEl(null); }}>
              <ListItemIcon>{filters.instructor === i.id && <CheckIcon />}</ListItemIcon>{i.name}
            </MenuItem>
          )),
        ]}
      </Menu>

      <ClassDrawer
        occurrence={openOcc}
        mobile={mobile}
        today={today}
        tone={openOcc ? tone(openOcc) : null}
        onClose={() => setOpenOcc(null)}
        onChanged={() => load(true)}
        onEdit={(o) => setForm({ mode: 'edit', occurrence: o })}
        toast={toast}
        vars={cssVars}
      />

      {form && (
        <ClassFormDialog
          open
          mode={form.mode}
          catalog={catalog}
          today={today}
          preset={form.preset}
          occurrence={form.occurrence}
          onClose={() => setForm(null)}
          onNeedClassTypes={() => { setForm(null); setPrereq('class'); }}
          onDone={(msg, focus) => {
            setForm(null);
            setOpenOcc(null);
            toast(msg);
            if (focus?.date && (focus.date < range.start || focus.date > range.end)) setAnchor(focus.date);
            else load(true);
          }}
        />
      )}

      {move && (
        <MoveDialog
          occurrence={move.o}
          to={move.to}
          rooms={catalog.rooms}
          onClose={() => setMove(null)}
          onMoved={(msg, undo) => {
            setMove(null);
            toast(msg, undo ? { undo: async () => { await calendarApi.undoMove(undo); await load(true); } } : undefined);
            load(true);
          }}
        />
      )}

      <QuickRoomDialog open={prereq === 'room'} onClose={() => setPrereq(null)}
        onCreated={async () => { setPrereq(null); await load(true); }} />
      <ClassTemplatesDialog open={prereq === 'class'} onClose={() => setPrereq(null)}
        onCreated={async () => { setPrereq(null); await load(true); toast('Clases añadidas. Ahora ponlas en el horario.'); }} />

      <Snackbar
        key={snack?.key}
        open={!!snack}
        autoHideDuration={snack?.severity === 'error' ? null : 7000}
        onClose={(_, r) => { if (r !== 'clickaway') setSnack(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ [theme.breakpoints.down('md')]: { bottom: 'calc(84px + env(safe-area-inset-bottom))' }, zIndex: 1400 }}
      >
        <Alert
          severity={snack?.severity || 'success'}
          variant="filled"
          onClose={() => setSnack(null)}
          sx={{ alignItems: 'center', fontSize: '.95rem' }}
          action={snack?.undo ? (
            <Button color="inherit" size="small" variant="outlined" sx={{ fontWeight: 700, borderColor: 'currentColor', color: 'inherit', ml: 1 }}
              onClick={async () => {
                const u = snack.undo!;
                setSnack(null);
                try { await u(); toast('Hecho: se ha deshecho el cambio.', { severity: 'info' }); } catch (e) { toast(errorText(e), { severity: 'error' }); }
              }}>
              Deshacer
            </Button>
          ) : undefined}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}

function WaitlistToggle({ enabled, onChanged }: { enabled: boolean; onChanged: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <MenuItem disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await calendarApi.saveWaitlistSettings({ enabled: !enabled }); onChanged(r.enabled); } finally { setBusy(false); }
    }}>
      <ListItemIcon><HourglassEmptyIcon /></ListItemIcon>
      <ListItemText primary="Lista de espera" secondary={enabled ? 'Si una clase se llena, pueden apuntarse' : 'Desactivada'} />
      <Switch edge="end" checked={enabled} tabIndex={-1} inputProps={{ 'aria-label': 'Lista de espera' }} />
    </MenuItem>
  );
}

function EmptyCalendar({ onCreate, onTemplates }: { onCreate: () => void; onTemplates: () => void }) {
  return (
    <Box className="kc-wrap" sx={{ p: { xs: 3, md: 5 }, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: 64, height: 64, borderRadius: 4, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: 'text.primary' }} aria-hidden="true">
        <CalendarMonthOutlinedIcon fontSize="large" />
      </Box>
      <Typography component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>Tu horario todavía está vacío</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
        Crea tu primera clase o empieza con una plantilla. Tus clientas la verán al momento en tu web y en la app.
      </Typography>
      <Box sx={{ textAlign: 'left', bgcolor: 'action.hover', borderRadius: 3, p: 2, minWidth: { sm: 400 }, maxWidth: '100%' }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Ejemplos</Typography>
        {['Reformer · lunes y miércoles a las 18:00', 'Mat · martes a las 9:30', 'Clase de un día: taller del sábado'].map((t) => (
          <Stack key={t} direction="row" spacing={1} alignItems="center" sx={{ py: 0.4 }}>
            <CheckIcon fontSize="small" /><Typography variant="body2">{t}</Typography>
          </Stack>
        ))}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1, width: { xs: '100%', sm: 'auto' } }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate} sx={{ borderRadius: 99 }}>Crear mi primera clase</Button>
        <Button variant="outlined" startIcon={<LayersOutlinedIcon />} onClick={onTemplates} sx={{ borderRadius: 99 }}>Usar plantillas</Button>
      </Stack>
    </Box>
  );
}
