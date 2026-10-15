// Color de cada tipo de clase en el calendario: los tintes de la paleta del
// estudio (design/tokens → `cls`), así siguen a las 80 paletas y son los
// mismos que en Hoy y en las fichas. Qué tono le toca a cada clase (por
// nombre o por id) se decide en design/classColors.ts.
import { classTypeColor as paletteClassColor } from '../../design/classColors';
import type { PaletteTokens } from '../../design/tokens';

export interface ClassTone {
  /** Fondo del bloque (pastel) */
  tint: string;
  /** Borde izquierdo, punto de la leyenda y barra de ocupación */
  dot: string;
  /** Texto sobre el tint */
  ink: string;
}

export function classTypeColor(tokens: PaletteTokens, classTypeId: number, title = ''): ClassTone {
  const c = paletteClassColor(tokens, classTypeId, title);
  return { tint: c.tint, dot: c.dot, ink: c.text };
}
