import { createContext, useContext } from 'react';

export interface CoachContextValue {
  /** «Cómo funciona» de la pantalla `key` (si existe) */
  startPage: (key: string) => void;
  /** Visita de bienvenida (5 pasos) */
  startWelcome: () => void;
  hasPageTour: (key: string) => boolean;
  /** Clave de la pantalla actual (para «?» → «Cómo funciona esta pantalla») */
  currentPage: string | null;
  /** Vuelve a enseñar los consejos de cada sección */
  resetTips: () => void;
  /** Hay una visita en curso */
  active: boolean;
}

export const CoachContext = createContext<CoachContextValue>({
  startPage: () => {},
  startWelcome: () => {},
  hasPageTour: () => false,
  currentPage: null,
  resetTips: () => {},
  active: false,
});

export const useCoach = () => useContext(CoachContext);
