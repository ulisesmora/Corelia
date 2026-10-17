import { useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeaders } from '../utils/auth';
import {
  Box, Typography, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Pagination, TextField,
  Alert, Tab, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Select, MenuItem, FormControl, InputLabel, Stack, InputAdornment,
  useTheme, useMediaQuery, GlobalStyles, IconButton,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PeopleIcon from '@mui/icons-material/People';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import CloseIcon from '@mui/icons-material/Close';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SearchIcon from '@mui/icons-material/Search';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { SectionTabs, PageIntro, HelpTip, EmptyState, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import '../calendar.css';

// --- Dependencias del Calendario ---
import {
  Calendar,
  dateFnsLocalizer,
  Event as BigCalendarEvent,
  View,
  Views,
} from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { es } from 'date-fns/locale/es';
// date-fns-tz not needed: UTC strings with Z suffix are converted by the Madrid browser automatically

// Dependencias para calcular el rango de fechas dinámico
import { startOfDay } from 'date-fns/startOfDay';
import { endOfDay } from 'date-fns/endOfDay';
import { endOfWeek } from 'date-fns/endOfWeek';
import { startOfMonth } from 'date-fns/startOfMonth';
import { endOfMonth } from 'date-fns/endOfMonth';
import { addDays } from 'date-fns/addDays';

import 'react-big-calendar/lib/css/react-big-calendar.css';

// Configuración del localizador
const locales = { es: es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales,
});


/**
 * Devuelve un Date cuyos componentes locales (getHours, getMinutes, getDate…)
 * representan la hora de Madrid SIN IMPORTAR la zona del navegador.
 * Esto permite que react-big-calendar (que usa getHours del browser) posicione
 * los eventos en la cuadrícula correctamente aunque el admin esté en otra TZ.
 *
 * El timestamp UTC interno NO será el real — solo úsalo para el render del Calendar.
 * Para llamadas a la API o mostrar fechas con timeZone, usa el ISO original.
 */
function toMadridLocal(utcDate: Date): Date {
  // 'sv-SE' devuelve formato ISO: "YYYY-MM-DD HH:MM:SS"
  const madridStr = utcDate.toLocaleString('sv-SE', { timeZone: TIMEZONE });
  // Al parsear sin sufijo Z, JS interpreta como hora local del navegador
  // → getHours() del Date resultante = hora Madrid en cualquier navegador
  return new Date(madridStr.replace(' ', 'T'));
}

import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TIMEZONE } from '../site/timezone';

// Formatos de fecha en hora de Madrid ("lunes 29 de septiembre", "09:30", "lun, 29 sept")
const longDateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE });
const shortDateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIMEZONE });
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });

const longDate = (iso: string) => longDateFmt.format(new Date(iso));
const shortDateTime = (iso: string | null) =>
  iso ? `${shortDateFmt.format(new Date(iso))} · ${timeFmt.format(new Date(iso))}` : 'Sin fecha';
const hour = (iso: string) => timeFmt.format(new Date(iso));

function waLink(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 9) digits = `34${digits}`; // móvil español sin prefijo
  return digits.length >= 9 ? `https://wa.me/${digits}` : null;
}

// ====================================================================
// 1. INTERFACES
// ====================================================================

interface Booking {
  id: number;
  status: string;
  start_datetime: string;
  end_datetime: string;
  who: string | null;
  who_email: string | null;
  who_phone: string | null;
  what: string;
  room_name?: string;
  occurrence_id?: number;
}

interface Participant {
  bookingId: number;
  name: string;
  email: string | null;
  phone: string | null;
}

interface CalendarEventData {
  participantCount: number;
  participants: Participant[];
  colorClass: string;
  className: string;
  roomName?: string;
  occurrence_id?: number;
  // ISO original (UTC) — usar para llamadas a API y para el display con timeZone:Madrid
  startISO: string;
  endISO: string;
}

// Sobrescribimos start, end y title para que sean estrictos y evitar errores de TS
interface AggregatedEvent extends Omit<BigCalendarEvent, 'start' | 'end' | 'title'> {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: CalendarEventData;
}

