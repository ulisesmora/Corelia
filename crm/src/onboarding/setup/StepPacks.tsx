import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Stack, Switch, Typography } from '@mui/material';
import { useNotify } from '../../components/guide';
import { loadPacks, savePack, type PackSuggestion } from '../api';
import { useAutosave, useDebouncedSave, useStepGuard } from './autosave';
import { FieldError } from './ui';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', MXN: '$', CHF: 'CHF' };

/** Paso 7: bonos sugeridos (a partir del precio de la clase suelta): encender, apagar, precio. */
export default function StepPacks({ onChanged }: { onChanged?: (packs: PackSuggestion[], currency: string) => void }) {
  const notify = useNotify();
  const { track } = useAutosave();
  const [packs, setPacks] = useState<PackSuggestion[] | null>(null);
  const [currency, setCurrency] = useState('EUR');
  const [error, setError] = useState('');
  const seeded = useRef<Promise<unknown> | null>(null);

  const apply = (r: { packs: PackSuggestion[]; currency: string }) => {
    // «12.00» → «12» (los céntimos solo si los hay)
    const tidy = r.packs.map((p) => ({ ...p, price: Number.isFinite(Number(p.price)) ? String(Number(p.price)) : p.price }));
    r = { ...r, packs: tidy };
    setPacks(r.packs);
    setCurrency(r.currency);
    onChanged?.(r.packs, r.currency);
  };

  useEffect(() => {
    let alive = true;
    loadPacks()
      .then(async (r) => {
        // La primera vez: los sugeridos ya encendidos («Te sugerimos estos»)
        if (!r.packs.some((p) => p.plan_id)) {
          seeded.current ??= (async () => {
            let last = r;
            for (const p of r.packs.filter((x) => x.suggested_on)) last = await track(savePack({ key: p.key, on: true }));
            return last;
          })();
          r = (await seeded.current) as typeof r;
        }
        if (alive) apply(r);
      })
      .catch((e) => alive && setError(errText(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePrice = useDebouncedSave(async (v: { key: string; price: string }) => {
    try {
      apply(await savePack(v));
    } catch (e) {
      notify(errText(e), 'error');
      throw e;
    }
  }, 700);

  useStepGuard(() => {
    if (!packs?.some((p) => p.on)) { setError('Ofrece al menos un bono.'); return false; }
    return true;
  });

  const toggle = async (p: PackSuggestion, on: boolean) => {
    setError('');
    setPacks((list) => (list || []).map((x) => (x.key === p.key ? { ...x, on } : x)));
    try {
      apply(await track(savePack({ key: p.key, on })));
    } catch (e) {
      notify(errText(e), 'error');
      setPacks((list) => (list || []).map((x) => (x.key === p.key ? { ...x, on: !on } : x)));
    }
  };

  if (!packs) return error ? <FieldError>{error}</FieldError> : <CircularProgress aria-label="Cargando los bonos" />;

  return (
    <Stack spacing={1.25}>
      {packs.map((p) => {
        const id = `pack-${p.key}`;
        return (
          <Box key={p.key} sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: '12px 14px', borderRadius: 'var(--studio-radius-lg)', flexWrap: 'wrap',
            background: 'var(--studio-surf)', border: '2px solid', borderColor: p.on ? 'var(--studio-primary-fill)' : 'var(--studio-border-color)',
            transition: 'border-color .2s',
            '[data-panel-style="brutalist"]:not([data-panel-classic]) &': p.on ? { borderColor: 'var(--studio-ink)', boxShadow: '3px 3px 0 var(--studio-ink)' } : {},
          }}>
            <Switch checked={p.on} onChange={(e) => toggle(p, e.target.checked)} slotProps={{ input: { 'aria-labelledby': `${id}-name` } }} />
            <Box sx={{ flex: '1 1 140px', minWidth: 0, opacity: p.on ? 1 : 0.7 }}>
              <Typography id={`${id}-name`} sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>{p.name}</Typography>
              <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>
                {p.credits === 1 ? '1 clase' : `${p.credits} clases`} · {p.description}
              </Typography>
            </Box>
            <Box component="label" htmlFor={`${id}-price`} sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, minHeight: 48, borderRadius: 'var(--studio-radius-md)',
              background: 'var(--studio-surf2)', opacity: p.on ? 1 : 0.55, ml: 'auto',
            }}>
              <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Precio de {p.name}</Box>
              <Box
                component="input"
                id={`${id}-price`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                disabled={!p.on}
                value={p.price}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const price = e.target.value;
                  setPacks((list) => (list || []).map((x) => (x.key === p.key ? { ...x, price } : x)));
                  if (Number(price) > 0) savePrice({ key: p.key, price }, p.key);
                }}
                sx={{
                  width: 72, border: 0, background: 'transparent', textAlign: 'right', fontWeight: 700, fontSize: '1.05rem',
                  color: 'var(--studio-ink)', fontFamily: 'var(--studio-font-body)', outline: 'none', fontVariantNumeric: 'tabular-nums',
                  '&:focus-visible': { boxShadow: '0 2px 0 var(--studio-primary-fill)' },
                }}
              />
              <Box component="span" aria-hidden sx={{ fontWeight: 700, color: 'var(--studio-muted)' }}>{SYMBOL[currency] || currency}</Box>
            </Box>
          </Box>
        );
      })}
      <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.88rem' }}>
        ¿Cuotas mensuales o más bonos? Los añades luego en Ventas → Bonos y precios.
      </Typography>
      {error && <FieldError>{error}</FieldError>}
    </Stack>
  );
}
