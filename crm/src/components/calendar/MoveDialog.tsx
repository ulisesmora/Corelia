// Confirmación al soltar una clase en otro sitio: qué cambia y a quién
// avisamos. Si la sala está ocupada, se puede mover igualmente.
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { ApiError, calendarApi, errorText } from './api';
import type { Attendee, MoveUndo, Occurrence } from './types';
import type { MoveTarget } from './WeekGrid';
import { DAYS, dayNum, m2t, weekdayOf } from './dates';

interface Props {
  occurrence: Occurrence;
  to: MoveTarget;
  rooms: { id: number; name: string }[];
  onClose: () => void;
  onMoved: (msg: string, undo?: MoveUndo) => void;
}

const when = (date: string, hhmm: string) => `${DAYS[weekdayOf(date)].toLowerCase()} ${dayNum(date)} a las ${hhmm}`;

export default function MoveDialog({ occurrence: o, to, rooms, onClose, onMoved }: Props) {
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clash, setClash] = useState('');
  const newStart = m2t(to.startMin);
  const newRoom = to.roomId && to.roomId !== o.room.id ? rooms.find((r) => r.id === to.roomId) : null;

  useEffect(() => {
    if (!o.schedule_id || !o.booked) { setPeople([]); return; }
    calendarApi.detail({ schedule: o.schedule_id, date: o.date })
      .then((d) => setPeople(d.attendees))
      .catch(() => setPeople([]));
  }, [o]);

  const go = async (force = false) => {
    if (!o.schedule_id) return;
    setBusy(true);
    setError('');
    try {
      const r = await calendarApi.move({ schedule: o.schedule_id, date: o.date }, {
        new_date: to.date, new_start: newStart, new_room: to.roomId, notify, force,
      });
      onMoved(
        `${o.title} movida al ${when(to.date, newStart)}${newRoom ? ` (${newRoom.name})` : ''}.` +
        (r.notified ? ` Avisamos a ${r.notified} clienta${r.notified === 1 ? '' : 's'}.` : ''),
        r.undo,
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === 'room_busy') setClash(e.message);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const n = o.booked;
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="kc-move-title">
      <DialogTitle id="kc-move-title">¿Mover {o.title}?</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', p: 2, borderRadius: 3, bgcolor: 'action.hover' }}>
          <Typography sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>{when(o.date, o.start.slice(11))} · {o.room.name}</Typography>
          <ArrowForwardIcon fontSize="small" />
          <Typography sx={{ fontWeight: 700 }}>{when(to.date, newStart)}{newRoom ? ` · ${newRoom.name}` : ''}</Typography>
        </Box>
        {o.recurring && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Solo esta clase: las demás semanas siguen a su hora. Para cambiarla todas las semanas, ábrela y pulsa «Editar» → «Esta y las siguientes».
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          {people === null ? <CircularProgress size={20} /> : n === 0 ? (
            <Typography>No hay nadie apuntado: no hace falta avisar a nadie.</Typography>
          ) : (
            <>
              <Typography sx={{ fontWeight: 600 }}>
                {n === 1 ? 'Hay 1 persona apuntada' : `Hay ${n} personas apuntadas`}: su plaza se mueve con la clase.
              </Typography>
              {people.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {people.slice(0, 6).map((p) => p.name).join(', ')}{people.length > 6 ? ` y ${people.length - 6} más` : ''}
                </Typography>
              )}
              <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
                label={`Avisar${n === 1 ? 'la' : 'las'} por email y app del cambio`} />
            </>
          )}
        </Box>
        {clash && (
          <Alert severity="warning" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => go(true)} disabled={busy}>Mover igualmente</Button>}>
            {clash}
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="contained" onClick={() => go(false)} disabled={busy}>{busy ? 'Moviendo…' : 'Mover clase'}</Button>
      </DialogActions>
    </Dialog>
  );
}
