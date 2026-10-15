import {
  createTheme, darken, getContrastRatio, getLuminance, hexToRgb, lighten, decomposeColor,
  type Theme, type ThemeOptions,
} from '@mui/material/styles';
import {
  DARK_STYLES, DEFAULT_SITE_CONFIG, type IconStyleId, type SiteConfigPublic, type StyleId,
} from './site/siteConfig';

// ====================================================================
// Tema del panel construido con los colores, las fuentes y el ESTILO del
// estudio (el mismo que eligió para su web: natural, minimal, editorial…).
// Cada estilo tiene aquí su versión «de trabajo»: se reconoce la marca, pero
// todo se lee bien y es cómodo para usarlo a diario. Los estilos oscuros de la
// web (energy, neon) ponen el panel en modo oscuro. Si el estudio desactiva
// «Panel con el estilo de mi web», el panel se ve con su aspecto clásico
// (el de `natural`) y los colores del estudio. Ver docs/ESTILOS.md.
//
// Además del tema de MUI, publica unas variables CSS en :root para usarlas en
// cualquier sitio (sx, style, gradientes, CSS de react-big-calendar…):
//
//   var(--studio-primary)          color principal (rellenos, iconos, detalles)
//   rgb(var(--studio-primary-rgb) / 0.1)   el mismo con transparencia
//   --studio-primary-light / -pale   tonos suaves del principal
//   --studio-primary-shade / -dark / -deep   tonos fuertes (texto e iconos)
//   --studio-primary-text           el principal como TEXTO, siempre legible
//   --studio-primary-fill / --studio-on-primary   relleno de botones y su texto
//   --studio-secondary, --studio-dark (texto principal), --studio-bg (fondo)
//   --studio-text-strong / -body / -muted / -hint / -faint   tonos de texto
//   --studio-bg-light / --studio-bg-deep   fondo más claro / más hundido
//   --studio-line-rgb                bordes y separadores (con alpha)
//   --studio-surface-rgb             superficies: blanco en claro, gris en oscuro
//   --studio-shadow-rgb              color de las sombras (con alpha)
//   --studio-font-heading / --studio-font-body   familias tipográficas
//
//   Forma del estilo (para lo que no es de MUI):
//   --studio-radius / -radius-sm / -radius-chip   esquinas (tarjeta, botón, píldora)
//   --studio-border-width / --studio-border   borde de las tarjetas
//   --studio-surface / --studio-surface-strong   fondo de tarjeta / de diálogo
//   --studio-shadow / --studio-shadow-float   sombra de tarjeta / de lo flotante
//   --studio-blur                    backdrop-filter de las superficies
//
// Todas las variables de color tienen su versión `-rgb` ("r g b").
// En <html> quedan data-panel-style="…" y data-panel-mode="light|dark".
// ====================================================================

/** Mezcla dos colores: t=0 → a, t=1 → b. Devuelve "#rrggbb". */
export function mix(a: string, b: string, t: number): string {
  const ca = decomposeColor(a.startsWith('#') ? hexToRgb(a) : a).values;
  const cb = decomposeColor(b.startsWith('#') ? hexToRgb(b) : b).values;
  const ch = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** "r g b" de un color, para `rgb(var(--x-rgb) / alpha)`. */
function channels(c: string): string {
  const { values } = decomposeColor(c.startsWith('#') ? hexToRgb(c) : c);
  return values.slice(0, 3).map((v) => Math.round(v)).join(' ');
}

const toHex = (c: string) => mix(c, c, 0);
const rgb = (c: string, a: number) => `rgb(${channels(c)} / ${a})`;

/** Texto legible encima de un color: blanco si contrasta, si no el oscuro. */
const onColor = (bg: string, dark: string) => (getContrastRatio(bg, '#fff') >= 3 ? '#fff' : dark);

/** El más legible de dos colores de texto sobre un fondo. */
const bestOn = (bg: string, a: string, b: string) => (getContrastRatio(bg, a) >= getContrastRatio(bg, b) ? a : b);

/** Acerca `color` a `towards` hasta tener `min` de contraste contra `against`. */
function ensureContrast(color: string, against: string, min: number, towards: string): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(color, towards, t);
    if (getContrastRatio(c, against) >= min) return c;
  }
  return toHex(towards);
}

const NEAR_BLACK = '#0b0b10';

/** Pila de fuentes con alternativas del sistema. */
export const headingStack = (font: string) => `"${font}", Georgia, serif`;
export const bodyStack = (font: string) => `"${font}", system-ui, -apple-system, sans-serif`;
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

// ── Qué estilo usa el panel ──────────────────────────────────────────────

export interface PanelLook {
  /** Estilo con el que se dibuja el panel ('natural' = aspecto clásico) */
  style: StyleId;
  /** Familia de iconos ('classic' = los de siempre del panel) */
  icons: IconStyleId | 'classic';
  dark: boolean;
}

/** Estilo e iconos del panel según la config (y el interruptor «Panel con el estilo de mi web»). */
export function panelLook(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): PanelLook {
  const follows = site.theme.panel_follows_style !== false;
  const style: StyleId = follows ? site.theme.style || 'natural' : 'natural';
  return { style, icons: follows ? site.theme.icons || 'line' : 'classic', dark: DARK_STYLES.includes(style) };
}

// ── Tonos ────────────────────────────────────────────────────────────────

/** Todos los tonos derivados de los 4 colores del estudio para un estilo del panel. */
export function studioTones(site: SiteConfigPublic = DEFAULT_SITE_CONFIG, look: PanelLook = panelLook(site)) {
  const { primary, secondary, dark, background } = site.theme;
  const S = toHex(secondary);
  // Un fondo oscuro con un estilo claro (o al revés) no deja el panel ilegible:
  // igual que la web, se usa una versión garantizada clara u oscura.
  const raw = toHex(background);
  if (look.dark) return darkTones(toHex(primary), S, toHex(dark), raw, look.style);
  const B = getLuminance(raw) >= 0.6 ? raw : mix(raw, '#ffffff', 0.88);
  const D = getContrastRatio(dark, B) >= 4.5 ? toHex(dark) : ensureContrast(dark, B, 7, NEAR_BLACK);
  const natural = look.style === 'natural';
  // Paleta pensada para un estilo oscuro (fondo oscuro) vista en claro: el
  // primario se oscurece hasta leerse (un lima o un rosa neón no se leen sobre
  // claro). Con una paleta clara normal no cambia nada.
  const P = raw === B ? toHex(primary) : ensureContrast(primary, mix(B, primary, 0.12), 4.6, D);

  const base = {
    primary: P,
    primaryLight: lighten(P, 0.3),
    primaryPale: lighten(P, 0.55),
    primaryHover: lighten(P, 0.1),
    primaryShade: darken(P, 0.12),
    primaryDark: darken(P, 0.22),
    primaryDeep: darken(P, 0.32),
    secondary: S,
    dark: D,
    textStrong: mix(D, B, 0.15),
    textBody: mix(D, B, 0.25),
    textMuted: mix(D, B, 0.35),
    textHint: mix(D, B, 0.45),
    textFaint: mix(D, B, 0.6),
    bg: B,
    bgLight: mix(B, '#ffffff', 0.5),
    bgMid: mix(B, P, 0.07),
    bgDeep: mix(B, P, 0.12),
    line: mix(P, B, 0.25),
    // Nuevos (en natural no cambian nada de lo que ya se veía)
    ink: D,
    surface: '#ffffff',
    shadow: D,
    primaryText: P,
    primaryFill: P,
    onPrimary: onColor(P, D),
    secondaryText: S,
    uiBorder: mix(P, B, 0.25),
  };
  if (natural) return base;

  // Estilos claros «de trabajo»: textos y primario con contraste AA
  // (4,5:1) contra el fondo más hundido del panel.
  const against = base.bgDeep;
  const fillOk = Math.max(getContrastRatio(P, '#fff'), getContrastRatio(P, D)) >= 4.5;
  const primaryText = ensureContrast(P, against, 5, D);
  const primaryFill = fillOk ? P : primaryText;
  return {
    ...base,
    textStrong: mix(D, B, 0.1),
    textBody: mix(D, B, 0.18),
    textMuted: ensureContrast(mix(D, B, 0.3), against, 4.8, D),
    textHint: ensureContrast(mix(D, B, 0.4), against, 4.6, D),
    textFaint: ensureContrast(mix(D, B, 0.5), against, 3.2, D),
    primaryText,
    primaryFill,
    onPrimary: bestOn(primaryFill, '#ffffff', D),
    primaryShade: ensureContrast(darken(P, 0.12), against, 4.6, D),
    primaryDark: ensureContrast(darken(P, 0.22), against, 4.6, D),
    primaryDeep: ensureContrast(darken(P, 0.32), against, 4.6, D),
    secondaryText: ensureContrast(S, against, 4.6, D),
    uiBorder: ensureContrast(mix(D, '#ffffff', 0.6), '#ffffff', 3.1, D),
    // Bordes y separadores: neutros (del oscuro) en los estilos sobrios; en
    // brutalista, el oscuro tal cual (bordes marcados)
    line: look.style === 'brutalist' ? D : ['minimal', 'editorial'].includes(look.style) ? mix(D, B, 0.3) : base.line,
  };
}

