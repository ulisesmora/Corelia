import type { ReactNode } from 'react';
import type { HubLink } from './navigation';

// ====================================================================
// PUNTO DE EXTENSIÓN del panel para otras distribuciones de Corelia.
//
// Una distribución que necesite añadir cosas al panel (p. ej. una versión
// gestionada con su propia pantalla de plan) SUSTITUYE SOLO ESTE ARCHIVO por
// el suyo, con la misma firma; MainLayout no se toca, así las
// actualizaciones del panel se copian sin conflictos.
//
//   settingsItems → enlaces extra en Ajustes (y en el buscador ⌘K)
//   banner        → algo que se pinta encima de cada pantalla (avisos)
//
// Es un hook: puede tener estado, pedir datos y decidir si enseña algo.
// ====================================================================

export interface ShellExtensions {
  settingsItems: HubLink[];
  banner: ReactNode;
}

const NONE: ShellExtensions = { settingsItems: [], banner: null };

export function useShellExtensions(): ShellExtensions {
  return NONE;
}
