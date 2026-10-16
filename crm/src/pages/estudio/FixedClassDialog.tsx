// «Hacerla clienta frecuente»: su clase de cada semana (clase fija). Se le
// reserva sola cada semana gastando sus créditos, si tiene plan del estudio o
// membresía. Usa la ruta de «Clases fijas» (users/<id>/class-preferences/).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useNotify } from '../../components/guide';
import { Tag } from '../kit/ui';
import { WEEKDAYS, studioApi, type ClientLite, type StudioPlan, type WeeklyClass } from './api';

export default function FixedClassDialog({ open, client, plan, onClose, onDone }: {
  open: boolean;
  client: ClientLite & { name?: string };
  /** Su plan del estudio (si tiene): la clase fija queda ligada a él */
  plan: StudioPlan | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const notify = useNotify();
  const theme = useTheme();
  const full = useMediaQuery(theme.breakpoints.down('sm'));
  const [classes, setClasses] = useState<WeeklyClass[] | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const name = client.name || client.first_name || 'la clienta';

  useEffect(() => {
    if (!open) return;
    setPick(null);
    setError('');
    setClasses(null);
    Promise.all([studioApi.weeklyClasses(), studioApi.fixedClasses(client.id)])
      .then(([cl, prefs]) => { setClasses(cl); setMine(prefs.filter((p) => p.is_active).map((p) => p.schedule)); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, client.id]);

  const save = async () => {
    if (!pick) return;
    setSaving(true);
    setError('');
    try {
      if (plan && plan.status !== 'ended') {
        // Con plan del estudio: queda ligada al plan y se le reservan ya las de esta semana
        const ids = Array.from(new Set([...plan.fixed_schedules.map((s) => s.id), pick]));
        await studioApi.update(plan.id, { fixed_schedule_ids: ids });
      } else {
        await studioApi.addFixedClass(client.id, pick);
      }
      const c = classes?.find((x) => x.id === pick);
      notify(`${name} tiene ${c ? `${c.class_type.title} los ${WEEKDAYS[c.weekday]} a las ${c.start_time.slice(0, 5)}` : 'su clase fija'} ✓`);
      onDone?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="sm" fullScreen={full} aria-labelledby="fixed-h">
      <DialogTitle id="fixed-h" sx={{ fontFamily: 'var(--studio-font-heading)' }}>
        Clase fija de {name}
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5 }}>
          Su plaza de cada semana: se le reserva sola y gasta sus créditos.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {!plan && (
          <Alert severity="info" sx={{ mb: 2 }}
            action={<Button color="inherit" onClick={() => { onClose(); navigate(`/assign-classes`); }} sx={{ minHeight: 44 }}>Clases fijas</Button>}>
            Se reserva sola si tiene un plan del estudio o una membresía. Si no, resérvale las próximas semanas desde «Clases fijas».
          </Alert>
        )}
        {classes === null && !error && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={52} />)}
        {classes !== null && classes.length === 0 && (
          <Typography sx={{ color: 'var(--studio-muted)' }}>Aún no hay clases semanales en el horario.</Typography>
        )}
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {(classes || []).map((c) => {
            const has = mine.includes(c.id);
            const on = pick === c.id;
            return (
              <ButtonBase key={c.id} disabled={has} onClick={() => setPick(c.id)} aria-pressed={on}
                sx={{
                  justifyContent: 'flex-start', textAlign: 'left', minHeight: 52, px: 1.5, py: 1, gap: 1.5,
                  borderRadius: 'var(--studio-radius-md)', border: on ? '2px solid var(--studio-primary-fill)' : '1px solid var(--studio-border-color)',
                  background: on ? 'var(--studio-p-soft)' : 'var(--studio-surf)',
                }}>
                <Typography component="span" sx={{ width: 92, flex: 'none', fontWeight: 700, color: 'var(--studio-ink)', textTransform: 'capitalize' }}>
                  {WEEKDAYS[c.weekday]} {c.start_time.slice(0, 5)}
                </Typography>
                <Typography component="span" sx={{ flex: 1, minWidth: 0, color: 'var(--studio-ink)' }} noWrap>{c.class_type.title} · {c.room.name}</Typography>
                {has && <Tag tone="ok">Ya es suya</Tag>}
              </ButtonBase>
            );
          })}
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }} role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={!pick || saving} sx={{ minHeight: 48, ml: '0 !important' }}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
          Guardar su clase fija
        </Button>
      </DialogActions>
    </Dialog>
  );
}