/** Tonos de los estilos oscuros: fondo oscuro garantizado y texto claro fijo. */
function darkTones(P: string, S: string, D: string, raw: string, style: StyleId) {
  const neon = style === 'neon';
  const bg = getLuminance(raw) <= 0.06 ? raw : mix(raw, NEAR_BLACK, 0.9);
  const text = neon ? '#f1f0ff' : '#f3f3f3';
  const surface = neon ? mix(bg, P, 0.08) : mix(bg, '#ffffff', 0.06);
  const strong = neon ? mix(bg, P, 0.13) : mix(bg, '#ffffff', 0.1);
  // Zonas más profundas (barra lateral y superior): el oscuro del estudio si lo es
  const deep = getLuminance(D) <= 0.03 && getContrastRatio(D, text) >= 12 ? D : mix(bg, '#000000', 0.35);
  const primaryText = ensureContrast(P, strong, 5.2, '#ffffff');
  const ink = getContrastRatio(D, '#fff') >= 12 ? D : NEAR_BLACK;
  const fillOk = Math.max(getContrastRatio(P, '#fff'), getContrastRatio(P, ink)) >= 4.5;
  const primaryFill = fillOk ? P : primaryText;
  const t = (k: number) => mix(text, bg, k);
  return {
    primary: P,
    primaryLight: mix(primaryText, bg, 0.35),
    primaryPale: mix(P, bg, 0.78),
    primaryHover: mix(P, '#ffffff', 0.12),
    primaryShade: mix(primaryText, '#ffffff', 0.12),
    primaryDark: mix(primaryText, '#ffffff', 0.25),
    primaryDeep: mix(primaryText, '#ffffff', 0.35),
    secondary: S,
    dark: text,
    textStrong: t(0.06),
    textBody: t(0.12),
    textMuted: t(0.24),
    textHint: t(0.34),
    textFaint: t(0.44),
    bg,
    bgLight: surface,
    bgMid: mix(bg, P, 0.05),
    bgDeep: mix(bg, '#000000', 0.3),
    line: mix(P, text, 0.55),
    ink,
    surface,
    surfaceStrong: strong,
    deep,
    shadow: '#000000',
    primaryText,
    primaryFill,
    onPrimary: bestOn(primaryFill, '#ffffff', ink),
    secondaryText: ensureContrast(S, strong, 4.6, '#ffffff'),
    uiBorder: ensureContrast(mix(text, surface, 0.6), surface, 3.1, text),
  };
}

export type StudioTones = ReturnType<typeof studioTones> & { surfaceStrong?: string; deep?: string };

// ── Fichas de forma de cada estilo ──────────────────────────────────────

/** Lo que cambia de forma entre estilos. `natural` = el aspecto de siempre. */
interface LookTokens {
  /** theme.shape.borderRadius: escala de `borderRadius: n` en sx (n × este valor) */
  shape: number;
  radius: {
    paper: number; dialog: number; button: number; buttonSmall: number; input: number; chip: number;
    item: number; tooltip: number; alert: number; pagination: number; table: number;
  };
  borderWidth: number;
  /** Tarjetas (Paper) */
  paperBg: string;
  paperBorder: string;
  blur: string;
  shadows: [string, string, string];
  /** Tablas */
  tableBg: string;
  tableBorder: string;
  /** Diálogos */
  dialogBg: string;
  dialogBorder: string;
  dialogBlur: string;
  dialogShadow: string;
  /** Barra superior y menú lateral */
  appBarBg: string;
  appBarBorder: string;
  appBarShadow: string;
  appBarBlur: string;
  drawerBg: string;
  drawerBorder: string;
  drawerBlur: string;
  /** Campos de formulario */
  inputBg: string;
  /** Fondo de la página (`background` del body) */
  body: string;
}

type Tones = StudioTones;
type Look = { tokens: (t: Tones) => LookTokens; extra?: (t: Tones, tk: LookTokens, fonts: { heading: string; body: string }) => ThemeOptions };

const GLASS_BORDER = '1px solid rgba(255,255,255,0.6)';

/** Natural: el aspecto clásico del panel (también cuando el panel no sigue el estilo). */
const naturalTokens = (t: Tones): LookTokens => {
  const D = (a: number) => rgb(t.shadow, a);
  return {
    shape: 16,
    radius: { paper: 18, dialog: 22, button: 12, buttonSmall: 10, input: 13, chip: 9, item: 14, tooltip: 10, alert: 14, pagination: 10, table: 18 },
    borderWidth: 1,
    paperBg: 'rgba(255,255,255,0.55)',
    paperBorder: GLASS_BORDER,
    blur: 'blur(20px) saturate(180%)',
    shadows: [
      `0 1px 4px ${D(0.04)}, 0 1px 2px ${D(0.03)}`,
      `0 3px 12px ${D(0.05)}, 0 1px 4px ${D(0.03)}`,
      `0 6px 24px ${D(0.06)}, 0 2px 6px ${D(0.03)}`,
    ],
    tableBg: 'rgba(255,255,255,0.55)',
    tableBorder: '1px solid rgba(255,255,255,0.5)',
    dialogBg: 'rgba(255,255,255,0.7)',
    dialogBorder: GLASS_BORDER,
    dialogBlur: 'blur(28px) saturate(200%)',
    dialogShadow: `0 16px 60px ${D(0.12)}`,
    appBarBg: 'rgba(255,255,255,0.55)',
    appBarBorder: GLASS_BORDER,
    appBarShadow: `0 1px 3px ${D(0.05)}`,
    appBarBlur: 'blur(20px) saturate(180%)',
    drawerBg: `linear-gradient(180deg, rgba(255,255,255,0.7) 0%, ${rgb(t.bgLight, 0.8)} 100%)`,
    drawerBorder: GLASS_BORDER,
    drawerBlur: 'blur(24px) saturate(180%)',
    inputBg: 'rgba(255,255,255,0.5)',
    body: `linear-gradient(135deg, ${t.bg} 0%, ${t.bgDeep} 40%, ${t.bgMid} 100%)`,
  };
};

/** Botón principal sin degradado ni elevación (base de varios estilos). */
const flatButtons = (t: Tones, extra: Record<string, unknown> = {}) => ({
  contained: {
    background: t.primaryFill,
    color: t.onPrimary,
    boxShadow: 'none',
    '&:hover': { background: mix(t.primaryFill, t.onPrimary, 0.12), boxShadow: 'none', transform: 'none' },
    ...extra,
  },
});

/** Estados (avisos, chips) con contraste AA en los estilos claros «de trabajo». */
const strongStatus = (): ThemeOptions => ({
  palette: {
    error: { main: '#A0473A', light: '#DBA89D' },
    warning: { main: '#8A5A00', light: '#E8CCAE' },
    success: { main: '#3D6B2E', light: '#A3BD95' },
    info: { main: '#3D5A63', light: '#B3C5C7' },
  },
  components: {
    MuiChip: {
      styleOverrides: {
        colorSuccess: { color: '#2F5A22' },
        colorError: { color: '#A0473A' },
        colorWarning: { color: '#7A4F00' },
        colorInfo: { color: '#3D5A63' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        filledSuccess: { backgroundColor: '#3D6B2E', color: '#fff' },
        filledError: { backgroundColor: '#A0473A', color: '#fff' },
        filledWarning: { backgroundColor: '#8A5A00', color: '#fff' },
        filledInfo: { backgroundColor: '#3D5A63', color: '#fff' },
      },
    },
  },
});

/** Inputs con borde visible (3:1) en los estilos «de trabajo». */
const inputs = (t: Tones, radius: number, width = 1, focus = t.primaryText, extraFocus: Record<string, unknown> = {}) => ({
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: radius,
          '& fieldset': { borderColor: t.uiBorder, borderWidth: width },
          '&:hover fieldset': { borderColor: t.dark },
          '&.Mui-focused fieldset': { borderColor: focus, borderWidth: Math.max(2, width) },
          '&.Mui-focused': extraFocus,
        },
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      notchedOutline: { borderColor: t.uiBorder, borderWidth: width },
    },
  },
});

/**
 * Calendario (react-big-calendar) en los estilos «de trabajo»: su CSS de
 * serie (colores grises fijos) se carga después del nuestro, así que aquí va
 * con más especificidad. En natural no se toca nada.
 */
