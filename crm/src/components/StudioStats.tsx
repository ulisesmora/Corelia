import { ReactNode, useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import EmojiPeopleIcon from '@mui/icons-material/EmojiPeople';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import RefreshIcon from '@mui/icons-material/Refresh';
import { authHeaders } from '../utils/auth';
import { EmptyState, HelpTip } from './guide';
import { API_BASE_URL } from '../config';
import { useSite } from '../site/SiteProvider';
import { money } from '../site/money';

export interface ClassRow { title: string; sessions: number; bookings: number; avg_people: number; capacity: number | null; fill_pct: number | null }
export interface Stats {
  /** Moneda de los importes (*_eur es un nombre histórico) */
  currency?: string;
  /** Pagos del periodo en otra moneda (de antes de cambiarla): no se suman */
  other_currency_payments?: number;
  period: { label: string; compare_label: string; month_name: string; prev_month_name: string };
  kpis: {
    sales_eur: number; sales_prev_eur: number; sales_change_pct: number | null; sales_prev_full_month_eur: number;
    sales_count: number; sales_by_kind: Record<string, number>;
    new_clients: number; new_clients_prev: number; new_guests: number; new_guests_prev: number;
    first_timers: number; first_timers_prev: number; bookings: number; bookings_prev: number;
    active_clients_30d: number; active_clients_prev_30d: number;
  };
  memberships: { active: number; past_due: number; monthly_recurring_eur: number; new_this_month: number };
  retention: { tried: number; came_back: number; rate_pct: number | null };
  monthly: { month: string; label: string; sales_eur: number; new_clients: number; first_timers: number; bookings: number; partial: boolean }[];
  top_classes: ClassRow[];
  quiet_classes: ClassRow[];
  busiest_slots: { weekday: string; hour: string; bookings: number }[];
  at_risk: { name: string; phone: string | null; email: string | null; last_visit: string; visits_before: number; is_guest: boolean }[];
  at_risk_total: number;
  newest_clients: { name: string; joined: string; source: string; has_booked: boolean; phone: string | null }[];
  sources: { source: string; count: number }[];
}

let cache: Promise<Stats> | null = null;

/** Una sola petición por visita al Inicio, compartida por el resumen y el panel. */
export function loadStudioStats(force = false): Promise<Stats> {
  if (!cache || force) {
    cache = fetch(`${API_BASE_URL}v1/stats/dashboard/?months=6`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)));
    cache.catch(() => { cache = null; });
  }
  return cache;
}

const dec = (n: number) => String(n).replace('.', ',');

