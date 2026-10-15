// ====================================================================
// Colores pastel de los tipos de clase (calendario, Hoy, fichas…), sacados de
// los tokens de la paleta del estudio: cada paleta trae 5 tintes con su punto
// de color, ya comprobados (texto de tinta ≥ 4,6:1 sobre el tinte y punto
// ≥ 3:1 sobre la superficie). Ver docs/ESTILOS.md.
//
//   const color = useClassTypeColor();      // en un componente
//   const { tint, dot } = color(classType.id, classType.title);
//   classTypeColor(tokens, id, title)       // fuera de React (con panelPalette)
//
// El tono se elige por el nombre de la clase si es uno conocido (Reformer →
// verde, Mat → naranja, Barre → rosa, Yoga → lila, Privada → azul: los mismos
// matices que classHues de design/tokens) y, si no, rotando por id. Así una
// clase tiene el mismo color en todas las pantallas y en las 80 paletas.
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

/** Nombre de la clase → tono. */
const NAMED: [RegExp, string][] = [
  [/reformer|m[aá]quina/i, 'reformer'],
  [/\bmat\b|suelo|esterilla/i, 'mat'],
  [/barre|barra/i, 'barre'],
  [/yoga/i, 'yoga'],
  [/privad|personal|1:1/i, 'privada'],
];

function keyByName(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const [re, key] of NAMED) if (re.test(title) && CLASS_KEYS.includes(key)) return key;
  return null;
}

function indexOf(id: number | string | null | undefined): number {
  if (id === null || id === undefined || id === '') return 0;
  const n = Number(id);
  if (Number.isInteger(n) && n > 0) return (n - 1) % CLASS_KEYS.length;
  let h = 7;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CLASS_KEYS.length;
}

/** Tono del tipo de clase: por su nombre si es conocido; si no, los ids consecutivos van rotando los 5 tonos. */
export function classTypeColor(
  tokens: PaletteTokens, classTypeId: number | string | null | undefined, title?: string | null,
): ClassTypeColor {
  const key = keyByName(title) ?? CLASS_KEYS[indexOf(classTypeId)];
  const c = tokens.cls[key];
  return { key, tint: c.tint, dot: c.dot, text: tokens.ink };
}

type ColorFn = (classTypeId: number | string | null | undefined, title?: string | null) => ClassTypeColor;

/** Hook: `const color = useClassTypeColor(); color(id, title).tint` con la paleta actual del panel. */
export function useClassTypeColor(): ColorFn {
  const { config } = useSite();
  const tokens = useMemo(() => panelPalette(config), [config]);
  return useMemo<ColorFn>(() => (id, title) => classTypeColor(tokens, id, title), [tokens]);
}
