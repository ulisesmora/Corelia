import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, FormControlLabel, Switch, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useSite } from '../../site/SiteProvider';
import { currencySymbol, money } from '../../site/money';
import { useClassTypeColor } from '../../design/classColors';
import { saveSettings } from '../../components/setup/api';
import { HowYouCharge, invalidateChargingFacts, useOpenGuide } from '../../components/charging';
import { useLocks } from '../../onboarding/locks';
import { setupStepLink } from '../../onboarding/flow';
import PlanManagement from '../Plans';
import type { CatalogHandle } from './embed';
import { catalogApi, num, type ClassTypeRow, type PlanRow } from './api';
import { AddTile, CardActions, CardList, InlineField, ItemCard, TabSection, TabStatus } from './ui';

const PERIOD: Record<string, [string, string]> = { month: ['mes', 'meses'], week: ['semana', 'semanas'], year: ['año', 'años'] };
const period = (p: PlanRow) => {
  const n = p.interval_count || 1;
  const [one, many] = PERIOD[p.interval || 'month'] || PERIOD.month;
  return n === 1 ? `cada ${one}` : `cada ${n} ${many}`;
};

/** Pestaña «Precios y bonos»: créditos y precio de cada clase, bonos y membresías. */
export default function PricesTab() {
  const locks = useLocks();
  const lock = locks.section('sales');
  const navigate = useNavigate();
  if (lock) {
    return (
      <Box sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: 'var(--studio-radius-xl)', background: 'var(--studio-card-bg, var(--studio-surf))', border: 'var(--studio-card-border, 1px solid var(--studio-border-color))', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25 }}>
        <Box aria-hidden sx={{ width: 52, height: 52, borderRadius: 'var(--studio-radius-lg)', display: 'grid', placeItems: 'center', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }}>
          <StudioIcon name="lock" />
        </Box>
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--studio-ink)' }}>Los precios se abren en el paso «{lock.stepLabel}»</Typography>
        <Typography sx={{ color: 'var(--studio-muted)', maxWidth: 420 }}>{lock.why}. Allí eliges tus bonos en un minuto.</Typography>
        <Button variant="contained" endIcon={<StudioIcon name="next" />} onClick={() => navigate(setupStepLink(lock.step))} sx={{ minHeight: 48 }}>
          Ir a {lock.stepLabel}
        </Button>
      </Box>
    );
  }
  return <Prices />;
}