const calendarCss = (dark: boolean) => `
  :root:root .rbc-toolbar button { color: var(--cal-muted); background-color: var(--cal-button-bg); }
  :root:root .rbc-toolbar button:hover, :root:root .rbc-toolbar button:focus { color: var(--cal-primary); background-color: var(--cal-primary-light); }
  :root:root .rbc-toolbar button.rbc-active, :root:root .rbc-toolbar button.rbc-active:hover, :root:root .rbc-toolbar button.rbc-active:focus { color: var(--studio-on-primary); background-color: var(--studio-primary-fill); }
  :root:root .rbc-off-range-bg { background: rgb(var(--studio-bg-deep-rgb) / 0.35); }
  :root:root .rbc-off-range { color: var(--studio-text-faint); }
  :root:root .rbc-selected-cell { background-color: var(--cal-primary-hover); }
  :root:root .rbc-event-label { opacity: 0.85 !important; }
  ${dark ? `
  :root:root .rbc-calendar * { border-color: var(--cal-border); }
  :root:root .rbc-day-slot .rbc-time-slot { border-top-color: rgba(255,255,255,0.04); }
  :root:root .rbc-show-more { background-color: transparent; }
  :root:root .rbc-overlay { background: var(--cal-overlay-bg); border-color: var(--cal-border); }
  :root:root .rbc-time-view-resources .rbc-time-gutter, :root:root .rbc-time-view-resources .rbc-time-header-gutter { background-color: var(--studio-bg); }
  ` : ''}
`;

/** Reglas comunes de los estilos «de trabajo» (no se aplican a natural). */
const workingCss = (t: Tones) => `
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; scroll-behavior: auto !important; }
    .MuiButton-root:hover, .rbc-event:hover { transform: none !important; }
  }
  :focus-visible { outline: 2px solid ${t.primaryText}; outline-offset: 2px; }
`;

