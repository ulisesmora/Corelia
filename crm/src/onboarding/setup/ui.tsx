import { forwardRef, type ReactNode } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';

/** Cabecera de cada paso: icono, pregunta grande y una línea. */
export const StepHead = forwardRef<HTMLHeadingElement, { icon: StudioIconName; title: string; subtitle: string; id: string }>(
  function StepHead({ icon, title, subtitle, id }, ref) {
    return (
      <Box sx={{ mb: { xs: 3, md: 3.5 } }}>
        <Box aria-hidden sx={{
          width: 56, height: 56, borderRadius: 'var(--studio-radius-lg)', display: 'grid', placeItems: 'center', mb: 2.25,
          background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)',
        }}>
          <StudioIcon name={icon} sx={{ fontSize: 28 }} />
        </Box>
        <Typography ref={ref} id={id} tabIndex={-1} variant="h1" sx={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', lineHeight: 1.12, mb: 1.25, outline: 'none', overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: { xs: '1rem', md: '1.06rem' }, color: 'var(--studio-muted)', maxWidth: '46ch' }}>{subtitle}</Typography>
      </Box>
    );
  },
);

/** Fila editable (sala, profesor…). */
export function EditRow({ children }: { children: ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.25, p: '8px 8px 8px 14px', minHeight: 60, flexWrap: 'wrap',
      borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)',
      '[data-panel-style="brutalist"]:not([data-panel-classic]) &': { border: '2px solid var(--studio-ink)' },
    }}>
      {children}
    </Box>
  );
}

/** «+ Añadir …» con borde discontinuo. */
export function AddRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <ButtonBase onClick={onClick} disabled={disabled} sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1.25, minHeight: 56, px: 2, width: '100%',
      borderRadius: 'var(--studio-radius-md)', border: '2px dashed var(--studio-border-strong)', color: 'var(--studio-ink)',
      fontWeight: 700, fontFamily: 'var(--studio-font-body)', fontSize: '0.98rem',
      '&:hover': { borderColor: 'var(--studio-primary-text)', color: 'var(--studio-primary-text)', background: 'var(--studio-p-soft)' },
      '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-fill)', outlineOffset: 2 },
      '&.Mui-disabled': { opacity: 0.5 },
    }}>
      <StudioIcon name="plus" />{label}
    </ButtonBase>
  );
}

/** Mensaje de error de un campo o del paso. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <Typography id={id} role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, color: 'var(--studio-bad)', fontSize: '0.88rem', fontWeight: 600 }}>
      <StudioIcon name="warning" sx={{ fontSize: 18 }} />{children}
    </Typography>
  );
}

/** Etiqueta pequeña en mayúsculas («TU WEB, EN DIRECTO»). */
export function Eyebrow({ icon, children }: { icon?: StudioIconName; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--studio-muted)' }}>
      {icon && <StudioIcon name={icon} sx={{ fontSize: 16 }} />}
      <span>{children}</span>
    </Box>
  );
}
