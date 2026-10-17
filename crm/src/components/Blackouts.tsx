import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import LockIcon from '@mui/icons-material/Lock';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import SearchSelect from './SearchSelect';
import { EmptyState, FormStep, HelpTip, ResponsiveTable, useConfirm, useNotify } from './guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';

// ====================================================================
// Utilidades compartidas con la página de horarios (Payments.tsx)
// ====================================================================

// Zona horaria del estudio (config pública, ver src/site/timezone.ts)
export { TZ };
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
/** "todos los lunes", "todos los sábados" */
export const WEEKDAYS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

/** Fecha de hoy en Madrid (YYYY-MM-DD) */
export const madridToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

/** Instante → "YYYY-MM-DDTHH:MM" en hora de Madrid */
export const madridWall = (d: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d).replace(' ', 'T');

export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
};

/** 0 = lunes … 6 = domingo (misma convención que el backend) */
export const weekdayOf = (ymd: string) => (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Primer día (≥ ymd) que cae en ese día de la semana */
export const nextWeekdayOnOrAfter = (ymd: string, weekday: number) =>
  addDays(ymd, (weekday - weekdayOf(ymd) + 7) % 7);

/** Último día (≤ ymd) que cae en ese día de la semana */
export const lastWeekdayOnOrBefore = (ymd: string, weekday: number) =>
  addDays(ymd, -((weekdayOf(ymd) - weekday + 7) % 7));

/** "lunes 28 de septiembre" */
export const fmtLong = (ymd: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${ymd}T12:00:00Z`));

/** "lun, 28 sept" */
export const fmtShort = (ymd: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${ymd}T12:00:00Z`));

