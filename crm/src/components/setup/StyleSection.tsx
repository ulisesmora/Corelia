import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, Collapse, FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useNotify } from '../guide';
import { useSite } from '../../site/SiteProvider';
import StudioIcon from '../../site/StudioIcon';
import { loadPreviewFonts } from '../../site/fonts';
import { styleShape } from '../../theme';
import {
  SINGLE_WEIGHT_FONTS, STYLE_ORDER, colorsFromBrand, fontPairBySlug, fontPairsFor, headingWeight, isDarkStyle, palettesFor,
  pickCustomColors, pickFontPair, pickPalette, pickStyle, sameColor, sideOf, styleEntry, themeTokens,
  type PaletteTokens, type SiteColors,
} from '../../design/tokens';
import type { StyleId } from '../../site/siteConfig';
import { saveSettings } from './api';
import type { StudioSettings } from './api';
import { FaBell, FaCalendarAlt, FaHeart, FaMapMarkerAlt, FaUser } from 'react-icons/fa';
import { LuBell, LuCalendar, LuHeart, LuMapPin, LuUser } from 'react-icons/lu';
import { PiBellLight, PiCalendarBlankLight, PiHeartLight, PiMapPinLight, PiUserLight } from 'react-icons/pi';
import { colorsFromImage, ICON_STYLES, type IconStyleId } from './presets';

// ====================================================================
// «Tu estilo» (asistente de bienvenida, guía de puesta en marcha y Ajustes →
// Aspecto): estilo con miniatura, 10 paletas, 3 parejas de letra, iconos y
// vista previa en directo de la web y del panel. Las paletas y la letra salen
// de src/design/palettes.json (mismo origen que la web y el API). Los colores
// propios se corrigen para que se lean (igual que al guardar en el API).
// ====================================================================

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  /** Sin la vista previa (la guía la enseña al lado) */
  hidePreview?: boolean;
}

type IconComp = React.ComponentType<{ size?: number }>;
const HEX = /^#[0-9A-Fa-f]{6}$/;

// Iconos de muestra de cada familia: calendario, persona, ubicación, aviso, favorito
const ICON_SAMPLES: Record<IconStyleId, IconComp[]> = {
  line: [LuCalendar, LuUser, LuMapPin, LuBell, LuHeart],
  soft: [PiCalendarBlankLight, PiUserLight, PiMapPinLight, PiBellLight, PiHeartLight],
  solid: [FaCalendarAlt, FaUser, FaMapMarkerAlt, FaBell, FaHeart],
};

const colorsOf = (v: StudioSettings): SiteColors => ({
  primary: v.color_primary, secondary: v.color_secondary, dark: v.color_dark, background: v.color_background,
});

/** Tokens de lo que se está eligiendo (aún sin guardar). */
function previewTokens(v: StudioSettings): PaletteTokens {
  const ok = [v.color_primary, v.color_secondary, v.color_dark, v.color_background].every((c) => HEX.test(c || ''));
  const colors = ok ? colorsOf(v) : palettesFor(v.style_preset)[0].fields;
  return themeTokens({ style: v.style_preset, palette: v.palette, ...colors }).tokens;
}

const sectionTitle = (id: string, text: string, extra?: ReactNode) => (
  <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.25 }}>
    <Typography id={id} component="h2" sx={{ fontFamily: 'var(--studio-font-body)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--studio-ink)' }}>{text}</Typography>
    {extra}
  </Stack>
);

const pressedRing = {
  borderColor: 'var(--studio-primary-fill)',
  boxShadow: '0 0 0 3px var(--studio-p-soft)',
};

