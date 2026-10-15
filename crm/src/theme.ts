import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';
import { cr, mix } from './design/derive';
import {
  classicTokens, fontPairBySlug, headingWeight, isDarkStyle, sideOf, themeTokens,
  type PaletteTokens, type Side,
} from './design/tokens';
import {
  DEFAULT_SITE_CONFIG, type IconStyleId, type SiteConfigPublic, type StyleId,
} from './site/siteConfig';

// ====================================================================
// Tema del panel: se genera de los TOKENS del estilo y la paleta del estudio
// (src/design/palettes.json, el mismo origen que la web; docs/ESTILOS.md).
//
//   colores      → la paleta elegida o, con colores propios, derivados de
//                  ellos con la misma corrección de contraste que el API
//   forma        → STRUCT de cada estilo (esquinas, bordes, sombras, cristal,
//                  mayúsculas…), igual que el prototipo aprobado
//   letra        → la pareja del estudio (font_heading / font_body) y el peso
//                  de títulos de su pareja
//
// Si el estudio apaga «Panel con el estilo de mi web», el panel se ve con su
// aspecto CLÁSICO: claro, neutro y con los colores del estudio.
//
// Además del tema de MUI publica variables CSS en :root para el resto del
// panel (sx, style, calendar.css, el menú lateral…). Las de siempre:
//
//   --studio-primary(-rgb) / -light / -pale / -shade / -dark / -deep
//   --studio-primary-text           el principal como TEXTO, siempre legible
//   --studio-primary-fill / --studio-on-primary   relleno de botones y su texto
//   --studio-secondary, --studio-dark (texto principal), --studio-bg (fondo)
//   --studio-text-strong / -body / -muted / -hint / -faint
//   --studio-bg-light / --studio-bg-deep, --studio-line-rgb, --studio-surface-rgb,
//   --studio-shadow-rgb, --studio-font-heading / --studio-font-body
//   --studio-radius / -radius-sm / -radius-chip, --studio-border(-width),
//   --studio-surface / -surface-strong, --studio-shadow / -shadow-float, --studio-blur
//
// Y las de los tokens (shell nuevo, mismas que el prototipo):
//
//   --studio-ink --studio-muted --studio-surf --studio-surf2 --studio-p-soft
//   --studio-border-color --studio-border-strong --studio-s-soft
//   --studio-side-bg / -side-text / -side-muted / -side-active / -side-active-text / -side-hover
//   --studio-ok / -ok-soft · -warn · -bad · -info (+ -soft)
//   --studio-c-reformer / --studio-c-reformer-dot (… mat, barre, yoga, privada)
//   --studio-radius-xl / -lg / -md / -btn, --studio-shadow-1 / -2, --studio-card-bg,
//   --studio-card-border, --studio-btn-shadow, --studio-glow, --studio-scrim,
//   --studio-heading-weight / -transform / -spacing
//
// Todas las de color tienen su versión `-rgb` ("r g b").
// En <html>: data-panel-style, data-panel-mode="light|dark" y data-panel-side.
// ====================================================================

export { mix };

/** Pila de fuentes con alternativas del sistema. */
export const headingStack = (font: string) => `"${font}", Georgia, serif`;
export const bodyStack = (font: string) => `"${font}", system-ui, -apple-system, sans-serif`;
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

const hexRgb = (h: string) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).join(' ');
};
/** "r g b" de un color hex. */
const channels = (c: string) => hexRgb(c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);
const rgb = (c: string, a: number) => `rgb(${channels(c)} / ${a})`;

// ── Qué aspecto usa el panel ─────────────────────────────────────────────

export interface PanelLook {
  /** Estilo de la web (aunque el panel no lo siga) */
  style: StyleId;
  /** El panel se ve con su aspecto clásico (no sigue el estilo de la web) */
  classic: boolean;
  /** Familia de iconos ('classic' = los de siempre del panel) */
  icons: IconStyleId | 'classic';
  dark: boolean;
  /** Cómo es la barra lateral: oscura, clara, de cristal o del modo oscuro */
  side: Side;
}

/** Estilo e iconos del panel según la config (y el interruptor «Panel con el estilo de mi web»). */
export function panelLook(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): PanelLook {
  const follows = site.theme.panel_follows_style !== false;
  const style: StyleId = site.theme.style || 'natural';
  return {
    style,
    classic: !follows,
    icons: follows ? site.theme.icons || 'line' : 'classic',
    dark: follows && isDarkStyle(style),
    side: follows ? sideOf(style) : 'light',
  };
}

