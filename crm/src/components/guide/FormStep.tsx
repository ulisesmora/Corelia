import { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

interface Props {
  n: number;
  /** Pregunta sencilla: "¿A qué clienta?" */
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * Bloque numerado dentro de un formulario o ventana: convierte un formulario
 * largo en pasos cortos ("1 · ¿Qué clase?", "2 · ¿Qué día y a qué hora?").
 */
export default function FormStep({ n, title, hint, children }: Props) {
  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: hint ? 0.5 : 1.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
            backgroundColor: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)', fontWeight: 600, fontSize: '0.9rem',
          }}
        >
          {n}
        </Box>
        <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--studio-dark)' }}>
          {title}
        </Typography>
      </Stack>
      {hint && (
        <Typography sx={{ ml: '40px', mb: 1.5, color: 'text.secondary', fontSize: '0.92rem', lineHeight: 1.55 }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ ml: { xs: 0, sm: '40px' } }}>{children}</Box>
    </Box>
  );
}
