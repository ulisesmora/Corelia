import { useEffect } from 'react';
import { Box, ButtonBase, Stack, TextField, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { StudioSettings } from './api';
import { FONT_PAIRS, PALETTES, loadGoogleFonts } from './presets';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
}

const same = (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase();

/** Colores y tipografía de la web, con vista previa en vivo. */
export default function StyleSection({ value, onChange }: Props) {
  useEffect(() => {
    loadGoogleFonts([value.font_heading, value.font_body, ...FONT_PAIRS.flatMap((f) => [f.heading, f.body])]);
  }, [value.font_heading, value.font_body]);

  const colorField = (key: 'color_primary' | 'color_secondary' | 'color_dark' | 'color_background', label: string, help: string) => (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 220 }}>
      <Box
        component="input"
        type="color"
        value={value[key]}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value.toUpperCase() })}
        aria-label={label}
        sx={{ width: 48, height: 48, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, cursor: 'pointer', background: 'none' }}
      />
      <Box>
        <Typography fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{help}</Typography>
      </Box>
    </Stack>
  );

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h6" gutterBottom>Colores</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Elige una combinación. Puedes ajustarla después.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {PALETTES.map((p) => {
            const selected = same(p.primary, value.color_primary) && same(p.dark, value.color_dark);
            return (
              <ButtonBase
                key={p.name}
                onClick={() => onChange({
                  color_primary: p.primary, color_secondary: p.secondary,
                  color_dark: p.dark, color_background: p.background,
                })}
                sx={{
                  display: 'block', textAlign: 'left', borderRadius: 3, p: 1.5,
                  border: '2px solid', borderColor: selected ? p.dark : 'divider', bgcolor: p.background,
                  minHeight: 44,
                }}
                aria-pressed={selected}
              >
                <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
                  {[p.primary, p.secondary, p.dark].map((c) => (
                    <Box key={c} sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c }} />
                  ))}
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography fontWeight={600} sx={{ color: p.dark }}>{p.name}</Typography>
                  {selected && <CheckCircleIcon fontSize="small" sx={{ color: p.dark }} />}
                </Stack>
              </ButtonBase>
            );
          })}
        </Box>
        <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 3 }}>
          {colorField('color_primary', 'Color principal', 'Botones y detalles')}
          {colorField('color_secondary', 'Color secundario', 'Enlaces y acentos')}
          {colorField('color_dark', 'Color oscuro', 'Textos y títulos')}
          {colorField('color_background', 'Fondo', 'Color de fondo suave')}
        </Stack>
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>Tipografía</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {FONT_PAIRS.map((f) => {
            const selected = f.heading === value.font_heading && f.body === value.font_body;
            return (
              <ButtonBase
                key={f.name}
                onClick={() => onChange({ font_heading: f.heading, font_body: f.body })}
                sx={{
                  display: 'block', textAlign: 'left', borderRadius: 3, p: 2,
                  border: '2px solid', borderColor: selected ? 'primary.main' : 'divider',
                }}
                aria-pressed={selected}
              >
                <Typography sx={{ fontFamily: `"${f.heading}", serif`, fontSize: '1.5rem', lineHeight: 1.2 }}>
                  {f.name}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: `"${f.body}", sans-serif`, color: 'text.secondary' }}>
                  {f.description}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Fuente de títulos" value={value.font_heading} fullWidth
            onChange={(e) => onChange({ font_heading: e.target.value })}
            helperText="Cualquier fuente de fonts.google.com, escrita igual."
          />
          <TextField
            label="Fuente del texto" value={value.font_body} fullWidth
            onChange={(e) => onChange({ font_body: e.target.value })}
          />
        </Stack>
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>Así se verá</Typography>
        <StylePreview value={value} />
      </Box>
    </Stack>
  );
}

/** Mini maqueta de la web con los colores y fuentes elegidos. */
export function StylePreview({ value }: { value: StudioSettings }) {
  const heading = `"${value.font_heading}", serif`;
  const body = `"${value.font_body}", sans-serif`;
  return (
    <Box sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: value.color_background, fontFamily: body }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 3, py: 1.5, bgcolor: '#fff' }}>
        {value.logo_url ? (
          <Box component="img" src={value.logo_url} alt="" sx={{ maxHeight: 36, maxWidth: 160 }} />
        ) : (
          <Typography sx={{ fontFamily: heading, fontWeight: 700, color: value.color_dark, fontSize: '1.2rem' }}>
            {value.studio_name || 'Mi Estudio'}
          </Typography>
        )}
        <Typography sx={{ fontFamily: body, color: value.color_secondary, fontWeight: 600 }}>Horarios</Typography>
      </Stack>
      <Box sx={{ px: 3, py: 4 }}>
        <Typography sx={{ fontFamily: heading, color: value.color_dark, fontSize: { xs: '1.8rem', sm: '2.4rem' }, lineHeight: 1.1, fontWeight: 700 }}>
          {value.tagline || 'Muévete mejor, siéntete mejor'}
        </Typography>
        <Typography sx={{ fontFamily: body, color: value.color_dark, opacity: 0.75, mt: 1.5, maxWidth: 480 }}>
          Reserva tu clase en segundos y recibe un aviso antes de empezar.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
          <Box sx={{ fontFamily: body, bgcolor: value.color_primary, color: '#fff', px: 3, py: 1.2, borderRadius: 999, fontWeight: 600 }}>
            Reservar clase
          </Box>
          <Box sx={{ fontFamily: body, border: `2px solid ${value.color_secondary}`, color: value.color_secondary, px: 3, py: 1, borderRadius: 999, fontWeight: 600 }}>
            Ver precios
          </Box>
        </Stack>
        <Box sx={{ mt: 4, bgcolor: '#fff', borderRadius: 3, p: 2, maxWidth: 340, borderLeft: `5px solid ${value.color_primary}` }}>
          <Typography sx={{ fontFamily: heading, color: value.color_dark, fontWeight: 700 }}>Pilates Mat</Typography>
          <Typography variant="body2" sx={{ fontFamily: body, color: value.color_dark, opacity: 0.7 }}>
            Lunes · 09:30 · 4 plazas libres
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