/** Colores efectivos del panel (tokens de la paleta o derivados de los colores propios). */
export function panelPalette(site: SiteConfigPublic = DEFAULT_SITE_CONFIG, look: PanelLook = panelLook(site)): PaletteTokens {
  const t = site.theme;
  const input = { style: t.style, palette: t.palette, primary: t.primary, secondary: t.secondary, dark: t.dark, background: t.background };
  return look.classic ? classicTokens(input) : themeTokens(input).tokens;
}

// ── Tonos con los nombres de siempre (los usan muchas pantallas vía CSS) ──

function tonesFrom(pt: PaletteTokens, dark: boolean) {
  const toward = dark ? '#FFFFFF' : pt.ink;
  const deep = dark ? '#000000' : pt.p;
  return {
    pt,
    primary: pt.p,
    primaryLight: mix(pt.p, pt.surf, 0.45),
    primaryPale: pt.pSoft,
    primaryHover: mix(pt.p, toward, 0.9),
    primaryShade: pt.pText,
    primaryDark: mix(pt.pText, toward, 0.85),
    primaryDeep: mix(pt.pText, toward, 0.7),
    secondary: pt.s,
    secondaryText: cr(pt.sUI, pt.surf) >= 4.6 ? pt.sUI : mix(pt.s, toward, 0.45),
    dark: pt.ink,
    textStrong: mix(pt.ink, pt.surf, 0.94),
    textBody: mix(pt.ink, pt.muted, 0.6),
    textMuted: pt.muted,
    textHint: pt.muted,
    textFaint: mix(pt.muted, pt.surf, 0.7),
    bg: pt.bg,
    bgLight: dark ? pt.surf : pt.surf2,
    bgMid: mix(pt.bg, deep, 0.95),
    bgDeep: mix(pt.bg, deep, dark ? 0.7 : 0.9),
    line: pt.borderStrong,
    /** Tinta para bordes marcados y texto sobre rellenos claros (en oscuro: lo más profundo) */
    ink: dark ? pt.bg : pt.ink,
    surface: pt.surf,
    surfaceStrong: dark ? mix(pt.surf, '#FFFFFF', 0.96) : pt.surf,
    deep: pt.sideBg,
    shadow: dark ? '#000000' : pt.ink,
    primaryText: pt.pText,
    primaryFill: pt.p,
    onPrimary: pt.onP,
    uiBorder: pt.borderStrong,
  };
}

export type StudioTones = ReturnType<typeof tonesFrom>;

/** Tonos del panel (los mismos que publican las variables --studio-*). */
export function studioTones(site: SiteConfigPublic = DEFAULT_SITE_CONFIG, look: PanelLook = panelLook(site)): StudioTones {
  return tonesFrom(panelPalette(site, look), look.dark);
}

// ── Forma de cada estilo (prototipo: app.css → [data-style="…"]) ─────────

interface Struct {
  /** Esquinas: diálogos y menú lateral (xl), tarjetas (lg), campos (md), chips (sm), botones (btn) */
  r: { xl: number; lg: number; md: number; sm: number; btn: number };
  /** Grosor del borde de tarjetas y campos marcados */
  bw: number;
  cardBorder: (t: StudioTones) => string;
  cardBg: (t: StudioTones) => string;
  blur: string;
  sh1: (t: StudioTones) => string;
  sh2: (t: StudioTones) => string;
  btnShadow: (t: StudioTones) => string;
  glow: (t: StudioTones) => string;
  headingTransform: 'none' | 'uppercase';
  headingSpacing: string;
  /** Espaciado de las etiquetas en mayúsculas (overline, cabeceras de tabla) */
  labelSpacing: string;
  body: (t: StudioTones) => string;
}

const softShadow = (t: StudioTones) => `0 1px 2px ${rgb(t.shadow, 0.04)}, 0 6px 20px ${rgb(t.shadow, 0.05)}`;
const floatShadow = (t: StudioTones) => `0 18px 50px ${rgb(t.shadow, 0.16)}`;
const darkFloat = () => '0 24px 60px rgb(0 0 0 / 0.6)';
const none = () => 'none';

const BASE: Struct = {
  r: { xl: 26, lg: 20, md: 14, sm: 10, btn: 999 },
  bw: 1,
  cardBorder: (t) => `1px solid ${t.pt.border}`,
  cardBg: (t) => t.pt.surf,
  blur: 'none',
  sh1: softShadow,
  sh2: floatShadow,
  btnShadow: none,
  glow: none,
  headingTransform: 'none',
  headingSpacing: '-0.02em',
  labelSpacing: '0.08em',
  body: (t) => t.pt.bg,
};

