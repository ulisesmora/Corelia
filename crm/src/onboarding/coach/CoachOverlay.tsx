import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, IconButton, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { findTarget } from './target';
import type { Placement, TourStep } from './tours';

export interface CoachRunView {
  steps: TourStep[];
  index: number;
  /** 'tip' = un solo consejo («Consejo», «Entendido») */
  kind: 'tour' | 'tip';
  extra?: { label: string; onClick: () => void };
}

interface Props extends CoachRunView {
  onNext: () => void;
  onPrev: () => void;
  /** done = llegó al final (no «Saltar» / Esc) */
  onClose: (done: boolean) => void;
}

const GAP = 16;
const PAD = 6;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Box4 { x: number; y: number; w: number; h: number }
const same = (a: Box4 | null, b: Box4 | null) =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5);

function place(rect: Box4 | null, tw: number, th: number, preferred?: Placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { left: (vw - tw) / 2, top: Math.max(GAP, (vh - th) / 2) };
  const fits: Record<Placement, () => { left: number; top: number } | null> = {
    right: () => (rect.x + rect.w + GAP + tw + GAP <= vw && rect.w < vw * 0.5
      ? { left: rect.x + rect.w + GAP + 2, top: rect.y + rect.h / 2 - th / 2 } : null),
    bottom: () => (rect.y + rect.h + GAP + th + GAP <= vh
      ? { left: rect.x + rect.w / 2 - tw / 2, top: rect.y + rect.h + GAP } : null),
    top: () => (rect.y - GAP - th >= GAP ? { left: rect.x + rect.w / 2 - tw / 2, top: rect.y - th - GAP } : null),
    left: () => (rect.x - GAP - tw >= GAP ? { left: rect.x - tw - GAP, top: rect.y + rect.h / 2 - th / 2 } : null),
  };
  const order: Placement[] = preferred ? [preferred, 'right', 'bottom', 'top', 'left'] : ['right', 'bottom', 'top', 'left'];
  const spot = order.map((p) => fits[p]()).find(Boolean) || { left: rect.x + rect.w / 2 - tw / 2, top: vh - th - GAP };
  return {
    left: Math.max(GAP, Math.min(spot.left, vw - tw - GAP)),
    top: Math.max(GAP, Math.min(spot.top, vh - th - GAP)),
  };
}

/**
 * Coach mark: oscurece la pantalla menos la pieza señalada (SVG con un
 * hueco) y pone al lado un texto corto con «Paso N de M», Saltar y
 * Siguiente. Teclado: Esc cierra, ← → cambian de paso, Tab no sale del
 * cuadro. Sin animaciones si el sistema pide menos movimiento.
 */
