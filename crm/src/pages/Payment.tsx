import { useState, useEffect, useMemo, useRef, ReactNode, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  TextField,
  Alert,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import UndoIcon from '@mui/icons-material/Undo';
import BlockIcon from '@mui/icons-material/Block';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { PageIntro, HelpTip, EmptyState } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { API_BASE_URL } from '../config';
import { formatMoney, STUDIO_CURRENCY } from '../site/money';
import { STUDIO_TZ as TZ } from '../site/timezone';

// ====================================================================
// 1. INTERFACES
// ====================================================================

interface UserStub {
  id: number;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

interface GuestStub {
  id: number;
  name: string;
  email: string | null;
  phone?: string | null;
}

type PaymentStatus = 'requires_action' | 'pending' | 'succeeded' | 'failed' | 'refunded' | 'canceled';

interface Payment {
  id: number;
  user: UserStub | null;
  guest: GuestStub | null;
  method: string;
  currency: string;
  amount_eur: string; // Django DecimalField llega como string
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id?: string | null;
  status: PaymentStatus;
  created_at: string;
}

// ====================================================================
// 2. ESTADOS EN LENGUAJE LLANO (color + texto + icono)
// ====================================================================

const STATUS_INFO: Record<
  PaymentStatus,
  { label: string; color: 'success' | 'default' | 'info' | 'error' | 'warning'; icon: ReactNode; text: string }
> = {
  succeeded: { label: 'Cobrado', color: 'success', icon: <CheckCircleIcon />, text: 'El dinero se ha cobrado bien.' },
  pending: {
    label: 'Sin terminar',
    color: 'default',
    icon: <HourglassEmptyIcon />,
    text: 'La clienta abrió la página de pago pero no la terminó (o la está terminando ahora). No se ha cobrado nada.',
  },
  requires_action: {
    label: 'Esperando a la clienta',
    color: 'info',
    icon: <TouchAppIcon />,
    text: 'Su banco le pidió una confirmación y todavía no la ha hecho. Aún no se ha cobrado.',
  },
  failed: { label: 'Fallido', color: 'error', icon: <ErrorOutlineIcon />, text: 'La tarjeta fue rechazada. No se ha cobrado.' },
  canceled: { label: 'Cancelado', color: 'error', icon: <BlockIcon />, text: 'Se canceló antes de cobrar. No se ha cobrado.' },
  refunded: { label: 'Devuelto', color: 'warning', icon: <UndoIcon />, text: 'Se cobró y después se le devolvió el dinero.' },
};

type StatusFilter = 'succeeded' | 'unfinished' | 'problem' | 'refunded' | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string; match: (s: PaymentStatus) => boolean }[] = [
  { value: 'succeeded', label: 'Cobrados', match: (s) => s === 'succeeded' },
  { value: 'unfinished', label: 'Sin terminar', match: (s) => s === 'pending' || s === 'requires_action' },
  { value: 'problem', label: 'Fallidos o cancelados', match: (s) => s === 'failed' || s === 'canceled' },
  { value: 'refunded', label: 'Devueltos', match: (s) => s === 'refunded' },
  { value: 'all', label: 'Todos', match: () => true },
];

type PeriodKey = 'month' | 'last_month' | '7d' | 'year' | 'custom';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: 'year', label: 'Este año' },
  { value: 'custom', label: 'Elegir fechas' },
];

// ====================================================================
// 3. AYUDAS
// ====================================================================

function madridDay(d: Date | string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(typeof d === 'string' ? new Date(d) : d);
}

function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function periodRange(key: PeriodKey, custom: { from: string; to: string }): { from: string; to: string } {
  const today = madridDay(new Date());
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (key) {
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last_month': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: shiftDay(`${y}-${pad(m)}-01`, -1) };
    }
    case '7d':
      return { from: shiftDay(today, -6), to: today };
    case 'year':
      return { from: `${y}-01-01`, to: today };
    default:
      return custom;
  }
}

function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

const dateTimeFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});
const longDateTimeFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});

