// Columna derecha de «Hoy»: extras opcionales, accesos rápidos, reservas de
// los últimos 14 días y lo último que ha pasado.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, IconButton, LinearProgress, Skeleton, Typography } from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { useShell } from '../../components/shell/ShellContext';
import type { Extra, TodayData } from '../kit/api';
import { ago, dayLabel, shortDate } from '../kit/format';
import { Avatar, Card, CardHead } from '../kit/ui';
import { visuallyHidden } from '../kit/styles';
import type { Tint } from '../kit/api';

const LS_EXTRAS = 'hoy.extrasHidden';

function readHidden() {
  try { return localStorage.getItem(LS_EXTRAS) === '1'; } catch { return false; }
}

export function ExtrasCard({ extras }: { extras: Extra[] }) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(readHidden);
  const done = extras.filter((e) => e.done).length;
  if (hidden || !extras.length || done === extras.length) return null;
  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(LS_EXTRAS, '1'); } catch { /* sin almacenamiento */ }
  };
  return (
    <Card labelledBy="ex-h" id="extras-card">
      <CardHead id="ex-h" title="Extras opcionales" right={
        <IconButton onClick={hide} aria-label="Ocultar extras opcionales" sx={{ width: 44, height: 44, m: -1.25 }}><CloseRoundedIcon fontSize="small" /></IconButton>
      } />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
        <LinearProgress variant="determinate" value={(done / extras.length) * 100} sx={{ flex: 1 }}
          aria-label="Extras activados" aria-valuetext={`${done} de ${extras.length}`} />
        <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)', fontVariantNumeric: 'tabular-nums' }}>{done} de {extras.length}</Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {extras.map((e) => (
          <li key={e.key}>
            <ButtonBase onClick={() => navigate(e.to)} disabled={e.done} sx={{
              width: '100%', justifyContent: 'flex-start', gap: 1.5, minHeight: 44, px: 1, py: 0.75, borderRadius: 'var(--studio-radius-md)',
              textAlign: 'left', fontWeight: 600, fontSize: '0.9rem', color: 'var(--studio-ink)', '&:hover': { background: 'var(--studio-surf2)' },
            }}>
              <Box component="span" aria-hidden sx={{
                width: 22, height: 22, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: '2px solid', borderColor: e.done ? 'var(--studio-ok)' : 'var(--studio-border-strong)',
                background: e.done ? 'var(--studio-ok)' : 'transparent', color: 'var(--studio-surf)',
              }}>
                {e.done && <CheckRoundedIcon sx={{ fontSize: 15 }} />}
              </Box>
              <Box component="span" sx={{ flex: 1 }}>{e.label}<Box component="span" sx={visuallyHidden}>{e.done ? ', activado' : ''}</Box></Box>
              {!e.done && (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: 'var(--studio-primary-text)', fontSize: '0.86rem' }}>
                  Activar<ChevronRightRoundedIcon sx={{ fontSize: 18 }} aria-hidden />
                </Box>
              )}
            </ButtonBase>
          </li>
        ))}
      </Box>
    </Card>
  );
}


export function QuickCard() {
  const navigate = useNavigate();
  const { openNewClient } = useShell();
  const Q: { icon: typeof LayersOutlinedIcon; label: string; tint: Tint; run: () => void }[] = [
    { icon: EventAvailableOutlinedIcon, label: 'Nueva reserva', tint: 'reformer', run: () => openNewClient('existing') },
    { icon: PersonAddAlt1OutlinedIcon, label: 'Nueva clienta', tint: 'yoga', run: () => openNewClient('new') },
    { icon: LayersOutlinedIcon, label: 'Crear clase', tint: 'mat', run: () => navigate('/calendar?accion=nueva') },
    { icon: CreditCardOutlinedIcon, label: 'Cobrar en mano', tint: 'privada', run: () => navigate('/credits?accion=anadir') },
    { icon: CampaignOutlinedIcon, label: 'Avisar a clientas', tint: 'barre', run: () => navigate('/mails?accion=nuevo') },
    { icon: LanguageRoundedIcon, label: 'Mi web', tint: 'reformer', run: () => navigate('/mi-web') },
  ];
  return (
    <Card labelledBy="qa-h" tour="today-quick">
      <CardHead id="qa-h" title="Accesos rápidos" />
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' } }}>
        {Q.map(({ icon: I, label, tint, run }) => (
          <ButtonBase key={label} onClick={run} sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.25, p: 1.5, minHeight: 88,
            borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)', textAlign: 'left', fontSize: '0.85rem', fontWeight: 600,
            color: 'var(--studio-ink)', transition: 'background-color .2s, transform .12s',
            '&:hover': { background: 'var(--studio-p-soft)' }, '&:active': { transform: 'scale(.97)' },
            '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: 2 },
          }}>
            <Box aria-hidden sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 'var(--studio-radius-md)', background: `var(--studio-c-${tint})` }}>
              <I sx={{ fontSize: 18 }} />
            </Box>
            {label}
          </ButtonBase>
        ))}
      </Box>
    </Card>
  );
}

