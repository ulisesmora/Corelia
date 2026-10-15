import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, ListItemIcon,
  Menu, MenuItem, Tab, Tabs, TextField, useMediaQuery,
} from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useNotify } from '../../components/guide';
import { useClassTypeColor } from '../../design/classColors';
import { addWeekSlot, changeWeekSlot, loadWeek, removeWeekSlot, type WeekData, type WeekSlot } from '../api';
import { useAutosave, useStepGuard } from './autosave';
import { FieldError } from './ui';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DEFAULT_TIMES = ['09:00', '10:00', '18:00', '19:00', '20:00'];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Pick { anchor: HTMLElement; weekday: number; time: string; slot?: WeekSlot }

/** Paso 6: la semana tipo. Tocar un hueco → elegir clase (se repite cada semana). */
export default function StepSchedule() {
  const notify = useNotify();
  const { track } = useAutosave();
  const color = useClassTypeColor();
  const narrow = useMediaQuery('(max-width:899.95px)', { noSsr: true });
  const [data, setData] = useState<WeekData | null>(null);
  const [extraTimes, setExtraTimes] = useState<string[]>([]);
  const [room, setRoom] = useState<number | null>(null);
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [pick, setPick] = useState<Pick | null>(null);
  const [addingTime, setAddingTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWeek().then((d) => { setData(d); setRoom(d.rooms[0]?.id ?? null); }).catch((e) => setError(errText(e)));
  }, []);

  const slots = useMemo(() => (data?.slots || []).filter((s) => room === null || s.room_id === room), [data, room]);
  const times = useMemo(() => {
    const set = new Set([...DEFAULT_TIMES, ...(data?.slots || []).map((s) => s.start_time), ...extraTimes]);
    return [...set].sort();
  }, [data, extraTimes]);
  const at = (weekday: number, time: string) => slots.find((s) => s.weekday === weekday && s.start_time === time);

  useStepGuard(() => {
    if (!data?.slots.length) { setError('Pon al menos una clase en la semana.'); return false; }
    return true;
  });

  const run = async (fn: () => Promise<WeekData>) => {
    setBusy(true);
    setError('');
    try {
      setData(await track(fn()));
    } catch (e) {
      notify(errText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const choose = (classTypeId: number) => {
    const p = pick;
    setPick(null);
    if (!p) return;
    if (p.slot) run(() => changeWeekSlot(p.slot!.id, classTypeId));
    else run(() => addWeekSlot({ weekday: p.weekday, start_time: p.time, class_type_id: classTypeId, room_id: room ?? undefined }));
  };

  if (!data) return error ? <FieldError>{error}</FieldError> : <CircularProgress aria-label="Cargando la semana" />;
  if (!data.class_types.length) return <FieldError>Antes elige tus clases (paso 5).</FieldError>;

  const cell = (weekday: number, time: string, list = false) => {
    const s = at(weekday, time);
    const label = `${DAYS[weekday]} ${time}: ${s ? `${s.title}. Cambiar` : 'vacío. Añadir clase'}`;
    const tone = s ? color(s.class_type_id) : null;
    return (
      <ButtonBase
        key={`${weekday}-${time}`}
        aria-label={label}
        aria-haspopup="menu"
        disabled={busy}
        onClick={(e) => setPick({ anchor: e.currentTarget, weekday, time, slot: s })}
        sx={{
          minHeight: 56, width: '100%', borderRadius: 'min(var(--studio-radius-md), 12px)', fontFamily: 'var(--studio-font-body)',
          fontSize: list ? '0.95rem' : '0.8rem', fontWeight: 700, transition: 'background-color .2s, border-color .2s',
          display: 'flex', alignItems: 'center', gap: 1.5,
          justifyContent: list || s ? 'flex-start' : 'center', px: list ? 2 : s ? 1 : 0.75,
          ...(s && tone
            ? { background: tone.tint, color: 'var(--studio-ink)', borderLeft: `4px solid ${tone.dot}`, textAlign: 'left' }
            : {
              border: '1.5px dashed var(--studio-border-strong)', color: 'var(--studio-muted)',
              '&:hover': { borderColor: 'var(--studio-primary-text)', color: 'var(--studio-primary-text)', background: 'var(--studio-p-soft)' },
            }),
          '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-fill)', outlineOffset: 2 },
        }}
      >
        {list && <Box component="b" sx={{ minWidth: 48 }}>{time}</Box>}
        {s ? <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: list ? 'normal' : 'nowrap' }}>{s.title}</Box>
          : list ? <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}><StudioIcon name="plus" sx={{ fontSize: 18 }} />Añadir</Box>
            : <StudioIcon name="plus" sx={{ fontSize: 18 }} />}
      </ButtonBase>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Chip label={`${data.slots.length} ${data.slots.length === 1 ? 'clase' : 'clases'} a la semana`} sx={{ fontWeight: 700, background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }} />
        <Box aria-hidden sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75, flexWrap: 'wrap', ml: 'auto' }}>
          {data.class_types.slice(0, 6).map((c) => (
            <Box key={c.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.4, borderRadius: 99, background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)', fontSize: '0.78rem', fontWeight: 600 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: color(c.id).dot }} />{c.title}
            </Box>
          ))}
        </Box>
      </Box>

      {data.rooms.length > 1 && (
        <Tabs value={room} onChange={(_, v: number) => setRoom(v)} aria-label="Sala" variant="scrollable" sx={{ mb: 1.5 }}>
          {data.rooms.map((r) => <Tab key={r.id} value={r.id} label={r.name} sx={{ minHeight: 44 }} />)}
        </Tabs>
      )}

      {narrow ? (
        <>
          <Box role="tablist" aria-label="Día" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5, mb: 1.5, p: 0.5, borderRadius: 99, background: 'var(--studio-surf2)' }}>
            {DAYS_SHORT.map((d, i) => (
              <ButtonBase key={d} role="tab" aria-selected={day === i} aria-label={DAYS[i]} onClick={() => setDay(i)}
                sx={{ minHeight: 40, borderRadius: 99, fontWeight: 700, fontSize: '0.78rem', color: 'var(--studio-muted)', fontFamily: 'var(--studio-font-body)', '&[aria-selected="true"]': { background: 'var(--studio-surf)', color: 'var(--studio-ink)', boxShadow: 'var(--studio-shadow-1)' } }}>
                {d}
              </ButtonBase>
            ))}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{times.map((t) => cell(day, t, true))}</Box>
        </>
      ) : (
        <Box role="grid" aria-label="Semana tipo" sx={{ display: 'grid', gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))', gap: 0.75 }}>
          <Box role="row" sx={{ display: 'contents' }}>
            <span />
            {DAYS_SHORT.map((d, i) => (
              <Box key={d} role="columnheader" aria-label={DAYS[i]} sx={{ fontSize: '0.76rem', fontWeight: 700, textAlign: 'center', color: 'var(--studio-muted)', py: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</Box>
            ))}
          </Box>
          {times.map((t) => (
            <Box key={t} role="row" sx={{ display: 'contents' }}>
              <Box role="rowheader" sx={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 0.75, color: 'var(--studio-muted)' }}>{t}</Box>
              {DAYS.map((_, d) => <Box key={d} role="gridcell">{cell(d, t)}</Box>)}
            </Box>
          ))}
        </Box>
      )}

      <Button variant="outlined" startIcon={<StudioIcon name="plus" />} onClick={() => setAddingTime(true)} sx={{ mt: 1.5, minHeight: 48, borderStyle: 'dashed' }}>
        Añadir otra hora
      </Button>
      {error && <FieldError>{error}</FieldError>}

      <Menu anchorEl={pick?.anchor} open={Boolean(pick)} onClose={() => setPick(null)} slotProps={{ list: { 'aria-label': 'Elige la clase' } }}>
        {data.class_types.map((c) => (
          <MenuItem key={c.id} selected={pick?.slot?.class_type_id === c.id} onClick={() => choose(c.id)} sx={{ minHeight: 44, gap: 1 }}>
            <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', background: color(c.id).dot }} />
            {c.title} <Box component="span" sx={{ color: 'var(--studio-muted)', fontSize: '0.85rem' }}>· {c.duration_minutes} min</Box>
          </MenuItem>
        ))}
        {pick?.slot && <Divider />}
        {pick?.slot && (
          <MenuItem onClick={() => { const s = pick.slot!; setPick(null); run(() => removeWeekSlot(s.id)); }} sx={{ minHeight: 44, color: 'var(--studio-bad)' }}>
            <ListItemIcon sx={{ color: 'inherit' }}><StudioIcon name="close" fontSize="small" /></ListItemIcon>Quitar esta clase
          </MenuItem>
        )}
      </Menu>

      {addingTime && (
        <AddTimeDialog
          existing={times}
          onClose={() => setAddingTime(false)}
          onAdd={(t) => { setExtraTimes((x) => [...x, t]); setAddingTime(false); }}
        />
      )}
    </Box>
  );
}

function AddTimeDialog({ existing, onClose, onAdd }: { existing: string[]; onClose: () => void; onAdd: (t: string) => void }) {
  const [time, setTime] = useState('');
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && !existing.includes(time);
  return (
    <Dialog open onClose={onClose} aria-labelledby="add-time-title" maxWidth="xs" fullWidth>
      <DialogTitle id="add-time-title">Añadir otra hora</DialogTitle>
      <DialogContent>
        <TextField label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} autoFocus fullWidth sx={{ mt: 1 }}
          helperText={existing.includes(time) ? 'Esa hora ya está en la semana.' : 'Por ejemplo, 07:30.'}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!valid} onClick={() => onAdd(time)}>Añadir</Button>
      </DialogActions>
    </Dialog>
  );
}
