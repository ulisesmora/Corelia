import type { SetupProgress, StepState } from './api';
import { STEP_COPY, type StepKey } from './copy';

export const GUIDE_PATH = '/puesta-en-marcha';

/** Enlace a un paso dentro de la guía (la abre por ese paso). */
export const guideStepLink = (key: StepKey) => `${GUIDE_PATH}?paso=${key}`;

/**
 * Ruta de una pantalla del panel con «?guia=1»: así esa pantalla enseña la
 * tarjeta del paso aunque la web ya esté publicada.
 */
export function withGuide(route: string): string {
  if (route.startsWith(GUIDE_PATH)) return route;
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  params.set('guia', '1');
  return `${path}?${params.toString()}`;
}

/** Ruta a la que lleva el botón de un paso. */
export const stepRoute = (key: StepKey) => withGuide(STEP_COPY[key].route);

const pending = (s: StepState) => s.status !== 'done' && s.status !== 'skipped';

/**
 * Siguiente paso pendiente después de `after` (en el orden de la guía); si no
 * queda ninguno detrás, el primero pendiente desde el principio.
 */
export function nextPendingStep(progress: SetupProgress, after?: StepKey): StepState | undefined {
  const i = after ? progress.steps.findIndex((s) => s.key === after) : -1;
  return progress.steps.slice(i + 1).find(pending) || progress.steps.find((s) => pending(s) && s.key !== after);
}

/** Número del paso (1…11). */
export const stepNumber = (progress: SetupProgress, key: StepKey) =>
  progress.steps.findIndex((s) => s.key === key) + 1;
