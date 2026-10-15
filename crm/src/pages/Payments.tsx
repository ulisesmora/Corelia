// OJO nombre heredado: esta página es la gestión de HORARIOS (ruta /calendar)
import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  ButtonBase,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Switch,
  Tab,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import PrintIcon from '@mui/icons-material/Print';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventNoteIcon from '@mui/icons-material/EventNote';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { ScheduleCalendar } from '../components/Calendar';
import BlackoutsManagement, {
  WEEKDAYS,
  WEEKDAYS_PLURAL,
  NO_AFFECTED,
  AffectedSummary,
  DatePicker,
  OptionCard,
  SummaryBox,
  addDays,
  addMinutes,
  describeRange,
  fetchAffectedBookings,
  firstOfNextMonth,
  fmtDayMonth,
  fmtLong,
  fmtShort,
  hhmm,
  lastWeekdayOnOrBefore,
  madridToday,
  madridWall,
  minutesBetween,
  monthName,
  nextWeekdayOnOrAfter,
  readApiError,
  upcomingDates,
  weekdayOf,
  type AffectedBookings,
  type BlackoutPreset,
} from '../components/Blackouts';
import SearchSelect from '../components/SearchSelect';
import PrintableSchedule from '../components/PrintableSchedule';
import { SectionTabs, PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { API_BASE_URL } from '../config';
import { currencySymbol, money } from '../site/money';

// ====================================================================
// 1. INTERFACES Y CONSTANTES
// ====================================================================

interface Instructor {
  id: number;
  name: string;
}

interface ClassType {
  id: number;
  title: string;
  instructor: Instructor | null; // El instructor principal viene aquí
  duration_minutes?: number;
  default_price_credits?: string | number | null;
  default_price_eur?: string | number | null;
}

interface Room {
  id: number;
  name: string;
  capacity?: number;
}

interface RecurringSchedule {
  id: number;
  weekday: number | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  capacity_min: number;
  capacity_max: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_recurrent: boolean;
  price_credits_override: string | null;
  price_eur_override: string | null;
  class_type: ClassType;
  room: Room;
  override_instructor: Instructor | null;
}

// Estado de edición (se manda al backend con IDs)
type EditableRecurringSchedule = Omit<
  RecurringSchedule,
  'class_type' | 'room' | 'override_instructor' | 'price_credits_override' | 'price_eur_override'
> & {
  class_type: number;
  room: number;
  override_instructor: number | null;
  price_credits_override: number | null;
  price_eur_override: number | null;
};

type AfFields = {
  weekday: number;
  start_time: string;
  end_time: string;
  room: number;
  capacity_min: number;
  capacity_max: number;
};

const TAB_KEYS = ['clases', 'calendario', 'imprimir', 'cierres'] as const;

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const instructorOf = (s: RecurringSchedule) =>
  s.override_instructor?.name || s.class_type.instructor?.name || 'Sin asignar';

/** "Lunes · 09:30–10:25" o "sáb, 4 oct · 09:30–10:25" */
const whenLabel = (s: RecurringSchedule) =>
  `${s.is_recurrent && s.weekday != null ? WEEKDAYS[s.weekday] : s.start_date ? fmtShort(s.start_date) : 'Un día'} · ${hhmm(s.start_time)}–${hhmm(s.end_time)}`;

/** "los lunes a las 09:30" / "el sábado 4 de octubre a las 09:30" */
const whenPhrase = (s: RecurringSchedule) =>
  s.is_recurrent && s.weekday != null
    ? `los ${WEEKDAYS_PLURAL[s.weekday]} a las ${hhmm(s.start_time)}`
    : `el ${s.start_date ? fmtLong(s.start_date) : 'día'} a las ${hhmm(s.start_time)}`;

/** ¿Sigue vigente? (semanal sin terminar, o de un día que aún no ha pasado) */
const isCurrent = (s: RecurringSchedule, today: string) =>
  s.is_recurrent ? !s.end_date || s.end_date >= today : Boolean(s.start_date && s.start_date >= today);

function statusOf(s: RecurringSchedule, today: string): { label: string; color: 'success' | 'warning' | 'info' | 'default' } {
  if (s.is_recurrent) {
    if (s.end_date && s.end_date < today) return { label: `Terminó el ${fmtDayMonth(s.end_date)}`, color: 'default' };
    if (!s.is_active) return { label: 'Pausada', color: 'default' };
    if (s.start_date && s.start_date > today && s.weekday != null)
      return { label: `Empieza el ${fmtDayMonth(nextWeekdayOnOrAfter(s.start_date, s.weekday))}`, color: 'info' };
    if (s.end_date && s.weekday != null)
      return { label: `Última clase: ${fmtShort(lastWeekdayOnOrBefore(s.end_date, s.weekday))}`, color: 'warning' };
    return { label: 'Cada semana', color: 'success' };
  }
  if (s.start_date && s.start_date < today) return { label: 'Ya pasó', color: 'default' };
  if (!s.is_active) return { label: 'Pausada', color: 'default' };
  return { label: 'Un solo día', color: 'info' };
}

const credLabel = (v: string | number | null | undefined) => {
  const n = Number(v ?? 1);
  return `${n % 1 === 0 ? n : n.toFixed(1)} ${n === 1 ? 'crédito' : 'créditos'}`;
};

// ====================================================================
// 2. COMPONENTE PRINCIPAL
// ====================================================================

export default function RecurringScheduleManagement() {
  const notify = useNotify();
  const confirm = useConfirm();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const today = madridToday();
  const nextMonth = firstOfNextMonth();

  // ── Pestañas sincronizadas con ?tab= ──
  const tabParam = searchParams.get('tab');
  const currentTab = Math.max(0, TAB_KEYS.indexOf((tabParam || '') as (typeof TAB_KEYS)[number]));
  const goTab = useCallback(
    (i: number) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (i === 0) p.delete('tab');
          else p.set('tab', TAB_KEYS[i]);
          return p;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // Data principal
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState('');

  // Data de soporte
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [instructors, setInstructor] = useState<Instructor[]>([]);
  const [supportDataLoading, setSupportDataLoading] = useState(false);
  const [supportReady, setSupportReady] = useState(false);

  // Lista: búsqueda, filtro y paginación
  const [searchTerm, setSearchTerm] = useState('');
  const [listFilter, setListFilter] = useState<'vigentes' | 'pasadas' | 'todas'>('vigentes');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // ── Añadir / editar ──
  const [openDialog, setOpenDialog] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<Partial<EditableRecurringSchedule> | null>(null);
  const [editOriginal, setEditOriginal] = useState<RecurringSchedule | null>(null);
  const [endTouched, setEndTouched] = useState(false);
  const [capTouched, setCapTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [editAffected, setEditAffected] = useState<AffectedBookings>(NO_AFFECTED);

  // ── "Cambiar desde una fecha" (apply_from) ──
  const [applyFromTarget, setApplyFromTarget] = useState<RecurringSchedule | null>(null);
  const [afDate, setAfDate] = useState('');
  const [afFields, setAfFields] = useState<AfFields | null>(null);
  const [afEndTouched, setAfEndTouched] = useState(false);
  const [afSaving, setAfSaving] = useState(false);
  const [afExisting, setAfExisting] = useState<'' | 'keep' | 'move' | 'cancel'>('move');
  const [afSubmitted, setAfSubmitted] = useState(false);
  const [afAffected, setAfAffected] = useState<AffectedBookings>(NO_AFFECTED);

  // ── "Terminar la clase" (apply_from con end_only) ──
  const [endTarget, setEndTarget] = useState<RecurringSchedule | null>(null);
  const [endDate, setEndDate] = useState('');
  const [endExisting, setEndExisting] = useState<'' | 'cancel' | 'keep'>('cancel');
  const [endSaving, setEndSaving] = useState(false);
  const [endSubmitted, setEndSubmitted] = useState(false);
  const [endAffected, setEndAffected] = useState<AffectedBookings>(NO_AFFECTED);

  // ── "Mover solo un día" (move_session) ──
  const [moveTarget, setMoveTarget] = useState<RecurringSchedule | null>(null);
  const [msDate, setMsDate] = useState('');
  const [msStart, setMsStart] = useState('');
  const [msEnd, setMsEnd] = useState('');
  const [msEndTouched, setMsEndTouched] = useState(false);
  const [msRoom, setMsRoom] = useState<number | ''>('');
  const [msSaving, setMsSaving] = useState(false);
  const [msSubmitted, setMsSubmitted] = useState(false);
  const [msAffected, setMsAffected] = useState<AffectedBookings>(NO_AFFECTED);

  // ── Elegir clase para una tarea ("¿Qué clase quieres cambiar?") ──
  const [pick, setPick] = useState<{ action: 'change' | 'move' | 'end'; date?: string } | null>(null);
  const [pickId, setPickId] = useState<number | ''>('');

  // ── Preparar el mes que viene ──
  const [planOpen, setPlanOpen] = useState(false);
  const [planBlackouts, setPlanBlackouts] = useState<{ id: number; schedule_title: string | null; start_datetime: string; end_datetime: string; reason: string | null }[] | null>(null);

  // ── Otros ──
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);
  const [blackoutPreset, setBlackoutPreset] = useState<BlackoutPreset | null>(null);
  const [busyMsg, setBusyMsg] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuSchedule, setMenuSchedule] = useState<RecurringSchedule | null>(null);
  const closeRowMenu = () => { setMenuAnchor(null); setMenuSchedule(null); };

  // ====================================================================
  // 3. FETCHERS
  // ====================================================================
  const fetchSupportData = async () => {
    setSupportDataLoading(true);
    try {
      const [classesRes, roomsRes, instructorsRes] = await Promise.all([
        fetch(`${API_BASE_URL}v1/class-types/`),
        fetch(`${API_BASE_URL}v1/rooms/`),
        fetch(`${API_BASE_URL}v1/instructors/`),
      ]);
      for (const r of [classesRes, roomsRes, instructorsRes]) if (!r.ok) throw r;

      const asList = <T,>(d: T[] | { results?: T[] }) => (Array.isArray(d) ? d : d.results || []);
      setClassTypes(asList<ClassType>(await classesRes.json()));
      setRooms(asList<Room>(await roomsRes.json()));
      setInstructor(asList<Instructor>(await instructorsRes.json()));
    } catch (err) {
      notify(`No se han podido cargar las clases, salas o instructores. ${await friendlyError(err)}`, 'error');
    } finally {
      setSupportDataLoading(false);
      setSupportReady(true);
    }
  };

  const fetchSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/recurrences/`);
      if (!res.ok) throw res;
      const data = await res.json();
      setSchedules(Array.isArray(data) ? data : data.results || []);
      setSchedulesError('');
    } catch (err) {
      setSchedulesError(await friendlyError(err));
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => {
    fetchSupportData();
    fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====================================================================
  // 4. API HANDLERS
  // ====================================================================

  const sendApiRequest = async (url: string, method: string, data?: Partial<EditableRecurringSchedule>) => {
    // BUG corregido: antes se añadían SIEMPRE price_*_override = null, así que
    // pausar/activar una clase (PATCH {is_active}) borraba su precio especial.
    const dataToSend = data
      ? {
          ...data,
          ...('price_credits_override' in data && { price_credits_override: data.price_credits_override ?? null }),
          ...('price_eur_override' in data && { price_eur_override: data.price_eur_override ?? null }),
        }
      : undefined;

    const response = await fetch(url, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: dataToSend ? JSON.stringify(dataToSend) : undefined,
    });
    if (!response.ok) throw new Error(await readApiError(response));
    await fetchSchedules();
  };

  const findAffected = (opts: Parameters<typeof fetchAffectedBookings>[0]) =>
    fetchAffectedBookings(opts).catch(() => ({ ...NO_AFFECTED, failed: true }));

  // ── Cambiar desde una fecha ────────────────────────────────────────
  const openApplyFrom = (schedule: RecurringSchedule, opts: { date?: string; fields?: Partial<AfFields> } = {}) => {
    setApplyFromTarget(schedule);
    setAfDate(opts.date || '');
    setAfSubmitted(false);
    setAfEndTouched(false);
    setAfExisting('move');
    setAfAffected(NO_AFFECTED);
    setAfFields({
      weekday: schedule.weekday ?? 0,
      start_time: hhmm(schedule.start_time),
      end_time: hhmm(schedule.end_time),
      room: schedule.room.id,
      capacity_min: schedule.capacity_min,
      capacity_max: schedule.capacity_max,
      ...opts.fields,
    });
  };

  useEffect(() => {
    if (!applyFromTarget || !afDate) { setAfAffected(NO_AFFECTED); return; }
    let off = false;
    setAfAffected({ ...NO_AFFECTED, loading: true });
    findAffected({ fromWall: `${afDate}T00:00`, scheduleId: applyFromTarget.id, search: applyFromTarget.class_type.title })
      .then((r) => { if (!off) setAfAffected(r); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyFromTarget, afDate]);

  const afChanges = useMemo(() => {
    const changes: Record<string, unknown> = {};
    if (!applyFromTarget || !afFields) return changes;
    if (afFields.weekday !== applyFromTarget.weekday) changes.weekday = afFields.weekday;
    if (afFields.start_time !== hhmm(applyFromTarget.start_time)) changes.start_time = afFields.start_time;
    if (afFields.end_time !== hhmm(applyFromTarget.end_time)) changes.end_time = afFields.end_time;
    if (afFields.room !== applyFromTarget.room.id) changes.room = afFields.room;
    if (afFields.capacity_min !== applyFromTarget.capacity_min) changes.capacity_min = afFields.capacity_min;
    if (afFields.capacity_max !== applyFromTarget.capacity_max) changes.capacity_max = afFields.capacity_max;
    return changes;
  }, [applyFromTarget, afFields]);

  const afWeekdayChanged = 'weekday' in afChanges;
  const afKeyChanged = afWeekdayChanged || 'start_time' in afChanges || 'room' in afChanges;
  const afMustChoose = afAffected.failed || afAffected.count > 0;
  // "Trasladar" solo es posible si el día de la semana no cambia (el backend lo valida)
  const afChoice: '' | 'keep' | 'move' | 'cancel' = afWeekdayChanged && afExisting === 'move' ? '' : afExisting;
  const afErrors = {
    date: !afDate ? 'Elige desde qué día cambia.' : afDate <= today ? 'Tiene que ser de mañana en adelante.' : '',
    nothing: Object.keys(afChanges).length === 0 ? 'Todavía no has cambiado nada del horario.' : '',
    onlyMinor:
      Object.keys(afChanges).length > 0 && !afKeyChanged
        ? 'Para cambiar solo la hora de fin o las plazas no hace falta programarlo: cierra esta ventana y usa «Editar» (el cambio es inmediato y no afecta a las reservas).'
        : '',
    times: afFields && afFields.end_time <= afFields.start_time ? 'La hora de fin tiene que ser después de la de inicio.' : '',
    capacity: afFields && afFields.capacity_max < 1 ? 'Pon al menos 1 plaza.' : '',
    existing: afMustChoose && !afChoice ? 'Elige qué hacemos con esas reservas.' : '',
  };
  const afHasErrors = Object.values(afErrors).some(Boolean);

  const handleApplyFrom = async () => {
    setAfSubmitted(true);
    if (!applyFromTarget || !afFields || afHasErrors) return;
    const existing = afMustChoose ? afChoice : 'keep';
    const title = applyFromTarget.class_type.title;

    setAfSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/recurrences/${applyFromTarget.id}/apply_from/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          effective_date: afDate,
          end_only: false,
          changes: afChanges,
          existing_bookings: existing,
        }),
      });
      if (!res.ok) { notify(await readApiError(res), 'error'); return; }
      const data = await res.json();
      const extra =
        data.bookings_moved > 0
          ? ` ${data.bookings_moved} ${data.bookings_moved === 1 ? 'reserva se ha pasado' : 'reservas se han pasado'} a la hora nueva y se ha avisado a cada clienta.`
          : data.bookings_cancelled > 0
            ? ` Se han cancelado ${data.bookings_cancelled} reservas, se ha devuelto lo pagado y se ha avisado a cada clienta.`
            : '';
      notify(`Cambio programado: ${title} tendrá el horario nuevo desde el ${fmtLong(afDate)}.${extra}`, 'success');
      setApplyFromTarget(null);
      fetchSchedules();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setAfSaving(false);
    }
  };

  // ── Terminar una clase (deja de darse desde una fecha) ────────────
  const openEnd = (schedule: RecurringSchedule, date?: string) => {
    setEndTarget(schedule);
    setEndDate(date || '');
    setEndExisting('cancel');
    setEndSubmitted(false);
    setEndAffected(NO_AFFECTED);
  };

  useEffect(() => {
    if (!endTarget || !endDate) { setEndAffected(NO_AFFECTED); return; }
    let off = false;
    setEndAffected({ ...NO_AFFECTED, loading: true });
    findAffected({ fromWall: `${endDate}T00:00`, scheduleId: endTarget.id, search: endTarget.class_type.title })
      .then((r) => { if (!off) setEndAffected(r); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endTarget, endDate]);

  const endLastClass = endTarget && endDate && endTarget.weekday != null
    ? lastWeekdayOnOrBefore(addDays(endDate, -1), endTarget.weekday)
    : '';
  const endMustChoose = endAffected.failed || endAffected.count > 0;
  const endErrors = {
    date: !endDate
      ? 'Elige el primer día en el que ya NO hay clase.'
      : endDate <= today
        ? 'Tiene que ser de mañana en adelante.'
        : endTarget?.end_date && endDate > endTarget.end_date
          ? `Esta clase ya deja de darse antes (última clase: ${fmtShort(endTarget.end_date)}). Elige una fecha anterior.`
          : '',
    existing: endMustChoose && !endExisting ? 'Elige qué hacemos con esas reservas.' : '',
  };
  const endHasErrors = Object.values(endErrors).some(Boolean);

  const handleEnd = async () => {
    setEndSubmitted(true);
    if (!endTarget || endHasErrors) return;
    const existing = endMustChoose ? endExisting : 'keep';
    const title = endTarget.class_type.title;

    if (existing === 'cancel' && endMustChoose) {
      const ok = await confirm({
        tone: 'danger',
        title: `¿Terminar ${title} y cancelar sus reservas?`,
        message: (
          <>
            Se {endAffected.count === 1 ? 'cancelará 1 reserva' : `cancelarán ${endAffected.failed ? 'las' : endAffected.count} reservas`} desde el{' '}
            {fmtLong(endDate)}, se devolverá lo pagado y cada clienta recibirá un aviso. <b>No se puede deshacer.</b>
          </>
        ),
        confirmText: 'Sí, terminar la clase',
      });
      if (!ok) return;
    }

    setEndSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/recurrences/${endTarget.id}/apply_from/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        // BUG corregido: antes, con "Terminar", la ventana MOSTRABA "Cancelar y
        // reembolsar" pero se enviaba 'keep' (las reservas se quedaban vivas).
        body: JSON.stringify({ effective_date: endDate, end_only: true, existing_bookings: existing }),
      });
      if (!res.ok) { notify(await readApiError(res), 'error'); return; }
      const data = await res.json();
      notify(
        `Hecho: ${title} (${whenPhrase(endTarget)}) deja de darse desde el ${fmtLong(endDate)}.` +
          (data.bookings_cancelled > 0
            ? ` Se han cancelado ${data.bookings_cancelled} reservas, se ha devuelto lo pagado y se ha avisado a cada clienta.`
            : '') +
          ' Si alguna clienta con membresía la tenía como clase fija, ya ha recibido un aviso para elegir otra.',
        'success',
      );
      setEndTarget(null);
      fetchSchedules();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setEndSaving(false);
    }
  };

  // ── Mover solo un día ─────────────────────────────────────────────
  const openMoveSession = (schedule: RecurringSchedule, date?: string) => {
    setMoveTarget(schedule);
    setMsDate(date || '');
    setMsStart(hhmm(schedule.start_time));
    setMsEnd(hhmm(schedule.end_time));
    setMsEndTouched(false);
    setMsRoom('');
    setMsSubmitted(false);
    setMsAffected(NO_AFFECTED);
  };

  useEffect(() => {
    if (!moveTarget || !msDate) { setMsAffected(NO_AFFECTED); return; }
    let off = false;
    setMsAffected({ ...NO_AFFECTED, loading: true });
    findAffected({ fromWall: `${msDate}T00:00`, toWall: `${addDays(msDate, 1)}T00:00`, scheduleId: moveTarget.id, search: moveTarget.class_type.title })
      .then((r) => { if (!off) setMsAffected(r); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveTarget, msDate]);

  const msOrigDuration = moveTarget ? minutesBetween(hhmm(moveTarget.start_time), hhmm(moveTarget.end_time)) : 60;
  const msErrors = {
    date: !msDate
      ? 'Elige qué día quieres mover.'
      : msDate < today
        ? 'Esa fecha ya ha pasado.'
        : moveTarget?.weekday != null && weekdayOf(msDate) !== moveTarget.weekday
          ? `Esa fecha no es ${WEEKDAYS[moveTarget.weekday].toLowerCase()}: esta clase solo se da los ${WEEKDAYS_PLURAL[moveTarget.weekday]}.`
          : '',
    start: !msStart ? 'Pon la hora nueva.' : '',
    end: msEnd && msStart && msEnd <= msStart ? 'La hora de fin tiene que ser después de la de inicio.' : '',
    nothing:
      moveTarget && msStart === hhmm(moveTarget.start_time) && (!msEndTouched || msEnd === hhmm(moveTarget.end_time)) && !msRoom
        ? 'Todavía no has cambiado ni la hora ni la sala.'
        : '',
  };
  const msHasErrors = Object.values(msErrors).some(Boolean);

  const handleMoveSession = async () => {
    setMsSubmitted(true);
    if (!moveTarget || msHasErrors) return;
    setMsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/recurrences/${moveTarget.id}/move_session/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          date: msDate,
          new_start_time: msStart,
          // Sin tocar la hora de fin, el servidor mantiene la misma duración
          new_end_time: msEndTouched ? msEnd || undefined : undefined,
          new_room: msRoom || undefined,
        }),
      });
      if (!res.ok) { notify(await readApiError(res), 'error'); return; }
      const data = await res.json();
      const moved = Number(data.bookings_moved || 0);
      notify(
        `Hecho: el ${fmtLong(msDate)} ${moveTarget.class_type.title} será a las ${msStart}. ` +
          (moved > 0
            ? `${moved} ${moved === 1 ? 'clienta se ha pasado' : 'clientas se han pasado'} a la hora nueva y ya tienen el aviso.`
            : 'No había nadie apuntado ese día.') +
          ' El resto de semanas sigue igual.',
        'success',
      );
      setMoveTarget(null);
      fetchSchedules();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setMsSaving(false);
    }
  };

  // ── Eliminar ──────────────────────────────────────────────────────
  const handleDeleteSchedule = async (schedule: RecurringSchedule) => {
    const title = schedule.class_type.title;
    setBusyMsg('Comprobando si hay clientas apuntadas…');
    const affected = await findAffected({ fromWall: madridWall(new Date()), scheduleId: schedule.id, search: title });
    setBusyMsg('');

    const ok = await confirm({
      tone: 'danger',
      title: `¿Eliminar ${title} (${whenPhrase(schedule)})?`,
      message: (
        <>
          <p style={{ marginTop: 0 }}>
            La clase <b>desaparece del horario desde hoy mismo</b>.
          </p>
          {affected.failed ? (
            <p>No hemos podido comprobar si hay clientas apuntadas. Si las hay:</p>
          ) : affected.count > 0 ? (
            <p>
              <b>
                Hay {affected.more ? 'más de ' : ''}
                {affected.count} {affected.count === 1 ? 'reserva' : 'reservas'} de aquí en adelante
              </b>
              {affected.names.length > 0 && ` (${affected.names.slice(0, 5).join(', ')}${affected.names.length > 5 ? '…' : ''})`}:
            </p>
          ) : (
            <p>No hay ninguna reserva de aquí en adelante.</p>
          )}
          <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
            {(affected.failed || affected.count > 0) && (
              <li>
                Se cancelan, se devuelve el crédito (a las invitadas que pagaron con tarjeta, el dinero a su tarjeta) y
                cada una recibe un aviso por email, WhatsApp y móvil.
              </li>
            )}
            {schedule.is_recurrent && (
              <li>
                Las clientas con membresía que la tienen como <b>clase fija</b> la pierden y reciben un aviso con otras
                clases parecidas para elegir (tienen 7 días).
              </li>
            )}
          </ul>
          {schedule.is_recurrent && (
            <p style={{ marginBottom: 0 }}>
              ¿Solo quieres que deje de darse <b>a partir de una fecha</b>? Usa «Terminar». ¿Solo unos días? Usa
              «Vacaciones y cierres».
            </p>
          )}
        </>
      ),
      confirmText: 'Sí, eliminar la clase',
    });
    if (!ok) return;

    try {
      await sendApiRequest(`${API_BASE_URL}v1/recurrences/${schedule.id}/`, 'DELETE');
      notify(
        `Clase eliminada: ${title} (${whenPhrase(schedule)}).` +
          (affected.count > 0 ? ' Sus reservas se han cancelado, se ha devuelto lo pagado y se ha avisado a cada clienta.' : ''),
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : await friendlyError(err), 'error');
    }
  };

  // ── Pausar / volver a ofrecer ─────────────────────────────────────
  const handleToggleActive = async (schedule: RecurringSchedule, newActiveState: boolean) => {
    const title = schedule.class_type.title;
    if (!newActiveState) {
      const ok = await confirm({
        title: `¿Pausar ${title} (${whenPhrase(schedule)})?`,
        message: (
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>Deja de salir en la web y nadie nuevo podrá apuntarse. No se borra nada.</li>
            <li>
              Las clientas que ya tenían reserva <b>la conservan</b>: no se cancela ni se les avisa.
            </li>
            <li>
              A las clientas con membresía que la tienen como clase fija no se les reservará sola mientras esté
              pausada; al volver a activarla, sí.
            </li>
            <li>
              ¿Quieres cancelar y avisar? Usa mejor «Terminar» o «Vacaciones y cierres».
            </li>
          </ul>
        ),
        confirmText: 'Sí, pausar la clase',
      });
      if (!ok) return;
    }
    try {
      await sendApiRequest(`${API_BASE_URL}v1/recurrences/${schedule.id}/`, 'PATCH', {
        is_active: newActiveState,
      } as Partial<EditableRecurringSchedule>);
      notify(
        newActiveState
          ? `${title} vuelve a estar en la web para reservar.`
          : `${title} está pausada: ya no sale en la web.`,
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : await friendlyError(err), 'error');
      fetchSchedules();
    }
  };

  // ====================================================================
  // 5. AÑADIR / EDITAR
  // ====================================================================

  const classById = (id?: number | null) => classTypes.find((c) => c.id === id) || null;
  const roomById = (id?: number | null) => rooms.find((r) => r.id === id) || null;

  const handleOpenCreate = (preset: { start_date?: string } = {}) => {
    const oneRoom = rooms.length === 1 ? rooms[0] : null;
    setCurrentSchedule({
      weekday: null,
      start_time: '10:00',
      end_time: '11:00',
      is_recurrent: true,
      capacity_min: 5,
      capacity_max: oneRoom?.capacity ? Math.min(oneRoom.capacity, 12) : 12,
      start_date: preset.start_date || today,
      end_date: null,
      is_active: true,
      price_credits_override: null,
      price_eur_override: null,
      class_type: undefined,
      room: oneRoom?.id,
      override_instructor: null,
    } as Partial<EditableRecurringSchedule>);
    setEditOriginal(null);
    setEndTouched(false);
    setCapTouched(false);
    setFormSubmitted(false);
    setEditAffected(NO_AFFECTED);
    setOpenDialog(true);
  };

  const handleOpenEdit = (schedule: RecurringSchedule) => {
    const editable: Partial<EditableRecurringSchedule> = {
      ...schedule,
      class_type: schedule.class_type.id,
      room: schedule.room.id,
      override_instructor: schedule.override_instructor ? schedule.override_instructor.id : null,
      price_credits_override: schedule.price_credits_override ? Number(schedule.price_credits_override) : null,
      price_eur_override: schedule.price_eur_override ? Number(schedule.price_eur_override) : null,
      start_time: hhmm(schedule.start_time),
      end_time: hhmm(schedule.end_time),
    };
    setCurrentSchedule(editable);
    setEditOriginal(schedule);
    setEndTouched(true); // al editar, la hora de fin se desplaza con la de inicio (misma duración)
    setCapTouched(true);
    setFormSubmitted(false);
    setOpenDialog(true);
    // ¿Cuántas reservas tiene de aquí en adelante? (para avisar si se cambia la hora)
    setEditAffected({ ...NO_AFFECTED, loading: true });
    findAffected({ fromWall: madridWall(new Date()), scheduleId: schedule.id, search: schedule.class_type.title })
      .then(setEditAffected);
  };

  const handleCloseDialog = () => {
    if (formSaving) return;
    setOpenDialog(false);
    setCurrentSchedule(null);
    setEditOriginal(null);
  };

  const setF = (patch: Partial<EditableRecurringSchedule>) =>
    setCurrentSchedule((prev) => (prev ? { ...prev, ...patch } : prev));

  const form = currentSchedule;
  const isEdit = Boolean(form?.id);
  const formClass = classById(form?.class_type);
  const formRoom = roomById(form?.room);
  const classDuration = formClass?.duration_minutes || 60;

  const onClassChange = (id: number | null) => {
    const ct = classById(id);
    const patch: Partial<EditableRecurringSchedule> = { class_type: id ?? undefined };
    if (!isEdit && ct && form?.start_time) patch.end_time = addMinutes(form.start_time, ct.duration_minutes || 60);
    setF(patch);
  };

  const onStartChange = (v: string) => {
    if (!form) return;
    const patch: Partial<EditableRecurringSchedule> = { start_time: v };
    if (v) {
      const cur = form.start_time && form.end_time ? minutesBetween(form.start_time, form.end_time) : 0;
      const dur = isEdit || endTouched ? (cur > 0 ? cur : classDuration) : classDuration;
      if (!endTouched || isEdit) patch.end_time = addMinutes(v, dur);
    }
    setF(patch);
  };

  const onRoomChange = (id: number | null) => {
    const r = roomById(id);
    const patch: Partial<EditableRecurringSchedule> = { room: id ?? undefined };
    if (!capTouched && r?.capacity) patch.capacity_max = r.capacity;
    setF(patch);
  };

  // Choques con otras clases de la misma sala
  const formConflicts = useMemo(() => {
    const res = { duplicate: null as RecurringSchedule | null, overlap: null as RecurringSchedule | null };
    if (!form || !form.room || !form.start_time || !form.end_time || form.is_active === false) return res;
    const fDate = form.is_recurrent ? null : form.start_date || null;
    const fWeekday = form.is_recurrent ? form.weekday ?? null : fDate ? weekdayOf(fDate) : null;
    if (fWeekday == null) return res;
    for (const o of schedules) {
      if (o.id === form.id || !o.is_active || o.room.id !== form.room) continue;
      // Mismo día de la semana + misma hora de inicio en la misma sala: la base de datos no lo permite
      if (form.is_recurrent && o.weekday != null && o.weekday === fWeekday && hhmm(o.start_time) === form.start_time) {
        res.duplicate = o;
        break;
      }
      if (!isCurrent(o, today)) continue;
      const sameDay = o.is_recurrent
        ? o.weekday === fWeekday &&
          (fDate
            ? (!o.start_date || o.start_date <= fDate) && (!o.end_date || o.end_date >= fDate)
            : !o.end_date || !form.start_date || o.end_date >= form.start_date)
        : fDate
          ? o.start_date === fDate
          : o.start_date != null && weekdayOf(o.start_date) === fWeekday && (!form.start_date || o.start_date >= form.start_date);
      if (sameDay && hhmm(o.start_time) < form.end_time && hhmm(o.end_time) > form.start_time) res.overlap = o;
    }
    return res;
  }, [form, schedules, today]);

  const fErrors = form
    ? {
        class_type: !form.class_type ? 'Elige qué clase es.' : '',
        weekday: form.is_recurrent && form.weekday == null ? 'Elige el día de la semana.' : '',
        // Clases antiguas pueden no tener fecha de inicio ("siempre"): solo se exige al crear
        start_date: !form.start_date && (!form.is_recurrent || !isEdit)
          ? form.is_recurrent ? 'Elige desde qué día se da.' : 'Elige la fecha.'
          : !form.start_date
            ? ''
          : !form.is_recurrent && form.start_date < today && (!isEdit || form.start_date !== editOriginal?.start_date)
            ? 'Esa fecha ya ha pasado.'
            : '',
        times: !form.start_time || !form.end_time
          ? 'Pon la hora de inicio y la de fin.'
          : form.end_time <= form.start_time
            ? 'La hora de fin tiene que ser después de la de inicio.'
            : '',
        room: !form.room ? 'Elige la sala.' : '',
        capacity: !(Number(form.capacity_max) >= 1) ? 'Pon cuántas plazas hay (1 o más).' : '',
        capacity_min: Number(form.capacity_min) > Number(form.capacity_max) ? 'El mínimo no puede ser mayor que las plazas.' : '',
        duplicate: formConflicts.duplicate
          ? `Ya hay otra clase en ${formConflicts.duplicate.room.name} ${whenPhrase(formConflicts.duplicate)} («${formConflicts.duplicate.class_type.title}»${formConflicts.duplicate.end_date && formConflicts.duplicate.end_date < today ? ', ya terminada' : ''}). El sistema no permite dos clases con la misma sala, día y hora de inicio: cambia la hora o la sala${formConflicts.duplicate.end_date && formConflicts.duplicate.end_date < today ? ', o edita esa clase antigua en vez de crear otra' : ''}.`
          : '',
      }
    : null;
  const formHasErrors = fErrors ? Object.values(fErrors).some(Boolean) : true;
  const showErr = (k: keyof NonNullable<typeof fErrors>) => (formSubmitted && fErrors ? fErrors[k] : '');

  // Al editar: ¿cambia el día, la hora o la sala de una clase semanal con reservas?
  const editTimingChanged = Boolean(
    isEdit && editOriginal && form && (
      form.weekday !== editOriginal.weekday ||
      form.start_time !== hhmm(editOriginal.start_time) ||
      form.room !== editOriginal.room.id ||
      (!form.is_recurrent && form.start_date !== editOriginal.start_date) ||
      form.is_recurrent !== editOriginal.is_recurrent
    ),
  );
  const canSuggestApplyFrom = Boolean(
    editTimingChanged && editOriginal?.is_recurrent && form?.is_recurrent && isCurrent(editOriginal, today),
  );

  const switchEditToApplyFrom = () => {
    if (!editOriginal || !form) return;
    const orig = editOriginal;
    const fields: Partial<AfFields> = {
      weekday: form.weekday ?? orig.weekday ?? 0,
      start_time: form.start_time || hhmm(orig.start_time),
      end_time: form.end_time || hhmm(orig.end_time),
      room: form.room || orig.room.id,
      capacity_min: Number(form.capacity_min ?? orig.capacity_min),
      capacity_max: Number(form.capacity_max ?? orig.capacity_max),
    };
    setOpenDialog(false);
    setCurrentSchedule(null);
    setEditOriginal(null);
    openApplyFrom(orig, { fields });
  };

  const handleSave = async () => {
    setFormSubmitted(true);
    if (!form || formHasErrors) return;
    const data: Partial<EditableRecurringSchedule> = {
      ...form,
      weekday: form.is_recurrent ? form.weekday : null,
      start_date: form.start_date || null,
    };
    const url = data.id ? `${API_BASE_URL}v1/recurrences/${data.id}/` : `${API_BASE_URL}v1/recurrences/`;
    const method = data.id ? 'PATCH' : 'POST';
    const title = formClass?.title || 'La clase';

    setFormSaving(true);
    try {
      await sendApiRequest(url, method, data);
      notify(
        isEdit
          ? `Cambios guardados en ${title}.`
          : `Clase añadida: ${title}. Ya se puede reservar en la web${data.is_active !== false ? ' y las clientas han recibido el aviso de «clase nueva»' : ''}.`,
        'success',
      );
      setOpenDialog(false);
      setCurrentSchedule(null);
      setEditOriginal(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : await friendlyError(err), 'error');
    } finally {
      setFormSaving(false);
    }
  };

  // ====================================================================
  // 6. FILTRADO, PAGINACIÓN Y CAMBIOS PROGRAMADOS
  // ====================================================================

  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        if (a.is_recurrent !== b.is_recurrent) return a.is_recurrent ? -1 : 1;
        if (a.is_recurrent) return (a.weekday ?? 9) - (b.weekday ?? 9) || a.start_time.localeCompare(b.start_time);
        return (a.start_date || '').localeCompare(b.start_date || '') || a.start_time.localeCompare(b.start_time);
      }),
    [schedules],
  );

  const counts = useMemo(() => {
    const vig = schedules.filter((s) => isCurrent(s, today)).length;
    return { vigentes: vig, pasadas: schedules.length - vig, todas: schedules.length };
  }, [schedules, today]);

  const filteredSchedules = useMemo(() => {
    const q = normalize(searchTerm.trim());
    return sortedSchedules.filter((s) => {
      const current = isCurrent(s, today);
      if (listFilter === 'vigentes' && !current) return false;
      if (listFilter === 'pasadas' && current) return false;
      if (!q) return true;
      const hay = normalize(
        [
          s.class_type.title,
          s.room.name,
          instructorOf(s),
          s.weekday != null ? WEEKDAYS[s.weekday] : '',
          s.start_date ? fmtShort(s.start_date) : '',
          hhmm(s.start_time),
        ].join(' '),
      );
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [sortedSchedules, searchTerm, listFilter, today]);

  const paginatedSchedules = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSchedules.slice(start, start + pageSize);
  }, [filteredSchedules, currentPage]);

  // Cambios programados: clases que terminan o empiezan en el futuro
  const scheduledChanges = useMemo(() => {
    const items: { key: string; date: string; text: ReactNode }[] = [];
    const ends = schedules.filter((s) => s.is_recurrent && s.weekday != null && s.end_date && s.end_date >= today);
    const starts = schedules.filter((s) => s.is_recurrent && s.weekday != null && s.start_date && s.start_date > today && s.is_active);
    const used = new Set<number>();
    for (const e of ends) {
      const next = starts.find(
        (n) => !used.has(n.id) && n.class_type.id === e.class_type.id && n.start_date === addDays(e.end_date!, 1),
      );
      if (next) {
        used.add(next.id);
        const first = nextWeekdayOnOrAfter(next.start_date!, next.weekday!);
        items.push({
          key: `c${e.id}`,
          date: next.start_date!,
          text: (
            <>
              <b>{e.class_type.title}</b> cambia de horario: hasta el {fmtShort(lastWeekdayOnOrBefore(e.end_date!, e.weekday!))}{' '}
              {WEEKDAYS_PLURAL[e.weekday!]} a las {hhmm(e.start_time)}
              {e.room.id !== next.room.id ? ` (${e.room.name})` : ''}; desde el {fmtShort(first)}, {WEEKDAYS_PLURAL[next.weekday!]} a las{' '}
              {hhmm(next.start_time)}
              {e.room.id !== next.room.id ? ` (${next.room.name})` : ''}.
            </>
          ),
        });
      } else {
        items.push({
          key: `e${e.id}`,
          date: e.end_date!,
          text: (
            <>
              <b>{e.class_type.title}</b> ({WEEKDAYS_PLURAL[e.weekday!]} a las {hhmm(e.start_time)}) deja de darse: la última clase
              es el {fmtLong(lastWeekdayOnOrBefore(e.end_date!, e.weekday!))}.
            </>
          ),
        });
      }
    }
    for (const n of starts) {
      if (used.has(n.id)) continue;
      items.push({
        key: `s${n.id}`,
        date: n.start_date!,
        text: (
          <>
            <b>{n.class_type.title}</b> ({WEEKDAYS_PLURAL[n.weekday!]} a las {hhmm(n.start_time)}, {n.room.name}) empieza el{' '}
            {fmtLong(nextWeekdayOnOrAfter(n.start_date!, n.weekday!))}.
          </>
        ),
      });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, today]);

  const pickOptions = useMemo(
    () =>
      sortedSchedules
        .filter((s) => s.is_recurrent && isCurrent(s, today))
        .map((s) => ({
          id: s.id,
          label: `${s.class_type.title} · ${s.weekday != null ? WEEKDAYS[s.weekday].toLowerCase() : ''} ${hhmm(s.start_time)}–${hhmm(s.end_time)} · ${s.room.name}${s.is_active ? '' : ' (pausada)'}`,
        })),
    [sortedSchedules, today],
  );

  const startPick = (action: 'change' | 'move' | 'end', date?: string) => {
    setPickId('');
    setPick({ action, date });
  };

  const confirmPick = () => {
    const s = schedules.find((x) => x.id === pickId);
    if (!s || !pick) return;
    const { action, date } = pick;
    setPick(null);
    if (action === 'change') openApplyFrom(s, { date });
    else if (action === 'end') openEnd(s, date);
    else openMoveSession(s, date);
  };

  // ── Preparar el mes que viene: cierres de ese mes ──
  useEffect(() => {
    if (!planOpen) return;
    setPlanBlackouts(null);
    fetch(`${API_BASE_URL}v1/blackouts/?ordering=start_datetime`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setPlanBlackouts(Array.isArray(d) ? d : d.results || []))
      .catch(() => setPlanBlackouts([]));
  }, [planOpen]);

  // 1 del mes siguiente al que viene (fin exclusivo del mes que se prepara)
  const nextMonthEnd = (() => {
    const [ny, nm] = nextMonth.split('-').map(Number);
    return nm === 12 ? `${ny + 1}-01-01` : `${ny}-${String(nm + 1).padStart(2, '0')}-01`;
  })();
  const planMonthBlackouts = (planBlackouts || []).filter((b) => {
    const s = madridWall(new Date(b.start_datetime)).substring(0, 10);
    const e = madridWall(new Date(b.end_datetime)).substring(0, 10);
    return s < nextMonthEnd && e > nextMonth && !/^Sesi[oó]n movida/i.test(b.reason || '');
  });
  const planMonthOneDay = schedules.filter(
    (s) => !s.is_recurrent && s.is_active && s.start_date && s.start_date >= nextMonth && s.start_date < nextMonthEnd,
  );
  const planMonthChanges = scheduledChanges.filter((c) => c.date < nextMonthEnd);
  const planMonthName = monthName(nextMonth);

  // ── Enlaces directos desde Inicio (?accion=…) ──
  const accion = searchParams.get('accion');
  useEffect(() => {
    if (!accion || !supportReady) return;
    if (accion === 'nueva') {
      handleOpenCreate();
    } else if (accion === 'preparar-mes') {
      setPlanOpen(true);
    } else if (accion === 'vacaciones') {
      setBlackoutPreset({ case: 'estudio' });
    }
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('accion');
        if (accion === 'vacaciones') p.set('tab', 'cierres');
        if (accion === 'nueva') p.delete('tab');
        return p;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion, supportReady]);

  const consumeBlackoutPreset = useCallback(() => setBlackoutPreset(null), []);

  const openCloseDay = (scheduleId: number, date?: string) => {
    setBlackoutPreset({ case: 'clase-dia', scheduleId, date });
    goTab(3);
  };

  // ====================================================================
  // 7. RENDER — Pestaña "Mis clases semanales"
  // ====================================================================

  const isLoading = schedulesLoading || supportDataLoading;

  const renderActions = (schedule: RecurringSchedule) => {
    const current = isCurrent(schedule, today);
    const weekly = schedule.is_recurrent && current;
    return (
      <Stack direction="row" gap={1} flexWrap={isNarrow ? 'wrap' : 'nowrap'}>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => handleOpenEdit(schedule)}
          sx={{ minHeight: 44 }}
        >
          Editar
        </Button>
        {weekly && (
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<StopCircleOutlinedIcon />}
            onClick={() => openEnd(schedule)}
            aria-label={`Terminar ${schedule.class_type.title}: dejar de darla a partir de una fecha`}
            sx={{ minHeight: 44 }}
          >
            Terminar
          </Button>
        )}
        {weekly ? (
          <Button
            variant="outlined"
            color="inherit"
            endIcon={<MoreHorizIcon />}
            onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuSchedule(schedule); }}
            sx={{ minHeight: 44 }}
          >
            Más
          </Button>
        ) : (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => handleDeleteSchedule(schedule)}
            sx={{ minHeight: 44 }}
          >
            Eliminar
          </Button>
        )}
      </Stack>
    );
  };

  const renderStatus = (schedule: RecurringSchedule) => {
    const st = statusOf(schedule, today);
    return <Chip size="small" label={st.label} color={st.color} variant="outlined" sx={{ fontSize: '0.85rem' }} />;
  };

  const renderActiveSwitch = (schedule: RecurringSchedule) => (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Switch
        checked={schedule.is_active}
        onChange={(_, checked) => handleToggleActive(schedule, checked)}
        color="success"
        inputProps={{ 'aria-label': schedule.is_active ? 'Se ofrece. Pulsa para pausarla' : 'Pausada. Pulsa para volver a ofrecerla' }}
      />
      <Typography sx={{ fontSize: '0.9rem' }}>{schedule.is_active ? 'Sí' : 'Pausada'}</Typography>
    </Stack>
  );

  const TASKS: { icon: ReactNode; title: string; text: string; onClick: () => void }[] = [
    { icon: <AddCircleOutlineIcon />, title: 'Añadir una clase', text: 'Nueva, para todas las semanas o para un solo día.', onClick: () => handleOpenCreate() },
    { icon: <EventRepeatIcon />, title: 'Cambiar la hora o el día desde una fecha', text: 'Ej.: desde octubre, Pilates pasa a las 18:00.', onClick: () => startPick('change') },
    { icon: <SwapHorizIcon />, title: 'Mover solo un día', text: 'Ej.: el jueves 9 se da a las 19:00. Las demás semanas, igual.', onClick: () => startPick('move') },
    { icon: <StopCircleOutlinedIcon />, title: 'Dejar de dar una clase', text: 'A partir de una fecha, avisando a las clientas.', onClick: () => startPick('end') },
    { icon: <BeachAccessIcon />, title: 'Cerrar días (vacaciones, festivos)', text: 'Todo el estudio o solo una clase, sin borrar nada.', onClick: () => goTab(3) },
    { icon: <CalendarMonthIcon />, title: `Preparar el horario de ${planMonthName}`, text: 'Te guiamos paso a paso por los cambios del mes que viene.', onClick: () => setPlanOpen(true) },
  ];

  const renderManagementTab = () => (
    <>
      {/* ¿Qué quieres hacer? */}
      <Typography component="h2" sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)', mt: 1, mb: 1.25 }}>
        ¿Qué quieres hacer?
      </Typography>
      <Box
        sx={{
          display: 'grid', gap: 1.25, mb: 3,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
        }}
      >
        {TASKS.map((t) => (
          <ButtonBase
            key={t.title}
            onClick={t.onClick}
            disabled={supportDataLoading && t.title === 'Añadir una clase'}
            sx={{
              textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5,
              p: 1.75, borderRadius: 3, width: '100%', minHeight: 76,
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
              {t.icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: 'var(--studio-dark)', lineHeight: 1.3 }}>{t.title}</Typography>
              <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.92rem', lineHeight: 1.4, mt: 0.25 }}>{t.text}</Typography>
            </Box>
            <ArrowForwardIcon aria-hidden sx={{ color: 'var(--studio-text-faint)' }} />
          </ButtonBase>
        ))}
      </Box>

      {/* Cambios programados */}
      {scheduledChanges.length > 0 && (
        <Alert severity="info" icon={<EventRepeatIcon />} sx={{ mb: 3, '& .MuiAlert-message': { width: '100%' } }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Cambios que ya tienes programados</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.95rem', lineHeight: 1.6 }}>
            {scheduledChanges.map((c) => <li key={c.key}>{c.text}</li>)}
          </Box>
          <Typography sx={{ fontSize: '0.9rem', mt: 0.5, color: 'text.secondary' }}>
            No tienes que hacer nada más: se aplican solos en esas fechas.
          </Typography>
        </Alert>
      )}

      <Typography component="h2" sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)', mb: 1.25 }}>
        Tus clases
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="Buscar una clase"
          placeholder="Escribe el nombre, el día, la sala o quién la da (p. ej. «lunes» o «Reformer»)"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
        <ToggleButtonGroup
          value={listFilter}
          exclusive
          onChange={(_, v) => { if (v) { setListFilter(v); setCurrentPage(1); } }}
          sx={{ flexShrink: 0, '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none', fontSize: '0.92rem', px: 1.5 } }}
        >
          <ToggleButton value="vigentes">Se dan ahora ({counts.vigentes})</ToggleButton>
          <ToggleButton value="pasadas">Terminadas ({counts.pasadas})</ToggleButton>
          <ToggleButton value="todas">Todas</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {isLoading && schedules.length === 0 ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={26} />
          <Typography>Cargando tus clases…</Typography>
        </Stack>
      ) : schedulesError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => { fetchSchedules(); fetchSupportData(); }} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
        >
          No se han podido cargar tus clases. {schedulesError}
        </Alert>
      ) : schedules.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 3 }}>
          <EmptyState
            icon={<EventNoteIcon />}
            title="Todavía no hay clases en el horario"
            text="Añade tu primera clase. Si es semanal, se repetirá sola cada semana."
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenCreate()} sx={{ minHeight: 48 }}>
                Añadir la primera clase
              </Button>
            }
          />
        </Paper>
      ) : filteredSchedules.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 3 }}>
          <EmptyState
            compact
            icon={<SearchIcon />}
            title={searchTerm ? `No hay ninguna clase que coincida con «${searchTerm}»` : 'No hay clases en este grupo'}
            text={listFilter !== 'todas' ? 'Prueba a mirar en «Todas».' : 'Prueba con otra palabra.'}
            action={
              <Button variant="outlined" onClick={() => { setSearchTerm(''); setListFilter('todas'); }} sx={{ minHeight: 44 }}>
                Ver todas las clases
              </Button>
            }
          />
        </Paper>
      ) : isNarrow ? (
        // ── Móvil / tablet: tarjetas ──
        <Stack gap={1.5}>
          {paginatedSchedules.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 3, opacity: isCurrent(s, today) ? 1 : 0.75 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} sx={{ mb: 0.5 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '1.05rem' }}>{s.class_type.title}</Typography>
                {renderStatus(s)}
              </Stack>
              <Typography sx={{ fontSize: '1rem', mb: 0.25 }}>{whenLabel(s)}</Typography>
              <Typography sx={{ fontSize: '0.93rem', color: 'text.secondary', mb: 1 }}>
                {s.room.name} · {instructorOf(s)} · {s.capacity_max} plazas
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: '0.93rem' }}>¿Se ofrece en la web?</Typography>
                {renderActiveSwitch(s)}
              </Stack>
              {renderActions(s)}
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Clase</TableCell>
                <TableCell>Cuándo</TableCell>
                <TableCell>Sala</TableCell>
                <TableCell>Quién la da</TableCell>
                <TableCell align="right">Plazas</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  ¿Se ofrece?
                  <HelpTip title="Pausar una clase">
                    Si la pausas, deja de salir en la web y nadie nuevo puede apuntarse, pero no se borra. Las que ya
                    estaban apuntadas conservan su reserva (no se les avisa). Las reservas automáticas de las
                    membresías se detienen hasta que la vuelvas a activar.
                  </HelpTip>
                </TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedSchedules.map((s) => (
                <TableRow key={s.id} sx={isCurrent(s, today) ? undefined : { opacity: 0.7 }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.class_type.title}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.95rem' }}>{whenLabel(s)}</TableCell>
                  <TableCell sx={{ fontSize: '0.95rem' }}>{s.room.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.95rem', fontWeight: s.override_instructor ? 600 : 400 }}>
                    {instructorOf(s)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.95rem' }}>{s.capacity_max}</TableCell>
                  <TableCell>{renderStatus(s)}</TableCell>
                  <TableCell>{renderActiveSwitch(s)}</TableCell>
                  <TableCell>{renderActions(s)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {filteredSchedules.length > pageSize && (
        <Pagination
          count={Math.ceil(filteredSchedules.length / pageSize) || 1}
          page={currentPage}
          onChange={(_, page) => setCurrentPage(page)}
          sx={{ mt: 2 }}
        />
      )}
    </>
  );

  // ====================================================================
  // 8. RENDER PRINCIPAL
  // ====================================================================

  const dlgActionsSx = { p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' } as const;

  // Datos para el resumen del formulario
  const formSummary = (() => {
    if (!form || !formClass || !formRoom || !form.start_time || !form.end_time) return null;
    const who = form.override_instructor
      ? instructors.find((i) => i.id === form.override_instructor)?.name
      : formClass.instructor?.name;
    const when = form.is_recurrent
      ? form.weekday != null
        ? `todos los ${WEEKDAYS_PLURAL[form.weekday]}`
        : null
      : form.start_date
        ? `el ${fmtLong(form.start_date)}`
        : null;
    if (!when) return null;
    const from =
      form.is_recurrent && form.start_date && form.weekday != null
        ? form.start_date <= today
          ? ', desde ya'
          : `, a partir del ${fmtLong(nextWeekdayOnOrAfter(form.start_date, form.weekday))}`
        : '';
    return (
      <>
        {isEdit ? 'Quedará así: ' : 'Se añadirá '}
        <b>{formClass.title}</b> <b>{when}</b> de <b>{form.start_time} a {form.end_time}</b> en <b>{formRoom.name}</b>
        {who ? <> con <b>{who}</b></> : null}, <b>{form.capacity_max} plazas</b>
        {from}.
      </>
    );
  })();

  return (
    <Box sx={{ p: { xs: 0, sm: 1, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
      <PageIntro
        pageKey="horarios"
        title="Mis clases y horarios"
        subtitle="Tu horario del estudio: las clases que se repiten cada semana, las de un solo día y los días que cierras."
        actions={
          <>
            <Button variant="outlined" startIcon={<CalendarMonthIcon />} onClick={() => setPlanOpen(true)}>
              Preparar {planMonthName}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { goTab(0); handleOpenCreate(); }}
              disabled={supportDataLoading}
            >
              Añadir una clase
            </Button>
          </>
        }
        steps={[
          {
            title: 'Las clases semanales se repiten solas',
            text: 'No hay que crearlas cada mes. Una clase de «todos los lunes» sale cada lunes hasta que tú la termines.',
          },
          {
            title: 'Para cambiar una clase, pulsa en su fila',
            text: '«Editar» corrige datos; «Terminar» la deja de dar desde una fecha; «Más» cambia la hora desde una fecha o mueve un solo día.',
          },
          {
            title: 'Para no dar clase unos días',
            text: 'Usa la pestaña «Vacaciones y cierres». No se borra nada y, al pasar esas fechas, todo sigue como siempre.',
          },
          {
            title: 'Antes de guardar, lee el resumen',
            text: 'Cada ventana te dice cuántas clientas están apuntadas y qué les pasará (si se mueven, se cancelan con devolución o se quedan igual).',
          },
        ]}
        tips={[
          'Si una clienta ya tiene reserva y cambias algo, siempre te preguntamos qué hacer con ella antes de guardar.',
          `¿Preparando el mes que viene? Pulsa «Preparar ${planMonthName}» y te llevamos paso a paso.`,
        ]}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <SectionTabs
          value={currentTab}
          onChange={(_, v: number) => { setCalendarDate(undefined); goTab(v); }}
          aria-label="Secciones del horario"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ '& .MuiTab-root': { minHeight: 52, fontSize: '0.98rem', textTransform: 'none' } }}
        >
          <Tab icon={<EventNoteIcon fontSize="small" />} iconPosition="start" label="Mis clases semanales" id="tab-0" />
          <Tab icon={<CalendarMonthIcon fontSize="small" />} iconPosition="start" label="Vista de calendario" id="tab-1" />
          <Tab icon={<PrintIcon fontSize="small" />} iconPosition="start" label="Horario para imprimir" id="tab-2" />
          <Tab icon={<BeachAccessIcon fontSize="small" />} iconPosition="start" label="Vacaciones y cierres" id="tab-3" />
        </SectionTabs>
      </Box>

      <Box role="tabpanel" hidden={currentTab !== 0}>
        {currentTab === 0 && <Box>{renderManagementTab()}</Box>}
      </Box>

      <Box role="tabpanel" hidden={currentTab !== 1}>
        {currentTab === 1 && (
          <ScheduleCalendar
            key={calendarDate ? calendarDate.toISOString() : 'hoy'}
            initialDate={calendarDate}
            onMoveDay={(sid, date) => {
              const s = schedules.find((x) => x.id === sid);
              if (s) openMoveSession(s, date);
              else notify('No encontramos esa clase en la lista. Recarga la página y vuelve a intentarlo.', 'warning');
            }}
            onCloseDay={(sid, date) => openCloseDay(sid, date)}
          />
        )}
      </Box>

      <Box role="tabpanel" hidden={currentTab !== 2}>
        {currentTab === 2 && <PrintableSchedule schedules={schedules} />}
      </Box>

      <Box role="tabpanel" hidden={currentTab !== 3}>
        {currentTab === 3 && (
          <BlackoutsManagement schedules={schedules} preset={blackoutPreset} onPresetConsumed={consumeBlackoutPreset} />
        )}
      </Box>

      {/* ── Menú "Más" de cada clase semanal ── */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeRowMenu}>
        <MenuItem onClick={() => { if (menuSchedule) openEnd(menuSchedule); closeRowMenu(); }} sx={{ py: 1.2, minWidth: 320 }}>
          <ListItemIcon><StopCircleOutlinedIcon /></ListItemIcon>
          <ListItemText
            primary="Dejar de dar esta clase a partir de…"
            secondary="Sigue hasta el día que elijas y después desaparece"
          />
        </MenuItem>
        <MenuItem onClick={() => { if (menuSchedule) openApplyFrom(menuSchedule); closeRowMenu(); }} sx={{ py: 1.2 }}>
          <ListItemIcon><EventRepeatIcon color="primary" /></ListItemIcon>
          <ListItemText
            primary="Cambiar la hora, el día o la sala desde una fecha…"
            secondary="Ej.: «desde octubre pasa a las 18:00»"
          />
        </MenuItem>
        <MenuItem onClick={() => { if (menuSchedule) openMoveSession(menuSchedule); closeRowMenu(); }} sx={{ py: 1.2 }}>
          <ListItemIcon><SwapHorizIcon color="secondary" /></ListItemIcon>
          <ListItemText primary="Mover solo un día…" secondary="Solo esa fecha cambia de hora; el resto sigue igual" />
        </MenuItem>
        <MenuItem onClick={() => { if (menuSchedule) openCloseDay(menuSchedule.id); closeRowMenu(); }} sx={{ py: 1.2 }}>
          <ListItemIcon><EventBusyIcon /></ListItemIcon>
          <ListItemText primary="Quitar solo un día…" secondary="Ese día no hay clase (festivo, imprevisto…)" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (menuSchedule) handleDeleteSchedule(menuSchedule); closeRowMenu(); }} sx={{ py: 1.2, color: 'error.main' }}>
          <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
          <ListItemText
            primary="Eliminar la clase ya…"
            secondary="La quita desde hoy y cancela todas sus reservas"
            secondaryTypographyProps={{ color: 'error.main' }}
          />
        </MenuItem>
      </Menu>

      {/* ── Aviso "comprobando…" ── */}
      <Dialog open={!!busyMsg} maxWidth="xs">
        <DialogContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <CircularProgress size={26} />
            <Typography>{busyMsg}</Typography>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* ── Elegir la clase para una tarea ── */}
      <Dialog open={!!pick} onClose={() => setPick(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontSize: '1.3rem' }}>
          {pick?.action === 'change'
            ? '¿Qué clase quieres cambiar?'
            : pick?.action === 'end'
              ? '¿Qué clase quieres dejar de dar?'
              : '¿Qué clase quieres mover un día?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2, color: 'text.secondary' }}>
            Elige la clase de la lista. Puedes escribir el nombre, el día o la hora para encontrarla.
          </Typography>
          <SearchSelect
            label="Clase"
            options={pickOptions}
            value={pickId}
            onChange={(id) => setPickId(id ? Number(id) : '')}
            helperText={pickOptions.length === 0 ? 'No hay clases semanales vigentes.' : undefined}
          />
        </DialogContent>
        <DialogActions sx={dlgActionsSx}>
          <Button variant="outlined" onClick={() => setPick(null)} sx={{ minHeight: 48 }}>No, volver</Button>
          <Button variant="contained" onClick={confirmPick} disabled={!pickId} sx={{ minHeight: 48, ml: '0 !important' }} endIcon={<ArrowForwardIcon />}>
            Continuar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Preparar el mes que viene ── */}
      <Dialog open={planOpen} onClose={() => setPlanOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontSize: '1.35rem' }}>Preparar el horario de {planMonthName}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 2.5, fontSize: '1rem' }}>
            <b>Buena noticia: las clases semanales se repiten solas.</b> Si en {planMonthName} todo sigue igual, no tienes
            que hacer nada. Aquí solo hace falta lo que <b>cambia</b>.
          </Alert>

          <Typography sx={{ fontWeight: 600, mb: 1 }}>Lo que ya está previsto para {planMonthName}</Typography>
          {planMonthChanges.length === 0 && planMonthOneDay.length === 0 && planMonthBlackouts.length === 0 ? (
            <Typography sx={{ color: 'text.secondary', mb: 2.5 }}>
              {planBlackouts === null ? 'Comprobando…' : `Nada distinto: ${planMonthName} será igual que ahora.`}
            </Typography>
          ) : (
            <Box component="ul" sx={{ mt: 0, mb: 2.5, pl: 2.5, lineHeight: 1.7, fontSize: '0.97rem' }}>
              {planMonthChanges.map((c) => <li key={c.key}>{c.text}</li>)}
              {planMonthOneDay.map((s) => (
                <li key={`o${s.id}`}>
                  Clase de un solo día: <b>{s.class_type.title}</b> el {fmtLong(s.start_date!)} a las {hhmm(s.start_time)} ({s.room.name}).
                </li>
              ))}
              {planMonthBlackouts.map((b) => (
                <li key={`b${b.id}`}>
                  Cerrado: <b>{b.schedule_title || 'todo el estudio'}</b> — {describeRange(b)}
                  {b.reason ? ` (${b.reason})` : ''}.
                </li>
              ))}
            </Box>
          )}

          <Typography sx={{ fontWeight: 600, mb: 1.5 }}>¿Qué cambia en {planMonthName}? Ve paso a paso:</Typography>
          {[
            {
              n: 1,
              q: '¿Alguna clase cambia de hora, de día o de sala?',
              hint: `Se programa desde el 1 de ${planMonthName}; hasta entonces sigue como ahora. Las clientas apuntadas se pasan solas a la hora nueva.`,
              btn: 'Cambiar una clase',
              icon: <EventRepeatIcon />,
              go: () => { setPlanOpen(false); startPick('change', nextMonth); },
            },
            {
              n: 2,
              q: '¿Alguna clase deja de darse?',
              hint: 'Eliges el último día y decides qué pasa con las clientas apuntadas después.',
              btn: 'Terminar una clase',
              icon: <StopCircleOutlinedIcon />,
              go: () => { setPlanOpen(false); startPick('end', nextMonth); },
            },
            {
              n: 3,
              q: '¿Empiezas alguna clase nueva?',
              hint: `La creamos para que empiece el 1 de ${planMonthName} (puedes cambiar la fecha).`,
              btn: 'Añadir una clase nueva',
              icon: <AddCircleOutlineIcon />,
              go: () => { setPlanOpen(false); goTab(0); handleOpenCreate({ start_date: nextMonth }); },
            },
            {
              n: 4,
              q: '¿Hay días que cierras? (festivos, puentes, vacaciones)',
              hint: 'Se cierran sin borrar nada; al pasar esas fechas todo sigue igual.',
              btn: 'Cerrar días',
              icon: <BeachAccessIcon />,
              go: () => { setPlanOpen(false); goTab(3); },
            },
            {
              n: 5,
              q: 'Revisa cómo queda',
              hint: `Abrimos el calendario en ${planMonthName} para que lo veas semana a semana. También puedes imprimir el horario nuevo.`,
              btn: `Ver ${planMonthName} en el calendario`,
              icon: <CalendarMonthIcon />,
              go: () => { setPlanOpen(false); setCalendarDate(new Date(`${nextMonth}T12:00:00`)); goTab(1); },
            },
          ].map((s) => (
            <FormStep key={s.n} n={s.n} title={s.q} hint={s.hint}>
              <Button variant="outlined" startIcon={s.icon} onClick={s.go} sx={{ minHeight: 44 }}>
                {s.btn}
              </Button>
            </FormStep>
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="contained" onClick={() => setPlanOpen(false)} sx={{ minHeight: 48 }}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Terminar una clase ── */}
      <Dialog open={!!endTarget} onClose={() => !endSaving && setEndTarget(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {endTarget && (
          <>
            <DialogTitle sx={{ fontSize: '1.3rem' }}>
              Dejar de dar {endTarget.class_type.title}
              <Typography sx={{ color: 'text.secondary', fontSize: '0.98rem' }}>
                {whenLabel(endTarget)} · {endTarget.room.name}
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              <Alert severity="info" sx={{ mb: 2.5 }}>
                <b>Terminar</b> = la clase se sigue dando hasta el día que elijas y después desaparece del horario. Se
                conserva todo el historial. (<b>Eliminar</b>, en cambio, la quita desde hoy mismo.)
              </Alert>

              <FormStep n={1} title="¿Desde qué día ya NO se da?" hint="Pulsa el primer día en el que ya no habrá clase.">
                <DatePicker
                  dates={Array.from(new Set([...upcomingDates(endTarget, 6).filter((d) => d > today), nextMonth])).sort()}
                  value={endDate}
                  onChange={setEndDate}
                  min={addDays(today, 1)}
                  error={endSubmitted && !!endErrors.date}
                  helperText={
                    (endSubmitted || endDate) && endErrors.date
                      ? endErrors.date
                      : endDate && endLastClass
                        ? endLastClass >= today
                          ? `La última clase será el ${fmtLong(endLastClass)}${endLastClass === today ? ' (hoy)' : ''}.`
                          : 'Ya no habrá ninguna clase más.'
                        : ' '
                  }
                />
              </FormStep>

              <FormStep n={2} title="¿Qué hacemos con las clientas apuntadas a partir de ese día?">
                {!endDate ? (
                  <Typography sx={{ color: 'text.secondary' }}>Cuando elijas el día te diremos si hay alguien apuntada.</Typography>
                ) : (
                  <>
                    <AffectedSummary affected={endAffected} when={`desde el ${fmtLong(endDate)}`} />
                    {endMustChoose && (
                      <Box role="radiogroup">
                        <OptionCard
                          selected={endExisting === 'cancel'}
                          onClick={() => setEndExisting('cancel')}
                          recommended
                          title="Cancelar sus reservas, devolverles lo pagado y avisarlas"
                          text="A las clientas se les devuelve el crédito; a las invitadas que pagaron con tarjeta, el dinero a la tarjeta. Cada una recibe un aviso por email, WhatsApp y notificación al móvil."
                        />
                        <OptionCard
                          selected={endExisting === 'keep'}
                          onClick={() => setEndExisting('keep')}
                          title="Dejarlas como están"
                          text="Ojo: conservarían una reserva de una clase que ya no sale en el horario, y no se les avisa. Solo si esas clases las vas a dar igualmente."
                        />
                        {endSubmitted && endErrors.existing && (
                          <Typography sx={{ color: 'error.main', fontSize: '0.9rem' }}>{endErrors.existing}</Typography>
                        )}
                      </Box>
                    )}
                    <Alert severity="info" icon={false} sx={{ mt: 1 }}>
                      <b>Clientas con membresía:</b> si alguna tiene esta clase como <b>clase fija</b>, se le quita de sus
                      clases fijas y recibe un aviso por email y en el móvil con hasta 3 clases parecidas para elegir
                      (tiene 7 días para hacerlo).
                    </Alert>
                  </>
                )}
              </FormStep>

              {endDate && !endErrors.date && (
                <SummaryBox>
                  {endLastClass && endLastClass >= today ? (
                    <>La última clase de <b>{endTarget.class_type.title}</b> ({whenPhrase(endTarget)}) será el <b>{fmtLong(endLastClass)}</b>. </>
                  ) : (
                    <><b>{endTarget.class_type.title}</b> ({whenPhrase(endTarget)}) no tendrá más clases. </>
                  )}
                  Desde el <b>{fmtLong(endDate)}</b> ya no saldrá en el horario ni en la web.{' '}
                  {endMustChoose
                    ? endExisting === 'cancel'
                      ? <>Las reservas desde esa fecha se cancelarán, se devolverá lo pagado y se avisará a cada clienta.</>
                      : endExisting === 'keep'
                        ? <>Las reservas desde esa fecha se quedan como están y no se avisa a nadie.</>
                        : <>Falta que elijas en el paso 2 qué hacer con las reservas.</>
                    : <>No hay reservas afectadas.</>}
                </SummaryBox>
              )}
            </DialogContent>
            <DialogActions sx={dlgActionsSx}>
              <Button variant="outlined" onClick={() => setEndTarget(null)} disabled={endSaving} sx={{ minHeight: 48 }}>
                No, volver
              </Button>
              <Button
                variant="contained"
                onClick={handleEnd}
                disabled={endSaving}
                startIcon={<StopCircleOutlinedIcon />}
                sx={{ minHeight: 48, ml: '0 !important' }}
              >
                {endSaving ? 'Guardando…' : 'Terminar la clase en esa fecha'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Mover solo un día ── */}
      <Dialog open={!!moveTarget} onClose={() => !msSaving && setMoveTarget(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {moveTarget && (
          <>
            <DialogTitle sx={{ fontSize: '1.3rem' }}>
              Mover un solo día de {moveTarget.class_type.title}
              <Typography sx={{ color: 'text.secondary', fontSize: '0.98rem' }}>
                {whenLabel(moveTarget)} · {moveTarget.room.name} — las demás semanas no cambian
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              <FormStep n={1} title="¿Qué día quieres mover?">
                <DatePicker
                  dates={upcomingDates(moveTarget, 8)}
                  value={msDate}
                  onChange={setMsDate}
                  min={today}
                  error={msSubmitted && !!msErrors.date}
                  helperText={
                    (msSubmitted || msDate) && msErrors.date
                      ? msErrors.date
                      : msDate
                        ? `Se mueve solo la clase del ${fmtLong(msDate)}.`
                        : 'Pulsa uno de los próximos días de esta clase.'
                  }
                />
              </FormStep>

              <FormStep n={2} title="¿A qué hora será ese día?" hint={`Ahora es de ${hhmm(moveTarget.start_time)} a ${hhmm(moveTarget.end_time)}.`}>
                <Stack direction="row" gap={2} sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    label="Nueva hora de inicio"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={msStart}
                    onChange={(e) => {
                      setMsStart(e.target.value);
                      if (!msEndTouched && e.target.value) setMsEnd(addMinutes(e.target.value, msOrigDuration));
                    }}
                    error={msSubmitted && !!msErrors.start}
                    helperText={msSubmitted && msErrors.start ? msErrors.start : ' '}
                  />
                  <TextField
                    fullWidth
                    label="Nueva hora de fin"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={msEnd}
                    onChange={(e) => { setMsEnd(e.target.value); setMsEndTouched(true); }}
                    error={!!msErrors.end}
                    helperText={msErrors.end || `Dura lo mismo (${msOrigDuration} min) salvo que la cambies`}
                  />
                </Stack>
                <SearchSelect
                  label="Sala (normalmente la misma)"
                  options={rooms.map((r) => ({ id: r.id, label: r.name }))}
                  value={msRoom}
                  onChange={(id) => setMsRoom(id ? Number(id) : '')}
                  allowEmpty
                  emptyLabel={`La misma sala (${moveTarget.room.name})`}
                />
                {msSubmitted && msErrors.nothing && (
                  <Typography sx={{ color: 'error.main', fontSize: '0.9rem', mt: 1 }}>{msErrors.nothing}</Typography>
                )}
              </FormStep>

              <FormStep n={3} title="¿Y las clientas apuntadas ese día?">
                {!msDate ? (
                  <Typography sx={{ color: 'text.secondary' }}>Cuando elijas el día te diremos si hay alguien apuntada.</Typography>
                ) : (
                  <>
                    <AffectedSummary affected={msAffected} when={`el ${fmtLong(msDate)}`} />
                    <Typography sx={{ fontSize: '0.95rem' }}>
                      No tienes que hacer nada: <b>se pasan solas a la hora nueva</b> conservando su plaza y su crédito,
                      y reciben un aviso por email y en el móvil.
                    </Typography>
                  </>
                )}
              </FormStep>

              {msDate && !msErrors.date && msStart && !msErrors.end && (
                <SummaryBox>
                  El <b>{fmtLong(msDate)}</b>, {moveTarget.class_type.title} será de <b>{msStart} a {msEnd || '—'}</b>
                  {msRoom ? <> en <b>{rooms.find((r) => r.id === msRoom)?.name}</b></> : null} en vez de a las{' '}
                  {hhmm(moveTarget.start_time)}. El resto de {moveTarget.weekday != null ? WEEKDAYS_PLURAL[moveTarget.weekday] : 'semanas'} sigue
                  igual. En «Vacaciones y cierres» verás una línea «Clase movida de hora» para ese día: es normal, no la borres.
                </SummaryBox>
              )}
            </DialogContent>
            <DialogActions sx={dlgActionsSx}>
              <Button variant="outlined" onClick={() => setMoveTarget(null)} disabled={msSaving} sx={{ minHeight: 48 }}>
                No, volver
              </Button>
              <Button
                variant="contained"
                onClick={handleMoveSession}
                disabled={msSaving}
                startIcon={<SwapHorizIcon />}
                sx={{ minHeight: 48, ml: '0 !important' }}
              >
                {msSaving ? 'Moviendo…' : 'Mover este día'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Cambiar desde una fecha ── */}
      <Dialog open={!!applyFromTarget} onClose={() => !afSaving && setApplyFromTarget(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {applyFromTarget && afFields && (
          <>
            <DialogTitle sx={{ fontSize: '1.3rem' }}>
              Cambiar {applyFromTarget.class_type.title} a partir de una fecha
              <Typography sx={{ color: 'text.secondary', fontSize: '0.98rem' }}>
                Ahora: {whenLabel(applyFromTarget)} · {applyFromTarget.room.name} · {applyFromTarget.capacity_max} plazas
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              <Alert severity="info" sx={{ mb: 2.5 }}>
                Hasta la víspera del día que elijas, la clase sigue <b>como ahora</b>. Desde ese día, con el horario
                nuevo. No tienes que volver a crearla.
              </Alert>

              <FormStep n={1} title="¿Desde qué día cambia?" hint="Pulsa el primer día con el horario nuevo.">
                <DatePicker
                  dates={Array.from(new Set([...upcomingDates(applyFromTarget, 5).filter((d) => d > today), nextMonth])).sort()}
                  value={afDate}
                  onChange={setAfDate}
                  min={addDays(today, 1)}
                  error={afSubmitted && !!afErrors.date}
                  helperText={
                    (afSubmitted || afDate) && afErrors.date
                      ? afErrors.date
                      : afDate && applyFromTarget.weekday != null
                        ? `Última clase como ahora: ${fmtLong(lastWeekdayOnOrBefore(addDays(afDate, -1), applyFromTarget.weekday))}. Primera con el horario nuevo: ${fmtLong(nextWeekdayOnOrAfter(afDate, afFields.weekday))}.`
                        : ' '
                  }
                />
              </FormStep>

              <FormStep n={2} title="¿Cómo queda?" hint="Cambia solo lo que sea distinto; lo demás se queda igual.">
                <Typography sx={{ fontSize: '0.95rem', mb: 1 }}>Día de la semana</Typography>
                <ToggleButtonGroup
                  value={afFields.weekday}
                  exclusive
                  onChange={(_, v) => { if (v !== null) setAfFields((p) => ({ ...p!, weekday: Number(v) })); }}
                  sx={{ mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { minHeight: 44, minWidth: 44, textTransform: 'none' } }}
                >
                  {WEEKDAYS.map((d, i) => (
                    <ToggleButton key={d} value={i} aria-label={d}>{isMobile ? d.substring(0, 2) : d}</ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Stack direction="row" gap={2} sx={{ mb: 1 }}>
                  <TextField
                    fullWidth
                    label="Hora de inicio"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={afFields.start_time}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAfFields((p) => {
                        if (!p) return p;
                        const dur = minutesBetween(p.start_time, p.end_time);
                        return { ...p, start_time: v, end_time: !afEndTouched && v && dur > 0 ? addMinutes(v, dur) : p.end_time };
                      });
                    }}
                  />
                  <TextField
                    fullWidth
                    label="Hora de fin"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={afFields.end_time}
                    onChange={(e) => { setAfEndTouched(true); setAfFields((p) => ({ ...p!, end_time: e.target.value })); }}
                    error={!!afErrors.times}
                    helperText={afErrors.times || ' '}
                  />
                </Stack>
                <SearchSelect
                  label="Sala"
                  options={rooms.map((r) => ({ id: r.id, label: r.capacity ? `${r.name} (caben ${r.capacity})` : r.name }))}
                  value={afFields.room}
                  onChange={(id) => { if (id) setAfFields((p) => ({ ...p!, room: Number(id) })); }}
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="Plazas"
                  type="number"
                  value={afFields.capacity_max}
                  onChange={(e) => setAfFields((p) => ({ ...p!, capacity_max: Number(e.target.value) }))}
                  inputProps={{ min: 1 }}
                  error={!!afErrors.capacity}
                  helperText={afErrors.capacity || 'Cuántas clientas pueden apuntarse como máximo'}
                  sx={{ maxWidth: 260 }}
                />
                {Object.keys(afChanges).length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, mb: 0.5 }}>Lo que cambia:</Typography>
                    <Stack direction="row" gap={1} flexWrap="wrap">
                      {'weekday' in afChanges && applyFromTarget.weekday != null && (
                        <Chip label={`${WEEKDAYS[applyFromTarget.weekday]} → ${WEEKDAYS[afFields.weekday]}`} color="primary" variant="outlined" />
                      )}
                      {('start_time' in afChanges || 'end_time' in afChanges) && (
                        <Chip label={`${hhmm(applyFromTarget.start_time)}–${hhmm(applyFromTarget.end_time)} → ${afFields.start_time}–${afFields.end_time}`} color="primary" variant="outlined" />
                      )}
                      {'room' in afChanges && (
                        <Chip label={`${applyFromTarget.room.name} → ${rooms.find((r) => r.id === afFields.room)?.name || ''}`} color="primary" variant="outlined" />
                      )}
                      {'capacity_max' in afChanges && (
                        <Chip label={`${applyFromTarget.capacity_max} → ${afFields.capacity_max} plazas`} color="primary" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                )}
                {(afSubmitted || Object.keys(afChanges).length > 0) && (afErrors.nothing || afErrors.onlyMinor) && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>{afErrors.nothing || afErrors.onlyMinor}</Alert>
                )}
              </FormStep>

              <FormStep n={3} title="¿Qué hacemos con las clientas ya apuntadas desde ese día?">
                {!afDate ? (
                  <Typography sx={{ color: 'text.secondary' }}>Cuando elijas el día te diremos si hay alguien apuntada.</Typography>
                ) : (
                  <>
                    <AffectedSummary affected={afAffected} when={`desde el ${fmtLong(afDate)}`} />
                    {afMustChoose && (
                      <Box role="radiogroup">
                        <OptionCard
                          selected={afChoice === 'move'}
                          onClick={() => setAfExisting('move')}
                          disabled={afWeekdayChanged}
                          recommended={!afWeekdayChanged}
                          title="Pasarlas a la hora nueva"
                          text={
                            afWeekdayChanged
                              ? 'No se puede porque cambia el día de la semana: elige una de las otras dos.'
                              : 'Conservan su plaza y su crédito en la misma fecha, a la hora o sala nueva. Reciben un aviso por email y en el móvil.'
                          }
                        />
                        <OptionCard
                          selected={afChoice === 'cancel'}
                          onClick={() => setAfExisting('cancel')}
                          recommended={afWeekdayChanged}
                          title="Cancelar sus reservas, devolverles lo pagado y avisarlas"
                          text="A las clientas se les devuelve el crédito; a las invitadas que pagaron con tarjeta, el dinero. Aviso por email, WhatsApp y móvil."
                        />
                        <OptionCard
                          selected={afChoice === 'keep'}
                          onClick={() => setAfExisting('keep')}
                          title="Dejarlas como están (a la hora de antes)"
                          text="Siguen apuntadas al horario antiguo y no se les avisa. Solo si esas clases las vas a dar igualmente."
                        />
                        {afSubmitted && afErrors.existing && (
                          <Typography sx={{ color: 'error.main', fontSize: '0.9rem' }}>{afErrors.existing}</Typography>
                        )}
                      </Box>
                    )}
                    <Alert severity="info" icon={false} sx={{ mt: 1 }}>
                      <b>Clientas con membresía:</b> las que tienen esta clase como <b>clase fija</b> pasan solas al
                      horario nuevo: desde esa fecha se les reservará automáticamente con el horario nuevo.
                      {afWeekdayChanged && ' Como cambia el día, no reciben un aviso aparte: si quieres, avísalas desde «Avisos a clientas».'}
                    </Alert>
                  </>
                )}
              </FormStep>

              {afDate && !afErrors.date && !afErrors.nothing && !afErrors.onlyMinor && !afErrors.times && applyFromTarget.weekday != null && (
                <SummaryBox>
                  Hasta el <b>{fmtLong(lastWeekdayOnOrBefore(addDays(afDate, -1), applyFromTarget.weekday))}</b>,{' '}
                  {applyFromTarget.class_type.title} sigue {whenPhrase(applyFromTarget)}. Desde el{' '}
                  <b>{fmtLong(nextWeekdayOnOrAfter(afDate, afFields.weekday))}</b> será{' '}
                  <b>los {WEEKDAYS_PLURAL[afFields.weekday]} de {afFields.start_time} a {afFields.end_time}</b> en{' '}
                  <b>{rooms.find((r) => r.id === afFields.room)?.name || applyFromTarget.room.name}</b>, {afFields.capacity_max} plazas.{' '}
                  {afMustChoose
                    ? afChoice === 'move'
                      ? 'Las clientas apuntadas desde esa fecha se pasan a la hora nueva y se les avisa.'
                      : afChoice === 'cancel'
                        ? 'Las reservas desde esa fecha se cancelan, se devuelve lo pagado y se avisa a cada clienta.'
                        : afChoice === 'keep'
                          ? 'Las reservas desde esa fecha se quedan en el horario antiguo y no se avisa a nadie.'
                          : 'Falta que elijas en el paso 3 qué hacer con las reservas.'
                    : 'No hay reservas afectadas.'}
                </SummaryBox>
              )}
            </DialogContent>
            <DialogActions sx={dlgActionsSx}>
              <Button variant="outlined" onClick={() => setApplyFromTarget(null)} disabled={afSaving} sx={{ minHeight: 48 }}>
                No, volver
              </Button>
              <Button
                variant="contained"
                onClick={handleApplyFrom}
                disabled={afSaving}
                startIcon={<EventRepeatIcon />}
                sx={{ minHeight: 48, ml: '0 !important' }}
              >
                {afSaving ? 'Guardando…' : 'Programar el cambio'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Añadir / editar una clase ── */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth fullScreen={isMobile}>
        {form && (
          <>
            <DialogTitle sx={{ fontSize: '1.3rem' }}>
              {isEdit && editOriginal
                ? `Editar ${editOriginal.class_type.title} (${whenPhrase(editOriginal)})`
                : 'Añadir una clase al horario'}
            </DialogTitle>
            <DialogContent dividers>
              {isEdit && editOriginal?.is_recurrent && (
                <Alert severity="info" sx={{ mb: 2.5 }}>
                  Lo que cambies aquí vale <b>desde ya y para todas las semanas</b>. Si es un cambio de hora o de día a
                  partir de una fecha, usa mejor «Más → Cambiar desde una fecha».
                </Alert>
              )}

              <FormStep n={1} title="¿Qué clase es?">
                <SearchSelect
                  label="Tipo de clase"
                  options={classTypes.map((c) => ({ id: c.id, label: c.title }))}
                  value={form.class_type || ''}
                  onChange={(id) => onClassChange(id ? Number(id) : null)}
                  disabled={supportDataLoading}
                  helperText={
                    showErr('class_type') ||
                    (formClass
                      ? `Dura normalmente ${formClass.duration_minutes || 60} minutos.`
                      : 'Escribe el nombre para encontrarla. Si no está, créala antes en «Tipos de clase».')
                  }
                />
              </FormStep>

              <FormStep n={2} title="¿Se repite cada semana o es un solo día?">
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <ToggleButtonGroup
                    value={form.is_recurrent ? 'semanal' : 'dia'}
                    exclusive
                    onChange={(_, v) => {
                      if (!v) return;
                      const weekly = v === 'semanal';
                      setF({
                        is_recurrent: weekly,
                        weekday: weekly ? (form.weekday ?? (form.start_date ? weekdayOf(form.start_date) : null)) : null,
                      });
                    }}
                    sx={{ flex: 1, '& .MuiToggleButton-root': { minHeight: 48, flex: 1, textTransform: 'none', fontSize: '0.98rem' } }}
                  >
                    <ToggleButton value="semanal"><EventRepeatIcon fontSize="small" sx={{ mr: 0.75 }} />Todas las semanas</ToggleButton>
                    <ToggleButton value="dia"><EventNoteIcon fontSize="small" sx={{ mr: 0.75 }} />Un solo día</ToggleButton>
                  </ToggleButtonGroup>
                  <HelpTip title="¿Semanal o de un solo día?">
                    <b>Todas las semanas:</b> se repite sola cada semana el mismo día y a la misma hora. No hay que
                    crearla cada mes.
                    <br />
                    <b>Un solo día:</b> una clase suelta en una fecha concreta (un taller, una clase extra).
                  </HelpTip>
                </Stack>
              </FormStep>

              <FormStep n={3} title="¿Qué día y a qué hora?">
                {form.is_recurrent ? (
                  <>
                    <ToggleButtonGroup
                      value={form.weekday ?? null}
                      exclusive
                      onChange={(_, v) => { if (v !== null) setF({ weekday: Number(v) }); }}
                      sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { minHeight: 44, minWidth: 44, textTransform: 'none' } }}
                      aria-label="Día de la semana"
                    >
                      {WEEKDAYS.map((d, i) => (
                        <ToggleButton key={d} value={i} aria-label={d}>{isMobile ? d.substring(0, 2) : d}</ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                    <Typography sx={{ fontSize: '0.88rem', color: showErr('weekday') ? 'error.main' : 'text.secondary', mt: 0.5, mb: 2 }}>
                      {showErr('weekday') || (form.weekday != null ? `Todos los ${WEEKDAYS_PLURAL[form.weekday]}.` : 'Pulsa el día.')}
                    </Typography>
                    <Stack direction="row" alignItems="flex-start" gap={0.5} sx={{ mb: 2 }}>
                      <TextField
                        label="¿Desde qué día se da?"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={form.start_date || ''}
                        onChange={(e) => setF({ start_date: e.target.value })}
                        error={!!showErr('start_date')}
                        helperText={
                          showErr('start_date') ||
                          (form.start_date && form.weekday != null
                            ? form.start_date <= today
                              ? 'Desde ya (se puede reservar en cuanto la guardes).'
                              : `Primera clase: ${fmtLong(nextWeekdayOnOrAfter(form.start_date, form.weekday))}.`
                            : 'Normalmente hoy. Si es para el mes que viene, el día 1 de ese mes.')
                        }
                        sx={{ minWidth: 240 }}
                      />
                      <HelpTip title="¿Desde qué día?">
                        Antes de esa fecha la clase no aparece en la web. Útil para dejar preparada una clase nueva que
                        empieza el mes que viene.
                      </HelpTip>
                    </Stack>
                  </>
                ) : (
                  <TextField
                    label="Fecha de la clase"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: isEdit ? undefined : today }}
                    value={form.start_date || ''}
                    onChange={(e) => setF({ start_date: e.target.value })}
                    error={!!showErr('start_date')}
                    helperText={showErr('start_date') || (form.start_date ? fmtLong(form.start_date) : 'Elige el día.')}
                    sx={{ mb: 2, minWidth: 240 }}
                  />
                )}
                <Stack direction="row" gap={2}>
                  <TextField
                    fullWidth
                    label="Empieza a las"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={form.start_time || ''}
                    onChange={(e) => onStartChange(e.target.value)}
                    error={!!showErr('times')}
                  />
                  <TextField
                    fullWidth
                    label="Termina a las"
                    type="time"
                    InputLabelProps={{ shrink: true }}
                    value={form.end_time || ''}
                    onChange={(e) => { setEndTouched(true); setF({ end_time: e.target.value }); }}
                    error={!!(showErr('times') || (form.start_time && form.end_time && form.end_time <= form.start_time))}
                  />
                </Stack>
                <Typography
                  sx={{
                    fontSize: '0.88rem', mt: 0.5,
                    color: fErrors?.times && (formSubmitted || (form.start_time && form.end_time)) ? 'error.main' : 'text.secondary',
                  }}
                >
                  {fErrors?.times && (formSubmitted || (form.start_time && form.end_time))
                    ? fErrors.times
                    : form.start_time && form.end_time
                      ? `Dura ${minutesBetween(form.start_time, form.end_time)} minutos.${!endTouched || isEdit ? ' Si cambias la hora de inicio, la de fin se ajusta sola.' : ''}`
                      : ' '}
                </Typography>
              </FormStep>

              <FormStep n={4} title="¿Dónde y con quién?">
                <Stack direction="row" alignItems="flex-start" gap={0.5} sx={{ mb: 2 }}>
                  <SearchSelect
                    label="Sala"
                    options={rooms.map((r) => ({ id: r.id, label: r.capacity ? `${r.name} (caben ${r.capacity})` : r.name }))}
                    value={form.room || ''}
                    onChange={(id) => onRoomChange(id ? Number(id) : null)}
                    disabled={supportDataLoading}
                    helperText={showErr('room') || 'El espacio del estudio donde se da.'}
                    sx={{ flex: 1 }}
                  />
                  <HelpTip title="¿Qué es la sala?">
                    Es el espacio del estudio donde se da la clase. Cada sala tiene un <b>aforo</b>: cuántas personas
                    caben como máximo. Las salas se crean y cambian en «Salas» del menú.
                  </HelpTip>
                </Stack>
                <Stack direction="row" alignItems="flex-start" gap={0.5}>
                  <SearchSelect
                    label="¿La da otra persona? (opcional)"
                    options={instructors.map((i) => ({ id: i.id, label: i.name }))}
                    value={form.override_instructor ?? ''}
                    onChange={(id) => setF({ override_instructor: id ? Number(id) : null })}
                    disabled={supportDataLoading}
                    allowEmpty
                    emptyLabel={formClass?.instructor ? `No, la de siempre (${formClass.instructor.name})` : 'No, la de siempre'}
                    helperText={
                      formClass?.instructor
                        ? `Normalmente la da ${formClass.instructor.name}. Elige a otra persona solo si esta clase la da alguien distinto.`
                        : 'Elige a otra persona solo si esta clase la da alguien distinto.'
                    }
                    sx={{ flex: 1 }}
                  />
                  <HelpTip title="¿Quién da la clase?">
                    Por defecto la da la persona asignada al tipo de clase (en «Tipos de clase»). Aquí puedes poner a
                    otra solo para esta clase, por ejemplo si los martes la da una sustituta.
                  </HelpTip>
                </Stack>
              </FormStep>

              <FormStep n={5} title="¿Cuántas plazas?">
                <Stack direction="row" alignItems="flex-start" gap={0.5}>
                  <TextField
                    label="Plazas"
                    type="number"
                    value={form.capacity_max ?? ''}
                    onChange={(e) => { setCapTouched(true); setF({ capacity_max: Number(e.target.value) }); }}
                    inputProps={{ min: 1 }}
                    error={!!showErr('capacity')}
                    helperText={
                      showErr('capacity') ||
                      (formRoom?.capacity && Number(form.capacity_max) > formRoom.capacity
                        ? `Ojo: en ${formRoom.name} caben ${formRoom.capacity}. Pon ${formRoom.capacity} o menos.`
                        : formRoom?.capacity
                          ? `En ${formRoom.name} caben ${formRoom.capacity}.`
                          : 'Cuántas clientas pueden apuntarse como máximo.')
                    }
                    FormHelperTextProps={{ sx: formRoom?.capacity && Number(form.capacity_max) > formRoom.capacity ? { color: 'warning.dark' } : undefined }}
                    sx={{ maxWidth: 280 }}
                  />
                  <HelpTip title="¿Qué son las plazas (aforo)?">
                    Es cuántas clientas pueden apuntarse como máximo. Cuando se llena, la web ya no deja reservar. No
                    debería ser más de lo que cabe en la sala.
                  </HelpTip>
                </Stack>
              </FormStep>

              <Accordion disableGutters elevation={0} sx={{ mb: 2, border: '1px solid rgb(var(--studio-line-rgb) / 0.35)', borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
                  <Typography sx={{ fontSize: '0.98rem' }}>Opciones poco habituales (precio especial, mínimo de clientas)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography sx={{ fontSize: '0.93rem', color: 'text.secondary', mb: 1.5 }}>
                    Déjalo vacío para cobrar el precio normal
                    {formClass ? ` de ${formClass.title}: ${credLabel(formClass.default_price_credits)}` : ''}
                    {formClass && Number(formClass.default_price_eur) > 0 ? ` o ${money(formClass.default_price_eur, { decimals: 'auto' })}` : ''}. (Suelo
                    suele ser 1 crédito; máquinas —Reformer y Chair—, 2.)
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 2 }}>
                    <TextField
                      fullWidth
                      label="Precio especial en créditos"
                      type="number"
                      value={form.price_credits_override ?? ''}
                      onChange={(e) => setF({ price_credits_override: e.target.value ? Number(e.target.value) : null })}
                      helperText="Vacío = precio normal"
                    />
                    <TextField
                      fullWidth
                      label="Precio especial con tarjeta"
                      type="number"
                      value={form.price_eur_override ?? ''}
                      onChange={(e) => setF({ price_eur_override: e.target.value ? Number(e.target.value) : null })}
                      InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol()}</InputAdornment> }}
                      helperText="Para quien paga sin bono. Vacío = precio normal"
                    />
                  </Stack>
                  <Stack direction="row" alignItems="flex-start" gap={0.5}>
                    <TextField
                      label="Mínimo de clientas"
                      type="number"
                      value={form.capacity_min ?? ''}
                      onChange={(e) => setF({ capacity_min: Number(e.target.value) })}
                      error={!!fErrors?.capacity_min}
                      helperText={fErrors?.capacity_min || 'Solo orientativo'}
                      sx={{ maxWidth: 220 }}
                    />
                    <HelpTip title="Mínimo de clientas">
                      Con cuántas clientas merece la pena dar la clase. Ahora mismo es solo orientativo: la clase{' '}
                      <b>no</b> se cancela sola si no se llega.
                    </HelpTip>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Avisos y consecuencias */}
              {fErrors?.duplicate && (
                <Alert severity="error" sx={{ mb: 2 }}>{fErrors.duplicate}</Alert>
              )}
              {!fErrors?.duplicate && formConflicts.overlap && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Ojo: en {formConflicts.overlap.room.name} ya hay «{formConflicts.overlap.class_type.title}»{' '}
                  {whenPhrase(formConflicts.overlap)} (hasta las {hhmm(formConflicts.overlap.end_time)}). Las dos clases
                  coincidirían en la misma sala. Revisa la hora o la sala.
                </Alert>
              )}

              {isEdit && editTimingChanged && (
                <Alert
                  severity="warning"
                  sx={{ mb: 2 }}
                  action={
                    canSuggestApplyFrom ? (
                      <Button color="inherit" onClick={switchEditToApplyFrom} sx={{ minHeight: 44, whiteSpace: 'normal', textAlign: 'center' }}>
                        Hacerlo desde una fecha
                      </Button>
                    ) : undefined
                  }
                >
                  <b>Ojo, cambias el día, la hora o la sala.</b>{' '}
                  {editAffected.loading
                    ? 'Comprobando si hay clientas apuntadas…'
                    : editAffected.failed
                      ? 'No hemos podido comprobar si hay clientas apuntadas.'
                      : editAffected.count > 0
                        ? `Esta clase tiene ${editAffected.count} ${editAffected.count === 1 ? 'reserva' : 'reservas'} de aquí en adelante.`
                        : 'No tiene reservas de aquí en adelante, así que no afecta a nadie.'}{' '}
                  {(editAffected.failed || editAffected.count > 0) && (
                    <>
                      Si guardas aquí, esas reservas <b>no se mueven</b>: se quedan con la hora de antes y no se avisa a
                      nadie.
                      {canSuggestApplyFrom && ' Es mejor «Hacerlo desde una fecha»: las pasa a la hora nueva y las avisa.'}
                    </>
                  )}
                </Alert>
              )}

              {formSummary && (
                <SummaryBox>
                  {formSummary}
                  {!isEdit && form.is_active !== false && (
                    <>
                      {' '}Al guardarla, <b>todas las clientas recibirán un email y una notificación en el móvil</b>{' '}
                      anunciando la clase nueva.
                    </>
                  )}
                </SummaryBox>
              )}
              {formSubmitted && formHasErrors && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  Falta algo por rellenar o hay algo que corregir: revisa los mensajes en rojo.
                </Alert>
              )}
            </DialogContent>

            <DialogActions sx={dlgActionsSx}>
              <Button variant="outlined" onClick={handleCloseDialog} disabled={formSaving} sx={{ minHeight: 48 }}>
                No, volver
              </Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={formSaving || supportDataLoading}
                sx={{ minHeight: 48, ml: '0 !important' }}
              >
                {formSaving ? 'Guardando…' : isEdit ? 'Guardar los cambios' : 'Añadir la clase'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
