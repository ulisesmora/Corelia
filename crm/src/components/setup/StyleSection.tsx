import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, FormControlLabel, Paper, Stack, Switch, TextField,
  ThemeProvider, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useNotify } from '../guide';
import { useSite } from '../../site/SiteProvider';
import { normalizeSiteConfig } from '../../site/siteConfig';
import StudioIcon from '../../site/StudioIcon';
import { buildTheme, panelTokens } from '../../theme';
import { saveSettings } from './api';
import { FaBell, FaCalendarAlt, FaHeart, FaMapMarkerAlt, FaUser } from 'react-icons/fa';
import { LuBell, LuCalendar, LuHeart, LuMapPin, LuUser } from 'react-icons/lu';
import { PiBellLight, PiCalendarBlankLight, PiHeartLight, PiMapPinLight, PiUserLight } from 'react-icons/pi';
import type { StudioSettings } from './api';
import {
  colorsFromImage, contrast, FONT_PAIRS, ICON_STYLES, loadGoogleFonts, PALETTES, paletteFromColor,
  STYLE_PRESETS, styleById, type IconStyleId, type StylePreset,
} from './presets';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  /** Sin la maqueta «Así se verá» del final (la guía la enseña al lado) */
  hidePreview?: boolean;
}

type ColorKey = 'color_primary' | 'color_secondary' | 'color_dark' | 'color_background';
type IconComp = React.ComponentType<{ size?: number }>;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const same = (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase();

// Iconos de muestra de cada familia: calendario, persona, ubicación, aviso, favorito
const ICON_SAMPLES: Record<IconStyleId, IconComp[]> = {
  line: [LuCalendar, LuUser, LuMapPin, LuBell, LuHeart],
  soft: [PiCalendarBlankLight, PiUserLight, PiMapPinLight, PiBellLight, PiHeartLight],
  solid: [FaCalendarAlt, FaUser, FaMapMarkerAlt, FaBell, FaHeart],
};

/** Estilo, iconos, colores y tipografía de la web, con vista previa en vivo. */
export default function StyleSection({ value, onChange, hidePreview }: Props) {
  const [justPicked, setJustPicked] = useState<StylePreset | null>(null);
  const [baseColor, setBaseColor] = useState(value.color_primary);
  const [logoColors, setLogoColors] = useState<string[] | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    loadGoogleFonts([value.font_heading, value.font_body, ...FONT_PAIRS.flatMap((f) => [f.heading, f.body]),
      ...STYLE_PRESETS.flatMap((s) => [s.fonts.heading, s.fonts.body])]);
  }, [value.font_heading, value.font_body]);

  const style = styleById(value.style_preset);

  const pickStyle = (s: StylePreset) => {
    onChange({ style_preset: s.id });
    setJustPicked(s);
  };

  const applyStyleLook = (s: StylePreset) => {
    onChange({
      color_primary: s.palette.primary, color_secondary: s.palette.secondary,
      color_dark: s.palette.dark, color_background: s.palette.background,
      font_heading: s.fonts.heading, font_body: s.fonts.body,
    });
    setJustPicked(null);
  };

  const setPalette = (p: { primary: string; secondary: string; dark: string; background: string }) =>
    onChange({ color_primary: p.primary, color_secondary: p.secondary, color_dark: p.dark, color_background: p.background });

  const extractFromLogo = async () => {
    if (!value.logo_url) return;
    setLogoBusy(true);
    try {
      setLogoColors(await colorsFromImage(value.logo_url));
    } catch {
      setLogoColors([]);
    } finally {
      setLogoBusy(false);
    }
  };

  // Avisos de legibilidad (WCAG: 4,5 para texto normal, 3 para botones)
  const warnings: string[] = [];
  if (HEX.test(value.color_primary) && contrast('#FFFFFF', value.color_primary) < 3 && contrast('#111111', value.color_primary) < 4.5) {
    warnings.push('El texto de los botones se lee mal sobre el color principal. Prueba un tono más oscuro o más claro.');
  }
  if (!style.dark && HEX.test(value.color_dark) && HEX.test(value.color_background)
    && contrast(value.color_dark, value.color_background) < 4.5) {
    warnings.push('El color oscuro (textos) y el fondo se parecen demasiado: los textos costarán de leer.');
  }
  if (style.dark && HEX.test(value.color_background) && contrast('#FFFFFF', value.color_background) < 4.5) {
    warnings.push(`«${style.name}» es un estilo oscuro: el fondo debería ser oscuro para que el texto claro se lea. Pulsa «Aplicar» arriba o elige un fondo más oscuro.`);
  }

  const colorField = (key: ColorKey, label: string, help: string) => (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 260 }}>
      <Box
        component="input" type="color" value={HEX.test(value[key]) ? value[key] : '#000000'}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value.toUpperCase() })}
        aria-label={label}
        sx={{ width: 52, height: 52, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, cursor: 'pointer', background: 'none', flexShrink: 0 }}
      />
      <Box sx={{ flex: 1 }}>
        <Typography fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{help}</Typography>
      </Box>
      <TextField
        size="small" value={value[key]} sx={{ width: 110 }} inputProps={{ 'aria-label': `${label} (código)`, maxLength: 7 }}
        onChange={(e) => {
          let v = e.target.value.trim();
          if (!v.startsWith('#')) v = `#${v}`;
          onChange({ [key]: v.toUpperCase() });
        }}
        error={!HEX.test(value[key])}
      />
    </Stack>
  );

  return (
    <Stack spacing={5}>
      {/* ── Estilo ── */}
      <Box>
        <Typography variant="h6" gutterBottom>Estilo de tu web</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Cambia el aspecto de toda la web (tarjetas, botones, bordes, claro u oscuro) sin cambiar lo que hay en ella.
        </Typography>
        {(['calma', 'tendencia'] as const).map((family) => (
          <Box key={family} sx={{ mb: 2.5 }}>
            <Typography variant="overline" color="text.secondary">
              {family === 'calma' ? 'Calma — serenos y atemporales' : 'Tendencia 2026 — con personalidad'}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5, mt: 0.5 }}>
              {STYLE_PRESETS.filter((s) => s.family === family).map((s) => (
                <StyleCard key={s.id} preset={s} selected={s.id === style.id} onClick={() => pickStyle(s)} />
              ))}
            </Box>
          </Box>
        ))}
        {justPicked && !(same(justPicked.palette.primary, value.color_primary) && justPicked.fonts.heading === value.font_heading) && (
          <Alert
            severity="info" icon={<AutoFixHighIcon />}
            action={<Button color="inherit" variant="outlined" size="small" onClick={() => applyStyleLook(justPicked)}>Aplicar</Button>}
          >
            ¿Usar también los colores y la letra con los que mejor luce <b>{justPicked.name}</b>? Podrás cambiarlos después.
          </Alert>
        )}
        <PanelStyleSwitch value={value} onChange={onChange} />
      </Box>

      {/* ── Iconos ── */}
      <Box>
        <Typography variant="h6" gutterBottom>Iconos</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {ICON_STYLES.map((ic) => {
            const selected = (value.icon_style || 'line') === ic.id;
            return (
              <ButtonBase key={ic.id} onClick={() => onChange({ icon_style: ic.id })} aria-pressed={selected}
                sx={{ display: 'block', textAlign: 'left', p: 2, borderRadius: 3, border: '2px solid', borderColor: selected ? 'primary.main' : 'divider' }}>
                <Stack direction="row" spacing={1.5} sx={{ color: 'primary.main', mb: 1 }}>
                  {ICON_SAMPLES[ic.id].map((I, i) => <I key={i} size={24} />)}
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography fontWeight={700}>{ic.name}</Typography>
                  {selected && <CheckCircleIcon fontSize="small" color="primary" />}
                </Stack>
                <Typography variant="body2" color="text.secondary">{ic.description}</Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      {/* ── Colores ── */}
      <Box>
        <Typography variant="h6" gutterBottom>Colores</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Elige una combinación lista, crea la tuya a partir de un color o ajusta cada color como quieras.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {PALETTES.map((p) => {
            const selected = same(p.primary, value.color_primary) && same(p.dark, value.color_dark);
            return (
              <ButtonBase key={p.name} onClick={() => setPalette(p)} aria-pressed={selected}
                sx={{ display: 'block', textAlign: 'left', borderRadius: 3, p: 1.5, border: '2px solid', borderColor: selected ? p.dark : 'divider', bgcolor: p.background, minHeight: 44 }}>
                <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
                  {[p.primary, p.secondary, p.dark].map((c) => <Box key={c} sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c }} />)}
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography fontWeight={600} sx={{ color: p.dark }}>{p.name}</Typography>
                  {selected && <CheckCircleIcon fontSize="small" sx={{ color: p.dark }} />}
                </Stack>
              </ButtonBase>
            );
          })}
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 3 }}>
          <Box sx={{ flex: 1, p: 2, borderRadius: 3, border: '1px dashed', borderColor: 'divider' }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>Crear mi paleta desde un color</Typography>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box component="input" type="color" value={HEX.test(baseColor) ? baseColor : '#A0897C'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseColor(e.target.value.toUpperCase())}
                aria-label="Color de tu marca"
                sx={{ width: 48, height: 48, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, cursor: 'pointer', background: 'none' }} />
              <Button variant="outlined" onClick={() => setPalette(paletteFromColor(baseColor))}>Generar los 4 colores</Button>
            </Stack>
          </Box>
          <Box sx={{ flex: 1, p: 2, borderRadius: 3, border: '1px dashed', borderColor: 'divider' }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>Sacar los colores de mi logo</Typography>
            {value.logo_url ? (
              <>
                <Button variant="outlined" onClick={extractFromLogo} disabled={logoBusy}
                  startIcon={logoBusy ? <CircularProgress size={16} /> : undefined}>
                  Buscar colores en el logo
                </Button>
                {logoColors && logoColors.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No he encontrado colores claros en el logo.</Typography>
                )}
                {logoColors && logoColors.length > 0 && (
                  <>
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                      {logoColors.map((c) => (
                        <Chip key={c} label={c} onClick={() => setPalette(paletteFromColor(c))}
                          sx={{ bgcolor: c, color: contrast('#FFFFFF', c) > 3 ? '#fff' : '#111', fontWeight: 700 }} />
                      ))}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">Pulsa un color para crear la paleta a partir de él.</Typography>
                  </>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">Sube tu logo en «Mi estudio» y podrás usar sus colores.</Typography>
            )}
          </Box>
        </Stack>

        <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 3 }}>
          {colorField('color_primary', 'Principal', 'Botones y detalles')}
          {colorField('color_secondary', 'Secundario', 'Enlaces y acentos')}
          {colorField('color_dark', 'Oscuro', style.dark ? 'Menú y pie (lo más oscuro)' : 'Textos y títulos')}
          {colorField('color_background', 'Fondo', style.dark ? 'Fondo de la web (oscuro)' : 'Color de fondo')}
        </Stack>
        {warnings.map((w) => <Alert key={w} severity="warning" sx={{ mt: 2 }}>{w}</Alert>)}
      </Box>

      {/* ── Tipografía ── */}
      <Box>
        <Typography variant="h6" gutterBottom>Tipografía</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {FONT_PAIRS.map((f) => {
            const selected = f.heading === value.font_heading && f.body === value.font_body;
            return (
              <ButtonBase key={f.name} onClick={() => onChange({ font_heading: f.heading, font_body: f.body })} aria-pressed={selected}
                sx={{ display: 'block', textAlign: 'left', borderRadius: 3, p: 2, border: '2px solid', borderColor: selected ? 'primary.main' : 'divider' }}>
                <Typography sx={{ fontFamily: `"${f.heading}", serif`, fontSize: '1.5rem', lineHeight: 1.2 }}>{f.name}</Typography>
                <Typography variant="body2" sx={{ fontFamily: `"${f.body}", sans-serif`, color: 'text.secondary' }}>{f.description}</Typography>
              </ButtonBase>
            );
          })}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField label="Fuente de títulos" value={value.font_heading} fullWidth
            onChange={(e) => onChange({ font_heading: e.target.value })}
            helperText="Cualquier fuente de fonts.google.com, escrita igual." />
          <TextField label="Fuente del texto" value={value.font_body} fullWidth onChange={(e) => onChange({ font_body: e.target.value })} />
        </Stack>
      </Box>

      {!hidePreview && (
        <Box>
          <Typography variant="h6" gutterBottom>Así se verá</Typography>
          <StylePreview value={value} />
        </Box>
      )}
    </Stack>
  );
}

