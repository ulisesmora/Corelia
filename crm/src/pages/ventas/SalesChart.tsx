import { Box, Typography } from '@mui/material';
import type { SalesData } from '../kit/api';
import { fmtMoney } from '../kit/format';

/** Barras del periodo (color de marca) con el periodo anterior detrás (gris). */
export default function SalesChart({ data }: { data: SalesData }) {
  const { chart, currency } = data;
  const mx = Math.max(1, ...chart.map((c) => Math.max(c.value || 0, c.prev || 0)));
  const total = chart.reduce((a, c) => a + (c.value || 0), 0);
  const prevTotal = chart.reduce((a, c) => a + (c.prev || 0), 0);
  const many = chart.length > 14;
  const best = chart.reduce((b, c) => ((c.value || 0) > (b?.value || 0) ? c : b), chart[0]);
  const desc = `Ingresos de ${data.label}: ${fmtMoney(total, currency)}; periodo anterior completo: ${fmtMoney(prevTotal, currency)}.`
    + (best && best.value ? ` El mejor tramo, ${best.label}, con ${fmtMoney(best.value, currency)}.` : '');
  const labelEvery = chart.length > 20 ? 5 : chart.length > 12 ? 3 : 1;
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--studio-muted)', mb: 1.25 }} aria-hidden>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="i" sx={{ width: 10, height: 10, borderRadius: '3px', background: 'var(--studio-primary-fill)' }} />Este periodo
        </Box>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="i" sx={{ width: 10, height: 10, borderRadius: '3px', background: 'var(--studio-border-strong)', opacity: 0.55 }} />Anterior
        </Box>
      </Box>
      <Box role="img" aria-label={desc} sx={{ display: 'flex', alignItems: 'flex-end', gap: many ? '2px' : '6px', height: { xs: 130, sm: 170 } }}>
        {chart.map((c) => (
          <Box key={c.start} title={`${c.label}: ${c.value === null ? '—' : fmtMoney(c.value, currency)} (antes ${fmtMoney(c.prev, currency)})`}
            sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <Box sx={{ position: 'absolute', bottom: 0, left: many ? 0 : '8%', right: many ? 0 : '8%', height: `${(c.prev / mx) * 100}%`, borderRadius: '4px 4px 1px 1px', background: 'var(--studio-border-strong)', opacity: 0.35 }} />
            <Box sx={{ position: 'relative', width: many ? '100%' : '64%', height: `${c.value ? Math.max(2, (c.value / mx) * 100) : 0}%`, borderRadius: '4px 4px 1px 1px', background: 'var(--studio-primary-fill)' }} />
          </Box>
        ))}
      </Box>
      <Box aria-hidden sx={{ display: 'flex', gap: many ? '2px' : '6px', mt: 0.75, overflow: 'hidden' }}>
        {chart.map((c, i) => (
          <Typography key={c.start} sx={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '0.7rem', color: 'var(--studio-muted)', overflow: 'visible', whiteSpace: 'nowrap' }}>
            {i % labelEvery === 0 ? c.label : ''}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
