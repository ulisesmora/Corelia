// Constantes y estilos compartidos de las pantallas de resumen.
import type { SxProps, Theme } from '@mui/material';
import type { Tint } from './api';

export const TINTS: Tint[] = ['reformer', 'mat', 'barre', 'yoga', 'privada'];

export function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter((p) => /\p{L}/u.test(p[0] || ''));
  if (!parts.length) return '·';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

export const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

/** Fila de lista (Ventas, Ajustes…) */
export const rowSx: SxProps<Theme> = {
  display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 1.5, sm: 2 }, py: 1.25, minHeight: 64,
  borderTop: '1px solid var(--studio-border-color)', '&:first-of-type': { borderTop: 0 },
};
