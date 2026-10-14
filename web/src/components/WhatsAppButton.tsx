import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { useSite, whatsappUrl as buildWhatsappUrl } from '../lib/site';

interface Props {
  message: string;
  label: string;
}

// Botón flotante de WhatsApp con el número de la config del estudio. Si el
// estudio no tiene WhatsApp, no se muestra.
export default function WhatsAppButton({ message, label }: Props) {
  const site = useSite();
  const [hovered, setHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const whatsappUrl = buildWhatsappUrl(site, message);
  if (!whatsappUrl) return null;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        // Móvil: por encima de la bottom nav (62px + safe area) para no taparla
        bottom: isMobile ? 'calc(74px + env(safe-area-inset-bottom, 0px))' : '25px',
        right: isMobile ? '16px' : '25px',
        zIndex: 1000,
        // Verde de WhatsApp (color de la marca) en todos los estilos
        backgroundColor: '#25D366',
        color: 'white',
        borderRadius: isMobile ? '50%' : 'var(--radius-button)',
        padding: isMobile ? '16px' : '12px 20px',
        boxShadow: hovered ? 'var(--shadow-hover)' : 'var(--shadow-float)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fontSize: '16px',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      <Icon name="whatsapp" style={{ fontSize: isMobile ? '28px' : '24px', margin: 0 }} />
      {!isMobile && <span>{label}</span>}
    </a>
  );
}