export default function CoachOverlay({ steps, index, kind, extra, onNext, onPrev, onClose }: Props) {
  const step = steps[index];
  const total = steps.length;
  const last = index === total - 1;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const tipRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<Box4 | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const reduced = reducedMotion();

  // Seguir a la pieza señalada (al hacer scroll, al cambiar el tamaño…)
  useLayoutEffect(() => {
    let el = findTarget(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }
    }
    let frame = 0;
    const measure = () => {
      if (!el || !el.isConnected) el = findTarget(step.target);
      const r = el?.getBoundingClientRect();
      const next = r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
      setRect((cur) => (same(cur, next) ? cur : next));
    };
    measure();
    // Durante el desplazamiento suave, medir unos instantes seguidos
    const until = performance.now() + 700;
    const loop = () => { measure(); if (performance.now() < until) frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    const onChange = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [step, reduced]);

  // Colocar el texto junto a la pieza
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    setPos(place(rect, tip.offsetWidth, tip.offsetHeight, step.placement));
  }, [rect, step, extra]);

  // El foco va al botón principal en cada paso
  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }); }, [index]);

  // Teclado: Esc, ← y →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(false); }
      else if (e.key === 'ArrowRight' && !last) { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, last, onClose, onNext, onPrev]);

  // Tab no sale del cuadro
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !tipRef.current) return;
    const items = Array.from(tipRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
    if (!items.length) return;
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
    else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
  };

  // El hueco (con su margen) no se sale de la pantalla: el borde se vería cortado
  const hole = rect ? (() => {
    const x = Math.max(2, rect.x - PAD);
    const y = Math.max(2, rect.y - PAD);
    const right = Math.min(window.innerWidth - 2, rect.x + rect.w + PAD);
    const bottom = Math.min(window.innerHeight - 2, rect.y + rect.h + PAD);
    return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
  })() : null;
  const anim = reduced ? 'none' : 'top 240ms cubic-bezier(.2,.8,.2,1), left 240ms cubic-bezier(.2,.8,.2,1), opacity 160ms';

  return createPortal(
    <Box role="presentation" sx={{ position: 'fixed', inset: 0, zIndex: 1450 }}>
      <Box component="svg" aria-hidden width="100%" height="100%" sx={{ position: 'fixed', inset: 0, display: 'block' }}>
        <defs>
          <mask id={`coach-mask-${uid}`}>
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={14} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask={`url(#coach-mask-${uid})`} style={{ fill: 'var(--studio-scrim, rgb(15 15 15 / 0.5))' }} />
        {hole && (
          <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={14} fill="none" strokeWidth={3}
            style={{ stroke: 'var(--studio-primary-fill)' }} />
        )}
      </Box>

      <Box
        ref={tipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`coach-h-${uid}`}
        aria-describedby={`coach-p-${uid}`}
        onKeyDown={trap}
        sx={{
          position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, opacity: pos ? 1 : 0,
          width: 'min(340px, calc(100vw - 32px))', p: 2.25, pr: 2,
          background: 'var(--studio-surf)', color: 'var(--studio-ink)', borderRadius: 'var(--studio-radius-lg)',
          boxShadow: 'var(--studio-shadow-2)', transition: anim, fontFamily: 'var(--studio-font-body)',
          '[data-panel-style="brutalist"]:not([data-panel-classic]) &': { border: '2px solid var(--studio-ink)' },
          '[data-panel-mode="dark"] &': { border: '1px solid var(--studio-border-strong)' },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--studio-primary-text)', pr: 4 }}>
          {kind === 'tip' ? 'Consejo' : `Paso ${index + 1} de ${total}`}
        </Typography>
        <Typography id={`coach-h-${uid}`} component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', fontSize: '1.15rem', lineHeight: 1.25, mt: 0.75, mb: 0.75, pr: 3 }}>
          {step.title}
        </Typography>
        <Typography id={`coach-p-${uid}`} sx={{ color: 'var(--studio-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
          {step.text}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {total > 1 && (
            <Box aria-hidden sx={{ display: 'flex', gap: '5px', mr: 'auto' }}>
              {steps.map((_, i) => (
                <Box key={i} sx={{
                  height: 7, width: i === index ? 20 : 7, borderRadius: 9,
                  background: i === index ? 'var(--studio-primary-fill)' : 'var(--studio-border-strong)',
                  transition: reduced ? 'none' : 'width 200ms',
                }} />
              ))}
            </Box>
          )}
          {total > 1 && !last && (
            <Button size="small" onClick={() => onClose(false)} sx={{ minHeight: 40, color: 'var(--studio-ink)' }}>Saltar</Button>
          )}
          {total === 1 && <Box sx={{ mr: 'auto' }} />}
          {extra && (
            <Button size="small" variant="outlined" onClick={extra.onClick} sx={{ minHeight: 40 }}>{extra.label}</Button>
          )}
          <Button
            ref={primaryRef}
            size="small"
            variant="contained"
            onClick={() => (last ? onClose(true) : onNext())}
            endIcon={last ? undefined : <StudioIcon name="next" sx={{ fontSize: 16 }} />}
            sx={{ minHeight: 40, px: 1.75 }}
          >
            {last ? (total > 1 ? '¡Listo!' : 'Entendido') : 'Siguiente'}
          </Button>
        </Box>

        <IconButton onClick={() => onClose(false)} aria-label="Cerrar la guía" size="small"
          sx={{ position: 'absolute', top: 8, right: 8, width: 36, height: 36, color: 'var(--studio-muted)' }}>
          <StudioIcon name="close" sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Box>,
    document.body,
  );
}
