import type { IconStyleId, StyleId } from '../../site/siteConfig';

/** Las paletas y las parejas de letra de cada estilo viven en design/tokens
 *  (src/design/palettes.json + src/design/tokens.ts). Aquí quedan la ficha de
 *  cada estilo (la usa la portada), los iconos y herramientas de color. */

// ─── Estilos visuales de la web ───────────────────────────────────────────────
// Cada estilo cambia el «acabado» de la web (superficies, bordes, sombras,
// esquinas, modo claro/oscuro) sin tocar su estructura. Sus tokens viven en
// web/src/styles/presets.css. Para añadir uno: ver docs/ESTILOS.md.

// La lista de slugs vive en src/site/siteConfig.ts (también la usa el tema del panel)
export type { IconStyleId, StyleId };

export interface StylePreset {
  id: StyleId;
  name: string;
  family: 'calma' | 'tendencia';
  description: string;
  dark: boolean;
  /** Colores y letra con los que mejor luce (se aplican solo si se pide) */
  palette: { primary: string; secondary: string; dark: string; background: string };
  fonts: { heading: string; body: string };
  /** Cómo se dibuja la miniatura del selector */
  look: {
    radius: number;
    border: string;
    shadow: string;
    surface: string;
    upper?: boolean;
    glow?: boolean;
    blur?: boolean;
  };
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'natural', name: 'Natural', family: 'calma', dark: false,
    description: 'Orgánico, cálido y suave. Transmite calma.',
    palette: { primary: '#A0897C', secondary: '#85786B', dark: '#3D3228', background: '#F5F0EA' },
    fonts: { heading: 'Playfair Display', body: 'Jost' },
    look: { radius: 22, border: '1px solid rgba(61,50,40,.12)', shadow: '0 10px 30px rgba(61,50,40,.10)', surface: '#FFFDF9' },
  },
  {
    id: 'minimal', name: 'Minimal', family: 'calma', dark: false,
    description: 'Limpio y con mucho aire. Lo importante destaca solo.',
    palette: { primary: '#2F2F2F', secondary: '#7A7A7A', dark: '#111111', background: '#FAFAF8' },
    fonts: { heading: 'Inter', body: 'Inter' },
    look: { radius: 8, border: '1px solid #E6E6E6', shadow: 'none', surface: '#FFFFFF' },
  },
  {
    id: 'editorial', name: 'Editorial', family: 'calma', dark: false,
    description: 'Elegante, como una revista. Títulos grandes y finos.',
    palette: { primary: '#8C6A5B', secondary: '#2E2A27', dark: '#1E1B19', background: '#F7F3EE' },
    fonts: { heading: 'Cormorant Garamond', body: 'Lato' },
    look: { radius: 2, border: '1px solid #1E1B19', shadow: 'none', surface: '#F7F3EE', upper: true },
  },
  {
    id: 'glass', name: 'Liquid Glass', family: 'tendencia', dark: false,
    description: 'Translúcido y luminoso, como el iPhone de 2026.',
    palette: { primary: '#5B8A9A', secondary: '#7C9CF5', dark: '#1F2A37', background: '#E9F1F7' },
    fonts: { heading: 'Montserrat', body: 'Inter' },
    look: { radius: 24, border: '1px solid rgba(255,255,255,.7)', shadow: '0 8px 32px rgba(31,42,55,.15), inset 0 1px 0 rgba(255,255,255,.8)', surface: 'rgba(255,255,255,.55)', blur: true },
  },
  {
    id: 'brutalist', name: 'Brutalista', family: 'tendencia', dark: false,
    description: 'Bordes gruesos, sombras duras y bloques de color. Imposible de ignorar.',
    palette: { primary: '#FFD400', secondary: '#1F6BFF', dark: '#111111', background: '#FFFDF5' },
    fonts: { heading: 'Space Grotesk', body: 'Space Grotesk' },
    look: { radius: 4, border: '3px solid #111', shadow: '5px 5px 0 #111', surface: '#FFFFFF', upper: true },
  },
  {
    id: 'energy', name: 'Energía', family: 'tendencia', dark: true,
    description: 'Deportivo y dinámico: fondo oscuro, letra condensada y color intenso.',
    palette: { primary: '#D4FF00', secondary: '#FF4D00', dark: '#0A0A0A', background: '#151515' },
    fonts: { heading: 'Bebas Neue', body: 'Barlow' },
    look: { radius: 6, border: '1px solid rgba(255,255,255,.12)', shadow: 'none', surface: '#1E1E1E', upper: true },
  },
  {
    id: 'pop', name: 'Pop', family: 'tendencia', dark: false,
    description: 'Rosa, pastel y juguetón. Alegre y cercano.',
    palette: { primary: '#FF5FA2', secondary: '#7C5CFF', dark: '#2B1B3A', background: '#FFF0F6' },
    fonts: { heading: 'Fredoka', body: 'Nunito' },
    look: { radius: 26, border: '2px solid #2B1B3A', shadow: '4px 4px 0 #FF5FA2', surface: '#FFFFFF' },
  },
  {
    id: 'neon', name: 'Neón', family: 'tendencia', dark: true,
    description: 'Cyberpunk: fondo oscuro con brillos de color.',
    palette: { primary: '#FF2BD6', secondary: '#00E5FF', dark: '#0B0B1A', background: '#12122A' },
    fonts: { heading: 'Orbitron', body: 'Exo 2' },
    look: { radius: 10, border: '1px solid #FF2BD6', shadow: '0 0 18px rgba(255,43,214,.55)', surface: '#17173A', glow: true },
  },
];

export const styleById = (id: string) => STYLE_PRESETS.find((s) => s.id === id) || STYLE_PRESETS[0];

export const ICON_STYLES: { id: IconStyleId; name: string; description: string }[] = [
  { id: 'line', name: 'Línea fina', description: 'Ligeros y modernos' },
  { id: 'soft', name: 'Suaves', description: 'Redondeados y amables' },
  { id: 'solid', name: 'Rellenos', description: 'Con más presencia' },
];

// ─── Herramientas de color ────────────────────────────────────────────────────

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Mezcla dos colores (0 = a, 1 = b). */
export function mixHex(a: string, b: string, t: number) {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Colores principales de una imagen (logo), del más al menos frecuente. */
export async function colorsFromImage(url: string, count = 4): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 240) continue; // blancos del fondo
    if (max < 20) continue; // negros puros
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    buckets.set(key, { n: cur.n + 1, r: cur.r + r, g: cur.g + g, b: cur.b + b });
  }
  return [...buckets.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, count)
    .map((c) => toHex(c.r / c.n, c.g / c.n, c.b / c.n));
}
