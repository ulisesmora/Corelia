import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Button, Typography, CircularProgress, Stack, Autocomplete, TextField,
  Paper, Alert, Chip, Divider,
} from '@mui/material';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import AddIcon from '@mui/icons-material/Add';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';

interface UserOption { id: number; email: string; first_name?: string; last_name?: string; phone?: string | null; }
interface Schedule {
  id: number;
  class_type: { id: number; title: string; default_price_credits?: string | number };
  room: { id: number; name: string };
  weekday: number | null;
  start_time: string;
  end_time: string;
  capacity_max?: number;
  price_credits_override?: string | number | null;
  is_recurrent?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}
interface Assignment {
  id: number;
  schedule: number;
  schedule_title: string;
  weekday: number;
  start_time: string;
  room_name: string;
  is_active: boolean;
  credits_per_class?: number;
}
interface ClientInfo { balance: number | null; plan: string | null; subStatus: string | null; }
interface AssignResult {
  booked: number; skipped: number; end_date: string; class_title: string;
  room: string; weekday: number; start_time: string;
}
interface FutureBooking { id: number; start_datetime: string; occurrence_id?: number; status: string; }

// weekday del backend: 0 = lunes … 6 = domingo
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const WEEKDAYS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';

const ymd = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d); // YYYY-MM-DD en Madrid
const addDaysYmd = (days: number) => ymd(new Date(Date.now() + days * 86400000));
const niceDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ });

const userName = (u: UserOption) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email;
const firstName = (u: UserOption) => (u.first_name || '').split(' ')[0] || userName(u);
const creditsOf = (s: Schedule) => Number(s.price_credits_override ?? s.class_type.default_price_credits ?? 1);
const creditsLabel = (n: number) => `${String(n).replace('.', ',')} ${n === 1 ? 'crédito' : 'créditos'}`;

const SUB_LABELS: Record<string, string> = {
  active: 'activa', past_due: 'con el pago pendiente', canceled: 'cancelada', incomplete: 'sin completar', trialing: 'de prueba',
};

const DURATIONS = [
  { key: '1m', label: '1 mes', days: 30 },
  { key: '3m', label: '3 meses (recomendado)', days: 90 },
  { key: '6m', label: '6 meses', days: 180 },
  { key: 'custom', label: 'Otra fecha…', days: 0 },
];

