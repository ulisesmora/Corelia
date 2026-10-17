// src/components/Calendar.tsx — vista de calendario de la página de horarios

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import {
  format, parse, startOfWeek, endOfWeek, getDay, startOfMonth, endOfMonth, addMonths, startOfToday, isAfter,
} from 'date-fns';
import { es } from 'date-fns/locale';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  Box, Typography, Alert, Button, Chip, Stack, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, useMediaQuery, useTheme,
} from '@mui/material';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import '../calendar.css';

// Configuración de Day.js
dayjs.extend(utc);
dayjs.extend(timezone);

// Configuración de date-fns para el localizador
const locales = { es: es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: es }),
  getDay,
  locales,
});

import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TIMEZONE } from '../site/timezone';

/** Colores por sala (borde izquierdo de cada clase + leyenda). Contraste AA sobre blanco. */
const ROOM_COLORS = ['var(--studio-primary-dark)', '#3F7A5E', '#5A5F9C', '#A3563F', '#2F6F85', '#8A5A8C', '#7A6A1F'];

// --- Interfaces ---
interface ApiEvent {
  id: string;
  type: 'RECURRENCE' | 'SINGLE_SESSION' | 'EVENT' | string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  room: string;
  instructor?: string | null;
  capacity_max: number;
  occupied_seats?: number;
  available_seats?: number;
  source_id?: number;
}
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ApiEvent;
}

const TYPE_LABEL: Record<string, string> = {
  RECURRENCE: 'Clase semanal',
  SINGLE_SESSION: 'Clase de un solo día',
  EVENT: 'Evento especial',
};

interface Props {
  /** Fecha en la que abrir el calendario (p. ej. el 1 del mes que viene) */
  initialDate?: Date;
  /** "Mover solo este día" desde el detalle de una clase semanal */
  onMoveDay?: (scheduleId: number, date: string) => void;
  /** "Quitar solo este día" desde el detalle de una clase */
  onCloseDay?: (scheduleId: number, date: string) => void;
}

