import { useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  Box, Button, Typography, CircularProgress, TextField, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Paper,
  useMediaQuery, useTheme,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';
import { FormStep, HelpTip, useNotify } from './guide';
import { API_BASE_URL } from '../config';
import { isPlaceholderEmail } from '../site/email';

interface Schedule {
  id: number;
  class_type: { id: number; title: string };
  room: { id: number; name: string };
  weekday: number; // 0 = lunes … 6 = domingo (como en Python)
  start_time: string;
  end_time: string;
  start_date?: string | null;
  end_date?: string | null;
}

interface UserOption { id: number; email: string; first_name?: string; last_name?: string; phone?: string | null; }

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const WEEKS_AHEAD = 8;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Recibe el nombre del cliente para poder buscarlo en la lista */
  onCreated?: (name?: string) => void;
  /** 'existing' = empezar buscando un cliente que ya existe (para apuntarlo a una clase) */
  initialMode?: 'new' | 'existing';
}

const jsonHeaders = () => authHeaders({ 'Content-Type': 'application/json' });
const hhmm = (t: string) => t.slice(0, 5);
const personName = (u: UserOption) => `${u.first_name || ''} ${u.last_name || ''}`.trim();
const isInternal = (email?: string) => isPlaceholderEmail(email);
const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const longDay = (s: string) =>
  parseLocalDate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const scheduleLabel = (s: Schedule) =>
  `${s.class_type.title} · ${WEEKDAYS[s.weekday]} ${hhmm(s.start_time)}–${hhmm(s.end_time)} · ${s.room.name}`;

/** El alta de clientes devuelve los errores dentro de "user_errors" */
async function signupError(res: Response): Promise<string> {
  try {
    const body = await res.clone().json();
    if (body?.user_errors) {
      return friendlyError(new Response(JSON.stringify(body.user_errors), { status: 400 }));
    }
  } catch { /* sin JSON */ }
  return friendlyError(res);
}

/** Botón grande tipo "tarjeta" para elegir entre dos caminos */
function ChoiceCard({ selected, onClick, icon, title, text }: {
  selected: boolean; onClick: () => void; icon: ReactNode; title: string; text: string;
}) {
  return (
    <Paper
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      elevation={0}
      sx={{
        flex: 1, textAlign: 'left', p: 1.75, borderRadius: 3, cursor: 'pointer', font: 'inherit',
        display: 'flex', gap: 1.5, alignItems: 'flex-start', minHeight: 72,
        border: selected ? '2px solid var(--studio-primary)' : '1.5px solid rgb(var(--studio-line-rgb) / 0.4)',
        backgroundColor: selected ? 'rgb(var(--studio-primary-rgb) / 0.10)' : 'rgb(var(--studio-surface-rgb))',
        '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: 2 },
      }}
    >
      <Box sx={{ color: 'var(--studio-primary-deep)', mt: 0.25 }} aria-hidden>{icon}</Box>
      <Box>
        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-strong)' }}>{text}</Typography>
      </Box>
    </Paper>
  );
}

