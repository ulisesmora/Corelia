// «Hoy»: lo primero que ve el estudio al entrar. Saludo, cuatro cifras con su
// tendencia, lo que necesita atención (resuelto en un clic), las clases del
// día y, a la derecha, extras, accesos rápidos, reservas de 14 días y lo
// último. Los datos salen de GET /api/v1/dashboard/today/ (api/utils/dashboard.py).
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Skeleton, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import HomeSlot from '../onboarding/HomeSlot';
import { HowItWorks } from '../onboarding/coach';
import { dashApi, type TodayData } from './kit/api';
import { greeting, longDate, plural } from './kit/format';
import KpiRow from './hoy/KpiRow';
import Attention from './hoy/Attention';
import RenewalsCard from './hoy/RenewalsCard';
import Timeline from './hoy/Timeline';
import { ChartCard, ExtrasCard, FeedCard, QuickCard } from './hoy/SideCards';

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback((quiet = false) => {
    if (!quiet) setError('');
    return dashApi.today()
      .then(setData)
      .catch((e) => { if (!quiet) setError(e instanceof Error ? e.message : String(e)); });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Al volver a la pestaña, cifras al día
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const firstName = (user?.name || '').split(' ')[0];
  const s = data?.summary;
  const line = !data ? null : s?.closed
    ? `Hoy el estudio está cerrado${s.closed.reason ? ` · ${s.closed.reason}` : ''}`
    : s && s.classes
      ? `${plural(s.classes, 'clase', 'clases')}${data.has_bookings ? ` y ${plural(s.bookings, 'reserva', 'reservas')}` : ''} hoy`
      : 'Hoy no hay clases';

  return (
    <Box sx={{ pb: 2 }}>
      <HomeSlot />

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: { xs: 'nowrap', sm: 'wrap' }, mt: { xs: 0.5, md: 1 }, mb: { xs: 2, sm: 2.75 } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h1" tabIndex={-1} id="page-title" data-tour="page-head" sx={{ fontSize: { xs: '1.7rem', md: '2.3rem' }, outline: 'none' }}>
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </Typography>
          <Typography sx={{ color: 'var(--studio-muted)', mt: 0.75, fontSize: { xs: '0.95rem', sm: '1rem' } }}>
            {data ? `${longDate(data.today)} · ${line}` : <Skeleton width={260} />}
          </Typography>
        </Box>
        {/* Visita de 3 pasos de esta pantalla (la de bienvenida está en «?» → Visita guiada) */}
        <HowItWorks page="today" />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => load()}>Reintentar</Button>}>
          No se ha podido cargar el resumen. {error}
        </Alert>
      )}

      <KpiRow kpis={data?.kpis ?? null} currency={data?.currency || 'EUR'} />

      <Box sx={{ display: 'grid', gap: { xs: 2, sm: 2.25 }, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 360px' } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 2.25 }, minWidth: 0 }}>
          <Attention items={data?.attention ?? null} fresh={!!data && !data.has_bookings} onChanged={() => load(true)} />
          <RenewalsCard data={data?.renewals} onChanged={() => load(true)} />
          <Timeline initial={data?.timeline ?? null} today={data?.today || ''} />
        </Box>
        <Box sx={{
          minWidth: 0, gap: { xs: 2, sm: 2.25 }, alignItems: { xs: 'stretch', md: 'start', lg: 'stretch' },
          display: { xs: 'flex', md: 'grid', lg: 'flex' }, flexDirection: 'column',
          gridTemplateColumns: { md: 'repeat(2, minmax(0, 1fr))' },
        }}>
          {data && <ExtrasCard extras={data.extras} />}
          <QuickCard />
          <ChartCard chart={data?.chart ?? null} today={data?.today || ''} />
          <FeedCard feed={data?.feed ?? null} />
        </Box>
      </Box>
    </Box>
  );
}
