// Piezas comunes de las pantallas de resumen (Hoy, Ventas, Mi web, Ajustes).
// Todo sale de las variables --studio-* del tema (paleta y forma del estilo),
// así se ven bien en natural, neón, brutalista… sin colores fijos.
import { ReactNode, useId } from 'react';
import { Box, Button, ButtonBase, Paper, Typography, type ButtonProps, type SxProps, type Theme } from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { HowItWorks } from '../../onboarding/coach';
import type { Tint } from './api';
import { TINTS, initialsOf } from './styles';

// ── Iconos por nombre (los que manda el API) ─────────────────────────────

const ICONS: Record<string, typeof CheckRoundedIcon> = {
  calendar: EventAvailableOutlinedIcon,
  schedule: CalendarMonthOutlinedIcon,
  wallet: AccountBalanceWalletOutlinedIcon,
  users: PeopleOutlineRoundedIcon,
  user: PersonOutlineRoundedIcon,
  layers: LayersOutlinedIcon,
  hourglass: HourglassEmptyRoundedIcon,
  card: CreditCardOutlinedIcon,
  clock: ScheduleRoundedIcon,
  link: LinkRoundedIcon,
  receipt: ReceiptLongOutlinedIcon,
  star: StarOutlineRoundedIcon,
  image: ImageOutlinedIcon,
  ticket: ConfirmationNumberOutlinedIcon,
  text: NotesRoundedIcon,
  help: HelpOutlineRoundedIcon,
  photos: PhotoLibraryOutlinedIcon,
  pin: PlaceOutlinedIcon,
  check: CheckRoundedIcon,
};

export function KitIcon({ name, size = 20 }: { name: string; size?: number }) {
  const I = ICONS[name] || LayersOutlinedIcon;
  return <I sx={{ fontSize: size }} aria-hidden />;
}


// ── Tarjeta ──────────────────────────────────────────────────────────────

