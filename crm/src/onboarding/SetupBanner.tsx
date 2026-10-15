import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import StudioIcon from '../site/StudioIcon';
import { FLOW, setupStepLink } from './flow';
import { useLocks } from './locks';

/**
 * Aviso fijo arriba de cada pantalla mientras falta terminar la puesta en
 * marcha: «Te quedan N pasos · Seguir: Horario».
 */
export default function SetupBanner() {
  const navigate = useNavigate();
  const { unfinished, reached } = useLocks();
  if (!unfinished) return null;
  const step = Math.min(reached, FLOW.length);
  const left = FLOW.length - step + 1;
  const next = FLOW[step - 1];

  return (
    <Box
      role="region"
      aria-label="Puesta en marcha pendiente"
      data-tour="setup-banner"
      sx={{
        position: 'sticky', top: { xs: 64, lg: 76 }, zIndex: 20, mb: { xs: 2, md: 2.5 },
        display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 1.75 }, p: { xs: '10px 10px 10px 14px', sm: '12px 12px 12px 16px' },
        borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-ink)', color: 'var(--studio-surf)', boxShadow: 'var(--studio-shadow-2)',
        '[data-panel-mode="dark"] &': { background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)' },
      }}
    >
      <StudioIcon name="launch" aria-hidden sx={{ display: { xs: 'none', sm: 'block' } }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '0.98rem' }, color: 'inherit', lineHeight: 1.3 }}>
          Te quedan {left} {left === 1 ? 'paso' : 'pasos'}
          <Box component="span" sx={{ fontWeight: 500, display: { xs: 'none', md: 'inline' } }}> para abrir reservas</Box>
        </Typography>
        <Box aria-hidden sx={{ display: 'flex', gap: '4px', mt: 0.75 }}>
          {FLOW.map((f, i) => (
            <Box key={f.key} sx={{ width: { xs: 12, sm: 18 }, height: 6, borderRadius: 9, background: 'currentColor', opacity: i < step - 1 ? 1 : 0.3 }} />
          ))}
        </Box>
      </Box>
      <Button
        onClick={() => navigate(setupStepLink(step))}
        endIcon={<StudioIcon name="next" sx={{ fontSize: 18 }} />}
        sx={{
          flex: 'none', minHeight: 44, px: { xs: 1.5, sm: 2 }, fontWeight: 700, whiteSpace: 'nowrap',
          background: 'var(--studio-surf)', color: 'var(--studio-ink)', '&:hover': { background: 'var(--studio-surf2)' },
          '[data-panel-mode="dark"] &': { background: 'var(--studio-on-primary)', color: 'var(--studio-primary-fill)' },
        }}
      >
        Seguir: {next.label}
      </Button>
    </Box>
  );
}
