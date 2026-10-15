import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useSite } from '../../site/SiteProvider';
import { useSetupProgress } from '../../onboarding';

/**
 * Mientras el estudio no haya terminado el asistente de bienvenida, el panel
 * lo lleva allí (una sola vez por sesión: si lo cierra, puede seguir usando
 * el panel y volver desde la guía de puesta en marcha).
 *
 * «Terminado» lo dice el API (/api/v1/setup/progress/ → welcome_done). Los
 * estudios con la web ya publicada (setup_completed) no lo consultan: para
 * ellos el panel se abre como siempre.
 */
export default function SetupGate({ children }: { children: ReactNode }) {
  const { config, loading } = useSite();
  const { progress, ready } = useSetupProgress();
  let skipped = false;
  try { skipped = sessionStorage.getItem('setupSkipped') === '1'; } catch { /* sin storage */ }

  if (loading || config.setup_completed !== false || skipped) return <>{children}</>;
  if (!ready) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress aria-label="Cargando" /></Box>;
  }
  if (progress && !progress.published && !progress.welcome_done) {
    try { sessionStorage.setItem('setupSkipped', '1'); } catch { /* sin storage */ }
    return <Navigate to="/bienvenida" replace />;
  }
  return <>{children}</>;
}
