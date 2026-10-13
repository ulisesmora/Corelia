import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  TextField,
  Button,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { API_BASE_URL } from '../config';
import { isPlaceholderEmail } from '../site/email';
import { STUDIO_TZ as TZ } from '../site/timezone';

const MAX_ADD = 200;

interface UserOption {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
}

interface WalletEntry {
  id: number;
  kind: 'grant' | 'spend' | 'refund' | 'expire' | 'adjust';
  amount: string;
  reference: string | null;
  metadata: any;
  created_at: string;
  expires_at: string | null;
}

interface Wallet {
  id: number;
  user: number;
  balance: number | string; // la API lo manda como texto ("3.00")
  entries?: WalletEntry[];
}

const ENTRY_COLORS: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  grant: 'success',
  spend: 'default',
  refund: 'info',
  expire: 'warning',
  adjust: 'default',
};
const ENTRY_LABELS: Record<string, string> = {
  grant: 'Añadidos',
  spend: 'Reservó clase',
  refund: 'Devueltos',
  expire: 'Caducados',
  adjust: 'Corrección',
};

const QUICK_AMOUNTS = [1, 2, 5, 8, 12, 20, 40];
const EXPIRE_OPTIONS = [
  { value: '7', label: '1 semana' },
  { value: '14', label: '2 semanas' },
  { value: '30', label: '1 mes (lo normal)' },
  { value: '60', label: '2 meses' },
  { value: '90', label: '3 meses' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 año' },
];
const REASON_EXAMPLES = ['Pago en mano', 'Regalo', 'Compensación por clase cancelada', 'Corrección de un error'];

const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const dateTimeFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});
const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

const creditsText = (n: number) => `${numFmt.format(n)} ${Math.abs(n) === 1 ? 'crédito' : 'créditos'}`;
const personName = (u: UserOption) => `${u.first_name || ''} ${u.last_name || ''}`.trim();
const isInternal = (email?: string) => isPlaceholderEmail(email);
const displayName = (u: UserOption | null) => (u ? personName(u) || u.email : '');

/** Traduce las referencias automáticas del sistema a una frase entendible */
function friendlyReference(ref: string | null): string {
  if (!ref) return '—';
  const rules: [RegExp, string][] = [
    [/^refund_booking_/, 'Canceló una reserva y se le devolvieron'],
    [/^session_cancel_/, 'El estudio canceló la clase'],
    [/^schedule_cancel_all_/, 'Se quitó esa clase del horario'],
    [/^admin_cancel_all_/, 'Se anularon todas sus reservas'],
    [/^blackout_/, 'Clase cerrada (vacaciones o cierre)'],
    [/^reschedule_cancel_/, 'La clase cambió de horario'],
    [/^EXP-GRANT-/, 'No los usó a tiempo'],
    [/^Otorgado manualmente desde CRM$/, 'Añadidos a mano desde aquí'],
    [/^Ajuste manual desde CRM$/, 'Quitados a mano desde aquí'],
  ];
  for (const [re, text] of rules) if (re.test(ref)) return text;
  return ref;
}

