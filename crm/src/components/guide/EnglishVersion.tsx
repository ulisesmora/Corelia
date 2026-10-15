import { ReactNode, useState } from 'react';
import { Box, ButtonBase, Chip, Collapse, Stack, TextField, Typography } from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// Versión en inglés de los textos que se ven en la web (campos *_en de la API).
// Vacío = en la web inglesa se muestra el texto en español. Solo edición: nada
// se traduce solo.

export const EN_HELP = 'Lo que verán las clientas que tienen la web en inglés. Si lo dejas vacío, verán el texto en español.';

/** [texto en español, texto en inglés] */
export type EnglishPair = [string | null | undefined, string | null | undefined];

const filled = (v?: string | null) => Boolean(v && v.trim());

/** 'none' = no hay nada en español · 'ok' = todo traducido · 'missing' = falta alguno */
export function englishStatus(pairs: EnglishPair[]): 'none' | 'ok' | 'missing' {
  const withEs = pairs.filter(([es]) => filled(es));
  if (!withEs.length) return 'none';
  return withEs.every(([, en]) => filled(en)) ? 'ok' : 'missing';
}

const SOFT_WARN = {
  backgroundColor: 'rgba(212,165,116,0.18)',
  color: 'var(--studio-warning-text, #7A4E24)',
  border: '1px solid rgba(212,165,116,0.45)',
};

/** Chip para las tarjetas: «EN ✓» si está traducido, «Sin inglés» si falta algo. */
export function EnglishChip({ pairs, size = 'medium' }: { pairs: EnglishPair[]; size?: 'small' | 'medium' }) {
  const status = englishStatus(pairs);
  if (status === 'none') return null;
  return status === 'ok' ? (
    <Chip size={size} label="EN ✓" color="success" variant="outlined" aria-label="Tiene la versión en inglés" sx={{ flexShrink: 0 }} />
  ) : (
    <Chip size={size} label="Sin inglés" aria-label="Le falta algún texto en inglés" sx={{ ...SOFT_WARN, flexShrink: 0 }} />
  );
}

interface FieldProps {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  /** Texto en español, para tenerlo a la vista mientras se escribe */
  es?: string | null;
  /** Mismo límite de letras que el campo en español */
  maxLength?: number;
  multiline?: boolean;
}

/** Campo en inglés con la explicación de siempre y el texto en español de referencia. */
export function EnglishField({ label, value, onChange, es, maxLength, multiline }: FieldProps) {
  const v = value || '';
  return (
    <Box>
      {filled(es) && (
        <Typography
          sx={{
            color: 'var(--studio-text-body)', fontSize: '0.88rem', mb: 0.75,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          En español: «{es}»
        </Typography>
      )}
      <TextField
        fullWidth
        label={label}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        multiline={multiline}
        minRows={multiline ? 3 : undefined}
        inputProps={maxLength ? { maxLength, lang: 'en' } : { lang: 'en' }}
        helperText={maxLength ? `${EN_HELP} ${v.length}/${maxLength}` : EN_HELP}
      />
    </Box>
  );
}

/**
 * Bloque plegable «Versión en inglés (para la web en inglés)». En la cabecera
 * se ve si ya está todo traducido o si falta algo, sin tener que abrirlo.
 */
export function EnglishVersion({ pairs, children }: { pairs: EnglishPair[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const status = englishStatus(pairs);
  const summary = status === 'ok'
    ? 'Ya está todo en inglés.'
    : status === 'missing'
      ? 'Falta algún texto en inglés. Pulsa aquí para escribirlo.'
      : 'Pulsa aquí para escribir los textos en inglés (si quieres).';

  return (
    <Box component="section" sx={{ mb: 3, borderRadius: 3, border: '1.5px solid rgb(var(--studio-primary-rgb) / 0.3)', overflow: 'hidden' }}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        sx={{
          width: '100%', minHeight: 60, px: 2, py: 1.25, gap: 1.25, justifyContent: 'flex-start', textAlign: 'left',
          '&:hover': { backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.06)' },
          '&:focus-visible': { outline: '2px solid var(--studio-primary)', outlineOffset: -2 },
        }}
      >
        <TranslateIcon aria-hidden sx={{ color: 'var(--studio-primary-shade)' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.02rem', color: 'var(--studio-dark)' }}>
            Versión en inglés (para la web en inglés)
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>{summary}</Typography>
        </Box>
        <EnglishChip pairs={pairs} size="small" />
        <ExpandMoreIcon aria-hidden sx={{ color: 'var(--studio-primary-shade)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </ButtonBase>
      <Collapse in={open}>
        <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', mb: 2, lineHeight: 1.55 }}>
            Escribe aquí el mismo texto, pero en inglés. No se traduce solo: lo que pongas es lo que se verá.
          </Typography>
          <Stack spacing={2.25}>{children}</Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
