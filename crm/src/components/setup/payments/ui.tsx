// Piezas visuales de «Pagos online»: pasos numerados, fichas con icono,
// lista para marcar, consejos por pantalla y preguntas frecuentes.
import { useId, useState, type ReactNode } from 'react';
import { Box, ButtonBase, Collapse, IconButton, Tooltip, Typography } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../../site/StudioIcon';

export type Tone = 'n' | 'p' | 'ok' | 'warn' | 'bad';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  n: { bg: 'var(--studio-surf2)', fg: 'var(--studio-ink)' },
  p: { bg: 'var(--studio-p-soft)', fg: 'var(--studio-primary-text)' },
  ok: { bg: 'var(--studio-ok-soft)', fg: 'var(--studio-ok)' },
  warn: { bg: 'var(--studio-warn-soft)', fg: 'var(--studio-warn)' },
  bad: { bg: 'var(--studio-bad-soft)', fg: 'var(--studio-bad)' },
};

/** Pastilla de estado: «Cobrando», «Faltan datos»… */
export function Pill({ children, tone = 'p', icon }: { children: ReactNode; tone?: Tone; icon?: StudioIconName }) {
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.1, py: '3px', borderRadius: 'var(--studio-radius-chip, 999px)',
      fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap', background: TONE[tone].bg, color: TONE[tone].fg, lineHeight: 1.4,
    }}>
      {icon && <StudioIcon name={icon} aria-hidden sx={{ fontSize: 16 }} />}
      {children}
    </Box>
  );
}

/** Icono en un cuadrado de color. */
export function IconBox({ icon, tone = 'p', size = 40 }: { icon: StudioIconName; tone?: Tone; size?: number }) {
  return (
    <Box aria-hidden sx={{
      width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 'var(--studio-radius-md)',
      background: TONE[tone].bg, color: TONE[tone].fg,
    }}>
      <StudioIcon name={icon} sx={{ fontSize: size * 0.52 }} />
    </Box>
  );
}

export interface FactCard { icon: StudioIconName; title: string; text: ReactNode; tone?: Tone }

