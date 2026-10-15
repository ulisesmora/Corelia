// Color de cada tipo de clase en el calendario (pastel sobre la superficie).
//
// Aislado a propósito: hoy deriva los tonos del tema de MUI; cuando el
// estilo del panel tenga sus tokens de clase (design/tokens → `cls`:
// reformer, mat, barre, yoga, privada con {tint, dot}), basta con cambiar
// classTypeColor() para leerlos de ahí sin tocar el calendario.
import type { Theme } from '@mui/material/styles';

export interface ClassTone {
  /** Fondo del bloque (pastel) */
  tint: string;
  /** Borde izquierdo, punto de la leyenda y barra de ocupación */
  dot: string;
  /** Texto sobre el tint */
  ink: string;
}

// Mismos tonos base que CLASS_HUES de design/derive.ts, más algunos de reserva
// para estudios con más tipos de clase.
const NAMED: [RegExp, string][] = [
  [/reformer|m[aá]quina/i, '#6E9E73'],
  [/\bmat\b|suelo|esterilla/i, '#E39A6B'],
  [/barre|barra/i, '#DE7E9C'],
  [/yoga/i, '#8E7FD6'],
  [/privad|personal|1:1/i, '#5AA6D6'],
];
const EXTRA = ['#C9A23F', '#4FA59B', '#B9785A', '#7C8FB3', '#A77DB8', '#8FA35A', '#D27F6B', '#5F9EA8'];
const ALL = [...NAMED.map(([, h]) => h), ...EXTRA];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function rgb(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}
function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}
/** Mezcla `t` de `a` con `b`; si algún color no es #hex, usa color-mix() de CSS. */
function mix(a: string, b: string, t: number): string {
  if (HEX.test(a) && HEX.test(b)) return mixHex(a, b, t);
  return `color-mix(in srgb, ${a} ${Math.round(t * 100)}%, ${b})`;
}

/** Tono base de un tipo de clase: por nombre conocido o, si no, estable por id. */
export function classHue(classTypeId: number, title = ''): string {
  for (const [re, hex] of NAMED) if (re.test(title)) return hex;
  return ALL[Math.abs(classTypeId * 7 + 3) % ALL.length];
}

export function classTypeColor(theme: Theme, classTypeId: number, title = ''): ClassTone {
  const hue = classHue(classTypeId, title);
  const paper = theme.palette.background.paper;
  const ink = theme.palette.text.primary;
  const dark = theme.palette.mode === 'dark';
  return {
    tint: mix(hue, paper, dark ? 0.32 : 0.26),
    dot: dark ? mix(hue, '#ffffff', 0.85) : mix(hue, ink.startsWith('#') ? ink : '#222222', 0.82),
    ink,
  };
}