/** `tour`: ancla de la visita guiada (data-tour, ver onboarding/coach/tours.ts). */
export function Card({ children, sx, labelledBy, id, tour }: { children: ReactNode; sx?: SxProps<Theme>; labelledBy?: string; id?: string; tour?: string }) {
  return (
    <Paper elevation={1} component="section" aria-labelledby={labelledBy} id={id} data-tour={tour}
      sx={[{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Paper>
  );
}

export function CardHead({ id, title, right, sx }: { id?: string; title: ReactNode; right?: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box sx={[{ display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: 'space-between', mb: 1.5, minHeight: 32 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Typography id={id} component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)', letterSpacing: 'var(--studio-heading-spacing)', fontSize: '1.08rem', color: 'var(--studio-ink)', minWidth: 0 }}>
        {title}
      </Typography>
      {right}
    </Box>
  );
}

// ── Cabecera de página ───────────────────────────────────────────────────

/** `page`: clave de su visita guiada (PAGE_TOURS): pone la píldora «Cómo funciona». */
export function PageHead({ icon, title, tint = 'reformer', actions, sub, page }: { icon: ReactNode; title: string; tint?: Tint; actions?: ReactNode; sub?: ReactNode; page?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 1.75 }, flexWrap: 'wrap', mt: { xs: 0.5, md: 0 }, mb: 2.25 }}>
      <Box aria-hidden sx={{ width: 44, height: 44, flex: 'none', borderRadius: 'var(--studio-radius-md)', display: 'grid', placeItems: 'center', background: `var(--studio-c-${tint})`, color: 'var(--studio-ink)' }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h1" tabIndex={-1} id="page-title" data-tour="page-head" sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, outline: 'none' }}>{title}</Typography>
        {sub && <Typography sx={{ color: 'var(--studio-muted)', fontSize: '0.92rem', mt: 0.25 }}>{sub}</Typography>}
      </Box>
      {page && <HowItWorks page={page} />}
      {actions && <Box data-tour="page-actions" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', width: { xs: '100%', sm: 'auto' }, '& > *': { flex: { xs: '1 1 auto', sm: 'none' } } }}>{actions}</Box>}
    </Box>
  );
}

// ── Botón suave (relleno con el tono de la marca) ────────────────────────

export function TonalButton({ sx, ...props }: ButtonProps) {
  return (
    <Button {...props} sx={[{
      bgcolor: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)', whiteSpace: 'nowrap',
      '&:hover': { bgcolor: 'rgb(var(--studio-primary-rgb) / 0.22)' },
    }, ...(Array.isArray(sx) ? sx : [sx])]} />
  );
}

// ── Segmentado (pestañas compactas) ──────────────────────────────────────

export function Seg<T extends string>({ value, options, onChange, label, mode = 'tabs', sx, tour }: {
  value: T;
  options: { value: T; label: ReactNode; aria?: string }[];
  onChange: (v: T) => void;
  label: string;
  mode?: 'tabs' | 'toggle';
  sx?: SxProps<Theme>;
  /** Ancla de la visita guiada (data-tour) */
  tour?: string;
}) {
  const tabs = mode === 'tabs';
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!tabs || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const i = options.findIndex((o) => o.value === value);
    const n = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
    onChange(n.value);
    const btn = (e.currentTarget.querySelector(`[data-v="${n.value}"]`) as HTMLButtonElement | null);
    btn?.focus();
  };
  return (
    <Box role={tabs ? 'tablist' : 'group'} aria-label={label} onKeyDown={onKey} data-tour={tour}
      sx={[{ display: 'inline-flex', p: 0.5, gap: 0.25, maxWidth: '100%', overflowX: 'auto', borderRadius: 'calc(var(--studio-radius-btn) + 4px)', background: 'var(--studio-surf2)', border: 'var(--studio-border-width) solid var(--studio-border-color)', scrollbarWidth: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <ButtonBase key={o.value} data-v={o.value} role={tabs ? 'tab' : undefined}
            aria-selected={tabs ? on : undefined} aria-pressed={tabs ? undefined : on} aria-label={o.aria}
            tabIndex={tabs && !on ? -1 : 0} onClick={() => onChange(o.value)}
            sx={{
              minHeight: 38, '@media (pointer: coarse)': { minHeight: 44 }, px: 1.75, gap: 0.75, borderRadius: 'var(--studio-radius-btn)', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap',
              color: on ? 'var(--studio-ink)' : 'var(--studio-muted)', background: on ? 'var(--studio-surf)' : 'transparent',
              boxShadow: on ? '0 1px 3px rgb(var(--studio-shadow-rgb) / 0.14)' : 'none',
              '&:hover': { color: 'var(--studio-ink)' },
              '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: 1 },
            }}>
            {o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

// ── Chips de estado ──────────────────────────────────────────────────────

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'n' | 'p';

const toneColors = (t: Tone) => (t === 'n'
  ? { background: 'var(--studio-surf2)', color: 'var(--studio-muted)' }
  : t === 'p' ? { background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }
    : { background: `var(--studio-${t}-soft)`, color: `var(--studio-${t})` });

export function Tag({ tone = 'n', children, sx }: { tone?: Tone; children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box component="span" sx={[{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 24, px: 1.1, borderRadius: 'var(--studio-radius-chip)', fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', ...toneColors(tone) }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Box>
  );
}

export function IBadge({ children, tone = 'p', size = 40, round = false, tint }: { children: ReactNode; tone?: Tone; size?: number; round?: boolean; tint?: Tint }) {
  return (
    <Box aria-hidden sx={{
      width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center',
      borderRadius: round ? '999px' : 'var(--studio-radius-md)',
      ...(tint ? { background: `var(--studio-c-${tint})`, color: 'var(--studio-ink)' } : toneColors(tone)),
    }}>
      {children}
    </Box>
  );
}

export function CountPill({ n, label }: { n: number; label: string }) {
  return (
    <Box component="span" aria-label={label} sx={{ minWidth: 26, height: 26, px: 1, borderRadius: 'var(--studio-radius-chip)', display: 'inline-grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: 700, background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)' }}>
      {n}
    </Box>
  );
}

// ── Personas ─────────────────────────────────────────────────────────────

function hashTint(s: string): Tint {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}


export function Avatar({ name, initials, size = 32, ring = true }: { name: string; initials?: string; size?: number; ring?: boolean }) {
  return (
    <Box component="span" aria-hidden title={name} sx={{
      width: size, height: size, flex: 'none', borderRadius: '999px', display: 'inline-grid', placeItems: 'center',
      fontSize: size < 30 ? '0.66rem' : '0.72rem', fontWeight: 700, background: `var(--studio-c-${hashTint(name)})`, color: 'var(--studio-ink)',
      border: ring ? '2px solid var(--studio-surf)' : 'none',
    }}>
      {initials || initialsOf(name)}
    </Box>
  );
}

export function AvatarStack({ people, total, max = 4 }: { people: { name: string; initials: string }[]; total: number; max?: number }) {
  if (!people.length) return null;
  const extra = total - Math.min(max, people.length);
  return (
    <Box aria-hidden sx={{ display: 'flex', '& > *:not(:first-of-type)': { ml: '-8px' } }}>
      {people.slice(0, max).map((p, i) => <Avatar key={`${p.name}${i}`} name={p.name} initials={p.initials} size={30} />)}
      {extra > 0 && (
        <Box component="span" sx={{ width: 30, height: 30, borderRadius: '999px', display: 'inline-grid', placeItems: 'center', fontSize: '0.7rem', fontWeight: 700, background: 'var(--studio-surf)', color: 'var(--studio-ink)', border: '2px solid var(--studio-surf)' }}>+{extra}</Box>
      )}
    </Box>
  );
}

// ── Gráficos pequeños ────────────────────────────────────────────────────

export function Spark({ values, label, width = 96, height = 34 }: { values: number[]; label: string; width?: number; height?: number }) {
  const gid = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const sx = width / (values.length - 1);
  const pts = values.map((v, i) => [i * sx, height - 3 - ((v - mn) / ((mx - mn) || 1)) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Box sx={{ width, height, flex: 'none', display: { xs: 'none', sm: 'block' } }}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}
      width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--studio-primary-text)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--studio-primary-text)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width} ${height} L0 ${height}Z`} fill={`url(#g${gid})`} />
      <path d={d} fill="none" stroke="var(--studio-primary-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--studio-primary-text)" />
    </svg>
    </Box>
  );
}

export function Meter({ value, max, label, full = false, width = 96 }: { value: number; max: number; label: string; full?: boolean; width?: number | string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <Box role="img" aria-label={label} sx={{ width, height: 8, borderRadius: 'var(--studio-radius-chip)', overflow: 'hidden', background: 'rgb(var(--studio-surf-rgb) / 0.75)', boxShadow: 'inset 0 0 0 1px var(--studio-border-color)' }}>
      <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 'inherit', background: full ? 'var(--studio-warn)' : 'var(--studio-primary-fill)', transition: 'width .4s' }} />
    </Box>
  );
}

export function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  const I = trend === 'up' ? TrendingUpRoundedIcon : trend === 'down' ? TrendingDownRoundedIcon : TrendingFlatRoundedIcon;
  return <I sx={{ fontSize: 16 }} aria-hidden />;
}

// ── Vacío con ejemplos ───────────────────────────────────────────────────

export function EmptyBox({ icon, title, text, examples, actions }: { icon: ReactNode; title: string; text: string; examples?: string[]; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5, py: { xs: 3.5, sm: 5 }, px: 2 }}>
      <IBadge size={60}>{icon}</IBadge>
      <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', fontSize: '1.3rem', color: 'var(--studio-ink)' }}>{title}</Typography>
      <Typography sx={{ color: 'var(--studio-muted)', maxWidth: '44ch' }}>{text}</Typography>
      {examples && examples.length > 0 && (
        <Box sx={{ background: 'var(--studio-surf2)', borderRadius: 'var(--studio-radius-md)', px: 2, py: 1.5, textAlign: 'left', width: '100%', maxWidth: 420 }}>
          <Typography component="p" variant="overline" sx={{ color: 'var(--studio-muted)', display: 'block', lineHeight: 1.8 }}>Ejemplos</Typography>
          {examples.map((e) => (
            <Box key={e} sx={{ display: 'flex', gap: 1, alignItems: 'center', minHeight: 30, fontSize: '0.88rem', color: 'var(--studio-ink)' }}>
              <CheckRoundedIcon sx={{ fontSize: 16, color: 'var(--studio-ok)' }} aria-hidden />{e}
            </Box>
          ))}
        </Box>
      )}
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</Box>}
    </Box>
  );
}
