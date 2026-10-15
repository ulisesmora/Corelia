import { useId, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import StudioIcon from '../site/StudioIcon';
import { STEP_COPY, UI, fill, type StepKey } from './copy';
import { guideStepLink, nextPendingStep, stepNumber, stepRoute } from './guide';
import { useSetupProgress } from './progressContext';

const hiddenKey = (k: StepKey) => `crmStepGuideHidden_${k}`;

function readHidden(k: StepKey): boolean {
  try { return localStorage.getItem(hiddenKey(k)) === '1'; } catch { return false; }
}

interface Props {
  step: StepKey;
}

/**
 * Tarjeta de la guía de puesta en marcha arriba de cada pantalla: qué es, por
 * qué importa, un ejemplo y, cuando el paso está hecho, «Siguiente: …».
 * Sale mientras la web no está publicada (o si se llega desde la guía con
 * ?guia=1) y se puede ocultar en cada pantalla.
 */
export default function StepGuide({ step }: Props) {
  const { progress } = useSetupProgress();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => readHidden(step));
  const [more, setMore] = useState(false);
  const titleId = useId();

  if (!progress || hidden) return null;
  if (progress.published && params.get('guia') !== '1') return null;
  const state = progress.steps.find((s) => s.key === step);
  if (!state) return null;

  const copy = STEP_COPY[step];
  const next = state.done || state.status === 'skipped' ? nextPendingStep(progress, step) : undefined;
  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(hiddenKey(step), '1'); } catch { /* sin almacenamiento */ }
  };

  return (
    <Paper
      component="section"
      aria-labelledby={titleId}
      elevation={0}
      sx={{
        mb: { xs: 2.5, md: 3 }, p: { xs: 2, md: 2.5 }, borderRadius: 4,
        border: '1.5px solid rgb(var(--studio-primary-rgb) / 0.4)',
        backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.06)',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box
          aria-hidden
          sx={{
            width: 44, height: 44, borderRadius: 3, flexShrink: 0, display: { xs: 'none', sm: 'grid' }, placeItems: 'center',
            backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.16)', color: 'var(--studio-primary-deep)',
          }}
        >
          <StudioIcon name={copy.icon} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="overline" sx={{ color: 'var(--studio-primary-shade)', lineHeight: 1.6 }}>
              {UI.guideTitle} · {UI.stepOf(stepNumber(progress, step), progress.total)}
            </Typography>
            <Chip
              size="small"
              label={state.required ? UI.required : step === 'launch' ? UI.finalStep : UI.optional}
              variant={state.required ? 'filled' : 'outlined'}
              sx={{ height: 22 }}
            />
          </Stack>
          <Typography id={titleId} component="h2" sx={{ fontWeight: 600, fontSize: { xs: '1.1rem', md: '1.2rem' }, color: 'var(--studio-dark)', lineHeight: 1.35 }}>
            {copy.title}
          </Typography>
          {/* Hecho: solo lo esencial (el texto completo, a un toque) */}
          <Collapse in={!state.done || more}>
            <Typography sx={{ mt: 0.75, color: 'var(--studio-text-strong)', lineHeight: 1.55 }}>{copy.what}</Typography>
            <Typography sx={{ mt: 0.75, color: 'var(--studio-text-body)', fontSize: '0.95rem', lineHeight: 1.55 }}>
              <b>{UI.why}:</b> {copy.why}
            </Typography>
            <Typography sx={{ mt: 0.5, color: 'var(--studio-text-body)', fontSize: '0.95rem', lineHeight: 1.55 }}>
              <b>{UI.example}:</b> <i>{copy.example}</i>
            </Typography>
          </Collapse>
          {state.done && !more && (
            <Button size="small" onClick={() => setMore(true)} sx={{ mt: 0.5, ml: -1, minHeight: 44 }}>{UI.showMore}</Button>
          )}
        </Box>
        <Tooltip title={UI.hideCard}>
          <IconButton onClick={hide} aria-label={UI.hideCard} sx={{ width: 44, height: 44, mt: -0.5, mr: -0.5 }}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {state.sample && (
        <Alert severity="info" sx={{ mt: 2 }}>{UI.sampleWarning}</Alert>
      )}
      {state.status === 'blocked' && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {UI.blockedBy(state.blocked_by.map((k) => STEP_COPY[k].label).join(' y '))}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {state.blocked_by.map((k) => (
              <Button key={k} variant="outlined" size="small" component={RouterLink} to={stepRoute(k)} sx={{ minHeight: 44 }}>
                {STEP_COPY[k].cta}
              </Button>
            ))}
          </Stack>
        </Alert>
      )}
      {state.done && (
        <Alert severity="success" sx={{ mt: 2 }}>{fill(copy.doneText, state.count)}</Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2 }} justifyContent="space-between">
        <Button component={RouterLink} to={guideStepLink(step)} startIcon={<StudioIcon name="collapse" />} sx={{ minHeight: 44 }}>
          {UI.backToGuide}
        </Button>
        {next && (
          <Button variant="contained" endIcon={<StudioIcon name="next" />} onClick={() => navigate(stepRoute(next.key))} sx={{ minHeight: 44 }}>
            {UI.next(STEP_COPY[next.key].label)}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
