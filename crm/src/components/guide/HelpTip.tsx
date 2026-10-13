import { ReactNode, useState } from 'react';
import { Box, ButtonBase, Popover, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface Props {
  /** Explicación en lenguaje llano */
  children: ReactNode;
  /** Título opcional de la explicación */
  title?: string;
  /** Texto visible junto al icono (p. ej. "¿Qué es esto?"). Sin él solo se ve el "?" */
  label?: string;
}

/**
 * Botón "?" que abre una explicación al PULSARLO (no al pasar el ratón: en
 * tablet o con poca práctica con el ratón el hover no funciona).
 */
export default function HelpTip({ children, title, label }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <ButtonBase
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        aria-label={label || `Ayuda${title ? `: ${title}` : ''}`}
        sx={{
          minWidth: 32, minHeight: 32, px: label ? 1 : 0.5, borderRadius: 999, gap: 0.5,
          color: 'var(--studio-primary-shade)', verticalAlign: 'middle',
          '&:hover': { backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.10)' },
          '&:focus-visible': { outline: '2px solid var(--studio-primary)', outlineOffset: 2 },
        }}
      >
        <HelpOutlineIcon sx={{ fontSize: 21 }} />
        {label && <Box component="span" sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{label}</Box>}
      </ButtonBase>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              p: 2, maxWidth: 340, borderRadius: 3,
              backgroundColor: 'var(--studio-bg-light)', backdropFilter: 'none',
              boxShadow: '0 10px 30px rgb(var(--studio-dark-rgb) / 0.18)',
            },
          },
        }}
      >
        {title && <Typography sx={{ fontWeight: 600, mb: 0.5, color: 'var(--studio-dark)' }}>{title}</Typography>}
        <Typography component="div" sx={{ fontSize: '0.95rem', color: 'var(--studio-text-strong)', lineHeight: 1.6 }}>
          {children}
        </Typography>
      </Popover>
    </>
  );
}
