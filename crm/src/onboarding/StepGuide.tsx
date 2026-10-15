import type { StepKey } from './copy';

/**
 * RETIRADA (fase 2 del rediseño): la tarjeta de ayuda de cada pantalla se ha
 * sustituido por la puesta en marcha obligatoria (/bienvenida) y por las
 * visitas guiadas («Cómo funciona»). Se queda como componente vacío para las
 * pantallas que aún la importan (Calendario y Horarios, que se están
 * rehaciendo); quítala de ahí al tocarlas.
 */
export default function StepGuide(_props: { step: StepKey }) {
  return null;
}