const STRUCTS: Record<StyleId | 'classic', Struct> = {
  natural: { ...BASE, r: { xl: 28, lg: 22, md: 14, sm: 10, btn: 999 }, cardBorder: () => '1px solid transparent' },
  minimal: { ...BASE, r: { xl: 16, lg: 12, md: 10, sm: 8, btn: 10 }, sh1: none, headingSpacing: '-0.025em' },
  editorial: {
    ...BASE, r: { xl: 6, lg: 4, md: 4, sm: 3, btn: 3 }, sh1: none, headingSpacing: '-0.01em', labelSpacing: '0.14em',
  },
  glass: {
    ...BASE,
    r: { xl: 28, lg: 24, md: 16, sm: 12, btn: 999 },
    cardBorder: () => '1px solid rgb(255 255 255 / 0.7)',
    cardBg: (t) => rgb(t.pt.surf, 0.66),
    blur: 'blur(18px) saturate(1.3)',
    sh1: (t) => `0 8px 32px ${rgb(t.shadow, 0.08)}`,
    body: (t) => `radial-gradient(60vw 50vw at 0% 0%, ${rgb(t.pt.p, 0.16)}, transparent 60%), `
      + `radial-gradient(50vw 50vw at 100% 20%, ${rgb(t.pt.s, 0.22)}, transparent 60%), `
      + `radial-gradient(60vw 40vw at 50% 110%, ${rgb(t.pt.p, 0.1)}, transparent 60%), ${t.pt.bg} fixed`,
  },
  brutalist: {
    ...BASE,
    r: { xl: 0, lg: 0, md: 0, sm: 0, btn: 0 },
    bw: 2,
    cardBorder: (t) => `2px solid ${t.pt.ink}`,
    sh1: (t) => `4px 4px 0 ${t.pt.ink}`,
    sh2: (t) => `8px 8px 0 ${t.pt.ink}`,
    btnShadow: (t) => `3px 3px 0 ${t.pt.ink}`,
    headingSpacing: '-0.03em',
  },
  energy: {
    ...BASE, r: { xl: 14, lg: 12, md: 8, sm: 6, btn: 8 }, sh1: none, sh2: darkFloat, headingTransform: 'uppercase', headingSpacing: '0.01em',
  },
  pop: {
    ...BASE,
    r: { xl: 32, lg: 26, md: 18, sm: 14, btn: 999 },
    cardBorder: () => '1px solid transparent',
    sh1: (t) => `0 2px 0 ${rgb(t.pt.p, 0.08)}, 0 10px 30px ${rgb(t.pt.p, 0.1)}`,
  },
  neon: {
    ...BASE,
    r: { xl: 20, lg: 16, md: 12, sm: 10, btn: 999 },
    sh1: (t) => `0 0 0 1px ${rgb(t.pt.p, 0.1)}`,
    sh2: darkFloat,
    glow: (t) => `0 0 0 1px ${rgb(t.pt.p, 0.5)}, 0 0 22px ${rgb(t.pt.p, 0.35)}`,
    body: (t) => `radial-gradient(70vw 40vw at 100% -10%, ${rgb(t.pt.p, 0.12)}, transparent 60%), `
      + `radial-gradient(50vw 40vw at -10% 100%, ${rgb(t.pt.s, 0.08)}, transparent 60%), ${t.pt.bg} fixed`,
  },
  // Aspecto clásico del panel (no sigue el estilo de la web): cristal blanco suave
  classic: {
    ...BASE,
    r: { xl: 22, lg: 18, md: 13, sm: 9, btn: 12 },
    cardBorder: () => '1px solid rgb(255 255 255 / 0.6)',
    cardBg: () => 'rgb(255 255 255 / 0.6)',
    blur: 'blur(20px) saturate(1.8)',
    sh1: (t) => `0 3px 12px ${rgb(t.shadow, 0.05)}, 0 1px 4px ${rgb(t.shadow, 0.03)}`,
    headingSpacing: '-0.01em',
    body: (t) => `linear-gradient(135deg, ${t.pt.bg} 0%, ${t.bgDeep} 40%, ${t.bgMid} 100%) fixed`,
  },
};

const structOf = (look: PanelLook) => STRUCTS[look.classic ? 'classic' : look.style] || STRUCTS.natural;

/** Forma de un estilo (esquinas, borde, mayúsculas) para las miniaturas y vistas previas. */
export function styleShape(style: StyleId | 'classic') {
  const st = STRUCTS[style] || STRUCTS.natural;
  return { r: st.r, bw: st.bw, headingTransform: st.headingTransform, headingSpacing: st.headingSpacing, glass: st.blur !== 'none' };
}