export default function StyleSection({ value, onChange, hidePreview }: Props) {
  const style = (value.style_preset || 'natural') as StyleId;
  const custom = !value.palette;
  const pairs = fontPairsFor(style);
  const [customOpen, setCustomOpen] = useState(custom);
  const [fontsOpen, setFontsOpen] = useState(!value.font_pair);
  // Colores propios que tenía (para volver a ellos con «Mis colores»)
  const [ownColors, setOwnColors] = useState<SiteColors | null>(custom ? colorsOf(value) : null);
  const [brand, setBrand] = useState(value.color_primary);
  const [fixNote, setFixNote] = useState('');
  const [logoColors, setLogoColors] = useState<string[] | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    loadPreviewFonts([...pairs.flatMap((f) => [f.heading, f.body]), value.font_heading, value.font_body], SINGLE_WEIGHT_FONTS);
  }, [pairs, value.font_heading, value.font_body]);

  const chooseStyle = (s: StyleId) => {
    if (s === style) return;
    if (custom) setOwnColors(colorsOf(value));
    onChange(pickStyle(s, { palette: value.palette, font_pair: value.font_pair }));
    setFixNote('');
  };

  const choosePalette = (id: string) => {
    if (custom) setOwnColors(colorsOf(value));
    onChange(pickPalette(style, id));
    setCustomOpen(false);
    setFixNote('');
  };

  const applyCustom = (colors: SiteColors, why = '') => {
    const patch = pickCustomColors(style, colors);
    const { changed, ...fields } = patch;
    onChange(fields);
    setFixNote(changed ? why || 'Hemos ajustado un poco los tonos para que los textos y los botones se lean bien.' : '');
  };

  const chooseCustom = () => {
    setCustomOpen(true);
    if (!custom) applyCustom(ownColors || colorsFromBrand(style, value.color_primary));
  };

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

  const picker = (
    <Stack spacing={3.5} sx={{ minWidth: 0 }}>
      {/* ── Estilo ── */}
      <Box component="section" aria-labelledby="st-style">
        {sectionTitle('st-style', 'Estilo')}
        <Box role="group" aria-labelledby="st-style" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {STYLE_ORDER.map((s) => (
            <StyleCard key={s} style={s as StyleId} name={value.studio_name} selected={s === style} onClick={() => chooseStyle(s as StyleId)} />
          ))}
        </Box>
        <Typography sx={{ mt: 1, fontSize: '0.85rem', color: 'var(--studio-muted)' }}>
          {styleEntry(style).name}: {styleEntry(style).desc.toLowerCase()}{isDarkStyle(style) ? ' · fondo oscuro' : ''}. Cambia el acabado de tu web y de tu panel, no lo que hay en ellos.
        </Typography>
      </Box>

      {/* ── Colores ── */}
      <Box component="section" aria-labelledby="st-colors">
        {sectionTitle('st-colors', 'Colores', <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>10 paletas de {styleEntry(style).name}, todas legibles</Typography>)}
        <Box role="group" aria-labelledby="st-colors" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {palettesFor(style).map((p) => (
            <Swatch key={p.id} colors={[p.p, p.s, p.bg]} label={p.name} selected={value.palette === p.id} onClick={() => choosePalette(p.id)} />
          ))}
          <Swatch
            colors={custom ? [value.color_primary, value.color_secondary, value.color_background] : ownColors ? [ownColors.primary, ownColors.secondary, ownColors.background] : []}
            label="Mis colores"
            icon={<StudioIcon name="style" sx={{ fontSize: 18 }} />}
            selected={custom}
            onClick={chooseCustom}
          />
        </Box>
        <Collapse in={custom && customOpen} unmountOnExit>
          <Box sx={{ mt: 2, p: 2, borderRadius: 'var(--studio-radius-md)', border: '1px dashed var(--studio-border-strong)' }}>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Tu color de marca</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box component="input" type="color" value={HEX.test(brand) ? brand : '#A0897C'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBrand(e.target.value.toUpperCase())}
                  aria-label="Color de tu marca"
                  sx={{ width: 48, height: 48, p: 0, border: '1px solid var(--studio-border-strong)', borderRadius: 'min(var(--studio-radius-md), 12px)', cursor: 'pointer', background: 'none' }} />
                <TextField size="small" value={brand} sx={{ width: 120 }} inputProps={{ 'aria-label': 'Código del color de tu marca', maxLength: 7 }}
                  onChange={(e) => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = `#${v}`; setBrand(v.toUpperCase()); }}
                  error={!HEX.test(brand)} />
              </Stack>
              <Button variant="outlined" disabled={!HEX.test(brand)} onClick={() => applyCustom(colorsFromBrand(style, brand), `Partimos de ${brand} y lo hemos ajustado lo justo para que se lea sobre el fondo.`)}>
                Crear mis colores con este
              </Button>
            </Stack>
            {value.logo_url && (
              <Box sx={{ mt: 2 }}>
                <Button size="small" onClick={extractFromLogo} disabled={logoBusy} startIcon={logoBusy ? <CircularProgress size={14} /> : undefined}>
                  Sacar el color de mi logo
                </Button>
                {logoColors && logoColors.length === 0 && <Typography variant="body2" sx={{ mt: 1 }}>No he encontrado colores en el logo.</Typography>}
                {logoColors && logoColors.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    {logoColors.map((c) => (
                      <ButtonBase key={c} onClick={() => { setBrand(c); applyCustom(colorsFromBrand(style, c)); }} aria-label={`Usar ${c}`}
                        sx={{ width: 36, height: 36, borderRadius: '50%', background: c, border: '2px solid var(--studio-surf)', boxShadow: '0 0 0 1px var(--studio-border-strong)' }} />
                    ))}
                  </Stack>
                )}
              </Box>
            )}
            <AdvancedColors value={value} style={style} onChange={(colors) => applyCustom(colors)} />
          </Box>
        </Collapse>
        {fixNote && custom && <Alert severity="info" sx={{ mt: 1.5 }}>{fixNote}</Alert>}
      </Box>

      {/* ── Letra ── */}
      <Box component="section" aria-labelledby="st-fonts">
        {sectionTitle('st-fonts', 'Letra')}
        <Box role="group" aria-labelledby="st-fonts" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          {pairs.map((f) => (
            <ButtonBase
              key={f.id}
              onClick={() => { onChange(pickFontPair(style, f.id)); setFontsOpen(false); }}
              aria-pressed={value.font_pair === f.id}
              sx={{
                display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, alignItems: { xs: 'center', sm: 'flex-start' }, gap: { xs: 1.75, sm: 0.5 },
                p: 1.5, minHeight: { xs: 64, sm: 84 }, textAlign: 'left', borderRadius: 'var(--studio-radius-md)',
                border: '2px solid var(--studio-border-color)', background: 'var(--studio-surf)', color: 'var(--studio-ink)',
                '&[aria-pressed="true"]': pressedRing,
              }}
            >
              <Box aria-hidden sx={{ fontFamily: `"${f.heading}", serif`, fontWeight: f.weight, fontSize: { xs: '1.45rem', sm: '1.7rem' }, lineHeight: 1.1 }}>Aa</Box>
              <Typography sx={{ fontSize: '0.76rem', color: 'var(--studio-muted)', lineHeight: 1.25 }}>
                {f.heading}{f.heading !== f.body ? ` + ${f.body}` : ''}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
        <Button size="small" sx={{ mt: 1 }} onClick={() => setFontsOpen((o) => !o)} aria-expanded={fontsOpen}>
          {fontsOpen ? 'Ocultar' : 'Usar otra letra de Google Fonts'}
        </Button>
        <Collapse in={fontsOpen} unmountOnExit>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
            <TextField label="Letra de los títulos" value={value.font_heading} fullWidth
              onChange={(e) => onChange({ font_heading: e.target.value, font_pair: '' })}
              helperText="Cualquier fuente de fonts.google.com, escrita igual." />
            <TextField label="Letra del texto" value={value.font_body} fullWidth onChange={(e) => onChange({ font_body: e.target.value, font_pair: '' })} />
          </Stack>
        </Collapse>
      </Box>

      {/* ── Iconos ── */}
      <Box component="section" aria-labelledby="st-icons">
        {sectionTitle('st-icons', 'Iconos')}
        <Box role="group" aria-labelledby="st-icons" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          {ICON_STYLES.map((ic) => (
            <ButtonBase key={ic.id} onClick={() => onChange({ icon_style: ic.id })} aria-pressed={(value.icon_style || 'line') === ic.id}
              sx={{ display: 'block', textAlign: 'left', p: 1.5, borderRadius: 'var(--studio-radius-md)', border: '2px solid var(--studio-border-color)', background: 'var(--studio-surf)', color: 'var(--studio-ink)', '&[aria-pressed="true"]': pressedRing }}>
              <Stack direction="row" spacing={1.25} sx={{ color: 'var(--studio-primary-text)', mb: 0.75 }} aria-hidden>
                {ICON_SAMPLES[ic.id].map((I, i) => <I key={i} size={20} />)}
              </Stack>
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>{ic.name}</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }}>{ic.description}</Typography>
            </ButtonBase>
          ))}
        </Box>
      </Box>

      <PanelStyleSwitch value={value} onChange={onChange} />
    </Stack>
  );

  if (hidePreview) return picker;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 440px)' }, gap: { xs: 3, lg: 4 }, alignItems: 'start' }}>
      <Box sx={{ display: { xs: 'block', lg: 'none' } }}>
        <PreviewLabel />
        <WebPreviewMock value={value} narrow />
      </Box>
      {picker}
      <Box sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', gap: 1.75, position: 'sticky', top: 84 }}>
        <PreviewLabel />
        <StylePreview value={value} />
      </Box>
    </Box>
  );
}