// --- Componente Principal ---
export const ScheduleCalendar: React.FC<Props> = ({ initialDate, onMoveDay, onCloseDay }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(initialDate || new Date());
  const [view, setView] = useState<View>(isMobile ? Views.DAY : Views.WEEK);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [limitMsg, setLimitMsg] = useState('');

  const navigationLimit = useMemo(() => addMonths(startOfToday(), 2), []);
  const limitLabel = format(navigationLimit, "d 'de' MMMM", { locale: es });

  useEffect(() => {
    fetch(`${API_BASE_URL}v1/rooms/`)
      .then((r) => r.json())
      .then((d) => setRooms(Array.isArray(d) ? d : d.results || []))
      .catch(() => {});
  }, []);

  const parseApiDate = useCallback((dateString: string): Date => {
    return dayjs.tz(dateString, TIMEZONE).toDate();
  }, []);

  // Se piden las semanas completas que tocan el mes: antes solo se pedía el
  // mes natural y en la vista semanal los días del mes vecino salían vacíos
  // (p. ej. la semana del 29 sept al 5 oct no mostraba las clases de octubre).
  const rangeStart = format(startOfWeek(startOfMonth(currentDate), { locale: es }), 'yyyy-MM-dd');
  const rangeEnd = format(endOfWeek(endOfMonth(currentDate), { locale: es }), 'yyyy-MM-dd');

  useEffect(() => {
    let cancelled = false;
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}v1/schedule/schedule/?start_date=${rangeStart}&end_date=${rangeEnd}`,
          { headers: authHeaders() },
        );
        if (!response.ok) throw response;
        const data: ApiEvent[] = await response.json();
        if (cancelled) return;
        setEvents(
          data.map((apiEvent) => ({
            id: apiEvent.id,
            title: apiEvent.title,
            start: parseApiDate(apiEvent.start_datetime),
            end: parseApiDate(apiEvent.end_datetime),
            resource: apiEvent,
          })),
        );
      } catch (err) {
        if (!cancelled) setError(await friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEvents();
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, parseApiDate, reloadKey]);

  const handleNavigate = useCallback((newDate: Date) => {
    if (isAfter(newDate, navigationLimit)) {
      setLimitMsg(`El calendario solo enseña hasta el ${limitLabel} (dos meses por delante). Las clases semanales siguen repitiéndose después; simplemente aquí no se muestran.`);
      return;
    }
    setLimitMsg('');
    setCurrentDate(newDate);
  }, [navigationLimit, limitLabel]);

  const roomColor = useCallback((name: string) => {
    const idx = rooms.findIndex((r) => r.name === name);
    if (idx >= 0) return idx % ROOM_COLORS.length;
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % ROOM_COLORS.length;
  }, [rooms]);

  const filteredEvents = useMemo(() => {
    if (selectedRoom === 'all') return events;
    return events.filter((e) => e.resource.room === selectedRoom);
  }, [events, selectedRoom]);

  const calendarProps = useMemo(
    () => ({
      localizer: localizer,
      events: filteredEvents,
      startAccessor: 'start' as const,
      endAccessor: 'end' as const,
      titleAccessor: (e: CalendarEvent) => `${e.title} · ${e.resource.room}`,
      tooltipAccessor: (e: CalendarEvent) => `${e.title} · ${e.resource.room} — pulsa para ver detalles`,
      style: { height: isMobile ? '75vh' : '85vh', margin: isMobile ? '8px 0' : '20px' },
      views: [Views.MONTH, Views.WEEK, Views.DAY],
      view: view,
      onView: (newView: View) => setView(newView),
      date: currentDate,
      onNavigate: handleNavigate,
      onSelectEvent: (e: CalendarEvent) => setSelected(e),
      eventPropGetter: (e: CalendarEvent) => ({ className: `room-c${roomColor(e.resource.room)}` }),
      culture: 'es',
      min: new Date(0, 0, 0, 8, 0, 0),
      max: new Date(0, 0, 0, 22, 0, 0),
      messages: {
        next: 'Siguiente',
        previous: 'Anterior',
        today: 'Hoy',
        month: 'Mes',
        week: 'Semana',
        day: 'Día',
        agenda: 'Agenda',
        date: 'Fecha',
        time: 'Hora',
        event: 'Clase',
        allDay: 'Todo el día',
        noEventsInRange: 'No hay clases en estas fechas.',
        showMore: (total: number) => `+${total} más`,
      },
    }),
    [filteredEvents, view, currentDate, handleNavigate, isMobile, roomColor],
  );

  const selDate = selected ? format(selected.start, 'yyyy-MM-dd') : '';
  const selIsFuture = selected ? selected.start.getTime() > Date.now() : false;
  const occupied = selected?.resource.occupied_seats ?? null;
  const cap = selected?.resource.capacity_max ?? 0;

  return (
    <Box>
      {/* Colores por sala: clase CSS más específica que la del tema del calendario */}
      <style>{ROOM_COLORS.map((c, i) => `.rbc-event.room-c${i}{border-left:5px solid ${c} !important;}`).join('\n')}</style>

      <Alert icon={<TouchAppIcon />} severity="info" sx={{ mb: 2, fontSize: '0.95rem' }}>
        <b>Pulsa una clase para ver sus detalles</b> (cuántas personas hay apuntadas, quién la da…). Usa «Anterior» y
        «Siguiente» para cambiar de semana, y «Mes», «Semana» o «Día» para ver más o menos. Aquí solo se mira: para
        cambiar una clase ve a la pestaña «Mis clases semanales». Puedes ver hasta el {limitLabel}.
      </Alert>

      {/* Leyenda de salas = filtro */}
      <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" sx={{ mb: 1.5, px: { xs: 0, sm: 2 } }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, mr: 0.5 }}>Salas:</Typography>
        <Chip
          label="Todas"
          onClick={() => setSelectedRoom('all')}
          color={selectedRoom === 'all' ? 'primary' : 'default'}
          variant={selectedRoom === 'all' ? 'filled' : 'outlined'}
          sx={{ minHeight: 40, fontSize: '0.92rem' }}
        />
        {rooms.map((r) => {
          const c = ROOM_COLORS[roomColor(r.name)];
          const active = selectedRoom === r.name;
          return (
            <Chip
              key={r.id}
              label={r.name}
              onClick={() => setSelectedRoom(active ? 'all' : r.name)}
              icon={<Box component="span" sx={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: c, ml: '8px !important' }} />}
              variant={active ? 'filled' : 'outlined'}
              sx={{ minHeight: 40, fontSize: '0.92rem', ...(active && { backgroundColor: `${c}22`, borderColor: c }) }}
            />
          );
        })}
        {!loading && !error && (
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', ml: { sm: 1 } }}>
            {filteredEvents.length} {filteredEvents.length === 1 ? 'clase' : 'clases'} en estas semanas
          </Typography>
        )}
      </Stack>

      {limitMsg && (
        <Alert severity="warning" onClose={() => setLimitMsg('')} sx={{ mb: 1.5 }}>
          {limitMsg}
        </Alert>
      )}

      {error ? (
        <Alert
          severity="error"
          action={<Button color="inherit" onClick={() => setReloadKey((k) => k + 1)} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se ha podido cargar el calendario. {error}
        </Alert>
      ) : (
        <Box sx={{ position: 'relative' }}>
          {loading && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }}>
              <LinearProgress />
              <Typography sx={{ textAlign: 'center', fontSize: '0.9rem', color: 'text.secondary', mt: 0.5 }}>
                Cargando las clases…
              </Typography>
            </Box>
          )}
          <div className="calendar-container">
            <Calendar {...calendarProps} />
          </div>
        </Box>
      )}

      {/* Detalle de una clase */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="xs" fullWidth>
        {selected && (
          <>
            <DialogTitle sx={{ fontSize: '1.3rem', pb: 0.5 }}>{selected.title}</DialogTitle>
            <DialogContent>
              <Typography sx={{ fontSize: '1.02rem', mb: 1.5, '&::first-letter': { textTransform: 'uppercase' } }}>
                {format(selected.start, "EEEE d 'de' MMMM", { locale: es })}, de {format(selected.start, 'HH:mm')} a{' '}
                {format(selected.end, 'HH:mm')}
              </Typography>
              <Stack spacing={0.75} sx={{ fontSize: '0.98rem' }}>
                <Typography><b>Tipo:</b> {TYPE_LABEL[selected.resource.type] || 'Clase'}</Typography>
                <Typography><b>Sala:</b> {selected.resource.room}</Typography>
                <Typography><b>La da:</b> {selected.resource.instructor || 'Sin asignar'}</Typography>
                <Typography>
                  <b>Personas apuntadas:</b>{' '}
                  {occupied == null
                    ? `${cap} plazas`
                    : `${occupied} de ${cap} plazas${cap - occupied > 0 ? ` (quedan ${cap - occupied})` : ' (completa)'}`}
                </Typography>
              </Stack>
              {selIsFuture && selected.resource.source_id != null && (onMoveDay || onCloseDay) && selected.resource.type !== 'EVENT' && (
                <Typography sx={{ mt: 2, fontSize: '0.93rem', color: 'text.secondary' }}>
                  ¿Solo este día es distinto? Puedes moverlo a otra hora o quitarlo, sin tocar el resto de semanas.
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {selIsFuture && selected.resource.source_id != null && selected.resource.type === 'RECURRENCE' && onMoveDay && (
                <Button
                  variant="outlined"
                  startIcon={<SwapHorizIcon />}
                  onClick={() => { onMoveDay(selected.resource.source_id!, selDate); setSelected(null); }}
                  sx={{ minHeight: 44 }}
                >
                  Mover solo este día
                </Button>
              )}
              {selIsFuture && selected.resource.source_id != null && selected.resource.type !== 'EVENT' && onCloseDay && (
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<EventBusyIcon />}
                  onClick={() => { onCloseDay(selected.resource.source_id!, selDate); setSelected(null); }}
                  sx={{ minHeight: 44 }}
                >
                  Quitar solo este día
                </Button>
              )}
              <Button variant="contained" onClick={() => setSelected(null)} sx={{ minHeight: 44 }}>
                Cerrar
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};
