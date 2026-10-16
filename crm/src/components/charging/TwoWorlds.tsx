// «Dos formas de cobrar»: las clientas online (Stripe se encarga) y las que
// gestionas tú en el estudio (pagan en mano). Una idea por ficha, con icono.
// La misma pieza va en el capítulo 1 de «Cómo se cobra», en la cabecera de
// «Formas de cobro» (Ajustes → Cobros) y en «Así cobrarás» (paso 7 de la
// puesta en marcha y Clases y precios → Precios).
import { useId, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import type { GuideChapter } from './chapters';
import { methodsText, type ChargingFacts } from './facts';

/** Pantallas a las que llevan los botones (rutas del panel). */
export const WORLD_PATHS = {
  sales: '/ventas',
  payments: '/ajustes?tab=pagos#pagos-online',
  newStudioClient: '/clientas/estudio/nueva',
  credits: '/creditos',
} as const;

interface Line { icon: StudioIconName; text: ReactNode }

interface World {
  key: 'online' | 'en-estudio';
  icon: StudioIconName;
  title: string;
  badge: string;
  lines: Line[];
  /** Lo que haces tú */
  you: string;
  /** Clase suelta, bono y membresía en este mundo (solo en la versión completa) */
  products: string;
}

function worlds(f: ChargingFacts | null): World[] {
  const methods = f ? methodsText(f) : '';
  return [
    {
      key: 'online', icon: 'web', title: 'Clientas online', badge: 'Stripe se encarga',
      lines: [
        { icon: 'web', text: 'Reserva o compra en tu web.' },
        { icon: 'card', text: 'Paga con tarjeta, Apple Pay o Google Pay.' },
        { icon: 'repeat', text: 'Renovaciones, recibos y devoluciones: automáticos.' },
      ],
      you: 'Nada. Solo miras «Ventas».',
      products: 'Clase suelta, bono o membresía: se cobran solos y los créditos se le ponen solos.',
    },
    {
      key: 'en-estudio', icon: 'studio', title: 'Clientas del estudio', badge: 'Las gestionas tú',
      lines: [
        { icon: 'payments', text: `Te paga en mano: ${methods || 'efectivo, Bizum o datáfono'}.` },
        { icon: 'addClient', text: 'La das de alta y le añades sus créditos.' },
        { icon: 'booked', text: 'La apuntas a clases o le das una clase fija.' },
        { icon: 'repeat', text: 'Cada mes renuevas a mano: el «corte de créditos».' },
      ],
      you: 'Cobras y lo apuntas en el panel.',
      products: 'Bono en mano: le añades sus créditos. Mensualidad: cada mes, nuevo corte.',
    },
  ];
}

export interface TwoWorldsProps {
  /** Datos reales del estudio (métodos de pago en el estudio, pagos online activos) */
  facts?: ChargingFacts | null;
  /** 'full': capítulo 1 de la guía (con productos y botones); 'compact': cabeceras */
  variant?: 'full' | 'compact';
  /** Ir a una pantalla del panel. Sin él (puesta en marcha) no hay botones de pantalla. */
  go?: (path: string) => void;
  /** Abrir un capítulo de la guía */
  open?: (c: GuideChapter) => void;
}

export default function TwoWorlds({ facts = null, variant = 'compact', go, open }: TwoWorldsProps) {
  const id = useId();
  const full = variant === 'full';
  const online = Boolean(facts?.payments.enabled);
  const list = worlds(facts);

  return (
    <Box data-testid="two-worlds" data-variant={variant} sx={{ containerType: 'inline-size' }}>
      <Box sx={{
        display: 'grid', gap: 1.25, gridTemplateColumns: 'minmax(0, 1fr)',
        '@container (min-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 1.5 },
      }}>
        {list.map((w, i) => {
          const isOnline = w.key === 'online';
          const card = (
            <Box component="section" key={w.key} id={full ? `mundo-${w.key}` : undefined} aria-labelledby={`${id}-${w.key}`} data-world={w.key} sx={{
              display: 'flex', flexDirection: 'column', gap: full ? 1.25 : 1, p: full ? { xs: 1.75, sm: 2 } : 1.5, minWidth: 0,
              borderRadius: 'var(--studio-radius-lg)',
              background: isOnline ? 'var(--studio-p-soft)' : 'var(--studio-surf2)',
              border: '1px solid', borderColor: isOnline ? 'var(--studio-primary-text)' : 'var(--studio-border-strong)',
            }}>
              {/* Cabecera: icono grande, título y quién se encarga */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box aria-hidden sx={{
                  width: full ? 48 : 40, height: full ? 48 : 40, flex: 'none', borderRadius: 'var(--studio-radius-md)', display: 'grid', placeItems: 'center',
                  background: isOnline ? 'var(--studio-primary-fill)' : 'var(--studio-ink)',
                  color: isOnline ? 'var(--studio-on-primary, #fff)' : 'var(--studio-surf)',
                }}>
                  <StudioIcon name={w.icon} sx={{ fontSize: full ? 26 : 22 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: isOnline ? 'var(--studio-primary-text)' : 'var(--studio-muted)' }}>
                    {i + 1} · {w.badge}
                  </Typography>
                  <Typography id={`${id}-${w.key}`} component="h3" sx={{ fontWeight: 800, fontSize: full ? '1.12rem' : '1rem', color: 'var(--studio-ink)', lineHeight: 1.2 }}>
                    {w.title}
                  </Typography>
                </Box>
              </Box>

              {/* Cómo funciona: una idea por línea */}
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {w.lines.map((l) => (
                  <Box component="li" key={String(l.icon) + String(l.text)} sx={{
                    display: 'flex', gap: 1, alignItems: 'center', p: full ? 1 : 0.25, borderRadius: 'var(--studio-radius-md)',
                    background: full ? 'var(--studio-surf)' : 'transparent', fontSize: full ? '0.9rem' : '0.86rem', color: 'var(--studio-ink)', lineHeight: 1.4,
                  }}>
                    <StudioIcon name={l.icon} aria-hidden sx={{ fontSize: 20, flex: 'none', color: isOnline ? 'var(--studio-primary-text)' : 'var(--studio-muted)' }} />
                    <span>{l.text}</span>
                  </Box>
                ))}
              </Box>

              {/* Lo que haces tú */}
              <Box sx={{
                display: 'flex', gap: 1, alignItems: 'center', px: 1, py: 0.75, borderRadius: 'var(--studio-radius-md)',
                border: '1px dashed', borderColor: isOnline ? 'var(--studio-primary-text)' : 'var(--studio-border-strong)',
                fontSize: '0.88rem', color: 'var(--studio-ink)',
              }}>
                <StudioIcon name={isOnline ? 'eye' : 'edit'} aria-hidden sx={{ fontSize: 20, flex: 'none', color: isOnline ? 'var(--studio-primary-text)' : 'var(--studio-ink)' }} />
                <span><b>Tú:</b> {w.you}</span>
              </Box>

              {full && (
                <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', lineHeight: 1.45, display: 'flex', gap: 0.75 }}>
                  <StudioIcon name="plans" aria-hidden sx={{ fontSize: 18, flex: 'none', mt: '1px' }} />
                  <span>{w.products}</span>
                </Typography>
              )}

              {/* Estado y botones */}
              {isOnline && facts && !online && (
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--studio-warn)', display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <StudioIcon name="warning" aria-hidden sx={{ fontSize: 18 }} />Aún no has activado los pagos online.
                </Typography>
              )}
              {(go || open) && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 'auto', pt: 0.5 }}>
                  {isOnline && go && !online && facts && (
                    <Button size="small" variant="contained" onClick={() => go(WORLD_PATHS.payments)} startIcon={<StudioIcon name="card" />} sx={{ minHeight: 44 }}>
                      Activar pagos online
                    </Button>
                  )}
                  {isOnline && go && (online || !facts) && full && (
                    <Button size="small" variant="outlined" onClick={() => go(WORLD_PATHS.sales)} startIcon={<StudioIcon name="stats" />} sx={{ minHeight: 44 }}>
                      Ver ventas
                    </Button>
                  )}
                  {!isOnline && go && (
                    <Button size="small" variant={full ? 'contained' : 'outlined'} onClick={() => go(WORLD_PATHS.newStudioClient)} startIcon={<StudioIcon name="addClient" />} sx={{ minHeight: 44 }}>
                      Nueva clienta del estudio
                    </Button>
                  )}
                  {!isOnline && go && full && (
                    <Button size="small" variant="outlined" onClick={() => go(WORLD_PATHS.credits)} startIcon={<StudioIcon name="credits" />} sx={{ minHeight: 44 }}>
                      Créditos
                    </Button>
                  )}
                  {open && (
                    <Button size="small" onClick={() => open(w.key)} endIcon={<StudioIcon name="next" />} sx={{ minHeight: 44 }}>
                      Cómo funciona
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          );
          if (i === 0) return card;
          // Separador entre los dos mundos: «y» (se pueden usar los dos a la vez)
          return [
            <Box key="sep" aria-hidden sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
              '@container (min-width: 600px)': { flexDirection: 'column' },
            }}>
              <Box sx={{ flex: 1, height: '1px', width: 'auto', background: 'var(--studio-border-strong)', '@container (min-width: 600px)': { width: '1px', height: 'auto' } }} />
              <Box sx={{ px: 1, py: 0.25, borderRadius: 99, fontSize: '0.78rem', fontWeight: 800, color: 'var(--studio-muted)', background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)', whiteSpace: 'nowrap' }}>
                y / o
              </Box>
              <Box sx={{ flex: 1, height: '1px', width: 'auto', background: 'var(--studio-border-strong)', '@container (min-width: 600px)': { width: '1px', height: 'auto' } }} />
            </Box>,
            card,
          ];
        })}
      </Box>
      {full && (
        <Typography sx={{ mt: 1.25, fontSize: '0.86rem', color: 'var(--studio-muted)', display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
          <StudioIcon name="tip" aria-hidden sx={{ fontSize: 18, flex: 'none', mt: '1px' }} />
          <span>Puedes tener las dos a la vez. En los dos casos, <b>1 crédito = 1 clase</b> y al reservar se descuenta.</span>
        </Typography>
      )}
    </Box>
  );
}
