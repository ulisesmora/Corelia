// Piezas de «Clases y precios»: tarjeta con edición en el sitio (tocar un
// dato, escribir, y se guarda al salir del campo o con Intro), avatar, aviso
// de bloqueo y «+ Añadir». Solo variables --studio-* del tema.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import { useNotify } from '../../components/guide';

const srOnly = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

interface InlineFieldProps {
  label: string;
  value: string | number;
  onSave: (value: string) => Promise<unknown>;
  type?: 'text' | 'number';
  suffix?: string;
  /** Ancho del texto (en caracteres) */
  size?: number;
  min?: number;
  step?: number;
  /** Comprobar antes de guardar: devuelve el error o '' */
  validate?: (value: string) => string;
  /** Título grande (nombre de la tarjeta) */
  big?: boolean;
  disabled?: boolean;
}

/** Un dato que se cambia aquí mismo: se guarda al salir del campo o con Intro (Esc deshace). */
export function InlineField({ label, value, onSave, type = 'number', suffix, size = 4, min = 0, step = 1, validate, big = false, disabled }: InlineFieldProps) {
  const notify = useNotify();
  const id = useId();
  const [draft, setDraft] = useState(String(value ?? ''));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const skip = useRef(false);
  useEffect(() => { setDraft(String(value ?? '')); }, [value]);
  useEffect(() => {
    if (state !== 'saved') return undefined;
    const t = window.setTimeout(() => setState('idle'), 1800);
    return () => window.clearTimeout(t);
  }, [state]);

  const commit = async () => {
    if (skip.current) { skip.current = false; return; }
    const v = draft.trim();
    if (v === String(value ?? '').trim()) return;
    const err = !v ? `Escribe ${label.toLowerCase()}.` : type === 'number' && !(Number(v) >= min) ? `${label}: tiene que ser ${min} o más.` : validate?.(v) || '';
    if (err) { notify(err, 'error'); setDraft(String(value ?? '')); return; }
    setState('saving');
    try {
      await onSave(v);
      setState('saved');
    } catch (e) {
      setState('idle');
      setDraft(String(value ?? ''));
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <Box component="label" htmlFor={id} sx={{
      display: 'inline-flex', flexDirection: 'column', gap: '2px', minWidth: 0, cursor: disabled ? 'default' : 'text',
      ...(big ? { flex: '1 1 160px' } : {}),
    }}>
      <Box component="span" sx={big ? srOnly : { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--studio-muted)', textTransform: 'uppercase' }}>
        {label}
      </Box>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 44, px: big ? 0.75 : 1.25, ml: big ? -0.75 : 0,
        borderRadius: 'var(--studio-radius-md)', background: big ? 'transparent' : 'var(--studio-surf2)',
        border: '1px solid transparent', transition: 'border-color .15s, background-color .15s',
        '&:hover': disabled ? {} : { borderColor: 'var(--studio-border-strong)' },
        '&:focus-within': { borderColor: 'var(--studio-primary-text)', background: 'var(--studio-surf)', boxShadow: '0 0 0 3px var(--studio-p-soft)' },
      }}>
        <Box
          component="input"
          id={id}
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          min={type === 'number' ? min : undefined}
          step={type === 'number' ? step : undefined}
          value={draft}
          disabled={disabled || state === 'saving'}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { skip.current = true; setDraft(String(value ?? '')); (e.target as HTMLInputElement).blur(); }
          }}
          sx={{
            width: big ? '100%' : `${Math.max(2, size) + 1}ch`, minWidth: 0, border: 0, outline: 'none', background: 'transparent', p: 0,
            color: 'var(--studio-ink)', fontFamily: big ? 'var(--studio-font-heading)' : 'var(--studio-font-body)',
            fontWeight: big ? 'var(--studio-heading-weight)' : 700, fontSize: big ? '1.12rem' : '1rem',
            fontVariantNumeric: 'tabular-nums', textAlign: type === 'number' ? 'right' : 'left',
            MozAppearance: 'textfield', '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', m: 0 },
            '&:disabled': { opacity: 1, WebkitTextFillColor: 'var(--studio-ink)' },
          }}
        />
        {suffix && <Box component="span" aria-hidden sx={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--studio-muted)', whiteSpace: 'nowrap' }}>{suffix}</Box>}
        {state === 'saving' && <CircularProgress size={14} aria-label="Guardando" />}
        {state === 'saved' && <StudioIcon name="done" aria-hidden sx={{ fontSize: 18, color: 'var(--studio-ok)' }} />}
        {!big && state === 'idle' && !disabled && <StudioIcon name="edit" aria-hidden sx={{ fontSize: 14, color: 'var(--studio-muted)', opacity: 0.7 }} />}
      </Box>
      <Box component="span" role="status" sx={srOnly}>{state === 'saved' ? `${label}: guardado` : ''}</Box>
    </Box>
  );
}

