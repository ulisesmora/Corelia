import SetupFlow from '../onboarding/setup/SetupFlow';

/**
 * /bienvenida — puesta en marcha OBLIGATORIA del estudio (8 pasos, pantalla
 * completa, sin menú). Ver crm/src/onboarding/setup/SetupFlow.tsx y, para el
 * estado de los pasos, api/api/setup_guide.py (progress.flow).
 */
export default function Setup() {
  return <SetupFlow />;
}
