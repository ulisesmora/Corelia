import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, ButtonBase, Chip, CircularProgress, InputAdornment, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/auth';
import { EmptyState } from '../components/guide';
import StudioIcon from '../site/StudioIcon';
import StudioStats, { amount, loadStudioStats, Stats } from '../components/StudioStats';
import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';
import { HomeProgressCard } from '../onboarding';

interface Booking {
  id: number;
  status: string;
  start_datetime: string;
  end_datetime: string;
  what: string;
  who: string;
  room_name?: string;
}

interface Task {
  icon: ReactNode;
  title: string;
  text: string;
  to: string;
}

const TASK_GROUPS: { title: string; tasks: Task[] }[] = [
  {
    title: 'Con una clienta',
    tasks: [
      {
        icon: <StudioIcon name="addClient" />,
        title: 'Dar de alta a una clienta nueva',
        text: 'Crear su ficha y, si quieres, apuntarla ya a una clase.',
        to: '/clients?accion=nueva',
      },
      {
        icon: <StudioIcon name="credits" />,
        title: 'Añadir o quitar créditos',
        text: 'Cuando paga en mano o hay que corregir su saldo de clases.',
        to: '/credits?accion=anadir',
      },
      {
        icon: <StudioIcon name="repeat" />,
        title: 'Apuntarla a una clase fija',
        text: 'Para que tenga su plaza guardada todas las semanas.',
        to: '/assign-classes',
      },
      {
        icon: <StudioIcon name="bookings" />,
        title: 'Ver o cancelar una reserva',
        text: 'Quién viene a cada clase y anular una reserva.',
        to: '/bookings',
      },
    ],
  },
  {
    title: 'Con el horario',
    tasks: [
      {
        icon: <StudioIcon name="add" />,
        title: 'Añadir una clase al horario',
        text: 'Una clase nueva que se repite cada semana, o un día suelto.',
        to: '/calendar?accion=nueva',
      },
      {
        icon: <StudioIcon name="agenda" />,
        title: 'Preparar el mes que viene',
        text: 'Cambiar horarios, terminar o añadir clases y cerrar días.',
        to: '/calendar?accion=preparar-mes',
      },
      {
        icon: <StudioIcon name="holidays" />,
        title: 'Cerrar el estudio unos días',
        text: 'Vacaciones, festivos o un día que no se da una clase.',
        to: '/calendar?tab=cierres',
      },
      {
        icon: <StudioIcon name="print" />,
        title: 'Imprimir el horario',
        text: 'Una hoja con todas las clases de la semana.',
        to: '/calendar?tab=imprimir',
      },
    ],
  },
  {
    title: 'Ventas y avisos',
    tasks: [
      {
        icon: <StudioIcon name="announce" />,
        title: 'Enviar un aviso a las clientas',
        text: 'Un email y/o una notificación al móvil para todas.',
        to: '/mails?accion=nuevo',
      },
      {
        icon: <StudioIcon name="plans" />,
        title: 'Ver las membresías',
        text: 'Quién paga cada mes y quién tiene un pago pendiente.',
        to: '/subscriptions',
      },
      {
        icon: <StudioIcon name="payments" />,
        title: 'Ver los pagos',
        text: 'Lo que se ha cobrado por la web.',
        to: '/payments',
      },
    ],
  },
];

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()));
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function madridDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d); // YYYY-MM-DD
}

const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

function TaskCard({ task, onGo }: { task: Task; onGo: () => void }) {
  return (
    <ButtonBase
      onClick={onGo}
      sx={{
        textAlign: 'left', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.75,
        p: 2.25, borderRadius: 4, width: '100%', minHeight: 96,
        backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.8)', border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
        transition: 'border-color .2s, box-shadow .2s, transform .2s',
        '&:hover': { borderColor: 'var(--studio-primary)', boxShadow: '0 6px 18px rgb(var(--studio-primary-deep-rgb) / 0.12)', transform: 'translateY(-1px)' },
        '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 46, height: 46, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center',
          backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.14)', color: 'var(--studio-primary-deep)',
        }}
      >
        {task.icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--studio-dark)', lineHeight: 1.35 }}>
          {task.title}
        </Typography>
        <Typography sx={{ mt: 0.4, color: 'var(--studio-text-body)', fontSize: '0.93rem', lineHeight: 1.5 }}>{task.text}</Typography>
      </Box>
      <StudioIcon name="next" aria-hidden sx={{ color: 'var(--studio-text-faint)', alignSelf: 'center' }} />
    </ButtonBase>
  );
}