export default function CreditsManagement() {
  const confirm = useConfirm();
  const notify = useNotify();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersError, setUsersError] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState('');
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchUserTerm, setSearchUserTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [openAdjust, setOpenAdjust] = useState(false);
  // Añadir o quitar: dos opciones claras en vez de un número negativo
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove'>('add');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  // FIX expiración: cuando se AÑADEN créditos, guardamos la caducidad
  // como 'grant' con expires_at. Así el sistema los trata igual que un pack comprado
  // y la tarea de expiración los respeta correctamente.
  // Para quitar créditos seguimos con 'adjust' sin expiración.
  const [adjustExpireDays, setAdjustExpireDays] = useState<string>('30');
  // 'preset' = días desde hoy, 'custom' = fecha específica, 'never' = sin caducidad
  const [adjustExpireMode, setAdjustExpireMode] = useState<'preset' | 'custom' | 'never'>('preset');
  const [adjustCustomDate, setAdjustCustomDate] = useState<string>('');
  const [pendingAdd, setPendingAdd] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pageSize = 12;

  const fetchUsers = useCallback(async (search = '') => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('is_superuser', 'false');
      if (search) params.set('search', search);
      params.set('ordering', 'email');
      const res = await fetch(`${API_BASE_URL}v1/users/?${params}`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.results || []);
      setUsersError('');
    } catch (err) {
      setUsersError(await friendlyError(err));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchEntries = async (walletId: number) => {
    setEntriesLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}v1/wallet-entries/?wallet=${walletId}&ordering=-created_at`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw res;
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : data.results || []);
    } catch {
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  };

  const fetchWallet = useCallback(async (userId: number) => {
    setLoading(true);
    setWalletError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/wallets/?user=${userId}`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const data = await res.json();
      const wallets = Array.isArray(data) ? data : data.results || [];
      if (wallets.length > 0) {
        setWallet(wallets[0]);
        fetchEntries(wallets[0].id);
      } else {
        setWallet({ id: 0, user: userId, balance: 0 });
        setEntries([]);
      }
    } catch (err) {
      setWallet(null);
      setWalletError(await friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSelectUser = (user: UserOption | null) => {
    setSelectedUser(user);
    setCurrentPage(1);
    if (user) fetchWallet(user.id);
    else {
      setWallet(null);
      setEntries([]);
      setWalletError('');
    }
  };

  // Enlaces directos: ?clienta=<id> la abre; ?accion=anadir lleva al buscador y abre la ventana al elegirla
  useEffect(() => {
    const accion = searchParams.get('accion');
    const clienta = Number(searchParams.get('clienta'));
    if (accion === 'anadir') {
      setPendingAdd(true);
      setTimeout(() => searchInputRef.current?.focus(), 150);
      const next = new URLSearchParams(searchParams);
      next.delete('accion');
      setSearchParams(next, { replace: true });
    }
    if (clienta && clienta !== selectedUser?.id) {
      fetch(`${API_BASE_URL}v1/users/${clienta}/`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((u: UserOption) => {
          handleSelectUser(u);
          setSearchUserTerm(displayName(u));
        })
        .catch(async (e) => notify(`No se ha podido abrir la ficha de la clienta. ${await friendlyError(e)}`, 'error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const balance = wallet ? Number(wallet.balance) || 0 : 0;

  const openAdjustDialog = (mode: 'add' | 'remove') => {
    setAdjustMode(mode);
    setAdjustAmount('');
    setAdjustReason('');
    setAmountTouched(false);
    setAdjustExpireMode('preset');
    setAdjustExpireDays('30');
    setAdjustCustomDate('');
    setOpenAdjust(true);
  };

  // Viene de Inicio ("Añadir o quitar créditos"): al elegir clienta se abre la ventana
  useEffect(() => {
    if (pendingAdd && wallet && !loading) {
      setPendingAdd(false);
      openAdjustDialog('add');
    }
  }, [pendingAdd, wallet, loading]);

  // ---- Validación de la ventana ----
  const amountNum = Number(adjustAmount);
  const amountError = (() => {
    if (!adjustAmount.trim()) return 'Elige o escribe cuántos créditos.';
    if (!Number.isInteger(amountNum) || amountNum < 1) return 'Escribe un número entero mayor que 0 (ej.: 2).';
    if (adjustMode === 'add' && amountNum > MAX_ADD) return `Como mucho ${MAX_ADD} créditos de una vez.`;
    if (adjustMode === 'remove' && amountNum > balance) {
      return `Solo tiene ${creditsText(balance)}: no puedes quitarle más de lo que tiene.`;
    }
    return '';
  })();

  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

  const computeExpiresAt = (): { value: string | null; error: string } => {
    if (adjustMode !== 'add' || adjustExpireMode === 'never') return { value: null, error: '' };
    if (adjustExpireMode === 'preset') {
      const days = parseInt(adjustExpireDays, 10);
      if (isNaN(days) || days < 1) return { value: null, error: 'Elige cuándo caducan.' };
      const d = new Date();
      d.setDate(d.getDate() + days);
      return { value: d.toISOString(), error: '' };
    }
    if (!adjustCustomDate) return { value: null, error: 'Elige la fecha en la que caducan.' };
    if (adjustCustomDate < todayStr) return { value: null, error: 'La fecha no puede ser anterior a hoy.' };
    // El input date da YYYY-MM-DD — añadimos hora 23:59:59 para que expire al final del día
    return { value: new Date(adjustCustomDate + 'T23:59:59').toISOString(), error: '' };
  };
  const expiry = computeExpiresAt();

  const newBalance = amountError ? null : balance + (adjustMode === 'add' ? amountNum : -amountNum);
  const clientName = displayName(selectedUser) || 'la clienta';

  const handleAdjust = async () => {
    setAmountTouched(true);
    if (!wallet || amountError || expiry.error) return;

    const isAdding = adjustMode === 'add';
    const amount = isAdding ? amountNum : -amountNum;

    if (!isAdding) {
      const ok = await confirm({
        title: `¿Quitar ${creditsText(amountNum)} a ${clientName}?`,
        message: (
          <>
            <p style={{ marginTop: 0 }}>
              Ahora tiene <b>{creditsText(balance)}</b> y se quedará con <b>{creditsText(balance - amountNum)}</b>.
            </p>
            <p>A la clienta no le llega ningún aviso. No se le devuelve ni se le cobra dinero: solo cambia su saldo de clases.</p>
            <p style={{ marginBottom: 0 }}>Si te equivocas, puedes volver a añadírselos desde esta misma pantalla.</p>
          </>
        ),
        confirmText: `Sí, quitar ${creditsText(amountNum)}`,
        tone: 'danger',
      });
      if (!ok) return;
    }

    setAdjusting(true);
    try {
      // FIX expiración:
      // - Si el admin AÑADE créditos: kind='grant' con expires_at.
      //   Así se comportan igual que un pack comprado y la lógica de expiración
      //   los respeta. Cuando expiren, el sistema sabrá exactamente cuánto quitar.
      // - Si el admin QUITA créditos: kind='adjust' sin expires_at
      //   (correcciones manuales no tienen caducidad).
      const kind = isAdding ? 'grant' : 'adjust';
      const expires_at = expiry.value;

      // BUG FIX "usuarios nuevos": si el usuario aún no tenía wallet, antes se
      // enviaba wallet: 0 y el backend devolvía error. Ahora el endpoint acepta
      // `user` y crea el monedero al vuelo.
      const target = wallet.id ? { wallet: wallet.id } : { user: wallet.user };
      const res = await fetch(`${API_BASE_URL}v1/wallet-entries/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...target,
          kind,
          amount,
          reference: adjustReason.trim() || (isAdding ? 'Otorgado manualmente desde CRM' : 'Ajuste manual desde CRM'),
          expires_at,
        }),
      });
      if (!res.ok) throw res;

      const expireMsg = isAdding
        ? expires_at ? ` Caducan el ${dayFmt.format(new Date(expires_at))}.` : ' No caducan.'
        : '';
      notify(
        isAdding
          ? `${creditsText(amountNum)} añadidos a ${clientName} ✓ Ahora tiene ${creditsText(balance + amountNum)}.${expireMsg}`
          : `${creditsText(amountNum)} quitados a ${clientName} ✓ Ahora tiene ${creditsText(balance - amountNum)}.`,
      );
      setOpenAdjust(false);
      setAdjustAmount('');
      setAdjustReason('');
      setAdjustExpireMode('preset');
      setAdjustExpireDays('30');
      setAdjustCustomDate('');
      if (selectedUser) fetchWallet(selectedUser.id);
    } catch (err) {
      notify(`No se han podido cambiar los créditos. ${await friendlyError(err)}`, 'error');
    } finally {
      setAdjusting(false);
    }
  };

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, currentPage]);
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));

  const amountCell = (e: WalletEntry) => {
    const n = parseFloat(e.amount);
    return (
      <Typography component="span" sx={{ fontWeight: 600, fontSize: '1rem', color: n >= 0 ? '#3F6B2E' : '#9C3F33' }}>
        {n >= 0 ? '+' : '−'}{creditsText(Math.abs(n))}
      </Typography>
    );
  };

  const kindChip = (e: WalletEntry) => (
    <Chip label={ENTRY_LABELS[e.kind] || e.kind} color={ENTRY_COLORS[e.kind] || 'default'} size="small" variant="outlined" />
  );

  const expiresText = (e: WalletEntry) =>
    e.expires_at ? dayFmt.format(new Date(e.expires_at)) : '—';

  const creditsHelp = (
    <HelpTip title="¿Qué es un crédito?">
      Es lo que «cuesta» reservar una clase. Una clase de suelo (mat, yoga, barre, dance) gasta 1 crédito y una
      de máquinas (Reformer o Chair) gasta 2. Las clientas los consiguen comprando un bono o con su membresía.
    </HelpTip>
  );

  return (
    <Box>
      <PageIntro
        pageKey="credits"
        title="Créditos"
        subtitle="Mira cuántas clases le quedan a una clienta y añádele o quítale créditos, por ejemplo cuando te paga en mano."
        steps={[
          { title: 'Busca a la clienta', text: 'Escribe su nombre, teléfono o email en el buscador y elígela de la lista.' },
          { title: 'Mira su saldo', text: 'Verás cuántos créditos tiene ahora y, debajo, todo lo que ha gastado o recibido.' },
          { title: 'Pulsa «Añadir» o «Quitar»', text: 'Elige cuántos créditos y, si añades, hasta cuándo puede usarlos.' },
          { title: 'Revisa y confirma', text: 'Antes de guardar verás cuántos tiene y cuántos tendrá. Al terminar aparece un aviso.' },
        ]}
        tips={[
          <>1 crédito = 1 clase de suelo (mat, yoga, barre, dance). Las de máquinas (Reformer o Chair) gastan <b>2 créditos</b>.</>,
          <>A la clienta <b>no le llega ningún aviso</b> cuando le añades o quitas créditos. Tampoco se mueve dinero: si te paga en mano, cóbraselo tú aparte.</>,
          <>Los créditos con fecha de caducidad se quitan solos ese día si no los ha usado.</>,
        ]}
      />

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' }, alignItems: 'start' }}>
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Typography component="h2" sx={{ display: 'block', fontWeight: 600, fontSize: '1.05rem', mb: 1.25, color: 'var(--studio-dark)' }}>
            ¿De qué clienta?
          </Typography>
          {pendingAdd && !selectedUser && (
            <Alert severity="info" sx={{ mb: 1.5, fontSize: '0.92rem' }}>
              Primero busca a la clienta. Al elegirla se abrirá la ventana para añadir o quitar créditos.
            </Alert>
          )}
          <Autocomplete
            id="credits-client-search"
            options={users}
            getOptionLabel={(u) => displayName(u)}
            renderOption={(props, u) => {
              const { key, ...rest } = props as typeof props & { key: string };
              return (
                <Box component="li" key={key} {...rest} sx={{ display: 'block !important', py: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>{personName(u) || '(Sin nombre)'}</Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-strong)' }}>
                    {[u.phone, isInternal(u.email) ? '' : u.email].filter(Boolean).join(' · ') || 'Sin teléfono ni email'}
                  </Typography>
                </Box>
              );
            }}
            loading={usersLoading}
            loadingText="Buscando…"
            noOptionsText={searchUserTerm.trim().length < 2 ? 'Escribe al menos 2 letras' : 'No hay ninguna clienta con ese dato'}
            value={selectedUser}
            onChange={(_, v) => {
              handleSelectUser(v);
              if (searchParams.has('clienta')) {
                const next = new URLSearchParams(searchParams);
                next.delete('clienta');
                setSearchParams(next, { replace: true });
              }
            }}
            onInputChange={(_, v, reason) => {
              setSearchUserTerm(v);
              if (reason !== 'input') return;
              clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => {
                if (v.trim().length >= 2) fetchUsers(v.trim());
                else if (!v.trim()) fetchUsers();
              }, 300);
            }}
            filterOptions={(x) => x}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            inputValue={searchUserTerm}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={searchInputRef}
                label="Buscar clienta"
                placeholder="Ej.: Marta o 612 345 678"
                error={Boolean(usersError)}
                helperText={usersError ? `No se ha podido buscar. ${usersError}` : 'Nombre, teléfono o email.'}
              />
            )}
            fullWidth
          />
        </Paper>

        {!selectedUser ? (
          <Paper sx={{ p: 2 }}>
            <EmptyState
              compact
              icon={<PersonSearchIcon />}
              title="Elige una clienta"
              text="Cuando la elijas en el buscador verás aquí cuántos créditos tiene y podrás añadirle o quitarle."
            />
          </Paper>
        ) : loading ? (
          <Paper sx={{ p: 4 }}>
            <Stack alignItems="center" spacing={1.5} role="status">
              <CircularProgress />
              <Typography sx={{ color: 'text.secondary' }}>Cargando los créditos de {clientName}…</Typography>
            </Stack>
          </Paper>
        ) : walletError ? (
          <Alert
            severity="error"
            sx={{ alignItems: 'center' }}
            action={
              <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => fetchWallet(selectedUser.id)} sx={{ minHeight: 44 }}>
                Reintentar
              </Button>
            }
          >
            No se han podido cargar sus créditos. {walletError}
          </Alert>
        ) : wallet && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>
              Saldo de <b>{clientName}</b> {creditsHelp}
            </Typography>
            <Typography
              sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 600, color: 'var(--studio-primary-deep)', fontSize: { xs: '2.4rem', md: '3rem' }, lineHeight: 1.15 }}
            >
              {creditsText(balance)}
            </Typography>
            <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem', mt: 0.5 }}>
              {balance >= 1
                ? `Le llega para ${numFmt.format(Math.floor(balance))} ${Math.floor(balance) === 1 ? 'clase' : 'clases'} de suelo${balance >= 2 ? ` o ${numFmt.format(Math.floor(balance / 2))} de máquinas` : ''}.`
                : 'No le quedan créditos: no puede reservar hasta que compre un bono o le añadas.'}
            </Typography>
            {selectedUser && (selectedUser.phone || !isInternal(selectedUser.email)) && (
              <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.9rem', mt: 0.5 }}>
                {[selectedUser.phone, isInternal(selectedUser.email) ? '' : selectedUser.email].filter(Boolean).join(' · ')}
              </Typography>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2.5 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<AddIcon />}
                onClick={() => openAdjustDialog('add')}
                sx={{ minHeight: 48 }}
              >
                Añadir créditos
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="large"
                startIcon={<RemoveIcon />}
                onClick={() => openAdjustDialog('remove')}
                disabled={balance <= 0}
                sx={{ minHeight: 48 }}
              >
                Quitar créditos
              </Button>
              <Button
                variant="text"
                startIcon={<RefreshIcon />}
                onClick={() => fetchWallet(selectedUser.id)}
                sx={{ minHeight: 48 }}
              >
                Actualizar
              </Button>
            </Stack>
            {balance <= 0 && (
              <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)', mt: 1 }}>
                «Quitar créditos» está desactivado porque no tiene ninguno.
              </Typography>
            )}
          </Paper>
        )}

        {selectedUser && wallet && !loading && !walletError && (
          <Paper sx={{ gridColumn: '1 / -1' }}>
            <Box sx={{ px: { xs: 2, md: 3 }, pt: 3, pb: 1 }}>
              <Typography component="h2" sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)' }}>
                Movimientos de {clientName} ({entries.length})
              </Typography>
              <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.92rem' }}>
                Todo lo que ha comprado, gastado o le han devuelto, del más reciente al más antiguo.
              </Typography>
            </Box>
            {entriesLoading ? (
              <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }} role="status">
                <CircularProgress />
                <Typography sx={{ color: 'text.secondary' }}>Cargando movimientos…</Typography>
              </Stack>
            ) : entries.length === 0 ? (
              <EmptyState compact title="Todavía no tiene movimientos" text="Cuando compre un bono, reserve o le añadas créditos aparecerá aquí." />
            ) : (
              <>
                {isMobile ? (
                  <Stack spacing={1.25} sx={{ px: 2, pb: 1 }}>
                    {paginated.map((e) => (
                      <Box key={e.id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgb(var(--studio-line-rgb) / 0.35)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          {kindChip(e)}
                          {amountCell(e)}
                        </Stack>
                        <Typography sx={{ mt: 0.75, fontSize: '0.95rem', color: 'var(--studio-dark)' }}>{friendlyReference(e.reference)}</Typography>
                        <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)' }}>
                          {dateTimeFmt.format(new Date(e.created_at))}
                          {e.expires_at ? ` · caducan el ${expiresText(e)}` : ''}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Fecha</TableCell>
                          <TableCell>Qué pasó</TableCell>
                          <TableCell align="right">Créditos</TableCell>
                          <TableCell>Detalle</TableCell>
                          <TableCell>Caducan el</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginated.map((e) => (
                          <TableRow key={e.id} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTimeFmt.format(new Date(e.created_at))}</TableCell>
                            <TableCell>{kindChip(e)}</TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{amountCell(e)}</TableCell>
                            <TableCell sx={{ maxWidth: 320 }}>{friendlyReference(e.reference)}</TableCell>
                            <TableCell>{expiresText(e)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                {totalPages > 1 && (
                  <Box display="flex" justifyContent="center" p={2}>
                    <Pagination count={totalPages} page={currentPage} onChange={(_, p) => setCurrentPage(p)} />
                  </Box>
                )}
              </>
            )}
          </Paper>
        )}
      </Box>

      <Dialog open={openAdjust} onClose={() => !adjusting && setOpenAdjust(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.35rem' }}>
          Créditos de {clientName}
          <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', mt: 0.5 }}>
            Ahora tiene {creditsText(balance)}.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <FormStep n={1} title="¿Qué quieres hacer?">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant={adjustMode === 'add' ? 'contained' : 'outlined'}
                  color="success"
                  size="large"
                  startIcon={<AddIcon />}
                  aria-pressed={adjustMode === 'add'}
                  onClick={() => setAdjustMode('add')}
                  sx={{ flex: 1, minHeight: 56 }}
                >
                  Añadir créditos
                </Button>
                <Button
                  variant={adjustMode === 'remove' ? 'contained' : 'outlined'}
                  color="error"
                  size="large"
                  startIcon={<RemoveIcon />}
                  aria-pressed={adjustMode === 'remove'}
                  onClick={() => setAdjustMode('remove')}
                  disabled={balance <= 0}
                  sx={{ flex: 1, minHeight: 56 }}
                >
                  Quitar créditos
                </Button>
              </Stack>
            </FormStep>

            <FormStep
              n={2}
              title={adjustMode === 'add' ? '¿Cuántos créditos le añades?' : '¿Cuántos créditos le quitas?'}
              hint={<>Recuerda: suelo = 1 crédito por clase, máquinas (Reformer o Chair) = 2. {creditsHelp}</>}
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }} role="group" aria-label="Cantidades rápidas">
                {QUICK_AMOUNTS.filter((n) => adjustMode === 'add' || n <= balance).map((n) => (
                  <Button
                    key={n}
                    variant={adjustAmount === String(n) ? 'contained' : 'outlined'}
                    aria-pressed={adjustAmount === String(n)}
                    onClick={() => { setAdjustAmount(String(n)); setAmountTouched(true); }}
                    sx={{ minHeight: 44, minWidth: 56 }}
                  >
                    {n}
                  </Button>
                ))}
              </Box>
              <TextField
                label="Número de créditos"
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                onBlur={() => setAmountTouched(true)}
                error={amountTouched && Boolean(amountError)}
                helperText={amountTouched && amountError ? amountError : 'Pulsa un número de arriba o escribe otro. Ej.: 5'}
                slotProps={{ htmlInput: { min: 1, max: adjustMode === 'add' ? MAX_ADD : balance, step: 1, inputMode: 'numeric' } }}
                sx={{ maxWidth: 260 }}
              />
            </FormStep>

            {adjustMode === 'add' && (
              <FormStep
                n={3}
                title="¿Hasta cuándo puede usarlos?"
                hint="Si no los usa antes de esa fecha, se le quitan solos. Lo normal es 1 mes."
              >
                <Stack spacing={2}>
                  <TextField
                    select
                    label="Caducan"
                    value={adjustExpireMode === 'preset' ? adjustExpireDays : adjustExpireMode}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'custom' || v === 'never') setAdjustExpireMode(v);
                      else { setAdjustExpireMode('preset'); setAdjustExpireDays(v); }
                    }}
                    fullWidth
                  >
                    {EXPIRE_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value} sx={{ minHeight: 44 }}>Dentro de {o.label}</MenuItem>
                    ))}
                    <MenuItem value="custom" sx={{ minHeight: 44 }}>El día que yo elija</MenuItem>
                    <MenuItem value="never" sx={{ minHeight: 44 }}>No caducan nunca</MenuItem>
                  </TextField>

                  {adjustExpireMode === 'custom' && (
                    <TextField
                      type="date"
                      label="Caducan el"
                      value={adjustCustomDate}
                      onChange={(e) => setAdjustCustomDate(e.target.value)}
                      error={Boolean(expiry.error)}
                      helperText={expiry.error || 'Pueden usarlos hasta el final de ese día.'}
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayStr } }}
                    />
                  )}

                  {adjustExpireMode === 'never' ? (
                    <Alert severity="warning" sx={{ fontSize: '0.92rem' }}>
                      Estos créditos no caducarán nunca. Úsalo solo para regalos o compensaciones especiales.
                    </Alert>
                  ) : expiry.value && (
                    <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-dark)' }}>
                      Caducan el <b>{dayFmt.format(new Date(expiry.value))}</b>.
                    </Typography>
                  )}
                </Stack>
              </FormStep>
            )}

            <FormStep n={adjustMode === 'add' ? 4 : 3} title="¿Por qué? (opcional)" hint="Te ayudará a recordarlo. Aparece en sus movimientos.">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {REASON_EXAMPLES.map((r) => (
                  <Chip key={r} label={r} onClick={() => setAdjustReason(r)} variant={adjustReason === r ? 'filled' : 'outlined'} sx={{ minHeight: 36 }} />
                ))}
              </Box>
              <TextField
                label="Motivo"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                fullWidth
                placeholder="Ej.: Pagó un bono de 5 en efectivo"
                helperText={`${adjustReason.length}/120`}
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
            </FormStep>

            <Paper
              variant="outlined"
              sx={{
                p: 2, borderRadius: 3,
                backgroundColor: adjustMode === 'add' ? 'rgba(125,155,108,0.10)' : 'rgba(194,133,122,0.10)',
              }}
              aria-live="polite"
            >
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Resumen</Typography>
              {newBalance === null ? (
                <Typography sx={{ color: 'var(--studio-text-strong)' }}>Elige cuántos créditos para ver cómo queda su saldo.</Typography>
              ) : (
                <Typography sx={{ fontSize: '1.05rem', color: 'var(--studio-dark)' }}>
                  {clientName} tiene <b>{creditsText(balance)}</b> → tendrá <b>{creditsText(newBalance)}</b>
                </Typography>
              )}
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
          <Button variant="outlined" onClick={() => setOpenAdjust(false)} disabled={adjusting} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={adjustMode === 'add' ? 'success' : 'error'}
            onClick={handleAdjust}
            disabled={adjusting || Boolean(amountError) || Boolean(expiry.error)}
            startIcon={adjusting ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {adjusting
              ? 'Guardando…'
              : amountError
                ? (adjustMode === 'add' ? 'Añadir créditos' : 'Quitar créditos')
                : `${adjustMode === 'add' ? 'Añadir' : 'Quitar'} ${creditsText(amountNum)}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

