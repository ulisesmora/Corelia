import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useSite } from '../../site/SiteProvider';
import { useSetupProgress } from '../../onboarding';
import { setupStepLink, setupUnfinished } from '../../onboarding/flow';

/**
 * Puesta en marcha OBLIGATORIA: mientras el estudio no la haya terminado
 * (web publicada), al abrir el panel se va a ella (/bienvenida), al paso donde
 * lo dejó. Con «Guardar y seguir luego» (progress.flow.later) el panel se abre,
 * pero limitado: candados y el aviso «Te quedan N pasos» (MainLayout).
 *
 * Los estudios con la web ya publicada (setup_completed) nunca vuelven aquí, y
 * si el API no responde el panel se abre como siempre (nunca se bloquea por
 * un fallo de red).
 */
export default function SetupGate({ children }: { children: ReactNode }) {
  const { config, loading } = useSite();
  const { progress, ready } = useSetupProgress();

  if (loading || config.setup_completed) return <>{children}</>;
  if (!ready) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress aria-label="Cargando" /></Box>;
  }
  if (progress && setupUnfinished(progress, config.setup_completed) && !progress.flow.later) {
    return <Navigate to={setupStepLink(Math.min(progress.flow.reached, progress.flow.total))} replace />;
  }
  return <>{children}</>;
}