/** Fichas cortas (una idea en cada una), en rejilla que pasa a columna en el móvil. */
export function FactGrid({ items, label }: { items: FactCard[]; label: string }) {
  return (
    <Box component="ul" aria-label={label} sx={{
      listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25,
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
    }}>
      {items.map((c) => (
        <Box component="li" key={c.title} sx={{
          display: 'flex', gap: 1.25, alignItems: 'flex-start', p: 1.75, borderRadius: 'var(--studio-radius-lg)',
          background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)', minWidth: 0,
        }}>
          <IconBox icon={c.icon} tone={c.tone} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h4" sx={{ fontWeight: 700, color: 'var(--studio-ink)', lineHeight: 1.3, fontSize: '0.98rem' }}>{c.title}</Typography>
            <Typography component="div" sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)', lineHeight: 1.5, mt: 0.25 }}>{c.text}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export interface StepDef {
  key: string;
  title: string;
  /** Una línea, siempre visible */
  summary: string;
  content: ReactNode;
}

/**
 * Pasos 1-2-3-4 en vertical. Los anteriores al actual salen hechos (✓), el
 * actual abierto y los siguientes cerrados (se pueden abrir para leer qué
 * viene). `current` = índice del paso actual; `done` = todos hechos.
 */
export function GuideStepper({ steps, current, done = false, label }: { steps: StepDef[]; current: number; done?: boolean; label: string }) {
  const id = useId();
  const [peek, setPeek] = useState<string | null>(null);
  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {steps.map((s, i) => {
        const isDone = done ? true : i < current;
        const isCurrent = !done && i === current;
        const open = isCurrent || peek === s.key || (done && i === steps.length - 1);
        const status = isDone ? 'Hecho' : isCurrent ? 'Ahora' : 'Después';
        const last = i === steps.length - 1;
        return (
          <Box component="li" key={s.key} data-step={s.key} data-state={isDone ? 'done' : isCurrent ? 'current' : 'todo'}
            aria-current={isCurrent ? 'step' : undefined}
            sx={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', columnGap: { xs: 1.25, sm: 1.75 } }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box aria-hidden sx={{
                width: 36, height: 36, mt: 0.5, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.95rem',
                background: isDone ? 'var(--studio-ok)' : isCurrent ? 'var(--studio-primary-fill)' : 'var(--studio-surf2)',
                color: isDone || isCurrent ? 'var(--studio-on-primary, #fff)' : 'var(--studio-muted)',
                boxShadow: isCurrent ? '0 0 0 4px var(--studio-p-soft)' : 'none',
              }}>
                {isDone ? <StudioIcon name="done" sx={{ fontSize: 20 }} /> : i + 1}
              </Box>
              {!last && <Box aria-hidden sx={{ flex: 1, width: '2px', minHeight: 16, my: 0.75, borderRadius: 2, background: isDone ? 'var(--studio-ok)' : 'var(--studio-border-strong)' }} />}
            </Box>
            <Box sx={{ pb: last ? 0 : 2.25, minWidth: 0 }}>
              <ButtonBase
                onClick={() => !isCurrent && setPeek((p) => (p === s.key ? null : s.key))}
                disabled={isCurrent}
                aria-expanded={open}
                aria-controls={`${id}-${s.key}`}
                sx={{
                  display: 'flex', width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1, minHeight: 44, borderRadius: 'var(--studio-radius-md)',
                  px: 0.5, mx: -0.5, flexWrap: 'wrap', '&.Mui-disabled': { color: 'inherit' },
                  '&:hover': { background: isCurrent ? 'transparent' : 'var(--studio-surf2)' },
                  '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)' },
                }}
              >
                <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                  <Typography component="span" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.08rem' }, color: 'var(--studio-ink)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Box component="span" sx={visuallyHidden}>{`Paso ${i + 1} (${status}): `}</Box>
                    {s.title}
                    <Pill tone={isDone ? 'ok' : isCurrent ? 'p' : 'n'}>{status}</Pill>
                  </Typography>
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.86rem', color: 'var(--studio-muted)', lineHeight: 1.4 }}>{s.summary}</Typography>
                </Box>
                {!isCurrent && (
                  <StudioIcon name="next" aria-hidden sx={{ fontSize: 18, color: 'var(--studio-muted)', transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .2s' }} />
                )}
              </ButtonBase>
              <Collapse in={open} id={`${id}-${s.key}`} unmountOnExit>
                <Box sx={{ pt: 1.5, opacity: isCurrent || (done && last) ? 1 : 0.92 }}>{s.content}</Box>
              </Collapse>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export interface CheckItem { key: string; title: string; hint?: ReactNode }

/** Lista para marcar («Prepara tus datos»). Solo te ayuda a ti: no se guarda. */
export function Checklist({ items, label }: { items: CheckItem[]; label: string }) {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <Box component="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {items.map((it) => {
        const checked = !!on[it.key];
        return (
          <Box component="li" key={it.key} sx={{
            borderRadius: 'var(--studio-radius-md)', background: checked ? 'var(--studio-ok-soft)' : 'var(--studio-surf2)', transition: 'background .15s',
          }}>
            <ButtonBase
              role="checkbox"
              aria-checked={checked}
              onClick={() => setOn((o) => ({ ...o, [it.key]: !o[it.key] }))}
              sx={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'flex-start', gap: 1.25, px: 1.25, pt: 1.25, pb: it.hint ? 0.25 : 1.25,
                textAlign: 'left', borderRadius: 'var(--studio-radius-md)', '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)' },
              }}
            >
              <Box component="span" aria-hidden sx={{
                width: 24, height: 24, flex: 'none', borderRadius: '7px', display: 'grid', placeItems: 'center',
                border: checked ? 'none' : '2px solid var(--studio-border-strong)', background: checked ? 'var(--studio-ok)' : 'var(--studio-surf)',
                color: '#fff',
              }}>
                {checked && <StudioIcon name="done" sx={{ fontSize: 18 }} />}
              </Box>
              <Typography component="span" sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.95rem', lineHeight: 1.35 }}>{it.title}</Typography>
            </ButtonBase>
            {it.hint && (
              <Typography component="div" sx={{ pl: '54px', pr: 1.25, pb: 1.25, fontSize: '0.84rem', color: 'var(--studio-muted)', lineHeight: 1.45 }}>{it.hint}</Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export interface TipRow { title: string; text: ReactNode }

/** «Qué te pedirá Stripe»: pantallas numeradas con un consejo corto. */
export function ScreenTips({ rows, label }: { rows: TipRow[]; label: string }) {
  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75, counterReset: 'tip' }}>
      {rows.map((r, i) => (
        <Box component="li" key={r.title} sx={{
          display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 1, p: 1.25, borderRadius: 'var(--studio-radius-md)',
          border: '1px solid var(--studio-border-color)', background: 'var(--studio-surf)',
        }}>
          <Box aria-hidden sx={{
            width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: 800,
            background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)',
          }}>{i + 1}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.93rem' }}>{r.title}</Typography>
            <Typography component="div" sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', lineHeight: 1.5 }}>{r.text}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** Texto para copiar (la web del estudio, el descriptor…). */
export function CopyChip({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* sin portapapeles: se puede seleccionar a mano */ }
  };
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.25, pl: 1, pr: 0.25, borderRadius: 'var(--studio-radius-chip, 999px)',
      background: 'var(--studio-surf2)', color: 'var(--studio-ink)', fontWeight: 700, fontSize: '0.84rem', maxWidth: '100%', verticalAlign: 'middle',
    }}>
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all' }}>{text}</Box>
      <Tooltip title={copied ? 'Copiado' : `Copiar ${label}`}>
        <IconButton size="small" onClick={copy} aria-label={`Copiar ${label}`} sx={{ width: 32, height: 32, color: 'var(--studio-primary-text)' }}>
          <StudioIcon name={copied ? 'done' : 'copy'} sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export interface FaqItem { q: string; a: ReactNode }

/** Preguntas frecuentes (una abierta cada vez). */
export function Faq({ items, title = 'Preguntas frecuentes' }: { items: FaqItem[]; title?: string }) {
  const id = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Box component="section" aria-labelledby={`${id}-h`}>
      <Typography id={`${id}-h`} component="h3" sx={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--studio-ink)', mb: 1 }}>{title}</Typography>
      <Box sx={{ borderRadius: 'var(--studio-radius-lg)', border: '1px solid var(--studio-border-color)', overflow: 'hidden', background: 'var(--studio-surf)' }}>
        {items.map((it, i) => {
          const on = open === i;
          return (
            <Box key={it.q} sx={{ borderTop: i ? '1px solid var(--studio-border-color)' : 0 }}>
              <ButtonBase
                onClick={() => setOpen(on ? null : i)}
                aria-expanded={on}
                aria-controls={`${id}-${i}`}
                sx={{
                  display: 'flex', width: '100%', justifyContent: 'space-between', gap: 1, px: 2, py: 1.25, minHeight: 52, textAlign: 'left',
                  fontFamily: 'var(--studio-font-body)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--studio-ink)',
                  '&:hover': { background: 'var(--studio-surf2)' }, '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: -2 },
                }}
              >
                <span>{it.q}</span>
                <StudioIcon name="plus" aria-hidden sx={{ fontSize: 20, flex: 'none', color: 'var(--studio-primary-text)', transform: on ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }} />
              </ButtonBase>
              <Collapse in={on} id={`${id}-${i}`}>
                <Typography component="div" sx={{ px: 2, pb: 1.75, fontSize: '0.9rem', color: 'var(--studio-muted)', lineHeight: 1.55 }}>{it.a}</Typography>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
} as const;
