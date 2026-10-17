// «Nuevo cliente del estudio» (/clientas/estudio/nueva): asistente de 5 pasos
// para dar de alta a un cliente que paga en el estudio (efectivo, Bizum…):
//   1 ¿Quién es?  2 ¿Cómo viene?  3 Detalles  4 ¿Le reservas ya?  5 Resumen
// Clases sueltas → créditos (+ cobro en mano). Plan mensual / clase fija →
// StudioPlan (api/views_studio_plans.py), que el estudio renueva cada mes.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, FormControlLabel, LinearProgress, MenuItem, Paper, Skeleton, Switch,
  TextField, Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useNotify } from '../../components/guide';
import { HowItWorks } from '../../onboarding/coach';
import { STUDIO_CURRENCY } from '../../site/money';
import { isPlaceholderEmail } from '../../site/email';
import { addDays, dayLabel, fmtMoney, isoOf, shortDate } from '../kit/format';
import { Avatar, Seg, Tag } from '../kit/ui';
import ClientPicker from './ClientPicker';
import { StudioClientsNote } from './StudioPlanBlock';
import {
  METHODS, WEEKDAYS, carryExample, clientName, creditsText, methodLabel, studioApi,
  type CarryOver, type ClientLite, type PayMethod, type Session, type WeeklyClass,
} from './api';

type Kind = 'credits' | 'monthly' | 'fixed';
const STEPS = ['¿Quién es?', '¿Cómo viene?', 'Detalles', '¿Le reservas ya?', 'Resumen'];
const CREDIT_CHIPS = [1, 4, 5, 8, 10, 12];
const MONTH_CHIPS = [4, 8, 12, 16];
const EXPIRES = [
  { value: '30', label: '1 mes' }, { value: '60', label: '2 meses' }, { value: '90', label: '3 meses' }, { value: '', label: 'No caducan' },
];

function Choice({ on, onClick, icon, title, text, tour }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; text: string; tour?: string }) {
  return (
    <ButtonBase onClick={onClick} aria-pressed={on} data-tour={tour} sx={{
      width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.5, p: 1.75, minHeight: 72, textAlign: 'left',
      borderRadius: 'var(--studio-radius-md)', border: on ? '2px solid var(--studio-primary-fill)' : '1.5px solid var(--studio-border-color)',
      background: on ? 'var(--studio-p-soft)' : 'var(--studio-surf)',
      '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: 2 },
    }}>
      <Box aria-hidden sx={{ color: 'var(--studio-primary-text)', mt: 0.25 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)' }}>{text}</Typography>
      </Box>
    </ButtonBase>
  );
}

function Q({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 2.75 }}>
      <Typography component="h3" sx={{ fontWeight: 700, color: 'var(--studio-ink)', mb: hint ? 0.25 : 1 }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)', mb: 1 }}>{hint}</Typography>}
      {children}
    </Box>
  );
}

function Chips({ values, value, onChange, label }: { values: number[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.25 }}>
      {values.map((n) => (
        <Button key={n} variant={value === String(n) ? 'contained' : 'outlined'} aria-pressed={value === String(n)}
          onClick={() => onChange(String(n))} sx={{ minHeight: 44, minWidth: 56 }}>{n}</Button>
      ))}
    </Box>
  );
}

