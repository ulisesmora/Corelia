import { createContext, useContext } from 'react';
import type { HubLink } from './navigation';

export interface ShellContextValue {
  /** Abre el buscador ⌘K (con un texto ya escrito, opcional) */
  openCommand: (query?: string) => void;
  /** Alta rápida de una clienta ('new') o apuntar a una que ya existe a una clase ('existing') */
  openNewClient: (mode?: 'new' | 'existing') => void;
  /** Enlaces extra de Ajustes (punto de extensión: ./extensions.tsx) */
  extraSettings: HubLink[];
}

export const ShellContext = createContext<ShellContextValue>({
  openCommand: () => {},
  openNewClient: () => {},
  extraSettings: [],
});

export const useShell = () => useContext(ShellContext);

// ── Visita guiada (fase 2): la registra quien la implemente ──────────────
type TourHandler = () => void;
let tourHandler: TourHandler | null = null;

/** La visita guiada se registra aquí; el menú «?» la ofrece solo si existe. */
export function registerTour(handler: TourHandler | null) {
  tourHandler = handler;
}
export const hasTour = () => tourHandler !== null;
export const startTour = () => tourHandler?.();
