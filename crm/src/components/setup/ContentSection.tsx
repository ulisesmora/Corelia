import { Box, Stack, TextField, Typography } from '@mui/material';
import { PhotoPicker } from '../guide';
import type { StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  onBusyChange?: (busy: boolean) => void;
}

/** Textos de la portada y de «Sobre nosotros», en español e inglés. */
export default function ContentSection({ value, onChange, onBusyChange }: Props) {
  const pair = (es: keyof StudioSettings, en: keyof StudioSettings, label: string, opts: { multiline?: boolean; placeholder?: string; help?: string } = {}) => (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <TextField
        label={label} fullWidth value={(value[es] as string) ?? ''}
        onChange={(e) => onChange({ [es]: e.target.value })}
        multiline={opts.multiline} minRows={opts.multiline ? 4 : undefined}
        placeholder={opts.placeholder} helperText={opts.help}
      />
      <TextField
        label={`${label} — en inglés`} fullWidth value={(value[en] as string) ?? ''}
        onChange={(e) => onChange({ [en]: e.target.value })}
        multiline={opts.multiline} minRows={opts.multiline ? 4 : undefined}
        helperText="Opcional. Si lo dejas vacío, la web en inglés usa el texto en español."
      />
    </Stack>
  );

  return (
    <Stack spacing={3}>
      <Typography color="text.secondary">
        Estos textos se leen en tu web y también los usan Google y los asistentes de IA (ChatGPT, Gemini…) para
        entender qué ofreces. Escribe como hablarías a una clienta nueva: qué clases das, para quién y dónde.
      </Typography>

      <Typography variant="h6">Portada</Typography>
      {pair('hero_title', 'hero_title_en', 'Titular', { placeholder: 'Muévete mejor, siéntete mejor', help: 'Lo primero que se lee. Corto y claro.' })}
      {pair('hero_subtitle', 'hero_subtitle_en', 'Frase bajo el titular', { placeholder: 'Pilates y yoga en grupos reducidos en el centro de…' })}

      <Typography variant="h6" sx={{ pt: 1 }}>Sobre nosotros</Typography>
      {pair('about_title', 'about_title_en', 'Título', { placeholder: 'Un estudio para cuidarte' })}
      {pair('about_text', 'about_text_en', 'Texto', { multiline: true, help: 'Quiénes sois y cómo trabajáis. Separa los párrafos con una línea en blanco.' })}
      <Box>
        <Typography fontWeight={600} sx={{ mb: 1 }}>Foto de «Sobre nosotros» (opcional)</Typography>
        <PhotoPicker value={value.about_image_url} onChange={(url) => onChange({ about_image_url: url })}
          onBusyChange={onBusyChange} aspect="4 / 3" allowRemove
          shapeHint="Una foto del estudio o del equipo. Horizontal." />
      </Box>

      <Typography variant="h6" sx={{ pt: 1 }}>Para Google</Typography>
      {pair('description', 'description_en', 'Descripción corta', { multiline: true, help: '1-2 frases. Es lo que aparece bajo tu nombre en Google y al compartir la web.' })}
      {pair('tagline', 'tagline_en', 'Frase corta', { help: 'Se usa en la portada y al compartir la web en WhatsApp o redes.' })}
    </Stack>
  );
}