/** Tarjeta de un elemento: franja de color, cabecera, datos y botones. */
export function ItemCard({ stripe, head, fields, footer, muted, tour }: {
  stripe?: string;
  head: ReactNode;
  fields?: ReactNode;
  footer?: ReactNode;
  muted?: boolean;
  tour?: string;
}) {
  return (
    <Box component="li" data-tour={tour} sx={{
      position: 'relative', display: 'flex', flexDirection: 'column', gap: 1.25, p: { xs: 1.75, sm: 2 }, pl: stripe ? { xs: 2.25, sm: 2.5 } : undefined,
      borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-card-bg, var(--studio-surf))', border: 'var(--studio-card-border, 1px solid var(--studio-border-color))',
      boxShadow: 'var(--studio-shadow-1)', overflow: 'hidden', minWidth: 0, opacity: muted ? 0.78 : 1,
      '[data-panel-style="brutalist"]:not([data-panel-classic]) &': { border: '2px solid var(--studio-ink)' },
    }}>
      {stripe && <Box aria-hidden sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: stripe }} />}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexWrap: 'wrap' }}>{head}</Box>
      {fields && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'flex-end' }}>{fields}</Box>}
      {footer && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mt: 'auto', pt: 0.25 }}>{footer}</Box>}
    </Box>
  );
}

/** Lista de tarjetas (rejilla que se adapta: una columna en el móvil). */
export function CardList({ children, label, min = 300 }: { children: ReactNode; label: string; min?: number }) {
  return (
    <Box component="ul" aria-label={label} data-tour="list" sx={{
      listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
    }}>
      {children}
    </Box>
  );
}

/** «+ Añadir …» con borde discontinuo (al final de cada lista). */
export function AddTile({ label, onClick, icon = 'plus' }: { label: string; onClick: () => void; icon?: StudioIconName }) {
  return (
    <Box component="li" sx={{ display: 'flex' }}>
      <ButtonBase onClick={onClick} data-tour="catalog-add" sx={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 64, px: 2,
        borderRadius: 'var(--studio-radius-lg)', border: '2px dashed var(--studio-border-strong)', color: 'var(--studio-ink)',
        fontWeight: 700, fontFamily: 'var(--studio-font-body)', fontSize: '0.98rem',
        '&:hover': { borderColor: 'var(--studio-primary-text)', color: 'var(--studio-primary-text)', background: 'var(--studio-p-soft)' },
        '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-fill)', outlineOffset: 2 },
      }}>
        <StudioIcon name={icon} aria-hidden />{label}
      </ButtonBase>
    </Box>
  );
}

/** Foto redonda o iniciales. */
export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0] || '').filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <Box aria-hidden sx={{
      width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center',
      background: 'var(--studio-c-yoga)', color: 'var(--studio-ink)', fontWeight: 700, fontSize: size * 0.36,
    }}>
      {src && !broken ? <Box component="img" src={src} alt="" loading="lazy" onError={() => setBroken(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </Box>
  );
}

/** Botones de pie de tarjeta: «Editar todo» y «Borrar». */
export function CardActions({ onEdit, onRemove, editLabel = 'Editar todo', name }: { onEdit: () => void; onRemove?: () => void; editLabel?: string; name: string }) {
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<StudioIcon name="edit" sx={{ fontSize: 18 }} />} onClick={onEdit}
        aria-label={`${editLabel}: ${name}`} sx={{ minHeight: 44 }}>
        {editLabel}
      </Button>
      {onRemove && (
        <Button size="small" onClick={onRemove} aria-label={`Borrar ${name}`}
          sx={{ minHeight: 44, color: 'var(--studio-bad)', '&:hover': { background: 'var(--studio-bad-soft)' } }}>
          Borrar
        </Button>
      )}
    </>
  );
}

/** Sección de una pestaña (título, una línea y su contenido). */
export function TabSection({ title, hint, children, id, right }: { title: string; hint?: ReactNode; children: ReactNode; id: string; right?: ReactNode }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mb: 3.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={id} component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)', fontSize: '1.2rem', color: 'var(--studio-ink)' }}>
            {title}
          </Typography>
          {hint && <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)', mt: 0.25 }}>{hint}</Typography>}
        </Box>
        {right}
      </Box>
      {children}
    </Box>
  );
}

/** Estado de carga / error de una pestaña. */
export function TabStatus({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) {
    return (
      <Box role="status" sx={{ py: 6, display: 'grid', placeItems: 'center', gap: 1.5 }}>
        <CircularProgress aria-label="Cargando" />
      </Box>
    );
  }
  if (!error) return null;
  return (
    <Box role="alert" sx={{ p: 2, borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-bad-soft)', color: 'var(--studio-bad)', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
      <StudioIcon name="warning" aria-hidden />
      <Typography sx={{ flex: 1, minWidth: 0, color: 'inherit', fontWeight: 600 }}>{error}</Typography>
      <Button onClick={onRetry} startIcon={<StudioIcon name="reload" />} sx={{ minHeight: 44, color: 'inherit' }}>Reintentar</Button>
    </Box>
  );
}
