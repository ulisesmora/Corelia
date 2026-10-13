import { useState, useEffect, useMemo, ReactNode } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Typography,
  CircularProgress,
  Paper,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Switch,
  Stack,
  FormControlLabel,
  Chip,
  Collapse,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import PercentIcon from '@mui/icons-material/Percent';
import EuroIcon from '@mui/icons-material/Euro';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';

/** Fecha de fin que usamos para "no caduca nunca" (la API exige una fecha de fin). */
const NO_END_DATE = '2099-12-31';

// ====================================================================
// 1. INTERFACES Y CONSTANTES
// ====================================================================

type DiscountType = 'percent' | 'amount' | 'credits';

interface Coupon {
  id: number;
  code: string;
  discount_type: DiscountType;
  value: string; // Viene como string "50.00"
  valid_from: string | null;
  valid_to: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  min_amount_eur: string | null;
  is_active: boolean;
}

// Estado del formulario (fechas como "AAAA-MM-DD", día completo en hora de Madrid)
type EditableCoupon = {
  id?: number;
  code: string;
  discount_type: DiscountType;
  value: number | '';
  from_date: string;
  to_date: string;
  no_end: boolean;
  usage_limit: number | '';
  per_user_limit: number | '';
  min_amount_eur: number | '';
  is_active: boolean;
};

// ====================================================================
// 2. AYUDAS DE FECHA (hora de Madrid) Y FORMATO
// ====================================================================

function madridOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - utcMs) / 60000;
}

/** "2026-09-30" + "23:59:59" (hora de Madrid) → ISO en UTC para la API. */
function madridToISO(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ts = guess - madridOffsetMinutes(guess) * 60000;
  ts = guess - madridOffsetMinutes(ts) * 60000;
  return new Date(ts).toISOString();
}

/** Fecha (AAAA-MM-DD) en Madrid de un instante. */
function madridDay(d: Date | string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(typeof d === 'string' ? new Date(d) : d);
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

function fmtEur(value: number | string | null | undefined): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(n)) return '—';
  const opts: Intl.NumberFormatOptions = Number.isInteger(n)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${n.toLocaleString('es-ES', opts)} €`;
}

function discountText(type: DiscountType, value: number | string): string {
  const n = Number(value);
  if (type === 'percent') return `${n.toLocaleString('es-ES')} % de descuento`;
  if (type === 'amount') return `${fmtEur(n)} de descuento`;
  return `${n.toLocaleString('es-ES')} créditos de regalo`;
}

const isNoEnd = (iso: string | null) => !iso || new Date(iso).getUTCFullYear() >= 2090;

type CouponState = { label: string; color: 'success' | 'default' | 'error' | 'warning' | 'info'; text: string };

function couponState(c: Coupon, used: number | undefined): CouponState {
  const now = Date.now();
  if (!c.is_active) return { label: 'Desactivado', color: 'default', text: 'No funciona hasta que lo vuelvas a activar.' };
  if (c.valid_to && now > new Date(c.valid_to).getTime()) return { label: 'Caducado', color: 'error', text: 'Ya pasó su fecha de fin.' };
  if (c.valid_from && now < new Date(c.valid_from).getTime()) return { label: 'Aún no empieza', color: 'info', text: 'Funcionará a partir de su fecha de inicio.' };
  if (c.usage_limit && used !== undefined && used >= c.usage_limit) return { label: 'Agotado', color: 'warning', text: 'Ya se ha usado todas las veces permitidas.' };
  return { label: 'Funciona', color: 'success', text: 'Las clientas lo pueden usar ahora en la web.' };
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${JSON.parse(localStorage.getItem('user') as string).access}` };
}

// ====================================================================
// 3. PIEZAS DE INTERFAZ
// ====================================================================

