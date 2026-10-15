// ====================================================================
// Colores pastel de los tipos de clase (calendario, Hoy, fichas…), sacados de
// los tokens de la paleta del estudio: cada paleta trae 5 tintes con su punto
// de color, ya comprobados (texto de tinta ≥ 4,6:1 sobre el tinte y punto
// ≥ 3:1 sobre la superficie). Ver docs/ESTILOS.md.
//
//   const color = useClassTypeColor();      // en un componente
//   const { tint, dot } = color(classType.id);
//   classTypeColor(tokens, id)              // fuera de React (con panelPalette)
// ====================================================================
import { useMemo } from 'react';
import { useSite } from '../site/SiteProvider';
import { panelPalette } from '../theme';
import { CLASS_KEYS, type PaletteTokens } from './tokens';

export interface ClassTypeColor {
  /** Nombre del tono (reformer, mat, barre, yoga, privada) */
  key: string;
  /** Fondo pastel del bloque de la clase */
  tint: string;
  /** Punto / borde izquierdo / leyenda */
  dot: string;
  /** Texto sobre el tinte (la tinta de la paleta) */
  text: string;
}

function indexOf(id: number | string | null | undefined): number {
  if (id === null || id === undefined || id === '') return 0;
  const n = Number(id);
  if (Number.isInteger(n) && n > 0) return (n - 1) % CLASS_KEYS.length;
  let h = 7;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CLASS_KEYS.length;
}

/** Tono del tipo de clase `classTypeId` (los ids consecutivos van rotando los 5 tonos). */
export function classTypeColor(tokens: PaletteTokens, classTypeId: number | string | null | undefined): ClassTypeColor {
  const key = CLASS_KEYS[indexOf(classTypeId)];
  const c = tokens.cls[key];
  return { key, tint: c.tint, dot: c.dot, text: tokens.ink };
}

/** Hook: `const color = useClassTypeColor(); color(id).tint` con la paleta actual del panel. */
export function useClassTypeColor(): (classTypeId: number | string | null | undefined) => ClassTypeColor {
  const { config } = useSite();
  const tokens = useMemo(() => panelPalette(config), [config]);
  return useMemo(() => (id: number | string | null | undefined) => classTypeColor(tokens, id), [tokens]);
}
