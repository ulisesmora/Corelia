import { forwardRef, useImperativeHandle, useState, useEffect, useMemo, ReactNode } from 'react';
import type { CatalogHandle, EmbedProps } from './catalogo/embed';
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
  MenuItem,
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
import CreditScoreIcon from '@mui/icons-material/CreditScore';
import LoopIcon from '@mui/icons-material/Loop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { EnglishChip, EnglishField, EnglishVersion } from '../components/guide/EnglishVersion';
import { friendlyError } from '../utils/errors';
import { currencySymbol, money, STUDIO_DROP_IN_PRICE } from '../site/money';
import { API_BASE_URL } from '../config';
import { useActionParam } from '../onboarding';

// ====================================================================
// 1. INTERFACES Y CONSTANTES
// ====================================================================

interface Plan {
  id: number;
  name: string;
  slug: string;
  type: 'pack' | 'sub';
  credits: number;
  price_eur: string;
  interval: string | null;
  interval_count: number | null;
  auto_renew: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  credits_expire_days: number | null;
  is_active: boolean;
  description: string | null;
  saving: string | null;
  price_credit: string | null;
  name_en?: string;
  description_en?: string;
}

// Para el estado del formulario y el envío a la API
type EditablePlan = {
  id?: number;
  name: string;
  type: 'pack' | 'sub';
  credits: number | '';
  price_eur: number | '';
  interval: string | null;
  interval_count: number | null;
  auto_renew: boolean;
  credits_expire_days: number | '' | null;
  is_active: boolean;
  description: string | null;
  saving: number | '' | null;
  price_credit: number | '' | null;
  name_en: string;
  description_en: string;
};

const INTERVALS = [
  { value: 'month', one: 'mes', many: 'meses' },
  { value: 'week', one: 'semana', many: 'semanas' },
  { value: 'year', one: 'año', many: 'años' },
  { value: 'day', one: 'día', many: 'días' },
];

const PERIOD_PRESETS = [
  { label: 'Cada mes', interval: 'month', count: 1 },
  { label: 'Cada 2 meses', interval: 'month', count: 2 },
  { label: 'Cada 3 meses', interval: 'month', count: 3 },
  { label: 'Cada año', interval: 'year', count: 1 },
];

const EXPIRE_PRESETS: { label: string; days: number | '' }[] = [
  { label: '30 días', days: 30 },
  { label: '60 días', days: 60 },
  { label: '90 días', days: 90 },
  { label: '6 meses', days: 180 },
  { label: 'No caducan', days: '' },
];

/** Precio de la clase suelta del estudio (Ajustes; 12 si aún no se ha puesto). */
const singleClassPrice = () => STUDIO_DROP_IN_PRICE || 12;

// ====================================================================
// 2. AYUDAS DE FORMATO (precios en español, "cada 2 meses"…)
// ====================================================================

/** Precio en la moneda del estudio ("12 €", "$549", "$15.990"…). */
function fmtEur(value: number | string | null | undefined): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(n)) return '—';
  return money(n, { decimals: 'auto' });
}

function periodText(interval: string | null | undefined, count: number | null | undefined): string {
  const unit = INTERVALS.find((i) => i.value === interval) || INTERVALS[0];
  const c = Math.max(1, Number(count) || 1);
  return c === 1 ? `cada ${unit.one}` : `cada ${c} ${unit.many}`;
}