const LOOKS: Record<StyleId, Look> = {
  natural: { tokens: naturalTokens },

  // ── MINIMAL: plano, bordes finos, mucho aire ───────────────────────────
  minimal: {
    tokens: (t) => {
      const line = rgb(t.ink, 0.1);
      const page = mix(t.bg, '#ffffff', 0.7);
      return {
        shape: 3,
        radius: { paper: 10, dialog: 12, button: 8, buttonSmall: 6, input: 8, chip: 6, item: 8, tooltip: 6, alert: 8, pagination: 6, table: 10 },
        borderWidth: 1,
        paperBg: '#ffffff',
        paperBorder: `1px solid ${line}`,
        blur: 'none',
        shadows: ['none', '0 1px 2px rgba(0,0,0,0.04)', '0 1px 2px rgba(0,0,0,0.05), 0 8px 24px -12px rgba(0,0,0,0.12)'],
        tableBg: '#ffffff',
        tableBorder: `1px solid ${line}`,
        dialogBg: '#ffffff',
        dialogBorder: `1px solid ${rgb(t.ink, 0.08)}`,
        dialogBlur: 'none',
        dialogShadow: '0 1px 2px rgba(0,0,0,0.05), 0 16px 40px -16px rgba(0,0,0,0.22)',
        appBarBg: '#ffffff',
        appBarBorder: `1px solid ${rgb(t.ink, 0.08)}`,
        appBarShadow: 'none',
        appBarBlur: 'none',
        drawerBg: '#ffffff',
        drawerBorder: `1px solid ${rgb(t.ink, 0.08)}`,
        drawerBlur: 'none',
        inputBg: '#ffffff',
        body: page,
      };
    },
    extra: (t) => ({
      ...strongStatus(),
      typography: {
        h1: { fontWeight: 400, letterSpacing: '-0.015em' },
        h2: { fontWeight: 400, letterSpacing: '-0.01em' },
        h3: { fontWeight: 400 },
        h4: { fontWeight: 500 },
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: { fontWeight: 500, letterSpacing: '0.01em', transition: 'background-color 0.2s ease, border-color 0.2s ease' },
            ...flatButtons(t),
            outlined: {
              borderWidth: 1, borderColor: t.uiBorder, color: t.textStrong,
              '&:hover': { borderWidth: 1, borderColor: t.dark, backgroundColor: rgb(t.ink, 0.03) },
            },
            text: { color: t.primaryText, '&:hover': { backgroundColor: rgb(t.ink, 0.04) } },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            root: { borderBottom: `1px solid ${rgb(t.ink, 0.07)}`, padding: '16px 24px' },
            head: { color: t.textMuted, backgroundColor: 'transparent', borderBottom: `1px solid ${rgb(t.ink, 0.12)}`, letterSpacing: '0.06em', padding: '16px 24px' },
          },
        },
        MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: rgb(t.ink, 0.025) } } } },
        MuiTabs: { styleOverrides: { root: { borderBottom: `1px solid ${rgb(t.ink, 0.08)}` }, indicator: { height: 2, borderRadius: 0, backgroundColor: t.dark } } },
        MuiTab: { styleOverrides: { root: { color: t.textMuted, '&.Mui-selected': { color: t.dark } } } },
        MuiDivider: { styleOverrides: { root: { borderColor: rgb(t.ink, 0.08) } } },
        MuiDialogContent: { styleOverrides: { root: { padding: '8px 36px 28px' } } },
        MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
        ...inputs(t, 8),
        MuiCssBaseline: { styleOverrides: workingCss(t) },
      },
    }),
  },

  // ── EDITORIAL: de revista, esquinas rectas, líneas finas ───────────────
  editorial: {
    tokens: (t) => {
      const rule = `1px solid ${rgb(t.ink, 0.22)}`;
      const page = mix(t.bg, '#ffffff', 0.55);
      return {
        shape: 1,
        radius: { paper: 2, dialog: 2, button: 0, buttonSmall: 0, input: 2, chip: 2, item: 2, tooltip: 2, alert: 2, pagination: 0, table: 2 },
        borderWidth: 1,
        paperBg: mix(t.bg, '#ffffff', 0.8),
        paperBorder: rule,
        blur: 'none',
        shadows: ['none', 'none', `0 18px 40px -24px ${rgb(t.shadow, 0.4)}`],
        tableBg: mix(t.bg, '#ffffff', 0.8),
        tableBorder: rule,
        dialogBg: mix(t.bg, '#ffffff', 0.9),
        dialogBorder: `1px solid ${rgb(t.ink, 0.35)}`,
        dialogBlur: 'none',
        dialogShadow: `0 18px 40px -24px ${rgb(t.shadow, 0.45)}`,
        appBarBg: page,
        appBarBorder: rule,
        appBarShadow: 'none',
        appBarBlur: 'none',
        drawerBg: page,
        drawerBorder: rule,
        drawerBlur: 'none',
        inputBg: rgb('#ffffff', 0.6),
        body: page,
      };
    },
    extra: (t) => {
      const spaced = { textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontSize: '0.8rem' };
      return {
        ...strongStatus(),
        typography: {
          h1: { fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.1 },
          h2: { fontWeight: 400, letterSpacing: '-0.01em' },
          h3: { fontWeight: 400 },
          h4: { fontWeight: 400 },
          h5: { fontWeight: 500 },
          overline: { letterSpacing: '0.22em' },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: { fontWeight: 500, ...spaced, transition: 'background-color 0.2s ease, color 0.2s ease' },
              contained: {
                background: t.ink, color: bestOn(t.ink, '#ffffff', t.bg), boxShadow: 'none',
                '&:hover': { background: t.primaryText, color: bestOn(t.primaryText, '#ffffff', t.ink), boxShadow: 'none', transform: 'none' },
              },
              outlined: {
                borderWidth: 1, borderColor: t.ink, color: t.ink,
                '&:hover': { borderWidth: 1, borderColor: t.ink, backgroundColor: t.ink, color: bestOn(t.ink, '#ffffff', t.bg) },
              },
              text: { color: t.ink, '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline', textUnderlineOffset: '0.3em' } },
              sizeSmall: { fontSize: '0.74rem' },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: { borderBottom: `1px solid ${rgb(t.ink, 0.14)}` },
              head: { color: t.ink, backgroundColor: 'transparent', borderBottom: `1px solid ${t.ink}`, letterSpacing: '0.16em', fontSize: '0.72rem' },
            },
          },
          MuiTabs: { styleOverrides: { root: { borderBottom: `1px solid ${rgb(t.ink, 0.22)}` }, indicator: { height: 2, borderRadius: 0, backgroundColor: t.ink } } },
          MuiTab: { styleOverrides: { root: { color: t.textMuted, '&.Mui-selected': { color: t.ink } } } },
          MuiDivider: { styleOverrides: { root: { borderColor: rgb(t.ink, 0.2) } } },
          MuiDialogTitle: { styleOverrides: { root: { fontWeight: 400, fontSize: '1.6rem' } } },
          MuiChip: { styleOverrides: { root: { border: `1px solid ${rgb(t.ink, 0.25)}`, letterSpacing: '0.04em' } } },
          MuiLinearProgress: { styleOverrides: { root: { height: 3 } } },
          ...inputs(t, 2, 1, t.ink),
          MuiCssBaseline: { styleOverrides: workingCss(t) },
        },
      };
    },
  },

  // ── LIQUID GLASS: cristal translúcido con blur y degradado de fondo ────
  glass: {
    tokens: (t) => ({
      shape: 8,
      radius: { paper: 22, dialog: 26, button: 14, buttonSmall: 12, input: 14, chip: 12, item: 14, tooltip: 12, alert: 16, pagination: 12, table: 22 },
      borderWidth: 1,
      paperBg: 'rgba(255,255,255,0.5)',
      paperBorder: '1px solid rgba(255,255,255,0.72)',
      blur: 'blur(24px) saturate(180%)',
      shadows: [
        `inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 16px ${rgb(t.shadow, 0.06)}`,
        `inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(255,255,255,0.16), 0 8px 32px ${rgb(t.shadow, 0.1)}`,
        `inset 0 1px 0 rgba(255,255,255,0.7), 0 18px 48px ${rgb(t.shadow, 0.16)}`,
      ],
      tableBg: 'rgba(255,255,255,0.5)',
      tableBorder: '1px solid rgba(255,255,255,0.72)',
      dialogBg: 'rgba(255,255,255,0.74)',
      dialogBorder: '1px solid rgba(255,255,255,0.8)',
      dialogBlur: 'blur(32px) saturate(200%)',
      dialogShadow: `inset 0 1px 0 rgba(255,255,255,0.6), 0 16px 48px ${rgb(t.shadow, 0.2)}`,
      appBarBg: 'rgba(255,255,255,0.45)',
      appBarBorder: '1px solid rgba(255,255,255,0.7)',
      appBarShadow: `inset 0 -1px 0 rgba(255,255,255,0.4), 0 4px 24px ${rgb(t.shadow, 0.06)}`,
      appBarBlur: 'blur(24px) saturate(180%)',
      drawerBg: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.38) 100%)',
      drawerBorder: '1px solid rgba(255,255,255,0.7)',
      drawerBlur: 'blur(28px) saturate(180%)',
      inputBg: 'rgba(255,255,255,0.62)',
      body: `radial-gradient(ellipse at 8% 0%, ${rgb(t.primary, 0.22)}, transparent 55%), `
        + `radial-gradient(ellipse at 95% 100%, ${rgb(t.secondary, 0.2)}, transparent 55%), `
        + `linear-gradient(150deg, ${mix(t.primary, '#ffffff', 0.84)} 0%, ${t.bg} 50%, ${mix(t.primary, '#ffffff', 0.8)} 100%) fixed`,
    }),
    extra: (t) => {
      // Sin backdrop-filter (navegadores antiguos): cristal casi opaco
      const noBlur = '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';
      const opaque = { [noBlur]: { backgroundColor: 'rgba(255,255,255,0.92)' } };
      return {
        ...strongStatus(),
        typography: { h1: { fontWeight: 600 }, h2: { fontWeight: 600 } },
        components: {
          MuiPaper: { styleOverrides: { root: { WebkitBackdropFilter: 'blur(24px) saturate(180%)', ...opaque } } },
          MuiTableContainer: { styleOverrides: { root: { WebkitBackdropFilter: 'blur(24px) saturate(180%)', ...opaque } } },
          MuiDialog: { styleOverrides: { paper: { WebkitBackdropFilter: 'blur(32px) saturate(200%)', [noBlur]: { backgroundColor: 'rgba(255,255,255,0.97)' } } } },
          MuiAppBar: { styleOverrides: { root: opaque } },
          MuiDrawer: { styleOverrides: { paper: { [noBlur]: { background: 'rgba(255,255,255,0.95)' } } } },
          MuiButton: {
            styleOverrides: {
              contained: {
                background: `linear-gradient(135deg, ${t.primaryFill}, ${mix(t.primaryFill, t.ink, 0.18)})`,
                color: t.onPrimary,
                border: '1px solid rgba(255,255,255,0.35)',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 24px ${rgb(t.primaryFill, 0.3)}`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${mix(t.primaryFill, '#ffffff', 0.08)}, ${t.primaryFill})`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 12px 32px ${rgb(t.primaryFill, 0.4)}`,
                },
              },
              outlined: {
                backgroundColor: 'rgba(255,255,255,0.42)', borderColor: 'rgba(255,255,255,0.85)', color: t.primaryText,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 10px ${rgb(t.shadow, 0.06)}`,
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.65)', borderColor: '#ffffff' },
              },
              text: { color: t.primaryText },
            },
          },
          MuiTableCell: { styleOverrides: { head: { color: t.primaryText, backgroundColor: 'rgba(255,255,255,0.35)' } } },
          MuiTab: { styleOverrides: { root: { color: t.textMuted, '&.Mui-selected': { color: t.primaryText } } } },
          ...inputs(t, 14),
          MuiCssBaseline: { styleOverrides: workingCss(t) },
        },
      };
    },
  },

  // ── BRUTALISTA: bordes gruesos oscuros y sombras duras ─────────────────
  brutalist: {
    tokens: (t) => ({
      shape: 2,
      radius: { paper: 6, dialog: 8, button: 6, buttonSmall: 4, input: 4, chip: 4, item: 6, tooltip: 4, alert: 6, pagination: 4, table: 6 },
      borderWidth: 2,
      paperBg: '#ffffff',
      paperBorder: `2px solid ${t.ink}`,
      blur: 'none',
      shadows: [`2px 2px 0 ${t.ink}`, `4px 4px 0 ${t.ink}`, `6px 6px 0 ${t.ink}`],
      tableBg: '#ffffff',
      tableBorder: `2px solid ${t.ink}`,
      dialogBg: '#ffffff',
      dialogBorder: `2.5px solid ${t.ink}`,
      dialogBlur: 'none',
      dialogShadow: `6px 6px 0 ${t.ink}`,
      appBarBg: '#ffffff',
      appBarBorder: `2.5px solid ${t.ink}`,
      appBarShadow: 'none',
      appBarBlur: 'none',
      drawerBg: '#ffffff',
      drawerBorder: `2.5px solid ${t.ink}`,
      drawerBlur: 'none',
      inputBg: '#ffffff',
      body: mix(t.bg, t.secondary, 0.06),
    }),
    extra: (t) => {
      const ink = t.ink;
      const press = { transform: 'translate(2px, 2px)', boxShadow: `1px 1px 0 ${ink}` };
      return {
        ...strongStatus(),
        typography: {
          h1: { fontWeight: 700, letterSpacing: '-0.02em' },
          h2: { fontWeight: 700, letterSpacing: '-0.02em' },
          h3: { fontWeight: 700 },
          h4: { fontWeight: 700 },
          h5: { fontWeight: 700 },
          overline: { fontFamily: MONO, letterSpacing: '0.06em', fontWeight: 700 },
        },
        components: {
          MuiPaper: { styleOverrides: { elevation8: { boxShadow: `4px 4px 0 ${ink}` } } },
          MuiButton: {
            styleOverrides: {
              root: { fontWeight: 700, transition: 'transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease' },
              contained: {
                background: t.primaryFill, color: t.onPrimary, border: `2px solid ${ink}`, boxShadow: `3px 3px 0 ${ink}`,
                '&:hover': { background: t.primaryFill, ...press },
                '&.Mui-disabled': { borderColor: rgb(ink, 0.3), boxShadow: 'none' },
              },
              outlined: {
                borderWidth: 2, borderColor: ink, color: ink, backgroundColor: '#ffffff', boxShadow: `3px 3px 0 ${ink}`,
                '&:hover': { borderWidth: 2, borderColor: ink, backgroundColor: mix(t.primary, '#ffffff', 0.8), ...press },
              },
              text: { color: ink, '&:hover': { backgroundColor: mix(t.primary, '#ffffff', 0.75) } },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: { borderBottom: `1.5px solid ${rgb(ink, 0.18)}` },
              head: { fontFamily: MONO, fontWeight: 700, color: bestOn(mix(t.primary, '#ffffff', 0.65), ink, '#ffffff'), backgroundColor: mix(t.primary, '#ffffff', 0.65), borderBottom: `2px solid ${ink}`, letterSpacing: '0.04em' },
            },
          },
          MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: mix(t.primary, '#ffffff', 0.88) } } } },
          MuiChip: { styleOverrides: { root: { border: `1.5px solid ${ink}`, fontWeight: 700 } } },
          MuiTabs: { styleOverrides: { root: { borderBottom: `2px solid ${ink}` }, indicator: { height: 4, borderRadius: 0, backgroundColor: ink } } },
          MuiTab: { styleOverrides: { root: { fontWeight: 600, color: t.textMuted, '&.Mui-selected': { color: ink, fontWeight: 700 } } } },
          MuiDivider: { styleOverrides: { root: { borderColor: rgb(ink, 0.3) } } },
          MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: ink, border: `2px solid ${ink}` } } },
          MuiAlert: { styleOverrides: { root: { border: `2px solid ${ink}` } } },
          MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700 } } },
          MuiLinearProgress: { styleOverrides: { root: { border: `1.5px solid ${ink}`, height: 10 }, bar: { backgroundColor: t.primaryFill } } },
          ...inputs(t, 4, 2, ink, { boxShadow: `3px 3px 0 ${ink}` }),
          MuiCssBaseline: { styleOverrides: workingCss(t) },
        },
      };
    },
  },

  // ── ENERGÍA (oscuro): deportivo, acentos saturados, mayúsculas ─────────
  energy: {
    tokens: (t) => ({
      shape: 3,
      radius: { paper: 8, dialog: 10, button: 4, buttonSmall: 4, input: 6, chip: 3, item: 6, tooltip: 4, alert: 6, pagination: 4, table: 8 },
      borderWidth: 1,
      paperBg: t.surface,
      paperBorder: '1px solid rgba(255,255,255,0.1)',
      blur: 'none',
      shadows: [
        '0 0 0 1px rgba(255,255,255,0.03), 0 4px 12px -6px rgba(0,0,0,0.7)',
        '0 0 0 1px rgba(255,255,255,0.04), 0 18px 40px -20px rgba(0,0,0,0.8)',
        '0 24px 60px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)',
      ],
      tableBg: t.surface,
      tableBorder: '1px solid rgba(255,255,255,0.1)',
      dialogBg: t.surfaceStrong || t.surface,
      dialogBorder: '1px solid rgba(255,255,255,0.12)',
      dialogBlur: 'none',
      dialogShadow: '0 24px 60px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)',
      appBarBg: t.deep || t.bg,
      appBarBorder: '3px solid transparent',
      appBarShadow: 'none',
      appBarBlur: 'none',
      drawerBg: t.deep || t.bg,
      drawerBorder: '1px solid rgba(255,255,255,0.08)',
      drawerBlur: 'none',
      inputBg: 'rgba(255,255,255,0.05)',
      body: `linear-gradient(165deg, ${mix(t.bg, t.primary, 0.06)} 0%, ${t.bg} 45%, ${mix(t.bg, t.secondary, 0.06)} 100%) fixed`,
    }),
    extra: (t) => {
      const band = `linear-gradient(100deg, ${t.primary}, ${t.secondary})`;
      const upper = { textTransform: 'uppercase' as const, letterSpacing: '0.01em', fontStretch: 'condensed' };
      return {
        typography: {
          h1: { fontWeight: 700, lineHeight: 1.1, ...upper },
          h2: { fontWeight: 700, lineHeight: 1.15, ...upper },
          h3: { fontWeight: 700, ...upper },
          h4: { fontWeight: 700 },
        },
        components: {
          MuiAppBar: { styleOverrides: { root: { borderImage: `${band} 1` } } },
          MuiPaper: { styleOverrides: { elevation8: { boxShadow: '0 24px 60px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)' } } },
          MuiButton: {
            styleOverrides: {
              root: { fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.84rem' },
              contained: {
                background: `linear-gradient(105deg, ${t.primaryFill} 0%, ${mix(t.primaryFill, '#ffffff', 0.18)} 100%)`,
                color: t.onPrimary,
                boxShadow: `0 12px 30px -14px ${rgb(t.primaryFill, 0.75)}`,
                '&:hover': { background: t.primaryFill, boxShadow: `0 16px 36px -12px ${rgb(t.primaryFill, 0.85)}`, transform: 'translateY(-1px)' },
                '&.Mui-disabled': { background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' },
              },
              outlined: {
                borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', color: t.dark,
                '&:hover': { borderWidth: 2, borderColor: t.primaryText, backgroundColor: 'rgba(255,255,255,0.06)' },
              },
              text: { color: t.primaryText, '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' } },
              sizeSmall: { fontSize: '0.76rem' },
            },
          },
          MuiTableCell: { styleOverrides: { head: { color: t.primaryText, backgroundColor: 'rgba(255,255,255,0.04)', fontWeight: 700 } } },
          MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 0, background: band } } },
          MuiTab: { styleOverrides: { root: { textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, fontSize: '0.84rem' } } },
          MuiDialogTitle: { styleOverrides: { root: { textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.01em' } } },
          MuiCssBaseline: { styleOverrides: workingCss(t) },
        },
      };
    },
  },

  // ── POP: redondo y alegre, pero contenido ──────────────────────────────
  pop: {
    tokens: (t) => {
      const soft = mix(t.primary, '#ffffff', 0.7);
      return {
        shape: 18,
        radius: { paper: 26, dialog: 30, button: 999, buttonSmall: 999, input: 18, chip: 999, item: 18, tooltip: 14, alert: 18, pagination: 999, table: 26 },
        borderWidth: 2,
        paperBg: '#ffffff',
        paperBorder: `2px solid ${soft}`,
        blur: 'none',
        shadows: [
          `0 6px 16px -10px ${rgb(t.primary, 0.4)}`,
          `0 14px 30px -14px ${rgb(t.primary, 0.45)}`,
          `0 22px 40px -16px ${rgb(t.secondary, 0.5)}`,
        ],
        tableBg: '#ffffff',
        tableBorder: `2px solid ${soft}`,
        dialogBg: '#ffffff',
        dialogBorder: `2px solid ${mix(t.primary, '#ffffff', 0.6)}`,
        dialogBlur: 'none',
        dialogShadow: `0 24px 50px -18px ${rgb(t.secondary, 0.5)}`,
        appBarBg: 'rgba(255,255,255,0.92)',
        appBarBorder: `2px solid ${mix(t.primary, '#ffffff', 0.75)}`,
        appBarShadow: 'none',
        appBarBlur: 'blur(8px)',
        drawerBg: '#ffffff',
        drawerBorder: `2px solid ${mix(t.primary, '#ffffff', 0.75)}`,
        drawerBlur: 'none',
        inputBg: '#ffffff',
        body: `radial-gradient(${rgb(t.primary, 0.13)} 1.5px, transparent 1.7px) 0 0 / 22px 22px, `
          + `linear-gradient(160deg, ${mix(t.primary, '#ffffff', 0.88)} 0%, ${t.bg} 50%, ${mix(t.secondary, '#ffffff', 0.88)} 100%) fixed`,
      };
    },
    extra: (t) => {
      const ink = t.ink;
      return {
        ...strongStatus(),
        typography: {
          h1: { fontWeight: 700, letterSpacing: '-0.02em' },
          h2: { fontWeight: 700, letterSpacing: '-0.02em' },
          h3: { fontWeight: 700 },
          h4: { fontWeight: 700 },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: { fontWeight: 700, transition: 'transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease' },
              contained: {
                background: t.primaryFill, color: t.onPrimary, border: `2px solid ${ink}`, boxShadow: `0 4px 0 ${ink}`,
                '&:hover': { background: t.primaryFill, transform: 'translateY(2px)', boxShadow: `0 2px 0 ${ink}` },
                '&.Mui-disabled': { borderColor: rgb(ink, 0.3), boxShadow: 'none' },
              },
              outlined: {
                borderWidth: 2, borderColor: mix(t.primaryText, '#ffffff', 0.35), color: t.primaryText, backgroundColor: '#ffffff',
                '&:hover': { borderWidth: 2, borderColor: t.primaryText, backgroundColor: mix(t.primary, '#ffffff', 0.88) },
              },
              text: { color: t.primaryText },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              head: { color: ink, backgroundColor: mix(t.secondary, '#ffffff', 0.86), borderBottom: `2px solid ${mix(t.primary, '#ffffff', 0.6)}`, fontWeight: 700 },
            },
          },
          MuiChip: { styleOverrides: { root: { fontWeight: 600, border: `1.5px solid ${mix(t.primary, '#ffffff', 0.55)}` } } },
          MuiTabs: { styleOverrides: { indicator: { height: 4, borderRadius: 4, backgroundColor: t.primaryFill } } },
          MuiTab: { styleOverrides: { root: { fontWeight: 600, color: t.textMuted, '&.Mui-selected': { color: t.primaryText } } } },
          ...inputs(t, 18, 2),
          MuiCssBaseline: { styleOverrides: workingCss(t) },
        },
      };
    },
  },

  // ── NEÓN (oscuro): azul-negro, brillo SOLO en los acentos ──────────────
  neon: {
    tokens: (t) => ({
      shape: 2,
      radius: { paper: 6, dialog: 8, button: 4, buttonSmall: 4, input: 4, chip: 3, item: 6, tooltip: 4, alert: 6, pagination: 4, table: 6 },
      borderWidth: 1,
      paperBg: t.surface,
      paperBorder: `1px solid ${rgb(t.primary, 0.32)}`,
      blur: 'none',
      shadows: [
        `0 0 0 1px ${rgb(t.primary, 0.1)}, 0 0 16px -10px ${rgb(t.primary, 0.45)}`,
        `0 0 0 1px ${rgb(t.primary, 0.14)}, 0 0 24px -10px ${rgb(t.primary, 0.5)}`,
        `0 0 0 1px ${rgb(t.secondary, 0.3)}, 0 0 40px -12px ${rgb(t.secondary, 0.4)}, 0 30px 60px -20px rgba(0,0,0,0.85)`,
      ],
      tableBg: t.surface,
      tableBorder: `1px solid ${rgb(t.primary, 0.32)}`,
      dialogBg: t.surfaceStrong || t.surface,
      dialogBorder: `1px solid ${rgb(t.secondary, 0.45)}`,
      dialogBlur: 'none',
      dialogShadow: `0 0 0 1px ${rgb(t.secondary, 0.2)}, 0 0 40px -12px ${rgb(t.secondary, 0.45)}, 0 30px 60px -20px rgba(0,0,0,0.85)`,
      appBarBg: t.deep || t.bg,
      appBarBorder: `1px solid ${rgb(t.primary, 0.45)}`,
      appBarShadow: `0 0 20px -6px ${rgb(t.primary, 0.5)}`,
      appBarBlur: 'none',
      drawerBg: t.deep || t.bg,
      drawerBorder: `1px solid ${rgb(t.primary, 0.3)}`,
      drawerBlur: 'none',
      inputBg: 'rgba(255,255,255,0.04)',
      body: `linear-gradient(${rgb(t.secondary, 0.05)} 1px, transparent 1px) 0 0 / 44px 44px, `
        + `linear-gradient(90deg, ${rgb(t.secondary, 0.05)} 1px, transparent 1px) 0 0 / 44px 44px, `
        + `radial-gradient(ellipse at 12% 0%, ${rgb(t.primary, 0.14)}, transparent 55%), `
        + `radial-gradient(ellipse at 92% 100%, ${rgb(t.secondary, 0.12)}, transparent 55%), ${t.bg}`,
    }),
    extra: (t) => {
      const glow = (c: string, a = 0.6) => `0 0 16px -2px ${rgb(c, a)}`;
      const btnText = mix(t.primaryText, '#ffffff', 0.45);
      return {
        typography: {
          h1: { fontWeight: 700, letterSpacing: '0.02em' },
          h2: { fontWeight: 700, letterSpacing: '0.02em' },
          h3: { fontWeight: 700 },
          overline: { fontFamily: MONO, letterSpacing: '0.2em' },
        },
        components: {
          MuiPaper: { styleOverrides: { elevation8: { boxShadow: `0 0 0 1px ${rgb(t.secondary, 0.35)}, 0 0 30px -10px ${rgb(t.secondary, 0.45)}, 0 24px 50px -20px rgba(0,0,0,0.85)` } } },
          MuiButton: {
            styleOverrides: {
              root: { fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.82rem' },
              contained: {
                background: mix(t.surface, t.primary, 0.2), color: btnText, border: `1px solid ${t.primary}`,
                boxShadow: `${glow(t.primary)}, inset 0 0 12px -4px ${rgb(t.primary, 0.55)}`,
                '&:hover': { background: t.primaryFill, color: t.onPrimary, boxShadow: `0 0 28px 0 ${rgb(t.primary, 0.7)}`, transform: 'none' },
                '&.Mui-disabled': { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)', boxShadow: 'none', color: 'rgba(255,255,255,0.45)' },
              },
              outlined: {
                borderColor: rgb(t.secondary, 0.6), color: t.secondaryText,
                '&:hover': { borderColor: t.secondary, backgroundColor: rgb(t.secondary, 0.12), boxShadow: glow(t.secondary, 0.45) },
              },
              text: { color: t.secondaryText, '&:hover': { backgroundColor: rgb(t.secondary, 0.1) } },
              sizeSmall: { fontSize: '0.74rem' },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              head: { fontFamily: MONO, color: t.secondaryText, backgroundColor: rgb(t.primary, 0.06), borderBottom: `1px solid ${rgb(t.primary, 0.45)}`, letterSpacing: '0.14em' },
            },
          },
          MuiTabs: { styleOverrides: { indicator: { height: 2, borderRadius: 0, backgroundColor: t.primary, boxShadow: glow(t.primary, 0.9) } } },
          MuiTab: { styleOverrides: { root: { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.82rem' } } },
          ...inputs(t, 4, 1, t.secondary, { boxShadow: `0 0 0 3px ${rgb(t.secondary, 0.18)}, 0 0 14px ${rgb(t.secondary, 0.35)}` }),
          MuiChip: { styleOverrides: { root: { border: `1px solid ${rgb(t.secondary, 0.35)}` } } },
          MuiDialogTitle: { styleOverrides: { root: { letterSpacing: '0.02em' } } },
          MuiCssBaseline: { styleOverrides: workingCss(t) },
        },
      };
    },
  },
};

/** Paleta y componentes comunes a los estilos oscuros (energy, neon). */
function darkBase(t: Tones, neon: boolean): ThemeOptions {
  const st = neon
    ? { error: '#FB7185', warning: '#FCD34D', success: '#4ADE80', info: '#67E8F9' }
    : { error: '#F87171', warning: '#FBBF24', success: '#4ADE80', info: '#7DD3FC' };
  const strong = t.surfaceStrong || t.surface;
  const tint = (c: string, a: number) => mix(strong, c, a);
  const soft = (c: string) => mix(c, '#ffffff', 0.45);
  const status = (['error', 'warning', 'success', 'info'] as const);
  const chip = Object.fromEntries(status.map((k) => [`color${k[0].toUpperCase()}${k.slice(1)}`, { backgroundColor: rgb(st[k], 0.16), color: soft(st[k]) }]));
  const alert = Object.fromEntries(status.flatMap((k) => {
    const K = `${k[0].toUpperCase()}${k.slice(1)}`;
    return [
      [`standard${K}`, { backgroundColor: tint(st[k], 0.14), color: soft(st[k]), border: `1px solid ${rgb(st[k], 0.45)}`, '& .MuiAlert-icon': { color: st[k] } }],
      [`filled${K}`, { backgroundColor: st[k], color: NEAR_BLACK }],
      [`outlined${K}`, { color: soft(st[k]), borderColor: rgb(st[k], 0.6) }],
    ];
  }));
  return {
    palette: {
      mode: 'dark',
      error: { main: st.error },
      warning: { main: st.warning },
      success: { main: st.success },
      info: { main: st.info },
      action: { hover: 'rgba(255,255,255,0.06)', selected: rgb(t.primary, 0.16), focus: 'rgba(255,255,255,0.12)' },
    },
    components: {
      MuiChip: { styleOverrides: chip },
      MuiAlert: { styleOverrides: alert },
      MuiTooltip: {
        styleOverrides: { tooltip: { backgroundColor: mix(strong, '#ffffff', 0.14), color: t.dark, border: '1px solid rgba(255,255,255,0.12)' } },
      },
      MuiSwitch: {
        styleOverrides: { root: { '& .MuiSwitch-switchBase.Mui-checked': { color: t.primaryText } } },
      },
      MuiCheckbox: { styleOverrides: { root: { color: t.textHint, '&.Mui-checked': { color: t.primaryText } } } },
      MuiRadio: { styleOverrides: { root: { color: t.textHint, '&.Mui-checked': { color: t.primaryText } } } },
      MuiTab: { styleOverrides: { root: { color: t.textMuted, '&.Mui-selected': { color: t.primaryText } } } },
      MuiPagination: {
        styleOverrides: { root: { '& .MuiPaginationItem-root.Mui-selected': { backgroundColor: t.primaryFill, color: t.onPrimary } } },
      },
      MuiLinearProgress: { styleOverrides: { root: { backgroundColor: 'rgba(255,255,255,0.12)' } } },
      MuiBackdrop: { styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: neon ? 'rgba(3,3,12,0.78)' : 'rgba(0,0,0,0.72)' } } } },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              '& fieldset': { borderColor: t.uiBorder, borderWidth: 1 },
              '&:hover fieldset': { borderColor: t.dark },
              '&.Mui-focused fieldset': { borderColor: neon ? t.secondary : t.primaryText, borderWidth: 2 },
            },
            '& .MuiInputLabel-root.Mui-focused': { color: neon ? t.secondaryText : t.primaryText },
          },
        },
      },
      MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderColor: t.uiBorder } } },
      MuiTableCell: { styleOverrides: { root: { borderBottom: '1px solid rgba(255,255,255,0.08)' } } },
      MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' } } } },
      MuiDivider: { styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.1)' } } },
      MuiTabs: { styleOverrides: { root: { borderBottom: '1px solid rgba(255,255,255,0.1)' } } },
      MuiMenuItem: { styleOverrides: { root: { '&.Mui-selected': { backgroundColor: rgb(t.primary, 0.18) } } } },
    },
  };
}

