import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, Chip, Typography } from '@mui/material';
import QRCode from 'qrcode';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import { useNotify } from '../../components/guide';
import type { SetupProgress } from '../api';
import { FLOW } from '../flow';
import { Eyebrow } from './ui';

/** Código QR de verdad (librería qrcode) de la dirección de la web. */
export function QrCode({ url, size = 148 }: { url: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(''));
    return () => { alive = false; };
  }, [url, size]);
  return (
    <Box sx={{ width: size, height: size, p: 1, borderRadius: 'var(--studio-radius-md)', background: '#fff', flex: 'none', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.08)' }}>
      {src && <Box component="img" src={src} alt={`Código QR de tu web: ${url}`} sx={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />}
    </Box>
  );
}

interface Summary { counts: Record<string, number>; studioName: string; styleName: string; slots: number; packs: number }

/** Paso 8 antes de publicar: repaso con «Cambiar» en cada línea. */
export function PublishReview({ summary, onGo }: { summary: Summary; onGo: (step: number) => void }) {
  const n = (k: string) => summary.counts[k] ?? 0;
  const plural = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  const rows: [StudioIconName, string][] = [
    ['studio', summary.studioName],
    ['style', summary.styleName],
    ['rooms', plural(n('rooms'), 'sala', 'salas')],
    ['instructors', plural(n('instructors'), 'persona da clases', 'personas dan clases')],
    ['classTypes', plural(n('class_types'), 'tipo de clase', 'tipos de clase')],
    ['schedule', plural(summary.slots || n('schedule'), 'clase a la semana', 'clases a la semana')],
    ['plans', plural(summary.packs || n('plans'), 'bono a la venta', 'bonos a la venta')],
  ];
  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-card-bg)', border: 'var(--studio-card-border)', boxShadow: 'var(--studio-shadow-1)' }}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map(([icon, text], i) => (
          <Box component="li" key={icon} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 52, px: 0.5, borderTop: i ? '1px solid var(--studio-border-color)' : 'none' }}>
            <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--studio-ok)', color: 'var(--studio-surf)', flex: 'none' }}>
              <StudioIcon name="done" sx={{ fontSize: 16 }} />
            </Box>
            <StudioIcon name={icon} aria-hidden sx={{ color: 'var(--studio-muted)', fontSize: 20 }} />
            <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700, color: 'var(--studio-ink)', overflowWrap: 'anywhere' }}>{text}</Typography>
            <ButtonBase onClick={() => onGo(i + 1)} aria-label={`Cambiar: ${FLOW[i].label}`}
              sx={{ minHeight: 44, px: 1.25, borderRadius: 'var(--studio-radius-btn)', fontWeight: 700, color: 'var(--studio-primary-text)', fontFamily: 'var(--studio-font-body)', '&:hover': { textDecoration: 'underline' } }}>
              Cambiar
            </ButtonBase>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const EXTRAS: { icon: StudioIconName; label: string; path: string }[] = [
  { icon: 'payments', label: 'Cobrar online', path: '/ajustes?tab=pagos' },
  { icon: 'notices', label: 'Emails a clientes', path: '/ajustes?tab=emails' },
  { icon: 'google', label: 'Google y tu ficha', path: '/ajustes?tab=google' },
  { icon: 'photos', label: 'Fotos y textos', path: '/ajustes?tab=portada' },
];

/** Paso 8 después de publicar: enhorabuena, enlace, QR y extras opcionales. */
export function Published({ webUrl, titleRef, titleId }: { webUrl: string; progress: SetupProgress | null; titleRef: React.Ref<HTMLHeadingElement>; titleId: string }) {
  const notify = useNotify();
  const navigate = useNavigate();
  const host = webUrl.replace(/^https?:\/\//, '');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webUrl);
      notify('Enlace copiado', 'success');
    } catch {
      notify('No se ha podido copiar. Mantén pulsado el enlace para copiarlo.', 'error');
    }
  };
  return (
    <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 640, mx: 'auto' }}>
      <Box aria-hidden sx={{ width: 84, height: 84, borderRadius: '50%', display: 'grid', placeItems: 'center', mb: 2.25, background: 'var(--studio-ok-soft)', color: 'var(--studio-ok)' }}>
        <StudioIcon name="done" sx={{ fontSize: 42 }} />
      </Box>
      <Typography ref={titleRef} id={titleId} tabIndex={-1} variant="h1" sx={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', mb: 1.25, outline: 'none' }}>
        ¡Tu estudio ya está abierto!
      </Typography>
      <Typography sx={{ color: 'var(--studio-muted)', fontSize: '1.06rem', mb: 3 }}>Comparte el enlace y empieza a recibir reservas.</Typography>

      {webUrl && (
        <Box sx={{
          width: '100%', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'auto minmax(0, 1fr)' }, gap: 2.5, alignItems: 'center',
          justifyItems: { xs: 'center', sm: 'stretch' }, textAlign: { xs: 'center', sm: 'left' }, p: 2.5,
          borderRadius: 'var(--studio-radius-xl)', background: 'var(--studio-card-bg)', border: 'var(--studio-card-border)', boxShadow: 'var(--studio-shadow-2)',
        }}>
          <QrCode url={webUrl} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '6px 6px 6px 14px', borderRadius: 999, background: 'var(--studio-surf2)', minWidth: 0 }}>
              <Box component="span" sx={{ flex: 1, minWidth: 0, fontWeight: 700, overflowWrap: 'anywhere', textAlign: 'left' }}>{host}</Box>
              <Button size="small" variant="contained" startIcon={<StudioIcon name="copy" sx={{ fontSize: 16 }} />} onClick={copy} sx={{ minHeight: 40, flex: 'none' }}>Copiar</Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
              <Button size="small" variant="outlined" component="a" href={webUrl} target="_blank" rel="noopener" startIcon={<StudioIcon name="external" sx={{ fontSize: 16 }} />} sx={{ minHeight: 40 }}>
                Ver mi web
              </Button>
              <Chip icon={<StudioIcon name="phone" sx={{ fontSize: 16 }} />} label="App para clientes incluida" sx={{ fontWeight: 700, background: 'var(--studio-ok-soft)', color: 'var(--studio-ink)', '& .MuiChip-icon': { color: 'var(--studio-ok)' } }} />
            </Box>
            <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.86rem' }}>¿Tienes dominio propio? Lo conectas cuando quieras en Ajustes.</Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ alignSelf: 'stretch', mt: 3.5, textAlign: 'left' }}>
        <Eyebrow>Cuando quieras · opcional</Eyebrow>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {EXTRAS.map((x) => (
            <ButtonBase key={x.label} onClick={() => navigate(x.path)} sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, p: 1.75, minHeight: 92, textAlign: 'left',
              borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)',
              fontWeight: 600, fontSize: '0.88rem', color: 'var(--studio-ink)', fontFamily: 'var(--studio-font-body)',
              '&:hover': { borderColor: 'var(--studio-primary-text)' }, '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-fill)', outlineOffset: 2 },
            }}>
              <Box aria-hidden sx={{ width: 34, height: 34, borderRadius: 'min(var(--studio-radius-md), 10px)', display: 'grid', placeItems: 'center', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }}>
                <StudioIcon name={x.icon} sx={{ fontSize: 18 }} />
              </Box>
              {x.label}
            </ButtonBase>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