/** Estilo, tonos y forma del panel (vistas previas de Ajustes → Estilo). */
export function panelTokens(site: SiteConfigPublic = DEFAULT_SITE_CONFIG) {
  const look = panelLook(site);
  const tones = studioTones(site, look);
  const st = structOf(look);
  return {
    look,
    tones,
    tokens: {
      radius: st.r,
      cardBg: st.cardBg(tones),
      cardBorder: st.cardBorder(tones),
      shadow: st.sh1(tones),
      blur: st.blur,
      body: st.body(tones),
      headingTransform: st.headingTransform,
    },
  };
}

/** Color de la barra del navegador / app instalada (meta theme-color). */
export function panelThemeColor(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): string {
  return panelPalette(site).bg;
}

// ── Variables CSS ────────────────────────────────────────────────────────

function cssVariables(t: StudioTones, st: Struct, look: PanelLook, heading: string, body: string, hw: number): string {
  const pt = t.pt;
  const colors: [string, string][] = [
    ['primary', t.primary], ['primary-light', t.primaryLight], ['primary-pale', t.primaryPale],
    ['primary-shade', t.primaryShade], ['primary-dark', t.primaryDark], ['primary-deep', t.primaryDeep],
    ['secondary', t.secondary], ['dark', t.dark], ['text-strong', t.textStrong], ['text-body', t.textBody],
    ['text-muted', t.textMuted], ['text-hint', t.textHint], ['text-faint', t.textFaint],
    ['bg', t.bg], ['bg-light', t.bgLight], ['bg-deep', t.bgDeep], ['line', t.line],
    // tokens
    ['ink', pt.ink], ['muted', pt.muted], ['surf', pt.surf], ['surf2', pt.surf2], ['p-soft', pt.pSoft],
    ['s-soft', pt.sSoft], ['border-color', pt.border], ['border-strong', pt.borderStrong],
    ['side-bg', pt.sideBg], ['side-text', pt.sideText], ['side-muted', pt.sideMuted],
    ['side-active', pt.sideActive], ['side-active-text', pt.sideActiveText], ['side-hover', pt.sideHover],
    ['ok', pt.ok], ['ok-soft', pt.okSoft], ['warn', pt.warn], ['warn-soft', pt.warnSoft],
    ['bad', pt.bad], ['bad-soft', pt.badSoft], ['info', pt.info], ['info-soft', pt.infoSoft],
    ...Object.entries(pt.cls).flatMap(([k, v]) => [[`c-${k}`, v.tint], [`c-${k}-dot`, v.dot]] as [string, string][]),
  ];
  const lines = colors.flatMap(([n, v]) => [`--studio-${n}: ${v};`, `--studio-${n}-rgb: ${channels(v)};`]);
  const sh1 = st.sh1(t);
  const sh2 = st.sh2(t);
  lines.push(
    `--studio-font-heading: ${heading};`, `--studio-font-body: ${body};`,
    `--studio-heading-weight: ${hw};`, `--studio-heading-transform: ${st.headingTransform};`,
    `--studio-heading-spacing: ${st.headingSpacing};`, `--studio-label-spacing: ${st.labelSpacing};`,
    `--studio-primary-text: ${t.primaryText};`, `--studio-primary-fill: ${t.primaryFill};`,
    `--studio-on-primary: ${t.onPrimary};`, `--studio-on-primary-rgb: ${channels(t.onPrimary)};`,
    `--studio-secondary-text: ${t.secondaryText};`,
    `--studio-surface-rgb: ${channels(t.surface)};`, `--studio-shadow-rgb: ${channels(t.shadow)};`,
    `--studio-radius-xl: ${st.r.xl}px;`, `--studio-radius-lg: ${st.r.lg}px;`, `--studio-radius-md: ${st.r.md}px;`,
    `--studio-radius-btn: ${st.r.btn}px;`,
    `--studio-radius: ${st.r.lg}px;`, `--studio-radius-sm: ${Math.min(st.r.btn, 14)}px;`, `--studio-radius-chip: ${st.r.btn ? 999 : 0}px;`,
    `--studio-border-width: ${st.bw}px;`, `--studio-border: ${st.cardBorder(t)};`, `--studio-card-border: ${st.cardBorder(t)};`,
    `--studio-surface: ${st.cardBg(t)};`, `--studio-card-bg: ${st.cardBg(t)};`, `--studio-surface-strong: ${t.surfaceStrong};`,
    `--studio-shadow: ${sh1};`, `--studio-shadow-1: ${sh1};`, `--studio-shadow-float: ${sh2};`, `--studio-shadow-2: ${sh2};`,
    `--studio-btn-shadow: ${st.btnShadow(t)};`, `--studio-glow: ${st.glow(t)};`, `--studio-blur: ${st.blur};`,
    `--studio-scrim: ${look.dark ? 'rgb(0 0 0 / 0.66)' : rgb(pt.ink, 0.48)};`,
    // Textos de estado escritos a mano en algunas pantallas
    `--studio-danger-text: ${pt.bad};`, `--studio-success-text: ${pt.ok};`, `--studio-warning-text: ${pt.warn};`,
    `--studio-success-chip: ${pt.okSoft};`,
    // Calendario (calendar.css)
    `--cal-bg: ${look.classic ? rgb(t.bgLight, 0.6) : st.cardBg(t)};`, `--cal-paper: ${pt.surf};`, `--cal-elevated: ${pt.surf};`,
    `--cal-button-bg: ${pt.surf2};`, `--cal-overlay-bg: ${pt.surf};`, `--cal-selected-bg: ${pt.surf};`,
    `--cal-outer-border: ${st.cardBorder(t)};`, `--cal-primary: ${t.primaryText};`, `--cal-primary-light: ${pt.pSoft};`,
    `--cal-primary-hover: ${rgb(pt.p, 0.14)};`, `--cal-text: ${pt.ink};`, `--cal-muted: ${pt.muted};`,
    `--cal-border: ${pt.border};`, `--cal-today: ${rgb(pt.p, 0.05)};`,
    `--cal-shadow-sm: none;`, `--cal-shadow: ${sh1};`, `--cal-shadow-lg: ${sh2};`,
    `--cal-radius: ${st.r.lg}px;`, `--cal-radius-sm: ${Math.min(st.r.lg, st.r.md)}px;`, `--cal-radius-xs: ${Math.min(st.r.btn, 12)}px;`,
    `--blur: ${st.blur};`,
  );
  return `:root:root { ${lines.join(' ')} }`;
}

