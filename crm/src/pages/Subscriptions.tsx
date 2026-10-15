import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Typography, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Pagination, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, IconButton,
  Alert, Stack, Chip, Select, MenuItem, FormControl, InputLabel, FormHelperText,
  Grid, useMediaQuery, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PhoneIcon from '@mui/icons-material/Phone';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import { PageIntro, HelpTip, EmptyState, FormStep, ResponsiveTable, useNotify } from '../components/guide';
import SearchSelect from '../components/SearchSelect';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';
import { useSite, useStudioWebUrl } from '../site/SiteProvider';
import { money } from '../site/money';

interface Subscription {
  id: number;
  // La API devuelve el id de la clienta (número); se admite también el objeto por compatibilidad
  user: number | { id: number; email: string };
  plan: { id: number; name: string; credits?: number; price_eur?: string; interval?: string | null } | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}

interface Plan {
  id: number; name: string; type: string; stripe_price_id: string | null; credits: number; price_eur: string;
  interval?: string | null; interval_count?: number | null;
}
interface UserOption {
  id: number; email: string; first_name?: string; last_name?: string; phone?: string | null;
  stripe_customer_id: string | null;
}
interface CreditEntry {
  id: number; kind: string; amount: string; reference: string | null; created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  past_due: 'Pago pendiente',
  unpaid: 'Pago pendiente',
  canceled: 'Cancelada',
  incomplete: 'Sin completar',
  incomplete_expired: 'Caducada sin pagar',
  trialing: 'De prueba',
  paused: 'En pausa',
};
const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  active: 'success', past_due: 'warning', unpaid: 'warning', canceled: 'default', incomplete: 'warning',
  incomplete_expired: 'default', trialing: 'info', paused: 'default',
};
const STATUS_HELP: Record<string, string> = {
  active: 'Se cobra sola y recibe sus créditos en cada renovación.',
  past_due: 'El banco no aceptó el último cobro. Se reintentará solo; mientras tanto sus clases fijas no se reservan solas.',
  unpaid: 'El banco no aceptó el último cobro.',
  canceled: 'Ya no se cobra ni recibe créditos nuevos.',
  incomplete: 'Se creó pero la clienta todavía no ha pagado el primer cobro.',
  incomplete_expired: 'No se pagó a tiempo y se anuló.',
  trialing: 'Periodo de prueba.',
};

const FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendientes', label: 'Pago pendiente' },
  { key: 'activas', label: 'Activas' },
  { key: 'canceladas', label: 'Canceladas' },
] as const;
type FilterKey = typeof FILTERS[number]['key'];

const isPending = (s: Subscription) => s.status === 'past_due' || s.status === 'unpaid';
const matchesFilter = (s: Subscription, f: FilterKey) =>
  f === 'todas' ? true
    : f === 'pendientes' ? isPending(s)
      : f === 'activas' ? s.status === 'active'
        : s.status === 'canceled' || s.status === 'incomplete_expired';

const userIdOf = (s: Subscription) => (typeof s.user === 'object' && s.user ? s.user.id : (s.user as number));

const niceDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—';

const ENTRY_COLORS: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = { grant: 'success', spend: 'default', refund: 'info', expire: 'warning', adjust: 'default' };
const ENTRY_LABELS: Record<string, string> = { grant: 'Recibe créditos', spend: 'Reserva una clase', refund: 'Devolución', expire: 'Caducan', adjust: 'Ajuste a mano' };

function planPeriod(p: { interval?: string | null; interval_count?: number | null }): string {
  const n = p.interval_count || 1;
  if (p.interval === 'week') return n === 1 ? 'a la semana' : `cada ${n} semanas`;
  if (p.interval === 'year') return n === 1 ? 'al año' : `cada ${n} años`;
  return n === 1 ? 'al mes' : `cada ${n} meses`;
}

