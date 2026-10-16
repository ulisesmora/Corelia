import { useState } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { PhotoPicker } from '../../components/guide';
import type { StudioSettings } from '../../components/setup/api';
import LocationPicker from '../../components/setup/LocationPicker';
import { useStepGuard } from './autosave';
import { FieldError } from './ui';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  onBusyChange: (busy: boolean) => void;
}

const DEFAULT_NAME = 'Mi Estudio';

/** Paso 1: nombre, ciudad, cómo te contactan y logo. */
export default function StepStudio({ value, onChange, onBusyChange }: Props) {
  const [tried, setTried] = useState(false);
  const name = value.studio_name.trim();
  const nameMissing = !name || name === DEFAULT_NAME;
  const placeMissing = !(value.city.trim() || value.address.trim());
  const contactMissing = !(value.phone.trim() || value.contact_email.trim() || value.whatsapp.trim());

  useStepGuard(() => {
    setTried(true);
    const ok = !nameMissing && !placeMissing && !contactMissing;
    if (!ok) {
      window.setTimeout(() => {
        const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.focus();
      }, 0);
    }
    return ok;
  });

  const field = (key: keyof StudioSettings, extra: { invalid?: boolean; errId?: string } = {}) => ({
    value: (value[key] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
    fullWidth: true,
    error: Boolean(tried && extra.invalid),
    slotProps: { htmlInput: { 'aria-invalid': Boolean(tried && extra.invalid), 'aria-describedby': tried && extra.invalid ? extra.errId : undefined } },
  });

  return (
    <Stack spacing={2.5}>
      <Box>
        <TextField
          label="Nombre del estudio"
          required
          autoComplete="organization"
          {...field('studio_name', { invalid: nameMissing, errId: 'su-name-err' })}
          value={value.studio_name === DEFAULT_NAME ? '' : value.studio_name}
          placeholder="Estudio Luna"
          slotProps={{ htmlInput: { maxLength: 120, 'aria-invalid': Boolean(tried && nameMissing), 'aria-describedby': tried && nameMissing ? 'su-name-err' : undefined } }}
        />
        {tried && nameMissing && <FieldError id="su-name-err">Escribe el nombre para continuar.</FieldError>}
      </Box>

      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Ciudad" required autoComplete="address-level2" {...field('city', { invalid: placeMissing, errId: 'su-city-err' })} />
          <TextField label="Dirección (opcional)" autoComplete="street-address" placeholder="Calle Mayor 12" {...field('address')} />
        </Stack>
        {tried && placeMissing && <FieldError id="su-city-err">Escribe la ciudad: sale en tu web y en Google.</FieldError>}
      </Box>

      {/* Con calle y ciudad, el punto del mapa de la web (se busca solo al guardar) */}
      {value.address.trim() && value.city.trim() && <LocationPicker value={value} onChange={onChange} />}

      <Box>
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5, color: 'var(--studio-ink)' }}>¿Cómo te contactan?</Typography>
        <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.9rem', mb: 1.5 }}>Con uno basta. Solo se ve en tu web lo que rellenes.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Teléfono o WhatsApp" type="tel" autoComplete="tel" placeholder="+34 600 000 000"
            {...field('phone', { invalid: contactMissing, errId: 'su-contact-err' })}
            onChange={(e) => onChange({ phone: e.target.value, ...(value.whatsapp && value.whatsapp !== value.phone ? {} : { whatsapp: e.target.value.replace(/\s+/g, '') }) })} />
          <TextField label="Email" type="email" autoComplete="email" placeholder="hola@tuestudio.com" {...field('contact_email', { invalid: contactMissing, errId: 'su-contact-err' })} />
        </Stack>
        {tried && contactMissing && <FieldError id="su-contact-err">Pon un teléfono o un email para que te puedan escribir.</FieldError>}
      </Box>

      <Box>
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1rem', mb: 1, color: 'var(--studio-ink)' }}>
          Logo <Box component="span" sx={{ fontWeight: 500, color: 'var(--studio-muted)' }}>(opcional)</Box>
        </Typography>
        <PhotoPicker
          value={value.logo_url}
          onChange={(url) => onChange({ logo_url: url })}
          onBusyChange={onBusyChange}
          aspect="3 / 1"
          previewWidth={240}
          allowRemove
          shapeHint="PNG o JPG. Si no tienes, usamos tu inicial."
        />
      </Box>
    </Stack>
  );
}
