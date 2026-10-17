// «Reservarle una clase»: elige una de las próximas clases y si la paga con
// sus créditos o va sin cobrar. Usa la misma ruta que el calendario
// (POST v1/calendar/occurrence/add-client/).
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useNotify } from '../../components/guide';
import { addDays, dayLabel, isoOf } from '../kit/format';
import { Seg } from '../kit/ui';
import { creditsText, studioApi, type ClientLite, type Session } from './api';

const DAYS = 14;

export default function BookClassDialog({ open, client, balance, onClose, onBooked }: {
  open: boolean;
  client: ClientLite & { name?: string };
  balance: number;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const notify = useNotify();
  const theme = useTheme();
  const full = useMediaQuery(theme.breakpoints.down('sm'));
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState('');
  const [pick, setPick] = useState<Session | null>(null);
  const [charge, setCharge] = useState<'credits' | 'free'>('credits');
  const [saving, setSaving] = useState(false);
  const today = isoOf(new Date());
  const name = client.name || client.first_name || 'esta persona';

  useEffect(() => {
    if (!open) return;
    setPick(null);
    setError('');
    setSessions(null);
    studioApi.sessions(today, addDays(today, DAYS - 1))
      .then((l) => setSessions(l.filter((s) => s.kind === 'class' && s.schedule_id && !s.started && !s.canceled && !s.blackout)
        .sort((a, b) => a.start.localeCompare(b.start))))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, today]);

  useEffect(() => { setCharge(balance > 0 ? 'credits' : 'free'); }, [balance, open]);

  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions || []) m.set(s.date, [...(m.get(s.date) || []), s]);
    return [...m.entries()];
  }, [sessions]);

  const price = pick ? Number(pick.price_credits) || 0 : 0;
  const notEnough = charge === 'credits' && pick && price > balance;

  const book = async () => {
    if (!pick?.schedule_id) return;
    setSaving(true);
    setError('');
    try {
      await studioApi.addToClass(pick.schedule_id, pick.date, client.id, charge);
      notify(`${name}: reserva hecha en ${pick.title} · ${dayLabel(pick.date, today).toLowerCase()} ${pick.start.slice(11, 16)} ✓`);
      onBooked?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm" fullScreen={full} aria-labelledby="book-h">
      <DialogTitle id="book-h" sx={{ fontFamily: 'var(--studio-font-heading)' }}>
        Apuntar a {name} a una clase
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5 }}>
          Le quedan {creditsText(balance)}. Elige la clase y cómo la paga.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {sessions === null && !error && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={52} />)}
        {sessions !== null && sessions.length === 0 && (
          <Typography sx={{ color: 'var(--studio-muted)' }}>No hay clases en los próximos {DAYS} días.</Typography>
        )}
        {byDay.map(([d, list]) => (
          <Box key={d} sx={{ mb: 1.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--studio-muted)', mb: 0.5 }}>{dayLabel(d, today)}</Typography>
            <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
              {list.map((s) => {
                const fullClass = s.booked >= s.capacity;
                const on = pick?.id === s.id;
                return (
                  <ButtonBase key={s.id} onClick={() => setPick(s)} disabled={fullClass} aria-pressed={on}
                    sx={{
                      justifyContent: 'flex-start', textAlign: 'left', minHeight: 52, px: 1.5, py: 1, gap: 1,
                      borderRadius: 'var(--studio-radius-md)', border: on ? '2px solid var(--studio-primary-fill)' : '1px solid var(--studio-border-color)',
                      background: on ? 'var(--studio-p-soft)' : 'var(--studio-surf)', opacity: fullClass ? 0.55 : 1,
                    }}>
                    <Typography component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--studio-ink)' }}>{s.start.slice(11, 16)}</Typography>
                    <Box component="span" sx={{ minWidth: 0 }}>
                      <Typography component="span" sx={{ display: 'block', fontWeight: 600, color: 'var(--studio-ink)', fontSize: '0.92rem' }} noWrap>{s.title}</Typography>
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.8rem', color: 'var(--studio-muted)' }} noWrap>
                        {fullClass ? 'Llena' : `${s.capacity - s.booked} libres`} · {s.room.name}
                      </Typography>
                    </Box>
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        ))}
        {pick && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontWeight: 700, mb: 1, color: 'var(--studio-ink)' }}>¿Cómo la paga?</Typography>
            <Seg mode="toggle" label="Cómo la paga" value={charge} onChange={setCharge} options={[
              { value: 'credits', label: `Con sus créditos (${creditsText(price)})` },
              { value: 'free', label: 'Sin cobrar' },
            ]} />
            {notEnough && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                No le llega: le quedan {creditsText(balance)}. Añádele créditos antes o elige «Sin cobrar».
              </Alert>
            )}
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }} role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
        <Button variant="contained" onClick={book} disabled={!pick || saving || Boolean(notEnough)} sx={{ minHeight: 48, ml: '0 !important' }}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {pick ? `Reservar ${pick.title}` : 'Elige una clase'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