/** react-big-calendar trae grises fijos: aquí se pintan con los tokens. */
const calendarCss = (dark: boolean) => `
  :root:root .rbc-toolbar button { color: var(--cal-muted); background-color: var(--cal-button-bg); }
  :root:root .rbc-toolbar button:hover, :root:root .rbc-toolbar button:focus { color: var(--cal-primary); background-color: var(--cal-primary-light); }
  :root:root .rbc-toolbar button.rbc-active, :root:root .rbc-toolbar button.rbc-active:hover, :root:root .rbc-toolbar button.rbc-active:focus { color: var(--studio-on-primary); background-color: var(--studio-primary-fill); }
  :root:root .rbc-off-range-bg { background: var(--studio-surf2); }
  :root:root .rbc-off-range { color: var(--studio-text-faint); }
  :root:root .rbc-selected-cell { background-color: var(--cal-primary-hover); }
  ${dark ? `
  :root:root .rbc-calendar * { border-color: var(--cal-border); }
  :root:root .rbc-day-slot .rbc-time-slot { border-top-color: rgba(255,255,255,0.04); }
  :root:root .rbc-show-more { background-color: transparent; }
  :root:root .rbc-overlay { background: var(--cal-overlay-bg); border-color: var(--cal-border); }
  :root:root .rbc-time-view-resources .rbc-time-gutter, :root:root .rbc-time-view-resources .rbc-time-header-gutter { background-color: var(--studio-bg); }
  ` : ''}
`;

// ── Tema MUI ─────────────────────────────────────────────────────────────