type View = 'dia' | 'estudio';

function readView(): View {
  try { return localStorage.getItem('crmHomeView') === 'estudio' ? 'estudio' : 'dia'; } catch { return 'dia'; }
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { v: View; icon: ReactNode; title: string; text: string }[] = [
    { v: 'dia', icon: <StudioIcon name="today" />, title: 'Mi día', text: 'Tareas y clases de hoy' },
    { v: 'estudio', icon: <StudioIcon name="stats" />, title: 'Cómo va el estudio', text: 'Ventas, clientas nuevas…' },
  ];
  return (
    <Box role="tablist" aria-label="Qué ver en el inicio" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mb: 3 }}>
      {opts.map((o) => {
        const on = view === o.v;
        return (
          <ButtonBase
            key={o.v}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.v)}
            sx={{
              justifyContent: 'flex-start', gap: 1.5, p: { xs: 1.5, md: 2 }, borderRadius: 4, textAlign: 'left',
              border: on ? '2px solid var(--studio-primary)' : '1.5px solid rgb(var(--studio-line-rgb) / 0.35)',
              backgroundColor: on ? 'rgb(var(--studio-primary-rgb) / 0.14)' : 'rgb(var(--studio-surface-rgb) / 0.7)',
              '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
            }}
          >
            <Box aria-hidden sx={{ color: on ? 'var(--studio-primary-deep)' : 'var(--studio-text-hint)', display: 'flex' }}>{o.icon}</Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: { xs: '0.98rem', md: '1.08rem' }, color: 'var(--studio-dark)' }}>{o.title}</Typography>
              <Typography sx={{ fontSize: '0.85rem', color: 'var(--studio-text-body)', display: { xs: 'none', sm: 'block' } }}>{o.text}</Typography>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [view, setViewState] = useState<View>(readView);
  const [stats, setStats] = useState<Stats | null>(null);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem('crmHomeView', v); } catch { /* sin almacenamiento */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [today, setToday] = useState<Booking[] | null>(null);
  const [todayError, setTodayError] = useState(false);
  const [pending, setPending] = useState<{ pastDue: number; candidates: number } | null>(null);

  const firstName = (user?.name || '').split(' ')[0];
  const dateLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
  }).format(new Date());

  useEffect(() => {
    loadStudioStats().then(setStats).catch(() => {});
    const d = madridDate(new Date());
    // Solo las reservas de hoy (hasta mañana, sin incluir) y ordenadas: con muchas reservas futuras,
    // la primera página de 200 podía no traerlas todas.
    const next = new Date(`${d}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const tomorrow = next.toISOString().slice(0, 10);
    fetch(`${API_BASE_URL}v1/bookings/?status=reserved&start_datetime__gte=${d}&start_datetime__lt=${tomorrow}&ordering=start_datetime&page_size=200`, {
      headers: authHeaders(),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        const list: Booking[] = (data.results || data).filter(
          (b: Booking) => b.status === 'reserved' && madridDate(new Date(b.start_datetime)) === d,
        );
        setToday(list);
      })
      .catch(() => { setTodayError(true); setToday([]); });

    Promise.allSettled([
      fetch(`${API_BASE_URL}v1/subscriptions/`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE_URL}v1/membership-candidates/`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([subs, cands]) => {
      const s = subs.status === 'fulfilled' ? (Array.isArray(subs.value) ? subs.value : subs.value.results || []) : [];
      const c = cands.status === 'fulfilled' && Array.isArray(cands.value) ? cands.value : [];
      setPending({
        pastDue: s.filter((x: { status: string }) => x.status === 'past_due').length,
        candidates: c.filter((x: { last_contacted: string | null }) => !x.last_contacted).length,
      });
    });
  }, []);

  const sessions = useMemo(() => {
    if (!today) return [];
    const map = new Map<string, { start: Date; end: Date; what: string; room?: string; people: string[] }>();
    for (const b of today) {
      const key = `${b.start_datetime}|${b.what}`;
      const cur = map.get(key) || {
        start: new Date(b.start_datetime), end: new Date(b.end_datetime), what: b.what, room: b.room_name, people: [],
      };
      cur.people.push(b.who);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [today]);

  const now = Date.now();

  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/clients?buscar=${encodeURIComponent(q)}` : '/clients');
  };

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      {/* Saludo */}
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
        <StudioIcon name="sun" aria-hidden sx={{ color: '#D4A574' }} />
        <Typography sx={{ color: 'text.secondary', fontSize: '1rem', '&::first-letter': { textTransform: 'uppercase' } }}>
          {dateLabel}
        </Typography>
      </Stack>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.9rem', md: '2.3rem' }, mb: 0.75 }}>
        {greeting()}{firstName ? `, ${firstName}` : ''}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '1.05rem', mb: 3 }}>
        Elige abajo lo que quieres hacer. Si te pierdes, pulsa <b>Ayuda</b> arriba a la derecha en cualquier pantalla.
      </Typography>

      {/* Puesta en marcha: «N de 11 pasos» (desaparece cuando todo está hecho) */}
      <HomeProgressCard />

      {/* Buscar clienta */}
      <Paper component="form" onSubmit={search} elevation={0} sx={{ p: { xs: 2, md: 2.5 }, mb: 3, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
        <Typography component="label" htmlFor="home-search" sx={{ display: 'block', fontWeight: 600, fontSize: '1.05rem', mb: 1, color: 'var(--studio-dark)' }}>
          Buscar a una clienta
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <TextField
            id="home-search"
            fullWidth
            placeholder="Escribe su nombre, email o teléfono"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              input: { startAdornment: <InputAdornment position="start"><StudioIcon name="search" /></InputAdornment> },
            }}
          />
          <Button type="submit" variant="contained" size="large" sx={{ minHeight: 54, px: 4, flexShrink: 0 }}>
            Buscar
          </Button>
        </Stack>
      </Paper>

      <ViewSwitch view={view} onChange={setView} />

      {view === 'estudio' ? (
        <StudioStats />
      ) : (
      <>
      {stats && (
        <ButtonBase
          onClick={() => setView('estudio')}
          sx={{
            width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 2, mb: 3, p: 2, borderRadius: 4,
            flexWrap: 'wrap', border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)', backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.75)',
            '&:hover': { borderColor: 'var(--studio-primary)' }, '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
          }}
        >
          <StudioIcon name="stats" aria-hidden sx={{ color: 'var(--studio-primary-shade)' }} />
          <Typography sx={{ color: 'var(--studio-dark)', fontSize: '0.98rem', flex: 1, minWidth: 220 }}>
            Este mes: <b>{amount(stats.kpis.sales_eur)}</b> en ventas por la web ·{' '}
            <b>{stats.kpis.new_clients + stats.kpis.new_guests}</b> clientas nuevas ·{' '}
            <b>{stats.kpis.first_timers}</b> han venido por primera vez
          </Typography>
          <Typography sx={{ color: 'var(--studio-primary-deep)', fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            Ver cómo va el estudio <StudioIcon name="next" sx={{ fontSize: 18 }} aria-hidden />
          </Typography>
        </ButtonBase>
      )}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 360px' }, alignItems: 'start' }}>
        {/* Tareas */}
        <Box>
          <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--studio-dark)', mb: 2 }}>
            ¿Qué quieres hacer?
          </Typography>
          {TASK_GROUPS.map((g) => (
            <Box key={g.title} sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--studio-primary-shade)', mb: 1.25 }}>
                {g.title}
              </Typography>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
                {g.tasks.map((t) => (
                  <TaskCard key={t.to} task={t} onGo={() => navigate(t.to)} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Columna lateral: hoy + pendientes */}
        <Stack spacing={3}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
            <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--studio-dark)', mb: 0.5 }}>
              Hoy en el estudio
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', mb: 2 }}>
              Clases de hoy con al menos una reserva.
            </Typography>
            {today === null ? (
              <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={28} /></Stack>
            ) : todayError ? (
              <Typography sx={{ color: 'error.main' }}>No se han podido cargar las reservas de hoy.</Typography>
            ) : sessions.length === 0 ? (
              <EmptyState compact title="Hoy no hay reservas" text="Cuando alguien reserve una clase de hoy aparecerá aquí." />
            ) : (
              <Stack spacing={1.25}>
                {sessions.map((s) => {
                  const past = s.end.getTime() < now;
                  return (
                    <Box
                      key={`${s.start.toISOString()}${s.what}`}
                      sx={{
                        p: 1.5, borderRadius: 3, display: 'flex', gap: 1.5, alignItems: 'center',
                        backgroundColor: past ? 'rgb(var(--studio-line-rgb) / 0.08)' : 'rgb(var(--studio-surface-rgb) / 0.85)',
                        border: '1px solid rgb(var(--studio-line-rgb) / 0.25)', opacity: past ? 0.7 : 1,
                      }}
                    >
                      <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--studio-primary-deep)', minWidth: 52 }}>
                        {timeFmt.format(s.start)}
                      </Typography>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', lineHeight: 1.3 }} noWrap>{s.what}</Typography>
                        <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }} noWrap>
                          {s.people.length} {s.people.length === 1 ? 'persona' : 'personas'}{s.room ? ` · ${s.room}` : ''}{past ? ' · ya terminó' : ''}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
            <Button fullWidth variant="outlined" endIcon={<StudioIcon name="next" />} onClick={() => navigate('/bookings')} sx={{ mt: 2, minHeight: 46 }}>
              Ver quién viene a cada clase
            </Button>
          </Paper>

          {pending && (pending.pastDue > 0 || pending.candidates > 0) && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 4, border: '1.5px solid rgba(212,165,116,0.5)', backgroundColor: 'rgba(253,240,220,0.6)' }}>
              <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--studio-dark)', mb: 1.5 }}>
                Para revisar
              </Typography>
              <Stack spacing={1.25}>
                {pending.pastDue > 0 && (
                  <Button
                    variant="outlined"
                    startIcon={<StudioIcon name="warning" />}
                    onClick={() => navigate('/subscriptions?filtro=pendientes')}
                    sx={{ justifyContent: 'flex-start', minHeight: 52, textAlign: 'left', backgroundColor: 'rgb(var(--studio-surface-rgb))' }}
                  >
                    {pending.pastDue === 1
                      ? '1 membresía con el pago pendiente'
                      : `${pending.pastDue} membresías con el pago pendiente`}
                  </Button>
                )}
                {pending.candidates > 0 && (
                  <Button
                    variant="outlined"
                    startIcon={<StudioIcon name="candidates" />}
                    onClick={() => navigate('/membership-candidates')}
                    sx={{ justifyContent: 'flex-start', minHeight: 52, textAlign: 'left', backgroundColor: 'rgb(var(--studio-surface-rgb))' }}
                  >
                    {pending.candidates === 1
                      ? '1 clienta viene cada semana y aún no le has escrito'
                      : `${pending.candidates} clientas vienen cada semana y aún no les has escrito`}
                  </Button>
                )}
              </Stack>
            </Paper>
          )}

          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
            <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', mb: 1 }}>Palabras que verás a menudo</Typography>
            <Stack spacing={1} sx={{ fontSize: '0.92rem', color: 'var(--studio-text-strong)', lineHeight: 1.55 }}>
              <Box><Chip size="small" label="Crédito" sx={{ mr: 1 }} />Lo que "cuesta" una clase. Suelo = 1 crédito, máquinas (Reformer o Chair) = 2.</Box>
              <Box><Chip size="small" label="Bono" sx={{ mr: 1 }} />Un paquete de créditos que se paga una vez.</Box>
              <Box><Chip size="small" label="Membresía" sx={{ mr: 1 }} />Pago automático cada mes (o cada 2-3 meses) con sus créditos.</Box>
              <Box><Chip size="small" label="Invitada" sx={{ mr: 1 }} />Alguien que reservó sin crear cuenta.</Box>
            </Stack>
          </Paper>
        </Stack>
      </Box>
      </>
      )}
    </Box>
  );
}
