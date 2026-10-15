// «Necesita tu atención»: avisos calculados con datos reales y un botón que lo
// resuelve en un clic. El botón se ve hecho al momento («Hecho · Deshacer») y
// la acción de verdad se manda a los pocos segundos: así «Deshacer» funciona
// también con lo que no se puede deshacer (un email enviado). Si se sale de la
// pantalla antes, se manda en ese momento.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LocalCafeOutlinedIcon from '@mui/icons-material/LocalCafeOutlined';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { useNotify } from '../../components/guide';
import { dashApi, type AttentionItem } from '../kit/api';
import { Card, CardHead, CountPill, IBadge, KitIcon, TonalButton } from '../kit/ui';

const COMMIT_MS = 5000;

type State =
  | { s: 'pending'; text: string }
  | { s: 'done'; text: string; undo?: Record<string, unknown> }
  | { s: 'working'; text: string };

export default function Attention({ items, fresh, onChanged }: { items: AttentionItem[] | null; fresh: boolean; onChanged?: () => void }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const [state, setState] = useState<Record<string, State>>({});
  const timers = useRef<Record<string, { t: number; payload: Record<string, unknown> }>>({});
  // Los avisos resueltos se siguen viendo («Hecho · Deshacer») aunque al
  // recargar los datos ya no vengan del API
  const [kept, setKept] = useState<Record<string, AttentionItem>>({});

  // Al salir (de la pantalla o de la página): lo que estaba esperando se
  // manda ya, con keepalive para que llegue aunque se cierre la pestaña
  useEffect(() => {
    const flush = () => {
      for (const { t, payload } of Object.values(timers.current)) {
        window.clearTimeout(t);
        dashApi.action(payload, true).catch(() => {});
      }
      timers.current = {};
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const set = (id: string, v: State | null) => setState((cur) => {
    const n = { ...cur };
    if (v) n[id] = v; else delete n[id];
    return n;
  });

  const commit = async (a: AttentionItem, payload: Record<string, unknown>) => {
    delete timers.current[a.id];
    set(a.id, { s: 'working', text: a.action.type === 'api' ? a.action.done : '' });
    try {
      const r = await dashApi.action(payload);
      set(a.id, { s: 'done', text: r.done, undo: r.undo });
      onChanged?.();
    } catch (e) {
      set(a.id, null);
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const run = (a: AttentionItem) => {
    const act = a.action;
    if (act.type === 'navigate') { navigate(act.to); return; }
    if (act.type === 'copy') {
      navigator.clipboard?.writeText(act.value).then(
        () => { setKept((k) => ({ ...k, [a.id]: a })); set(a.id, { s: 'done', text: act.done }); },
        () => notify(`Copia este enlace: ${act.value}`, 'info'),
      );
      return;
    }
    setKept((k) => ({ ...k, [a.id]: a }));
    set(a.id, { s: 'pending', text: act.done });
    const t = window.setTimeout(() => commit(a, act.payload), COMMIT_MS);
    timers.current[a.id] = { t, payload: act.payload };
  };

  const undo = async (a: AttentionItem) => {
    const st = state[a.id];
    const pending = timers.current[a.id];
    if (pending) {
      window.clearTimeout(pending.t);
      delete timers.current[a.id];
      set(a.id, null);
      return;
    }
    if (st?.s === 'done' && st.undo) {
      try {
        await dashApi.action(st.undo);
        set(a.id, null);
        onChanged?.();
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), 'error');
      }
    } else {
      set(a.id, null);
    }
  };

  const shown = items === null ? null
    : [...items, ...Object.values(kept).filter((k) => state[k.id] && !items.some((i) => i.id === k.id))];
  const left = (shown || []).filter((a) => !state[a.id]).length;
  const busy = Object.values(state).some((v) => v.s !== 'done' || !!v.undo);

  return (
    <Card labelledBy="att-h" id="att-card">
      <CardHead id="att-h" title={fresh ? 'Para empezar' : 'Necesita tu atención'}
        right={left > 0 ? <CountPill n={left} label={`${left} pendientes`} /> : undefined} />
      {shown === null ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={58} />)
      ) : left === 0 && !busy ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1, py: 2.5 }}>
          <IBadge tone="ok" size={52} round><LocalCafeOutlinedIcon /></IBadge>
          <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>Todo en orden</Typography>
          <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.92rem' }}>Nada pendiente. Disfruta del café.</Typography>
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-live="polite">
          {shown.map((a) => {
            const st = state[a.id];
            const hecho = st && (st.s === 'pending' || st.s === 'done' || st.s === 'working');
            const canUndo = st && (st.s === 'pending' || (st.s === 'done' && !!st.undo));
            return (
              <Box component="li" key={a.id} sx={{
                display: 'flex', alignItems: 'center', gap: { xs: '6px 14px', sm: 1.75 }, py: 1.5, px: 0.5, flexWrap: { xs: 'wrap', sm: 'nowrap' },
                borderTop: '1px solid var(--studio-border-color)', '&:first-of-type': { borderTop: 0 },
                opacity: hecho ? 0.82 : 1, transition: 'opacity .2s',
              }}>
                {hecho
                  ? <IBadge tone="ok" size={42} round><CheckRoundedIcon /></IBadge>
                  : <IBadge tone={a.tone} size={42} round><KitIcon name={a.icon} /></IBadge>}
                <Box sx={{ flex: { xs: '1 1 calc(100% - 70px)', sm: 1 }, minWidth: 0 }}>
                  {hecho ? (
                    <Typography sx={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--studio-ink)', lineHeight: 1.3 }}>
                      {st.text || 'Hecho'}
                    </Typography>
                  ) : (
                    <>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--studio-ink)', lineHeight: 1.3 }}>{a.title}</Typography>
                      <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.85rem' }}>{a.subtitle}</Typography>
                    </>
                  )}
                </Box>
                <Box sx={{ ml: { xs: '56px', sm: 0 }, flex: 'none' }}>
                  {hecho ? (
                    canUndo ? (
                      <Button size="small" startIcon={<UndoRoundedIcon />} onClick={() => undo(a)}
                        aria-label={`Deshacer: ${a.title}`} sx={{ color: 'var(--studio-ink)' }}>
                        Deshacer
                      </Button>
                    ) : null
                  ) : (
                    <TonalButton size="small" onClick={() => run(a)}>{a.action.label}</TonalButton>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Card>
  );
}
