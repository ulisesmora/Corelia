import { useEffect, useState } from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useSite } from './SiteProvider';

interface StudioLogoProps {
  /** Alto máximo del logo en píxeles (si hay logo) */
  height?: number;
  /** Tamaño de letra del nombre (si no hay logo) */
  fontSize?: string | Record<string, string>;
  /** Solo la inicial (menú encogido) */
  compact?: boolean;
  /** Logo para fondos oscuros (`logo_light_url`), si existe */
  light?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Logo del estudio según su configuración: la imagen si hay `logo_url` y, si
 * no hay (o no carga), el nombre del estudio escrito con la fuente de títulos.
 */
export default function StudioLogo({ height = 44, fontSize = '1.6rem', compact, light, sx }: StudioLogoProps) {
  const { config } = useSite();
  const src = (light && config.logo_light_url) || config.logo_url;
  const [broken, setBroken] = useState(false);
  const extra = Array.isArray(sx) ? sx : sx ? [sx] : [];
  useEffect(() => { setBroken(false); }, [src]);

  if (src && !broken && !compact) {
    return (
      <Box
        component="img"
        src={src}
        alt={config.studio_name}
        onError={() => setBroken(true)}
        sx={[{ display: 'block', maxHeight: height, maxWidth: '100%', objectFit: 'contain' }, ...extra]}
      />
    );
  }

  const name = config.studio_name;
  return (
    <Typography
      component="span"
      aria-label={compact ? name : undefined}
      sx={[{
        display: 'block',
        fontFamily: 'var(--studio-font-heading)',
        fontWeight: 700,
        fontSize,
        color: light ? '#fff' : 'var(--studio-dark)',
        letterSpacing: '0.02em',
        lineHeight: 1.15,
        overflowWrap: 'anywhere',
      }, ...extra]}
    >
      {compact ? name.trim().charAt(0).toUpperCase() : name}
    </Typography>
  );
}