export function buildTheme(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): Theme {
  const look = panelLook(site);
  const t = studioTones(site, look);
  const pt = t.pt;
  const st = structOf(look);
  const R = st.r;
  const dark = look.dark;
  const S = look.classic ? 'classic' : look.style;
  const heading = headingStack(site.theme.font_heading);
  const body = bodyStack(site.theme.font_body);
  const pair = fontPairBySlug(site.theme.style, site.theme.font_pair);
  const hw = look.classic ? 600 : pair ? pair.weight : headingWeight(site.theme.style);
  const ink = pt.ink;
  const sh1 = st.sh1(t);
  const sh2 = st.sh2(t);
  const cardBg = st.cardBg(t);
  const cardBorder = st.cardBorder(t);
  const brutal = S === 'brutalist';
  const neon = S === 'neon';
  const glass = st.blur !== 'none';
  const headings = { fontFamily: heading, fontWeight: hw, textTransform: st.headingTransform, letterSpacing: st.headingSpacing, color: ink };
  const fieldBorder = brutal ? ink : pt.borderStrong;
  const noBlur = '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';
  const opaque = glass ? { [noBlur]: { backgroundColor: pt.surf }, '@media (prefers-reduced-transparency: reduce)': { backgroundColor: pt.surf, backdropFilter: 'none' } } : {};
  const semMain = (c: string, soft: string) => ({ main: c, light: soft, dark: c, contrastText: cr('#FFFFFF', c) >= 4.5 ? '#FFFFFF' : (dark ? pt.bg : '#111111') });
  const sem = ['ok', 'bad', 'warn', 'info'] as const;
  const semName = { ok: 'Success', bad: 'Error', warn: 'Warning', info: 'Info' } as const;
  const semColor = (k: typeof sem[number]) => pt[k];
  const semSoft = (k: typeof sem[number]) => pt[`${k}Soft` as const];

  const css = `
    ${cssVariables(t, st, look, heading, body, hw)}
    html { color-scheme: ${dark ? 'dark' : 'light'}; }
    body { background: ${st.body(t)}; background-color: ${pt.bg}; color: ${ink}; -webkit-font-smoothing: antialiased; }
    a { color: ${t.primaryText}; }
    :focus-visible { outline: 2px solid ${t.primaryText}; outline-offset: 2px; }
    ::selection { background: ${pt.pSoft}; color: ${ink}; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${rgb(pt.borderStrong, 0.6)}; border-radius: 8px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; scroll-behavior: auto !important; }
      .MuiButton-root:hover, .rbc-event:hover { transform: none !important; }
    }
    ${calendarCss(dark)}
    ${dark ? lightSheetCss(site, heading, body) : ''}
  `;

  const options: ThemeOptions = {
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: t.primaryText, light: pt.pSoft, dark: t.primaryDark, contrastText: cr('#FFFFFF', t.primaryText) >= 4.5 ? '#FFFFFF' : (dark ? pt.bg : '#111111') },
      secondary: { main: pt.sUI, light: pt.sSoft, dark: t.secondaryText, contrastText: cr('#FFFFFF', pt.sUI) >= 4.5 ? '#FFFFFF' : (dark ? pt.bg : '#111111') },
      success: semMain(pt.ok, pt.okSoft),
      error: semMain(pt.bad, pt.badSoft),
      warning: semMain(pt.warn, pt.warnSoft),
      info: semMain(pt.info, pt.infoSoft),
      background: { default: pt.bg, paper: pt.surf },
      text: { primary: ink, secondary: pt.muted, disabled: t.textFaint },
      divider: pt.border,
      action: {
        hover: rgb(dark ? '#FFFFFF' : ink, 0.05),
        selected: pt.pSoft,
        focus: rgb(pt.p, 0.16),
        disabledBackground: rgb(dark ? '#FFFFFF' : ink, 0.08),
        disabled: t.textFaint,
      },
    },
    typography: {
      fontFamily: body,
      fontWeightMedium: 500,
      fontWeightBold: 700,
      h1: { ...headings, fontSize: '2.1rem', lineHeight: 1.15 },
      h2: { ...headings, fontSize: '1.75rem', lineHeight: 1.2 },
      h3: { ...headings, fontSize: '1.45rem', lineHeight: 1.25 },
      h4: { ...headings, fontSize: '1.25rem', lineHeight: 1.3 },
      h5: { ...headings, fontSize: '1.1rem', lineHeight: 1.35 },
      h6: { fontFamily: body, fontWeight: 700, fontSize: '1rem', lineHeight: 1.4 },
      body1: { fontSize: '0.95rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55, color: pt.muted },
      button: { fontFamily: body, fontWeight: 600, textTransform: 'none', letterSpacing: '0.005em' },
      caption: { fontSize: '0.78rem', color: pt.muted },
      overline: { fontWeight: 700, letterSpacing: st.labelSpacing, fontSize: '0.72rem', ...(brutal || neon ? { fontFamily: MONO } : {}) },
    },
    // borderRadius: n en sx = n × este valor (lo usan las pantallas)
    shape: { borderRadius: Math.max(2, Math.round(R.md / 3)) },
    spacing: 8,
    components: {
      MuiCssBaseline: { styleOverrides: css },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: cardBg,
            border: cardBorder,
            borderRadius: R.lg,
            ...(glass ? { backdropFilter: st.blur, WebkitBackdropFilter: st.blur, ...opaque } : {}),
          },
          elevation0: { boxShadow: 'none' },
          elevation1: { boxShadow: sh1 },
          elevation2: { boxShadow: sh1 },
          elevation3: { boxShadow: sh1 },
          elevation8: { boxShadow: sh2, backgroundColor: pt.surf, ...(brutal ? { border: `2px solid ${ink}` } : {}) },
          elevation16: { boxShadow: sh2, backgroundColor: pt.surf },
          elevation24: { boxShadow: sh2, backgroundColor: pt.surf },
        },
      },
      MuiAppBar: {
        styleOverrides: { root: { backgroundColor: rgb(pt.bg, 0.92), color: ink, boxShadow: 'none', borderRadius: 0, border: 'none', borderBottom: `1px solid ${pt.border}` } },
      },
      MuiDrawer: {
        styleOverrides: { paper: { backgroundColor: pt.surf, border: 'none', borderRadius: 0, boxShadow: sh2 } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: R.xl, backgroundColor: pt.surf, boxShadow: sh2,
            border: brutal ? `2px solid ${ink}` : dark ? `1px solid ${pt.border}` : 'none',
          },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { ...headings, fontSize: '1.35rem', padding: '24px 28px 12px' } } },
      MuiDialogContent: { styleOverrides: { root: { padding: '8px 28px 20px' } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '12px 28px 24px', gap: 8 } } },
      MuiBackdrop: { styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: dark ? 'rgb(0 0 0 / 0.66)' : rgb(ink, 0.48) } } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: R.btn, minHeight: 40, padding: '8px 18px', fontWeight: 600, fontSize: '0.92rem',
            transition: 'background-color .2s, box-shadow .2s, transform .12s, border-color .2s, color .2s',
            '&:active': { transform: brutal ? 'translate(2px, 2px)' : 'scale(0.98)', ...(brutal ? { boxShadow: 'none' } : {}) },
            ...(brutal ? { border: `2px solid ${ink}` } : {}),
          },
          contained: {
            backgroundColor: pt.p, color: pt.onP, boxShadow: neon ? st.glow(t) : st.btnShadow(t),
            '&:hover': { backgroundColor: mix(pt.p, pt.onP, 0.9), boxShadow: neon ? st.glow(t) : st.btnShadow(t) },
            '&.Mui-disabled': { backgroundColor: rgb(dark ? '#FFFFFF' : ink, 0.1), color: t.textFaint, boxShadow: 'none', ...(brutal ? { borderColor: rgb(ink, 0.3) } : {}) },
          },
          containedSecondary: { backgroundColor: pt.sUI, color: cr('#FFFFFF', pt.sUI) >= 4.5 ? '#FFFFFF' : ink },
          outlined: {
            borderColor: brutal ? ink : pt.borderStrong, color: ink, backgroundColor: brutal ? pt.surf : 'transparent',
            borderWidth: brutal ? 2 : 1,
            '&:hover': { borderColor: brutal ? ink : t.primaryText, backgroundColor: pt.surf2, borderWidth: brutal ? 2 : 1 },
            ...(brutal ? { boxShadow: st.btnShadow(t) } : {}),
          },
          text: { color: t.primaryText, '&:hover': { backgroundColor: pt.pSoft } },
          sizeSmall: { minHeight: 34, padding: '4px 14px', fontSize: '0.85rem', '@media (pointer: coarse)': { minHeight: 44 } },
          sizeLarge: { minHeight: 48, padding: '10px 22px', fontSize: '1rem' },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { color: 'inherit', '&:hover': { backgroundColor: pt.surf2 } } },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: R.md,
              backgroundColor: pt.surf,
              '& fieldset': { borderColor: fieldBorder, borderWidth: brutal ? 2 : 1 },
              '&:hover fieldset': { borderColor: brutal ? ink : t.textBody },
              '&.Mui-focused fieldset': { borderColor: brutal ? ink : t.primaryText, borderWidth: 2 },
              '&.Mui-focused': { boxShadow: brutal ? `3px 3px 0 ${ink}` : `0 0 0 3px ${pt.pSoft}` },
            },
            '& .MuiInputLabel-root.Mui-focused': { color: t.primaryText },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: R.md, backgroundColor: pt.surf },
          notchedOutline: { borderColor: fieldBorder, borderWidth: brutal ? 2 : 1 },
        },
      },
      MuiSelect: { styleOverrides: { root: { borderRadius: R.md } } },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, fontSize: '0.78rem', borderRadius: brutal ? 0 : 999, ...(brutal ? { border: `1.5px solid ${ink}` } : {}) },
          ...Object.fromEntries(sem.map((k) => [`color${semName[k]}`, { backgroundColor: semSoft(k), color: semColor(k) }])),
          colorPrimary: { backgroundColor: pt.pSoft, color: t.primaryText },
          outlined: { borderColor: pt.borderStrong },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: R.md, fontSize: '0.9rem', fontWeight: 500, ...(brutal ? { border: `2px solid ${ink}` } : {}) },
          ...Object.fromEntries(sem.flatMap((k) => [
            [`standard${semName[k]}`, { backgroundColor: semSoft(k), color: semColor(k), border: brutal ? `2px solid ${ink}` : `1px solid ${rgb(semColor(k), 0.25)}`, '& .MuiAlert-icon': { color: semColor(k) } }],
            [`filled${semName[k]}`, { backgroundColor: semColor(k), color: cr('#FFFFFF', semColor(k)) >= 4.5 ? '#FFFFFF' : (dark ? pt.bg : '#111111') }],
            [`outlined${semName[k]}`, { color: semColor(k), borderColor: rgb(semColor(k), 0.5) }],
          ])),
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { borderBottom: `${brutal ? 2 : 1}px solid ${brutal ? ink : pt.border}` },
          indicator: { height: brutal ? 4 : 3, borderRadius: brutal ? 0 : '3px 3px 0 0', backgroundColor: brutal ? ink : pt.p, ...(neon ? { boxShadow: `0 0 12px ${rgb(pt.p, 0.8)}` } : {}) },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600, fontSize: '0.92rem', color: pt.muted, minHeight: 48, '&.Mui-selected': { color: brutal ? ink : t.primaryText } } },
      },
      MuiTableContainer: {
        styleOverrides: { root: { borderRadius: R.lg, backgroundColor: cardBg, border: cardBorder === '1px solid transparent' ? `1px solid ${pt.border}` : cardBorder } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${pt.border}`, padding: '14px 18px', fontSize: '0.9rem' },
          head: {
            fontWeight: 700, fontSize: '0.74rem', color: pt.muted, backgroundColor: pt.surf2, letterSpacing: st.labelSpacing,
            textTransform: 'uppercase', borderBottom: `${brutal ? 2 : 1}px solid ${brutal ? ink : pt.borderStrong}`,
            ...(brutal || neon ? { fontFamily: MONO } : {}),
          },
        },
      },
      MuiTableRow: { styleOverrides: { root: { transition: 'background-color .2s', '&:hover': { backgroundColor: rgb(dark ? '#FFFFFF' : ink, 0.03) } } } },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: dark ? pt.surf2 : ink, color: dark ? ink : pt.surf, borderRadius: Math.min(R.md, 10), fontSize: '0.8rem', padding: '8px 12px',
            ...(dark ? { border: `1px solid ${pt.borderStrong}` } : {}),
          },
          arrow: { color: dark ? pt.surf2 : ink },
        },
      },
      MuiMenu: { styleOverrides: { paper: { borderRadius: R.md, border: brutal ? `2px solid ${ink}` : `1px solid ${pt.border}` } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 44, borderRadius: Math.min(R.sm, 10), margin: '0 6px', '&.Mui-selected': { backgroundColor: pt.pSoft } } } },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: Math.min(R.btn, 14) } } },
      MuiSwitch: {
        styleOverrides: {
          root: {
            '& .MuiSwitch-switchBase.Mui-checked': { color: dark ? pt.onP : '#FFFFFF' },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: pt.p, opacity: 1 },
            '& .MuiSwitch-track': { backgroundColor: pt.borderStrong, opacity: 1 },
          },
        },
      },
      MuiCheckbox: { styleOverrides: { root: { color: pt.borderStrong, '&.Mui-checked': { color: t.primaryText } } } },
      MuiRadio: { styleOverrides: { root: { color: pt.borderStrong, '&.Mui-checked': { color: t.primaryText } } } },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: brutal ? 0 : 6, height: brutal ? 10 : 6, backgroundColor: pt.surf2, ...(brutal ? { border: `2px solid ${ink}` } : {}) },
          bar: { borderRadius: brutal ? 0 : 6, backgroundColor: pt.p },
        },
      },
      MuiCircularProgress: { styleOverrides: { root: { color: t.primaryText } } },
      MuiDivider: { styleOverrides: { root: { borderColor: pt.border } } },
      MuiPagination: {
        styleOverrides: { root: { '& .MuiPaginationItem-root': { borderRadius: Math.min(R.btn, 10), '&.Mui-selected': { backgroundColor: pt.p, color: pt.onP } } } },
      },
      MuiBottomNavigation: { styleOverrides: { root: { backgroundColor: 'transparent' } } },
      MuiSnackbarContent: { styleOverrides: { root: { backgroundColor: dark ? pt.surf2 : ink, color: dark ? ink : pt.surf, borderRadius: 999 } } },
      MuiAccordion: { styleOverrides: { root: { '&:before': { display: 'none' } } } },
    },
  };
  return createTheme(options);
}

/**
 * Zona clara dentro del panel oscuro (hoja para imprimir…): className="studio-light".
 * Variables de una versión clara de los mismos colores.
 */
function lightSheetCss(site: SiteConfigPublic, heading: string, body: string): string {
  const look: PanelLook = { ...panelLook(site), classic: true, dark: false, side: 'light' };
  const t = studioTones(site, look);
  return cssVariables(t, STRUCTS.classic, look, heading, body, 600)
    .replace(':root:root {', '.studio-light { color-scheme: light; color: var(--studio-dark);');
}