export function ChartCard({ chart, today }: { chart: TodayData['chart'] | null; today: string }) {
  if (!chart) return <Skeleton variant="rounded" height={180} sx={{ borderRadius: 'var(--studio-radius-lg)' }} />;
  const mx = Math.max(1, ...chart.map((c) => c.count));
  const total = chart.reduce((a, c) => a + c.count, 0);
  const last = chart[chart.length - 1];
  const closed = chart.find((c) => c.closed && c.date !== last.date && c.date !== chart[0].date);
  const desc = `Reservas de los últimos 14 días: ${chart.map((c) => c.count).join(', ')}. Hoy ${last.count}.`;
  return (
    <Card labelledBy="ch-h">
      <CardHead id="ch-h" title="Reservas · 14 días" right={total ? <Typography sx={{ fontSize: '0.85rem', color: 'var(--studio-muted)', fontVariantNumeric: 'tabular-nums' }}>Hoy {last.count}</Typography> : undefined} />
      {total === 0 ? (
        <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.9rem' }}>Aquí verás cómo crecen tus reservas día a día.</Typography>
      ) : (
        <>
          <Box role="img" aria-label={desc} sx={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: 90, pt: 0.75 }}>
            {chart.map((c, i) => (
              <Box key={c.date} title={`${dayLabel(c.date, today)}: ${c.count} reservas${c.closed ? ` · ${c.closed}` : ''}`} sx={{
                flex: 1, minHeight: 4, height: `${Math.max(4, (c.count / mx) * 100)}%`,
                borderRadius: 'min(6px, var(--studio-radius-md)) min(6px, var(--studio-radius-md)) 2px 2px',
                background: i === chart.length - 1 ? 'var(--studio-primary-fill)' : c.closed ? 'var(--studio-surf2)' : 'var(--studio-border-strong)',
                opacity: i === chart.length - 1 ? 1 : 0.8,
              }} />
            ))}
          </Box>
          <Box aria-hidden sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--studio-muted)', mt: 0.75 }}>
            <span>{shortDate(chart[0].date)}</span>
            {closed && <span>{shortDate(closed.date)} · {closed.closed}</span>}
            <span>Hoy</span>
          </Box>
        </>
      )}
    </Card>
  );
}

export function FeedCard({ feed }: { feed: TodayData['feed'] | null }) {
  return (
    <Card labelledBy="fd-h">
      <CardHead id="fd-h" title="Lo último" />
      {!feed ? [0, 1, 2].map((i) => <Skeleton key={i} height={44} />) : feed.length === 0 ? (
        <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.9rem' }}>Aquí verás las reservas, compras y altas según vayan llegando.</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {feed.map((f) => (
            <Box component="li" key={f.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 1 }}>
              <Avatar name={f.name} initials={f.initials} size={30} ring={false} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.88rem', lineHeight: 1.35, color: 'var(--studio-ink)' }}>
                  <b>{f.name.split(' ')[0]}</b> {f.text}
                </Typography>
                <Typography component="small" sx={{ fontSize: '0.78rem', color: 'var(--studio-muted)' }}>{ago(f.at)}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}

