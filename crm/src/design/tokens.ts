// ====================================================================
// Paletas y parejas de letra de cada estilo (fuente única: design/tokens del
// repo → ./palettes.json, generado: no se edita a mano). Ver docs/ESTILOS.md.
//
//   themeTokens(theme)        colores efectivos del panel: los de la paleta
//                             elegida o, con colores propios, derivados de ellos
//   pickStyle / pickPalette / pickCustomColors / pickFontPair
//                             lo que hay que guardar al elegir en Ajustes →
//                             Estilo (misma regla que el API: api/utils/palettes.py)
// ====================================================================
import raw from './palettes.json';
import {
  STYLE_MODES, cr, derive, fixCustom, mix,
  type Mode, type PaletteTokens, type Side, type SiteColors,
} from './derive';

export type { Mode, PaletteTokens, Side, SiteColors };
export { cr, mix };

export interface PaletteEntry extends PaletteTokens {
  id: string;
  name: string;
  source: { p: string; s: string; ink: string; bg: string; surf: string };
  /** Lo que se guarda en SiteConfig.color_* al elegirla */
  fields: SiteColors;
}

export interface FontPairEntry {
  id: string;
  heading: string;
  body: string;
  /** Peso de los títulos */
  weight: number;
}

export interface StyleEntry {
  name: string;
  desc: string;
  mode: Mode;
  side: Side;
  palettes: PaletteEntry[];
  fonts: FontPairEntry[];
}

interface TokensFile {
  version: number;
  classHues: Record<string, string>;
  singleWeightFonts: string[];
  styles: Record<string, StyleEntry>;
}

const DATA = raw as unknown as TokensFile;

export const STYLE_ORDER = Object.keys(DATA.styles);
export const SINGLE_WEIGHT_FONTS = new Set(DATA.singleWeightFonts);
export const CLASS_KEYS = Object.keys(DATA.classHues);

export const styleEntry = (style: string): StyleEntry => DATA.styles[style] || DATA.styles.natural;
export const palettesFor = (style: string) => styleEntry(style).palettes;
export const fontPairsFor = (style: string) => styleEntry(style).fonts;
export const paletteBySlug = (style: string, slug?: string | null) =>
  (slug ? palettesFor(style).find((p) => p.id === slug) : undefined) || null;
export const fontPairBySlug = (style: string, slug?: string | null) =>
  (slug ? fontPairsFor(style).find((f) => f.id === slug) : undefined) || null;
export const isDarkStyle = (style: string) => (STYLE_MODES[style] || STYLE_MODES.natural)[0] === 'dark';
export const sideOf = (style: string): Side => (STYLE_MODES[style] || STYLE_MODES.natural)[1];

export const sameColor = (a?: string, b?: string) => (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase();

/** Lo mínimo de la config para saber los colores: estilo, paleta y los 4 colores efectivos. */
export interface ThemeInput extends SiteColors {
  style: string;
  palette?: string;
}

/** Colores efectivos: la paleta elegida o, si son propios, derivados (y corregidos) de los 4 guardados. */
export function themeTokens(theme: ThemeInput): { tokens: PaletteTokens; palette: PaletteEntry | null } {
  const pal = paletteBySlug(theme.style, theme.palette);
  if (pal) return { tokens: pal, palette: pal };
  return { tokens: fixCustom(theme.style, theme).tokens, palette: null };
}

/**
 * Colores del panel con su aspecto clásico (no sigue el estilo de la web):
 * siempre claro y con la barra lateral clara, con los colores del estudio.
 */
export function classicTokens(theme: ThemeInput): PaletteTokens {
  const pal = paletteBySlug(theme.style, theme.palette);
  if (pal && !isDarkStyle(theme.style)) {
    const s = pal.source;
    return derive('minimal', s.p, s.s, s.ink, s.bg, s.surf);
  }
  if (isDarkStyle(theme.style)) {
    // Colores pensados para oscuro: fondo claro con un toque de su superficie
    return fixCustom('minimal', { ...theme, dark: '#1B1B22', background: mix(theme.background, '#FFFFFF', 0.06) }).tokens;
  }
  return fixCustom('minimal', theme).tokens;
}

// ── Elegir en Ajustes → Estilo (mismas reglas que api/utils/palettes.py) ──

type ColorPatch = {
  palette: string;
  color_primary: string;
  color_secondary: string;
  color_dark: string;
  color_background: string;
};
type FontPatch = { font_pair: string; font_heading?: string; font_body?: string };

const colorPatch = (palette: string, f: SiteColors): ColorPatch => ({
  palette, color_primary: f.primary, color_secondary: f.secondary, color_dark: f.dark, color_background: f.background,
});

export function pickPalette(style: string, slug: string): ColorPatch {
  const pal = paletteBySlug(style, slug) || palettesFor(style)[0];
  return colorPatch(pal.id, pal.fields);
}

/** Colores propios: se corrigen para que se lean. `changed` = se ha tenido que tocar algo. */
export function pickCustomColors(style: string, colors: SiteColors): ColorPatch & { changed: boolean } {
  const { fields } = fixCustom(style, colors);
  const changed = !(['primary', 'secondary', 'dark', 'background'] as const).every((k) => sameColor(fields[k], colors[k]));
  return { ...colorPatch('', fields), changed };
}

/** Paleta completa a partir de UN color de marca (luego se corrige con pickCustomColors). */
export function colorsFromBrand(style: string, hex: string): SiteColors {
  if (isDarkStyle(style)) {
    return { primary: hex, secondary: mix(hex, '#FFFFFF', 0.55), dark: mix(hex, '#050507', 0.08), background: mix(hex, '#0B0B10', 0.1) };
  }
  return { primary: hex, secondary: mix(hex, '#FFFFFF', 0.55), dark: mix(hex, '#141414', 0.22), background: mix(hex, '#FFFFFF', 0.08) };
}

export function pickFontPair(style: string, id: string): FontPatch {
  const f = fontPairBySlug(style, id) || fontPairsFor(style)[0];
  return { font_pair: f.id, font_heading: f.heading, font_body: f.body };
}

/**
 * Cambiar de estilo en el selector: la misma paleta y letra si existen en el
 * nuevo estilo; si no (o si eran propias), las primeras del estilo, para que
 * se vea su carácter. «Mis colores» devuelve luego los propios.
 */
export function pickStyle(
  style: string,
  current: { palette?: string; font_pair?: string },
): { style_preset: string } & ColorPatch & FontPatch {
  const pal = paletteBySlug(style, current.palette) ? current.palette! : palettesFor(style)[0].id;
  const font = fontPairBySlug(style, current.font_pair) ? current.font_pair! : fontPairsFor(style)[0].id;
  return { style_preset: style, ...pickPalette(style, pal), ...pickFontPair(style, font) };
}

/** Peso de los títulos: el de la pareja elegida o el de la primera del estilo. */
export function headingWeight(style: string, fontPair?: string): number {
  return (fontPairBySlug(style, fontPair) || fontPairsFor(style)[0]).weight;
}