function PreviewLabel() {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--studio-muted)' }}>
      <StudioIcon name="eye" sx={{ fontSize: 16 }} /><span>Así se verá</span>
    </Stack>
  );
}

/** Chip de paleta: 3 colores + nombre. */
function Swatch({ colors, label, selected, onClick, icon }: { colors: string[]; label: string; selected: boolean; onClick: () => void; icon?: ReactNode }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 1, minHeight: 44, p: '4px 14px 4px 4px', borderRadius: 999,
        border: '2px solid var(--studio-border-color)', background: 'var(--studio-surf)', color: 'var(--studio-ink)',
        fontWeight: 600, fontSize: '0.88rem', fontFamily: 'var(--studio-font-body)', '&[aria-pressed="true"]': pressedRing,
      }}
    >
      <Box aria-hidden sx={{ display: 'flex', width: 44, height: 32, borderRadius: 99, overflow: 'hidden', flex: 'none', boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.08)', background: 'var(--studio-surf2)', alignItems: 'center', justifyContent: 'center' }}>
        {colors.length ? colors.map((c, i) => <Box key={i} sx={{ flex: 1, alignSelf: 'stretch', background: c }} />) : icon}
      </Box>
      {label}
    </ButtonBase>
  );
}

/** Miniatura de un estilo con su primera paleta. */
function StyleCard({ style, name, selected, onClick }: { style: StyleId; name: string; selected: boolean; onClick: () => void }) {
  const e = styleEntry(style);
  const t = e.palettes[0];
  const f = e.fonts[0];
  const shape = styleShape(style);
  const brutal = style === 'brutalist';
  const word = (name || 'Luna').trim().split(/\s+/).pop() || 'Luna';
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Estilo ${e.name}`}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1, p: 1, borderRadius: '16px', textAlign: 'left',
        border: '2px solid var(--studio-border-color)', background: 'var(--studio-surf)', color: 'var(--studio-ink)',
        transition: 'transform .12s, border-color .2s', '&:hover': { transform: 'translateY(-1px)' }, '&[aria-pressed="true"]': pressedRing,
      }}
    >
      <Box aria-hidden sx={{
        height: 66, borderRadius: '10px', overflow: 'hidden', p: 1, display: 'flex', flexDirection: 'column', gap: '5px',
        background: style === 'glass' ? `linear-gradient(135deg, ${t.pSoft}, ${t.bg})` : t.bg, color: t.ink,
        border: `${brutal ? 2 : 1}px solid ${brutal ? t.ink : t.border}`,
      }}>
        <Box sx={{ fontFamily: `"${f.heading}", sans-serif`, fontWeight: f.weight, fontSize: '0.82rem', lineHeight: 1, textTransform: shape.headingTransform, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {word}
        </Box>
        <Box sx={{ height: 4, width: '70%', borderRadius: 4, background: t.ink, opacity: 0.35 }} />
        <Box sx={{ height: 4, width: '45%', borderRadius: 4, background: t.ink, opacity: 0.35 }} />
        <Box sx={{ mt: 'auto', height: 14, width: 46, borderRadius: `${Math.min(shape.r.btn, 7)}px`, background: t.p, ...(brutal ? { boxShadow: `2px 2px 0 ${t.ink}` } : style === 'neon' ? { boxShadow: `0 0 10px ${t.p}` } : {}) }} />
      </Box>
      <Typography component="span" sx={{ fontSize: '0.82rem', fontWeight: 700, px: 0.5, pb: 0.25 }}>{e.name}</Typography>
    </ButtonBase>
  );
}

/** Los 4 colores a mano (avanzado). Se corrigen para que se lean. */
function AdvancedColors({ value, style, onChange }: { value: StudioSettings; style: StyleId; onChange: (c: SiteColors) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SiteColors>(colorsOf(value));
  useEffect(() => { setDraft(colorsOf(value)); }, [value.color_primary, value.color_secondary, value.color_dark, value.color_background]); // eslint-disable-line react-hooks/exhaustive-deps
  const dark = isDarkStyle(style);
  const fields: [keyof SiteColors, string, string][] = [
    ['primary', 'Principal', 'Botones y detalles'],
    ['secondary', 'Secundario', 'Acentos'],
    ['dark', dark ? 'Zonas profundas' : 'Textos', dark ? 'Menú y pie (lo más oscuro)' : 'Textos y títulos'],
    ['background', 'Fondo', dark ? 'Fondo de la web (oscuro)' : 'Color de fondo'],
  ];
  const valid = fields.every(([k]) => HEX.test(draft[k]));
  const changed = fields.some(([k]) => !sameColor(draft[k], value[`color_${k}` as const]));
  return (
    <Box sx={{ mt: 1.5 }}>
      <Button size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Ocultar' : 'Ajustar cada color'}</Button>
      <Collapse in={open} unmountOnExit>
        <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mt: 1 }}>
          {fields.map(([k, label, help]) => (
            <Stack key={k} direction="row" spacing={1.25} alignItems="center" sx={{ flex: '1 1 240px', minWidth: 0 }}>
              <Box component="input" type="color" value={HEX.test(draft[k]) ? draft[k] : '#000000'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value.toUpperCase() })}
                aria-label={label}
                sx={{ width: 44, height: 44, p: 0, border: '1px solid var(--studio-border-strong)', borderRadius: '10px', cursor: 'pointer', background: 'none', flex: 'none' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--studio-muted)' }}>{help}</Typography>
              </Box>
              <TextField size="small" value={draft[k]} sx={{ width: 104, flex: 'none' }} inputProps={{ 'aria-label': `${label} (código)`, maxLength: 7 }}
                onChange={(e) => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = `#${v}`; setDraft({ ...draft, [k]: v.toUpperCase() }); }}
                error={!HEX.test(draft[k])} />
            </Stack>
          ))}
        </Stack>
        <Button variant="outlined" size="small" sx={{ mt: 1.5 }} disabled={!valid || !changed} onClick={() => onChange(draft)}>Aplicar estos colores</Button>
      </Collapse>
    </Box>
  );
}