/** Bloque `:root { --studio-…: … }` con los tonos, las fuentes y la forma del estilo. */
function cssVariables(t: Tones, heading: string, body: string, tk?: LookTokens, look?: PanelLook): string {
  const names: [string, string][] = [
    ['primary', t.primary],
    ['primary-light', t.primaryLight],
    ['primary-pale', t.primaryPale],
    ['primary-shade', t.primaryShade],
    ['primary-dark', t.primaryDark],
    ['primary-deep', t.primaryDeep],
    ['secondary', t.secondary],
    ['dark', t.dark],
    ['text-strong', t.textStrong],
    ['text-body', t.textBody],
    ['text-muted', t.textMuted],
    ['text-hint', t.textHint],
    ['text-faint', t.textFaint],
    ['bg', t.bg],
    ['bg-light', t.bgLight],
    ['bg-deep', t.bgDeep],
    ['line', t.line],
  ];
  const lines = names.flatMap(([n, v]) => [`--studio-${n}: ${v};`, `--studio-${n}-rgb: ${channels(v)};`]);
  lines.push(`--studio-font-heading: ${heading};`, `--studio-font-body: ${body};`);
  if (!tk || !look) return `:root { ${lines.join(' ')} }`;
  // Variables nuevas: en natural reproducen exactamente lo que ya se veía
  const extra: [string, string][] = [
    ['primary-text', t.primaryText],
    ['primary-fill', t.primaryFill],
    ['on-primary', t.onPrimary],
    ['secondary-text', t.secondaryText],
    ['surface-rgb', channels(t.surface)],
    ['shadow-rgb', channels(t.shadow)],
    ['radius', `${tk.radius.paper}px`],
    ['radius-sm', `${tk.radius.button}px`],
    ['radius-chip', `${tk.radius.chip}px`],
    ['border-width', `${tk.borderWidth}px`],
    ['border', tk.paperBorder],
    ['surface', tk.paperBg],
    ['surface-strong', tk.dialogBg],
    ['shadow', tk.shadows[1]],
    ['shadow-float', tk.dialogShadow],
    ['blur', tk.blur],
  ];
  lines.push(...extra.map(([n, v]) => `--studio-${n}: ${v};`));
  if (look.style !== 'natural') {
    // Calendario (calendar.css): esquinas y bordes del estilo
    const r = tk.radius;
    lines.push(
      `--cal-radius: ${r.paper}px;`, `--cal-radius-sm: ${Math.min(r.paper, r.input)}px;`, `--cal-radius-xs: ${r.button === 999 ? 12 : r.button}px;`,
      `--cal-outer-border: ${tk.tableBorder};`, `--blur: ${tk.blur};`,
    );
    if (look.dark) {
      lines.push(
        '--cal-border: rgba(255,255,255,0.1);', '--cal-shadow-sm: none;', `--cal-shadow: ${tk.shadows[0]};`,
        `--cal-shadow-lg: ${tk.shadows[2]};`, `--cal-muted: ${t.textHint};`, `--cal-primary: ${t.primaryText};`,
      );
    } else {
      lines.push(`--cal-primary: ${t.primaryText};`);
    }
    // Textos de estado escritos a mano en algunas pantallas (var(--studio-danger-text, #A0473A)…)
    const status = look.dark
      ? { danger: '#FCA5A5', success: '#86EFAC', warning: '#FCD34D', chip: mix(t.surface, '#4ade80', 0.22) }
      : { danger: '#A0473A', success: '#3D6B2E', warning: '#7A4F00', chip: 'rgba(236,244,231,0.95)' };
    lines.push(
      `--studio-danger-text: ${status.danger};`, `--studio-success-text: ${status.success};`,
      `--studio-warning-text: ${status.warning};`, `--studio-success-chip: ${status.chip};`,
    );
    if (look.style === 'brutalist') {
      lines.push(`--cal-border: ${rgb(t.ink, 0.35)};`, `--cal-shadow: ${tk.shadows[1]};`, '--cal-shadow-sm: none;', `--cal-shadow-lg: ${tk.shadows[1]};`);
    }
  }
  // :root:root para ganar a los valores por defecto de calendar.css (mismo selector)
  return `:root${look.style === 'natural' ? '' : ':root'} { ${lines.join(' ')} }`;
}

