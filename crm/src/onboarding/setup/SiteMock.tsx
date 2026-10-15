import { Box } from '@mui/material';
import { useClassTypeColor } from '../../design/classColors';
import { Eyebrow } from './ui';

export interface SiteMockProps {
  name: string;
  city?: string;
  logo?: string;
  webUrl?: string;
  /** Qué partes enseñar */
  only: ('hero' | 'classes' | 'prices')[];
  classes?: { id: number | string; title: string; minutes: number }[];
  prices?: { name: string; price: string; note: string }[];
  currency?: string;
}

const money = (value: string, currency = 'EUR') => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${n} €`;
  }
};

/**
 * Tu web en miniatura, al lado de cada paso («Tu web, en directo»). Usa los
 * colores y la letra del estudio (las mismas variables CSS que el panel).
 */
export default function SiteMock({ name, city, logo, webUrl, only, classes = [], prices = [], currency }: SiteMockProps) {
  const color = useClassTypeColor();
  const studio = name.trim() || 'Tu estudio';
  const host = (webUrl || 'tuestudio.corelia.app').replace(/^https?:\/\//, '');
  const btn = (primary: boolean) => ({
    display: 'inline-flex', alignItems: 'center', minHeight: 32, px: 1.5, fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' as const,
    borderRadius: 'var(--studio-radius-btn)',
    ...(primary
      ? { background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)', boxShadow: 'var(--studio-btn-shadow)' }
      : { border: '1px solid var(--studio-border-strong)', color: 'var(--studio-ink)' }),
  });
  const heading = { fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', textTransform: 'var(--studio-heading-transform)' };

  return (
    <Box aria-hidden>
      <Eyebrow icon="eye">Tu web, en directo</Eyebrow>
      <Box sx={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--studio-border-color)', background: 'var(--studio-bg)', boxShadow: 'var(--studio-shadow-2)', color: 'var(--studio-ink)', fontFamily: 'var(--studio-font-body)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 1, background: 'var(--studio-surf2)', borderBottom: '1px solid var(--studio-border-color)' }}>
          {[0, 1, 2].map((i) => <Box key={i} sx={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--studio-border-strong)' }} />)}
          <Box sx={{ ml: 1.25, flex: 1, maxWidth: 240, fontSize: '0.7rem', color: 'var(--studio-muted)', background: 'var(--studio-surf)', px: 1.25, py: 0.4, borderRadius: 99, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {host}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 1.75, borderBottom: only.includes('hero') ? 'none' : '1px solid var(--studio-border-color)' }}>
          <Box sx={{ width: 30, height: 30, borderRadius: 'min(var(--studio-radius-md), 10px)', overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)', fontWeight: 700, fontSize: '0.8rem', flex: 'none' }}>
            {logo ? <Box component="img" src={logo} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', background: 'var(--studio-surf)' }} /> : studio[0].toUpperCase()}
          </Box>
          <Box sx={{ ...heading, fontSize: '0.95rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{studio}</Box>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '0.74rem', color: 'var(--studio-muted)' }}>
            <Box component="span" sx={{ display: { xs: 'none', xl: 'inline' } }}>Clases</Box>
            <Box component="span" sx={{ display: { xs: 'none', xl: 'inline' } }}>Precios</Box>
            <Box sx={btn(true)}>Reservar clase</Box>
          </Box>
        </Box>

        {only.includes('hero') && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 2.5, px: 2.5, pt: 2, pb: 3, alignItems: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ ...heading, fontSize: '1.6rem', lineHeight: 1.05, mb: 1.25, overflowWrap: 'anywhere' }}>Clases que te sientan bien</Box>
              <Box sx={{ color: 'var(--studio-muted)', fontSize: '0.82rem', mb: 1.75 }}>
                {classes.length ? classes.slice(0, 4).map((c) => c.title).join(', ') : 'Pilates, yoga y más'} en grupos pequeños{city ? `, en ${city}` : ''}.
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={btn(true)}>Reservar clase</Box>
                <Box sx={btn(false)}>Ver horario</Box>
              </Box>
            </Box>
            <Box sx={{
              aspectRatio: '4 / 4.2', borderRadius: 'var(--studio-radius-xl)', position: 'relative', overflow: 'hidden', color: 'var(--studio-primary-fill)',
              background: 'radial-gradient(120% 90% at 20% 10%, var(--studio-c-mat), transparent 60%), radial-gradient(90% 80% at 90% 90%, var(--studio-c-yoga), transparent 60%), linear-gradient(160deg, var(--studio-p-soft), var(--studio-surf2))',
            }}>
              <Box component="svg" viewBox="0 0 200 120" sx={{ position: 'absolute', inset: 'auto 0 0 0', width: '100%' }}>
                <circle cx="150" cy="40" r="22" fill="currentColor" opacity=".35" />
                <path d="M0 95 C40 70 70 70 100 88 S160 105 200 80 V120 H0Z" fill="currentColor" opacity=".55" />
                <path d="M0 105 C50 90 90 96 130 104 S180 110 200 100 V120 H0Z" fill="currentColor" />
              </Box>
            </Box>
          </Box>
        )}

        {only.includes('classes') && (
          <Box sx={{ px: 2.5, py: 2.25, borderTop: '1px solid var(--studio-border-color)' }}>
            <Box sx={{ ...heading, fontSize: '1rem', mb: 1.5 }}>Clases</Box>
            {classes.length ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 1 }}>
                {classes.slice(0, 8).map((c) => (
                  <Box key={c.id} sx={{ p: 1.25, borderRadius: 'var(--studio-radius-md)', background: color(c.id).tint, color: 'var(--studio-ink)', fontSize: '0.78rem' }}>
                    <Box sx={{ fontWeight: 700, fontSize: '0.84rem', overflowWrap: 'anywhere' }}>{c.title}</Box>
                    {c.minutes} min
                  </Box>
                ))}
              </Box>
            ) : <Box sx={{ color: 'var(--studio-muted)', fontSize: '0.84rem' }}>Elige tus clases y aparecerán aquí.</Box>}
          </Box>
        )}

        {only.includes('prices') && (
          <Box sx={{ px: 2.5, py: 2.25 }}>
            <Box sx={{ ...heading, fontSize: '1rem', mb: 1.5 }}>Precios</Box>
            {prices.length ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1 }}>
                {prices.slice(0, 6).map((p) => (
                  <Box key={p.name} sx={{ p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)', fontSize: '0.76rem' }}>
                    <Box>{p.name}</Box>
                    <Box sx={{ fontWeight: 800, fontSize: '1.05rem', my: 0.5 }}>{money(p.price, currency)}</Box>
                    <Box sx={{ color: 'var(--studio-muted)' }}>{p.note}</Box>
                  </Box>
                ))}
              </Box>
            ) : <Box sx={{ color: 'var(--studio-muted)', fontSize: '0.84rem' }}>Enciende un bono y aparecerá aquí.</Box>}
          </Box>
        )}
      </Box>
    </Box>
  );
}
