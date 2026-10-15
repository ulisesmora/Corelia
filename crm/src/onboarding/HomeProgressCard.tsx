import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Collapse, IconButton, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StudioIcon from '../site/StudioIcon';
import { STEP_COPY, UI } from './copy';
import { GUIDE_PATH, guideStepLink, stepNumber, stepRoute } from './guide';
import { useSetupProgress } from './progressContext';

const COLLAPSED_KEY = 'crmHomeGuideCollapsed';
const HIDDEN_KEY = 'crmHomeGuideHidden';

const read = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const write = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* sin almacenamiento */ } };

/**
 * Inicio: «N de 11 pasos» y el botón «Siguiente paso». Grande mientras la web
 * no está publicada (se puede encoger); con la web publicada, una línea que se
 * puede cerrar si quedan pasos opcionales; nada cuando todo está hecho.
 */
export default function HomeProgressCard() {
  const { progress } = useSetupProgress();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => read(COLLAPSED_KEY));
  const [hidden, setHidden] = useState(() => read(HIDDEN_KEY));
  if (!progress) return null;

  const left = progress.total - progress.done_count;
  if (left === 0) return null;
  const next = progress.next_step;

  if (progress.published) {
    if (hidden) return null;
    return (
      <Paper elevation={0} sx={{ mb: 3, p: 1.5, pl: 2, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <StudioIcon name="launch" aria-hidden sx={{ color: 'var(--studio-primary-shade)' }} />
          <Typography sx={{ flex: 1, color: 'var(--studio-dark)', fontSize: '0.98rem' }}>{UI.homePublished(left)}</Typography>
          <Button component={RouterLink} to={GUIDE_PATH} sx={{ minHeight: 44, flexShrink: 0 }}>{UI.seeAllSteps}</Button>
          <Tooltip title={UI.hideCard}>
            <IconButton aria-label={UI.hideCard} onClick={() => { setHidden(true); write(HIDDEN_KEY, true); }} sx={{ width: 44, height: 44 }}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>
    );
  }

  const pct = Math.round((progress.done_count / progress.total) * 100);
  const toggle = () => { setCollapsed((c) => { write(COLLAPSED_KEY, !c); return !c; }); };

  return (
    <Paper
      component="section"
      aria-labelledby="home-guide-title"
      elevation={0}
      sx={{
        mb: 3, p: { xs: 2, md: 2.75 }, borderRadius: 4,
        border: '2px solid rgb(var(--studio-primary-rgb) / 0.45)',
        backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.07)',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <StudioIcon name="launch" aria-hidden sx={{ color: 'var(--studio-primary-deep)', fontSize: 30, display: { xs: 'none', sm: 'block' } }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="home-guide-title" component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 600, fontSize: { xs: '1.25rem', md: '1.4rem' }, color: 'var(--studio-dark)' }}>
            {UI.homeTitle}
          </Typography>
          <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.95rem' }}>
            <b>{UI.progress(progress.done_count, progress.total)}</b>
            {' · '}{progress.required_done} de {progress.required_total} imprescindibles para publicar tu web
          </Typography>
        </Box>
        <Tooltip title={collapsed ? UI.expand : UI.collapse}>
          <IconButton onClick={toggle} aria-expanded={!collapsed} aria-controls="home-guide-body" aria-label={collapsed ? UI.expand : UI.collapse} sx={{ width: 44, height: 44 }}>
            {collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        </Tooltip>
      </Stack>
      <LinearProgress
        variant="determinate" value={pct} aria-label={UI.progress(progress.done_count, progress.total)}
        sx={{ mt: 1.5, height: 8, borderRadius: 4, backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.15)' }}
      />
      <Collapse in={!collapsed} id="home-guide-body">
        {progress.can_publish && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {UI.readyToPublish}
            <Box sx={{ mt: 1 }}>
              <Button color="inherit" variant="outlined" component={RouterLink} to={guideStepLink('launch')} sx={{ minHeight: 44 }}>
                {UI.testAndPublish}
              </Button>
            </Box>
          </Alert>
        )}
        {next && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" sx={{ color: 'var(--studio-primary-shade)' }}>
              {UI.nextStep} · {UI.stepOf(stepNumber(progress, next), progress.total)}
            </Typography>
            <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)' }}>{STEP_COPY[next].title}</Typography>
            <Typography sx={{ mt: 0.5, color: 'var(--studio-text-strong)', lineHeight: 1.55 }}>{STEP_COPY[next].what}</Typography>
            <Typography sx={{ mt: 0.5, color: 'var(--studio-text-body)', fontSize: '0.95rem', lineHeight: 1.55 }}>
              <b>{UI.why}:</b> {STEP_COPY[next].why}
            </Typography>
          </Box>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2 }}>
          {next && (
            <Button variant="contained" size="large" endIcon={<StudioIcon name="next" />} onClick={() => navigate(stepRoute(next))} sx={{ minHeight: 48 }}>
              {UI.nextStep}: {STEP_COPY[next].label}
            </Button>
          )}
          <Button variant="outlined" size="large" component={RouterLink} to={next ? guideStepLink(next) : GUIDE_PATH} sx={{ minHeight: 48 }}>
            {UI.seeAllSteps}
          </Button>
        </Stack>
      </Collapse>
    </Paper>
  );
}
