// Crear una clase (semanal o de un día) o editar una sesión del calendario
// con «Solo esta» / «Esta y las siguientes».
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { calendarApi, errorText } from './api';
import type { Catalog, Occurrence } from './types';
import { DAYS, m2t, plural, toMin, weekdayOf, longDay } from './dates';

export interface CreatePreset { date: string; startMin?: number; endMin?: number; roomId?: number }

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  catalog: Catalog;
  today: string;
  preset?: CreatePreset | null;
  occurrence?: Occurrence | null;
  onClose: () => void;
  onDone: (msg: string, focus?: { date: string }) => void;
  onNeedClassTypes: () => void;
}

export default function ClassFormDialog({ open, mode, catalog, today, preset, occurrence, onClose, onDone, onNeedClassTypes }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const isEdit = mode === 'edit' && !!occurrence;
  const [scope, setScope] = useState<'this' | 'following'>('this');
  const [classType, setClassType] = useState<number | ''>('');
  const [weekly, setWeekly] = useState(true);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [room, setRoom] = useState<number | ''>('');
  const [instructor, setInstructor] = useState<number | ''>('');
  const [capacity, setCapacity] = useState(10);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSubmitted(false);
    setSaving(false);
    setNotify(true);
    if (isEdit && occurrence) {
      setScope('this');
      setClassType(occurrence.class_type.id);
      setWeekly(occurrence.recurring);
      setDate(occurrence.date);
      setStart(occurrence.start.slice(11));
      setDuration(occurrence.duration);
      setRoom(occurrence.room.id);
      setInstructor(occurrence.instructor?.id ?? '');
      setCapacity(occurrence.capacity);
      return;
    }
    const p = preset || { date: today };
    const oneRoom = catalog.rooms.length === 1 ? catalog.rooms[0] : null;
    const r = catalog.rooms.find((x) => x.id === p.roomId) || oneRoom;
    setClassType(catalog.class_types.length === 1 ? catalog.class_types[0].id : '');
    setWeekly(true);
    setDate(p.date < today ? today : p.date);
    setStart(m2t(p.startMin ?? 10 * 60));
    setDuration(p.endMin && p.startMin != null ? Math.max(15, p.endMin - p.startMin) : 60);
    setRoom(r?.id ?? '');
    setInstructor('');
    setCapacity(r ? Math.min(r.capacity, 12) : 10);
  }, [open, isEdit, occurrence, preset, catalog, today]);

  const ct = useMemo(() => catalog.class_types.find((c) => c.id === classType), [catalog, classType]);
  // Al elegir el tipo de clase (crear), su duración y su profesora por defecto
  const pickClassType = (id: number) => {
    setClassType(id);
    const c = catalog.class_types.find((x) => x.id === id);
    if (c && !isEdit) {
      if (!preset?.endMin) setDuration(c.duration_minutes || 60);
      setInstructor(c.instructor_id ?? '');
    }
  };
  const pickRoom = (id: number) => {
    setRoom(id);
    const r = catalog.rooms.find((x) => x.id === id);
    if (r && !isEdit && capacity > r.capacity) setCapacity(r.capacity);
  };

  const endMin = toMin(start || '00:00') + duration;
  const errors = {
    classType: !classType ? 'Elige qué clase es.' : '',
    room: !room ? 'Elige la sala.' : '',
    date: !date ? 'Elige el día.' : date < today ? 'Ese día ya ha pasado.' : '',
    start: !/^\d{2}:\d{2}$/.test(start) ? 'Pon la hora.' : endMin > 24 * 60 ? 'La clase tiene que acabar antes de medianoche.' : '',
    duration: duration < 15 ? 'Mínimo 15 minutos.' : '',
    capacity: capacity < 1 ? 'Pon al menos 1 plaza.' : '',
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : '');

  const save = async () => {
    setSubmitted(true);
    if (hasErrors) return;
    setSaving(true);
    setError('');
    const end = m2t(endMin);
    try {
      if (isEdit && occurrence) {
        const changes: Record<string, unknown> = {};
        if (date !== occurrence.date) changes.date = date;
        if (start !== occurrence.start.slice(11)) changes.start_time = start;
        if (duration !== occurrence.duration || start !== occurrence.start.slice(11)) changes.end_time = end;
        if (room !== occurrence.room.id) changes.room = room;
        if ((instructor || null) !== (occurrence.instructor?.id ?? null)) changes.instructor = instructor || null;
        if (capacity !== occurrence.capacity) changes.capacity_max = capacity;
        if (classType !== occurrence.class_type.id) changes.class_type = classType;
        if (!Object.keys(changes).length) { onClose(); return; }
        const res = await calendarApi.edit(
          { schedule: occurrence.schedule_id!, date: occurrence.date },
          { scope: occurrence.recurring ? scope : 'this', changes, notify, existing_bookings: 'move' },
        );
        onDone(scope === 'following' && occurrence.recurring
          ? 'Cambio guardado para esta clase y las siguientes.'
          : 'Cambio guardado solo para esta clase.', { date: res.occurrence_id.slice(-10) });
      } else {
        const c = catalog.class_types.find((x) => x.id === classType);
        await calendarApi.createSchedule({
          class_type: classType,
          room,
          override_instructor: instructor && instructor !== c?.instructor_id ? instructor : null,
          weekday: weekly ? weekdayOf(date) : null,
          is_recurrent: weekly,
          start_time: start,
          end_time: end,
          capacity_min: 1,
          capacity_max: capacity,
          start_date: date,
          end_date: weekly ? null : date,
          is_active: true,
        });
        onDone(weekly ? `Clase creada: ${c?.title} cada ${DAYS[weekdayOf(date)].toLowerCase()} a las ${start}.`
          : `Clase creada: ${c?.title} el ${longDay(date)} a las ${start}.`, { date });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit ? `Editar ${occurrence!.title}` : 'Crear clase';
  const booked = occurrence?.booked || 0;
  const whenChanged = isEdit && occurrence && (date !== occurrence.date || start !== occurrence.start.slice(11) || room !== occurrence.room.id);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="kc-form-title">
      <DialogTitle id="kc-form-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{title}</Box>
        <IconButton onClick={onClose} aria-label="Cerrar" disabled={saving}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          {isEdit && occurrence?.recurring && (
            <Box>
              <Typography id="kc-scope" sx={{ fontWeight: 600, mb: 1 }}>¿Qué quieres cambiar?</Typography>
              <ToggleButtonGroup exclusive fullWidth value={scope} onChange={(_, v) => v && setScope(v)} aria-labelledby="kc-scope" size="small">
                <ToggleButton value="this">Solo esta clase</ToggleButton>
                <ToggleButton value="following">Esta y las siguientes</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {scope === 'this'
                  ? `Solo el ${longDay(occurrence.date).toLowerCase()}. Las demás semanas siguen igual.`
                  : `Desde el ${longDay(occurrence.date).toLowerCase()} en adelante. Las anteriores no cambian.`}
              </Typography>
            </Box>
          )}
          {!isEdit && catalog.class_types.length === 0 ? (
            <Alert severity="info" action={<Button onClick={onNeedClassTypes}>Elegir clases</Button>}>
              Antes de ponerla en el horario, dinos qué clases das (Reformer, Mat, Yoga…).
            </Alert>
          ) : (
            <TextField select label="Clase" value={classType} onChange={(e) => pickClassType(Number(e.target.value))}
              error={!!show('classType')} helperText={show('classType') || ' '}>
              {catalog.class_types.map((c) => <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>)}
            </TextField>
          )}
          {!isEdit && (
            <ToggleButtonGroup exclusive fullWidth value={weekly ? 'w' : 'o'} onChange={(_, v) => v && setWeekly(v === 'w')} size="small" aria-label="Se repite">
              <ToggleButton value="w">Cada semana</ToggleButton>
              <ToggleButton value="o">Solo un día</ToggleButton>
            </ToggleButtonGroup>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField type="date" label={!isEdit && weekly ? 'Empieza el' : 'Día'} value={date} onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }} error={!!show('date')}
              helperText={show('date') || (!isEdit && weekly && date ? `Todos los ${plural(DAYS[weekdayOf(date)].toLowerCase())}` : isEdit && scope === 'following' && date !== occurrence?.date ? `Pasa a los ${plural(DAYS[weekdayOf(date)].toLowerCase())}` : ' ')}
              sx={{ flex: 1 }} />
            <TextField type="time" label="Hora" value={start} onChange={(e) => setStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 900 } }} error={!!show('start')} helperText={show('start') || ' '} sx={{ width: { sm: 140 } }} />
            <TextField type="number" label="Minutos" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 15, step: 5 } }} error={!!show('duration')} helperText={show('duration') || `Acaba ${m2t(endMin)}`} sx={{ width: { sm: 120 } }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label="Sala" value={room} onChange={(e) => pickRoom(Number(e.target.value))} error={!!show('room')}
              helperText={show('room') || ' '} sx={{ flex: 1 }}>
              {catalog.rooms.map((r) => <MenuItem key={r.id} value={r.id}>{r.name} · {r.capacity} plazas</MenuItem>)}
            </TextField>
            <TextField type="number" label="Plazas" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 1 } }} error={!!show('capacity')}
              helperText={show('capacity') || (isEdit && capacity < booked ? `Hay ${booked} apuntadas` : ' ')} sx={{ width: { sm: 120 } }} />
          </Stack>
          <TextField select label="Profesora" value={instructor} onChange={(e) => setInstructor(e.target.value === '' ? '' : Number(e.target.value))}
            helperText={ct?.instructor_id && !isEdit ? 'Por defecto, la de esta clase' : ' '}>
            <MenuItem value="">Sin asignar</MenuItem>
            {catalog.instructors.map((i) => <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>)}
          </TextField>
          {isEdit && booked > 0 && whenChanged && (
            <FormControlLabel control={<Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
              label={`Avisar a las ${booked} apuntadas del cambio (email y app)`} />
          )}
          {isEdit && scope === 'following' && occurrence && date !== occurrence.date && weekdayOf(date) !== weekdayOf(occurrence.date) && booked > 0 && (
            <Alert severity="warning">Cambias el día de la semana: las reservas ya hechas desde esta fecha se cancelan y se devuelve la clase a su bono.</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {!isEdit && date && start && (
            <Alert severity="info" icon={false}>
              Se añadirá <b>{ct?.title || 'la clase'}</b> {weekly ? <>todos los <b>{plural(DAYS[weekdayOf(date)].toLowerCase())}</b> desde el {longDay(date).toLowerCase()}</> : <>el <b>{longDay(date).toLowerCase()}</b></>} de <b>{start} a {m2t(endMin)}</b>. Tus clientas la verán al momento en la web.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear clase'}</Button>
      </DialogActions>
    </Dialog>
  );
}