function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 9) digits = `34${digits}`; // móvil español sin prefijo
  return digits.length >= 9 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export default function SubscriptionsPage() {
  const studioName = useSite().config.studio_name;
  const webUrl = useStudioWebUrl();
  // "tu web" o su dirección sin https:// (para los textos de ayuda y mensajes)
  const webName = webUrl ? webUrl.replace(/^https?:\/\//, '') : '';
  const notify = useNotify();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Por debajo de 900 px la lista se ve en tarjetas (la tabla no cabe sin deslizar de lado)
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: FilterKey = (FILTERS.find((f) => f.key === searchParams.get('filtro'))?.key) || 'todas';

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [usersById, setUsersById] = useState<Record<number, UserOption>>({});
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [selUser, setSelUser] = useState<number | ''>('');
  const [selPlan, setSelPlan] = useState<number | ''>('');
  const [tried, setTried] = useState(false);
  const [creating, setCreating] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSub, setDetailSub] = useState<Subscription | null>(null);
  const [creditEntries, setCreditEntries] = useState<CreditEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const pageSize = 10;

  const setFilter = (f: FilterKey) => {
    const next = new URLSearchParams(searchParams);
    if (f === 'todas') next.delete('filtro'); else next.set('filtro', f);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [res, uRes] = await Promise.all([
        fetch(`${API_BASE_URL}v1/subscriptions/`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}v1/users/?ordering=email`, { headers: authHeaders() }),
      ]);
      if (!res.ok) throw res;
      const d = await res.json();
      setSubscriptions(Array.isArray(d) ? d : d.results || []);
      // Los nombres son un extra: si falla, se muestra el email o el número de clienta
      if (uRes.ok) {
        const uD = await uRes.json();
        const list: UserOption[] = Array.isArray(uD) ? uD : uD.results || [];
        setAllUsers(list);
        setUsersById(Object.fromEntries(list.map((u) => [u.id, u])));
      }
    } catch (e) {
      setLoadError(await friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const userOf = (s: Subscription): UserOption | undefined => {
    const id = userIdOf(s);
    return usersById[id] || (typeof s.user === 'object' && s.user ? { ...s.user, stripe_customer_id: null } : undefined);
  };
  const nameOf = (s: Subscription) => {
    const u = userOf(s);
    if (!u) return `Clienta nº ${userIdOf(s)}`;
    return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email;
  };

  const openCreateDialog = async () => {
    setOpenCreate(true);
    setClientSecret(null);
    setCreated(false);
    setTried(false);
    setSelUser('');
    setSelPlan('');
    setCreateLoading(true);
    try {
      const reqs: Promise<Response>[] = [fetch(`${API_BASE_URL}v1/plans/`)];
      if (allUsers.length === 0) reqs.push(fetch(`${API_BASE_URL}v1/users/?ordering=email`, { headers: authHeaders() }));
      const [pRes, uRes] = await Promise.all(reqs);
      if (!pRes.ok) throw pRes;
      const pD = await pRes.json();
      setPlans((Array.isArray(pD) ? pD : pD.results || []).filter((p: Plan) => p.type === 'sub'));
      if (uRes) {
        if (!uRes.ok) throw uRes;
        const uD = await uRes.json();
        setAllUsers(Array.isArray(uD) ? uD : uD.results || []);
      }
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreate = async () => {
    setTried(true);
    if (!selUser || !selPlan) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/subscriptions/create-stripe/`, {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ user_id: selUser, plan_id: selPlan }),
      });
      if (!res.ok) {
        const d = await res.clone().json().catch(() => ({}));
        if (String(d?.error || '').includes('stripe_price_id')) {
          throw new Error('Este plan no está conectado con Stripe todavía, así que no se puede cobrar. Elige otro o pide ayuda al soporte técnico.');
        }
        throw new Error(d?.error && res.status < 500 ? d.error : await friendlyError(res));
      }
      const d = await res.json();
      setClientSecret(d.client_secret);
      setCreated(true);
      notify('Membresía creada ✓ Queda pendiente de que la clienta pague el primer cobro.');
      fetchSubs();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally {
      setCreating(false);
    }
  };

  const openDetail = async (sub: Subscription) => {
    setDetailSub(sub);
    setDetailOpen(true);
    setEntriesLoading(true);
    setCreditEntries([]);
    setBalance(null);
    try {
      const uid = userIdOf(sub);
      const wRes = await fetch(`${API_BASE_URL}v1/wallets/?user=${uid}`, { headers: authHeaders() });
      if (!wRes.ok) throw wRes;
      const wD = await wRes.json();
      const wallets = Array.isArray(wD) ? wD : wD.results || [];
      if (wallets.length > 0) {
        setBalance(Number(wallets[0].balance));
        const eRes = await fetch(
          `${API_BASE_URL}v1/wallet-entries/?wallet=${wallets[0].id}&ordering=-created_at&limit=20`,
          { headers: authHeaders() }
        );
        if (!eRes.ok) throw eRes;
        const eD = await eRes.json();
        setCreditEntries(Array.isArray(eD) ? eD : eD.results || []);
      } else {
        setBalance(0);
      }
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally { setEntriesLoading(false); }
  };

  const counts = useMemo(() => ({
    todas: subscriptions.length,
    pendientes: subscriptions.filter(isPending).length,
    activas: subscriptions.filter((s) => s.status === 'active').length,
    canceladas: subscriptions.filter((s) => matchesFilter(s, 'canceladas')).length,
  }), [subscriptions]);

  const filtered = useMemo(() => subscriptions.filter((s) => {
    if (!matchesFilter(s, filter)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const u = userOf(s);
    return [nameOf(s), u?.email, u?.phone, s.plan?.name, s.stripe_subscription_id]
      .some((v) => v?.toLowerCase().includes(q));
  }), [subscriptions, search, filter, usersById]); // eslint-disable-line react-hooks/exhaustive-deps

  const paginated = useMemo(() => { const s = (page - 1) * pageSize; return filtered.slice(s, s + pageSize); }, [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const renewalText = (s: Subscription) => {
    if (s.status === 'canceled' || s.status === 'incomplete_expired') return `Terminó el ${niceDate(s.current_period_end)}`;
    if (s.cancel_at_period_end) return `Se da de baja el ${niceDate(s.current_period_end)}`;
    if (isPending(s)) return `Cobro pendiente desde el ${niceDate(s.current_period_start)}`;
    return `Se renueva el ${niceDate(s.current_period_end)}`;
  };

  const statusChip = (s: Subscription) => (
    <Chip label={STATUS_LABELS[s.status] || s.status} color={STATUS_COLORS[s.status] || 'default'} size="small" sx={{ fontSize: '0.85rem' }} />
  );

  const contactButtons = (s: Subscription) => {
    const u = userOf(s);
    if (!u?.phone) return null;
    const first = (u.first_name || '').split(' ')[0];
    const wa = waLink(
      u.phone,
      `¡Hola${first ? ` ${first}` : ''}! Te escribimos de ${studioName}. No se ha podido cobrar tu membresía ${s.plan?.name || ''}. ` +
      `Cuando puedas, revisa tu tarjeta desde tu cuenta en ${webName || 'la web'} para que tus clases se sigan reservando solas, o dinos y lo vemos juntas. ¡Gracias! 💛`,
    );
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {wa && (
          <Button size="small" variant="contained" color="success" startIcon={<WhatsAppIcon />} href={wa} target="_blank" rel="noopener"
            onClick={(e) => e.stopPropagation()} sx={{ minHeight: 44 }}>
            WhatsApp
          </Button>
        )}
        <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${u.phone}`}
          onClick={(e) => e.stopPropagation()} sx={{ minHeight: 44 }}>
          Llamar
        </Button>
      </Stack>
    );
  };

  const detailButton = (s: Subscription) => (
    <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={(e) => { e.stopPropagation(); openDetail(s); }} sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>
      Ver detalle
    </Button>
  );

  const detailUser = detailSub ? userOf(detailSub) : undefined;

  return (
    <Box>
      <PageIntro
        pageKey="subscriptions"
        title="Membresías"
        subtitle="Quién paga cada mes y quién tiene un pago pendiente."
        actions={
          <>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchSubs} disabled={loading}>
              {loading ? 'Actualizando…' : 'Actualizar'}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>Crear membresía a mano</Button>
          </>
        }
      />

      {/* Filtros por estado */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} role="group" aria-label="Filtrar membresías">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'contained' : 'outlined'}
            color={f.key === 'pendientes' && counts.pendientes > 0 ? 'warning' : 'primary'}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            sx={{ minHeight: 44 }}
          >
            {f.label} ({counts[f.key]})
          </Button>
        ))}
      </Stack>

      {filter === 'pendientes' && (
        <Alert
          severity="warning"
          sx={{ mb: 2, fontSize: '0.97rem', '& .MuiAlert-message': { width: '100%' } }}
          action={<Button color="inherit" onClick={() => setFilter('todas')} sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>Ver todas</Button>}
        >
          <b>¿Qué significa «pago pendiente»?</b> El banco no aceptó el último cobro automático (tarjeta caducada, sin
          saldo…). La clienta <b>ya ha recibido un email y una notificación</b> pidiéndole que revise su tarjeta, y el
          cobro se reintentará solo durante unos días. Mientras tanto, sus clases fijas no se reservan solas.
          <br />
          <b>Qué puedes hacer:</b> escríbele por WhatsApp con el botón de su fila para recordárselo. No hace falta nada más.
        </Alert>
      )}

      <TextField
        data-tour="search" label="Buscar"
        placeholder="Nombre, email o plan (p. ej. Marta o Starter)"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        fullWidth
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton aria-label="Borrar la búsqueda" onClick={() => setSearch('')} edge="end"><CloseIcon /></IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      {loading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando membresías…</Typography>
        </Stack>
      ) : loadError ? (
        <Alert severity="error" action={<Button color="inherit" onClick={fetchSubs} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>Reintentar</Button>}>
          {loadError}
        </Alert>
      ) : subscriptions.length === 0 ? (
        <Paper sx={{ borderRadius: 3 }}>
          <EmptyState
            icon={<CardMembershipIcon />}
            title="Todavía no hay membresías"
            text="Cuando una clienta contrate una membresía en la web aparecerá aquí."
          />
        </Paper>
      ) : filtered.length === 0 ? (
        <Paper sx={{ borderRadius: 3 }}>
          {search ? (
            <EmptyState
              title="No hay membresías que coincidan"
              text="Revisa cómo está escrito o prueba con su email."
              action={<Button variant="outlined" onClick={() => setSearch('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
            />
          ) : filter === 'pendientes' ? (
            <EmptyState
              title="¡Ningún pago pendiente! 🎉"
              text="Todas las membresías se han cobrado bien."
              action={<Button variant="outlined" onClick={() => setFilter('todas')} sx={{ minHeight: 44 }}>Ver todas</Button>}
            />
          ) : (
            <EmptyState
              title="No hay membresías en este grupo"
              action={<Button variant="outlined" onClick={() => setFilter('todas')} sx={{ minHeight: 44 }}>Ver todas</Button>}
            />
          )}
        </Paper>
      ) : (
        <>
          {isNarrow ? (
            <Stack spacing={1.5}>
              {paginated.map((s) => {
                const u = userOf(s);
                return (
                  <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>{nameOf(s)}</Typography>
                        {u?.email && <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', wordBreak: 'break-word' }}>{u.email}</Typography>}
                      </Box>
                      {statusChip(s)}
                    </Stack>
                    <Typography sx={{ mt: 1, fontSize: '0.95rem' }}>
                      <b>{s.plan?.name || 'Sin plan'}</b> · {renewalText(s)}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                      {detailButton(s)}
                      {isPending(s) && contactButtons(s)}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Clienta</TableCell>
                    <TableCell>Membresía</TableCell>
                    <TableCell>
                      Estado{' '}
                      <HelpTip title="¿Qué significa cada estado?">
                        <b>Activa:</b> se cobra sola cada periodo.<br />
                        <b>Pago pendiente:</b> el último cobro no se pudo hacer; se reintenta solo.<br />
                        <b>Sin completar:</b> creada pero todavía sin pagar.<br />
                        <b>Cancelada:</b> ya no se cobra.
                      </HelpTip>
                    </TableCell>
                    <TableCell>Próximo paso</TableCell>
                    <TableCell>Qué puedes hacer</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginated.map((s) => {
                    const u = userOf(s);
                    return (
                      <TableRow key={s.id} hover onClick={() => openDetail(s)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ fontSize: '0.95rem' }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{nameOf(s)}</Typography>
                          {u?.email && <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{u.email}</Typography>}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.95rem' }}>
                          {s.plan?.name || '—'}
                          {s.plan?.credits ? (
                            <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                              {s.plan.credits} créditos{s.plan.price_eur ? ` · ${money(s.plan.price_eur, { decimals: 'auto' })}` : ''}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>{statusChip(s)}</TableCell>
                        <TableCell sx={{ fontSize: '0.95rem' }}>{renewalText(s)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {detailButton(s)}
                            {isPending(s) && contactButtons(s)}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Box display="flex" justifyContent="center" mt={2}>
            <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} size={isMobile ? 'medium' : 'large'} />
          </Box>
        </>
      )}

      {/* ─── Crear membresía a mano ─── */}
      <Dialog open={openCreate} onClose={() => !creating && setOpenCreate(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Crear membresía a mano</DialogTitle>
        <DialogContent dividers>
          {created ? (
            <Stack spacing={2}>
              <Alert severity="success" sx={{ fontSize: '0.97rem' }}>
                Membresía creada. Aparecerá en la lista como <b>«Sin completar»</b> hasta que la clienta pague el primer
                cobro con su tarjeta. Hasta entonces no recibe créditos.
              </Alert>
              <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-text-strong)' }}>
                Si la clienta tiene dudas, lo más sencillo es que la contrate ella misma en la web ({webName ? `${webName} → ` : ''}Precios).
              </Typography>
              {clientSecret && (
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', wordBreak: 'break-all' }}>
                  Dato técnico (solo para soporte): {clientSecret}
                </Typography>
              )}
            </Stack>
          ) : createLoading ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
              <CircularProgress />
              <Typography color="text.secondary">Cargando clientas y planes…</Typography>
            </Stack>
          ) : (
            <>
              <Alert severity="info" sx={{ mb: 3, fontSize: '0.95rem' }}>
                Esto prepara el cobro automático en Stripe, pero <b>la clienta tiene que pagar el primer cobro con su
                tarjeta</b> para que empiece a funcionar. Lo normal es que se apunte ella misma en la web.
              </Alert>
              <FormStep n={1} title="¿Para qué clienta?">
                <SearchSelect
                  label="Clienta"
                  placeholder="Escribe su nombre o email"
                  options={allUsers.map((u) => ({
                    id: u.id,
                    label: `${[u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email} · ${u.email}`,
                  }))}
                  value={selUser}
                  onChange={(id) => setSelUser((id as number) ?? '')}
                  helperText={tried && !selUser ? 'Elige una clienta de la lista.' : 'Puedes escribir para buscarla.'}
                />
              </FormStep>
              <FormStep n={2} title="¿Qué membresía?">
                <FormControl fullWidth error={tried && !selPlan}>
                  <InputLabel id="sub-plan">Membresía</InputLabel>
                  <Select labelId="sub-plan" value={selPlan} label="Membresía" onChange={(e) => setSelPlan(e.target.value as number)}>
                    {plans.map((p) => (
                      <MenuItem key={p.id} value={p.id} disabled={!p.stripe_price_id} sx={{ minHeight: 48 }}>
                        {p.name} — {p.credits} créditos, {money(p.price_eur, { decimals: 'auto' })} {planPeriod(p)}
                        {!p.stripe_price_id ? ' (no disponible: sin conectar a Stripe)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>{tried && !selPlan ? 'Elige una membresía.' : 'El precio y los créditos son los de la web.'}</FormHelperText>
                </FormControl>
              </FormStep>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={() => setOpenCreate(false)} disabled={creating} sx={{ minHeight: 48 }}>
            {created ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!created && (
            <Button variant="contained" onClick={handleCreate} disabled={creating || createLoading} sx={{ minHeight: 48, ml: '0 !important' }}
              startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}>
              {creating ? 'Creando…' : 'Crear membresía'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ─── Detalle ─── */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>{detailSub ? `Membresía de ${nameOf(detailSub)}` : 'Detalle de la membresía'}</DialogTitle>
        <DialogContent dividers>
          {detailSub && (
            <Stack spacing={2.5}>
              {isPending(detailSub) && (
                <Alert severity="warning" sx={{ fontSize: '0.95rem' }}>
                  El último cobro no se pudo hacer. La clienta ya ha recibido un email y una notificación; el cobro se
                  reintentará solo. Si quieres, escríbele por WhatsApp.
                </Alert>
              )}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Clienta</Typography>
                  <Typography fontWeight={600}>{nameOf(detailSub)}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', wordBreak: 'break-word' }}>
                    {[detailUser?.phone, detailUser?.email].filter(Boolean).join(' · ')}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Membresía</Typography>
                  <Typography fontWeight={600}>{detailSub.plan?.name || '—'}</Typography>
                  {detailSub.plan?.credits ? (
                    <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>{detailSub.plan.credits} créditos en cada cobro</Typography>
                  ) : null}
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Estado</Typography>
                  {statusChip(detailSub)}
                  {STATUS_HELP[detailSub.status] && (
                    <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-strong)', mt: 0.5 }}>{STATUS_HELP[detailSub.status]}</Typography>
                  )}
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Periodo pagado</Typography>
                  <Typography>Del {niceDate(detailSub.current_period_start)} al {niceDate(detailSub.current_period_end)}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', color: detailSub.cancel_at_period_end ? '#A86B5E' : 'var(--studio-text-strong)' }}>
                    {renewalText(detailSub)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Créditos disponibles ahora</Typography>
                  <Typography sx={{ fontSize: '1.3rem', fontWeight: 600 }}>
                    {entriesLoading ? '…' : balance == null ? '—' : String(balance).replace('.', ',')}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>{isPending(detailSub) && contactButtons(detailSub)}</Grid>
              </Grid>

              <Box>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Últimos movimientos de créditos</Typography>
                {entriesLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={20} /><Typography color="text.secondary">Cargando…</Typography></Stack>
                ) : creditEntries.length === 0 ? (
                  <Typography color="text.secondary" fontSize="0.95rem">Todavía no hay movimientos.</Typography>
                ) : (
                  <ResponsiveTable component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Qué pasó</TableCell><TableCell align="right">Créditos</TableCell><TableCell>Detalle</TableCell></TableRow></TableHead>
                      <TableBody>
                        {creditEntries.slice(0, 10).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.92rem' }}>{niceDate(e.created_at)}</TableCell>
                            <TableCell><Chip label={ENTRY_LABELS[e.kind] || e.kind} size="small" color={ENTRY_COLORS[e.kind] || 'default'} /></TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.95rem', color: parseFloat(e.amount) >= 0 ? '#5E7A4F' : '#A86B5E' }}>
                              {parseFloat(e.amount) >= 0 ? '+' : ''}{String(parseFloat(e.amount)).replace('.', ',')}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem', color: 'text.secondary' }}>{e.reference || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ResponsiveTable>
                )}
              </Box>

              {detailSub.stripe_subscription_id && (
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', wordBreak: 'break-all' }}>
                  Referencia de Stripe (solo para soporte): {detailSub.stripe_subscription_id}
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setDetailOpen(false)} sx={{ minHeight: 48 }}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
