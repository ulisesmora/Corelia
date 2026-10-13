import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * false en el render del servidor y durante la hidratación; true después.
 * Sirve para pintar en el HTML del servidor contenido extra para buscadores
 * (p. ej. pestañas ocultas) sin que el navegador vea un HTML distinto al hidratar.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
