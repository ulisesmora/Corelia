// «Plan en el estudio» de un cliente: sus clases, el próximo corte y
// «Renovar mes» (corte de créditos + cobro en mano o pendiente). Lo usan
// «Créditos» y «Clientes → Clientes del estudio».
import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import { useConfirm, useNotify } from '../../components/guide';
import { fmtMoney, shortDate } from '../kit/format';
import { Seg, Tag } from '../kit/ui';
import { METHODS, WEEKDAYS, carryLabel, creditsText, studioApi, type Cutoff, type PayMethod, type StudioPlan } from './api';

export function RenewDialog({ plan, open, onClose, onDone }: {
  plan: StudioPlan; open: boolean; onClose: () => void; onDone?: (p: StudioPlan) => void;
}) {
  const notify = useNotify();
  const theme = useTheme();
  const full = useMediaQuery(theme.breakpoints.down('sm'));
  const [method, setMethod] = useState<PayMethod>(plan.payment_method);
  const [saving, setSaving] = useState<'' | 'paid' | 'later'>('');
  const [error, setError] = useState('');
  const c: Cutoff | undefined = plan.preview;
  const first = plan.name.split(' ')[0] || 'este cliente';

  const go = async (charge: 'paid' | 'later') => {
    setSaving(charge);
    setError('');
    try {
      const r = await studioApi.renew(plan.id, { charge, method, period_start: plan.next_due_date });
      notify(r.done);
      onDone?.(r.plan);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving('');
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="xs" fullScreen={full} aria-labelledby="renew-h">
      <DialogTitle id="renew-h" sx={{ fontFamily: 'var(--studio-font-heading)' }}>
        Renovar el mes de {first}
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5 }}>
          {plan.title} · {fmtMoney(plan.price, plan.currency)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {c && (
          <Box sx={{ p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)', mb: 2 }} aria-live="polite">
            <Typography sx={{ color: 'var(--studio-ink)' }}>
              Le quedan <b>{creditsText(c.leftover)}</b> del plan.{' '}
              {c.expired > 0 ? <>Se pierden <b>{c.expired}</b>.</> : c.kept > 0 ? <>Se las guarda.</> : null}
            </Typography>
            <Typography sx={{ color: 'var(--studio-ink)', mt: 0.5 }}>
              Empieza el mes con <b>{creditsText(c.balance_after)}</b>{c.balance_after !== c.pool_after ? ' (con lo que tiene aparte)' : ''}.
            </Typography>
          </Box>
        )}
        <Typography sx={{ fontWeight: 700, mb: 1, color: 'var(--studio-ink)' }}>¿Cómo te ha pagado?</Typography>
        <Seg mode="toggle" label="Cómo te ha pagado" value={method} onChange={setMethod}
          options={METHODS.map((m) => ({ value: m.value, label: m.label.replace(' / datáfono', '') }))}
          sx={{ flexWrap: 'wrap' }} />
        <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', mt: 1.5 }}>
          «Renovar, cobro después» le da las clases ya y lo apunta en Ventas → Quién me debe.
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }} role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
        <Button variant="contained" onClick={() => go('paid')} disabled={Boolean(saving)} sx={{ minHeight: 48 }}
          startIcon={saving === 'paid' ? <CircularProgress size={18} color="inherit" /> : undefined}>
          Cobrado y renovar
        </Button>
        <Button variant="outlined" onClick={() => go('later')} disabled={Boolean(saving)} sx={{ minHeight: 48, ml: '0 !important' }}
          startIcon={saving === 'later' ? <CircularProgress size={18} color="inherit" /> : undefined}>
          Renovar, cobro después
        </Button>
        <Button onClick={onClose} disabled={Boolean(saving)} sx={{ minHeight: 44, ml: '0 !important' }}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function StudioPlanBlock({ plan, onChanged, compact = false }: {
  plan: StudioPlan; onChanged?: (p: StudioPlan | null) => void; compact?: boolean;
}) {
  const confirm = useConfirm();
  const notify = useNotify();
  const [renew, setRenew] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  const status = async (what: 'pause' | 'resume' | 'end') => {
    setMenu(null);
    if (what === 'end') {
      const ok = await confirm({
        title: `¿Terminar el plan de ${plan.name}?`,
        message: 'No se borra nada: se queda con las clases que tenga y deja de salir en las renovaciones. Sus clases fijas del plan dejan de reservarse solas.',
        confirmText: 'Sí, terminar el plan',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const p = await studioApi.setStatus(plan.id, what);
      notify(what === 'pause' ? 'Plan en pausa' : what === 'resume' ? 'Plan reanudado' : 'Plan terminado');
      onChanged?.(what === 'end' ? null : p);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const due = plan.next_due_date;
  return (
    <Box data-tour="studio-plan" sx={{
      p: compact ? 1.5 : 2, borderRadius: 'var(--studio-radius-md)', border: '1px solid var(--studio-border-color)',
      background: 'var(--studio-surf)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="h3" sx={{ fontWeight: 700, color: 'var(--studio-ink)', flex: 1, minWidth: 0 }}>
          Plan en el estudio
        </Typography>
        {plan.status === 'paused' && <Tag tone="n">En pausa</Tag>}
        {plan.status === 'active' && plan.overdue && <Tag tone="warn">Toca renovar</Tag>}
        <IconButton aria-label="Más opciones del plan" onClick={(e) => setMenu(e.currentTarget)} sx={{ width: 44, height: 44, m: -0.75 }}>
          <MoreVertRoundedIcon />
        </IconButton>
      </Box>
      <Typography sx={{ color: 'var(--studio-ink)', fontSize: '0.95rem' }}>
        {plan.title} · {fmtMoney(plan.price, plan.currency)} · {plan.method_label.toLowerCase()}
      </Typography>
      <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.88rem', mt: 0.25 }}>
        Le quedan <b>{creditsText(plan.balance)}</b>
        {due ? <> · próximo corte el <b>{shortDate(due)}</b></> : null}
        {' · '}{carryLabel(plan.carry_over, plan.carry_over_cap).toLowerCase()}
      </Typography>
      {plan.fixed_schedules.length > 0 && (
        <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.88rem', mt: 0.25 }}>
          Clase fija: {plan.fixed_schedules.map((s) => `${s.title} (${WEEKDAYS[s.weekday]} ${s.start_time})`).join(', ')}
        </Typography>
      )}
      {plan.status === 'active' && (
        plan.can_renew ? (
          <Button variant="contained" onClick={() => setRenew(true)} sx={{ mt: 1.5, minHeight: 44 }} data-tour="renew">
            Renovar mes
          </Button>
        ) : due ? (
          <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', mt: 1 }}>
            Al día. Podrás renovarlo una semana antes del corte.
          </Typography>
        ) : null
      )}
      {plan.status === 'paused' && (
        <Button variant="outlined" onClick={() => status('resume')} sx={{ mt: 1.5, minHeight: 44 }}>Reanudar el plan</Button>
      )}
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {plan.status === 'active' && <MenuItem onClick={() => status('pause')} sx={{ minHeight: 44 }}>Pausar (vacaciones, lesión…)</MenuItem>}
        {plan.status === 'paused' && <MenuItem onClick={() => status('resume')} sx={{ minHeight: 44 }}>Reanudar</MenuItem>}
        <MenuItem onClick={() => status('end')} sx={{ minHeight: 44, color: 'var(--studio-bad)' }}>Terminar el plan</MenuItem>
      </Menu>
      {renew && <RenewDialog plan={plan} open={renew} onClose={() => setRenew(false)} onDone={(p) => onChanged?.(p)} />}
    </Box>
  );
}

export function StudioClientsNote() {
  return (
    <Alert severity="info" icon={false} sx={{ fontSize: '0.9rem' }}>
      <b>Clientes del estudio:</b> te pagan en mano y tú renuevas su mes desde aquí. Los clientes <b>online</b> pagan con
      tarjeta y su cuota la renueva sola Stripe.
    </Alert>
  );
}