// Estados de la reserva en lenguaje llano
const STATUS_INFO: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default'; help: string }> = {
  reserved: { label: 'Reservada', color: 'success', help: 'Tiene su plaza guardada.' },
  pending: { label: 'Pendiente de pago', color: 'warning', help: 'Empezó a pagar por la web pero no terminó el pago.' },
  canceled: { label: 'Cancelada', color: 'default', help: 'Ya no viene: la plaza quedó libre.' },
  failed: { label: 'Pago fallido', color: 'error', help: 'El pago no se completó.' },
  attended: { label: 'Vino a clase', color: 'info', help: 'Asistió a la clase.' },
  no_show: { label: 'No vino', color: 'warning', help: 'Tenía plaza pero no se presentó.' },
  refunded: { label: 'Devuelta', color: 'default', help: 'Se le devolvió el dinero.' },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'reserved', label: 'Reservadas' },
  { value: 'canceled', label: 'Canceladas' },
  { value: 'pending', label: 'Pendientes de pago' },
];

// Colores de la franja según cuántas personas vienen (mismas clases CSS de siempre)
const OCCUPANCY_LEGEND = [
  { cls: 'room-rose', color: '#C2857A', label: '1 a 4 personas' },
  { cls: 'room-amber', color: '#D4A574', label: '5 a 9 personas' },
  { cls: 'room-green', color: '#7D9B6C', label: '10 o más' },
];
const colorOf = (cls: string) => OCCUPANCY_LEGEND.find((l) => l.cls === cls)?.color || 'var(--studio-primary)';

// Estilos globales — diseño zen con franja de color (solo dentro de esta pantalla)
const calendarGlobalStyles = (
  <GlobalStyles
    styles={`
    .bookings-cal .rbc-event::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 5px;
      border-radius: 12px 0 0 12px;
    }
    .bookings-cal .rbc-event.room-green::before { background: #7D9B6C; }
    .bookings-cal .rbc-event.room-amber::before { background: #D4A574; }
    .bookings-cal .rbc-event.room-rose::before { background: #C2857A; }
    .bookings-cal .rbc-event.room-taupe::before { background: var(--studio-primary); }
    .bookings-cal .rbc-event.room-blue::before { background: #8BA0A3; }
    .bookings-cal .rbc-event { cursor: pointer; }

    .bookings-cal .rbc-toolbar { flex-wrap: wrap; }
    .bookings-cal .rbc-toolbar button { min-height: 44px; font-size: 0.95rem; padding: 6px 14px; }

    .bookings-cal .rbc-time-view .rbc-time-header-content > .rbc-row:not(.rbc-time-header-cell) {
      display: none !important;
    }
  `}
  />
);

// ====================================================================
// 2. COMPONENTE PRINCIPAL
// ====================================================================