function ChoiceCard({
  selected, onClick, icon, title, text,
}: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <ButtonBase
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      sx={{
        flex: 1, textAlign: 'left', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
        gap: 1.5, p: 2, borderRadius: 3, minHeight: 80,
        border: '2px solid', borderColor: selected ? 'var(--studio-primary)' : 'rgb(var(--studio-primary-rgb) / 0.25)',
        backgroundColor: selected ? 'rgb(var(--studio-primary-rgb) / 0.08)' : 'transparent',
        '&:hover': { borderColor: 'var(--studio-primary)' },
        '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
      }}
    >
      <Box sx={{ color: selected ? 'var(--studio-primary-deep)' : 'text.secondary', mt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', lineHeight: 1.5 }}>{text}</Typography>
      </Box>
      {selected && <CheckCircleIcon sx={{ color: 'var(--studio-primary-deep)' }} />}
    </ButtonBase>
  );
}

// ====================================================================
// 4. COMPONENTE PRINCIPAL
// ====================================================================

export default function CouponManagement() {
  const confirm = useConfirm();
  const notify = useNotify();

  const [openDialog, setOpenDialog] = useState(false);
  const [currentCoupon, setCurrentCoupon] = useState<EditableCoupon | null>(null);
  const [originalCode, setOriginalCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [usage, setUsage] = useState<Record<number, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  // ====================================================================
  // 5. FETCHERS
  // ====================================================================

  const fetchUsage = async () => {
    // Informativo: cuántas veces se ha aplicado cada cupón. Si falla, no bloquea.
    try {
      const res = await fetch(`${API_BASE_URL}v1/coupon-redemptions/`, { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      const list: { coupon: number }[] = Array.isArray(data) ? data : data.results || [];
      const counts: Record<number, number> = {};
      list.forEach((r) => { counts[r.coupon] = (counts[r.coupon] || 0) + 1; });
      setUsage(counts);
    } catch {
      /* sin datos de uso */
    }
  };

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/coupons/`, { headers: authHeader() });
      if (!res.ok) throw res;
      const data = await res.json();
      setCoupons(Array.isArray(data) ? data : data.results || []);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(await friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
    fetchUsage();
  }, []);

  // ====================================================================
  // 6. API HANDLERS
  // ====================================================================

  const sendApiRequest = async (url: string, method: string, data?: Record<string, unknown>) => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) throw response;
    await fetchCoupons();
  };

  const couponUrl = (code: string) => `${API_BASE_URL}v1/coupons/${encodeURIComponent(code)}/`;

  const handleToggleActive = async (coupon: Coupon) => {
    const deactivate = coupon.is_active;
    const ok = await confirm(
      deactivate
        ? {
            title: `¿Desactivar el cupón ${coupon.code}?`,
            message: (
              <>
                Si una clienta lo escribe en la web verá «El cupón no está activo» y no tendrá descuento. Las compras que ya
                se hicieron con él no cambian. Puedes volver a activarlo cuando quieras.
              </>
            ),
            confirmText: 'Sí, desactivar',
          }
        : {
            title: `¿Activar el cupón ${coupon.code}?`,
            message: `Las clientas podrán usarlo en la web (${discountText(coupon.discount_type, coupon.value)}) mientras esté dentro de sus fechas.`,
            confirmText: 'Sí, activar',
          },
    );
    if (!ok) return;
    setBusyCode(coupon.code);
    try {
      await sendApiRequest(couponUrl(coupon.code), 'PATCH', { is_active: !deactivate });
      notify(deactivate ? `El cupón ${coupon.code} ya no funciona.` : `El cupón ${coupon.code} ya funciona.`);
    } catch (err) {
      notify(`No se ha podido cambiar. ${await friendlyError(err)}`, 'error');
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    const ok = await confirm({
      tone: 'danger',
      title: `¿Borrar el cupón ${coupon.code}?`,
      message: (
        <>
          <p style={{ marginTop: 0 }}>Deja de funcionar en la web y desaparece de esta lista. Las compras que ya se hicieron con él no cambian.</p>
          <p>Después <b>no podrás crear otro cupón con el mismo código</b> ({coupon.code}).</p>
          <p style={{ marginBottom: 0 }}>Si solo quieres que deje de funcionar un tiempo, es mejor pulsar <b>«Desactivar»</b>.</p>
        </>
      ),
      confirmText: `Sí, borrar ${coupon.code}`,
    });
    if (!ok) return;
    setBusyCode(coupon.code);
    try {
      await sendApiRequest(couponUrl(coupon.code), 'DELETE');
      notify(`El cupón ${coupon.code} se ha borrado.`);
    } catch (err) {
      notify(`No se ha podido borrar. ${await friendlyError(err)}`, 'error');
    } finally {
      setBusyCode(null);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notify(`Código ${code} copiado. Ya puedes pegarlo en un mensaje o en Instagram.`, 'info');
    } catch {
      notify('No se ha podido copiar. Escríbelo a mano: ' + code, 'warning');
    }
  };

  // ====================================================================
  // 7. DIALOG HANDLERS
  // ====================================================================

  const handleOpenCreate = () => {
    const today = madridDay(new Date());
    setOriginalCode(null);
    setCurrentCoupon({
      code: '',
      discount_type: 'percent',
      value: '',
      from_date: today,
      to_date: addDays(today, 30),
      no_end: false,
      usage_limit: '',
      per_user_limit: 1,
      min_amount_eur: '',
      is_active: true,
    });
    setShowErrors(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleOpenEdit = (coupon: Coupon) => {
    const noEnd = isNoEnd(coupon.valid_to);
    setOriginalCode(coupon.code);
    setCurrentCoupon({
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      value: Number(coupon.value),
      from_date: coupon.valid_from ? madridDay(coupon.valid_from) : madridDay(new Date()),
      to_date: noEnd ? '' : madridDay(coupon.valid_to as string),
      no_end: noEnd,
      usage_limit: coupon.usage_limit || '',
      per_user_limit: coupon.per_user_limit || '',
      min_amount_eur: coupon.min_amount_eur ? Number(coupon.min_amount_eur) : '',
      is_active: coupon.is_active,
    });
    setShowErrors(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleClose = () => {
    if (saving) return;
    setOpenDialog(false);
    setCurrentCoupon(null);
  };

  const update = (patch: Partial<EditableCoupon>) => setCurrentCoupon((prev) => (prev ? { ...prev, ...patch } : prev));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const c = currentCoupon;
    if (!c) return e;
    if (!c.code) e.code = 'Escribe el código. Ej.: VERANO10';
    else if (!/^[A-Z0-9_-]{3,40}$/.test(c.code)) e.code = 'Solo letras (sin tildes ni ñ) y números, sin espacios. Mínimo 3.';
    const v = Number(c.value);
    if (c.value === '') e.value = c.discount_type === 'percent' ? 'Escribe el porcentaje. Ej.: 10' : 'Escribe la cantidad. Ej.: 5';
    else if (!(v > 0)) e.value = 'Tiene que ser mayor que 0.';
    else if (c.discount_type === 'percent' && v > 100) e.value = 'Un porcentaje no puede pasar de 100.';
    if (!c.from_date) e.from_date = 'Elige el día en que empieza.';
    if (!c.no_end) {
      if (!c.to_date) e.to_date = 'Elige el último día, o marca «Sin fecha de fin».';
      else if (c.from_date && c.to_date < c.from_date) e.to_date = 'El último día no puede ser antes del primero.';
    }
    if (c.usage_limit !== '' && (!Number.isInteger(Number(c.usage_limit)) || Number(c.usage_limit) < 1)) {
      e.usage_limit = 'Pon un número entero (1 o más) o déjalo vacío.';
    }
    if (c.per_user_limit !== '' && (!Number.isInteger(Number(c.per_user_limit)) || Number(c.per_user_limit) < 1)) {
      e.per_user_limit = 'Pon un número entero (1 o más) o déjalo vacío.';
    }
    if (c.min_amount_eur !== '' && Number(c.min_amount_eur) < 0) e.min_amount_eur = 'No puede ser negativo.';
    return e;
  }, [currentCoupon]);

  const hasErrors = Object.keys(errors).length > 0;
  const errFor = (k: string) => (showErrors ? errors[k] : undefined);

  const handleSave = async () => {
    const c = currentCoupon;
    if (!c) return;
    if (hasErrors) {
      setShowErrors(true);
      notify('Revisa los campos marcados en rojo.', 'warning');
      return;
    }

    // Vacío = sin límite: se manda null (antes no se enviaba y no se podía quitar un límite).
    const payload: Record<string, unknown> = {
      code: c.code,
      discount_type: c.discount_type,
      value: c.value,
      valid_from: madridToISO(c.from_date, '00:00:00'),
      valid_to: madridToISO(c.no_end ? NO_END_DATE : c.to_date, '23:59:59'),
      usage_limit: c.usage_limit === '' ? null : c.usage_limit,
      per_user_limit: c.per_user_limit === '' ? null : c.per_user_limit,
      min_amount_eur: c.min_amount_eur === '' ? null : c.min_amount_eur,
      is_active: c.is_active,
    };

    // Al editar, la dirección usa el código ORIGINAL (si se cambia el código, antes daba "no encontrado").
    const url = originalCode ? couponUrl(originalCode) : `${API_BASE_URL}v1/coupons/`;
    const method = originalCode ? 'PATCH' : 'POST';

    setSaving(true);
    try {
      await sendApiRequest(url, method, payload);
      notify(
        originalCode
          ? `Cambios guardados en el cupón ${c.code}.`
          : `Cupón ${c.code} creado.${c.is_active ? ' Ya se puede usar en la web.' : ''}`,
      );
      setOpenDialog(false);
      setCurrentCoupon(null);
    } catch (err) {
      notify(`No se ha podido guardar. ${await friendlyError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ====================================================================
  // 8. LISTA
  // ====================================================================

  const filteredCoupons = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = q ? coupons.filter((c) => c.code.toLowerCase().includes(q)) : coupons;
    const rank = (c: Coupon) => (couponState(c, usage?.[c.id]).label === 'Funciona' ? 0 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
  }, [coupons, searchTerm, usage]);

  // Resumen en lenguaje natural
  const c = currentCoupon;
  const summary = c && !hasErrors ? (
    <>
      <b>{c.code}</b> descuenta{' '}
      <b>
        {c.discount_type === 'percent'
          ? `un ${Number(c.value).toLocaleString('es-ES')} %`
          : c.discount_type === 'amount'
            ? fmtEur(c.value)
            : `${c.value} créditos`}
      </b>{' '}
      en cualquier compra de la web (clases sueltas, bonos o el primer cobro de una membresía),{' '}
      {c.usage_limit ? <>se puede usar <b>{c.usage_limit} {Number(c.usage_limit) === 1 ? 'vez' : 'veces'}</b> en total</> : 'se puede usar sin límite de veces'},{' '}
      {c.no_end
        ? <>sirve desde el <b>{longDate(c.from_date)}</b> y no caduca</>
        : <>sirve del <b>{longDate(c.from_date)}</b> al <b>{longDate(c.to_date)}</b> (incluido)</>}
      . {c.is_active ? 'Estará activo al guardar.' : 'Quedará desactivado (no funcionará todavía).'}
    </>
  ) : null;

  const today = madridDay(new Date());

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <PageIntro
        pageKey="coupons"
        title="Cupones de descuento"
        subtitle="Códigos que las clientas escriben al pagar en la web para tener un descuento. Ej.: VERANO10."
        actions={
          <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Crear un cupón
          </Button>
        }
        steps={[
          { title: 'Pulsa «Crear un cupón»', text: 'Elige el código que escribirán las clientas, por ejemplo VERANO10.' },
          { title: 'Di cuánto descuenta', text: 'Un porcentaje (10 %) o una cantidad fija (5 €).' },
          { title: 'Elige las fechas y cuántas veces se puede usar', text: 'Antes de guardar verás un resumen en una frase.' },
          { title: 'Compártelo', text: 'Pulsa «Copiar» y pégalo en un mensaje, en Instagram o en un aviso a clientas.' },
        ]}
        tips={[
          <>Si quieres que un cupón deje de funcionar, pulsa <b>«Desactivar»</b>: puedes volver a activarlo más tarde. Si lo borras, ya no podrás reutilizar ese código.</>,
          <>En las <b>membresías</b>, el descuento solo se aplica al <b>primer cobro</b>; los siguientes meses se cobra el precio normal.</>,
        ]}
      />

      {coupons.length > 5 && (
        <TextField
          fullWidth
          label="Buscar un cupón"
          placeholder="Escribe parte del código. Ej.: VERANO"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <Button size="small" onClick={() => setSearchTerm('')} sx={{ minHeight: 40 }}>Borrar</Button>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{ mb: 3 }}
        />
      )}

      {loading && coupons.length === 0 ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando los cupones…</Typography>
        </Stack>
      ) : errorMsg ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => { fetchCoupons(); fetchUsage(); }} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
          sx={{ alignItems: 'center', fontSize: '1rem' }}
        >
          No se han podido cargar los cupones. {errorMsg}
        </Alert>
      ) : filteredCoupons.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px dashed rgb(var(--studio-line-rgb) / 0.5)' }}>
          {searchTerm ? (
            <EmptyState title="Ningún cupón coincide" text="Prueba con otra parte del código o borra la búsqueda." />
          ) : (
            <EmptyState
              icon={<LocalOfferIcon />}
              title="Todavía no hay cupones"
              text="Crea uno para hacer una promoción: por ejemplo, un 10 % de descuento en verano."
              action={
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate} sx={{ minHeight: 48 }}>
                  Crear el primer cupón
                </Button>
              }
            />
          )}
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {filteredCoupons.map((coupon) => {
            const used = usage?.[coupon.id];
            const state = couponState(coupon, used);
            const busy = busyCode === coupon.code;
            return (
              <Paper
                key={coupon.id}
                elevation={0}
                sx={{
                  p: { xs: 2, md: 2.25 }, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
                  backgroundColor: state.label === 'Funciona' ? 'rgba(255,255,255,0.9)' : 'rgb(var(--studio-bg-deep-rgb) / 0.6)',
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                      <LocalOfferIcon sx={{ color: 'var(--studio-primary-shade)' }} aria-hidden />
                      <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--studio-dark)', wordBreak: 'break-all' }}>
                        {coupon.code}
                      </Typography>
                      <Chip
                        size="small"
                        label={state.label}
                        color={state.color}
                        variant={state.color === 'default' ? 'outlined' : 'filled'}
                        sx={{ fontSize: '0.85rem' }}
                      />
                    </Stack>
                    <Typography sx={{ mt: 0.75, fontSize: '1.05rem', color: 'var(--studio-dark)' }}>
                      {coupon.discount_type === 'percent' ? <PercentIcon sx={{ fontSize: 18, verticalAlign: '-3px', mr: 0.5 }} /> : <EuroIcon sx={{ fontSize: 18, verticalAlign: '-3px', mr: 0.5 }} />}
                      <b>{discountText(coupon.discount_type, coupon.value)}</b>
                      {coupon.discount_type === 'credits' && ' (este tipo no se aplica en la web)'}
                    </Typography>
                    <Typography sx={{ mt: 0.4, fontSize: '0.95rem', color: 'var(--studio-text-strong)' }}>
                      {coupon.valid_from ? `Desde el ${longDate(madridDay(coupon.valid_from))}` : 'Desde siempre'}
                      {isNoEnd(coupon.valid_to) ? ' · no caduca' : ` hasta el ${longDate(madridDay(coupon.valid_to as string))}`}
                      {' · '}
                      {coupon.usage_limit
                        ? used !== undefined
                          ? `usado ${used} de ${coupon.usage_limit} veces`
                          : `se puede usar ${coupon.usage_limit} veces`
                        : used !== undefined
                          ? `usado ${used} ${used === 1 ? 'vez' : 'veces'} (sin límite)`
                          : 'sin límite de usos'}
                    </Typography>
                    <Typography sx={{ mt: 0.25, fontSize: '0.9rem', color: 'text.secondary' }}>{state.text}</Typography>
                  </Box>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ flexShrink: 0, '& .MuiButton-root': { minHeight: 44 } }}
                  >
                    <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => handleCopy(coupon.code)}>
                      Copiar
                    </Button>
                    <Button variant="contained" startIcon={<EditIcon />} onClick={() => handleOpenEdit(coupon)} disabled={busy}>
                      Cambiar
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={coupon.is_active ? <PauseCircleOutlineIcon /> : <PlayCircleOutlineIcon />}
                      onClick={() => handleToggleActive(coupon)}
                      disabled={busy}
                    >
                      {coupon.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(coupon)} disabled={busy}>
                      Borrar
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* --- DIÁLOGO CREAR / CAMBIAR --- */}
      <Dialog open={openDialog} onClose={handleClose} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ fontSize: '1.3rem' }}>
          {originalCode ? `Cambiar el cupón ${originalCode}` : 'Crear un cupón'}
        </DialogTitle>
        <DialogContent dividers>
          {c && (
            <>
              <FormStep n={1} title="¿Qué código escribirán las clientas?">
                <TextField
                  fullWidth
                  required
                  label="Código"
                  placeholder="Ej.: VERANO10"
                  value={c.code}
                  onChange={(e) => update({ code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                  error={Boolean(errFor('code'))}
                  helperText={
                    errFor('code') ||
                    (originalCode && c.code !== originalCode
                      ? `Ojo: el código antiguo (${originalCode}) dejará de funcionar.`
                      : 'Corto y fácil de recordar. Solo letras y números, sin espacios.')
                  }
                  inputProps={{ maxLength: 40, style: { letterSpacing: '0.05em', fontWeight: 600 } }}
                />
              </FormStep>

              <FormStep n={2} title="¿Cuánto descuenta?">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} role="radiogroup" aria-label="Tipo de descuento" sx={{ mb: 2 }}>
                  <ChoiceCard
                    selected={c.discount_type === 'percent'}
                    onClick={() => update({ discount_type: 'percent' })}
                    icon={<PercentIcon />}
                    title="Un porcentaje (%)"
                    text="Ej.: 10 % → un bono de 50 € se queda en 45 €."
                  />
                  <ChoiceCard
                    selected={c.discount_type === 'amount'}
                    onClick={() => update({ discount_type: 'amount' })}
                    icon={<EuroIcon />}
                    title="Una cantidad fija (€)"
                    text="Ej.: 5 € → un bono de 50 € se queda en 45 €."
                  />
                </Stack>
                {c.discount_type === 'credits' && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Este cupón es de «créditos de regalo», un tipo que la web todavía no aplica. Elige porcentaje o cantidad fija
                    para que funcione.
                  </Alert>
                )}
                <TextField
                  fullWidth
                  required
                  label={c.discount_type === 'percent' ? 'Porcentaje de descuento' : 'Cantidad de descuento'}
                  type="number"
                  value={c.value}
                  onChange={(e) => update({ value: e.target.value === '' ? '' : Number(e.target.value) })}
                  error={Boolean(errFor('value'))}
                  helperText={errFor('value') || (c.discount_type === 'percent' ? 'Ej.: 10 (un 10 %)' : 'Ej.: 5 (5 € menos)')}
                  inputProps={{ min: 0, step: c.discount_type === 'percent' ? 1 : 0.5, inputMode: 'decimal' }}
                  slotProps={{
                    input: {
                      endAdornment: <InputAdornment position="end">{c.discount_type === 'percent' ? '%' : '€'}</InputAdornment>,
                    },
                  }}
                />
              </FormStep>

              <FormStep n={3} title="¿Qué días sirve?" hint="Funciona desde el primer día a las 00:00 hasta el último día a las 23:59 (hora de España).">
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {[
                    { label: '1 semana', days: 6 },
                    { label: '1 mes', days: 30 },
                    { label: '3 meses', days: 91 },
                  ].map((p) => (
                    <Chip
                      key={p.label}
                      label={p.label}
                      clickable
                      variant="outlined"
                      onClick={() => update({ to_date: addDays(c.from_date || today, p.days), no_end: false })}
                      sx={{ minHeight: 40, fontSize: '0.95rem' }}
                    />
                  ))}
                  <Chip
                    label="Sin fecha de fin"
                    clickable
                    color={c.no_end ? 'primary' : 'default'}
                    variant={c.no_end ? 'filled' : 'outlined'}
                    onClick={() => update({ no_end: !c.no_end })}
                    sx={{ minHeight: 40, fontSize: '0.95rem' }}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    required
                    label="Primer día"
                    type="date"
                    value={c.from_date}
                    onChange={(e) => update({ from_date: e.target.value })}
                    error={Boolean(errFor('from_date'))}
                    helperText={errFor('from_date') || (c.from_date ? longDate(c.from_date) : ' ')}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  {c.no_end ? (
                    <Alert severity="info" sx={{ flex: 1, alignItems: 'center' }}>No caduca: funcionará hasta que lo desactives.</Alert>
                  ) : (
                    <TextField
                      fullWidth
                      required
                      label="Último día (incluido)"
                      type="date"
                      value={c.to_date}
                      onChange={(e) => update({ to_date: e.target.value })}
                      error={Boolean(errFor('to_date'))}
                      helperText={errFor('to_date') || (c.to_date ? longDate(c.to_date) : ' ')}
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: c.from_date || undefined } }}
                    />
                  )}
                </Stack>
              </FormStep>

              <FormStep n={4} title="¿Cuántas veces se puede usar?">
                <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                  <TextField
                    fullWidth
                    label="Número de veces en total"
                    type="number"
                    placeholder="Sin límite"
                    value={c.usage_limit}
                    onChange={(e) => update({ usage_limit: e.target.value === '' ? '' : Number(e.target.value) })}
                    error={Boolean(errFor('usage_limit'))}
                    helperText={errFor('usage_limit') || 'Ej.: 50. Déjalo vacío para que no tenga límite.'}
                    inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
                  />
                  <Box sx={{ pt: 1.5 }}>
                    <HelpTip title="Veces en total">
                      Entre todas las clientas. Si pones 50, cuando se haya usado 50 veces la web dirá «Este cupón ha agotado
                      sus usos». Cuenta cada vez que alguien lo aplica al pagar, aunque luego no termine el pago.
                    </HelpTip>
                  </Box>
                </Stack>
              </FormStep>

              <FormStep n={5} title="¿Funciona ya?">
                <FormControlLabel
                  control={<Switch checked={c.is_active} onChange={(_, checked) => update({ is_active: checked })} />}
                  label={c.is_active ? 'Sí, activo (funciona dentro de sus fechas)' : 'No, dejarlo desactivado por ahora'}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: '1rem' } }}
                />
              </FormStep>

              <Paper
                elevation={0}
                sx={{ p: 2, borderRadius: 3, backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.08)', border: '1px solid rgb(var(--studio-primary-rgb) / 0.3)' }}
              >
                <Typography sx={{ fontWeight: 600, mb: 0.5, color: 'var(--studio-dark)' }}>Así quedará</Typography>
                <Typography sx={{ fontSize: '1rem', color: 'var(--studio-dark)', lineHeight: 1.6 }}>
                  {summary || 'Rellena los campos marcados para ver el resumen.'}
                </Typography>
              </Paper>

              <Box sx={{ mt: 2 }}>
                <Button
                  onClick={() => setShowAdvanced((v) => !v)}
                  endIcon={<ExpandMoreIcon sx={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                  sx={{ minHeight: 44, color: 'text.secondary' }}
                  aria-expanded={showAdvanced}
                >
                  Opciones avanzadas
                </Button>
                <Collapse in={showAdvanced} unmountOnExit>
                  <Paper variant="outlined" sx={{ p: 2, mt: 1, borderRadius: 3 }}>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      No toques esto salvo que te lo pida Ulises. Ahora mismo <b>la web no comprueba estas dos reglas</b>: se
                      guardan por si se activan más adelante.
                    </Alert>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        fullWidth
                        label="Veces por clienta"
                        type="number"
                        value={c.per_user_limit}
                        onChange={(e) => update({ per_user_limit: e.target.value === '' ? '' : Number(e.target.value) })}
                        error={Boolean(errFor('per_user_limit'))}
                        helperText={errFor('per_user_limit') || 'Ej.: 1. Vacío = sin límite.'}
                        inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
                      />
                      <TextField
                        fullWidth
                        label="Compra mínima"
                        type="number"
                        value={c.min_amount_eur}
                        onChange={(e) => update({ min_amount_eur: e.target.value === '' ? '' : Number(e.target.value) })}
                        error={Boolean(errFor('min_amount_eur'))}
                        helperText={errFor('min_amount_eur') || 'Ej.: 30. Vacío = sin mínimo.'}
                        inputProps={{ min: 0, step: 1, inputMode: 'decimal' }}
                        slotProps={{ input: { endAdornment: <InputAdornment position="end">€</InputAdornment> } }}
                      />
                    </Stack>
                  </Paper>
                </Collapse>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
          <Button variant="outlined" onClick={handleClose} disabled={saving} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {saving ? 'Guardando…' : originalCode ? 'Guardar los cambios' : 'Crear el cupón'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