/** Importe con la moneda del pago (los antiguos conservan la suya si el estudio cambió de moneda). */
function fmtAmount(value: number | string, currency?: string | null): string {
  return formatMoney(value, currency || STUDIO_CURRENCY, { decimals: 'auto' });
}

const sameCurrency = (p: Payment) => (p.currency || 'EUR').toUpperCase() === STUDIO_CURRENCY;

function clientName(p: Payment): string {
  if (p.user) {
    const full = [p.user.first_name, p.user.last_name].filter(Boolean).join(' ').trim();
    return full || p.user.email || 'Clienta sin nombre';
  }
  if (p.guest) return p.guest.name || p.guest.email || 'Invitada';
  return 'Sin clienta asociada';
}

function clientEmail(p: Payment): string | null {
  return p.user?.email || p.guest?.email || null;
}

function methodLabel(m: string): string {
  if (!m || m === 'stripe') return 'Tarjeta (en la web)';
  if (m === 'cash') return 'Efectivo';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function StatusChip({ status }: { status: PaymentStatus }) {
  const info = STATUS_INFO[status] || { label: status, color: 'default' as const, icon: undefined };
  return (
    <Chip
      size="small"
      icon={info.icon as ReactElement | undefined}
      label={info.label}
      color={info.color}
      variant={info.color === 'default' ? 'outlined' : 'filled'}
      sx={{ fontSize: '0.88rem' }}
    />
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'main' | 'muted' }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.25, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
        backgroundColor: tone === 'main' ? 'rgb(var(--studio-primary-rgb) / 0.10)' : 'rgb(var(--studio-surface-rgb) / 0.85)',
      }}
    >
      <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>{label}</Typography>
      <Typography sx={{ fontSize: tone === 'main' ? '2.1rem' : '1.6rem', fontWeight: 600, color: 'var(--studio-dark)', lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem' }}>{sub}</Typography>}
    </Paper>
  );
}

const PAGE_SIZE = 25;
const API_PAGE = 200;
const MAX_API_PAGES = 30;

// ====================================================================
// 4. COMPONENTE PRINCIPAL
// ====================================================================

