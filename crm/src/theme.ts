import { createTheme, darken, getContrastRatio, hexToRgb, lighten, decomposeColor, type Theme } from '@mui/material/styles';
import { DEFAULT_SITE_CONFIG, type SiteConfigPublic } from './site/siteConfig';

// ====================================================================
// Tema del panel construido con los colores y fuentes del estudio.
//
// Además del tema de MUI, publica unas variables CSS en :root para usarlas en
// cualquier sitio (sx, style, gradientes, CSS de react-big-calendar…):
//
//   var(--studio-primary)          color principal
//   rgb(var(--studio-primary-rgb) / 0.1)   el mismo con transparencia
//   --studio-primary-light / -shade / -dark / -deep   tonos del principal
//   --studio-secondary, --studio-dark (texto), --studio-bg (fondo)
//   --studio-text-strong / -body / -muted / -hint / -faint   tonos de texto
//   --studio-bg-light / --studio-bg-deep   cremas más claro / más oscuro
//   --studio-line-rgb                bordes y separadores (con alpha)
//   --studio-font-heading / --studio-font-body   familias tipográficas
//
// Todas las variables de color tienen su versión `-rgb` ("r g b").
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

/** Texto legible encima de un color: blanco si contrasta, si no el oscuro. */
const onColor = (bg: string, dark: string) => (getContrastRatio(bg, '#fff') >= 3 ? '#fff' : dark);

/** Pila de fuentes con alternativas del sistema. */
export const headingStack = (font: string) => `"${font}", Georgia, serif`;
export const bodyStack = (font: string) => `"${font}", system-ui, -apple-system, sans-serif`;

/** Todos los tonos derivados de los 4 colores del estudio. */
export function studioTones(site: SiteConfigPublic = DEFAULT_SITE_CONFIG) {
  const { primary, secondary, dark, background } = site.theme;
  const P = toHex(primary);
  const D = toHex(dark);
  const B = toHex(background);
  return {
    primary: P,
    primaryLight: lighten(P, 0.3),
    primaryPale: lighten(P, 0.55),
    primaryHover: lighten(P, 0.1),
    primaryShade: darken(P, 0.12),
    primaryDark: darken(P, 0.22),
    primaryDeep: darken(P, 0.32),
    secondary: toHex(secondary),
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
  };
}

export type StudioTones = ReturnType<typeof studioTones>;

/** Bloque `:root { --studio-…: … }` con los tonos y las fuentes. */
function cssVariables(t: StudioTones, heading: string, body: string): string {
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
  return `:root { ${lines.join(' ')} }`;
}

export function buildTheme(site: SiteConfigPublic = DEFAULT_SITE_CONFIG): Theme {
  const t = studioTones(site);
  const heading = headingStack(site.theme.font_heading);
  const body = bodyStack(site.theme.font_body);
  const rgb = (c: string, a: number) => `rgb(${channels(c)} / ${a})`;
  const P = (a: number) => rgb(t.primary, a);
  const D = (a: number) => rgb(t.dark, a);
  const L = (a: number) => rgb(t.line, a);

  return createTheme({
    palette: {
      primary: {
        main: t.primary,
        light: t.primaryLight,
        dark: t.primaryDark,
        contrastText: onColor(t.primary, t.dark),
      },
      secondary: {
        main: t.secondary,
        light: lighten(t.secondary, 0.3),
        dark: darken(t.secondary, 0.2),
        contrastText: onColor(t.secondary, t.dark),
      },
      background: {
        default: t.bg,
        paper: 'rgba(255, 255, 255, 0.65)',
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
        color: t.textFaint,
      },
    },
    shape: { borderRadius: 16 },
    spacing: 8,

    components: {
      MuiCssBaseline: {
        styleOverrides: `
          ${cssVariables(t, heading, body)}
          body {
            background: linear-gradient(135deg, ${t.bg} 0%, ${t.bgDeep} 40%, ${t.bgMid} 100%);
            -webkit-font-smoothing: antialiased;
          }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${P(0.3)}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: ${P(0.5)}; }
        `,
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.6)',
          },
          elevation0: {
            boxShadow: 'none',
          },
          elevation1: {
            boxShadow: `0 1px 4px ${D(0.04)}, 0 1px 2px ${D(0.03)}`,
          },
          elevation2: {
            boxShadow: `0 3px 12px ${D(0.05)}, 0 1px 4px ${D(0.03)}`,
          },
          elevation3: {
            boxShadow: `0 6px 24px ${D(0.06)}, 0 2px 6px ${D(0.03)}`,
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: `0 1px 3px ${D(0.05)}`,
            borderBottom: '1px solid rgba(255,255,255,0.6)',
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            border: 'none',
            background: `linear-gradient(180deg, rgba(255,255,255,0.7) 0%, ${rgb(t.bgLight, 0.8)} 100%)`,
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRight: '1px solid rgba(255,255,255,0.6)',
          },
        },
      },

      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
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
          sizeSmall: { padding: '6px 16px', fontSize: '0.8rem', borderRadius: 10 },
        },
        defaultProps: { disableElevation: true },
      },

      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.5)',
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
            color: t.primary,
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
          root: { fontWeight: 500, fontSize: '0.78rem', borderRadius: 9 },
          colorSuccess: { backgroundColor: 'rgba(125,155,108,0.12)', color: '#5E7A4D' },
          colorError: { backgroundColor: 'rgba(194,133,122,0.12)', color: '#A86B5E' },
          colorWarning: { backgroundColor: 'rgba(212,165,116,0.12)', color: '#B8883C' },
          colorInfo: { backgroundColor: 'rgba(139,160,163,0.12)', color: '#6B8589' },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 22,
            boxShadow: `0 16px 60px ${D(0.12)}`,
            backgroundColor: 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(28px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.6)',
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
              borderRadius: 13,
              backgroundColor: 'rgba(255,255,255,0.5)',
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
            borderRadius: 13,
            backgroundColor: 'rgba(255,255,255,0.5)',
          },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          root: {
            '& .MuiSwitch-switchBase.Mui-checked': { color: t.primary },
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
            '&.Mui-selected': { color: t.primary },
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: D(0.88),
            backdropFilter: 'blur(10px)',
            borderRadius: 10,
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
            borderRadius: 14,
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
          root: { borderRadius: 14, fontSize: '0.9rem', fontWeight: 500 },
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
              borderRadius: 10,
              '&.Mui-selected': { backgroundColor: t.primary, color: onColor(t.primary, t.dark) },
            },
          },
        },
      },

      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: t.primaryLight,
            '&.Mui-checked': { color: t.primary },
          },
        },
      },
    },
  });
}