/** Importe en la moneda del estudio, sin decimales si es entero ("120 €", "$549"). */
export const amount = (n: number) => money(n, { decimals: 'auto' });
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 9) digits = `34${digits}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const cardSx = { p: { xs: 2, md: 2.5 }, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' } as const;

function SectionTitle({ children, help }: { children: ReactNode; help?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
      <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)' }}>{children}</Typography>
      {help && <HelpTip>{help}</HelpTip>}
    </Stack>
  );
}

function Trend({ cur, prev, isMoney = false, compare }: { cur: number; prev: number; isMoney?: boolean; compare: string }) {
  if (!prev && !cur) return <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>Sin datos para comparar</Typography>;
  const diff = cur - prev;
  const pct = prev ? Math.round((diff / prev) * 100) : null;
  const up = diff > 0;
  const same = diff === 0;
  const color = same ? 'var(--studio-text-muted)' : up ? 'var(--studio-success-text, #3D6B2E)' : 'var(--studio-danger-text, #A0473A)';
  const Icon = same ? TrendingFlatIcon : up ? TrendingUpIcon : TrendingDownIcon;
  const delta = isMoney ? amount(Math.abs(diff)) : `${Math.abs(diff)}`;
  return (
    <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ color }}>
      <Icon sx={{ fontSize: 20, mt: '1px' }} aria-hidden />
      <Typography sx={{ fontSize: '0.88rem', color, lineHeight: 1.4 }}>
        {same
          ? `Igual que en los ${compare}`
          : `${delta} ${up ? 'más' : 'menos'}${pct !== null ? ` (${up ? '+' : '−'}${Math.abs(pct)} %)` : ''} que en los ${compare}`}
      </Typography>
    </Stack>
  );
}

function Kpi({ icon, label, value, children, help }: { icon: ReactNode; label: string; value: string; children?: ReactNode; help: ReactNode }) {
  return (
    <Paper elevation={0} sx={{ ...cardSx, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box aria-hidden sx={{ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center', backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.14)', color: 'var(--studio-primary-deep)' }}>
          {icon}
        </Box>
        <Typography sx={{ fontWeight: 600, color: 'var(--studio-text-strong)', fontSize: '0.95rem', flex: 1 }}>{label}</Typography>
        <HelpTip title={label}>{help}</HelpTip>
      </Stack>
      <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '2rem', fontWeight: 600, color: 'var(--studio-dark)', lineHeight: 1.15 }}>
        {value}
      </Typography>
      {children}
    </Paper>
  );
}

/** Barras simples (sin librerías): cada mes con su cifra escrita encima. */
function MonthBars({ rows, field, format }: { rows: Stats['monthly']; field: 'sales_eur' | 'new_clients' | 'first_timers'; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[field]));
  return (
    <Box
      role="img"
      aria-label={rows.map((r) => `${r.label}: ${format(r[field])}`).join(', ')}
      sx={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 1, alignItems: 'end', height: 170, pt: 1 }}
    >
      {rows.map((r) => (
        <Stack key={r.month} alignItems="center" justifyContent="flex-end" sx={{ height: '100%', minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--studio-text-strong)', mb: 0.5, whiteSpace: 'nowrap' }}>
            {format(r[field])}
          </Typography>
          <Box
            sx={{
              width: '100%', maxWidth: 46, borderRadius: '8px 8px 3px 3px',
              height: `${Math.max(3, (r[field] / max) * 110)}px`,
              background: r.partial
                ? 'repeating-linear-gradient(135deg, var(--studio-primary-light) 0 6px, var(--studio-primary-pale) 6px 12px)'
                : 'linear-gradient(180deg, var(--studio-primary), var(--studio-primary-shade))',
            }}
          />
          <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-text-muted)', mt: 0.5 }}>{r.label}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

function FillBar({ pct }: { pct: number | null }) {
  const v = Math.min(100, pct ?? 0);
  const color = v >= 85 ? '#7D9B6C' : v >= 50 ? '#D4A574' : '#C2857A';
  return (
    <Box sx={{ height: 8, borderRadius: 4, backgroundColor: 'rgb(var(--studio-line-rgb) / 0.2)', overflow: 'hidden' }} aria-hidden>
      <Box sx={{ width: `${v}%`, height: '100%', backgroundColor: color }} />
    </Box>
  );
}

const KIND_LABEL: Record<string, string> = {
  packs: 'Bonos', memberships: 'Membresías', classes: 'Clases sueltas', other: 'Otros',
};

/**
 * "Cómo va el estudio": ventas, altas, primeras clases, cuántas vuelven,
 * clases llenas/vacías y a quién escribir. Todo con su explicación "?".
 */
export default function StudioStats() {
  const studioName = useSite().config.studio_name;
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [chart, setChart] = useState<'sales_eur' | 'new_clients' | 'first_timers'>('sales_eur');

  const load = (force = false) => {
    setError(false);
    setData(null);
    loadStudioStats(force).then(setData).catch(() => setError(true));
  };
  useEffect(() => load(), []);

  if (error) {
    return (
      <Paper elevation={0} sx={cardSx}>
        <EmptyState
          compact
          title="No se han podido cargar las cifras"
          text="Puede ser la conexión. Si sigue pasando, avisa a soporte técnico."
          action={<Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => load(true)}>Reintentar</Button>}
        />
      </Paper>
    );
  }
  if (!data) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, py: 5 }}>
        <Stack alignItems="center" spacing={1.5}>
          <CircularProgress size={30} />
          <Typography sx={{ color: 'text.secondary' }}>Calculando las cifras del estudio…</Typography>
        </Stack>
      </Paper>
    );
  }

  const { kpis: k, memberships: ms, retention: rt, period } = data;
  const cmp = period.compare_label;
  const newTotal = k.new_clients + k.new_guests;
  const newPrev = k.new_clients_prev + k.new_guests_prev;

  return (
    <Box>
      <Typography sx={{ color: 'text.secondary', mb: 2, fontSize: '0.98rem' }}>
        Cifras de <b>{period.label}</b>, comparadas con los {cmp} (así la comparación es justa aunque el mes no haya terminado).
      </Typography>

      {/* Cifras principales */}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, mb: 2.5 }}>
        <Kpi
          icon={<PaymentsOutlinedIcon />}
          label="Ventas por la web"
          value={amount(k.sales_eur)}
          help={
            <>
              Todo lo que se ha cobrado por la web este mes: bonos, clases sueltas, altas de membresía y sus cobros
              automáticos. <b>No incluye</b> lo que te pagan en mano o por Bizum. El mes pasado completo fueron{' '}
              <b>{amount(k.sales_prev_full_month_eur)}</b>.
              {!!data.other_currency_payments && (
                <> Hay {data.other_currency_payments} pago{data.other_currency_payments === 1 ? '' : 's'} en otra
                  moneda (de antes de cambiarla) que no se suman aquí; los ves en Pagos.</>
              )}
            </>
          }
        >
          <Trend cur={k.sales_eur} prev={k.sales_prev_eur} isMoney compare={cmp} />
          {Object.keys(k.sales_by_kind).length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.5 }}>
              {Object.entries(k.sales_by_kind).map(([kind, v]) => (
                <Chip key={kind} size="small" label={`${KIND_LABEL[kind] || kind}: ${amount(v)}`} />
              ))}
            </Stack>
          )}
        </Kpi>
        <Kpi
          icon={<PersonAddAlt1Icon />}
          label="Clientes nuevos"
          value={String(newTotal)}
          help={
            <>
              Personas nuevas este mes: las que se han creado una cuenta ({k.new_clients}) más las que reservaron sin
              cuenta, como invitados ({k.new_guests}). Si esta cifra baja, conviene mover redes sociales o hacer una promoción.
            </>
          }
        >
          <Trend cur={newTotal} prev={newPrev} compare={cmp} />
        </Kpi>
        <Kpi
          icon={<EmojiPeopleIcon />}
          label="Primera clase"
          value={String(k.first_timers)}
          help="Personas que han venido a su PRIMERA clase este mes. Es la mejor señal de que el estudio crece: gente nueva que de verdad viene, no solo que se registra."
        >
          <Trend cur={k.first_timers} prev={k.first_timers_prev} compare={cmp} />
        </Kpi>
        <Kpi
          icon={<EventAvailableIcon />}
          label="Clases reservadas"
          value={String(k.bookings)}
          help={
            <>
              Plazas ocupadas en clases que ya se han dado este mes (sin contar cancelaciones). En los últimos 30 días
              han venido <b>{k.active_clients_30d}</b> personas distintas (los 30 días anteriores: {k.active_clients_prev_30d}).
            </>
          }
        >
          <Trend cur={k.bookings} prev={k.bookings_prev} compare={cmp} />
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
            {k.active_clients_30d} personas distintas en 30 días
          </Typography>
        </Kpi>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' }, mb: 2 }}>
        {/* Evolución */}
        <Paper elevation={0} sx={cardSx}>
          <SectionTitle help="Cada barra es un mes. La barra rayada es el mes en curso, que aún no ha terminado.">
            Últimos 6 meses
          </SectionTitle>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
            {([
              ['sales_eur', 'Ventas'],
              ['new_clients', 'Clientes nuevos'],
              ['first_timers', 'Primera clase'],
            ] as const).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                onClick={() => setChart(key)}
                color={chart === key ? 'primary' : 'default'}
                variant={chart === key ? 'filled' : 'outlined'}
                sx={{ minHeight: 36, fontSize: '0.9rem' }}
                aria-pressed={chart === key}
              />
            ))}
          </Stack>
          <MonthBars rows={data.monthly} field={chart} format={chart === 'sales_eur' ? amount : (n) => String(n)} />
        </Paper>

        {/* Membresías y retención */}
        <Stack spacing={2}>
          <Paper elevation={0} sx={cardSx}>
            <SectionTitle help="El 'ingreso fijo' es lo que suman al mes las membresías activas (las de 2 o 3 meses se reparten por mes). Es dinero que entra solo cada mes.">
              Membresías
            </SectionTitle>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Box>
                <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.7rem', fontWeight: 600 }}>{ms.active}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>activas</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.7rem', fontWeight: 600 }}>{amount(ms.monthly_recurring_eur)}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>ingreso fijo al mes</Typography>
              </Box>
            </Stack>
            <Typography sx={{ mt: 1, fontSize: '0.92rem', color: 'var(--studio-text-strong)' }}>
              {ms.new_this_month === 0
                ? 'Ninguna nueva este mes. '
                : ms.new_this_month === 1 ? '1 nueva este mes. ' : `${ms.new_this_month} nuevas este mes. `}
              {ms.past_due > 0 && (
                <b style={{ color: 'var(--studio-danger-text, #A0473A)' }}>
                  {ms.past_due === 1 ? '1 tiene el pago pendiente.' : `${ms.past_due} tienen el pago pendiente.`}
                </b>
              )}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={cardSx}>
            <SectionTitle help="Miramos a quienes vinieron por primera vez hace entre 1 y 3 meses y contamos cuántas personas han vuelto al menos una vez más. Si vuelven pocas, prueba a escribirles después de su primera clase.">
              ¿Vuelven quienes prueban?
            </SectionTitle>
            {rt.tried === 0 ? (
              <Typography sx={{ color: 'text.secondary' }}>Aún no hay suficientes datos.</Typography>
            ) : (
              <>
                <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.7rem', fontWeight: 600 }}>
                  {rt.came_back} de {rt.tried}
                </Typography>
                <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.92rem' }}>
                  han vuelto después de su primera clase ({rt.rate_pct} %).
                </Typography>
              </>
            )}
          </Paper>
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, mb: 2 }}>
        {/* Clases llenas / vacías */}
        <Paper elevation={0} sx={cardSx}>
          <SectionTitle help="Media de personas por clase en los últimos 30 días frente a las plazas que tiene. Verde: casi llena. Naranja: a medias. Rojo: poca gente.">
            Clases más llenas
          </SectionTitle>
          {data.top_classes.length === 0 ? (
            <Typography sx={{ color: 'text.secondary' }}>Sin clases en los últimos 30 días.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {data.top_classes.map((c) => (
                <Box key={c.title}>
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }} noWrap>{c.title}</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-strong)', flexShrink: 0 }}>
                      {dec(c.avg_people)}{c.capacity ? ` de ${c.capacity}` : ''} de media
                    </Typography>
                  </Stack>
                  <FillBar pct={c.fill_pct} />
                </Box>
              ))}
            </Stack>
          )}
          {data.top_classes.some((c) => (c.fill_pct ?? 0) >= 90) && (
            <Typography sx={{ mt: 1.5, fontSize: '0.9rem', color: 'var(--studio-success-text, #3D6B2E)' }}>
              💡 Las que están casi llenas son buena señal: podrías abrir otro horario de esa clase.
            </Typography>
          )}
          {data.quiet_classes.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 600, mt: 2.5, mb: 1, color: 'var(--studio-dark)' }}>Con menos gente</Typography>
              <Stack spacing={1.5}>
                {data.quiet_classes.map((c) => (
                  <Box key={c.title}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }} noWrap>{c.title}</Typography>
                      <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-strong)', flexShrink: 0 }}>
                        {dec(c.avg_people)}{c.capacity ? ` de ${c.capacity}` : ''} de media
                      </Typography>
                    </Stack>
                    <FillBar pct={c.fill_pct} />
                  </Box>
                ))}
              </Stack>
              <Typography sx={{ mt: 1.5, fontSize: '0.9rem', color: 'var(--studio-text-strong)' }}>
                💡 Para llenarlas: envía un aviso a tus clientes, prueba otra hora o anúnciala en redes.
              </Typography>
            </>
          )}
          {data.busiest_slots.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 600, mt: 2.5, mb: 1, color: 'var(--studio-dark)' }}>Días y horas con más gente</Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {data.busiest_slots.map((s) => (
                  <Chip key={`${s.weekday}${s.hour}`} label={`${s.weekday} ${s.hour} · ${s.bookings} reservas`} variant="outlined" />
                ))}
              </Stack>
            </>
          )}
        </Paper>

        {/* A quién escribir */}
        <Paper elevation={0} sx={cardSx}>
          <SectionTitle help="Clientes que venían a menudo (3 o más veces entre hace 1 y 3 meses) y llevan más de un mes sin venir ni tener reservas. Un mensaje personal suele hacer que vuelvan.">
            Hace tiempo que no vienen
          </SectionTitle>
          {data.at_risk.length === 0 ? (
            <Typography sx={{ color: 'text.secondary' }}>¡Nadie! Todos tus clientes habituales siguen viniendo.</Typography>
          ) : (
            <Stack spacing={1}>
              {data.at_risk.slice(0, 6).map((c) => {
                const first = c.name.split(' ')[0];
                const link = waLink(c.phone, `¡Hola ${first}! Te echamos de menos en ${studioName} 💛 ¿Te guardo sitio en alguna clase esta semana?`);
                return (
                  <Stack key={`${c.name}${c.last_visit}`} direction="row" alignItems="center" spacing={1.25}
                    sx={{ p: 1.25, borderRadius: 3, backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.8)', border: '1px solid rgb(var(--studio-line-rgb) / 0.25)' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>{c.name}</Typography>
                      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                        Última clase: {shortDate(c.last_visit)} · antes venía {c.visits_before} veces
                      </Typography>
                    </Box>
                    {link ? (
                      <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={link} target="_blank" rel="noopener" sx={{ minHeight: 40, flexShrink: 0 }}>
                        Escribir
                      </Button>
                    ) : c.email ? (
                      <Button size="small" variant="text" href={`mailto:${c.email}`} sx={{ minHeight: 40, flexShrink: 0 }}>Email</Button>
                    ) : null}
                  </Stack>
                );
              })}
              {data.at_risk_total > 6 && (
                <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>y {data.at_risk_total - 6} más.</Typography>
              )}
            </Stack>
          )}

          <Box sx={{ mt: 3 }}>
            <SectionTitle help="Las últimas personas que se han dado de alta. Las que aún no han reservado ninguna clase son las que más agradecen un mensaje de bienvenida.">
              Últimas altas
            </SectionTitle>
            {data.newest_clients.length === 0 ? (
              <Typography sx={{ color: 'text.secondary' }}>Ninguna alta en los últimos meses.</Typography>
            ) : (
              <Stack spacing={1}>
                {data.newest_clients.slice(0, 6).map((c) => {
                  const first = c.name.split(' ')[0];
                  const link = !c.has_booked
                    ? waLink(c.phone, `¡Hola ${first}! Te escribimos de ${studioName} 💛 Gracias por registrarte. ¿Te ayudo a elegir tu primera clase?`)
                    : null;
                  return (
                    <Stack key={`${c.name}${c.joined}`} direction="row" alignItems="center" spacing={1.25}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500 }} noWrap>{c.name}</Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                          {shortDate(c.joined)} · {c.source}
                        </Typography>
                      </Box>
                      {c.has_booked ? (
                        <Chip size="small" color="success" label="Ya ha reservado" />
                      ) : (
                        <Chip size="small" color="warning" label="Sin reservar aún" />
                      )}
                      {link && (
                        <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={link} target="_blank" rel="noopener" sx={{ minHeight: 40, flexShrink: 0 }}>
                          Saludar
                        </Button>
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Box>

          {data.sources.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <SectionTitle help="Lo que respondieron los clientes nuevos de los últimos 3 meses al registrarse.">
                ¿Cómo nos conocieron?
              </SectionTitle>
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {data.sources.map((s) => <Chip key={s.source} label={`${s.source} · ${s.count}`} />)}
              </Stack>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
