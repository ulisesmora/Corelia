import { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';

interface Props {
  title: string;
  /** Qué significa que esté vacío y qué hacer ahora */
  text?: ReactNode;
  icon?: ReactNode;
  /** Botón con la acción siguiente (p. ej. "Añadir la primera clase") */
  action?: ReactNode;
  compact?: boolean;
}

/** Mensaje amable cuando una lista está vacía o una búsqueda no encuentra nada. */
export default function EmptyState({ title, text, icon, action, compact }: Props) {
  return (
    <Box
      role="status"
      sx={{
        textAlign: 'center', px: 2, py: compact ? 3 : 6,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}
    >
      <Box aria-hidden sx={{ color: 'var(--studio-primary-light)', '& svg': { fontSize: compact ? 40 : 56 } }}>
        {icon || <StudioIcon name="empty" />}
      </Box>
      <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)' }}>{title}</Typography>
      {text && (
        <Typography sx={{ color: 'text.secondary', maxWidth: 460, fontSize: '0.98rem', lineHeight: 1.6 }}>
          {text}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}