/** Cuántas veces cae la clase entre hoy y la fecha final (estimación para el resumen). */
function countWeeks(s: Schedule, endYmd: string): number {
  if (s.weekday == null) return 0;
  const today = ymd(new Date());
  let n = 0;
  const d = new Date(`${today}T12:00:00`);
  while (ymd(d) <= endYmd) {
    const day = ymd(d);
    const py = (d.getDay() + 6) % 7;
    const inWindow = (!s.start_date || day >= s.start_date) && (!s.end_date || day <= s.end_date);
    if (py === s.weekday && inWindow) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export default function AssignClassesManagement() {
  const confirm = useConfirm();
  const notify = useNotify();

  const [users, setUsers] = useState<UserOption[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesError, setSchedulesError] = useState('');
  const [occupancy, setOccupancy] = useState<Record<number, { count: number; nextISO: string }>>({});
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [duration, setDuration] = useState('3m');
  const [customDate, setCustomDate] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<AssignResult | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const today = ymd(new Date());
  const maxDate = addDaysYmd(365);
  const endDate = duration === 'custom'
    ? customDate
    : addDaysYmd(DURATIONS.find((d) => d.key === duration)?.days || 90);
  const customDateError =
    duration === 'custom' && customDate !== '' && (customDate < today || customDate > maxDate)
      ? 'Elige una fecha entre hoy y dentro de un año.'
      : '';
  const endDateOk = Boolean(endDate) && !customDateError;

  const loadSchedules = useCallback(async () => {
    setSchedulesError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/recurrences/?is_active=true&is_recurrent=true`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const d = await res.json();
      const list: Schedule[] = Array.isArray(d) ? d : d.results || [];
      // El filtro is_recurrent no existe en la API: filtramos aquí las sesiones sueltas y las ya terminadas
      setSchedules(
        list
          .filter((s) => s.is_recurrent === true && s.weekday != null && (!s.end_date || s.end_date >= today))
          .sort((a, b) => (a.weekday! - b.weekday!) || a.start_time.localeCompare(b.start_time)),
      );
    } catch (e) {
      setSchedulesError(await friendlyError(e));
    }
    // Plazas ocupadas en los próximos 7 días (una sesión por clase semanal)
    try {
      const res = await fetch(
        `${API_BASE_URL}v1/bookings/?status=reserved&start_datetime__gte=${today}&start_datetime__lt=${addDaysYmd(8)}&page_size=200`,
        { headers: authHeaders() },
      );
      if (res.ok) {
        const d = await res.json();
        const now = Date.now();
        const occ: Record<number, { count: number; nextISO: string }> = {};
        for (const b of (d.results || d) as FutureBooking[]) {
          if (!b.occurrence_id || new Date(b.start_datetime).getTime() < now) continue;
          const cur = occ[b.occurrence_id];
          if (!cur || b.start_datetime < cur.nextISO) occ[b.occurrence_id] = { count: 1, nextISO: b.start_datetime };
          else if (b.start_datetime === cur.nextISO) cur.count++;
        }
        setOccupancy(occ);
      }
    } catch { /* las plazas libres son solo informativas */ }
  }, [today]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const fetchUsers = async (query: string) => {
    if (query.length < 2) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/users/?search=${encodeURIComponent(query)}&ordering=email`, {
        headers: authHeaders(),
      });
      const d = await res.json();
      setUsers(Array.isArray(d) ? d : d.results || []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchAssignments = useCallback(async () => {
    if (!selectedUser) return;
    setLoadingAssignments(true);
    setAssignmentsError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/users/${selectedUser.id}/class-preferences/`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw res;
      const d = await res.json();
      setAssignments(Array.isArray(d) ? d : d.results || []);
    } catch (e) {
      setAssignmentsError(await friendlyError(e));
    } finally {
      setLoadingAssignments(false);
    }
  }, [selectedUser]);

  const fetchClientInfo = useCallback(async () => {
    if (!selectedUser) return;
    setClientInfo(null);
    const info: ClientInfo = { balance: null, plan: null, subStatus: null };
    try {
      const [wRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}v1/wallets/?user=${selectedUser.id}`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}v1/subscriptions/?user=${selectedUser.id}`, { headers: authHeaders() }),
      ]);
      if (wRes.ok) {
        const w = await wRes.json();
        const list = Array.isArray(w) ? w : w.results || [];
        info.balance = list.length ? Number(list[0].balance) : 0;
      }
      if (sRes.ok) {
        const s = await sRes.json();
        const subs = (Array.isArray(s) ? s : s.results || []) as { status: string; plan?: { name: string } }[];
        const best = subs.find((x) => x.status === 'active') || subs.find((x) => x.status === 'past_due');
        if (best) { info.plan = best.plan?.name || 'Membresía'; info.subStatus = best.status; }
      }
    } catch { /* se muestra lo que haya */ }
    setClientInfo(info);
  }, [selectedUser]);

  useEffect(() => {
    if (selectedUser) {
      fetchAssignments();
      fetchClientInfo();
    } else {
      setAssignments([]);
      setClientInfo(null);
    }
  }, [selectedUser, fetchAssignments, fetchClientInfo]);

  const hasMembership = clientInfo?.subStatus === 'active';
  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.schedule)), [assignments]);

  const scheduleLabel = (s: Schedule) =>
    `${s.class_type.title} · ${WEEKDAYS[s.weekday ?? 0]} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)} · ${s.room.name}`;

  const placesText = (s: Schedule) => {
    const cap = s.capacity_max;
    const taken = occupancy[s.id]?.count || 0;
    if (!cap) return '';
    const free = Math.max(0, cap - taken);
    return free === 0 ? 'la próxima está llena' : `próxima: quedan ${free} de ${cap} plazas`;
  };

  const handleAssign = async () => {
    if (!selectedUser || !selectedSchedule || !endDateOk) return;
    setAssigning(true);
    try {
      const body: Record<string, unknown> = { schedule_id: selectedSchedule.id, end_date: endDate };
      const res = await fetch(`${API_BASE_URL}v1/users/${selectedUser.id}/assign-recurring/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.clone().json().catch(() => ({}));
        if (d?.error && res.status === 400) throw new Error(d.error === 'El horario no está activo'
          ? 'Esta clase está desactivada en el horario. Actívala primero en «Horarios» o elige otra.'
          : d.error);
        throw new Error(await friendlyError(res));
      }
      const d = await res.json();
      setResult({
        booked: d.booked ?? 0,
        skipped: d.skipped ?? 0,
        end_date: d.end_date || endDate,
        class_title: d.class_title || selectedSchedule.class_type.title,
        room: d.room || selectedSchedule.room.name,
        weekday: d.weekday ?? selectedSchedule.weekday ?? 0,
        start_time: d.start_time || selectedSchedule.start_time.slice(0, 5),
      });
      notify(
        `${firstName(selectedUser)} ya tiene su clase fija ✓ Se han reservado ${d.booked ?? 0} ${d.booked === 1 ? 'clase' : 'clases'}.`,
      );
      fetchAssignments();
      loadSchedules();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally {
      setAssigning(false);
    }
  };

  const resetForSameClient = () => {
    setResult(null);
    setSelectedSchedule(null);
    setDuration('3m');
    setCustomDate('');
  };

  const resetForNewClient = () => {
    resetForSameClient();
    setSelectedUser(null);
    setSearchUser('');
    setUsers([]);
  };

  /** Reservas futuras de la clienta (opcionalmente solo de una clase). */
  const futureBookings = async (scheduleId?: number): Promise<FutureBooking[]> => {
    if (!selectedUser) return [];
    const res = await fetch(
      `${API_BASE_URL}v1/bookings/?user=${selectedUser.id}&status=reserved&start_datetime__gte=${today}&page_size=200`,
      { headers: authHeaders() },
    );
    if (!res.ok) throw res;
    const d = await res.json();
    const now = Date.now();
    return ((d.results || d) as FutureBooking[])
      .filter((b) => new Date(b.start_datetime).getTime() > now && (scheduleId == null || b.occurrence_id === scheduleId))
      .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  };

  const handleRemoveAssignment = async (a: Assignment) => {
    if (!selectedUser) return;
    const name = firstName(selectedUser);
    const what = `${a.schedule_title} (${WEEKDAYS_PLURAL[a.weekday]} a las ${a.start_time?.slice(0, 5)})`;
    let pending: FutureBooking[] = [];
    try { pending = await futureBookings(a.schedule); } catch { pending = []; }

    const ok = await confirm({
      title: `¿Quitar la clase fija ${what} a ${name}?`,
      tone: 'danger',
      confirmText: 'Sí, quitar la clase fija',
      cancelText: 'No, dejarla',
      message: (
        <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.6 } }}>
          <li>Dejará de reservarse sola cada semana.</li>
          <li>
            {pending.length > 0
              ? <>Las reservas que ya tiene hechas de esta clase (<b>{pending.length}</b>, la próxima el {shortDate(pending[0].start_datetime)}) <b>no se borran solas</b>: justo después te preguntamos qué hacer con ellas.</>
              : 'No tiene reservas futuras de esta clase.'}
          </li>
          <li>No se le envía ningún aviso.</li>
          <li>Se puede deshacer: vuelve a apuntarla aquí cuando quieras.</li>
        </Box>
      ),
    });
    if (!ok) return;

    setBusy(`rm-${a.id}`);
    try {
      const res = await fetch(`${API_BASE_URL}v1/users/${selectedUser.id}/class-preferences/${a.id}/`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw res;
      notify(`Clase fija quitada ✓ ${name} ya no tiene ${a.schedule_title} los ${WEEKDAYS_PLURAL[a.weekday]}.`);
      await fetchAssignments();

      if (pending.length > 0) {
        const n = pending.length;
        const alsoCancel = await confirm({
          title: `${name} todavía tiene ${n} ${n === 1 ? 'reserva' : 'reservas'} de ${a.schedule_title}. ¿Las cancelamos también?`,
          tone: 'danger',
          confirmText: `Sí, cancelar ${n === 1 ? 'esa reserva' : `esas ${n} reservas`}`,
          cancelText: 'No, que las conserve',
          message: (
            <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.6 } }}>
              <li>La próxima es el {shortDate(pending[0].start_datetime)}{n > 1 ? ` y la última el ${shortDate(pending[n - 1].start_datetime)}` : ''}.</li>
              <li>Se liberan esas plazas para otras personas.</li>
              <li>Las que le apuntaste tú desde esta pantalla no devuelven créditos (no los gastó). Las que pagó con créditos, sí se le devuelven.</li>
              <li>Le llega un aviso de cada reserva cancelada (email, y WhatsApp y móvil si los tiene).</li>
            </Box>
          ),
        });
        if (alsoCancel) {
          let done = 0;
          for (const b of pending) {
            const r = await fetch(`${API_BASE_URL}v1/bookings/${b.id}/cancel/`, {
              method: 'POST',
              headers: authHeaders({ 'Content-Type': 'application/json' }),
            }).catch(() => null);
            if (r?.ok) done++;
          }
          notify(
            done === n
              ? `Hecho ✓ Se han cancelado las ${n} reservas de ${a.schedule_title}.`
              : `Se han cancelado ${done} de ${n} reservas. Revisa las que faltan en «Reservas».`,
            done === n ? 'success' : 'warning',
          );
          loadSchedules();
        }
      }
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleCancelAllBookings = async () => {
    if (!selectedUser) return;
    const name = firstName(selectedUser);
    let pending: FutureBooking[] = [];
    try { pending = await futureBookings(); } catch { pending = []; }
    if (pending.length === 0) {
      notify(`${name} no tiene reservas futuras: no hay nada que cancelar.`, 'info');
      return;
    }
    const n = pending.length;
    const ok = await confirm({
      title: `¿Cancelar las ${n} reservas futuras de ${name}?`,
      tone: 'danger',
      confirmText: `Sí, cancelar sus ${n} reservas`,
      cancelText: 'No, volver',
      message: (
        <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.6 } }}>
          <li>Se cancelan <b>todas</b> sus reservas desde hoy, de cualquier clase (no solo las fijas).</li>
          <li>Las que pagó con créditos se le devuelven a su cuenta. Las que le apuntaste tú desde aquí no devuelven nada (no gastó créditos).</li>
          <li>Le llega un <b>email</b> y una notificación en el móvil (si tiene la app) avisando de la cancelación.</li>
          <li>
            Ojo: sus <b>clases fijas siguen guardadas</b>. Si tiene membresía, el domingo se volverá a reservar la semana
            siguiente. Si no quieres eso, quita también sus clases fijas.
          </li>
          <li>No se puede deshacer.</li>
        </Box>
      ),
    });
    if (!ok) return;
    setBusy('cancel-all');
    try {
      const res = await fetch(`${API_BASE_URL}v1/users/${selectedUser.id}/cancel-all-bookings/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      if (!res.ok) throw res;
      const d = await res.json();
      notify(
        d.cancelled > 0
          ? `Hecho ✓ Se han cancelado ${d.cancelled} reservas de ${name}${d.refunded ? ` y en ${d.refunded} se le han devuelto los créditos` : ''}. Ya le ha llegado el aviso por email.`
          : `${name} no tenía reservas futuras que cancelar.`,
        d.cancelled > 0 ? 'success' : 'info',
      );
      fetchAssignments();
      fetchClientInfo();
      loadSchedules();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const weeks = selectedSchedule && endDateOk ? countWeeks(selectedSchedule, endDate) : 0;
  const perClass = selectedSchedule ? creditsOf(selectedSchedule) : 0;
  const nextFull = selectedSchedule ? placesText(selectedSchedule) === 'la próxima está llena' : false;

  // ─────────────────────────── Render ───────────────────────────

  const renderSuccess = (r: AssignResult, u: UserOption) => (
    <Box sx={{ textAlign: 'center', py: 2 }}>
      <CheckCircleIcon sx={{ fontSize: 64, color: '#7D9B6C' }} />
      <Typography sx={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--studio-dark)', mt: 1 }}>
        ¡Hecho! {userName(u)} ya tiene su plaza fija
      </Typography>
      <Typography sx={{ fontSize: '1.05rem', mt: 1, color: 'var(--studio-text-strong)' }}>
        {r.class_title} · los {WEEKDAYS_PLURAL[r.weekday]} a las {r.start_time} · {r.room}
      </Typography>
      <Stack spacing={1} sx={{ mt: 2, textAlign: 'left', maxWidth: 520, mx: 'auto' }}>
        {r.booked > 0 ? (
          <Alert severity="success" sx={{ fontSize: '0.95rem' }}>
            Se han reservado <b>{r.booked} {r.booked === 1 ? 'clase' : 'clases'}</b>, hasta el {niceDate(r.end_date)}.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ fontSize: '0.95rem' }}>
            No se ha reservado ninguna clase nueva: ya las tenía todas, o estaban llenas o el estudio estaba cerrado.
          </Alert>
        )}
        {r.skipped > 0 && (
          <Alert severity="warning" sx={{ fontSize: '0.95rem' }}>
            {r.skipped} {r.skipped === 1 ? 'semana no se ha podido reservar' : 'semanas no se han podido reservar'} porque
            la clase estaba llena o el estudio cerrado ese día.
          </Alert>
        )}
        <Alert severity="info" icon={false} sx={{ fontSize: '0.95rem' }}>
          {firstName(u)} recibe un aviso con su clase fija y hasta cuándo tiene plaza (email y notificación en el móvil si tiene la app).
        </Alert>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" sx={{ mt: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={resetForSameClient} sx={{ minHeight: 48 }}>
          Apuntar otra clase a {firstName(u)}
        </Button>
        <Button variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={resetForNewClient} sx={{ minHeight: 48 }}>
          Apuntar a otra clienta
        </Button>
      </Stack>
    </Box>
  );

  const renderWizard = () => (
    <>
      <FormStep
        n={1}
        title="¿A qué clienta?"
        hint="Escribe al menos 2 letras de su nombre, email o teléfono y elígela de la lista."
      >
        <Autocomplete
          options={users}
          getOptionLabel={(u) => `${userName(u)}${u.phone ? ' · ' + u.phone : ''}`}
          renderOption={(props, u) => {
            const { key, ...rest } = props as typeof props & { key: string };
            return (
              <Box component="li" key={key} {...rest} sx={{ minHeight: 52, display: 'block !important' }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.98rem' }}>{userName(u)}</Typography>
                <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>
                  {[u.phone, u.email].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
            );
          }}
          loading={usersLoading}
          value={selectedUser}
          onChange={(_, v) => { setSelectedUser(v); setSelectedSchedule(null); setResult(null); }}
          onInputChange={(_, v, reason) => {
            setSearchUser(v);
            if (reason === 'input') fetchUsers(v);
          }}
          filterOptions={(x) => x}
          inputValue={searchUser}
          noOptionsText={searchUser.length < 2 ? 'Escribe al menos 2 letras para buscar' : 'No encuentro a nadie con eso. Prueba con su email o teléfono.'}
          loadingText="Buscando…"
          openText="Abrir"
          closeText="Cerrar"
          clearText="Borrar"
          isOptionEqualToValue={(o, v) => o.id === v.id}
          renderInput={(params) => (
            <TextField {...params} label="Buscar clienta" placeholder="p. ej. Marta, marta@gmail.com o 612345678" />
          )}
          fullWidth
        />

        {selectedUser && (
          <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 3, backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.8)' }}>
            <Typography sx={{ fontWeight: 600, fontSize: '1.05rem' }}>{userName(selectedUser)}</Typography>
            <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', wordBreak: 'break-word' }}>
              {[selectedUser.phone, selectedUser.email].filter(Boolean).join(' · ')}
            </Typography>
            {!clientInfo ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <CircularProgress size={18} />
                <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary' }}>Mirando sus créditos y membresía…</Typography>
              </Stack>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }} alignItems="center">
                <Chip
                  label={clientInfo.balance == null ? 'Créditos: no se sabe' : `Créditos disponibles: ${String(clientInfo.balance).replace('.', ',')}`}
                  sx={{ fontSize: '0.9rem' }}
                />
                <Chip
                  color={clientInfo.subStatus === 'active' ? 'success' : clientInfo.subStatus === 'past_due' ? 'warning' : 'default'}
                  label={clientInfo.plan ? `Membresía ${clientInfo.plan} (${SUB_LABELS[clientInfo.subStatus || ''] || clientInfo.subStatus})` : 'Sin membresía'}
                  sx={{ fontSize: '0.9rem' }}
                />
                <HelpTip title="¿Por qué importa?">
                  Con <b>membresía activa</b>, cuando se acaben las semanas que reserves ahora, el sistema le seguirá
                  reservando esta clase cada domingo y le descontará los créditos. <b>Sin membresía</b>, solo tendrá las
                  semanas que reserves hoy.
                </HelpTip>
              </Stack>
            )}
          </Paper>
        )}
      </FormStep>

      {selectedUser && (
        <FormStep
          n={2}
          title="¿A qué clase, y hasta cuándo?"
          hint="Solo salen las clases que se repiten cada semana. Puedes escribir para buscar (p. ej. «lunes» o «Reformer»)."
        >
          {schedulesError ? (
            <Alert
              severity="error"
              action={<Button color="inherit" onClick={loadSchedules} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>Reintentar</Button>}
            >
              {schedulesError}
            </Alert>
          ) : (
            <Autocomplete
              options={schedules}
              groupBy={(s) => WEEKDAYS[s.weekday ?? 0]}
              getOptionLabel={scheduleLabel}
              value={selectedSchedule}
              onChange={(_, v) => setSelectedSchedule(v)}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              noOptionsText="No hay ninguna clase con ese nombre"
              openText="Abrir"
              closeText="Cerrar"
              clearText="Borrar"
              renderOption={(props, s) => {
                const { key, ...rest } = props as typeof props & { key: string };
                const places = placesText(s);
                return (
                  <Box component="li" key={key} {...rest} sx={{ minHeight: 56, display: 'block !important' }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.98rem' }}>
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.class_type.title}
                      {assignedIds.has(s.id) && <Chip size="small" label="Ya la tiene" sx={{ ml: 1 }} />}
                    </Typography>
                    <Typography sx={{ fontSize: '0.88rem', color: places.includes('llena') ? '#A86B5E' : 'text.secondary' }}>
                      {s.room.name} · {creditsLabel(creditsOf(s))} por clase{places ? ` · ${places}` : ''}
                      {s.end_date ? ` · termina el ${new Date(`${s.end_date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}
                    </Typography>
                  </Box>
                );
              }}
              renderInput={(params) => <TextField {...params} label="Clase semanal" placeholder="Elige o escribe para buscar" />}
              fullWidth
            />
          )}

          {selectedSchedule && (
            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontWeight: 600, mb: 1, color: 'var(--studio-dark)' }}>¿Durante cuánto tiempo le reservamos las clases?</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {DURATIONS.map((d) => (
                  <Button
                    key={d.key}
                    variant={duration === d.key ? 'contained' : 'outlined'}
                    onClick={() => setDuration(d.key)}
                    aria-pressed={duration === d.key}
                    sx={{ minHeight: 44 }}
                  >
                    {d.label}
                  </Button>
                ))}
              </Stack>
              {duration === 'custom' && (
                <TextField
                  type="date"
                  label="Reservar hasta el día"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  error={Boolean(customDateError)}
                  helperText={customDateError || 'Pulsa el calendario y elige el último día (máximo un año).'}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today, max: maxDate } }}
                  sx={{ mt: 2, maxWidth: 320 }}
                  fullWidth
                />
              )}
              {endDateOk && (
                <Typography sx={{ mt: 1.25, fontSize: '0.95rem', color: 'var(--studio-text-strong)' }}>
                  Hasta el <b>{niceDate(endDate)}</b>.
                </Typography>
              )}
            </Box>
          )}
        </FormStep>
      )}

      {selectedUser && selectedSchedule && endDateOk && (
        <FormStep n={3} title="Revisa y confirma" hint="Esto es exactamente lo que va a pasar:">
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, backgroundColor: 'rgb(var(--studio-bg-light-rgb) / 0.95)', borderColor: 'rgb(var(--studio-primary-rgb) / 0.45)' }}
          >
            <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.6, mb: 1.5 }}>
              Vas a apuntar a <b>{userName(selectedUser)}</b> a <b>{selectedSchedule.class_type.title}</b> todos
              los <b>{WEEKDAYS_PLURAL[selectedSchedule.weekday ?? 0]} a las {selectedSchedule.start_time.slice(0, 5)}</b>{' '}
              ({selectedSchedule.room.name}).
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.9, fontSize: '0.97rem', lineHeight: 1.6 } }}>
              <li>
                Se le reservan <b>ahora mismo</b> todas las semanas desde hoy hasta el {niceDate(endDate)}
                {weeks > 0 ? <> (unas <b>{weeks} {weeks === 1 ? 'clase' : 'clases'}</b>)</> : null}. Las semanas en que
                la clase esté llena o el estudio cerrado se saltan.
              </li>
              <li>
                Estas reservas <b>no le descuentan créditos</b>: se las apuntas tú, sin coste (normalmente
                {' '}{creditsLabel(perClass)} por clase). Si tiene que pagarlas, descuéntaselos en «Créditos».
              </li>
              <li>{firstName(selectedUser)} <b>recibe un aviso</b> (email y, si tiene la app, notificación en el móvil) con su clase y hasta cuándo tiene plaza.</li>
              <li>
                {hasMembership ? (
                  <>
                    Como tiene <b>membresía activa</b>, después de esa fecha el sistema le seguirá reservando esta clase
                    cada domingo para la semana siguiente, y entonces <b>sí gastará {creditsLabel(perClass)} por clase</b>.
                    Si se queda sin créditos, esa semana no se reserva y le llega un email y una notificación.
                  </>
                ) : clientInfo?.subStatus === 'past_due' ? (
                  <>
                    Su membresía tiene un <b>pago pendiente</b>: hasta que se cobre, después de esa fecha no se le
                    reservará sola. La clase queda guardada como fija para cuando se arregle el pago.
                  </>
                ) : (
                  <>
                    <b>No tiene membresía</b>: después de esa fecha ya no se le reservará sola. La clase queda guardada
                    como fija por si más adelante se hace membresía.
                  </>
                )}
              </li>
              <li>Para quitarla más adelante: en «Clases fijas de {firstName(selectedUser)}» pulsa «Quitar clase fija».</li>
            </Box>
            {nextFull && (
              <Alert severity="warning" sx={{ mt: 1.5, fontSize: '0.95rem' }}>
                La próxima clase ya está llena: esa semana no se le podrá reservar.
              </Alert>
            )}
            {assignedIds.has(selectedSchedule.id) && (
              <Alert severity="info" sx={{ mt: 1.5, fontSize: '0.95rem' }}>
                Ya tiene esta clase como fija. Si sigues, solo se reservan las semanas que le falten.
              </Alert>
            )}
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleAssign}
              disabled={assigning}
              startIcon={assigning ? <CircularProgress size={20} color="inherit" /> : <EventRepeatIcon />}
              sx={{ mt: 2, minHeight: 52, fontSize: '1rem' }}
            >
              {assigning ? 'Guardando…' : `Sí, apuntar a ${firstName(selectedUser)} a esta clase`}
            </Button>
          </Paper>
        </FormStep>
      )}
    </>
  );

  return (
    <Box>
      <PageIntro
        pageKey="assign-classes"
        title="Clases fijas de clientas"
        subtitle="Guarda a una clienta su plaza en una clase de todas las semanas, sin que tenga que reservar ella."
        steps={[
          { title: 'Busca a la clienta', text: 'Verás sus créditos y si tiene membresía.' },
          { title: 'Elige la clase semanal', text: 'Y hasta qué fecha quieres reservarle (normalmente 3 meses).' },
          { title: 'Lee el resumen y confirma', text: 'Te explicamos qué se reserva, si gasta créditos y qué pasa después.' },
        ]}
        tips={[
          'Las reservas que haces aquí no le descuentan créditos a la clienta.',
          'Para quitar una clase fija, búscala y pulsa «Quitar clase fija» en su lista de clases fijas.',
        ]}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
        <Paper sx={{ p: { xs: 2, md: 3 }, flex: 1.4, width: '100%', minWidth: 0 }}>
          {result && selectedUser ? renderSuccess(result, selectedUser) : renderWizard()}
        </Paper>

        <Paper sx={{ p: { xs: 2, md: 3 }, flex: 1, width: '100%', minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} mb={0.5}>
            <Typography component="h2" sx={{ fontWeight: 600, fontSize: '1.15rem', color: 'var(--studio-dark)' }}>
              {selectedUser ? `Clases fijas de ${firstName(selectedUser)}` : 'Clases fijas'}
            </Typography>
            {selectedUser && (
              <Button size="small" onClick={() => { fetchAssignments(); fetchClientInfo(); }} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                Actualizar
              </Button>
            )}
          </Stack>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mb: 2 }}>
            Las clases que tiene guardadas todas las semanas.
          </Typography>

          {!selectedUser ? (
            <EmptyState
              compact
              icon={<PersonSearchIcon />}
              title="Primero elige una clienta"
              text="Búscala en el paso 1 y aquí verás sus clases fijas."
            />
          ) : loadingAssignments ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
              <CircularProgress />
              <Typography color="text.secondary">Cargando sus clases fijas…</Typography>
            </Stack>
          ) : assignmentsError ? (
            <Alert
              severity="error"
              action={<Button color="inherit" onClick={fetchAssignments} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>Reintentar</Button>}
            >
              {assignmentsError}
            </Alert>
          ) : assignments.length === 0 ? (
            <EmptyState
              compact
              icon={<EventRepeatIcon />}
              title={`${firstName(selectedUser)} todavía no tiene clases fijas`}
              text="Elige una clase en el paso 2 para apuntarla."
            />
          ) : (
            <Stack spacing={1.25}>
              {assignments.map((a) => (
                <Paper key={a.id} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>{a.schedule_title}</Typography>
                      <Typography sx={{ fontSize: '0.93rem', color: 'var(--studio-text-strong)' }}>
                        {WEEKDAYS[a.weekday]} a las {a.start_time?.slice(0, 5)} · {a.room_name}
                        {a.credits_per_class != null ? ` · ${creditsLabel(a.credits_per_class)}` : ''}
                      </Typography>
                    </Box>
                    <Chip
                      label={a.is_active ? 'Activa' : 'Pausada'}
                      color={a.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </Stack>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={busy === `rm-${a.id}` ? <CircularProgress size={16} color="inherit" /> : <RemoveCircleOutlineIcon />}
                    disabled={busy !== null}
                    onClick={() => handleRemoveAssignment(a)}
                    sx={{ mt: 1.25, minHeight: 44 }}
                  >
                    {busy === `rm-${a.id}` ? 'Quitando…' : 'Quitar clase fija'}
                  </Button>
                </Paper>
              ))}
            </Stack>
          )}

          {selectedUser && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', mb: 0.5 }}>Otras acciones</Typography>
              <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mb: 1.5 }}>
                Por ejemplo, si {firstName(selectedUser)} se da de baja o se va una temporada.
              </Typography>
              <Button
                variant="outlined"
                color="error"
                fullWidth
                onClick={handleCancelAllBookings}
                disabled={busy !== null}
                startIcon={busy === 'cancel-all' ? <CircularProgress size={18} color="inherit" /> : <EventBusyIcon />}
                sx={{ minHeight: 48 }}
              >
                {busy === 'cancel-all' ? 'Cancelando…' : `Cancelar todas sus reservas futuras`}
              </Button>
            </>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}