export default function QuickClientCreate({ open, onClose, onCreated, initialMode = 'new' }: Props) {
  const notify = useNotify();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [existingUser, setExistingUser] = useState<UserOption | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [similar, setSimilar] = useState<UserOption[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesError, setSchedulesError] = useState('');
  const [selectedSchedule, setSelectedSchedule] = useState<number | ''>('');
  const [bookingDate, setBookingDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const similarTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setStep(0);
      setMode(initialMode);
      setFirstName('');
      setPhone('');
      setTouched({ name: false, phone: false });
      setExistingUser(null);
      setSelectedSchedule('');
      setBookingDate('');
      setSearchQuery('');
      setUsers([]);
      setSimilar([]);
      setError('');
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    setSchedulesError('');
    fetch(`${API_BASE_URL}v1/recurrences/?is_active=true&is_recurrent=true`, { headers: jsonHeaders() })
      .then(async (r) => {
        if (!r.ok) throw r;
        const d = await r.json();
        const list: Schedule[] = Array.isArray(d) ? d : d.results || [];
        list.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
        setSchedules(list);
      })
      .catch(async (e) => setSchedulesError(await friendlyError(e)));
  }, [open]);

  const fetchUsers = async (query: string) => {
    const res = await fetch(
      `${API_BASE_URL}v1/users/?is_superuser=false&search=${encodeURIComponent(query)}&ordering=email`,
      { headers: jsonHeaders() },
    );
    if (!res.ok) throw res;
    const d = await res.json();
    return (Array.isArray(d) ? d : d.results || []) as UserOption[];
  };

  const searchUser = (query: string) => {
    clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setUsers([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        setUsers(await fetchUsers(query.trim()));
      } catch {
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  // Aviso de posible ficha repetida mientras escribe el nombre
  useEffect(() => {
    clearTimeout(similarTimer.current);
    const q = firstName.trim();
    if (mode !== 'new' || q.length < 3) { setSimilar([]); return; }
    similarTimer.current = setTimeout(async () => {
      try {
        setSimilar((await fetchUsers(q)).slice(0, 3));
      } catch {
        setSimilar([]);
      }
    }, 450);
    return () => clearTimeout(similarTimer.current);
  }, [firstName, mode]);

  // ---- Validación en el propio campo ----
  const phoneDigits = phone.replace(/\D/g, '');
  const nameError = touched.name && !firstName.trim() ? 'Escribe al menos su nombre.' : '';
  const phoneError = phone.trim() && (phoneDigits.length < 9 || phoneDigits.length > 15 || /[^\d\s+()-]/.test(phone))
    ? 'El teléfono no parece completo: escribe los 9 números (y el prefijo si es de fuera, ej.: +44…).'
    : '';
  const canContinue = mode === 'existing' ? Boolean(existingUser) : Boolean(firstName.trim()) && !phoneError;

  const schedule = schedules.find((s) => s.id === selectedSchedule) || null;

  // Próximas fechas de esa clase (respetando desde/hasta cuándo existe)
  const dates = useMemo(() => {
    if (!schedule) return [] as string[];
    const out: string[] = [];
    const now = new Date();
    const [h, m] = schedule.start_time.split(':').map(Number);
    for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if ((d.getDay() + 6) % 7 !== schedule.weekday) continue;
      const str = toLocalDateStr(d);
      if (schedule.start_date && str < schedule.start_date) continue;
      if (schedule.end_date && str > schedule.end_date) continue;
      if (i === 0 && new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m) <= now) continue; // ya empezó hoy
      out.push(str);
    }
    return out;
  }, [schedule]);

  const displayName = mode === 'existing' && existingUser
    ? personName(existingUser) || existingUser.email
    : firstName.trim();

  const willBook = Boolean(schedule && bookingDate);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleCreateAndBook = async () => {
    if (mode === 'new' && !firstName.trim()) {
      setTouched((t) => ({ ...t, name: true }));
      setStep(0);
      return;
    }
    if (mode === 'existing' && !existingUser) { setStep(0); return; }
    if (schedule && !bookingDate) {
      setError('Elige qué día viene a la clase, o pulsa «Sin clase por ahora».');
      return;
    }

    setLoading(true);
    setError('');
    let userId = mode === 'existing' ? existingUser?.id : undefined;
    let createdNow = false;

    // 1) Crear la ficha si es nueva
    if (!userId) {
      try {
        const createRes = await fetch(`${API_BASE_URL}signupClient/`, {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ first_name: firstName.trim(), phone: phone.trim() }),
        });
        if (!createRes.ok) throw new Error(await signupError(createRes));
        const data = await createRes.json();
        userId = data.user_id;
        if (!userId && data.email) {
          const found = (await fetchUsers(data.email)).find((u) => u.email === data.email);
          if (found) userId = found.id;
        }
        createdNow = true;
        // A partir de aquí la ficha ya existe: si falla la reserva y se reintenta, no se duplica
        if (userId) {
          setExistingUser({ id: userId, email: data.email, first_name: firstName.trim(), phone: phone.trim() || null });
          setMode('existing');
        }
      } catch (err) {
        setError(`No se ha podido crear la ficha. ${await friendlyError(err)}`);
        setLoading(false);
        return;
      }
    }

    // 2) Apuntar a la clase
    if (willBook && schedule && userId) {
      try {
        const [h, m] = schedule.start_time.split(':').map(Number);
        const [eh, em] = schedule.end_time.split(':').map(Number);
        const base = parseLocalDate(bookingDate);
        const startDt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0);
        const endDt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em, 0);

        const bookingRes = await fetch(`${API_BASE_URL}v1/bookings/`, {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({
            user: userId,
            occurrence: schedule.id,
            start_datetime: startDt.toISOString(),
            end_datetime: endDt.toISOString(),
            status: 'reserved',
            // No gasta créditos: si luego se cancela, no debe "devolver" créditos que nunca pagó
            metadata: { assigned_by_admin: true, no_charge: true },
          }),
        });
        if (!bookingRes.ok) throw bookingRes;
      } catch (err) {
        const why = await friendlyError(err);
        setError(
          createdNow
            ? `La ficha de ${displayName} SÍ se ha creado, pero no se ha podido apuntar a la clase. ${why} Elige otro día o pulsa «Sin clase por ahora».`
            : `No se ha podido apuntar a la clase. ${why}`,
        );
        if (createdNow) onCreated?.(displayName);
        setLoading(false);
        return;
      }
    }

    const when = willBook && schedule
      ? ` con reserva en ${schedule.class_type.title} el ${longDay(bookingDate)} a las ${hhmm(schedule.start_time)}`
      : '';
    notify(
      createdNow
        ? `Ficha de ${displayName} creada${when} ✓`
        : `${displayName}: reserva hecha en ${schedule?.class_type.title} el ${longDay(bookingDate)} ✓`,
    );
    setLoading(false);
    onCreated?.(displayName);
    onClose();
  };

  const finalLabel = loading
    ? 'Guardando…'
    : mode === 'new'
      ? (willBook ? 'Crear la ficha y reservar' : 'Crear la ficha')
      : (willBook ? 'Reservar la clase' : 'Cerrar');

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.4rem', pb: 0.5 }}>
        {step === 0 ? (mode === 'existing' ? 'Apuntar a alguien a una clase' : 'Dar de alta a un cliente') : `Apuntar a ${displayName || 'esta persona'} a una clase`}
        <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mt: 0.5 }}>
          Paso {step + 1} de 2 · {step === 0 ? '¿Quién es?' : '¿A qué clase viene? (opcional)'}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 2 }}>
          {step === 0 && (
            <>
              <FormStep n={1} title="¿Ya ha venido alguna vez?">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <ChoiceCard
                    selected={mode === 'new'}
                    onClick={() => { setMode('new'); setExistingUser(null); }}
                    icon={<PersonAddIcon />}
                    title="Primera vez"
                    text="Creo su ficha ahora."
                  />
                  <ChoiceCard
                    selected={mode === 'existing'}
                    onClick={() => setMode('existing')}
                    icon={<PersonSearchIcon />}
                    title="Ya tiene ficha"
                    text="Busco su ficha para reservarle una clase."
                  />
                </Stack>
              </FormStep>

              {mode === 'new' ? (
                <FormStep
                  n={2}
                  title="¿Cómo se llama?"
                  hint={
                    <>
                      No hace falta email ni contraseña.{' '}
                      <HelpTip title="¿Y el email?">
                        Al crear la ficha desde aquí el programa le pone un email interno que no es real
                        (termina en @sin-email.invalid). No se le envía ningún correo y no puede entrar
                        en la web con esta ficha.
                      </HelpTip>
                    </>
                  }
                >
                  <Stack spacing={2}>
                    <TextField
                      label="Nombre y apellidos"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      error={Boolean(nameError)}
                      helperText={nameError || 'Ej.: Marta García'}
                      fullWidth
                      required
                      autoFocus
                      slotProps={{ htmlInput: { maxLength: 150 } }}
                    />
                    {similar.length > 0 && (
                      <Alert severity="warning" sx={{ fontSize: '0.92rem' }}>
                        Ojo: ya hay {similar.length === 1 ? 'una ficha' : 'fichas'} con un nombre parecido. Si es
                        la misma persona, pulsa «Es esta ficha» para no crearla dos veces.
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          {similar.map((u) => (
                            <Stack key={u.id} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                              <Typography sx={{ fontSize: '0.92rem' }}>
                                <b>{personName(u) || u.email}</b>
                                {u.phone ? ` · ${u.phone}` : ''}
                                {!isInternal(u.email) ? ` · ${u.email}` : ''}
                              </Typography>
                              <Button
                                size="small"
                                variant="outlined"
                                sx={{ minHeight: 40, flexShrink: 0 }}
                                onClick={() => { setUsers([u]); setExistingUser(u); setSearchQuery(personName(u) || u.email); setMode('existing'); }}
                              >
                                Es esta ficha
                              </Button>
                            </Stack>
                          ))}
                        </Stack>
                      </Alert>
                    )}
                    <TextField
                      label="Teléfono (opcional)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                      error={touched.phone && Boolean(phoneError)}
                      helperText={(touched.phone && phoneError) || 'Ej.: 612 345 678. Sirve para buscar su ficha y para llamar.'}
                      fullWidth
                      type="tel"
                      slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 40 } }}
                    />
                  </Stack>
                </FormStep>
              ) : (
                <FormStep n={2} title="¿Quién es?" hint="Escribe al menos 2 letras de su nombre, o su teléfono o email.">
                  <Autocomplete
                    options={users}
                    getOptionLabel={(u) => personName(u) || u.email}
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
                    loading={searching}
                    value={existingUser}
                    onChange={(_, v) => setExistingUser(v)}
                    onInputChange={(_, v, reason) => {
                      setSearchQuery(v);
                      if (reason === 'input') searchUser(v);
                    }}
                    filterOptions={(x) => x}
                    inputValue={searchQuery}
                    noOptionsText={searchQuery.trim().length < 2 ? 'Escribe al menos 2 letras' : 'No hay nadie con ese dato. ¿Primera vez? Elige «Primera vez» arriba.'}
                    loadingText="Buscando…"
                    isOptionEqualToValue={(o, v) => o.id === v.id}
                    renderInput={(params) => (
                      <TextField {...params} label="Buscar cliente" placeholder="Ej.: Javier o 612 345 678" autoFocus />
                    )}
                    fullWidth
                  />
                  {existingUser && (
                    <Alert severity="success" sx={{ mt: 1.5, fontSize: '0.95rem' }}>
                      Has elegido a <b>{personName(existingUser) || existingUser.email}</b>.
                    </Alert>
                  )}
                </FormStep>
              )}
            </>
          )}

          {step === 1 && (
            <>
              {schedulesError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  No se han podido cargar las clases. {schedulesError}
                </Alert>
              )}
              <FormStep
                n={3}
                title="¿A qué clase viene?"
                hint="Es opcional. Si todavía no lo sabe, pulsa «Sin clase por ahora»."
              >
                <Autocomplete
                  options={schedules}
                  getOptionLabel={scheduleLabel}
                  value={schedule}
                  onChange={(_, v) => { setSelectedSchedule(v ? v.id : ''); setBookingDate(''); setError(''); }}
                  filterOptions={(options, { inputValue }) => {
                    const q = inputValue.toLowerCase();
                    return options.filter((o) =>
                      o.class_type.title.toLowerCase().includes(q) ||
                      o.room.name.toLowerCase().includes(q) ||
                      WEEKDAYS[o.weekday].includes(q));
                  }}
                  noOptionsText="No hay ninguna clase con ese nombre"
                  groupBy={(s) => s.class_type.title}
                  renderInput={(params) => (
                    <TextField {...params} label="Clase" helperText="Escribe el nombre de la clase, la sala o el día. Ej.: Reformer, martes" />
                  )}
                  fullWidth
                />
                <Button
                  variant={!schedule ? 'contained' : 'outlined'}
                  color="inherit"
                  startIcon={<EventBusyIcon />}
                  onClick={() => { setSelectedSchedule(''); setBookingDate(''); setError(''); }}
                  sx={{ mt: 1.5, minHeight: 44 }}
                >
                  Sin clase por ahora
                </Button>
              </FormStep>

              {schedule && (
                <FormStep n={4} title="¿Qué día?" hint={`Próximos ${WEEKDAYS[schedule.weekday]} a las ${hhmm(schedule.start_time)}.`}>
                  {dates.length === 0 ? (
                    <Typography sx={{ color: 'var(--studio-text-strong)' }}>Esta clase no tiene fechas en las próximas semanas.</Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} role="group" aria-label="Día de la clase">
                      {dates.map((dStr) => {
                        const selected = bookingDate === dStr;
                        return (
                          <Button
                            key={dStr}
                            variant={selected ? 'contained' : 'outlined'}
                            aria-pressed={selected}
                            onClick={() => { setBookingDate(dStr); setError(''); }}
                            sx={{ minHeight: 44, minWidth: 96, textTransform: 'none' }}
                          >
                            {parseLocalDate(dStr).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </Button>
                        );
                      })}
                    </Box>
                  )}
                </FormStep>
              )}

              <Alert severity="info" sx={{ fontSize: '0.92rem', mb: 2 }}>
                Apuntar desde aquí <b>no le gasta créditos</b> y al cliente no le llega ningún aviso. Si quieres
                cobrarle la clase, quítale los créditos después en «Créditos».
              </Alert>

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, backgroundColor: 'rgb(var(--studio-bg-light-rgb) / 0.9)' }}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Resumen</Typography>
                <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-dark)' }}>
                  {mode === 'new'
                    ? <>Se creará la ficha de <b>{displayName}</b>{phone.trim() ? ` (tel. ${phone.trim()})` : ''}</>
                    : <>Cliente: <b>{displayName}</b></>}
                  {willBook && schedule
                    ? <> y se apuntará a <b>{schedule.class_type.title}</b> el <b>{longDay(bookingDate)}</b> a las <b>{hhmm(schedule.start_time)}</b>.</>
                    : mode === 'new' ? ', sin apuntar a ninguna clase.' : '. No se apuntará a ninguna clase.'}
                </Typography>
              </Paper>
            </>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2, fontSize: '0.95rem' }} role="alert">{error}</Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
        {step === 0 ? (
          <>
            <Button variant="outlined" onClick={handleClose} sx={{ minHeight: 48 }}>Cancelar</Button>
            <Button
              variant="contained"
              onClick={() => { setTouched({ name: true, phone: true }); if (canContinue) setStep(1); }}
              disabled={mode === 'existing' && !existingUser}
              sx={{ minHeight: 48, ml: '0 !important' }}
            >
              Siguiente: elegir clase
            </Button>
          </>
        ) : (
          <>
            <Button variant="outlined" onClick={() => { setStep(0); setError(''); }} disabled={loading} sx={{ minHeight: 48 }}>
              Volver
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (mode === 'existing' && !willBook && !schedule) { onClose(); return; }
                handleCreateAndBook();
              }}
              disabled={loading || (Boolean(schedule) && !bookingDate)}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ minHeight: 48, ml: '0 !important' }}
            >
              {finalLabel}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