export default function PaymentViewer() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);

  const [period, setPeriod] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState(() => {
    const today = madridDay(new Date());
    return { from: shiftDay(today, -30), to: today };
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('succeeded');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<Payment | null>(null);
  const [showRefs, setShowRefs] = useState(false);
  const requestId = useRef(0);

  const range = periodRange(period, custom);
  const rangeValid = Boolean(range.from && range.to && range.from <= range.to);

  // ====================================================================
  // 5. CARGA: todos los pagos del periodo (de más nuevo a más antiguo)
  // ====================================================================

  const fetchPayments = async () => {
    if (!rangeValid) return;
    const myId = ++requestId.current;
    setLoading(true);
    try {
      const token = JSON.parse(localStorage.getItem('user') as string).access;
      const found: Payment[] = [];
      let page = 1;
      let more = true;
      let cut = false;
      while (more) {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(API_PAGE),
          ordering: '-created_at',
        });
        const res = await fetch(`${API_BASE_URL}v1/payments/?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw res;
        const data = await res.json();
        const results: Payment[] = Array.isArray(data) ? data : data.results || [];
        for (const p of results) {
          const day = madridDay(p.created_at);
          if (day >= range.from && day <= range.to) found.push(p);
        }
        const last = results[results.length - 1];
        const reachedStart = !last || madridDay(last.created_at) < range.from;
        more = !Array.isArray(data) && Boolean(data.next) && !reachedStart;
        page += 1;
        if (more && page > MAX_API_PAGES) {
          more = false;
          cut = true;
        }
      }
      if (myId !== requestId.current) return;
      setPayments(found);
      setTruncated(cut);
      setError('');
    } catch (err) {
      if (myId !== requestId.current) return;
      setError(await friendlyError(err));
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  // ====================================================================
  // 6. TOTALES, FILTRO Y BÚSQUEDA
  // ====================================================================

  const totals = useMemo(() => {
    let paid = 0, paidCount = 0, refunded = 0, refundedCount = 0, unfinished = 0, otherCurrency = 0;
    for (const p of payments) {
      const amount = Number(p.amount_eur) || 0;
      // Los pagos en otra moneda (de antes de cambiarla) no se suman: no se convierten
      if (!sameCurrency(p) && (p.status === 'succeeded' || p.status === 'refunded')) { otherCurrency += 1; continue; }
      if (p.status === 'succeeded') { paid += amount; paidCount += 1; }
      else if (p.status === 'refunded') { refunded += amount; refundedCount += 1; }
      else if (p.status === 'pending' || p.status === 'requires_action') unfinished += 1;
    }
    return { paid, paidCount, refunded, refundedCount, unfinished, otherCurrency };
  }, [payments]);

  const countFor = (f: StatusFilter) => {
    const match = STATUS_FILTERS.find((s) => s.value === f)!.match;
    return payments.filter((p) => match(p.status)).length;
  };

  const visible = useMemo(() => {
    const match = STATUS_FILTERS.find((s) => s.value === statusFilter)!.match;
    const q = searchTerm.trim().toLowerCase();
    return payments.filter((p) => {
      if (!match(p.status)) return false;
      if (!q) return true;
      return [clientName(p), clientEmail(p) || '', String(p.id), p.amount_eur, p.stripe_payment_intent_id || '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [payments, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const rangeText = `del ${longDay(range.from)} al ${longDay(range.to)}`;

  // ====================================================================
  // 7. RENDER
  // ====================================================================

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <PageIntro
        pageKey="payments"
        title="Pagos"
        subtitle="Lo que te han pagado con tarjeta. Aquí solo se mira."
        actions={
          <Button variant="outlined" size="large" startIcon={<RefreshIcon />} onClick={fetchPayments} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </Button>
        }
      />

      {/* Periodo */}
      <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 }, mb: 2.5, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', mb: 1 }}>¿De qué fechas?</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {PERIODS.map((p) => (
            <Chip
              key={p.value}
              label={p.label}
              clickable
              color={period === p.value ? 'primary' : 'default'}
              variant={period === p.value ? 'filled' : 'outlined'}
              onClick={() => setPeriod(p.value)}
              sx={{ minHeight: 44, fontSize: '0.95rem', px: 0.5 }}
            />
          ))}
        </Stack>
        {period === 'custom' && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="Desde el día"
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Hasta el día (incluido)"
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              error={!rangeValid}
              helperText={!rangeValid ? 'El último día no puede ser antes del primero.' : ' '}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
        )}
        {rangeValid && (
          <Typography sx={{ mt: 1.25, color: 'text.secondary', fontSize: '0.95rem' }}>
            Mostrando {rangeText} (hora de España).
            {loading && payments.length > 0 && (
              <Box component="span" sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={14} /> Cargando…
              </Box>
            )}
          </Typography>
        )}
      </Paper>

      {loading && payments.length === 0 ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando los pagos…</Typography>
        </Stack>
      ) : error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchPayments} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
          sx={{ alignItems: 'center', fontSize: '1rem' }}
        >
          No se han podido cargar los pagos. {error}
        </Alert>
      ) : (
        <>
          {/* Totales del periodo */}
          <Box sx={{ display: 'grid', gap: 2, mb: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1.4fr 1fr 1fr' } }}>
            <StatCard
              tone="main"
              label="Cobrado en este periodo"
              value={fmtAmount(totals.paid)}
              sub={`${totals.paidCount} ${totals.paidCount === 1 ? 'pago' : 'pagos'} cobrados`}
            />
            <StatCard
              label="Sin terminar"
              value={String(totals.unfinished)}
              sub="Empezaron a pagar y no acabaron (no es dinero cobrado)"
            />
            <StatCard
              label="Devuelto"
              value={fmtAmount(totals.refunded)}
              sub={`${totals.refundedCount} ${totals.refundedCount === 1 ? 'devolución' : 'devoluciones'}`}
            />
          </Box>
          {totals.otherCurrency > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {totals.otherCurrency === 1 ? 'Hay 1 pago' : `Hay ${totals.otherCurrency} pagos`} en otra moneda (de antes de
              cambiar la moneda del estudio). Se muestran con su moneda y no se suman en los totales de arriba.
            </Alert>
          )}
          {truncated && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Hay muchísimos pagos en estas fechas y solo se han cargado los más recientes. Elige un periodo más corto para ver
              los totales exactos.
            </Alert>
          )}

          {/* Estado + búsqueda */}
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>¿Qué pagos quieres ver?</Typography>
            <HelpTip title="Qué significa cada estado">
              <Stack spacing={1}>
                {(Object.keys(STATUS_INFO) as PaymentStatus[]).map((s) => (
                  <Box key={s}>
                    <b>{STATUS_INFO[s].label}:</b> {STATUS_INFO[s].text}
                  </Box>
                ))}
              </Stack>
            </HelpTip>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            {STATUS_FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={`${f.label} (${countFor(f.value)})`}
                clickable
                color={statusFilter === f.value ? 'primary' : 'default'}
                variant={statusFilter === f.value ? 'filled' : 'outlined'}
                onClick={() => { setStatusFilter(f.value); setCurrentPage(1); }}
                sx={{ minHeight: 44, fontSize: '0.95rem', px: 0.5 }}
              />
            ))}
          </Stack>
          <TextField
            fullWidth
            data-tour="search" label="Buscar clienta"
            placeholder="Nombre, email o importe"
            helperText="Ej.: Marta, marta@gmail.com o 50"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <Button size="small" onClick={() => { setSearchTerm(''); setCurrentPage(1); }} sx={{ minHeight: 40 }}>Borrar</Button>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{ mb: 2.5 }}
          />

          {visible.length === 0 ? (
            <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px dashed rgb(var(--studio-line-rgb) / 0.5)' }}>
              <EmptyState
                icon={<ReceiptLongIcon />}
                title={searchTerm ? 'Ningún pago coincide con la búsqueda' : 'No hay pagos de este tipo en estas fechas'}
                text={
                  searchTerm
                    ? 'Revisa cómo está escrito el nombre o prueba con el email.'
                    : 'Prueba a elegir otras fechas arriba, o pulsa «Todos» para ver los pagos de cualquier estado.'
                }
              />
            </Paper>
          ) : isMobile ? (
            <Stack spacing={1.25}>
              {pageItems.map((p) => (
                <Paper
                  key={p.id}
                  elevation={0}
                  sx={{ p: 2, borderRadius: 3, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)', backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.9)' }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', overflowWrap: 'anywhere' }}>{clientName(p)}</Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem' }}>{dateTimeFmt.format(new Date(p.created_at))}</Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--studio-dark)', flexShrink: 0 }}>{fmtAmount(p.amount_eur, p.currency)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                    <StatusChip status={p.status} />
                    <Button startIcon={<VisibilityIcon />} onClick={() => { setDetail(p); setShowRefs(false); }} sx={{ minHeight: 44 }}>
                      Ver
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Clienta</TableCell>
                    <TableCell align="right">Importe</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Detalle</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageItems.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.95rem' }}>{dateTimeFmt.format(new Date(p.created_at))}</TableCell>
                      <TableCell sx={{ fontSize: '0.95rem' }}>
                        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: 'inherit' }}>{clientName(p)}</Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                          {p.user ? clientEmail(p) : `Invitada${p.guest?.email ? ` · ${p.guest.email}` : ''}`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1.05rem', whiteSpace: 'nowrap' }}>
                        {fmtAmount(p.amount_eur, p.currency)}
                      </TableCell>
                      <TableCell><StatusChip status={p.status} /></TableCell>
                      <TableCell align="right">
                        <Button startIcon={<VisibilityIcon />} onClick={() => { setDetail(p); setShowRefs(false); }} sx={{ minHeight: 44 }}>
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {totalPages > 1 && (
            <Stack alignItems="center" sx={{ mt: 2.5 }}>
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(_, page) => setCurrentPage(page)}
                size="large"
              />
              <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: '0.92rem' }}>
                {visible.length} pagos en total · página {currentPage} de {totalPages}
              </Typography>
            </Stack>
          )}
        </>
      )}

      {/* --- DETALLE DE UN PAGO --- */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        {detail && (
          <>
            <DialogTitle sx={{ fontSize: '1.3rem' }}>Pago de {clientName(detail)}</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Box>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: 'var(--studio-dark)', lineHeight: 1.1 }}>
                    {fmtAmount(detail.amount_eur, detail.currency)}
                  </Typography>
                  <Box sx={{ mt: 1 }}><StatusChip status={detail.status} /></Box>
                  <Typography sx={{ mt: 1, color: 'var(--studio-text-strong)' }}>{STATUS_INFO[detail.status]?.text}</Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, rowGap: 1, columnGap: 2, fontSize: '1rem' }}>
                  <Typography sx={{ color: 'text.secondary' }}>Cuándo</Typography>
                  <Typography sx={{ '&::first-letter': { textTransform: 'uppercase' } }}>
                    {longDateTimeFmt.format(new Date(detail.created_at))}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary' }}>Clienta</Typography>
                  <Box>
                    <Typography>{clientName(detail)}</Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem' }}>
                      {detail.user ? 'Tiene cuenta en la web' : detail.guest ? 'Invitada (pagó sin crear cuenta)' : ''}
                    </Typography>
                  </Box>
                  {clientEmail(detail) && (
                    <>
                      <Typography sx={{ color: 'text.secondary' }}>Email</Typography>
                      <Typography sx={{ overflowWrap: 'anywhere' }}>{clientEmail(detail)}</Typography>
                    </>
                  )}
                  {(detail.user?.phone || detail.guest?.phone) && (
                    <>
                      <Typography sx={{ color: 'text.secondary' }}>Teléfono</Typography>
                      <Typography>
                        <a href={`tel:${detail.user?.phone || detail.guest?.phone}`}>{detail.user?.phone || detail.guest?.phone}</a>
                      </Typography>
                    </>
                  )}
                  <Typography sx={{ color: 'text.secondary' }}>Forma de pago</Typography>
                  <Typography>{methodLabel(detail.method)}</Typography>
                </Box>

                <Box>
                  <Button
                    onClick={() => setShowRefs((v) => !v)}
                    endIcon={<ExpandMoreIcon sx={{ transform: showRefs ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                    sx={{ minHeight: 44, color: 'text.secondary' }}
                    aria-expanded={showRefs}
                  >
                    Datos para soporte técnico
                  </Button>
                  <Collapse in={showRefs} unmountOnExit>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 1, fontSize: '0.92rem' }}>
                      <Typography sx={{ color: 'text.secondary', fontSize: 'inherit', mb: 0.75 }}>
                        Solo hacen falta si soporte técnico te pide revisar este pago.
                      </Typography>
                      <Typography sx={{ fontSize: 'inherit' }}>Nº de pago: <b>{detail.id}</b></Typography>
                      <Typography sx={{ fontSize: 'inherit', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                        Referencia de cobro: {detail.stripe_payment_intent_id || detail.stripe_checkout_session_id || '—'}
                      </Typography>
                    </Paper>
                  </Collapse>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
              {clientEmail(detail) && (
                <Button
                  variant="outlined"
                  startIcon={<PersonSearchIcon />}
                  onClick={() => navigate(`/clients?buscar=${encodeURIComponent(clientEmail(detail) as string)}`)}
                  sx={{ minHeight: 48 }}
                >
                  Ver su ficha de clienta
                </Button>
              )}
              <Button variant="contained" onClick={() => setDetail(null)} sx={{ minHeight: 48, ml: '0 !important' }}>
                Cerrar
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