export default function NewStudioClientWizard() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params] = useSearchParams();
  const today = isoOf(new Date());
  const todayDay = Math.min(28, new Date().getDate());

  const [step, setStep] = useState(0);
  const [client, setClient] = useState<ClientLite | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  // Clases sueltas
  const [credits, setCredits] = useState('5');
  const [expires, setExpires] = useState('30');
  // Plan mensual / clase fija
  const [perMonth, setPerMonth] = useState('8');
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [cycleDay, setCycleDay] = useState(String(todayDay));
  const [carry, setCarry] = useState<CarryOver>('lose');
  const [cap, setCap] = useState('2');
  const [paidNow, setPaidNow] = useState<'paid' | 'later'>('paid');
  const [remind, setRemind] = useState(false);
  // Reservar
  const [weekly, setWeekly] = useState<WeeklyClass[] | null>(null);
  const [fixedIds, setFixedIds] = useState<number[]>([]);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [bookIds, setBookIds] = useState<string[]>([]);
  // Guardar
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  // ?clienta=<id>: viene de su ficha → empieza en «¿Cómo viene?»
  useEffect(() => {
    const id = Number(params.get('clienta'));
    if (!id) return;
    studioApi.user(id).then((u) => { setClient(u); setStep(1); }).catch(() => {});
  }, [params]);

  useEffect(() => {
    if (step !== 3) return;
    if (weekly === null) studioApi.weeklyClasses().then(setWeekly).catch(() => setWeekly([]));
    if (sessions === null) {
      studioApi.sessions(today, addDays(today, 13))
        .then((l) => setSessions(l.filter((s) => s.kind === 'class' && s.schedule_id && !s.started && !s.canceled && !s.blackout)
          .sort((a, b) => a.start.localeCompare(b.start))))
        .catch(() => setSessions([]));
    }
  }, [step, weekly, sessions, today]);

  const name = clientName(client);
  const first = (client?.first_name || name).split(' ')[0];
  const isPlan = kind === 'monthly' || kind === 'fixed';
  const priceNum = Number(price.replace(',', '.'));
  const realEmail = Boolean(client?.email && !isPlaceholderEmail(client.email));

  const detailsError = useMemo(() => {
    if (kind === 'credits') {
      const n = Number(credits);
      if (!Number.isInteger(n) || n < 1 || n > 200) return 'Elige cuántas clases (de 1 a 200).';
      if (price.trim() && (!Number.isFinite(priceNum) || priceNum < 0)) return 'Escribe el importe con números, p. ej. 45.';
      return '';
    }
    const n = Number(perMonth);
    if (!Number.isInteger(n) || n < 1 || n > 200) return 'Elige cuántas clases al mes (de 1 a 200).';
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum < 0) return 'Escribe el precio del mes, p. ej. 60.';
    const d = Number(cycleDay);
    if (!Number.isInteger(d) || d < 1 || d > 28) return 'El día del corte va del 1 al 28.';
    if (carry === 'cap' && !(Number(cap) >= 1)) return 'Escribe cuántas clases se pueden acumular como mucho.';
    return '';
  }, [kind, credits, price, priceNum, perMonth, cycleDay, carry, cap]);

  const canNext = [Boolean(client), Boolean(kind), !detailsError, kind !== 'fixed' || fixedIds.length > 0, true][step];
  const next = () => {
    setTouched(true);
    if (!canNext) return;
    setTouched(false);
    setStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => { setError(''); setStep((s) => Math.max(0, s - 1)); };

  const chosenSessions = (sessions || []).filter((s) => bookIds.includes(s.id));
  const chosenWeekly = (weekly || []).filter((w) => fixedIds.includes(w.id));
  const startCredits = kind === 'credits' ? Number(credits) : Number(perMonth);

  const save = async () => {
    if (!client || !kind) return;
    setSaving(true);
    setError('');
    const out: string[] = [];
    try {
      if (kind === 'credits') {
        const r = await studioApi.creditSale({
          user: client.id, credits: Number(credits), expires_days: expires ? Number(expires) : null,
          amount: priceNum > 0 ? priceNum : 0, method,
        });
        out.push(`${creditsText(Number(credits))} añadidas${priceNum > 0 ? ` · cobrado ${fmtMoney(priceNum, STUDIO_CURRENCY)} (${methodLabel(method).toLowerCase()})` : ''}. Tiene ${creditsText(r.balance)}.`);
      } else {
        const r = await studioApi.create({
          user: client.id, credits_per_month: Number(perMonth), price: priceNum, payment_method: method,
          cycle_day: Number(cycleDay), carry_over: carry, carry_over_cap: carry === 'cap' ? Number(cap) : null,
          fixed_schedule_ids: fixedIds, remind_client: remind, start: paidNow, method,
        });
        out.push(`Plan del estudio: ${perMonth} clases al mes por ${fmtMoney(priceNum, STUDIO_CURRENCY)}. ${paidNow === 'paid' ? 'Mes cobrado' : 'Cobro pendiente (sale en Ventas)'}.`);
        if (r.plan.next_due_date) out.push(`Próximo corte: ${shortDate(r.plan.next_due_date)}.`);
        if (chosenWeekly.length) out.push(`Clase fija: ${chosenWeekly.map((w) => `${w.class_type.title} los ${WEEKDAYS[w.weekday]}`).join(', ')}.`);
      }
      for (const s of chosenSessions) {
        try {
          await studioApi.addToClass(s.schedule_id as number, s.date, client.id, 'credits');
          out.push(`Reserva hecha: ${s.title} · ${dayLabel(s.date, today).toLowerCase()} ${s.start.slice(11, 16)}.`);
        } catch (e) {
          out.push(`No se pudo apuntar a ${s.title} (${dayLabel(s.date, today).toLowerCase()}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setDone(out);
      notify(`${first} ya es cliente del estudio ✓`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDone(null); setStep(0); setClient(null); setKind(null); setBookIds([]); setFixedIds([]); setPrice(''); setIsNew(false);
    navigate('/clientas/estudio/nueva', { replace: true });
  };

  // ── Pantalla final ───────────────────────────────────────────────────
  if (done) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', pb: 4 }}>
        <Paper sx={{ p: { xs: 2.5, sm: 3.5 }, textAlign: 'center' }}>
          <CheckCircleRoundedIcon sx={{ fontSize: 56, color: 'var(--studio-ok)' }} aria-hidden />
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '1.8rem' }, mt: 1 }}>Todo listo para {first}</Typography>
          <Box component="ul" sx={{ textAlign: 'left', mt: 2, mb: 3, pl: 2.5, color: 'var(--studio-ink)', '& li': { mb: 0.75 } }}>
            {done.map((l) => <li key={l}>{l}</li>)}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.25, justifyContent: 'center' }}>
            <Button variant="contained" onClick={() => navigate(`/credits?clienta=${client?.id}`)} sx={{ minHeight: 48 }}>Ver su ficha de créditos</Button>
            <Button variant="outlined" onClick={reset} sx={{ minHeight: 48 }}>Dar de alta a otra persona</Button>
            <Button onClick={() => navigate('/')} sx={{ minHeight: 48 }}>Ir a Hoy</Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', pb: { xs: 12, sm: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h1" data-tour="page-head" sx={{ fontSize: { xs: '1.55rem', md: '2rem' }, flex: 1, minWidth: 0 }}>
          Nuevo cliente del estudio
        </Typography>
        <HowItWorks page="studio-client-new" />
      </Box>
      <Typography sx={{ color: 'var(--studio-muted)', mb: 2 }}>
        Para quien te paga aquí (efectivo, Bizum…). Tú llevas sus clases y renuevas su mes.
      </Typography>

      {/* Pasos */}
      <Box data-tour="wizard-steps" sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>Paso {step + 1} de 5 · {STEPS[step]}</Typography>
          {client && step > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <Avatar name={name} size={26} ring={false} />
              <Typography noWrap sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)', maxWidth: 160 }}>{name}</Typography>
            </Box>
          )}
        </Box>
        <LinearProgress variant="determinate" value={((step + 1) / 5) * 100} aria-label="Progreso" aria-valuetext={`Paso ${step + 1} de 5`} />
      </Box>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        {step === 0 && (
          client ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-p-soft)' }}>
                <Avatar name={name} size={40} ring={false} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: 'var(--studio-ink)' }}>{name}</Typography>
                  <Typography sx={{ fontSize: '0.86rem', color: 'var(--studio-muted)' }}>{isNew ? 'Ficha nueva, recién creada' : client.phone || ''}</Typography>
                </Box>
                <Button onClick={() => { setClient(null); setIsNew(false); }} sx={{ minHeight: 44 }}>Cambiar</Button>
              </Box>
            </Box>
          ) : (
            <ClientPicker newLabel="Dar de alta" onPick={(u, nw) => { setClient(u); setIsNew(nw); setStep(1); }} />
          )
        )}

        {step === 1 && (
          <Box data-tour="wizard-kind">
            <Box sx={{ display: 'grid', gap: 1.25, mb: 2 }}>
              <Choice on={kind === 'credits'} onClick={() => setKind('credits')} icon={<ConfirmationNumberOutlinedIcon />}
                title="Clases sueltas con créditos" text="Te paga unas clases (o un bono) en mano y las va gastando." />
              <Choice on={kind === 'monthly'} onClick={() => setKind('monthly')} icon={<StorefrontOutlinedIcon />}
                title="Plan mensual en el estudio" text="Paga cada mes aquí, p. ej. 8 clases por 60 €. Tú renuevas su mes." />
              <Choice on={kind === 'fixed'} onClick={() => { setKind('fixed'); setPerMonth('4'); }} icon={<EventRepeatOutlinedIcon />}
                title="Clase fija semanal" text="Viene cada semana a la misma clase y paga el mes aquí." />
            </Box>
            <StudioClientsNote />
            {touched && !kind && <Alert severity="warning" sx={{ mt: 2 }}>Elige cómo viene para seguir.</Alert>}
          </Box>
        )}

        {step === 2 && (
          <Box data-tour="wizard-details">
            {kind === 'credits' ? (
              <>
                <Q title="¿Cuántas clases?" hint="Lo que te ha pagado: una clase suelta, un bono de 5…">
                  <Chips values={CREDIT_CHIPS} value={credits} onChange={setCredits} label="Clases" />
                  <TextField label="Clases" value={credits} onChange={(e) => setCredits(e.target.value)} sx={{ maxWidth: 160 }}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
                </Q>
                <Q title="¿Hasta cuándo puede usarlas?">
                  <Seg mode="toggle" label="Caducan" value={expires} onChange={setExpires} options={EXPIRES} sx={{ flexWrap: 'wrap' }} />
                </Q>
                <Q title="¿Cuánto te ha pagado? (opcional)" hint="Sale en Ventas → Lo cobrado. Vacío si no te ha pagado aún.">
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                    <TextField label={`Importe (${STUDIO_CURRENCY})`} value={price} onChange={(e) => setPrice(e.target.value)}
                      slotProps={{ htmlInput: { inputMode: 'decimal' } }} sx={{ maxWidth: { sm: 180 } }} />
                    <TextField select label="Cómo" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} sx={{ minWidth: 200 }}>
                      {METHODS.map((m) => <MenuItem key={m.value} value={m.value} sx={{ minHeight: 44 }}>{m.label}</MenuItem>)}
                    </TextField>
                  </Box>
                </Q>
              </>
            ) : (
              <>
                <Q title="¿Cuántas clases al mes?" hint={kind === 'fixed' ? 'Una a la semana son unas 4 al mes.' : undefined}>
                  <Chips values={MONTH_CHIPS} value={perMonth} onChange={setPerMonth} label="Clases al mes" />
                  <TextField label="Clases al mes" value={perMonth} onChange={(e) => setPerMonth(e.target.value)} sx={{ maxWidth: 160 }}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
                </Q>
                <Q title="¿Cuánto paga al mes?">
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                    <TextField label={`Precio al mes (${STUDIO_CURRENCY})`} value={price} onChange={(e) => setPrice(e.target.value)}
                      placeholder="60" slotProps={{ htmlInput: { inputMode: 'decimal' } }} sx={{ maxWidth: { sm: 200 } }} />
                    <TextField select label="Cómo suele pagar" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} sx={{ minWidth: 200 }}>
                      {METHODS.map((m) => <MenuItem key={m.value} value={m.value} sx={{ minHeight: 44 }}>{m.label}</MenuItem>)}
                    </TextField>
                  </Box>
                </Q>
                <Q title="¿Qué día empieza cada mes?" hint="Ese día se hace el corte: le pones las clases del mes nuevo al renovarlo.">
                  <TextField select label="Día del corte" value={cycleDay} onChange={(e) => setCycleDay(e.target.value)} sx={{ minWidth: 200 }}>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                      <MenuItem key={d} value={d} sx={{ minHeight: 44 }}>El día {d} de cada mes</MenuItem>
                    ))}
                  </TextField>
                </Q>
                <Q title="Las clases que no use, al acabar el mes…">
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    {([['lose', 'Se pierden'], ['keep', 'Se acumulan'], ['cap', 'Se acumulan hasta un máximo']] as [CarryOver, string][]).map(([v, l]) => (
                      <Choice key={v} on={carry === v} onClick={() => setCarry(v)} icon={<Box component="span" sx={{ fontWeight: 800 }}>{v === 'lose' ? '0' : v === 'keep' ? '+' : '≤'}</Box>}
                        title={l} text={carryExample(Number(perMonth) || 8, v, v === 'cap' ? Number(cap) || 0 : null)} />
                    ))}
                  </Box>
                  {carry === 'cap' && (
                    <TextField label="Como mucho se guarda" value={cap} onChange={(e) => setCap(e.target.value)} sx={{ mt: 1.5, maxWidth: 220 }}
                      helperText="Clases que pasan al mes siguiente" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
                  )}
                </Q>
                <Q title="¿Te ha pagado ya este mes?">
                  <Seg mode="toggle" label="Pago de este mes" value={paidNow} onChange={setPaidNow}
                    options={[{ value: 'paid', label: `Sí, cobrado (${methodLabel(method).toLowerCase()})` }, { value: 'later', label: 'Me lo paga después' }]}
                    sx={{ flexWrap: 'wrap' }} />
                </Q>
                {realEmail && (
                  <FormControlLabel sx={{ minHeight: 44 }} control={<Switch checked={remind} onChange={(e) => setRemind(e.target.checked)} />}
                    label="Enviarle un aviso por email 3 días antes («Tu mes empieza el día X»)" />
                )}
              </>
            )}
            {touched && detailsError && <Alert severity="warning" sx={{ mt: 1 }}>{detailsError}</Alert>}
          </Box>
        )}

        {step === 3 && (
          <Box data-tour="wizard-book">
            {isPlan && (
              <Q title={kind === 'fixed' ? '¿Cuál es su clase de cada semana?' : 'Su clase fija (opcional)'}
                hint="Se le reserva sola cada semana con las clases de su plan.">
                {weekly === null ? [0, 1, 2].map((i) => <Skeleton key={i} height={48} />) : weekly.length === 0 ? (
                  <Typography sx={{ color: 'var(--studio-muted)' }}>Aún no hay clases semanales en el horario.</Typography>
                ) : (
                  <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
                    {weekly.map((w) => {
                      const on = fixedIds.includes(w.id);
                      return (
                        <ButtonBase key={w.id} aria-pressed={on} onClick={() => setFixedIds((l) => (on ? l.filter((x) => x !== w.id) : [...l, w.id]))}
                          sx={{
                            justifyContent: 'flex-start', textAlign: 'left', minHeight: 48, px: 1.5, gap: 1, borderRadius: 'var(--studio-radius-md)',
                            border: on ? '2px solid var(--studio-primary-fill)' : '1px solid var(--studio-border-color)',
                            background: on ? 'var(--studio-p-soft)' : 'var(--studio-surf)',
                          }}>
                          <Typography component="span" sx={{ fontWeight: 700, color: 'var(--studio-ink)', textTransform: 'capitalize', flex: 'none' }}>
                            {WEEKDAYS[w.weekday].slice(0, 3)} {w.start_time.slice(0, 5)}
                          </Typography>
                          <Typography component="span" noWrap sx={{ color: 'var(--studio-ink)' }}>{w.class_type.title}</Typography>
                        </ButtonBase>
                      );
                    })}
                  </Box>
                )}
                {touched && kind === 'fixed' && !fixedIds.length && <Alert severity="warning" sx={{ mt: 1.5 }}>Elige su clase de cada semana.</Alert>}
              </Q>
            )}
            {kind !== 'fixed' && (
              <Q title="¿Le reservas ya alguna clase? (opcional)" hint={`Gasta sus créditos: empieza con ${creditsText(startCredits || 0)}.`}>
                {sessions === null ? [0, 1, 2].map((i) => <Skeleton key={i} height={48} />) : sessions.length === 0 ? (
                  <Typography sx={{ color: 'var(--studio-muted)' }}>No hay clases en las próximas dos semanas.</Typography>
                ) : (
                  <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, maxHeight: 360, overflowY: 'auto', p: 0.25 }}>
                    {sessions.map((s) => {
                      const on = bookIds.includes(s.id);
                      const full = s.booked >= s.capacity;
                      return (
                        <ButtonBase key={s.id} disabled={full} aria-pressed={on} onClick={() => setBookIds((l) => (on ? l.filter((x) => x !== s.id) : [...l, s.id]))}
                          sx={{
                            justifyContent: 'flex-start', textAlign: 'left', minHeight: 48, px: 1.5, gap: 1, borderRadius: 'var(--studio-radius-md)',
                            border: on ? '2px solid var(--studio-primary-fill)' : '1px solid var(--studio-border-color)',
                            background: on ? 'var(--studio-p-soft)' : 'var(--studio-surf)', opacity: full ? 0.55 : 1,
                          }}>
                          <Typography component="span" sx={{ fontWeight: 700, color: 'var(--studio-ink)', flex: 'none', fontSize: '0.9rem' }}>
                            {dayLabel(s.date, today)} · {s.start.slice(11, 16)}
                          </Typography>
                          <Typography component="span" noWrap sx={{ color: 'var(--studio-ink)', fontSize: '0.9rem' }}>{s.title}</Typography>
                          {full && <Tag tone="n">Llena</Tag>}
                        </ButtonBase>
                      );
                    })}
                  </Box>
                )}
              </Q>
            )}
          </Box>
        )}

        {step === 4 && (
          <Box data-tour="wizard-summary">
            <Typography component="h3" sx={{ fontWeight: 700, color: 'var(--studio-ink)', mb: 1.5 }}>Así queda</Typography>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '160px 1fr' }, gap: { xs: 0.25, sm: 1 }, '& dt': { color: 'var(--studio-muted)', fontSize: '0.88rem', mt: { xs: 1, sm: 0 } }, '& dd': { m: 0, color: 'var(--studio-ink)', fontWeight: 600 } }}>
              <dt>Cliente</dt><dd>{name}{isNew ? ' (ficha nueva)' : ''}</dd>
              {kind === 'credits' ? (
                <>
                  <dt>Clases sueltas</dt><dd>{creditsText(Number(credits))} · {expires ? `caducan en ${EXPIRES.find((e) => e.value === expires)?.label}` : 'no caducan'}</dd>
                  <dt>Cobro</dt><dd>{priceNum > 0 ? `${fmtMoney(priceNum, STUDIO_CURRENCY)} · ${methodLabel(method).toLowerCase()}` : 'Sin apuntar cobro'}</dd>
                </>
              ) : (
                <>
                  <dt>Plan del estudio</dt><dd>{perMonth} clases al mes · {fmtMoney(priceNum, STUDIO_CURRENCY)} · {methodLabel(method).toLowerCase()}</dd>
                  <dt>Cada mes</dt><dd>Corte el día {cycleDay}. {carryExample(Number(perMonth), carry, carry === 'cap' ? Number(cap) : null)}</dd>
                  <dt>Este mes</dt><dd>{paidNow === 'paid' ? 'Cobrado hoy' : 'Te lo paga después (sale en Ventas → Quién me debe)'}</dd>
                  {chosenWeekly.length > 0 && <><dt>Clase fija</dt><dd>{chosenWeekly.map((w) => `${w.class_type.title}, ${WEEKDAYS[w.weekday]} ${w.start_time.slice(0, 5)}`).join(' · ')}</dd></>}
                  {remind && <><dt>Aviso</dt><dd>Email 3 días antes del corte</dd></>}
                </>
              )}
              {chosenSessions.length > 0 && (
                <><dt>La apuntas a</dt><dd>{chosenSessions.map((s) => `${s.title} (${dayLabel(s.date, today).toLowerCase()} ${s.start.slice(11, 16)})`).join(' · ')}</dd></>
              )}
            </Box>
            {isPlan && (
              <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)', mt: 2 }}>
                Nada se cobra solo: cada mes te sale en Hoy para renovarlo con un toque.
              </Typography>
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }} role="alert">{error}</Alert>}
          </Box>
        )}
      </Paper>

      {/* Botones: abajo y fijos en el móvil */}
      <Box sx={{
        display: 'flex', gap: 1.25, mt: 2, justifyContent: 'space-between',
        position: { xs: 'fixed', sm: 'static' }, left: 0, right: 0, bottom: { xs: 'calc(64px + env(safe-area-inset-bottom))', sm: 'auto' },
        px: { xs: 2, sm: 0 }, py: { xs: 1.25, sm: 0 }, zIndex: 20,
        background: { xs: 'rgb(var(--studio-bg-rgb) / 0.96)', sm: 'transparent' },
        borderTop: { xs: '1px solid var(--studio-border-color)', sm: 0 },
      }}>
        <Button variant="outlined" onClick={step === 0 ? () => navigate(-1) : back} disabled={saving} sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' } }}>
          {step === 0 ? 'Cancelar' : 'Atrás'}
        </Button>
        {step < 4 ? (
          <Button variant="contained" onClick={next} disabled={step === 0 && !client} sx={{ minHeight: 48, flex: { xs: 2, sm: 'none' } }}>
            {step === 3 && !bookIds.length && !fixedIds.length ? 'No, ahora no · Seguir' : 'Siguiente'}
          </Button>
        ) : (
          <Button variant="contained" onClick={save} disabled={saving} sx={{ minHeight: 48, flex: { xs: 2, sm: 'none' } }}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
