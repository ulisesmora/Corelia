import { createContext, useContext } from 'react';
import type { SetupProgress, StepState } from './api';
import type { StepKey } from './copy';

export interface ProgressContextValue {
  /** null mientras se carga la primera vez (o si el API no responde) */
  progress: SetupProgress | null;
  /** Ya se ha intentado cargar al menos una vez (aunque fallara) */
  ready: boolean;
  refresh: () => Promise<SetupProgress | null>;
  /** Guarda el estado de un paso marcado a mano y actualiza el progreso */
  setStatus: (key: StepKey | 'welcome', status: 'done' | 'skipped' | 'todo') => Promise<SetupProgress>;
  publish: () => Promise<SetupProgress>;
  /** Sustituye el progreso por uno que ya trae otra respuesta del API */
  apply: (p: SetupProgress) => void;
  step: (key: StepKey) => StepState | undefined;
}

export const ProgressContext = createContext<ProgressContextValue>({
  progress: null,
  ready: false,
  refresh: async () => null,
  setStatus: async () => { throw new Error('Sin ProgressProvider'); },
  publish: async () => { throw new Error('Sin ProgressProvider'); },
  apply: () => {},
  step: () => undefined,
});

/** Progreso de la guía de puesta en marcha (lo da <ProgressProvider>). */
export const useSetupProgress = () => useContext(ProgressContext);