/** Precio equivalente al mes (o null si no tiene sentido mostrarlo). */
function monthlyEquivalent(price: number, interval: string | null | undefined, count: number | null | undefined): number | null {
  const c = Math.max(1, Number(count) || 1);
  if (interval === 'month') return c === 1 ? null : price / c;
  if (interval === 'year') return price / (12 * c);
  if (interval === 'week') return (price * 52) / 12 / c;
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
        gap: 1.5, p: 2, borderRadius: 3, minHeight: 88,
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

function PlanCard({
  plan, onEdit, onToggle, onDelete, busy,
}: {
  plan: Plan;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const price = Number(plan.price_eur);
  const isSub = plan.type === 'sub';
  const perMonth = isSub ? monthlyEquivalent(price, plan.interval, plan.interval_count) : null;
  const perCredit = plan.price_credit ? Number(plan.price_credit) : plan.credits ? price / plan.credits : null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.25, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 1.25,
        border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
        backgroundColor: plan.is_active ? 'rgb(var(--studio-surface-rgb) / 0.9)' : 'rgb(var(--studio-bg-deep-rgb) / 0.6)',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
        <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.15rem', color: 'var(--studio-dark)', lineHeight: 1.35 }}>
          {plan.name}
        </Typography>
        <Stack spacing={0.75} alignItems="flex-end" sx={{ flexShrink: 0 }}>
          <Chip
            size="small"
            icon={plan.is_active ? <VisibilityIcon /> : <VisibilityOffIcon />}
            label={plan.is_active ? 'Se ve en la web' : 'Oculto en la web'}
            color={plan.is_active ? 'success' : 'default'}
            variant={plan.is_active ? 'filled' : 'outlined'}
            sx={{ flexShrink: 0, fontSize: '0.85rem' }}
          />
          <EnglishChip size="small" pairs={[[plan.name, plan.name_en], [plan.description, plan.description_en]]} />
        </Stack>
      </Stack>

      <Box>
        <Typography sx={{ fontSize: '1.9rem', fontWeight: 600, color: 'var(--studio-dark)', lineHeight: 1.1 }}>
          {fmtEur(price)}
          {isSub && (
            <Box component="span" sx={{ fontSize: '1rem', fontWeight: 500, color: 'var(--studio-text-strong)', ml: 0.75 }}>
              {periodText(plan.interval, plan.interval_count)}
            </Box>
          )}
        </Typography>
        {perMonth !== null && (
          <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>
            (= {fmtEur(round2(perMonth))} al mes{plan.interval === 'week' ? ' aprox.' : ''})
          </Typography>
        )}
      </Box>

      <Stack spacing={0.4} sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>
        <Typography sx={{ fontSize: 'inherit' }}>
          <b>{plan.credits} {plan.credits === 1 ? 'crédito' : 'créditos'}</b>
          {isSub ? ` ${periodText(plan.interval, plan.interval_count)}` : ''}
          {perCredit ? ` · ${fmtEur(round2(perCredit))} por crédito` : ''}
        </Typography>
        <Typography sx={{ fontSize: 'inherit' }}>
          {plan.credits_expire_days
            ? `Los créditos caducan a los ${plan.credits_expire_days} días`
            : 'Los créditos no caducan'}
        </Typography>
        {plan.saving && Number(plan.saving) > 0 && (
          <Typography sx={{ fontSize: 'inherit' }}>En la web pone: «Ahorras {Number(plan.saving)}»</Typography>
        )}
        {plan.description && (
          <Typography
            sx={{
              fontSize: '0.92rem', color: 'text.secondary', mt: 0.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {plan.description}
          </Typography>
        )}
      </Stack>

      <Box sx={{ flex: 1 }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ '& .MuiButton-root': { minHeight: 44 } }}>
        <Button variant="contained" startIcon={<EditIcon />} onClick={onEdit} disabled={busy}>
          Cambiar
        </Button>
        <Button
          variant="outlined"
          startIcon={plan.is_active ? <VisibilityOffIcon /> : <VisibilityIcon />}
          onClick={onToggle}
          disabled={busy}
        >
          {plan.is_active ? 'Ocultar de la web' : 'Mostrar en la web'}
        </Button>
        <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={onDelete} disabled={busy}>
          Borrar
        </Button>
      </Stack>
    </Paper>
  );
}

// ====================================================================
// 4. COMPONENTE PRINCIPAL
// ====================================================================

/** Pantalla completa; `embedded`: solo sus ventanas, para «Clases y precios» (./catalogo/embed.ts). */
const PlanManagement = forwardRef<CatalogHandle, EmbedProps>(function PlanManagement({ embedded = false, onChanged }, ref) {
  const confirm = useConfirm();
  const notify = useNotify();

  const [openDialog, setOpenDialog] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<Partial<EditablePlan> | null>(null);
  const [originalPlan, setOriginalPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Data principal
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  // ====================================================================
  // 5. FETCHERS
  // ====================================================================

  const fetchPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/plans/`);
      if (!res.ok) throw res;
      const data: Plan[] = await res.json();
      setPlans(Array.isArray(data) ? data : []);
      setPlansError('');
    } catch (err) {
      setPlansError(await friendlyError(err));
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  /** Cuántas clientas tienen ahora mismo esta membresía activa (null si no se sabe). */
  const countActiveMembers = async (planId: number): Promise<number | null> => {
    try {
      const token = JSON.parse(localStorage.getItem('user') as string).access;
      const res = await fetch(`${API_BASE_URL}v1/subscriptions/?plan=${planId}&status=active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data.length : typeof data.count === 'number' ? data.count : (data.results || []).length;
    } catch {
      return null;
    }
  };

  // ====================================================================
  // 6. API HANDLERS (CRUD)
  // ====================================================================

  const sendApiRequest = async (url: string, method: string, data?: Partial<EditablePlan>) => {
    const dataToSend: Partial<EditablePlan> = data ? { ...data } : {};

    if (dataToSend.type === 'pack') {
      dataToSend.interval = null;
      dataToSend.interval_count = null;
      dataToSend.auto_renew = false;
    }
    // BUG corregido: un campo numérico vacío ('') lo rechaza la API
    // ("A valid integer is required"). Vacío = sin valor = null.
    if (dataToSend.credits_expire_days === '') dataToSend.credits_expire_days = null;
    if (dataToSend.saving === '') dataToSend.saving = null;
    if (dataToSend.price_credit === '') dataToSend.price_credit = null;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${JSON.parse(localStorage.getItem('user') as string).access}`,
      },
      body: method === 'DELETE' ? undefined : JSON.stringify(dataToSend),
    });

    if (!response.ok) throw response;
    await fetchPlans();
    onChanged?.();
  };

  const handleToggleActive = async (plan: Plan) => {
    const hide = plan.is_active;
    const kind = plan.type === 'sub' ? 'membresía' : 'bono';
    let members: number | null = null;
    if (hide && plan.type === 'sub') members = await countActiveMembers(plan.id);

    const ok = await confirm(
      hide
        ? {
            title: `¿Ocultar «${plan.name}» de la web?`,
            message: (
              <>
                <p style={{ marginTop: 0 }}>Dejará de aparecer en la web y nadie podrá comprarlo.</p>
                <p>
                  Las clientas que ya lo compraron <b>no pierden nada</b>
                  {plan.type === 'sub' && (
                    <>
                      : {members !== null ? <b>las {members} que la tienen ahora</b> : 'las que ya la tienen'} seguirán
                      pagando y recibiendo sus créditos como siempre (ocultar no cancela sus membresías)
                    </>
                  )}
                  .
                </p>
                <p style={{ marginBottom: 0 }}>Puedes volver a mostrarlo cuando quieras.</p>
              </>
            ),
            confirmText: 'Sí, ocultar de la web',
          }
        : {
            title: `¿Mostrar «${plan.name}» en la web?`,
            message: `Las clientas podrán comprar este ${kind} en la web por ${fmtEur(plan.price_eur)}${
              plan.type === 'sub' ? ` ${periodText(plan.interval, plan.interval_count)}` : ''
            }. Puede tardar unos minutos en verse.`,
            confirmText: 'Sí, mostrar en la web',
          },
    );
    if (!ok) return;

    setBusyId(plan.id);
    try {
      await sendApiRequest(`${API_BASE_URL}v1/plans/${plan.id}/`, 'PATCH', { is_active: !hide });
      notify(hide ? `«${plan.name}» ya no se ve en la web.` : `«${plan.name}» ya se puede comprar en la web.`);
    } catch (err) {
      notify(`No se ha podido cambiar. ${await friendlyError(err)}`, 'error');
      fetchPlans();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (plan: Plan) => {
    const isSub = plan.type === 'sub';
    const members = isSub ? await countActiveMembers(plan.id) : null;
    const ok = await confirm({
      tone: 'danger',
      title: `¿Borrar «${plan.name}»?`,
      message: (
        <>
          <p style={{ marginTop: 0 }}>Desaparece de la web y de esta lista. No se puede deshacer desde aquí.</p>
          {isSub ? (
            <p>
              <b>Borrar no cancela las membresías que ya existen</b>
              {members !== null && members > 0 ? <> (ahora mismo la tienen <b>{members}</b> clientas)</> : ''}: se les
              seguirá cobrando y recibirán sus créditos igual.
            </p>
          ) : (
            <p>Las clientas que ya lo compraron conservan sus créditos.</p>
          )}
          <p>Después no podrás crear otro con el mismo nombre.</p>
          <p style={{ marginBottom: 0 }}>
            Si solo quieres dejar de venderlo, es mejor pulsar <b>«Ocultar de la web»</b>.
          </p>
        </>
      ),
      confirmText: `Sí, borrar «${plan.name}»`,
    });
    if (!ok) return;

    setBusyId(plan.id);
    try {
      await sendApiRequest(`${API_BASE_URL}v1/plans/${plan.id}/`, 'DELETE');
      notify(`«${plan.name}» se ha borrado.`);
    } catch (err) {
      notify(`No se ha podido borrar. ${await friendlyError(err)}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  // ====================================================================
  // 7. DIALOG HANDLERS & SAVE
  // ====================================================================

  const handleOpenCreate = (type: 'pack' | 'sub' = 'pack') => {
    setOriginalPlan(null);
    setCurrentPlan({
      name: '',
      type,
      credits: '',
      price_eur: '',
      interval: type === 'sub' ? 'month' : null,
      interval_count: type === 'sub' ? 1 : null,
      auto_renew: type === 'sub',
      credits_expire_days: type === 'sub' ? 30 : 90,
      is_active: true,
      description: '',
      saving: '',
      price_credit: '',
      name_en: '',
      description_en: '',
    });
    setShowErrors(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setOriginalPlan(plan);
    setCurrentPlan({
      id: plan.id,
      name: plan.name,
      type: plan.type,
      credits: plan.credits,
      price_eur: Number(plan.price_eur),
      interval: plan.interval,
      interval_count: plan.interval_count,
      auto_renew: plan.auto_renew,
      credits_expire_days: plan.credits_expire_days || '',
      is_active: plan.is_active,
      description: plan.description || '',
      saving: plan.saving ? Number(plan.saving) : '',
      price_credit: plan.price_credit ? Number(plan.price_credit) : '',
      name_en: plan.name_en || '',
      description_en: plan.description_en || '',
    });
    setShowErrors(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    if (saving) return;
    setOpenDialog(false);
    setCurrentPlan(null);
    setOriginalPlan(null);
  };

  const update = (patch: Partial<EditablePlan>) => setCurrentPlan((prev) => ({ ...prev!, ...patch }));

  // Validación en el propio campo, antes de enviar
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!currentPlan) return e;
    if (!currentPlan.name?.trim()) e.name = 'Escribe un nombre. Ej.: Bono 8 clases';
    const credits = Number(currentPlan.credits);
    if (currentPlan.credits === '' || currentPlan.credits === undefined) e.credits = 'Escribe cuántos créditos da. Ej.: 8';
    else if (!Number.isInteger(credits) || credits < 1) e.credits = 'Tiene que ser un número entero, 1 o más.';
    const price = Number(currentPlan.price_eur);
    if (currentPlan.price_eur === '' || currentPlan.price_eur === undefined) e.price_eur = 'Escribe el precio. Ej.: 76';
    else if (!(price > 0)) e.price_eur = 'El precio tiene que ser mayor que 0.';
    if (currentPlan.type === 'sub') {
      const c = Number(currentPlan.interval_count);
      if (!Number.isInteger(c) || c < 1) e.interval_count = 'Pon 1 o más. Ej.: 2 = cada 2 meses';
    }
    const exp = currentPlan.credits_expire_days;
    if (exp !== '' && exp !== null && exp !== undefined && (!Number.isInteger(Number(exp)) || Number(exp) < 1)) {
      e.credits_expire_days = 'Pon un número de días (1 o más) o déjalo vacío.';
    }
    if (currentPlan.saving !== '' && currentPlan.saving != null && Number(currentPlan.saving) < 0) {
      e.saving = 'No puede ser negativo.';
    }
    if (currentPlan.price_credit !== '' && currentPlan.price_credit != null && Number(currentPlan.price_credit) <= 0) {
      e.price_credit = 'Tiene que ser mayor que 0 o quedarse vacío.';
    }
    return e;
  }, [currentPlan]);

  const hasErrors = Object.keys(errors).length > 0;
  const errFor = (k: string) => (showErrors ? errors[k] : undefined);

  const handleSave = async () => {
    if (!currentPlan) return;
    if (hasErrors) {
      setShowErrors(true);
      notify('Revisa los campos marcados en rojo.', 'warning');
      return;
    }

    // Cambios con consecuencias para clientas que ya compraron: confirmar antes
    if (originalPlan) {
      const p = currentPlan;
      const priceChanged = Number(p.price_eur) !== Number(originalPlan.price_eur);
      const creditsChanged = Number(p.credits) !== originalPlan.credits;
      const periodChanged =
        p.type === 'sub' &&
        (p.interval !== originalPlan.interval || Number(p.interval_count) !== Number(originalPlan.interval_count));
      const typeChanged = p.type !== originalPlan.type;

      if (priceChanged || creditsChanged || periodChanged || typeChanged) {
        const isSub = p.type === 'sub';
        const members = originalPlan.type === 'sub' ? await countActiveMembers(originalPlan.id) : null;
        const lines: ReactNode[] = [];
        if (priceChanged) {
          lines.push(
            isSub ? (
              <>
                Las clientas <b>nuevas</b> verán en la web {fmtEur(p.price_eur as number)} {periodText(p.interval, p.interval_count)} (antes{' '}
                {fmtEur(originalPlan.price_eur)}). Las que <b>ya tienen</b> esta membresía
                {members !== null ? ` (${members})` : ''} siguen pagando lo mismo que pagaban.
              </>
            ) : (
              <>
                Desde ahora la web venderá este bono a <b>{fmtEur(p.price_eur as number)}</b> (antes {fmtEur(originalPlan.price_eur)}).
                Quien ya lo compró no se ve afectada.
              </>
            ),
          );
        }
        if (creditsChanged) {
          lines.push(
            isSub ? (
              <>
                Las clientas que ya tienen esta membresía{members !== null ? ` (${members})` : ''} recibirán{' '}
                <b>{p.credits} créditos</b> (antes {originalPlan.credits}) en su <b>próxima renovación</b>.
              </>
            ) : (
              <>Las próximas compras darán <b>{p.credits} créditos</b> (antes {originalPlan.credits}). Los créditos ya dados no cambian.</>
            ),
          );
        }
        if (periodChanged) {
          lines.push(
            <>
              Se cobrará <b>{periodText(p.interval, p.interval_count)}</b> (antes {periodText(originalPlan.interval, originalPlan.interval_count)}) solo
              a las clientas nuevas.
            </>,
          );
        }
        if (typeChanged) {
          lines.push(<>Cambias el tipo (bono ↔ membresía). Es más seguro crear uno nuevo y ocultar este.</>);
        }
        const stripeLinked = isSub && Boolean(originalPlan.stripe_price_id) && (priceChanged || periodChanged);

        const ok = await confirm({
          tone: stripeLinked ? 'danger' : 'normal',
          title: `¿Guardar los cambios de «${p.name}»?`,
          message: (
            <>
              <Box component="ul" sx={{ pl: 2.5, my: 0 }}>
                {lines.map((l, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>{l}</li>
                ))}
              </Box>
              {stripeLinked && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  <b>Ojo:</b> esta membresía tiene un precio fijo guardado en el sistema de cobro con tarjeta (Stripe).
                  La web mostrará el precio nuevo, pero <b>se seguirá cobrando el precio de antes</b> hasta que soporte técnico lo
                  cambie allí. Avísale antes de guardar.
                </Alert>
              )}
            </>
          ),
          confirmText: 'Sí, guardar los cambios',
        });
        if (!ok) return;
      }
    }

    const url = currentPlan.id ? `${API_BASE_URL}v1/plans/${currentPlan.id}/` : `${API_BASE_URL}v1/plans/`;
    const method = currentPlan.id ? 'PATCH' : 'POST';

    setSaving(true);
    try {
      await sendApiRequest(url, method, { ...currentPlan, name: currentPlan.name?.trim() } as EditablePlan);
      notify(
        currentPlan.id
          ? `Cambios guardados en «${currentPlan.name}». La web se actualiza en unos minutos.`
          : `«${currentPlan.name}» creado.${currentPlan.is_active ? ' Aparecerá en la web en unos minutos.' : ''}`,
      );
      setOpenDialog(false);
      setCurrentPlan(null);
      setOriginalPlan(null);
    } catch (err) {
      notify(`No se ha podido guardar. ${await friendlyError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ====================================================================
  // 8. FILTRADO
  // ====================================================================

  const filteredPlans = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = q
      ? plans.filter(
          (plan) => plan.name.toLowerCase().includes(q) || plan.description?.toLowerCase().includes(q),
        )
      : plans;
    return [...list].sort((a, b) => a.credits - b.credits || Number(a.price_eur) - Number(b.price_eur));
  }, [plans, searchTerm]);

  const packs = filteredPlans.filter((p) => p.type === 'pack');
  const subs = filteredPlans.filter((p) => p.type !== 'pack');

  // ====================================================================
  // 9. RESUMEN DEL FORMULARIO (en lenguaje natural)
  // ====================================================================

  const cp = currentPlan;
  const cpPrice = Number(cp?.price_eur) || 0;
  const cpCredits = Number(cp?.credits) || 0;
  const cpPerCredit = cpPrice && cpCredits ? round2(cpPrice / cpCredits) : null;
  const cpPerMonth = cp?.type === 'sub' && cpPrice ? monthlyEquivalent(cpPrice, cp.interval, cp.interval_count) : null;
  const priceCreditMismatch =
    cp?.price_credit !== '' && cp?.price_credit != null && cpPerCredit !== null &&
    Math.abs(Number(cp.price_credit) - cpPerCredit) >= 0.01;

  const summary = cp && !hasErrors ? (
    <>
      {cp.type === 'sub' ? 'Membresía' : 'Bono'} <b>«{cp.name?.trim()}»</b>: {cp.type === 'sub' ? 'la clienta paga' : 'se paga una vez'}{' '}
      <b>{fmtEur(cpPrice)}</b>
      {cp.type === 'sub' && <> {periodText(cp.interval, cp.interval_count)}</>}
      {cpPerMonth !== null && <> (= {fmtEur(round2(cpPerMonth))} al mes)</>} y recibe <b>{cpCredits} {cpCredits === 1 ? 'crédito' : 'créditos'}</b>
      {cp.type === 'sub' && ' cada vez'}
      {cpPerCredit !== null && <> ({fmtEur(cpPerCredit)} por crédito)</>}.{' '}
      {cp.credits_expire_days ? `Los créditos caducan a los ${cp.credits_expire_days} días.` : 'Los créditos no caducan.'}{' '}
      {cp.is_active ? 'Se verá en la web y se podrá comprar.' : 'No se verá en la web (queda oculto).'}
    </>
  ) : null;

  // ====================================================================
  // 10. RENDER
  // ====================================================================

  const renderSection = (title: string, help: ReactNode, list: Plan[], type: 'pack' | 'sub') => (
    <Box component="section" sx={{ mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.45rem', fontWeight: 600, color: 'var(--studio-dark)' }}>
          {title}
        </Typography>
        <HelpTip title={title}>{help}</HelpTip>
      </Stack>
      {list.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px dashed rgb(var(--studio-line-rgb) / 0.5)' }}>
          <EmptyState
            compact
            title={searchTerm ? 'Ninguno coincide con la búsqueda' : type === 'pack' ? 'Todavía no hay bonos' : 'Todavía no hay membresías'}
            text={searchTerm ? 'Prueba a escribir otra palabra o borra la búsqueda.' : undefined}
            action={
              !searchTerm && (
                <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenCreate(type)} sx={{ minHeight: 44 }}>
                  {type === 'pack' ? 'Crear el primer bono' : 'Crear la primera membresía'}
                </Button>
              )
            }
          />
        </Paper>
      ) : (
        <Box data-tour="list" sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
          {list.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              busy={busyId === plan.id}
              onEdit={() => handleOpenEdit(plan)}
              onToggle={() => handleToggleActive(plan)}
              onDelete={() => handleDelete(plan)}
            />
          ))}
        </Box>
      )}
    </Box>
  );

  // Enlaces directos desde la guía de puesta en marcha (?accion=nueva)
  useActionParam('nueva', () => handleOpenCreate('pack'));

  useImperativeHandle(ref, () => ({
    create: (kind) => handleOpenCreate(kind || 'pack'), edit: (p) => handleOpenEdit(p as Plan),
    remove: (p) => handleDelete(p as Plan), toggle: (p) => handleToggleActive(p as Plan),
  }));

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      {!embedded && (<>
      <PageIntro
        pageKey="plans"
        title="Bonos y precios"
        subtitle="Lo que tus clientas compran en la web."
        actions={
          <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => handleOpenCreate('pack')}>
            Crear bono o membresía
          </Button>
        }
      />

      {plans.length > 6 && (
        <TextField
          fullWidth
          data-tour="search" label="Buscar un bono o membresía"
          placeholder="Ej.: 8 clases, Basic…"
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

      {plansLoading && plans.length === 0 ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando los bonos y membresías…</Typography>
        </Stack>
      ) : plansError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchPlans} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
          sx={{ alignItems: 'center', fontSize: '1rem' }}
        >
          No se han podido cargar los bonos. {plansError}
        </Alert>
      ) : (
        <>
          {renderSection(
            'Bonos',
            <>Un <b>bono</b> se paga <b>una sola vez</b> y da unos créditos para gastar en clases. No se renueva solo: cuando se acaban, la clienta compra otro.</>,
            packs,
            'pack',
          )}
          {renderSection(
            'Membresías',
            <>
              Una <b>membresía</b> se cobra <b>sola</b> con la tarjeta de la clienta cada cierto tiempo (cada mes, o cada 2-3
              meses) y cada vez le da sus créditos. «Cada 2 meses» quiere decir que se le cobra una vez cada dos meses el
              precio completo.
            </>,
            subs,
            'sub',
          )}
        </>
      )}

      </>)}

      {/* --- DIÁLOGO DE CREAR / CAMBIAR --- */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ fontSize: '1.3rem' }}>
          {currentPlan?.id ? `Cambiar «${originalPlan?.name ?? ''}»` : 'Crear un bono o una membresía'}
        </DialogTitle>
        <DialogContent dividers>
          {cp && (
            <>
              <FormStep n={1} title="¿Qué vas a vender?">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} role="radiogroup" aria-label="Tipo">
                  <ChoiceCard
                    selected={cp.type === 'pack'}
                    onClick={() => update({ type: 'pack', interval: null, interval_count: null, auto_renew: false })}
                    icon={<CreditScoreIcon />}
                    title="Bono (pago único)"
                    text="La clienta paga una vez y recibe sus créditos."
                  />
                  <ChoiceCard
                    selected={cp.type === 'sub'}
                    onClick={() =>
                      update({ type: 'sub', interval: cp.interval || 'month', interval_count: cp.interval_count || 1, auto_renew: true })
                    }
                    icon={<LoopIcon />}
                    title="Membresía (cobro automático)"
                    text="Se le cobra sola cada mes (o cada varios meses) y recibe sus créditos cada vez."
                  />
                </Stack>
                {originalPlan && cp.type !== originalPlan.type && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    Estás cambiando el tipo de uno que ya se vende. Es más seguro <b>crear uno nuevo</b> y ocultar este.
                  </Alert>
                )}
              </FormStep>

              <FormStep n={2} title="¿Cómo se llama?">
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    required
                    label="Nombre"
                    placeholder={cp.type === 'sub' ? 'Ej.: Starter' : 'Ej.: Bono 8 clases'}
                    value={cp.name || ''}
                    onChange={(e) => update({ name: e.target.value })}
                    error={Boolean(errFor('name'))}
                    helperText={errFor('name') || 'Es lo que ven las clientas en la web, en grande.'}
                    inputProps={{ maxLength: 140 }}
                  />
                  <TextField
                    fullWidth
                    label="Descripción (opcional)"
                    placeholder="Ej.: Ideal si vienes 2 veces por semana."
                    multiline
                    minRows={2}
                    value={cp.description || ''}
                    onChange={(e) => update({ description: e.target.value })}
                    helperText="Una frase corta que sale en la web debajo del nombre."
                  />
                </Stack>
              </FormStep>

              <EnglishVersion pairs={[[cp.name, cp.name_en], [cp.description, cp.description_en]]}>
                <EnglishField
                  label="Nombre en inglés"
                  es={cp.name}
                  value={cp.name_en}
                  onChange={(v) => update({ name_en: v })}
                  maxLength={140}
                />
                <EnglishField
                  label="Descripción en inglés"
                  es={cp.description}
                  value={cp.description_en}
                  onChange={(v) => update({ description_en: v })}
                  multiline
                />
              </EnglishVersion>

              <FormStep
                n={3}
                title={cp.type === 'sub' ? '¿Cuántos créditos, cuánto cuesta y cada cuánto se cobra?' : '¿Cuántos créditos y cuánto cuesta?'}
                hint="Una clase de suelo gasta 1 crédito; una de máquinas (Reformer o Chair) gasta 2."
              >
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      required
                      label="Créditos"
                      type="number"
                      value={cp.credits ?? ''}
                      onChange={(e) => update({ credits: e.target.value === '' ? '' : Number(e.target.value) })}
                      error={Boolean(errFor('credits'))}
                      helperText={errFor('credits') || 'Ej.: 8'}
                      inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
                    />
                    <TextField
                      fullWidth
                      required
                      label={cp.type === 'sub' ? 'Precio de cada cobro' : 'Precio'}
                      type="number"
                      value={cp.price_eur ?? ''}
                      onChange={(e) => update({ price_eur: e.target.value === '' ? '' : Number(e.target.value) })}
                      error={Boolean(errFor('price_eur'))}
                      helperText={errFor('price_eur') || (cp.type === 'sub' ? 'Lo que se cobra cada vez. Ej.: 76' : 'Lo que paga la clienta. Ej.: 50')}
                      inputProps={{ min: 0, step: 0.5, inputMode: 'decimal' }}
                      slotProps={{ input: { endAdornment: <InputAdornment position="end">{currencySymbol()}</InputAdornment> } }}
                    />
                  </Stack>

                  {cp.type === 'sub' && (
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
                        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>¿Cada cuánto se cobra?</Typography>
                        <HelpTip title="Cada cuánto se cobra">
                          «Cada 2 meses» quiere decir que se cobra el precio completo una vez cada dos meses, y en ese
                          momento la clienta recibe sus créditos. Por ejemplo, Pro: {fmtEur(180)} cada 2 meses = {fmtEur(90)} al mes.
                        </HelpTip>
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                        {PERIOD_PRESETS.map((pp) => {
                          const sel = cp.interval === pp.interval && Number(cp.interval_count) === pp.count;
                          return (
                            <Chip
                              key={pp.label}
                              label={pp.label}
                              clickable
                              color={sel ? 'primary' : 'default'}
                              variant={sel ? 'filled' : 'outlined'}
                              onClick={() => update({ interval: pp.interval, interval_count: pp.count })}
                              sx={{ minHeight: 40, fontSize: '0.95rem' }}
                            />
                          );
                        })}
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          label="Cada cuántos"
                          type="number"
                          value={cp.interval_count ?? ''}
                          onChange={(e) => update({ interval_count: e.target.value === '' ? null : Number(e.target.value) })}
                          error={Boolean(errFor('interval_count'))}
                          helperText={errFor('interval_count') || 'Ej.: 2'}
                          inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
                        />
                        <TextField
                          select
                          fullWidth
                          label="Unidad"
                          value={cp.interval || 'month'}
                          onChange={(e) => update({ interval: e.target.value })}
                          helperText="Normalmente, meses."
                        >
                          {INTERVALS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {Number(cp.interval_count) === 1 ? option.one : option.many}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    </Box>
                  )}

                  {cpPrice > 0 && cpCredits > 0 && (
                    <Alert severity="info" icon={false} sx={{ fontSize: '0.98rem' }}>
                      {cp.type === 'sub' ? (
                        <>
                          Se cobrará <b>{fmtEur(cpPrice)} {periodText(cp.interval, cp.interval_count)}</b>
                          {cpPerMonth !== null && <> (= {fmtEur(round2(cpPerMonth))} al mes)</>}.{' '}
                        </>
                      ) : null}
                      Sale a <b>{fmtEur(cpPerCredit)}</b> por crédito (una clase suelta de suelo cuesta {fmtEur(singleClassPrice())}).
                    </Alert>
                  )}

                  {originalPlan?.type === 'sub' && originalPlan.stripe_price_id && cp.type === 'sub' &&
                    (Number(cp.price_eur) !== Number(originalPlan.price_eur) ||
                      cp.interval !== originalPlan.interval ||
                      Number(cp.interval_count) !== Number(originalPlan.interval_count)) && (
                      <Alert severity="warning">
                        <b>Ojo:</b> esta membresía tiene el precio guardado en el sistema de cobro con tarjeta. Si lo cambias
                        aquí, la web mostrará el precio nuevo pero <b>se seguirá cobrando el de antes</b> hasta que soporte técnico lo
                        cambie también allí. Avísale.
                      </Alert>
                    )}
                </Stack>
              </FormStep>

              <FormStep
                n={4}
                title="¿Cuándo caducan los créditos?"
                hint={
                  cp.type === 'sub'
                    ? 'Días desde cada cobro. Pasado ese tiempo, los créditos que no haya usado se pierden.'
                    : 'Días desde la compra. Pasado ese tiempo, los créditos que no haya usado se pierden.'
                }
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {EXPIRE_PRESETS.map((ep) => {
                    const cur = cp.credits_expire_days === null || cp.credits_expire_days === undefined ? '' : cp.credits_expire_days;
                    const sel = cur === ep.days || (ep.days !== '' && Number(cur) === ep.days);
                    return (
                      <Chip
                        key={ep.label}
                        label={ep.label}
                        clickable
                        color={sel ? 'primary' : 'default'}
                        variant={sel ? 'filled' : 'outlined'}
                        onClick={() => update({ credits_expire_days: ep.days })}
                        sx={{ minHeight: 40, fontSize: '0.95rem' }}
                      />
                    );
                  })}
                </Stack>
                <TextField
                  fullWidth
                  label="Días hasta que caducan"
                  type="number"
                  value={cp.credits_expire_days ?? ''}
                  onChange={(e) => update({ credits_expire_days: e.target.value === '' ? '' : Number(e.target.value) })}
                  error={Boolean(errFor('credits_expire_days'))}
                  helperText={errFor('credits_expire_days') || 'Ej.: 90. Déjalo vacío si no caducan nunca.'}
                  inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
                />
              </FormStep>

              <FormStep n={5} title="Lo que se muestra en la web (opcional)">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Cuánto se ahorra"
                    type="number"
                    value={cp.saving ?? ''}
                    onChange={(e) => update({ saving: e.target.value === '' ? '' : Number(e.target.value) })}
                    error={Boolean(errFor('saving'))}
                    helperText={errFor('saving') || 'En la web sale «Ahorras 20». Déjalo vacío para no mostrarlo.'}
                    inputProps={{ min: 0, step: 1, inputMode: 'decimal' }}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">{currencySymbol()}</InputAdornment> } }}
                  />
                  <TextField
                    fullWidth
                    label="Precio por crédito que muestra la web"
                    type="number"
                    value={cp.price_credit ?? ''}
                    onChange={(e) => update({ price_credit: e.target.value === '' ? '' : Number(e.target.value) })}
                    error={Boolean(errFor('price_credit'))}
                    helperText={
                      errFor('price_credit') ||
                      (cpPerCredit !== null
                        ? `Si lo dejas vacío, la web lo calcula sola (${fmtEur(cpPerCredit)}).`
                        : 'Si lo dejas vacío, la web lo calcula sola.')
                    }
                    inputProps={{ min: 0, step: 0.01, inputMode: 'decimal' }}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">{currencySymbol()}</InputAdornment> } }}
                  />
                </Stack>
                {priceCreditMismatch && (
                  <Alert
                    severity="warning"
                    sx={{ mt: 1.5, alignItems: 'center' }}
                    action={
                      <Button color="inherit" onClick={() => update({ price_credit: cpPerCredit ?? '' })} sx={{ minHeight: 44 }}>
                        Poner {fmtEur(cpPerCredit)}
                      </Button>
                    }
                  >
                    El precio por crédito que pusiste ({fmtEur(Number(cp.price_credit))}) no coincide con la cuenta ({fmtEur(cpPerCredit)}).
                  </Alert>
                )}
              </FormStep>

              <FormStep n={6} title="¿Se vende ya en la web?">
                <FormControlLabel
                  control={<Switch checked={Boolean(cp.is_active)} onChange={(_, checked) => update({ is_active: checked })} />}
                  label={cp.is_active ? 'Sí, que se vea en la web y se pueda comprar' : 'No, dejarlo oculto por ahora'}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: '1rem' } }}
                />
              </FormStep>

              {/* Resumen final */}
              <Paper
                elevation={0}
                sx={{ p: 2, borderRadius: 3, backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.08)', border: '1px solid rgb(var(--studio-primary-rgb) / 0.3)' }}
              >
                <Typography sx={{ fontWeight: 600, mb: 0.5, color: 'var(--studio-dark)' }}>Así quedará</Typography>
                <Typography sx={{ fontSize: '1rem', color: 'var(--studio-dark)', lineHeight: 1.6 }}>
                  {summary || 'Rellena los campos marcados para ver el resumen.'}
                </Typography>
              </Paper>

              {/* Opciones avanzadas */}
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
                    <Alert severity="warning" sx={{ mb: 2 }}>No toques esto salvo que te lo pida soporte técnico.</Alert>
                    {cp.type === 'sub' && (
                      <FormControlLabel
                        control={
                          <Switch checked={Boolean(cp.auto_renew)} onChange={(_, checked) => update({ auto_renew: checked })} />
                        }
                        label="Marcada como «renovación automática» (solo informativo: no cambia cómo se cobra)"
                        sx={{ mb: 1.5 }}
                      />
                    )}
                    <Stack spacing={1.5}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Referencia del producto en Stripe"
                        value={originalPlan?.stripe_product_id || '—'}
                        slotProps={{ input: { readOnly: true } }}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Referencia del precio en Stripe"
                        value={originalPlan?.stripe_price_id || '—'}
                        slotProps={{ input: { readOnly: true } }}
                        helperText={
                          cp.type === 'sub'
                            ? originalPlan?.stripe_price_id
                              ? 'Si tiene referencia, se cobra el precio guardado en Stripe (no el de esta pantalla).'
                              : 'Sin referencia: se cobra el precio de esta pantalla.'
                            : 'Los bonos siempre se cobran con el precio de esta pantalla.'
                        }
                      />
                    </Stack>
                  </Paper>
                </Collapse>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
          <Button variant="outlined" onClick={handleCloseDialog} disabled={saving} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {saving ? 'Guardando…' : currentPlan?.id ? 'Guardar los cambios' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default PlanManagement;
