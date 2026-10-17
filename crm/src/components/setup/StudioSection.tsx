import { useState } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { PhotoPicker } from '../guide';
import { API_BASE_URL } from '../../config';
import LocaleSection from './LocaleSection';
import LocationPicker from './LocationPicker';
import type { StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  onBusyChange?: (busy: boolean) => void;
  /** En Ajustes se enseñan también los datos legales */
  showLegal?: boolean;
}

/** Nombre, logo y datos de contacto: lo que ven tus clientes en la web. */
export default function StudioSection({ value, onChange, onBusyChange, showLegal }: Props) {
  const field = (key: keyof StudioSettings) => ({
    value: (value[key] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
    fullWidth: true,
  });

  return (
    <Stack spacing={3}>
      <TextField
        label="Nombre del estudio"
        required
        {...field('studio_name')}
        helperText="Así aparecerá en la web, en los emails y en la app."
        inputProps={{ maxLength: 120 }}
      />
      <TextField
        label="Frase corta (opcional)"
        {...field('tagline')}
        placeholder="Pilates y yoga en grupos reducidos"
        helperText="Se muestra bajo el nombre en la portada."
        inputProps={{ maxLength: 200 }}
      />

      <Box>
        <Typography fontWeight={600} sx={{ mb: 1 }}>Logo (opcional)</Typography>
        <PhotoPicker
          value={value.logo_url}
          onChange={(url) => onChange({ logo_url: url })}
          onBusyChange={onBusyChange}
          aspect="3 / 1"
          previewWidth={260}
          allowRemove
          shapeHint="Mejor una imagen alargada con fondo transparente (PNG). Si no tienes logo, la web mostrará el nombre con tu tipografía."
        />
      </Box>

      <Box>
        <Typography fontWeight={600} sx={{ mb: 0.5 }}>Icono de la app (opcional)</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Es el dibujo que aparece en el móvil de tus clientes al instalar la app y en la pestaña del navegador.
          Tiene que ser <b>cuadrado</b> y sencillo (tu símbolo, sin letras pequeñas). Si no subes ninguno,
          usamos la inicial de tu estudio con tus colores.
        </Typography>
        <Stack direction="row" spacing={3} alignItems="flex-start" flexWrap="wrap" useFlexGap>
          <PhotoPicker
            value={value.icon_url}
            onChange={(url) => onChange({ icon_url: url })}
            onBusyChange={onBusyChange}
            aspect="1 / 1"
            previewWidth={140}
            allowRemove
            shapeHint="Cuadrado, de al menos 512 × 512 píxeles. PNG con fondo transparente queda mejor."
          />
          <IconPreview />
        </Stack>
      </Box>

      <Typography variant="h6" sx={{ pt: 1 }}>¿Cómo te contactan?</Typography>
      <Typography color="text.secondary" sx={{ mt: '-8px !important' }}>
        Solo se muestran en la web los datos que rellenes.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Teléfono" {...field('phone')} placeholder="+34 600 000 000" />
        <TextField
          label="WhatsApp"
          {...field('whatsapp')}
          placeholder="+34600000000"
          helperText="Con el prefijo del país. Pon el mismo que el teléfono si es igual."
        />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Email de contacto" type="email" {...field('contact_email')} placeholder="hola@tuestudio.com" />
        <TextField
          label="Instagram"
          {...field('instagram')}
          placeholder="tuestudio"
          helperText="Solo el usuario, sin @."
          onChange={(e) => onChange({ instagram: e.target.value.replace(/^@/, '').trim() })}
        />
      </Stack>
      <TextField label="Dirección" {...field('address')} placeholder="Calle Mayor 12, local 3" />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Ciudad" {...field('city')} />
        <TextField label="Código postal" {...field('postal_code')} sx={{ maxWidth: { sm: 200 } }} />
      </Stack>
      {/* Punto del mapa de «Cómo llegar» (se busca solo al guardar la dirección) */}
      <LocationPicker value={value} onChange={onChange} />
      <TextField
        label="Zonas desde donde vienen tus clientes (opcional)"
        {...field('area_served')}
        placeholder="Centro, Ensanche, Playa…"
        helperText="Barrios o pueblos separados por comas. Google y los asistentes de IA lo usan para recomendarte."
      />
      <TextField
        label="Enlace de Google Maps (opcional)"
        {...field('maps_url')}
        placeholder="https://maps.app.goo.gl/…"
        helperText="En Google Maps, busca tu estudio → Compartir → Copiar enlace."
      />

      <LocaleSection value={value} onChange={onChange} />

      {showLegal && (
        <>
          <Typography variant="h6" sx={{ pt: 1 }}>Datos legales</Typography>
          <Typography color="text.secondary" sx={{ mt: '-8px !important' }}>
            Aparecen en los Términos y condiciones de la web. Son obligatorios para vender online.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Nombre legal (empresa o autónomo)" {...field('legal_name')} />
            <TextField label="NIF / CIF" {...field('tax_id')} sx={{ maxWidth: { sm: 220 } }} />
          </Stack>
          <TextField
            label="Descripción para Google (opcional)"
            {...field('description')}
            multiline
            minRows={2}
            helperText="1-2 frases sobre tu estudio. Es lo que sale bajo el título en Google."
          />
        </>
      )}
    </Stack>
  );
}

/** Cómo se ve ahora el icono (lo genera el servidor; cambia al guardar). */
function IconPreview() {
  const [src] = useState(() => `${API_BASE_URL}v1/site-config/icon/180.png?t=${Date.now()}`);
  return (
    <Stack spacing={1} alignItems="center">
      <Box component="img" src={src} alt="" sx={{ width: 72, height: 72, borderRadius: '22%', boxShadow: 2 }} />
      <Typography variant="caption" color="text.secondary">Así se ve ahora</Typography>
    </Stack>
  );
}
