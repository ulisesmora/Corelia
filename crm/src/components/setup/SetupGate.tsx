import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSite } from '../../site/SiteProvider';

/**
 * Mientras el estudio no haya terminado el asistente de bienvenida, el panel
 * lo lleva allí (una sola vez por sesión: si lo cierra, puede seguir usando
 * el panel y volver desde Ajustes).
 */
export default function SetupGate({ children }: { children: ReactNode }) {
  const { config, loading } = useSite();
  let skipped = false;
  try { skipped = sessionStorage.getItem('setupSkipped') === '1'; } catch { /* sin storage */ }
  if (!loading && config.setup_completed === false && !skipped) {
    try { sessionStorage.setItem('setupSkipped', '1'); } catch { /* sin storage */ }
    return <Navigate to="/bienvenida" replace />;
  }
  return <>{children}</>;
}
