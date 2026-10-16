import { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import StudioIcon from '../site/StudioIcon';
import { useSite } from '../site/SiteProvider';
import { FLOW, reachedOf, setupStepLink, setupUnfinished } from './flow';
import { useSetupProgress } from './progressContext';

/**
 * Lo primero de «Hoy» mientras la puesta en marcha no está terminada:
 * «Siguiente paso» con «Seguir donde lo dejé» y la lista de los 8 pasos (los
 * que aún no se pueden hacer, con candado). Con la web publicada: nada.
 *
 * La página «Hoy» lo pinta arriba del todo: `<HomeSlot />`.
 */
export default function HomeSlot() {
  const { progress } = useSetupProgress();
  const { config } = useSite();
  const navigate = useNavigate();
  const titleId = useId();
  if (!setupUnfinished(progress, config.setup_completed)) return null;

  const reached = Math.min(reachedOf(progress), FLOW.length);
  const next = FLOW[reached - 1];
  const doneCount = reached - 1;

  return (
    <Box
      component="section"
      aria-labelledby={titleId}
      data-tour="home-resume"
      sx={{
        mb: 3, p: { xs: 2.25, md: 3 }, display: 'grid', gap: { xs: 2.5, md: 3.5 }, alignItems: 'center',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
        background: 'var(--studio-card-bg)', border: 'var(--studio-card-border)', borderRadius: 'var(--studio-radius-xl)',
        boxShadow: 'var(--studio-shadow-1)', backdropFilter: 'var(--studio-blur)', WebkitBackdropFilter: 'var(--studio-blur)',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--studio-muted)' }}>
          Siguiente paso · {reached} de {FLOW.length}
        </Typography>
        <Typography id={titleId} component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)', fontSize: { xs: '1.45rem', md: '1.6rem' }, color: 'var(--studio-ink)', mt: 0.75, mb: 1 }}>
          {next.label}
        </Typography>
        <Typography sx={{ color: 'var(--studio-muted)', mb: 2.25, maxWidth: '44ch' }}>
          {doneCount === 0 ? 'Vamos a dejar tu estudio listo para reservar. Son 8 pasos cortos.' : next.hint}
        </Typography>
        <Button variant="contained" size="large" endIcon={<StudioIcon name="next" />} onClick={() => navigate(setupStepLink(reached))}
          sx={{ minHeight: 48, px: 2.5 }}>
          {doneCount === 0 ? 'Empezar' : 'Seguir donde lo dejé'}
        </Button>
      </Box>

      <Box component="ol" aria-label="Pasos de la puesta en marcha" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {FLOW.map((f, i) => {
          const n = i + 1;
          const state = n < reached ? 'done' : n === reached ? 'cur' : 'todo';
          return (
            <Box
              component="li"
              key={f.key}
              aria-current={state === 'cur' ? 'step' : undefined}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 40, fontWeight: 600, fontSize: '0.94rem',
                color: state === 'todo' ? 'var(--studio-muted)' : state === 'cur' ? 'var(--studio-primary-text)' : 'var(--studio-ink)',
              }}
            >
              <Box aria-hidden sx={{
                width: 24, height: 24, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                ...(state === 'done'
                  ? { background: 'var(--studio-ok)', color: 'var(--studio-surf)' }
                  : { border: '2px solid', borderColor: state === 'cur' ? 'var(--studio-primary-text)' : 'var(--studio-border-strong)' }),
              }}>
                {state === 'done' && <StudioIcon name="done" sx={{ fontSize: 16 }} />}
              </Box>
              <span>{f.label}</span>
              <Box component="span" sx={visuallyHidden}>{state === 'done' ? ', hecho' : state === 'cur' ? ', siguiente' : ', pendiente'}</Box>
              {state === 'todo' && <StudioIcon name="lock" aria-hidden sx={{ ml: 'auto', fontSize: 18, color: 'var(--studio-muted)' }} />}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
