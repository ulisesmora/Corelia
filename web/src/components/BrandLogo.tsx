// Logo del estudio: la imagen de la config (logo_url / logo_light_url) o, si
// no hay, el nombre del estudio en texto con la fuente de títulos.
import React from 'react';
import { useSite } from '../lib/site';

interface BrandLogoProps {
  /** 'light' = versión clara para fondos oscuros (logo_light_url). */
  variant?: 'default' | 'light';
  /** Ancho de la imagen (px). El texto se escala a partir de este valor. */
  width?: number;
  /** Alto máximo de la imagen (px), para logos muy verticales. */
  maxHeight?: number;
  /** Texto alternativo. Por defecto, el nombre del estudio. '' = decorativo. */
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function BrandLogo({ variant = 'default', width = 140, maxHeight, alt, style, className }: BrandLogoProps) {
  const site = useSite();
  const src = variant === 'light' ? (site.logo_light_url || site.logo_url) : site.logo_url;
  const label = alt ?? site.studio_name;
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        aria-hidden={label === '' ? true : undefined}
        width={width}
        className={className}
        style={{ width, height: 'auto', maxHeight, objectFit: 'contain', ...style }}
      />
    );
  }
  // Sin logo: nombre del estudio con la fuente de títulos, a un tamaño que
  // quepa en `width` (y algo menor en pantallas estrechas)
  const fit = Math.round(width / Math.max(4, site.studio_name.length * 0.58));
  const fontSize = `clamp(13px, 4.2vw, ${Math.min(30, Math.max(14, fit))}px)`;
  return (
    <span
      className={className}
      aria-label={label || undefined}
      aria-hidden={label === '' ? true : undefined}
      style={{
        display: 'block',
        fontFamily: 'var(--font-heading)',
        fontSize,
        lineHeight: 1.05,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: variant === 'light' ? '#fff' : 'var(--brand-dark)',
        textTransform: 'none',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...style,
      }}
    >
      {site.studio_name}
    </span>
  );
}