function Prices() {
  const page = useRef<CatalogHandle>(null);
  const site = useSite();
  const openGuide = useOpenGuide();
  const color = useClassTypeColor();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [types, setTypes] = useState<ClassTypeRow[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const bump = () => { invalidateChargingFacts(); setVersion((v) => v + 1); };
  const sym = currencySymbol();

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, t] = await Promise.all([catalogApi.plans(), catalogApi.classTypes().catch(() => [])]);
      setPlans(p.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.credits - b.credits || num(a.price_eur) - num(b.price_eur)));
      setTypes(t.filter((x) => x.is_active).sort((a, b) => a.title.localeCompare(b.title)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlans((p) => p || []);
    }
    invalidateChargingFacts();
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePlan = async (p: PlanRow, body: Partial<PlanRow>) => {
    // El precio por clase que se ve en la web sigue al precio (si iba calculado)
    const extra: Partial<PlanRow> = {};
    const nextPrice = body.price_eur != null ? num(body.price_eur) : num(p.price_eur);
    const nextCredits = body.credits ?? p.credits;
    const wasAuto = p.price_credit != null && p.credits > 0 && Math.abs(num(p.price_credit) - num(p.price_eur) / p.credits) < 0.01;
    if (wasAuto && nextCredits > 0) extra.price_credit = (nextPrice / nextCredits).toFixed(2);
    await catalogApi.patch('plans', p.id, { ...body, ...extra });
    setPlans((list) => (list || []).map((x) => (x.id === p.id ? { ...x, ...body, ...extra } : x)));
    bump();
  };
  const saveType = async (ct: ClassTypeRow, body: Partial<ClassTypeRow>) => {
    await catalogApi.patch('class-types', ct.id, body);
    setTypes((list) => list.map((x) => (x.id === ct.id ? { ...x, ...body } : x)));
    bump();
  };
  const saveDropIn = async (v: string) => {
    await saveSettings({ drop_in_price: v });
    await site.refresh?.();
    bump();
  };

  const packs = (plans || []).filter((p) => p.type === 'pack');
  const subs = (plans || []).filter((p) => p.type === 'sub');
  const hasSingle = packs.some((p) => p.credits === 1 && p.is_active);

  const planCard = (p: PlanRow) => {
    const isSub = p.type === 'sub';
    const lockedPrice = isSub && Boolean(p.stripe_price_id);
    const perClass = p.credits > 0 ? num(p.price_eur) / p.credits : 0;
    return (
      <ItemCard
        key={p.id}
        muted={!p.is_active}
        head={(
          <>
            <InlineField big type="text" label={isSub ? 'Nombre de la membresía' : 'Nombre del bono'} value={p.name} onSave={(v) => savePlan(p, { name: v })} />
          </>
        )}
        fields={(
          <>
            <InlineField label={isSub ? 'Clases por periodo' : 'Clases'} value={p.credits} min={1} size={3}
              validate={(v) => (Number.isInteger(Number(v)) ? '' : 'Clases: escribe un número entero.')}
              onSave={(v) => savePlan(p, { credits: Number(v) })} />
            {lockedPrice ? (
              <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--studio-muted)', textTransform: 'uppercase' }}>Precio</Box>
                <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center', px: 1.25, fontWeight: 700, color: 'var(--studio-ink)' }}>
                  {money(p.price_eur, { decimals: 'auto' })} {period(p)}
                </Box>
              </Box>
            ) : (
              <InlineField label="Precio" value={num(p.price_eur)} min={0.5} step={0.5} size={4} suffix={isSub ? `${sym} ${period(p)}` : sym}
                onSave={(v) => savePlan(p, { price_eur: v })} />
            )}
            {!isSub && (
              <InlineField label="Caduca a los" value={p.credits_expire_days ?? ''} min={1} size={3} suffix="días"
                validate={(v) => (Number.isInteger(Number(v)) ? '' : 'Días: escribe un número entero.')}
                onSave={(v) => savePlan(p, { credits_expire_days: Number(v) })} />
            )}
            <FormControlLabel
              sx={{ m: 0, minHeight: 44, '& .MuiFormControlLabel-label': { fontSize: '0.84rem', fontWeight: 600, color: 'var(--studio-muted)' } }}
              control={<Switch checked={p.is_active} onChange={() => page.current?.toggle?.(p)} slotProps={{ input: { 'aria-label': `${p.name}: en la web` } }} />}
              label="En la web"
            />
          </>
        )}
        footer={(
          <>
            {perClass > 0 && (
              <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', mr: 'auto' }}>
                {money(perClass, { decimals: 'auto' })} por clase
              </Typography>
            )}
            <CardActions name={p.name} onEdit={() => page.current?.edit(p)} onRemove={() => page.current?.remove(p)} />
          </>
        )}
      />
    );
  };

  return (
    <>
      <PlanManagement embedded ref={page} onChanged={load} />
      <Box sx={{ mb: 3 }}>
        <HowYouCharge onGuide={() => openGuide('cobros')} version={version} />
      </Box>

      {plans === null || error ? <TabStatus loading={plans === null} error={error} onRetry={load} /> : (
        <>
          <TabSection id="pr-classes" title="Cada clase" hint="Cuántos créditos gasta del bono y cuánto paga quien reserva sin bono.">
            {types.length === 0 ? (
              <Typography sx={{ color: 'var(--studio-muted)' }}>Aún no hay tipos de clase.</Typography>
            ) : (
              <Box component="ul" aria-label="Precio de cada clase" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
                {types.map((ct) => (
                  <Box component="li" key={ct.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', p: 1.25, pl: 1.5, borderRadius: 'var(--studio-radius-md)',
                    background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)',
                  }}>
                    <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', flex: 'none', background: color(ct.id, ct.title).dot }} />
                    <Typography sx={{ flex: { xs: '1 1 calc(100% - 30px)', sm: '1 1 110px' }, minWidth: 0, fontWeight: 700, color: 'var(--studio-ink)' }}>{ct.title}</Typography>
                    <InlineField label="Créditos" value={num(ct.default_price_credits)} min={0} step={0.5} size={3}
                      onSave={(v) => saveType(ct, { default_price_credits: v })} />
                    <InlineField label="Clase suelta" value={num(ct.default_price_eur)} min={0} step={0.5} size={4} suffix={sym}
                      onSave={(v) => saveType(ct, { default_price_eur: v })} />
                  </Box>
                ))}
              </Box>
            )}
            {!hasSingle && (
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <InlineField label="Clase suelta (referencia)" value={num(site.config.drop_in_price) || ''} min={0.5} step={0.5} size={4} suffix={sym}
                  onSave={saveDropIn} />
                <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', flex: '1 1 200px' }}>Es el que se ve en tu web.</Typography>
              </Box>
            )}
          </TabSection>

          <TabSection id="pr-packs" title="Bonos" hint="Se pagan una vez y dan clases para gastar.">
            <CardList label="Bonos">
              {packs.map(planCard)}
              <AddTile label="Añadir bono" onClick={() => page.current?.create('pack')} />
            </CardList>
          </TabSection>

          <TabSection id="pr-subs" title="Membresías" hint="Se cobran solas cada mes (o cada periodo) y dan sus clases.">
            <CardList label="Membresías">
              {subs.map(planCard)}
              <AddTile label="Añadir membresía" onClick={() => page.current?.create('sub')} />
            </CardList>
          </TabSection>
        </>
      )}
    </>
  );
}
