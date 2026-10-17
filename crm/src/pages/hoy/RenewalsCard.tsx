// «Renovaciones de este mes» (Hoy): clientes del estudio cuyo mes vence. Un
// toque: «Cobrado y renovar» (eligiendo cómo pagó), «Renovar, cobro después»
// o «Pausar». Datos: today_payload()['renewals'] (api/utils/studio_plans.py).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Menu, MenuItem, Typography } from '@mui/material';
import { useNotify } from '../../components/guide';
import { METHODS, creditsText, studioApi, type PayMethod, type RenewalsCardData, type StudioPlan } from '../estudio/api';
import { dashApi } from '../kit/api';
import { fmtMoney, shortDate } from '../kit/format';
import { Avatar, Card, CardHead, CountPill, Tag, TonalButton } from '../kit/ui';

function dueText(p: StudioPlan) {
  if (p.days_to_due === null) return '';
  if (p.days_to_due < 0) return `vencido el ${shortDate(p.next_due_date as string)}`;
  if (p.days_to_due === 0) return 'vence hoy';
  if (p.days_to_due === 1) return 'vence mañana';
  return `vence el ${shortDate(p.next_due_date as string)}`;
}

export default function RenewalsCard({ data, onChanged }: { data: RenewalsCardData | null | undefined; onChanged?: () => void }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const [menu, setMenu] = useState<{ el: HTMLElement; plan: StudioPlan } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});
  // Las renovadas se siguen viendo («Renovado: …») aunque al recargar ya no vengan
  const [kept, setKept] = useState<Record<number, StudioPlan>>({});
  const items = [...(data?.items || []), ...Object.values(kept).filter((k) => !(data?.items || []).some((i) => i.id === k.id))];
  if (!items.length) return null;

  const run = async (plan: StudioPlan, charge: 'paid' | 'later', method?: PayMethod) => {
    setMenu(null);
    setBusy(plan.id);
    try {
      const r = await dashApi.action({ kind: 'studio_plan_renew', plan_id: plan.id, charge, method: method || plan.payment_method, period_start: plan.next_due_date });
      setKept((k) => ({ ...k, [plan.id]: plan }));
      setDone((d) => ({ ...d, [plan.id]: r.done }));
      onChanged?.();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const pause = async (plan: StudioPlan) => {
    setBusy(plan.id);
    try {
      await studioApi.setStatus(plan.id, 'pause');
      setKept((k) => ({ ...k, [plan.id]: plan }));
      setDone((d) => ({ ...d, [plan.id]: `Plan de ${plan.name.split(' ')[0]} en pausa` }));
      onChanged?.();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const pending = items.filter((p) => p.can_renew && !done[p.id]).length;
  return (
    <Card labelledBy="ren-h" id="renewals-card" tour="today-renewals">
      <CardHead id="ren-h" title="Renovaciones de este mes"
        right={pending > 0 ? <CountPill n={pending} label={`${pending} por renovar`} /> : undefined} />
      <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', mt: -0.75, mb: 1 }}>
        {data && data.this_week ? `${data.this_week} ${data.this_week === 1 ? 'cliente del estudio renueva' : 'clientes del estudio renuevan'} esta semana. ` : ''}
        Te pagan en mano: nada se cobra solo.
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-live="polite">
        {items.map((p) => {
          const ok = done[p.id];
          return (
            <Box component="li" key={p.id} sx={{
              display: 'flex', alignItems: 'center', gap: { xs: '6px 12px', sm: 1.5 }, py: 1.25, flexWrap: 'wrap',
              borderTop: '1px solid var(--studio-border-color)', '&:first-of-type': { borderTop: 0 },
            }}>
              <Avatar name={p.name} size={38} ring={false} />
              <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.95rem' }}>
                  {ok || p.name}
                </Typography>
                {!ok && (
                  <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.84rem' }}>
                    {p.credits_per_month} clases · {fmtMoney(p.price, p.currency)} · {dueText(p)}
                    {p.preview ? ` · empieza con ${creditsText(p.preview.balance_after)}` : ''}
                  </Typography>
                )}
              </Box>
              {!ok && p.overdue && <Tag tone="warn">Vencido</Tag>}
              {!ok && (
                p.can_renew ? (
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', ml: { xs: '50px', sm: 0 } }}>
                    <TonalButton size="small" disabled={busy === p.id} onClick={(e) => setMenu({ el: e.currentTarget, plan: p })}
                      aria-haspopup="menu" sx={{ minHeight: 44 }}>
                      Cobrado y renovar
                    </TonalButton>
                    <Button size="small" disabled={busy === p.id} onClick={() => run(p, 'later')} sx={{ minHeight: 44 }}>Renovar, cobro después</Button>
                    <Button size="small" disabled={busy === p.id} onClick={() => pause(p)} sx={{ minHeight: 44, color: 'var(--studio-muted)' }}>Pausar</Button>
                  </Box>
                ) : (
                  <Button size="small" onClick={() => navigate(`/credits?clienta=${p.user_id}`)} sx={{ minHeight: 44 }}>Ver</Button>
                )
              )}
            </Box>
          );
        })}
      </Box>
      {data && data.unpaid > 0 && (
        <Button size="small" onClick={() => navigate('/ventas')} sx={{ mt: 1, minHeight: 44 }}>
          {data.unpaid} {data.unpaid === 1 ? 'mes renovado sin cobrar' : 'meses renovados sin cobrar'} → Ventas
        </Button>
      )}
      <Menu anchorEl={menu?.el} open={Boolean(menu)} onClose={() => setMenu(null)} MenuListProps={{ 'aria-label': '¿Cómo te ha pagado?' }}>
        <MenuItem disabled sx={{ fontSize: '0.82rem', opacity: '1 !important', color: 'var(--studio-muted)' }}>¿Cómo te ha pagado?</MenuItem>
        {METHODS.map((m) => (
          <MenuItem key={m.value} onClick={() => menu && run(menu.plan, 'paid', m.value)} sx={{ minHeight: 44 }}>
            {m.label}{menu?.plan.payment_method === m.value ? ' (lo de siempre)' : ''}
          </MenuItem>
        ))}
      </Menu>
    </Card>
  );
}
