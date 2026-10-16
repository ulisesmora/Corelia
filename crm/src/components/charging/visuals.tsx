// Piezas visuales de «Cómo se cobra»: fichas con icono, pasos con flecha,
// «si… → usa…», la barra del plazo para cancelar… Todo con las variables
// --studio-* (paleta y forma del estilo), así se ve bien en cualquier tema.
import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';

export type Tint = 'reformer' | 'mat' | 'barre' | 'yoga' | 'privada';

/** Icono en una pastilla de color. */
export function Badge({ icon, tint, size = 40 }: { icon: StudioIconName; tint?: Tint; size?: number }) {
  return (
    <Box aria-hidden sx={{
      width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 'var(--studio-radius-md)',
      background: tint ? `var(--studio-c-${tint})` : 'var(--studio-p-soft)',
      color: tint ? 'var(--studio-ink)' : 'var(--studio-primary-text)',
    }}>
      <StudioIcon name={icon} sx={{ fontSize: size * 0.5 }} />
    </Box>
  );
}

/** Un dato real del estudio, resaltado: «8 h», «12 €». */
export function Value({ children, tone = 'p' }: { children: ReactNode; tone?: 'p' | 'ok' | 'warn' | 'n' }) {
  const colors = tone === 'p' ? { background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }
    : tone === 'n' ? { background: 'var(--studio-surf2)', color: 'var(--studio-ink)' }
      : { background: `var(--studio-${tone}-soft)`, color: `var(--studio-${tone})` };
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: '2px', borderRadius: 'var(--studio-radius-chip)',
      fontWeight: 700, fontSize: '0.86rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', ...colors,
    }}>
      {children}
    </Box>
  );
}

/** Bloque de un capítulo: título pequeño con icono y su contenido. */
export function Block({ title, icon, children, id }: { title?: string; icon?: StudioIconName; children: ReactNode; id?: string }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 3 }}>
      {title && (
        <Typography id={id} component="h3" sx={{
          display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, fontWeight: 700, fontSize: '0.98rem', color: 'var(--studio-ink)',
        }}>
          {icon && <StudioIcon name={icon} aria-hidden sx={{ fontSize: 20, color: 'var(--studio-primary-text)' }} />}
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export interface TileProps { icon: StudioIconName; tint: Tint; title: string; text: string; value?: ReactNode }

/** Fichas (clase suelta / bono / membresía): en columna en el móvil. */
export function Tiles({ items }: { items: TileProps[] }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
      {items.map((t) => (
        <Box component="li" key={t.title} sx={{
          display: 'flex', flexDirection: 'column', gap: 0.75, p: 1.75, borderRadius: 'var(--studio-radius-lg)',
          background: 'var(--studio-surf)', border: 'var(--studio-border-width, 1px) solid var(--studio-border-color)', minWidth: 0,
        }}>
          <Badge icon={t.icon} tint={t.tint} size={38} />
          <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', lineHeight: 1.25 }}>{t.title}</Typography>
          <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)', lineHeight: 1.45 }}>{t.text}</Typography>
          {t.value && <Box sx={{ mt: 'auto', pt: 0.5 }}>{t.value}</Box>}
        </Box>
      ))}
    </Box>
  );
}

export interface FlowStep { icon: StudioIconName; title: string; text?: ReactNode; action?: { label: string; onClick: () => void } }

