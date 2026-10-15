import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Popover, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { setupStepLink } from '../../onboarding/flow';
import type { Lock } from '../../onboarding/locks';

export interface LockPop { anchor: HTMLElement; lock: Lock }

/**
 * Al tocar una sección con candado: por qué está cerrada y «Ir a …».
 * `side`: 'right' en el menú lateral, 'top' en la barra de abajo del móvil.
 */
export default function LockPopover({ pop, onClose, side = 'right' }: { pop: LockPop | null; onClose: () => void; side?: 'right' | 'top' }) {
  const navigate = useNavigate();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (pop) window.setTimeout(() => btn.current?.focus(), 30); }, [pop]);
  return (
    <Popover
      open={Boolean(pop)}
      anchorEl={pop?.anchor}
      onClose={onClose}
      anchorOrigin={side === 'right' ? { vertical: 'center', horizontal: 'right' } : { vertical: 'top', horizontal: 'center' }}
      transformOrigin={side === 'right' ? { vertical: 'center', horizontal: 'left' } : { vertical: 'bottom', horizontal: 'center' }}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': pop?.lock.why,
          sx: {
            p: 1.75, ml: side === 'right' ? 1 : 0, mt: side === 'top' ? -1 : 0, maxWidth: 280, borderRadius: 'var(--studio-radius-md)',
            background: 'var(--studio-ink)', color: 'var(--studio-surf)', boxShadow: 'var(--studio-shadow-2)',
          },
        },
      }}
    >
      {pop && (
        <>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'inherit', mb: 1.25 }}>{pop.lock.why}</Typography>
          <Button
            ref={btn}
            size="small"
            endIcon={<StudioIcon name="next" sx={{ fontSize: 16 }} />}
            onClick={() => { onClose(); navigate(setupStepLink(pop.lock.step)); }}
            sx={{ minHeight: 44, px: 1.75, fontWeight: 700, background: 'var(--studio-surf)', color: 'var(--studio-ink)', '&:hover': { background: 'var(--studio-surf2)' } }}
          >
            Ir a {pop.lock.stepLabel}
          </Button>
        </>
      )}
    </Popover>
  );
}
