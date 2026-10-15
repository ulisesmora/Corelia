import type { StudioIconName } from '../site/StudioIcon';
import type { FlowKey, SetupProgress } from './api';

// ====================================================================
// Puesta en marcha OBLIGATORIA (fase 2 del rediseño): 8 pantallas en orden,
// una tarea en cada una. El estado lo da el API (progress.flow, en
// api/api/setup_guide.py): un paso está hecho cuando tiene sus datos y se ha
// pulsado «Continuar» en él; «Publicar» = web publicada.
// ====================================================================

export const SETUP_PATH = '/bienvenida';

export interface FlowMeta {
  key: FlowKey;
  /** Nombre corto: barra de progreso, banner, bloqueos */
  label: string;
  icon: StudioIconName;
  /** Una línea para «Siguiente paso» en Hoy */
  hint: string;
}

export const FLOW: FlowMeta[] = [
  { key: 'studio', label: 'Tu estudio', icon: 'studio', hint: 'Nombre, ciudad y cómo te contactan. 1 minuto.' },
  { key: 'style', label: 'Tu estilo', icon: 'style', hint: 'Elige cómo se ven tu web y tu panel. 1 minuto.' },
  { key: 'rooms', label: 'Salas', icon: 'rooms', hint: 'Dónde das las clases y cuántas personas caben.' },
  { key: 'instructors', label: 'Profesores', icon: 'instructors', hint: 'Quién da las clases.' },
  { key: 'class_types', label: 'Clases', icon: 'classTypes', hint: 'Qué clases ofreces. Elige de la lista.' },
  { key: 'schedule', label: 'Horario', icon: 'schedule', hint: 'Pon tus clases en la semana tipo. Unos 2 minutos.' },
  { key: 'plans', label: 'Bonos', icon: 'plans', hint: 'Elige tus bonos y precios. 1 minuto.' },
  { key: 'launch', label: 'Publicar', icon: 'launch', hint: 'Revisa y publica tu web.' },
];

export const FLOW_TOTAL = FLOW.length;

/** Número de paso (1…8) de una clave. */
export const flowIndex = (key: FlowKey) => FLOW.findIndex((f) => f.key === key) + 1;

/** Enlace a un paso de la puesta en marcha (1…8). */
export const setupStepLink = (n: number) => `${SETUP_PATH}?paso=${n}`;

/**
 * ¿Le falta al estudio terminar la puesta en marcha? Sin datos del API (aún
 * cargando o sin conexión) se responde que no: el panel nunca se bloquea por
 * un fallo de red, y los estudios con la web publicada nunca vuelven aquí.
 */
export function setupUnfinished(progress: SetupProgress | null, published?: boolean): boolean {
  if (published || !progress || !progress.flow) return false;
  return !progress.published && !progress.flow.finished;
}

/** Hasta qué paso se ha llegado (1…9). Sin datos: todo hecho. */
export const reachedOf = (progress: SetupProgress | null) => progress?.flow?.reached ?? FLOW_TOTAL + 1;