/** Miniatura de un estilo con su propia paleta recomendada. */
function StyleCard({ preset, selected, onClick }: { preset: StylePreset; selected: boolean; onClick: () => void }) {
  const { palette: p, look, fonts } = preset;
  const bg = p.background;
  const text = preset.dark ? '#F5F5F5' : p.dark;
  return (
    <ButtonBase onClick={onClick} aria-pressed={selected} aria-label={`Estilo ${preset.name}`}
      sx={{ display: 'block', textAlign: 'left', borderRadius: 3, overflow: 'hidden', border: '3px solid', borderColor: selected ? 'primary.main' : 'transparent', boxShadow: 1 }}>
      <Box sx={{
        height: 96, p: 1.25, bgcolor: bg, position: 'relative',
        ...(preset.id === 'neon' && { backgroundImage: `linear-gradient(${p.primary}22 1px, transparent 1px), linear-gradient(90deg, ${p.primary}22 1px, transparent 1px)`, backgroundSize: '12px 12px' }),
        ...(preset.id === 'glass' && { background: `radial-gradient(circle at 15% 20%, ${p.secondary}88, transparent 55%), ${p.background}` }),
        ...(preset.id === 'pop' && { background: `radial-gradient(circle at 85% 15%, ${p.secondary}44, transparent 45%), ${p.background}` }),
      }}>
        <Box sx={{
          bgcolor: look.surface, border: look.border, borderRadius: `${Math.min(look.radius, 16)}px`, boxShadow: look.shadow,
          p: 1, height: '100%', boxSizing: 'border-box', ...(look.blur && { backdropFilter: 'blur(6px)' }),
          ...(preset.id === 'energy' && { clipPath: 'polygon(0 0, 100% 0, 100% 80%, 90% 100%, 0 100%)' }),
        }}>
          <Typography sx={{
            fontFamily: `"${fonts.heading}", sans-serif`, fontWeight: 700, color: text, fontSize: '1rem', lineHeight: 1.1,
            textTransform: look.upper ? 'uppercase' : 'none', ...(look.glow && { textShadow: `0 0 8px ${p.primary}` }),
          }}>
            Pilates
          </Typography>
          <Box sx={{
            mt: 1, display: 'inline-block', px: 1.2, py: 0.4, fontSize: '0.7rem', fontWeight: 700,
            fontFamily: `"${fonts.body}", sans-serif`, bgcolor: p.primary,
            color: contrast('#FFFFFF', p.primary) > 3 ? '#fff' : '#111',
            borderRadius: ['brutalist', 'editorial', 'energy'].includes(preset.id) ? '2px' : '999px',
            border: preset.id === 'brutalist' ? '2px solid #111' : 'none',
            boxShadow: preset.id === 'brutalist' ? '2px 2px 0 #111' : look.glow ? `0 0 10px ${p.primary}` : 'none',
            textTransform: look.upper ? 'uppercase' : 'none',
          }}>
            Reservar
          </Box>
        </Box>
      </Box>
      <Box sx={{ p: 1.25, bgcolor: 'background.paper' }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography fontWeight={700}>{preset.name}</Typography>
          {preset.dark && <Chip label="Oscuro" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
          {selected && <CheckCircleIcon fontSize="small" color="primary" />}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>{preset.description}</Typography>
      </Box>
    </ButtonBase>
  );
}

/** Maqueta de la web con el estilo, los colores, las fuentes y los iconos elegidos. */
export function StylePreview({ value }: { value: StudioSettings }) {
  const style = styleById(value.style_preset);
  const { look } = style;
  const heading = `"${value.font_heading}", serif`;
  const body = `"${value.font_body}", sans-serif`;
  const pageBg = value.color_background;
  const text = style.dark ? '#F3F3F3' : value.color_dark;
  const surface = style.dark ? 'rgba(255,255,255,0.06)' : look.surface;
  const accent = style.dark ? value.color_primary : value.color_secondary;
  const btnRadius = ['brutalist', 'editorial', 'energy'].includes(style.id) ? '4px' : '999px';
  const [CalendarIcon, UserIcon, PinIcon] = ICON_SAMPLES[(value.icon_style as IconStyleId) || 'line'];
  const upper = look.upper ? 'uppercase' : 'none';
  return (
    <Box sx={{
      borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: pageBg, fontFamily: body,
      ...(style.id === 'neon' && { backgroundImage: `linear-gradient(${value.color_primary}18 1px, transparent 1px), linear-gradient(90deg, ${value.color_primary}18 1px, transparent 1px)`, backgroundSize: '24px 24px' }),
      ...(style.id === 'glass' && { background: `radial-gradient(circle at 20% 10%, ${value.color_secondary}55, transparent 50%), ${value.color_background}` }),
    }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center"
        sx={{ px: 3, py: 1.5, bgcolor: style.dark ? value.color_dark : surface, borderBottom: style.id === 'brutalist' ? '3px solid #111' : 'none', ...(look.blur && { backdropFilter: 'blur(10px)' }) }}>
        {value.logo_url ? (
          <Box component="img" src={value.logo_url} alt="" sx={{ maxHeight: 36, maxWidth: 160 }} />
        ) : (
          <Typography sx={{ fontFamily: heading, fontWeight: 700, color: text, fontSize: '1.2rem', textTransform: upper }}>
            {value.studio_name || 'Mi Estudio'}
          </Typography>
        )}
        <Stack direction="row" spacing={1.5} sx={{ color: accent }}>
          <CalendarIcon size={20} />
          <UserIcon size={20} />
        </Stack>
      </Stack>
      <Box sx={{ px: 3, py: 4 }}>
        <Typography sx={{
          fontFamily: heading, color: text, fontSize: { xs: '1.8rem', sm: '2.4rem' }, lineHeight: 1.1, fontWeight: 700,
          textTransform: upper, ...(look.glow && { textShadow: `0 0 18px ${value.color_primary}` }),
        }}>
          {value.hero_title || value.tagline || 'Muévete mejor, siéntete mejor'}
        </Typography>
        <Typography sx={{ fontFamily: body, color: text, opacity: 0.75, mt: 1.5, maxWidth: 480 }}>
          Reserva tu clase en segundos y recibe un aviso antes de empezar.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
          <Box sx={{
            fontFamily: body, bgcolor: value.color_primary, color: contrast('#FFFFFF', value.color_primary) > 3 ? '#fff' : '#111',
            px: 3, py: 1.2, borderRadius: btnRadius, fontWeight: 700, textTransform: upper,
            border: style.id === 'brutalist' ? '3px solid #111' : 'none',
            boxShadow: style.id === 'brutalist' ? '4px 4px 0 #111' : look.glow ? `0 0 16px ${value.color_primary}` : 'none',
          }}>
            Reservar clase
          </Box>
          <Box sx={{ fontFamily: body, border: `2px solid ${accent}`, color: accent, px: 3, py: 1, borderRadius: btnRadius, fontWeight: 700, textTransform: upper }}>
            Ver precios
          </Box>
        </Stack>
        <Box sx={{
          mt: 4, bgcolor: surface, borderRadius: `${look.radius}px`, p: 2, maxWidth: 360, border: look.border, boxShadow: look.shadow,
          ...(look.blur && { backdropFilter: 'blur(12px)' }),
          ...(style.id === 'energy' && { clipPath: 'polygon(0 0, 100% 0, 100% 80%, 94% 100%, 0 100%)' }),
        }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: value.color_primary, mb: 0.5 }}>
            <CalendarIcon size={18} />
            <Typography sx={{ fontFamily: heading, color: text, fontWeight: 700, textTransform: upper }}>Pilates Mat</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: text, opacity: 0.75 }}>
            <PinIcon size={16} />
            <Typography variant="body2" sx={{ fontFamily: body }}>Lunes · 09:30 · 4 plazas libres</Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * «Panel con el estilo de mi web»: se guarda al momento (como los demás
 * interruptores) y el panel cambia sin recargar (SiteProvider.refresh()).
 */
function PanelStyleSwitch({ value, onChange }: Props) {
  const site = useSite();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const follows = value.panel_follows_style !== false;

  const toggle = async (next: boolean) => {
    setBusy(true);
    onChange({ panel_follows_style: next });
    try {
      await saveSettings({ panel_follows_style: next });
      await site.refresh();
      notify(next ? 'Guardado ✓ El panel ya usa el estilo de tu web.' : 'Guardado ✓ El panel vuelve a su aspecto clásico.');
    } catch (e) {
      onChange({ panel_follows_style: !next });
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}
      sx={{ mt: 2, p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <FormControlLabel
          control={<Switch checked={follows} disabled={busy} onChange={(e) => toggle(e.target.checked)} />}
          label={<Typography fontWeight={700}>Panel con el estilo de mi web</Typography>}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Este panel de trabajo usa también el estilo y los iconos de tu web (y el modo oscuro si tu estilo es oscuro).
          Apágalo para verlo con su aspecto clásico.
        </Typography>
      </Box>
      <PanelPreview value={value} follows={follows} />
    </Stack>
  );
}

/** Maqueta pequeña del panel con el estilo, los colores y los iconos elegidos (aún sin guardar). */
function PanelPreview({ value, follows }: { value: StudioSettings; follows: boolean }) {
  const { config } = useSite();
  const site = useMemo(() => normalizeSiteConfig({
    ...config,
    theme: {
      primary: value.color_primary, secondary: value.color_secondary, dark: value.color_dark,
      background: value.color_background, font_heading: value.font_heading, font_body: value.font_body,
      style: value.style_preset, icons: value.icon_style, panel_follows_style: follows,
    },
  }), [config, value.color_primary, value.color_secondary, value.color_dark, value.color_background,
    value.font_heading, value.font_body, value.style_preset, value.icon_style, follows]);
  const theme = useMemo(() => buildTheme(site), [site]);
  const { look, tones, tokens } = useMemo(() => panelTokens(site), [site]);

  return (
    <ThemeProvider theme={theme}>
      <Box
        role="img"
        aria-label={follows ? 'Vista previa del panel con el estilo de tu web' : 'Vista previa del panel con su aspecto clásico'}
        sx={{
          width: { xs: '100%', sm: 280 }, height: 168, flexShrink: 0, display: 'flex', overflow: 'hidden',
          borderRadius: 2, border: '1px solid', borderColor: 'divider', background: tokens.body,
          backgroundColor: tones.bg, color: 'text.primary', fontFamily: 'var(--studio-font-body)',
        }}
      >
        <Stack spacing={1.5} alignItems="center" sx={{
          width: 44, py: 1.5, background: tokens.drawerBg, borderRight: tokens.drawerBorder, color: tones.textHint,
        }}>
          <StudioIcon name="home" iconStyle={look.icons} sx={{ fontSize: 18, color: tones.primaryText }} />
          <StudioIcon name="bookings" iconStyle={look.icons} sx={{ fontSize: 18 }} />
          <StudioIcon name="clients" iconStyle={look.icons} sx={{ fontSize: 18 }} />
          <StudioIcon name="schedule" iconStyle={look.icons} sx={{ fontSize: 18 }} />
        </Stack>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ height: 26, background: tokens.appBarBg, borderBottom: tokens.appBarBorder, ...(look.style === 'energy' && { borderImage: `linear-gradient(100deg, ${tones.primary}, ${tones.secondary}) 1` }) }} />
          <Box sx={{ p: 1.25 }}>
            <Typography variant="h1" sx={{ fontSize: '1rem !important', mb: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Reservas
            </Typography>
            <Paper elevation={1} sx={{ p: 1.25 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
                <StudioIcon name="today" iconStyle={look.icons} sx={{ fontSize: 16, color: tones.primaryText }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>Pilates · 09:30</Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Button variant="contained" size="small" tabIndex={-1} sx={{ px: 1.25, py: 0.25, minWidth: 0, fontSize: '0.68rem', pointerEvents: 'none' }}>
                  Apuntar
                </Button>
                <Chip label="4 plazas" size="small" color="success" sx={{ height: 20, fontSize: '0.66rem' }} />
              </Stack>
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