/** Pasos en orden, unidos por una línea (1 → 2 → 3). */
export function Flow({ steps, label }: { steps: FlowStep[]; label: string }) {
  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {steps.map((s, i) => (
        <Box component="li" key={s.title} sx={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', columnGap: 1.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Badge icon={s.icon} size={40} />
            {i < steps.length - 1 && (
              <Box aria-hidden sx={{ flex: 1, width: '2px', minHeight: 14, my: 0.5, borderRadius: 2, background: 'var(--studio-border-strong)' }} />
            )}
          </Box>
          <Box sx={{ pb: i < steps.length - 1 ? 1.75 : 0, pt: 0.75, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', lineHeight: 1.3 }}>
              <Box component="span" sx={visuallyHidden}>{`Paso ${i + 1}: `}</Box>{s.title}
            </Typography>
            {s.text && <Typography component="div" sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)', mt: 0.25, lineHeight: 1.5 }}>{s.text}</Typography>}
            {s.action && (
              <Button size="small" variant="outlined" onClick={s.action.onClick} endIcon={<StudioIcon name="next" sx={{ fontSize: 16 }} />}
                sx={{ mt: 1, minHeight: 44 }}>
                {s.action.label}
              </Button>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export interface ChoiceRow { when: string; use: string; icon: StudioIconName; hint?: string; action?: { label: string; onClick: () => void } }

/** «Si… → usa…»: para elegir la herramienta. */
export function Choices({ rows, label }: { rows: ChoiceRow[]; label: string }) {
  return (
    <Box component="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((r) => (
        <Box component="li" key={r.use} sx={{
          display: 'flex', gap: 1.25, alignItems: 'flex-start', p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)',
        }}>
          <Badge icon={r.icon} size={36} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>{r.when}</Typography>
            <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <StudioIcon name="next" aria-hidden sx={{ fontSize: 16, color: 'var(--studio-primary-text)' }} />{r.use}
            </Typography>
            {r.hint && <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', mt: 0.25 }}>{r.hint}</Typography>}
            {r.action && (
              <Button size="small" onClick={r.action.onClick} sx={{ mt: 0.5, minHeight: 44, px: 1, ml: -1 }}>{r.action.label}</Button>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** Opciones (con una marcada como recomendada). */
export function Options({ items, label }: { items: { icon: StudioIconName; title: string; text?: string; chip?: string }[]; label: string }) {
  return (
    <Box component="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map((o) => (
        <Box component="li" key={o.title} sx={{
          display: 'flex', gap: 1.25, alignItems: 'center', p: 1.25, borderRadius: 'var(--studio-radius-md)',
          border: '1px solid var(--studio-border-color)', background: 'var(--studio-surf)',
        }}>
          <Badge icon={o.icon} size={36} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)', fontSize: '0.94rem', display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              {o.title}{o.chip && <Value tone="ok">{o.chip}</Value>}
            </Typography>
            {o.text && <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>{o.text}</Typography>}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** El plazo para cancelar: [ hasta N h antes | últimas N h | clase ]. */
export function CancelWindow({ hours }: { hours: number }) {
  return (
    <Box role="img" aria-label={`Hasta ${hours} horas antes de la clase puede cancelar y recupera el crédito. En las últimas ${hours} horas ya no puede cancelar desde la web.`}>
      <Box aria-hidden sx={{ display: 'grid', gridTemplateColumns: '3fr 2fr auto', alignItems: 'stretch', gap: '3px' }}>
        <Box sx={{ ...seg, background: 'var(--studio-ok-soft)', color: 'var(--studio-ok)', borderRadius: 'var(--studio-radius-md) 4px 4px var(--studio-radius-md)' }}>
          <StudioIcon name="done" sx={{ fontSize: 18 }} />Recupera la clase
        </Box>
        <Box sx={{ ...seg, background: 'var(--studio-warn-soft)', color: 'var(--studio-warn)', borderRadius: '4px' }}>
          <StudioIcon name="lock" sx={{ fontSize: 16 }} />{hours} h
        </Box>
        <Box sx={{ ...seg, px: 1, background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)', borderRadius: '4px var(--studio-radius-md) var(--studio-radius-md) 4px' }}>
          <StudioIcon name="schedule" sx={{ fontSize: 18 }} />
        </Box>
      </Box>
      <Box aria-hidden sx={{ display: 'grid', gridTemplateColumns: '3fr 2fr auto', gap: '3px', mt: 0.5, fontSize: '0.74rem', color: 'var(--studio-muted)' }}>
        <span>Hasta {hours} h antes</span>
        <span>Últimas {hours} h</span>
        <span>Clase</span>
      </Box>
    </Box>
  );
}

const seg = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, minHeight: 40, px: 1, fontWeight: 700,
  fontSize: '0.82rem', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
} as const;

/** Nota pequeña al pie de un bloque. */
export function Note({ children, icon = 'tip' }: { children: ReactNode; icon?: StudioIconName }) {
  return (
    <Typography component="div" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.25, fontSize: '0.84rem', color: 'var(--studio-muted)', lineHeight: 1.5 }}>
      <StudioIcon name={icon} aria-hidden sx={{ fontSize: 18, mt: '1px', flex: 'none' }} />
      <span>{children}</span>
    </Typography>
  );
}

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
} as const;