export default function BookingViewer() {
  const confirm = useConfirm();
  const notify = useNotify();
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState(0);

  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');

  // --- ESTADO 1: CALENDARIO (Solo confirmadas) ---
  const [calendarBookings, setCalendarBookings] = useState<Booking[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // --- ESTADO 2: TABLA (Todas las reservas) ---
  const [tableBookings, setTableBookings] = useState<Booking[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState('');

  // Estados de UI de la tabla
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTableCount, setTotalTableCount] = useState(0);
  const pageSize = 15;

  const [selectedEvent, setSelectedEvent] = useState<AggregatedEvent | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [cancellingClass, setCancellingClass] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Por debajo de 900 px la lista se ve en tarjetas (la tabla no cabe sin deslizar de lado)
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));

  // Estado para controlar el Calendario
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<View>(Views.WEEK);

  useEffect(() => {
    setCalendarView(isMobile ? Views.DAY : Views.WEEK);
  }, [isMobile]);

  // La búsqueda se lanza al dejar de escribir (no en cada letra)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ====================================================================
  // 3. FETCHERS
  // ====================================================================

  // --- MÉTODO 1: SOLO RESERVADAS (Para el Calendario con fechas dinámicas) ---
  const fetchCalendarBookings = useCallback(async (currentDate: Date, view: View) => {
    setCalendarLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      // Calcular el rango visible basado en la vista actual
      if (view === Views.DAY) {
        startDate = startOfDay(currentDate);
        endDate = endOfDay(currentDate);
      } else if (view === Views.WEEK) {
        startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Semana empieza en lunes
        endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        startDate = startOfMonth(currentDate);
        endDate = endOfMonth(currentDate);
      }

      const startStr = format(startDate, 'yyyy-MM-dd');
      // El backend no entiende `end_date`: el tope real es start_datetime__lt (día siguiente)
      const endStr = format(addDays(endDate, 1), 'yyyy-MM-dd');

      let url: string | null =
        `${API_BASE_URL}v1/bookings/?status=reserved&start_datetime__gte=${startStr}&start_datetime__lt=${endStr}&page_size=200`;
      const allBookings: Booking[] = [];
      // Seguimos las páginas por si una semana tiene más de 200 reservas
      for (let i = 0; url && i < 10; i++) {
        const res: Response = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw new Error(await friendlyError(res));
        const data = await res.json();
        allBookings.push(...(data.results || data));
        // Detrás del proxy la API puede devolver `next` con http:// → se forzaría contenido mixto
        // (API_BASE_URL puede ser relativa, '/api/': se resuelve contra la página)
        url = data.next
          ? String(data.next).replace(/^http:\/\//, `${new URL(API_BASE_URL, window.location.href).protocol}//`)
          : null;
      }
      const reservedData = allBookings.filter((b: Booking) => b.status === 'reserved');

      const sortedData = reservedData.sort(
        (a: Booking, b: Booking) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
      );

      setCalendarBookings(sortedData);
      setCalendarError('');
    } catch (err) {
      setCalendarError(await friendlyError(err));
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // --- MÉTODO 2: TODAS (Para la Tabla - Sin filtro de fecha) ---
  const fetchTableBookings = useCallback(async () => {
    setTableLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('page_size', String(pageSize));
      // El backend solo permite ordenar por created_at: start_datetime se ignora hoy,
      // pero se deja primero por si algún día se habilita.
      params.set('ordering', '-start_datetime,-created_at');
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_BASE_URL}v1/bookings/?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await friendlyError(res));

      const data = await res.json();
      setTableBookings(data.results || data);
      setTotalTableCount(data.count || 0);
      setTableError('');
    } catch (err) {
      setTableError(await friendlyError(err));
    } finally {
      setTableLoading(false);
    }
  }, [currentPage, searchTerm, statusFilter, pageSize]);

  useEffect(() => {
    if (currentTab === 1) fetchTableBookings();
  }, [fetchTableBookings, currentTab]);

  // Carga reactiva para el calendario
  useEffect(() => {
    if (currentTab === 0) {
      fetchCalendarBookings(calendarDate, calendarView);
    }
  }, [calendarDate, calendarView, currentTab, fetchCalendarBookings]);

  useEffect(() => {
    fetch(`${API_BASE_URL}v1/rooms/`)
      .then(r => r.json())
      .then(d => setRooms(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
  }, []);

  // --- LÓGICA: Cancelación de Reserva ---
  const handleCancelBooking = async (b: { id: number; who: string | null; what: string; start: string }) => {
    const name = b.who || 'esta persona';
    const ok = await confirm({
      title: `¿Cancelar la reserva de ${name}?`,
      tone: 'danger',
      confirmText: 'Sí, cancelar su reserva',
      cancelText: 'No, dejarla como está',
      message: (
        <>
          <Box sx={{ mb: 1 }}>
            <b>{b.what}</b> · {longDate(b.start)} a las {hour(b.start)}
          </Box>
          <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.5 } }}>
            <li>Su plaza queda libre para otra persona.</li>
            <li>
              Si pagó la clase con créditos, se le devuelven a su cuenta. Si se la apuntaste tú desde
              «Clases fijas», no se devuelve nada (no gastó créditos).
            </li>
            <li><b>Le llega un aviso automático</b> por email (y por WhatsApp y en el móvil si los tiene). Si reservó sin cuenta y pagó con tarjeta, se le devuelve el dinero.</li>
            <li>No se puede deshacer: para recuperar la plaza habría que reservar de nuevo.</li>
          </Box>
        </>
      ),
    });
    if (!ok) return;

    setBusyBookingId(b.id);
    try {
      const cancelRes = await fetch(`${API_BASE_URL}v1/bookings/${b.id}/cancel/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });

      if (!cancelRes.ok) {
        const body = await cancelRes.clone().json().catch(() => ({}));
        if (body?.error && cancelRes.status < 500) throw new Error(body.error);
        throw new Error(await friendlyError(cancelRes));
      }

      const data = await cancelRes.json().catch(() => ({}));
      const credits = String(data?.message || '').match(/(\d+(?:[.,]\d+)?) créditos/);
      notify(
        credits
          ? `Reserva de ${name} cancelada ✓ Se le han devuelto ${credits[1].replace(/\.0+$/, '')} créditos y ya le ha llegado el aviso.`
          : `Reserva de ${name} cancelada ✓ (no había créditos que devolver). Ya le ha llegado el aviso.`
      );

      // Quitamos a la persona de la ventana abierta sin cerrarla
      setSelectedEvent((ev) => {
        if (!ev) return ev;
        const participants = ev.resource.participants.filter((p) => p.bookingId !== b.id);
        return { ...ev, resource: { ...ev.resource, participants, participantCount: participants.length } };
      });

      // Refrescamos ambas fuentes de datos
      await Promise.all([
        fetchCalendarBookings(calendarDate, calendarView),
        currentTab === 1 ? fetchTableBookings() : Promise.resolve(),
      ]);
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCancelClass = async () => {
    if (!selectedEvent?.resource.occurrence_id || !selectedEvent?.start) {
      notify('Faltan datos de esta clase. Cierra la ventana, recarga la página y vuelve a intentarlo.', 'error');
      return;
    }
    const { className, participantCount: n, startISO } = selectedEvent.resource;
    const people = n === 1 ? '1 persona' : `las ${n} personas`;
    const ok = await confirm({
      title: `¿Cancelar ${className} del ${longDate(startISO)} (${hour(startISO)}) para ${people}?`,
      tone: 'danger',
      confirmText: `Sí, cancelar la clase para ${people}`,
      cancelText: 'No, volver',
      message: (
        <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.6 } }}>
          <li>Se anulan {n === 1 ? 'la reserva' : `las ${n} reservas`} de esta clase. <b>Solo este día</b>: las demás semanas siguen igual.</li>
          <li>A los clientes con cuenta se les devuelven los créditos de la clase.</li>
          <li>A quien pagó con tarjeta sin cuenta se le devuelve el dinero automáticamente.</li>
          <li>
            Todas las personas reciben un <b>email</b> avisando; también un <b>WhatsApp</b> si tienen teléfono (ese mensaje dice
            que se cancela por no llegar al mínimo de personas) y una notificación en el móvil si tienen la app.
          </li>
          <li>
            Ojo: la clase <b>sigue abierta en la web</b> para ese día. Si no quieres que nadie más reserve, ciérrala en
            «Horarios → Vacaciones y cierres».
          </li>
          <li>No se puede deshacer.</li>
        </Box>
      ),
    });
    if (!ok) return;

    setCancellingClass(true);
    try {
      const payload = {
        occurrence_id: selectedEvent.resource.occurrence_id,
        // Usamos el ISO UTC original, NO selectedEvent.start (que es fake-local)
        start_datetime: selectedEvent.resource.startISO,
      };

      const res = await fetch(`${API_BASE_URL}v1/bookings/cancel_session/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await friendlyError(res));

      const data = await res.json();
      const cancelled = data?.details?.cancelled_bookings;
      notify(
        typeof cancelled === 'number'
          ? `Clase cancelada ✓ Se han anulado ${cancelled} ${cancelled === 1 ? 'reserva' : 'reservas'} y se ha avisado por email a cada persona.`
          : 'No quedaba ninguna reserva activa en esta clase: no había nada que cancelar.',
        typeof cancelled === 'number' ? 'success' : 'info',
      );

      setSelectedEvent(null);
      // Refrescamos el calendario
      fetchCalendarBookings(calendarDate, calendarView);
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setCancellingClass(false);
    }
  };

  // ====================================================================
  // 4. LÓGICA DE PROCESAMIENTO
  // ====================================================================

  const totalTablePages = Math.max(1, Math.ceil(totalTableCount / pageSize));

  const aggregatedEvents = useMemo(() => {
    const eventMap = new Map<
      string,
      {
        title: string;
        start: Date;
        end: Date;
        startISO: string;
        endISO: string;
        roomName?: string;
        occurrence_id: number;
        participants: Participant[];
      }
    >();

    for (const booking of calendarBookings) {
      if (selectedRoom !== 'all' && booking.room_name && booking.room_name !== selectedRoom) continue;
      const eventKey = `${booking.what}@${booking.start_datetime}`;
      if (!eventMap.has(eventKey)) {
        // Date "fake local" cuyos getHours/getMinutes son hora Madrid en cualquier navegador.
        // Solo para que react-big-calendar lo posicione correctamente en la cuadrícula.
        const startUtc = new Date(booking.start_datetime);
        const endUtc = new Date(booking.end_datetime);
        eventMap.set(eventKey, {
          title: booking.what,
          start: toMadridLocal(startUtc),
          end: toMadridLocal(endUtc),
          startISO: booking.start_datetime,   // UTC original — para API y modal
          endISO: booking.end_datetime,
          roomName: booking.room_name,
          occurrence_id: booking.occurrence_id as number,
          participants: [],
        });
      }

      eventMap.get(eventKey)!.participants.push({
        bookingId: booking.id,
        name: booking.who || 'Sin nombre',
        email: booking.who_email,
        phone: booking.who_phone,
      });
    }

    const events: AggregatedEvent[] = [];
    eventMap.forEach((event, key) => {
      const participantCount = event.participants.length;
      let colorClass = 'room-rose';
      if (participantCount >= 10) colorClass = 'room-green';
      else if (participantCount >= 5) colorClass = 'room-amber';

      events.push({
        id: key,
        title: `${event.title} (${participantCount})`,
        start: event.start,
        end: event.end,
        resource: {
          participantCount,
          participants: event.participants.sort((a, b) => a.name.localeCompare(b.name, 'es')),
          colorClass,
          className: event.title,
          roomName: event.roomName,
          occurrence_id: event.occurrence_id,
          startISO: event.startISO,
          endISO: event.endISO,
        },
      });
    });

    return events;
  }, [calendarBookings, selectedRoom]);

  // Hora del evento más temprano de la semana → punto de arranque del grid.
  // Se redondea hacia abajo a la media hora más cercana. Mínimo 8:00, máximo 9:30.
  const calendarMin = useMemo(() => {
    const d = new Date();
    if (aggregatedEvents.length === 0) {
      d.setHours(9, 0, 0, 0);
      return d;
    }
    let earliestMinutes = 24 * 60;
    for (const ev of aggregatedEvents) {
      const minutes = ev.start.getHours() * 60 + ev.start.getMinutes();
      if (minutes < earliestMinutes) earliestMinutes = minutes;
    }
    // Redondear hacia abajo a la media hora
    earliestMinutes = Math.floor(earliestMinutes / 30) * 30;
    earliestMinutes = Math.max(8 * 60, Math.min(9 * 60 + 30, earliestMinutes));
    d.setHours(Math.floor(earliestMinutes / 60), earliestMinutes % 60, 0, 0);
    return d;
  }, [aggregatedEvents]);

  // Hora del evento más tardío → fin del grid. Mínimo 20:00.
  const calendarMax = useMemo(() => {
    const d = new Date();
    if (aggregatedEvents.length === 0) {
      d.setHours(21, 0, 0, 0);
      return d;
    }
    let latestMinutes = 0;
    for (const ev of aggregatedEvents) {
      const minutes = ev.end.getHours() * 60 + ev.end.getMinutes();
      if (minutes > latestMinutes) latestMinutes = minutes;
    }
    // Redondear hacia arriba a la media hora
    latestMinutes = Math.ceil(latestMinutes / 30) * 30;
    latestMinutes = Math.max(20 * 60, Math.min(22 * 60, latestMinutes));
    d.setHours(Math.floor(latestMinutes / 60), latestMinutes % 60, 0, 0);
    return d;
  }, [aggregatedEvents]);

  // ====================================================================
  // 5. HELPERS UI
  // ====================================================================

  const handleChangeTab = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const renderStatusChip = (status: string) => {
    const info = STATUS_INFO[status] || { label: status, color: 'default' as const, help: '' };
    return <Chip label={info.label} color={info.color} size="small" sx={{ fontSize: '0.85rem' }} />;
  };

  const eventPropGetter = (event: AggregatedEvent) => ({ className: event.resource.colorClass });

  const handleNavigate = (newDate: Date) => setCalendarDate(newDate);
  const handleViewChange = (newView: View) => setCalendarView(newView);

  const clearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  // Botones de contacto con texto (no solo icono)
  const contactButtons = (phone: string | null, email: string | null, compact = false): ReactNode => {
    const wa = waLink(phone);
    const sx = { minHeight: 44, whiteSpace: 'nowrap' as const };
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {phone && (
          <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${phone}`} sx={sx}>
            Llamar
          </Button>
        )}
        {wa && (
          <Button size="small" variant="outlined" color="success" startIcon={<WhatsAppIcon />} href={wa} target="_blank" rel="noopener" sx={sx}>
            WhatsApp
          </Button>
        )}
        {email && !compact && (
          <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={`mailto:${email}`} sx={sx}>
            Email
          </Button>
        )}
      </Stack>
    );
  };

  const cancelButton = (b: Booking) => (
    <Button
      size="small"
      variant="outlined"
      color="error"
      startIcon={busyBookingId === b.id ? <CircularProgress size={16} color="inherit" /> : <EventBusyIcon />}
      disabled={busyBookingId !== null}
      onClick={() => handleCancelBooking({ id: b.id, who: b.who, what: b.what, start: b.start_datetime })}
      sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
    >
      {busyBookingId === b.id ? 'Cancelando…' : 'Cancelar reserva'}
    </Button>
  );

  // --- RENDER TABLA ---
  const renderBookingsTable = () => (
    <Box sx={{ mt: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          data-tour="search" label="Buscar reservas"
          placeholder="Nombre, teléfono, email o clase (p. ej. María o Reformer)"
          helperText="Busca por nombre, apellido, teléfono, email, clase o sala."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton aria-label="Borrar la búsqueda" onClick={() => setSearchInput('')} edge="end">
                    <CloseIcon />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <FormControl sx={{ minWidth: { md: 230 } }}>
          <InputLabel id="bk-status">Mostrar</InputLabel>
          <Select
            labelId="bk-status"
            label="Mostrar"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          >
            {STATUS_FILTERS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', mb: 2 }}>
        Las reservas hechas más recientemente salen primero. Horas en hora de España.
      </Typography>

      {tableLoading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando reservas…</Typography>
        </Stack>
      ) : tableError ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchTableBookings} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          {tableError}
        </Alert>
      ) : tableBookings.length === 0 ? (
        searchTerm || statusFilter ? (
          <EmptyState
            title="No hay reservas que coincidan"
            text="Revisa que el email esté bien escrito o prueba con el nombre de la clase."
            action={<Button variant="outlined" onClick={clearSearch} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
          />
        ) : (
          <EmptyState title="Todavía no hay reservas" text="Cuando alguien reserve una clase aparecerá aquí." />
        )
      ) : (
        <>
          {isNarrow ? (
            <Stack spacing={1.5}>
              {tableBookings.map((b) => (
                <Paper key={b.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>{b.who || 'Sin nombre'}</Typography>
                      <Typography sx={{ fontSize: '0.95rem' }}>{b.what}</Typography>
                      <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary' }}>{shortDateTime(b.start_datetime)}</Typography>
                    </Box>
                    {renderStatusChip(b.status)}
                  </Stack>
                  <Box sx={{ mt: 1.5 }}>{contactButtons(b.who_phone, b.who_email, true)}</Box>
                  {b.status === 'reserved' && <Box sx={{ mt: 1 }}>{cancelButton(b)}</Box>}
                </Paper>
              ))}
            </Stack>
          ) : (
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.grey[100] }}>
                    <TableCell>Día y hora</TableCell>
                    <TableCell>Clase</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Contactar</TableCell>
                    <TableCell>Qué puedes hacer</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableBookings.map((booking) => (
                    <TableRow key={booking.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.95rem' }}>{shortDateTime(booking.start_datetime)}</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{booking.what}</TableCell>
                      <TableCell sx={{ fontSize: '0.95rem' }}>
                        {booking.who || 'Sin nombre'}
                        {booking.who_email && (
                          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{booking.who_email}</Typography>
                        )}
                      </TableCell>
                      <TableCell>{renderStatusChip(booking.status)}</TableCell>
                      <TableCell>{contactButtons(booking.who_phone, booking.who_email, true)}</TableCell>
                      <TableCell>{booking.status === 'reserved' ? cancelButton(booking) : <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>—</Typography>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Pagination
            count={totalTablePages}
            page={currentPage}
            onChange={(_, page) => setCurrentPage(page)}
            size={isMobile ? 'medium' : 'large'}
            sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}
          />
          <Typography sx={{ textAlign: 'center', color: 'text.secondary', fontSize: '0.9rem', mt: 1 }}>
            {totalTableCount} {totalTableCount === 1 ? 'reserva' : 'reservas'} en total · página {currentPage} de {totalTablePages}
          </Typography>
        </>
      )}
    </Box>
  );

  // --- RENDER CALENDARIO ---
  const renderCalendarTab = () => (
    <Box sx={{ mt: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        mb={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <FormControl sx={{ minWidth: 240 }}>
          <InputLabel id="bk-room">Ver la sala</InputLabel>
          <Select
            labelId="bk-room"
            value={selectedRoom}
            label="Ver la sala"
            onChange={(e) => setSelectedRoom(e.target.value)}
          >
            <MenuItem value="all">Todas las salas</MenuItem>
            {rooms.map((r) => (
              <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Leyenda: qué significa el color de cada clase */}
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary' }}>Color = personas apuntadas:</Typography>
          {OCCUPANCY_LEGEND.map((l) => (
            <Stack key={l.cls} direction="row" spacing={0.75} alignItems="center">
              <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '4px', backgroundColor: l.color }} />
              <Typography sx={{ fontSize: '0.92rem' }}>{l.label}</Typography>
            </Stack>
          ))}
          <HelpTip title="¿Cómo leo el calendario?">
            Cada cuadro es una clase con al menos una reserva. El número entre paréntesis es cuántas personas vienen,
            por ejemplo «Pilates Mat (6)». Las clases sin nadie apuntado no salen.
            <br /><br />
            Usa <b>Anterior</b> y <b>Siguiente</b> para cambiar de semana y <b>Hoy</b> para volver a la actual.
            <b> Pulsa una clase</b> para ver la lista de personas.
          </HelpTip>
        </Stack>
      </Stack>

      <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-text-strong)', mb: 1.5 }}>
        👉 <b>Pulsa una clase</b> para ver quién viene, llamar o cancelar una reserva.
      </Typography>

      {calendarError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => fetchCalendarBookings(calendarDate, calendarView)} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
        >
          {calendarError}
        </Alert>
      )}
      {!calendarLoading && !calendarError && aggregatedEvents.length === 0 && (
        <Alert severity="info" sx={{ mb: 2, fontSize: '0.95rem' }}>
          {selectedRoom !== 'all'
            ? `No hay reservas en «${selectedRoom}» en estas fechas. Prueba con «Todas las salas» o pulsa «Siguiente».`
            : 'No hay reservas en estas fechas. Pulsa «Siguiente» para ver más adelante o «Hoy» para volver.'}
        </Alert>
      )}
      <Box className="bookings-cal" sx={{ height: { xs: '75vh', md: '70vh' }, position: 'relative' }}>
        {calendarLoading && (
          <Stack
            alignItems="center"
            spacing={1}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.92)',
              borderRadius: 3,
              p: 2.5,
              boxShadow: '0 6px 20px rgb(var(--studio-shadow-rgb) / 0.12)',
            }}
          >
            <CircularProgress />
            <Typography sx={{ color: 'text.secondary' }}>Cargando reservas…</Typography>
          </Stack>
        )}
        <Calendar
          localizer={localizer}
          events={aggregatedEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%', opacity: calendarLoading ? 0.6 : 1 }}
          culture="es"
          messages={{
            next: 'Siguiente ›',
            previous: '‹ Anterior',
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            agenda: 'Agenda',
            date: 'Fecha',
            time: 'Hora',
            event: 'Clase',
            allDay: 'Todo el día',
            noEventsInRange: 'No hay reservas en estas fechas.',
            showMore: (total: number) => `+${total} más`,
          }}
          eventPropGetter={eventPropGetter}
          onSelectEvent={(event) => setSelectedEvent(event as AggregatedEvent)}
          views={[Views.WEEK, Views.DAY]}
          view={calendarView}
          date={calendarDate}
          onView={handleViewChange}
          onNavigate={handleNavigate}
          min={calendarMin}
          max={calendarMax}
          step={30}
          timeslots={1}
        />
      </Box>
    </Box>
  );

  const ev = selectedEvent?.resource;

  return (
    <Box>
      {calendarGlobalStyles}
      <PageIntro
        pageKey="bookings"
        title="Reservas"
        subtitle="Quién viene a cada clase."
      />

      <Box data-tour="bookings-tabs" sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <SectionTabs value={currentTab} onChange={handleChangeTab} variant="scrollable" allowScrollButtonsMobile>
          <Tab label="Quién viene (calendario)" icon={<CalendarMonthIcon />} iconPosition="start" sx={{ minHeight: 52 }} />
          <Tab label="Lista de reservas" icon={<ListAltIcon />} iconPosition="start" sx={{ minHeight: 52 }} />
        </SectionTabs>
      </Box>

      <Box role="tabpanel" hidden={currentTab !== 0}>
        {currentTab === 0 && renderCalendarTab()}
      </Box>
      <Box role="tabpanel" hidden={currentTab !== 1}>
        {currentTab === 1 && renderBookingsTable()}
      </Box>

      <Dialog
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        {selectedEvent && ev && (
          <>
            <DialogTitle sx={{ borderLeft: `8px solid ${colorOf(ev.colorClass)}`, pr: 7 }}>
              <Box component="span" sx={{ display: 'block', fontSize: '1.3rem', fontWeight: 600 }}>{ev.className}</Box>
              <Box component="span" sx={{ display: 'block', fontSize: '1rem', color: 'text.secondary', mt: 0.5, '&::first-letter': { textTransform: 'uppercase' } }}>
                {longDate(ev.startISO)} · {hour(ev.startISO)} – {hour(ev.endISO)}
                {ev.roomName ? ` · ${ev.roomName}` : ''}
              </Box>
              <Button
                onClick={() => setSelectedEvent(null)}
                startIcon={<CloseIcon />}
                sx={{ position: 'absolute', right: 8, top: 8, minHeight: 44 }}
              >
                Cerrar
              </Button>
            </DialogTitle>
            <DialogContent dividers>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <PeopleIcon sx={{ color: 'var(--studio-primary-shade)' }} />
                <Typography sx={{ fontWeight: 600, fontSize: '1.05rem' }}>
                  {ev.participantCount === 0
                    ? 'Ya no queda nadie apuntado'
                    : ev.participantCount === 1
                      ? '1 persona apuntada'
                      : `${ev.participantCount} personas apuntadas`}
                </Typography>
              </Stack>

              {ev.participants.length === 0 ? (
                <EmptyState compact title="Sin personas apuntadas" text="Todas las reservas de esta clase se han cancelado." />
              ) : (
                <Stack spacing={1.25}>
                  {ev.participants.map((p) => (
                    <Paper key={p.bookingId} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>{p.name}</Typography>
                      {(p.phone || p.email) && (
                        <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', wordBreak: 'break-word' }}>
                          {[p.phone, p.email].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        {contactButtons(p.phone, p.email, true)}
                        <Box sx={{ flex: 1 }} />
                        {cancelButton({
                          id: p.bookingId, who: p.name, what: ev.className, start_datetime: ev.startISO,
                          end_datetime: ev.endISO, status: 'reserved', who_email: p.email, who_phone: p.phone,
                        })}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </DialogContent>
            <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, p: 2 }}>
              {ev.participantCount > 0 && (
                <>
                  <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
                    ¿La clase no se da? Esto cancela todas las reservas de este día, devuelve créditos o dinero y avisa a cada persona.
                  </Typography>
                  <Button
                    variant="contained"
                    color="error"
                    fullWidth
                    disabled={cancellingClass || busyBookingId !== null}
                    onClick={handleCancelClass}
                    startIcon={cancellingClass ? <CircularProgress size={18} color="inherit" /> : <EventBusyIcon />}
                    sx={{ minHeight: 48, ml: '0 !important' }}
                  >
                    {cancellingClass
                      ? 'Cancelando la clase…'
                      : `Cancelar la clase para ${ev.participantCount === 1 ? '1 persona' : `las ${ev.participantCount} personas`}`}
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => navigate('/calendar?tab=cierres')}
                    sx={{ minHeight: 44, ml: '0 !important' }}
                  >
                    Cerrar la clase en el horario (vacaciones y cierres)
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