/** "1 de octubre" */
export const fmtDayMonth = (ymd: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long' })
    .format(new Date(`${ymd}T12:00:00Z`));

/** Primer día del mes que viene (YYYY-MM-DD) */
export const firstOfNextMonth = () => {
  const [y, m] = madridToday().split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};

/** "octubre" */
export const monthName = (ymd: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`));

export const hhmm = (t: string | undefined | null) => (t || '').substring(0, 5);

/** Suma minutos a "HH:MM" (sin pasar de las 23:59) */
export const addMinutes = (t: string, min: number) => {
  const [h, m] = t.split(':').map(Number);
  const total = Math.min(h * 60 + m + min, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

/**
 * Traduce los mensajes de error de la API de horarios (vienen con nombres
 * internos como "effective_date") a frases que se entiendan.
 */
export function translateScheduleError(msg: string): string {
  if (/effective_date debe ser futura/i.test(msg))
    return 'La fecha tiene que ser de mañana en adelante. Si el cambio es para hoy mismo, usa «Editar».';
  if (/Ya existe una regla activa|unique|únic/i.test(msg))
    return 'Ya hay otra clase en esa sala, ese día y a esa hora. Cambia la hora o la sala. (Si solo quieres cambiar las plazas o la hora de fin, usa «Editar».)';
  const ends = msg.match(/La regla ya termina el (\d{4}-\d{2}-\d{2})/);
  if (ends) return `Esta clase ya deja de darse el ${fmtLong(ends[1])}. Elige una fecha anterior a esa.`;
  if (/Solo se pueden MOVER/i.test(msg))
    return 'Como cambia el día de la semana, las reservas no se pueden pasar solas. Elige cancelarlas o dejarlas como están.';
  if (/La fecha ya pasó/i.test(msg)) return 'Esa fecha ya ha pasado. Elige hoy o un día futuro.';
  if (/no ocurre ese día/i.test(msg)) return 'Esa fecha no cae en el día de la semana de esta clase.';
  if (/end_date no puede ser anterior/i.test(msg)) return 'El último día no puede ser anterior al primero.';
  if (/end_datetime debe ser posterior/i.test(msg)) return 'La hora de fin tiene que ser después de la de inicio.';
  if (/Fechas inválidas|requerid/i.test(msg)) return 'Falta una fecha o una hora, o no es correcta. Revísalas.';
  return msg;
}

/** Lee un error de la API y lo devuelve en lenguaje llano. */
export async function readApiError(res: Response): Promise<string> {
  if ([401, 403, 404].includes(res.status) || res.status >= 500) return friendlyError(res);
  try {
    const data = await res.clone().json();
    if (data && typeof data.error === 'string') return translateScheduleError(data.error);
    const raw = JSON.stringify(data);
    if (/unique|únic/i.test(raw)) return translateScheduleError('unique');
  } catch {
    /* sin JSON */
  }
  return friendlyError(res);
}

export interface AffectedBookings {
  loading: boolean;
  failed: boolean;
  count: number;
  names: string[];
  /** true si hay más de las que hemos podido contar (más de 200) */
  more: boolean;
}

export const NO_AFFECTED: AffectedBookings = { loading: false, failed: false, count: 0, names: [], more: false };

interface BookingRow {
  id: number;
  status: string;
  start_datetime: string;
  who: string | null;
  occurrence_id: number | null;
}

/**
 * Cuenta las reservas activas que caen en un rango (hora de Madrid,
 * [desde, hasta) ). Si se pasa scheduleId, solo las de esa clase.
 * Solo lectura: sirve para decir "hay 4 reservas" antes de guardar.
 */
export async function fetchAffectedBookings(opts: {
  fromWall: string; // "YYYY-MM-DDTHH:MM"
  toWall?: string; // exclusivo; vacío = sin fin
  scheduleId?: number | null;
  search?: string;
}): Promise<AffectedBookings> {
  const params = new URLSearchParams({ status: 'reserved', page_size: '200' });
  params.set('start_datetime__gte', addDays(opts.fromWall.substring(0, 10), -1));
  if (opts.toWall) params.set('start_datetime__lte', addDays(opts.toWall.substring(0, 10), 1));
  if (opts.search) params.set('search', opts.search);
  const res = await fetch(`${API_BASE_URL}v1/bookings/?${params}`, { headers: authHeaders() });
  if (!res.ok) throw res;
  const data = await res.json();
  const rows: BookingRow[] = Array.isArray(data) ? data : data.results || [];
  const list = rows.filter((b) => {
    if (b.status !== 'reserved' || b.occurrence_id == null) return false;
    if (opts.scheduleId != null && b.occurrence_id !== opts.scheduleId) return false;
    const wall = madridWall(new Date(b.start_datetime));
    return wall >= opts.fromWall && (!opts.toWall || wall < opts.toWall);
  });
  const names = Array.from(new Set(list.map((b) => (b.who || '').trim()).filter(Boolean)));
  return { loading: false, failed: false, count: list.length, names, more: Boolean(data.next) };
}

/** Frase "Hay 3 reservas (Ana, Marta y Lucía)" con estados de carga y error. */
export function AffectedSummary({ affected, when }: { affected: AffectedBookings; when: string }) {
  if (affected.loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <CircularProgress size={18} />
        <Typography sx={{ fontSize: '0.95rem' }}>Comprobando si hay gente apuntada {when}…</Typography>
      </Stack>
    );
  }
  if (affected.failed) {
    return (
      <Alert severity="warning" sx={{ mb: 1.5 }}>
        No hemos podido comprobar cuántas reservas hay {when}. Elige igualmente qué hacer por si las hay.
      </Alert>
    );
  }
  if (affected.count === 0) {
    return (
      <Alert severity="success" sx={{ mb: 1.5 }}>
        No hay ninguna reserva {when}. No afecta a nadie.
      </Alert>
    );
  }
  const shown = affected.names.slice(0, 6);
  const rest = affected.names.length - shown.length;
  return (
    <Alert severity="warning" sx={{ mb: 1.5 }}>
      <b>
        Hay {affected.more ? 'más de ' : ''}
        {affected.count} {affected.count === 1 ? 'reserva' : 'reservas'} {when}
      </b>
      {shown.length > 0 && (
        <>
          {' '}
          ({shown.join(', ')}
          {rest > 0 ? ` y ${rest} más` : ''})
        </>
      )}
      .
    </Alert>
  );
}

/** Opción grande tipo "radio" con título y explicación (fácil de pulsar). */
export function OptionCard({
  selected, onClick, title, text, disabled, recommended,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text: ReactNode;
  disabled?: boolean;
  recommended?: boolean;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      role="radio"
      aria-checked={selected}
      sx={{
        width: '100%', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'flex-start',
        gap: 1.25, p: 1.5, mb: 1, borderRadius: 3, minHeight: 56,
        border: selected ? '2px solid var(--studio-primary)' : '1.5px solid rgb(var(--studio-line-rgb) / 0.35)',
        backgroundColor: selected ? 'rgb(var(--studio-primary-rgb) / 0.08)' : 'rgb(var(--studio-surface-rgb) / 0.8)',
        opacity: disabled ? 0.5 : 1,
        '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
      }}
    >
      <Box sx={{ color: selected ? 'var(--studio-primary-dark)' : 'var(--studio-text-faint)', mt: '1px' }}>
        {selected ? <RadioButtonCheckedIcon /> : <RadioButtonUncheckedIcon />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="div" sx={{ fontWeight: 600, fontSize: '1rem', color: 'var(--studio-dark)' }}>
          {title}
          {recommended && (
            <Chip size="small" label="Recomendado" color="success" variant="outlined" sx={{ ml: 1, height: 22 }} />
          )}
        </Typography>
        <Typography component="div" sx={{ fontSize: '0.93rem', color: 'var(--studio-text-strong)', lineHeight: 1.5, mt: 0.25 }}>
          {text}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

/** Caja "Resumen" en lenguaje natural antes de guardar. */
export function SummaryBox({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        p: 2, borderRadius: 3, backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.08)',
        border: '1.5px dashed rgb(var(--studio-primary-rgb) / 0.5)',
      }}
    >
      <Typography sx={{ fontWeight: 600, mb: 0.5, color: 'var(--studio-dark)' }}>Resumen: esto es lo que va a pasar</Typography>
      <Typography component="div" sx={{ fontSize: '0.98rem', color: 'var(--studio-dark)', lineHeight: 1.6 }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Próximas fechas de una clase (para elegir pulsando en vez de escribir). */
export function upcomingDates(s: ScheduleOption, count = 8): string[] {
  const today = madridToday();
  if (!s.is_recurrent || s.weekday == null) {
    return s.start_date && s.start_date >= today ? [s.start_date] : [];
  }
  let d = nextWeekdayOnOrAfter(s.start_date && s.start_date > today ? s.start_date : today, s.weekday);
  const out: string[] = [];
  while (out.length < count && (!s.end_date || d <= s.end_date)) {
    out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

/** Botones con las próximas fechas + campo "otra fecha". */
export function DatePicker({
  dates, value, onChange, otherLabel = 'Otra fecha', min, error, helperText,
}: {
  dates: string[];
  value: string;
  onChange: (v: string) => void;
  otherLabel?: string;
  min?: string;
  error?: boolean;
  helperText?: ReactNode;
}) {
  return (
    <Box>
      {dates.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
          {dates.map((d) => (
            <Button
              key={d}
              variant={value === d ? 'contained' : 'outlined'}
              onClick={() => onChange(d)}
              sx={{ minHeight: 44, textTransform: 'none', fontSize: '0.95rem' }}
            >
              {fmtShort(d)}
            </Button>
          ))}
        </Stack>
      )}
      <TextField
        label={dates.length ? otherLabel : 'Fecha'}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ min }}
        error={error}
        helperText={helperText}
        sx={{ minWidth: 220 }}
      />
    </Box>
  );
}

// El mismo shape que ya maneja la página de horarios
export interface ScheduleOption {
  id: number;
  weekday: number | null;
  start_time: string;
  end_time?: string;
  is_recurrent: boolean;
  is_active?: boolean;
  start_date: string | null;
  end_date?: string | null;
  class_type: { id: number; title: string };
  room: { id: number; name: string };
}

/** "Pilates Mat · lunes 09:30–10:25 · Sala 1" */
export const scheduleLabel = (s: ScheduleOption) =>
  `${s.class_type.title} · ${
    s.is_recurrent && s.weekday != null ? WEEKDAYS[s.weekday].toLowerCase() : s.start_date ? fmtShort(s.start_date) : 'un día'
  } ${hhmm(s.start_time)}${s.end_time ? `–${hhmm(s.end_time)}` : ''} · ${s.room.name}`;

// ====================================================================
// Vacaciones y cierres
// ====================================================================

interface Blackout {
  id: number;
  schedule: number | null;
  schedule_title: string | null;
  start_datetime: string;
  end_datetime: string;
  // 'canceled' y 'moved' los crea el Calendario (cancelar / mover una sola clase)
  kind: 'vacation' | 'closed' | 'private' | 'canceled' | 'moved';
  reason: string | null;
  created_at: string;
}

type Kind = Blackout['kind'];

const KIND_META: Record<Kind, { label: string; color: 'warning' | 'default' | 'secondary'; icon: React.ReactElement }> = {
  vacation: { label: 'Vacaciones o festivo', color: 'warning', icon: <BeachAccessIcon fontSize="small" /> },
  closed: { label: 'Cerrado', color: 'default', icon: <EventBusyIcon fontSize="small" /> },
  private: { label: 'Clase privada', color: 'secondary', icon: <LockIcon fontSize="small" /> },
  canceled: { label: 'Clase cancelada', color: 'default', icon: <EventBusyIcon fontSize="small" /> },
  moved: { label: 'Sesión movida', color: 'default', icon: <EventBusyIcon fontSize="small" /> },
};

/** Cierres que se crearon solos al usar "Mover solo un día" */
const isMovedSession = (b: Blackout) => b.kind === 'moved' || /^Sesi[oó]n movida/i.test(b.reason || '');

export type BlackoutCase = 'estudio' | 'clase-dia' | 'horas' | 'privada' | 'otro';

export interface BlackoutPreset {
  case: BlackoutCase;
  scheduleId?: number;
  date?: string;
}

const CASES: { key: BlackoutCase; icon: ReactNode; title: string; text: string; example: string }[] = [
  {
    key: 'estudio',
    icon: <BeachAccessIcon />,
    title: 'Cerrar TODO el estudio unos días',
    text: 'Vacaciones, Navidad, un festivo… No se da ninguna clase esos días.',
    example: 'Ej.: del 4 al 17 de agosto',
  },
  {
    key: 'clase-dia',
    icon: <EventBusyIcon />,
    title: 'Quitar una clase un día concreto',
    text: 'Solo esa clase y solo ese día. El resto de semanas sigue igual.',
    example: 'Ej.: el lunes 13 no hay Pilates Mat de las 9:30',
  },
  {
    key: 'horas',
    icon: <AccessTimeIcon />,
    title: 'Cerrar unas horas',
    text: 'Todas las clases que empiecen dentro de esas horas quedan cerradas.',
    example: 'Ej.: el jueves de 16:00 a 20:00 hay un taller',
  },
  {
    key: 'privada',
    icon: <LockIcon />,
    title: 'Reservar el hueco de una clase para algo privado',
    text: 'La clase de ese día no aparece en la web y nadie más puede apuntarse.',
    example: 'Ej.: el viernes 10 a las 18:00 la sala es para un grupo privado',
  },
];

interface Props {
  schedules: ScheduleOption[];
  /** Abre la ventana ya preparada para un caso (desde otras pantallas) */
  preset?: BlackoutPreset | null;
  onPresetConsumed?: () => void;
}

const fmtWallDate = (iso: string) => madridWall(new Date(iso)).substring(0, 10);
const fmtWallTime = (iso: string) => madridWall(new Date(iso)).substring(11, 16);

/** "Del lun, 4 ago al dom, 10 ago" / "jue, 9 oct · de 16:00 a 20:00" */
export function describeRange(b: Pick<Blackout, 'start_datetime' | 'end_datetime'>): string {
  const sd = fmtWallDate(b.start_datetime);
  const st = fmtWallTime(b.start_datetime);
  const ed = fmtWallDate(b.end_datetime);
  const et = fmtWallTime(b.end_datetime);
  if (st === '00:00' && et === '00:00') {
    const lastDay = addDays(ed, -1);
    return lastDay === sd ? `${fmtShort(sd)} (todo el día)` : `Del ${fmtShort(sd)} al ${fmtShort(lastDay)}`;
  }
  if (sd === ed) return `${fmtShort(sd)} · de ${st} a ${et}`;
  return `Del ${fmtShort(sd)} ${st} al ${fmtShort(ed)} ${et}`;
}

/**
 * Vacaciones y cierres de calendario (ScheduleBlackout del backend).
 * Permite cerrar días o franjas — del estudio entero o de una clase concreta —
 * sin desactivar la clase semanal, y opcionalmente cancelar+reembolsar las
 * reservas ya existentes en el rango. Borrar un cierre reabre el periodo.
 */
export default function BlackoutsManagement({ schedules, preset, onPresetConsumed }: Props) {
  const notify = useNotify();
  const confirm = useConfirm();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Formulario ──
  const [caseKey, setCaseKey] = useState<BlackoutCase>('otro');
  const [scope, setScope] = useState<'global' | 'schedule'>('global');
  const [scheduleId, setScheduleId] = useState<number | ''>('');
  const [mode, setMode] = useState<'days' | 'session' | 'range'>('days');
  const [kind, setKind] = useState<Kind>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [rangeDate, setRangeDate] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [reason, setReason] = useState('');
  const [existing, setExisting] = useState<'' | 'cancel' | 'keep'>('');
  const [affected, setAffected] = useState<AffectedBookings>(NO_AFFECTED);

  const today = madridToday();

  // Clases que se pueden cerrar: semanales que siguen vigentes y clases de un día futuras
  const selectableSchedules = useMemo(
    () =>
      schedules
        .filter((s) =>
          s.is_recurrent
            ? !s.end_date || s.end_date >= today
            : Boolean(s.start_date && s.start_date >= today),
        )
        .sort((a, b) =>
          (a.weekday ?? 9) - (b.weekday ?? 9) || a.start_time.localeCompare(b.start_time),
        ),
    [schedules, today],
  );
  const selectedSchedule = schedules.find((s) => s.id === scheduleId) || null;

  const fetchBlackouts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/blackouts/?ordering=start_datetime`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw res;
      const data = await res.json();
      setBlackouts(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setLoadError(await friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlackouts();
  }, [fetchBlackouts]);

  const openCase = useCallback((c: BlackoutCase, opts: { scheduleId?: number; date?: string } = {}) => {
    setCaseKey(c);
    setSubmitted(false);
    setScheduleId(opts.scheduleId ?? '');
    setStartDate(c === 'estudio' || c === 'otro' ? opts.date || '' : '');
    setEndDate('');
    setSessionDate(opts.date || '');
    setRangeDate(opts.date || '');
    setRangeStart('');
    setRangeEnd('');
    setReason('');
    setExisting('');
    setAffected(NO_AFFECTED);
    if (c === 'estudio') { setScope('global'); setMode('days'); setKind('vacation'); }
    else if (c === 'clase-dia') { setScope('schedule'); setMode('session'); setKind('closed'); }
    else if (c === 'horas') { setScope('global'); setMode('range'); setKind('closed'); }
    else if (c === 'privada') { setScope('schedule'); setMode('session'); setKind('private'); }
    else { setScope('global'); setMode('days'); setKind('closed'); }
    setOpenDialog(true);
  }, []);

  // Apertura desde fuera (Inicio, vista de calendario…)
  useEffect(() => {
    if (!preset) return;
    openCase(preset.case, { scheduleId: preset.scheduleId, date: preset.date });
    onPresetConsumed?.();
  }, [preset, openCase, onPresetConsumed]);

  // ── Rango que se va a cerrar (hora de pared de Madrid) ──
  const range = useMemo((): { from: string; to: string } | null => {
    if (mode === 'days') {
      if (!startDate) return null;
      const last = endDate || startDate;
      if (last < startDate) return null;
      return { from: `${startDate}T00:00`, to: `${addDays(last, 1)}T00:00` };
    }
    if (mode === 'session') {
      if (!sessionDate || !selectedSchedule) return null;
      return {
        from: `${sessionDate}T${hhmm(selectedSchedule.start_time)}`,
        to: `${sessionDate}T${hhmm(selectedSchedule.end_time || selectedSchedule.start_time)}`,
      };
    }
    if (!rangeDate || !rangeStart || !rangeEnd || rangeEnd <= rangeStart) return null;
    return { from: `${rangeDate}T${rangeStart}`, to: `${rangeDate}T${rangeEnd}` };
  }, [mode, startDate, endDate, sessionDate, selectedSchedule, rangeDate, rangeStart, rangeEnd]);

  const needsSchedule = scope === 'schedule';
  const scheduleMissing = needsSchedule && !selectedSchedule;

  // ── ¿Cuántas reservas hay en ese rango? ──
  useEffect(() => {
    if (!openDialog || !range || scheduleMissing) {
      setAffected(NO_AFFECTED);
      return;
    }
    let cancelled = false;
    setAffected({ ...NO_AFFECTED, loading: true });
    const t = setTimeout(() => {
      fetchAffectedBookings({
        fromWall: range.from,
        toWall: range.to,
        scheduleId: needsSchedule ? (selectedSchedule?.id ?? null) : null,
        search: needsSchedule ? selectedSchedule?.class_type.title : undefined,
      })
        .then((r) => { if (!cancelled) setAffected(r); })
        .catch(() => { if (!cancelled) setAffected({ ...NO_AFFECTED, failed: true }); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [openDialog, range, needsSchedule, scheduleMissing, selectedSchedule]);

  // Si no hay nadie apuntado, no hace falta elegir
  const mustChooseExisting = affected.failed || affected.count > 0;
  const effectiveExisting: 'cancel' | 'keep' = mustChooseExisting ? (existing || 'keep') : 'keep';

  // ── Validación junto a cada campo ──
  const errors = {
    schedule: scheduleMissing ? 'Elige la clase.' : '',
    startDate: mode === 'days' && !startDate ? 'Elige el primer día.' : '',
    endDate: mode === 'days' && endDate && startDate && endDate < startDate ? 'El último día no puede ser antes del primero.' : '',
    sessionDate: mode === 'session' && !sessionDate ? 'Elige el día.' : '',
    rangeDate: mode === 'range' && !rangeDate ? 'Elige el día.' : '',
    rangeTimes:
      mode === 'range' && (!rangeStart || !rangeEnd)
        ? 'Pon la hora de inicio y la de fin.'
        : mode === 'range' && rangeEnd <= rangeStart
          ? 'La hora de fin tiene que ser después de la de inicio.'
          : '',
    existing: mustChooseExisting && !existing ? 'Elige qué hacemos con esas reservas.' : '',
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSave = async () => {
    setSubmitted(true);
    if (hasErrors || !range) return;

    const body: Record<string, unknown> = {
      kind,
      reason: reason || null,
      cancel_existing: effectiveExisting === 'cancel',
      schedule: scope === 'schedule' ? scheduleId : null,
    };
    if (mode === 'days') {
      body.start_date = startDate;
      body.end_date = endDate || startDate;
    } else {
      body.start_datetime = range.from;
      body.end_datetime = range.to;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/blackouts/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        notify(await readApiError(res), 'error');
        return;
      }
      const data = await res.json();
      const extra =
        data.cancelled > 0
          ? ` Se han cancelado ${data.cancelled} ${data.cancelled === 1 ? 'reserva' : 'reservas'}, se ha devuelto el dinero o crédito (${data.refunded}) y se ha avisado a cada cliente.`
          : '';
      notify(`Cierre guardado: nadie podrá reservar en esas fechas.${extra}`, 'success');
      setOpenDialog(false);
      fetchBlackouts();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: Blackout) => {
    const what = b.schedule_title || 'todo el estudio';
    const moved = isMovedSession(b);
    const ok = await confirm({
      title: moved ? '¿Quitar este cierre de una clase movida?' : `¿Reabrir ${b.schedule_title ? `«${b.schedule_title}»` : 'el estudio'}?`,
      tone: moved ? 'danger' : 'normal',
      message: (
        <>
          <p style={{ marginTop: 0 }}>
            <b>{describeRange(b)}</b> — {what}.
          </p>
          {moved ? (
            <p>
              Este cierre se creó solo al <b>mover esa clase a otra hora</b> ese día. Si lo quitas, ese día saldrán{' '}
              <b>dos clases</b> en la web: la de la hora de siempre y la movida.
            </p>
          ) : (
            <p>Tus clientes podrán volver a reservar en esas fechas.</p>
          )}
          <p style={{ marginBottom: 0 }}>
            Las reservas que se cancelaron al cerrar <b>no vuelven solas</b>: si alguien quiere venir, tendrá
            que reservar otra vez.
          </p>
        </>
      ),
      confirmText: moved ? 'Sí, quitar el cierre' : 'Sí, reabrir',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}v1/blackouts/${b.id}/`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw res;
      notify('Listo: esas fechas vuelven a estar abiertas para reservar.', 'success');
      fetchBlackouts();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    }
  };

  const now = new Date().toISOString();
  const upcoming = blackouts.filter((b) => new Date(b.end_datetime).toISOString() >= now);
  const past = blackouts.filter((b) => new Date(b.end_datetime).toISOString() < now);

  const renderRows = (list: Blackout[], dimmed = false) =>
    list.map((b) => {
      const moved = isMovedSession(b);
      const meta = KIND_META[b.kind] || KIND_META.closed;
      return (
        <TableRow key={b.id} sx={dimmed ? { opacity: 0.6 } : undefined}>
          <TableCell>
            {moved ? (
              <Chip size="small" icon={<SwapHorizIcon fontSize="small" />} label="Clase movida de hora" variant="outlined" color="info" />
            ) : (
              <Chip size="small" icon={meta.icon} label={meta.label} color={meta.color} variant="outlined" />
            )}
          </TableCell>
          <TableCell sx={{ fontSize: '0.95rem' }}>{b.schedule_title || <b>Todo el estudio</b>}</TableCell>
          <TableCell sx={{ fontSize: '0.95rem', '&::first-letter': { textTransform: 'uppercase' } }}>
            {describeRange(b)}
          </TableCell>
          {!isMobile && <TableCell sx={{ fontSize: '0.95rem' }}>{b.reason || '—'}</TableCell>}
          <TableCell align="right">
            {!dimmed && (
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<LockOpenIcon />}
                onClick={() => handleDelete(b)}
                sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
              >
                Reabrir
              </Button>
            )}
          </TableCell>
        </TableRow>
      );
    });

  // ── Textos del resumen ──
  const whenPlain = (() => {
    if (!range) return '';
    if (mode === 'days') {
      const last = endDate || startDate;
      return last === startDate
        ? `el ${fmtLong(startDate)} (todo el día)`
        : `del ${fmtLong(startDate)} al ${fmtLong(last)}, ambos incluidos`;
    }
    if (mode === 'session' && selectedSchedule) {
      return `el ${fmtLong(sessionDate)} de ${range.from.substring(11)} a ${range.to.substring(11)}`;
    }
    return `el ${fmtLong(rangeDate)} de ${rangeStart} a ${rangeEnd}`;
  })();

  const whatPlain =
    scope === 'global'
      ? 'todo el estudio (todas las clases)'
      : selectedSchedule
        ? `la clase ${scheduleLabel(selectedSchedule)}`
        : 'la clase que elijas';

  const dialogTitle =
    caseKey === 'estudio'
      ? 'Cerrar todo el estudio unos días'
      : caseKey === 'clase-dia'
        ? 'Quitar una clase un día concreto'
        : caseKey === 'horas'
          ? 'Cerrar unas horas'
          : caseKey === 'privada'
            ? 'Reservar el hueco de una clase para algo privado'
            : 'Cerrar fechas en el calendario';

  return (
    <Box mt={2}>
      {/* ── Explicación + casos ── */}
      <Box mb={2.5}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="h6">Vacaciones y cierres</Typography>
          <HelpTip title="¿Qué es un cierre?">
            Un cierre bloquea las reservas en unas fechas <b>sin borrar ni cambiar tus clases</b>. Las clases
            semanales siguen existiendo; esos días simplemente no salen en la web y nadie puede apuntarse (tampoco
            las reservas automáticas de las membresías). Cuando pasa la fecha, todo sigue como siempre.
          </HelpTip>
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: '1rem', maxWidth: 760, lineHeight: 1.6 }}>
          Úsalo cuando <b>no vas a dar clase</b> unos días o unas horas. No borra ninguna clase: al pasar esas fechas
          todo vuelve a ser como siempre. ¿Qué necesitas?
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid', gap: 1.5, mb: 3,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
        }}
      >
        {CASES.map((c) => (
          <ButtonBase
            key={c.key}
            onClick={() => openCase(c.key)}
            sx={{
              textAlign: 'left', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.5,
              p: 2, borderRadius: 4, width: '100%', minHeight: 110,
              backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.8)', border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
              '&:hover': { borderColor: 'var(--studio-primary)', boxShadow: '0 6px 18px rgb(var(--studio-primary-deep-rgb) / 0.12)' },
              '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 42, height: 42, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center',
                backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.14)', color: 'var(--studio-primary-deep)',
              }}
            >
              {c.icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: 'var(--studio-dark)', lineHeight: 1.35 }}>{c.title}</Typography>
              <Typography sx={{ mt: 0.4, color: 'var(--studio-text-strong)', fontSize: '0.92rem', lineHeight: 1.45 }}>{c.text}</Typography>
              <Typography sx={{ mt: 0.4, color: 'var(--studio-text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>{c.example}</Typography>
            </Box>
            <ArrowForwardIcon aria-hidden sx={{ color: 'var(--studio-text-faint)', alignSelf: 'center' }} />
          </ButtonBase>
        ))}
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} mb={1.5}>
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--studio-dark)' }}>Cierres programados</Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openCase('otro')} sx={{ minHeight: 44 }}>
          Otro tipo de cierre
        </Button>
      </Stack>

      {loading ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={24} />
          <Typography>Cargando los cierres…</Typography>
        </Stack>
      ) : loadError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={fetchBlackouts} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se han podido cargar los cierres. {loadError}
        </Alert>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 3 }}>
          <EmptyState
            icon={<BeachAccessIcon />}
            title="No tienes ningún cierre programado"
            text="Todas tus clases se dan con normalidad. Cuando tengas vacaciones o un festivo, elige arriba el caso que necesitas."
          />
        </Paper>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              No hay cierres de aquí en adelante: todas las clases se dan con normalidad.
            </Alert>
          ) : (
            <ResponsiveTable component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Qué se cierra</TableCell>
                    <TableCell>Cuándo</TableCell>
                    {!isMobile && <TableCell>Nota</TableCell>}
                    <TableCell align="right">Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>{renderRows(upcoming)}</TableBody>
              </Table>
            </ResponsiveTable>
          )}

          {past.length > 0 && (
            <Box mt={1.5}>
              <Button onClick={() => setShowPast((v) => !v)} sx={{ minHeight: 44 }}>
                {showPast ? 'Ocultar los cierres pasados' : `Ver los cierres pasados (${past.length})`}
              </Button>
              <Collapse in={showPast} unmountOnExit>
                <ResponsiveTable component={Paper} sx={{ mt: 1 }}>
                  <Table size="small">
                    <TableBody>{renderRows(past, true)}</TableBody>
                  </Table>
                </ResponsiveTable>
              </Collapse>
            </Box>
          )}
        </>
      )}

      {/* ── Ventana guiada de creación ── */}
      <Dialog open={openDialog} onClose={() => !saving && setOpenDialog(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontSize: '1.3rem' }}>{dialogTitle}</DialogTitle>
        <DialogContent dividers>
          <FormStep n={1} title="¿Qué se cierra?">
            <ToggleButtonGroup
              value={scope}
              exclusive
              fullWidth
              onChange={(_, v) => {
                if (!v) return;
                setScope(v);
                if (v === 'global' && mode === 'session') setMode('days');
              }}
              sx={{ mb: 1.5, '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none', fontSize: '0.98rem' } }}
            >
              <ToggleButton value="global">Todo el estudio</ToggleButton>
              <ToggleButton value="schedule">Solo una clase</ToggleButton>
            </ToggleButtonGroup>

            {scope === 'schedule' && (
              <SearchSelect
                label="¿Qué clase?"
                options={selectableSchedules.map((s) => ({ id: s.id, label: scheduleLabel(s) }))}
                value={scheduleId}
                onChange={(id) => { setScheduleId(id ? Number(id) : ''); setSessionDate(''); }}
                helperText={
                  submitted && errors.schedule
                    ? errors.schedule
                    : 'Escribe el nombre, el día o la hora para encontrarla (p. ej. «lunes» o «Reformer»)'
                }
              />
            )}
            {scope === 'global' && (
              <Typography sx={{ fontSize: '0.93rem', color: 'text.secondary' }}>
                Se cierran <b>todas</b> las clases que empiecen dentro de las fechas u horas que elijas.
              </Typography>
            )}
          </FormStep>

          <FormStep n={2} title="¿Cuándo?">
            <ToggleButtonGroup
              value={mode}
              exclusive
              fullWidth
              orientation={isMobile ? 'vertical' : 'horizontal'}
              onChange={(_, v) => v && setMode(v)}
              sx={{ mb: 2, '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none', fontSize: '0.95rem' } }}
            >
              <ToggleButton value="days">Días enteros</ToggleButton>
              {scope === 'schedule' && <ToggleButton value="session">Un día de esa clase</ToggleButton>}
              <ToggleButton value="range">Unas horas de un día</ToggleButton>
            </ToggleButtonGroup>

            {mode === 'days' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <TextField
                  fullWidth
                  label="Primer día cerrado"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: today }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  error={submitted && !!errors.startDate}
                  helperText={submitted && errors.startDate ? errors.startDate : startDate ? fmtLong(startDate) : ' '}
                />
                <TextField
                  fullWidth
                  label="Último día cerrado (incluido)"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: startDate || today }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  error={!!errors.endDate}
                  helperText={errors.endDate || (endDate ? fmtLong(endDate) : 'Déjalo vacío si es un solo día')}
                />
              </Stack>
            )}

            {mode === 'session' && (
              selectedSchedule ? (
                <DatePicker
                  dates={upcomingDates(selectedSchedule, 8)}
                  value={sessionDate}
                  onChange={setSessionDate}
                  min={today}
                  error={submitted && !!errors.sessionDate}
                  helperText={
                    submitted && errors.sessionDate
                      ? errors.sessionDate
                      : sessionDate
                        ? `Se cierra solo la clase del ${fmtLong(sessionDate)}.`
                        : 'Pulsa uno de los próximos días de esta clase.'
                  }
                />
              ) : (
                <Typography sx={{ color: 'text.secondary' }}>Primero elige la clase en el paso 1.</Typography>
              )
            )}

            {mode === 'range' && (
              <Stack gap={2}>
                <TextField
                  label="Día"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: today }}
                  value={rangeDate}
                  onChange={(e) => setRangeDate(e.target.value)}
                  error={submitted && !!errors.rangeDate}
                  helperText={submitted && errors.rangeDate ? errors.rangeDate : rangeDate ? fmtLong(rangeDate) : ' '}
                  sx={{ maxWidth: 260 }}
                />
                <Stack direction="row" gap={2}>
                  <TextField
                    fullWidth
                    label="Desde las"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    error={submitted && !!errors.rangeTimes}
                  />
                  <TextField
                    fullWidth
                    label="Hasta las"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    error={(submitted || (!!rangeStart && !!rangeEnd)) && !!errors.rangeTimes}
                  />
                </Stack>
                <Typography sx={{ fontSize: '0.9rem', color: (submitted || (rangeStart && rangeEnd)) && errors.rangeTimes ? 'error.main' : 'text.secondary' }}>
                  {(submitted || (rangeStart && rangeEnd)) && errors.rangeTimes
                    ? errors.rangeTimes
                    : 'Se cierran las clases que EMPIECEN entre esas horas. Ej.: de 16:00 a 20:00 cierra la de 16:00 y la de 19:00, pero no la de 20:00.'}
                </Typography>
              </Stack>
            )}
          </FormStep>

          <FormStep n={3} title="¿Por qué se cierra?" hint="Solo para que tú lo recuerdes: tus clientes no ven la nota.">
            <ToggleButtonGroup
              value={kind}
              exclusive
              fullWidth
              orientation={isMobile ? 'vertical' : 'horizontal'}
              onChange={(_, v) => v && setKind(v)}
              sx={{ mb: 2, '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none', fontSize: '0.95rem', gap: 0.75 } }}
            >
              <ToggleButton value="vacation"><BeachAccessIcon fontSize="small" /> Vacaciones o festivo</ToggleButton>
              <ToggleButton value="closed"><EventBusyIcon fontSize="small" /> Cierre</ToggleButton>
              <ToggleButton value="private"><LockIcon fontSize="small" /> Clase privada</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              fullWidth
              label="Nota (opcional)"
              placeholder="Ej.: Puente del Pilar · Taller de respiración · Grupo privado de Ana"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormStep>

          <FormStep n={4} title="¿Y quien ya tiene reserva esos días?">
            {!range || scheduleMissing ? (
              <Typography sx={{ color: 'text.secondary' }}>
                Cuando elijas {scheduleMissing ? 'la clase y ' : ''}las fechas te diremos si hay reservas.
              </Typography>
            ) : (
              <>
                <AffectedSummary affected={affected} when={whenPlain ? `${whenPlain}` : ''} />
                {mustChooseExisting && (
                  <Box role="radiogroup" aria-label="Qué hacer con las reservas">
                    <OptionCard
                      selected={existing === 'cancel'}
                      onClick={() => setExisting('cancel')}
                      recommended={kind !== 'private'}
                      title="Cancelar las reservas, devolver lo pagado y avisar a cada cliente"
                      text={
                        <>
                          Se cancelan, a los clientes se les devuelve el crédito a su cuenta y a quien
                          pagó con tarjeta se le devuelve el dinero a la tarjeta. Cada persona recibe un aviso por
                          email, WhatsApp y notificación al móvil. <b>No se puede deshacer.</b>
                        </>
                      }
                    />
                    <OptionCard
                      selected={existing === 'keep'}
                      onClick={() => setExisting('keep')}
                      title="Mantener sus reservas"
                      text="Quien ya tiene reserva la conserva y no se le avisa de nada; solo se impide que se apunte nadie más. Útil si esas personas sí vienen (por ejemplo, el grupo privado)."
                    />
                    {submitted && errors.existing && (
                      <Typography sx={{ color: 'error.main', fontSize: '0.9rem' }}>{errors.existing}</Typography>
                    )}
                  </Box>
                )}
              </>
            )}
          </FormStep>

          {range && !scheduleMissing && (
            <SummaryBox>
              Se cerrará <b>{whatPlain}</b> <b>{whenPlain}</b>. Esas clases no saldrán en la web y nadie podrá
              reservarlas (tampoco las reservas automáticas de las membresías).{' '}
              {mustChooseExisting ? (
                existing === 'cancel' ? (
                  <>
                    Las <b>reservas que ya había{affected.failed ? '' : ` (${affected.count})`}</b> se cancelarán, se
                    devolverá lo pagado y se avisará a cada cliente.
                  </>
                ) : existing === 'keep' ? (
                  <>Las reservas que ya había se mantienen y no se avisa a nadie.</>
                ) : (
                  <>Falta que elijas en el paso 4 qué hacer con las reservas que ya había.</>
                )
              ) : (
                <>No hay nadie apuntado, así que nadie recibirá ningún aviso.</>
              )}{' '}
              Cuando quieras volver a abrir, pulsa «Reabrir» en la lista.
            </SummaryBox>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={() => setOpenDialog(false)} disabled={saving} sx={{ minHeight: 48 }}>
            No, volver
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {saving ? 'Guardando…' : existing === 'cancel' && mustChooseExisting ? 'Cerrar, cancelar reservas y avisar' : 'Guardar el cierre'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