const HERO_ART = (
  <svg viewBox="0 0 200 120" aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: 'auto' }}>
    <circle cx="150" cy="40" r="22" fill="currentColor" opacity=".35" />
    <path d="M0 95 C40 70 70 70 100 88 S160 105 200 80 V120 H0Z" fill="currentColor" opacity=".55" />
    <path d="M0 105 C50 90 90 96 130 104 S180 110 200 100 V120 H0Z" fill="currentColor" />
  </svg>
);

/** Portada de la web con lo elegido (aún sin guardar). */
function WebPreviewMock({ value, narrow }: { value: StudioSettings; narrow?: boolean }) {
  const style = (value.style_preset || 'natural') as StyleId;
  const t = useMemo(() => previewTokens(value), [value]);
  const shape = styleShape(style);
  const brutal = style === 'brutalist';
  const hw = fontPairBySlug(style, value.font_pair)?.weight || headingWeight(style);
  const heading = `"${value.font_heading}", Georgia, serif`;
  const body = `"${value.font_body}", system-ui, sans-serif`;
  const btn = (primary: boolean) => ({
    display: 'inline-flex', alignItems: 'center', minHeight: 34, px: 1.75, fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' as const,
    borderRadius: `${shape.r.btn}px`, ...(primary
      ? { background: t.p, color: t.onP, ...(brutal ? { border: `2px solid ${t.ink}`, boxShadow: `3px 3px 0 ${t.ink}` } : style === 'neon' ? { boxShadow: `0 0 0 1px ${t.p}, 0 0 18px ${t.p}66` } : {}) }
      : { border: `${brutal ? 2 : 1}px solid ${brutal ? t.ink : t.borderStrong}`, color: t.ink, background: brutal ? t.surf : 'transparent' }),
  });
  const name = value.studio_name || 'Tu estudio';
  return (
    <Box aria-hidden sx={{ borderRadius: '16px', overflow: 'hidden', border: `1px solid ${t.border}`, background: t.bg, boxShadow: `0 18px 50px ${t.ink}22` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1, background: t.surf2, borderBottom: `1px solid ${t.border}` }}>
        {[0, 1, 2].map((i) => <Box key={i} sx={{ width: 9, height: 9, borderRadius: '50%', background: t.borderStrong }} />)}
        <Box sx={{ ml: 1.25, flex: 1, maxWidth: 240, fontSize: '0.7rem', color: t.muted, background: t.surf, px: 1.25, py: 0.4, borderRadius: 99, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(value.web_url || 'tuestudio.corelia.app').replace(/^https?:\/\//, '')}
        </Box>
      </Box>
      <Box sx={{ background: style === 'glass' ? `radial-gradient(80% 60% at 0% 0%, ${t.p}29, transparent 60%), radial-gradient(60% 60% at 100% 20%, ${t.s}38, transparent 60%), ${t.bg}` : t.bg, color: t.ink, fontFamily: body }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 1.75 }}>
          <Box sx={{ width: 30, height: 30, borderRadius: `${Math.min(shape.r.sm, 10)}px`, display: 'grid', placeItems: 'center', background: t.p, color: t.onP, fontFamily: heading, fontWeight: 700, fontSize: '0.8rem', flex: 'none' }}>
            {name.trim()[0]?.toUpperCase()}
          </Box>
          <Box sx={{ fontFamily: heading, fontWeight: hw, textTransform: shape.headingTransform, fontSize: '0.95rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Box>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '0.75rem', color: t.muted }}>
            {!narrow && <><span>Clases</span><span>Precios</span></>}
            <Box sx={btn(true)}>Reservar</Box>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1.1fr 1fr', gap: 2.5, px: 2.5, pt: 1, pb: 3, alignItems: 'center' }}>
          <Box>
            <Box sx={{ fontFamily: heading, fontWeight: hw, textTransform: shape.headingTransform, letterSpacing: shape.headingSpacing, fontSize: narrow ? '1.55rem' : '1.75rem', lineHeight: 1.05, mb: 1.25, overflowWrap: 'anywhere' }}>
              {value.hero_title || 'Pilates que te sienta bien'}
            </Box>
            <Box sx={{ color: t.muted, fontSize: '0.84rem', mb: 1.75 }}>
              {value.hero_subtitle || value.tagline || 'Reserva tu clase en segundos y recibe un aviso antes de empezar.'}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Box sx={btn(true)}>Reservar clase</Box>
              <Box sx={btn(false)}>Ver horario</Box>
            </Box>
          </Box>
          {!narrow && (
            <Box sx={{
              aspectRatio: '4 / 4.4', borderRadius: `${shape.r.xl}px`, position: 'relative', overflow: 'hidden', color: t.p,
              background: `radial-gradient(120% 90% at 20% 10%, ${t.cls.mat.tint}, transparent 60%), radial-gradient(90% 80% at 90% 90%, ${t.cls.yoga.tint}, transparent 60%), linear-gradient(160deg, ${t.pSoft}, ${t.surf2})`,
              ...(brutal ? { border: `2px solid ${t.ink}` } : {}),
            }}>{HERO_ART}</Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** Panel en miniatura con lo elegido. */
function MiniPanel({ value }: { value: StudioSettings }) {
  const style = (value.style_preset || 'natural') as StyleId;
  const follows = value.panel_follows_style !== false;
  const t = useMemo(() => previewTokens(value), [value]);
  const side = follows ? sideOf(style) : 'light';
  const shape = styleShape(follows ? style : 'classic');
  const heading = `"${value.font_heading}", Georgia, serif`;
  const light = side === 'light';
  const sideBg = follows ? t.sideBg : t.surf;
  return (
    <Box aria-hidden sx={{ borderRadius: '16px', overflow: 'hidden', border: `1px solid ${t.border}`, boxShadow: `0 18px 50px ${t.ink}1f` }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 1, p: 1, height: 184, background: t.bg }}>
        <Box sx={{ background: side === 'glass' ? `${t.surf}aa` : sideBg, borderRadius: '12px', p: '10px 8px', display: 'flex', flexDirection: 'column', gap: '5px', ...(light || side === 'darkmode' ? { border: `1px solid ${t.border}` } : {}) }}>
          <Box sx={{ width: 22, height: 22, borderRadius: '7px', background: t.p, mb: 0.75 }} />
          <Box sx={{ height: 14, borderRadius: 99, background: follows ? t.sideActive : t.pSoft }} />
          {[0, 1, 2].map((i) => <Box key={i} sx={{ height: 14, borderRadius: 99, background: follows ? t.sideText : t.ink, opacity: 0.18 }} />)}
          <Box sx={{ mt: 'auto', height: 14, borderRadius: 99, background: follows ? t.sideText : t.ink, opacity: 0.18 }} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <Box sx={{ fontFamily: heading, fontWeight: 700, fontSize: '0.92rem', color: t.ink, textTransform: shape.headingTransform, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Buenos días</Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
            {[['Reservas', '184'], ['Ingresos', '4.320 €'], ['Ocupación', '78%']].map(([l, v]) => (
              <Box key={l} sx={{ height: 46, borderRadius: `${Math.min(shape.r.md, 10)}px`, p: 0.75, background: `linear-gradient(165deg, ${t.pSoft}, ${t.surf})`, border: style === 'brutalist' && follows ? `2px solid ${t.ink}` : `1px solid ${t.border}`, fontFamily: heading, fontWeight: 700, fontSize: '0.82rem', color: t.ink, overflow: 'hidden' }}>
                <Box sx={{ fontFamily: 'inherit', fontSize: '0.55rem', fontWeight: 600, color: t.muted }}>{l}</Box>{v}
              </Box>
            ))}
          </Box>
          {(['reformer', 'barre', 'yoga'] as const).map((k) => (
            <Box key={k} sx={{ height: 22, borderRadius: '8px', background: t.cls[k].tint, borderLeft: `3px solid ${t.cls[k].dot}` }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** Vista previa: la portada de la web y el panel en miniatura (lo usa también la guía). */
export function StylePreview({ value }: { value: StudioSettings }) {
  return (
    <Stack spacing={1.75}>
      <WebPreviewMock value={value} />
      <MiniPanel value={value} />
    </Stack>
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
    <Box sx={{ p: 2, borderRadius: 'var(--studio-radius-md)', border: '1px solid var(--studio-border-color)' }}>
      <FormControlLabel
        control={<Switch checked={follows} disabled={busy} onChange={(e) => toggle(e.target.checked)} />}
        label={<Typography sx={{ fontWeight: 700 }}>Panel con el estilo de mi web</Typography>}
      />
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        Este panel usa también tu estilo, tus colores y tus iconos (y el modo oscuro si tu estilo es oscuro).
        Apágalo para verlo con su aspecto clásico, claro y sencillo.
      </Typography>
    </Box>
  );
}
