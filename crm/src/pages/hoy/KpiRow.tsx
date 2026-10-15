import { Box, Paper, Skeleton, Typography } from '@mui/material';
import type { Kpi } from '../kit/api';
import { fmtCount, fmtDelta, fmtMoney } from '../kit/format';
import { KitIcon, Spark, TrendIcon } from '../kit/ui';

function valueText(k: Kpi, currency: string) {
  if (k.value === null || k.value === undefined) return '—';
  if (k.format === 'money') return fmtMoney(k.value, currency);
  if (k.format === 'pct') return `${k.value}%`;
  return fmtCount(k.value);
}

export function KpiCard({ k, currency }: { k: Kpi; currency: string }) {
  const value = valueText(k, currency);
  const d = k.delta;
  const color = !d || d.trend === 'flat' ? 'var(--studio-muted)' : d.trend === 'up' ? 'var(--studio-ok)' : 'var(--studio-warn)';
  return (
    <Paper elevation={1} sx={{
      p: { xs: 1.5, sm: 2 }, pb: { xs: 1.25, sm: 1.5 }, minWidth: 0, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(165deg, var(--studio-c-${k.tint}) 0%, var(--studio-card-bg) 64%)`,
    }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.25 }}>
        <Box aria-hidden sx={{ width: { xs: 30, sm: 34 }, height: { xs: 30, sm: 34 }, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf)', color: 'var(--studio-ink)' }}>
          <KitIcon name={k.icon} size={18} />
        </Box>
        <Typography component="h3" sx={{ fontSize: { xs: '0.8rem', sm: '0.85rem' }, fontWeight: 600, color: 'var(--studio-ink)', lineHeight: 1.3 }}>{k.label}</Typography>
      </Box>
      <Typography sx={{
        fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', letterSpacing: '-0.02em',
        fontSize: { xs: '1.5rem', sm: '1.9rem' }, lineHeight: 1.1, mt: 1.25, mb: 0.25, color: 'var(--studio-ink)', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1, minHeight: 34, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        {d ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px', lineHeight: 1.25, minWidth: 0 }}>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 700, fontSize: '0.84rem', color }}>
              <TrendIcon trend={d.trend} />{fmtDelta(d.value, d.kind)}
            </Box>
            <Typography component="small" sx={{ fontSize: '0.76rem', color: 'var(--studio-muted)' }}>{d.label}</Typography>
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)', lineHeight: 1.35 }}>{k.hint}</Typography>
        )}
        {d && k.spark && <Spark values={k.spark} label={`${k.label}: evolución ${k.key === 'revenue_month' ? 'de los últimos 7 meses' : 'de las últimas 7 semanas'}, ahora ${value}`} />}
      </Box>
    </Paper>
  );
}

export default function KpiRow({ kpis, currency }: { kpis: Kpi[] | null; currency: string }) {
  return (
    <Box component="section" aria-label="Resumen en cifras" sx={{ display: 'grid', gap: { xs: 1.25, sm: 1.75 }, mb: { xs: 2, sm: 2.25 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
      {kpis
        ? kpis.map((k) => <KpiCard key={k.key} k={k} currency={currency} />)
        : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={128} sx={{ borderRadius: 'var(--studio-radius-lg)' }} />)}
    </Box>
  );
}
