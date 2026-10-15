import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import StudioIcon from '../site/StudioIcon';
import { setupStepLink } from './flow';
import type { Lock } from './locks';

/**
 * Lo que se ve al entrar (por enlace o escribiendo la dirección) en una parte
 * del panel que aún no está abierta: por qué y un botón al paso que la abre.
 */
export default function LockedScreen({ lock, title }: { lock: Lock; title: string }) {
  const navigate = useNavigate();
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h1.current?.focus({ preventScroll: true }); }, [title]);

  return (
    <Box
      sx={{
        mt: { xs: 1, md: 2.5 }, mx: 'auto', maxWidth: 560, textAlign: 'center', p: { xs: 3, md: 5 },
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
        background: 'var(--studio-card-bg)', border: 'var(--studio-card-border)', borderRadius: 'var(--studio-radius-xl)',
        boxShadow: 'var(--studio-shadow-1)',
      }}
    >
      <Box aria-hidden sx={{ width: 56, height: 56, borderRadius: 'var(--studio-radius-lg)', display: 'grid', placeItems: 'center', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }}>
        <StudioIcon name="lock" />
      </Box>
      <Typography ref={h1} tabIndex={-1} variant="h1" sx={{ fontSize: { xs: '1.35rem', md: '1.6rem' }, outline: 'none' }}>
        {title} todavía no está disponible
      </Typography>
      <Typography sx={{ color: 'var(--studio-muted)' }}>{lock.why}. Así no te pierdes: el panel se va abriendo a medida que avanzas.</Typography>
      <Button variant="contained" size="large" endIcon={<StudioIcon name="next" />} onClick={() => navigate(setupStepLink(lock.step))} sx={{ mt: 1, minHeight: 48 }}>
        Ir a {lock.stepLabel}
      </Button>
    </Box>
  );
}