/** Estilo, tonos y ficha de forma del panel (vista previa en Ajustes → Aspecto). */
export function panelTokens(site: SiteConfigPublic = DEFAULT_SITE_CONFIG) {
  const look = panelLook(site);
  const tones: Tones = studioTones(site, look);
  return { look, tones, tokens: (LOOKS[look.style] || LOOKS.natural).tokens(tones) };
}

/** Color de la barra del navegador / app instalada (meta theme-color). */
export function panelThemeColor(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): string {
  const look = panelLook(site);
  if (!look.dark) return site.theme.background;
  const t: Tones = studioTones(site, look);
  return t.deep || t.bg;
}

export function buildTheme(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): Theme {
  const look = panelLook(site);
  const t: Tones = studioTones(site, look);
  const spec = LOOKS[look.style] || LOOKS.natural;
  const tk = spec.tokens(t);
  const heading = headingStack(site.theme.font_heading);
  const body = bodyStack(site.theme.font_body);
  const P = (a: number) => rgb(t.primary, a);
  const D = (a: number) => rgb(t.shadow, a);
  const L = (a: number) => rgb(t.line, a);
  const R = tk.radius;
  const natural = look.style === 'natural';

  const base: ThemeOptions = {
    palette: {
      ...(look.dark ? { mode: 'dark' as const } : {}),
      primary: {
        main: natural ? t.primary : t.primaryText,
        light: t.primaryLight,
        dark: t.primaryDark,
        contrastText: natural ? onColor(t.primary, t.dark) : bestOn(t.primaryText, '#ffffff', t.ink),
      },
      secondary: {
        main: t.secondary,
        light: lighten(t.secondary, 0.3),
        dark: darken(t.secondary, 0.2),
        contrastText: onColor(t.secondary, look.dark ? t.ink : t.dark),
      },
      background: {
        default: t.bg,
        paper: natural ? 'rgba(255, 255, 255, 0.65)' : (t.surfaceStrong || tk.dialogBg),
      },
      text: {
        primary: t.dark,
        secondary: t.textMuted,
        disabled: t.textFaint,
      },
      // Colores de estado: no son de marca, se mantienen fijos
      error: { main: '#C2857A', light: '#DBA89D' },
      warning: { main: '#D4A574', light: '#E8CCAE' },
      success: { main: '#7D9B6C', light: '#A3BD95' },
      info: { main: '#8BA0A3', light: '#B3C5C7' },
      divider: L(0.25),
    },
    typography: {
      fontFamily: body,
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600,
      h1: {
        fontFamily: heading,
        fontWeight: 600,
        fontSize: '2.25rem',
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
        color: t.dark,
      },
      h2: {
        fontFamily: heading,
        fontWeight: 600,
        fontSize: '1.875rem',
        lineHeight: 1.3,
        color: t.dark,
      },
      h3: {
        fontFamily: heading,
        fontWeight: 500,
        fontSize: '1.5rem',
        lineHeight: 1.4,
        color: t.dark,
      },
      h4: {
        fontFamily: heading,
        fontWeight: 500,
        fontSize: '1.25rem',
        lineHeight: 1.4,
        color: t.dark,
      },
      h5: {
        fontFamily: heading,
        fontWeight: 500,
        fontSize: '1.1rem',
        lineHeight: 1.5,
        color: t.dark,
      },
      h6: {
        fontFamily: body,
        fontWeight: 500,
        fontSize: '1rem',
        lineHeight: 1.5,
      },
      body1: {
        fontFamily: body,
        fontWeight: 400,
        fontSize: '0.95rem',
        lineHeight: 1.7,
      },
      body2: {
        fontFamily: body,
        fontWeight: 400,
        fontSize: '0.85rem',
        lineHeight: 1.6,
        color: t.textMuted,
      },
      button: {
        fontFamily: body,
        fontWeight: 500,
        textTransform: 'none',
        letterSpacing: '0.02em',
      },
      caption: {
        fontFamily: body,
        fontWeight: 400,
        fontSize: '0.75rem',
        letterSpacing: '0.03em',
        color: natural ? t.textFaint : t.textHint,
      },
    },
    shape: { borderRadius: tk.shape },
    spacing: 8,

    components: {
      MuiCssBaseline: {
        styleOverrides: `
          ${cssVariables(t, heading, body, tk, look)}
          body {
            background: ${tk.body};
            -webkit-font-smoothing: antialiased;
          }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${P(0.3)}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: ${P(0.5)}; }
        ${natural ? '' : `  ${look.dark ? ':root { color-scheme: dark; } body { background-color: ' + t.bg + '; }' : `body { background-color: ${t.bg}; }`}\n          ${calendarCss(look.dark)}\n        `}`,
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: R.paper,
            backgroundColor: tk.paperBg,
            backdropFilter: tk.blur,
            WebkitBackdropFilter: tk.blur,
            border: tk.paperBorder,
          },
          elevation0: {
            boxShadow: 'none',
          },
          elevation1: {
            boxShadow: tk.shadows[0],
          },
          elevation2: {
            boxShadow: tk.shadows[1],
          },
          elevation3: {
            boxShadow: tk.shadows[2],
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: tk.appBarBg,
            backdropFilter: tk.appBarBlur,
            WebkitBackdropFilter: tk.appBarBlur,
            boxShadow: tk.appBarShadow,
            // Estilos «de trabajo»: barra recta con solo la línea de abajo
            ...(natural ? {} : { border: 'none', borderRadius: 0, color: t.dark }),
            borderBottom: tk.appBarBorder,
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            border: 'none',
            background: tk.drawerBg,
            backdropFilter: tk.drawerBlur,
            WebkitBackdropFilter: tk.drawerBlur,
            borderRight: tk.drawerBorder,
            ...(natural ? {} : { borderRadius: 0 }),
          },
        },
      },

      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: R.button,
            textTransform: 'none',
            fontWeight: 500,
            padding: '10px 24px',
            fontSize: '0.9rem',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          },
          contained: {
            boxShadow: `0 2px 8px ${P(0.15)}`,
            background: `linear-gradient(135deg, ${t.primary}, ${t.primaryShade})`,
            '&:hover': {
              boxShadow: `0 4px 16px ${P(0.25)}`,
              background: `linear-gradient(135deg, ${t.primaryHover}, ${t.primary})`,
              transform: 'translateY(-1px)',
            },
          },
          outlined: {
            borderWidth: 1.5,
            borderColor: P(0.4),
            '&:hover': {
              borderColor: t.primary,
              backgroundColor: P(0.05),
              borderWidth: 1.5,
            },
          },
          text: {
            '&:hover': {
              backgroundColor: P(0.06),
            },
          },
          sizeSmall: { padding: '6px 16px', fontSize: '0.8rem', borderRadius: R.buttonSmall },
        },
        defaultProps: { disableElevation: true },
      },

      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: R.table,
            backgroundColor: tk.tableBg,
            backdropFilter: tk.blur,
            border: tk.tableBorder,
          },
        },
      },

      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: P(0.04) },
            transition: 'background-color 0.2s ease',
          },
        },
      },

      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${L(0.2)}`,
            padding: '15px 22px',
            fontSize: '0.9rem',
          },
          head: {
            fontWeight: 500,
            fontSize: '0.78rem',
            color: natural ? t.primary : t.primaryText,
            backgroundColor: rgb(t.bg, 0.6),
            borderBottom: `2px solid ${L(0.3)}`,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            padding: '16px 22px',
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, fontSize: '0.78rem', borderRadius: R.chip },
          colorSuccess: { backgroundColor: 'rgba(125,155,108,0.12)', color: '#5E7A4D' },
          colorError: { backgroundColor: 'rgba(194,133,122,0.12)', color: '#A86B5E' },
          colorWarning: { backgroundColor: 'rgba(212,165,116,0.12)', color: '#B8883C' },
          colorInfo: { backgroundColor: 'rgba(139,160,163,0.12)', color: '#6B8589' },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: R.dialog,
            boxShadow: tk.dialogShadow,
            backgroundColor: tk.dialogBg,
            backdropFilter: tk.dialogBlur,
            border: tk.dialogBorder,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontFamily: heading,
            fontSize: '1.4rem',
            fontWeight: 600,
            padding: '30px 34px 16px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: '8px 34px 24px' } },
      },
      MuiDialogActions: {
        styleOverrides: { root: { padding: '16px 34px 28px', gap: 10 } },
      },

      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: R.input,
              backgroundColor: tk.inputBg,
              '& fieldset': { borderColor: L(0.4), borderWidth: 1.5 },
              '&:hover fieldset': { borderColor: t.primaryLight },
              '&.Mui-focused fieldset': { borderColor: t.primary, borderWidth: 2 },
            },
          },
        },
      },

      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: R.input,
            backgroundColor: tk.inputBg,
          },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          root: {
            '& .MuiSwitch-switchBase.Mui-checked': { color: natural ? t.primary : t.primaryText },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: P(0.4) },
          },
        },
      },

      MuiTabs: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${L(0.25)}`,
          },
          indicator: { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: t.primary },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.9rem',
            fontFamily: body,
            color: t.textMuted,
            '&.Mui-selected': { color: natural ? t.primary : t.primaryText },
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: D(0.88),
            backdropFilter: 'blur(10px)',
            borderRadius: R.tooltip,
            fontSize: '0.8rem',
            padding: '8px 14px',
          },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 6, height: 6, backgroundColor: L(0.2) },
          bar: { borderRadius: 6, backgroundColor: t.primary },
        },
      },

      MuiCircularProgress: {
        styleOverrides: { root: { color: t.primary } },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: R.item,
            margin: '3px 14px',
            transition: 'all 0.2s ease',
          },
        },
      },

      MuiDivider: {
        styleOverrides: { root: { borderColor: L(0.25) } },
      },

      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: R.alert, fontSize: '0.9rem', fontWeight: 500 },
          standardSuccess: { backgroundColor: '#E6F0E0', color: '#3D5A2E', border: '1px solid #A3BD95' },
          standardError: { backgroundColor: '#FAE8E4', color: '#8B3A30', border: '1px solid #DBA89D' },
          standardWarning: { backgroundColor: '#FDF0DC', color: '#8B6914', border: '1px solid #E8CCAE' },
          standardInfo: { backgroundColor: '#E8F0F2', color: '#3D5A63', border: '1px solid #B3C5C7' },
          filledSuccess: { backgroundColor: '#7D9B6C', color: '#fff' },
          filledError: { backgroundColor: '#C2857A', color: '#fff' },
          filledWarning: { backgroundColor: '#D4A574', color: '#fff' },
          filledInfo: { backgroundColor: '#8BA0A3', color: '#fff' },
        },
      },

      MuiSnackbar: {
        styleOverrides: { root: {} },
      },

      MuiPagination: {
        styleOverrides: {
          root: {
            '& .MuiPaginationItem-root': {
              borderRadius: R.pagination,
              '&.Mui-selected': natural
                ? { backgroundColor: t.primary, color: onColor(t.primary, t.dark) }
                : { backgroundColor: t.primaryFill, color: t.onPrimary },
            },
          },
        },
      },

      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: natural ? t.primaryLight : t.uiBorder,
            '&.Mui-checked': { color: natural ? t.primary : t.primaryText },
          },
        },
      },
    },
  };

  if (natural) return createTheme(base);
  if (look.dark) {
    // Zona clara dentro del panel oscuro (hoja para imprimir…): className="studio-light".
    // Tonos claros clásicos, pero con el primario oscurecido hasta leerse sobre
    // blanco (un lima o un rosa neón no se leen en papel).
    const nt = studioTones(site, { style: 'natural', icons: 'classic', dark: false });
    const ink = studioTones(site, { style: 'minimal', icons: 'classic', dark: false }).primaryText;
    const sheet: Tones = {
      ...nt, primary: ink, primaryLight: lighten(ink, 0.3), primaryPale: lighten(ink, 0.55),
      primaryShade: darken(ink, 0.12), primaryDark: darken(ink, 0.22), primaryDeep: darken(ink, 0.32),
      line: mix(ink, nt.bg, 0.25), primaryText: ink, primaryFill: ink, onPrimary: bestOn(ink, '#ffffff', nt.dark),
    };
    const light = cssVariables(sheet, heading, body, naturalTokens(sheet), { style: 'natural', icons: 'classic', dark: false })
      .replace(':root {', '.studio-light { color-scheme: light; color: var(--studio-dark);');
    (base.components!.MuiCssBaseline as { styleOverrides: string }).styleOverrides += `\n          ${light}\n`;
  }
  // Los estilos «de trabajo»: su ficha y sus detalles se suman (deep merge) al
  // tema base. La paleta va antes de crear el tema (MUI calcula con ella los
  // tonos claros/oscuros y el texto encima de cada color) y el CSS global de
  // cada capa se concatena (styleOverrides de CssBaseline es texto).
  const layers: ThemeOptions[] = [];
  if (look.dark) layers.push(darkBase(t, look.style === 'neon'));
  if (spec.extra) layers.push(spec.extra(t, tk, { heading, body }));
  for (const l of layers) base.palette = { ...base.palette, ...l.palette };
  const css = [base, ...layers]
    .map((o) => o.components?.MuiCssBaseline?.styleOverrides)
    .filter((c): c is string => typeof c === 'string')
    .join('\n');
  const rest = layers.map(({ palette: _p, components, ...o }) => {
    const { MuiCssBaseline: _c, ...others } = components || {};
    return { ...o, components: others };
  });
  const theme = createTheme(base, ...rest);
  theme.components = { ...theme.components, MuiCssBaseline: { styleOverrides: css } };
  return theme;
}
