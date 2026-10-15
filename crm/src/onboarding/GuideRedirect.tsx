import { Navigate } from 'react-router-dom';
import { useSite } from '../site/SiteProvider';
import { setupStepLink, setupUnfinished } from './flow';
import { useSetupProgress } from './progressContext';

/**
 * /puesta-en-marcha (enlaces antiguos a la guía de 11 pasos): a la puesta en
 * marcha obligatoria, donde se dejó; con la web ya publicada, a Ajustes.
 */
export default function GuideRedirect() {
  const { progress } = useSetupProgress();
  const { config } = useSite();
  if (progress && setupUnfinished(progress, config.setup_completed)) {
    return <Navigate to={setupStepLink(Math.min(progress.flow.reached, progress.flow.total))} replace />;
  }
  return <Navigate to="/configuracion" replace />;
}
