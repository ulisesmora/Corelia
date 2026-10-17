import { useState, useEffect, useMemo, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Paper,
  Pagination,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Stack,
  Chip,
  Checkbox,
  InputAdornment,
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import EmailIcon from '@mui/icons-material/Email';
import SendIcon from '@mui/icons-material/Send';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchSelect from '../components/SearchSelect';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';
import { useSite } from '../site/SiteProvider';

/** Si pasado este tiempo un aviso sigue sin marcarse como enviado, es que falló. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

// ====================================================================
// Tipos
// ====================================================================

interface Broadcast {
  id: number;
  subject: string;
  title: string;
  description: string;
  highlighted_text: string | null;
  send_email: boolean;
  send_push: boolean;
  push_url: string;
  emails_sent: number;
  pushes_sent: number;
  created_at: string;
  sent_at: string | null;
}

type BroadcastForm = {
  subject: string;
  title: string;
  description: string;
  highlighted_text: string;
  send_email: boolean;
  send_push: boolean;
  push_url: string;
};

interface Audience {
  email_recipients: number;
  push_devices: number;
  push_people: number;
}

// Páginas de la web a las que puede llevar la notificación
const PUSH_DESTINATIONS = [
  { id: '/', label: 'Página de inicio' },
  { id: '/calendar', label: 'Calendario de clases (para reservar)' },
  { id: '/classes', label: 'Listado de clases' },
  { id: '/prices', label: 'Precios y planes' },
  { id: '/promociones', label: 'Promociones' },
  { id: '/dashboard', label: 'Mi cuenta (área de cliente)' },
];

const EMPTY_FORM: BroadcastForm = {
  subject: '',
  title: '',
  description: '',
  highlighted_text: '',
  send_email: true,
  send_push: true,
  push_url: '/',
};

const C = {
  brand: 'var(--studio-primary)',
  brandDark: 'var(--studio-primary-dark)',
  brown: 'var(--studio-dark)',
  soft: 'var(--studio-bg)',
};

const dateFmt = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});

function authHeader(): Record<string, string> {
  try {
    const userStr = localStorage.getItem('user');
    const token = userStr ? JSON.parse(userStr).access : '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type SendState = 'sent' | 'sending' | 'failed';
function sendState(b: Broadcast): SendState {
  if (b.sent_at) return 'sent';
  return Date.now() - new Date(b.created_at).getTime() > STUCK_AFTER_MS ? 'failed' : 'sending';
}

// ====================================================================
// Tarjeta de canal (email / notificación al móvil) — grande, con check visible
// ====================================================================

function ChannelCard({
  selected, onToggle, icon, title, subtitle, reach,
}: {
  selected: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  reach: string;
}) {
  return (
    <Paper
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } }}
      elevation={0}
      sx={{
        flex: 1,
        p: 2,
        minHeight: 96,
        cursor: 'pointer',
        borderRadius: 3,
        border: '2px solid',
        borderColor: selected ? C.brand : 'rgb(var(--studio-primary-rgb) / 0.25)',
        bgcolor: selected ? 'rgb(var(--studio-primary-rgb) / 0.08)' : 'transparent',
        transition: 'all .15s ease',
        '&:hover': { borderColor: C.brand },
        '&:focus-visible': { outline: `3px solid ${C.brand}`, outlineOffset: 2 },
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <Box sx={{ color: selected ? C.brandDark : 'text.secondary', mt: 0.3 }}>{icon}</Box>
        <Box flex={1}>
          <Typography fontWeight={700}>{title}</Typography>
          <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary' }}>{subtitle}</Typography>
          <Typography sx={{ fontSize: '0.92rem', color: C.brandDark, fontWeight: 700, mt: 0.25 }}>{reach}</Typography>
        </Box>
        <Checkbox checked={selected} tabIndex={-1} sx={{ p: 0, color: C.brand, '&.Mui-checked': { color: C.brandDark } }} />
      </Stack>
    </Paper>
  );
}

// ====================================================================
// Vista previa de la notificación en la pantalla de bloqueo del móvil
// ====================================================================

function PushPreview({ title, body }: { title: string; body: string }) {
  const { config } = useSite();
  const text = body.length > 140 ? body.slice(0, 137).trimEnd() + '…' : body;
  return (
    <Box
      sx={{
        borderRadius: 4,
        p: 2,
        background: 'linear-gradient(160deg, #2b2622 0%, #4a3f36 100%)',
        minHeight: 150,
      }}
    >
      <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', textAlign: 'center', mb: 1.5 }}>
        Así la verán en su móvil
      </Typography>
      <Box
        sx={{
          bgcolor: 'rgba(255,255,255,0.92)',
          borderRadius: 3,
          p: 1.5,
          display: 'flex',
          gap: 1.2,
        }}
      >
        <Box
          component="img"
          src={config.favicon_url || config.logo_url || '/api/v1/site-config/icon/192.png'}
          alt=""
          sx={{ width: 36, height: 36, borderRadius: 1.5, flexShrink: 0 }}
        />
        <Box minWidth={0} flex={1}>
          <Stack direction="row" justifyContent="space-between">
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: '#444' }}>{config.studio_name}</Typography>
            <Typography sx={{ fontSize: 12, color: '#555' }}>ahora</Typography>
          </Stack>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>
            {title || 'Título de la notificación'}
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: '#333', lineHeight: 1.35 }}>
            {text || 'Aquí aparecerá la frase destacada o el inicio del mensaje.'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ====================================================================
// Página
// ====================================================================

export default function BroadcastManagement() {
  const confirm = useConfirm();
  const notify = useNotify();
  const [searchParams, setSearchParams] = useSearchParams();

  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState<BroadcastForm>(EMPTY_FORM);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/broadcast-emails/`, { headers: authHeader() });
      if (!res.ok) throw res;
      const data = await res.json();
      setBroadcasts(Array.isArray(data) ? data : data.results || []);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(await friendlyError(err));
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  };

  const fetchAudience = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}v1/broadcast-emails/audience/`, { headers: authHeader() });
      if (res.ok) setAudience(await res.json());
    } catch {
      /* el alcance es informativo: si falla, no bloquea */
    }
  };

  useEffect(() => {
    fetchBroadcasts();
    fetchAudience();
  }, []);

  // Enlace directo desde Inicio: /mails?accion=nuevo abre el formulario
  useEffect(() => {
    if (searchParams.get('accion') === 'nuevo') {
      openNew();
      const next = new URLSearchParams(searchParams);
      next.delete('accion');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  // Refresco automático mientras haya envíos recientes "en proceso"
  useEffect(() => {
    if (!broadcasts.some((b) => sendState(b) === 'sending')) return;
    const t = setTimeout(fetchBroadcasts, 5000);
    return () => clearTimeout(t);
  }, [broadcasts]);

  const set = <K extends keyof BroadcastForm>(k: K, v: BroadcastForm[K]) =>
    setFormData((prev) => ({ ...prev, [k]: v }));

  const openNew = () => {
    setFormData(EMPTY_FORM);
    setCopiedFrom(null);
    setShowErrors(false);
    setOpenDialog(true);
    fetchAudience();
  };

  const isDirty =
    formData.title.trim() !== '' || formData.description.trim() !== '' ||
    formData.subject.trim() !== '' || formData.highlighted_text.trim() !== '';

  const closeForm = async () => {
    if (sending) return;
    if (isDirty) {
      const ok = await confirm({
        title: '¿Salir sin enviar?',
        message: 'Se perderá lo que has escrito en este aviso.',
        confirmText: 'Sí, salir sin enviar',
        cancelText: 'No, seguir escribiendo',
      });
      if (!ok) return;
    }
    setOpenDialog(false);
  };

  // Validación en el campo
  const noChannel = !formData.send_email && !formData.send_push;
  const errors: Record<string, string> = {};
  if (!formData.title.trim()) errors.title = 'Escribe un título. Ej.: Nuevas clases de Reformer los sábados';
  if (!formData.description.trim()) errors.description = 'Escribe el mensaje. Es lo que leerán al abrirlo.';
  if (formData.send_email && !formData.subject.trim()) errors.subject = 'Escribe el asunto del email.';
  const hasErrors = Object.keys(errors).length > 0 || noChannel;
  const errFor = (k: string) => (showErrors ? errors[k] : undefined);

  // Alcance real (lo que calcula el servidor)
  const reachEmail = audience ? `Llega a ${plural(audience.email_recipients, 'persona', 'personas')}` : 'Todos los clientes con email';
  const reachPush = audience
    ? audience.push_people > 0
      ? `Llega a ${plural(audience.push_people, 'persona', 'personas')} (${plural(audience.push_devices, 'móvil', 'móviles')})`
      : 'Aún nadie ha activado las notificaciones'
    : 'Clientes con la app y las notificaciones activadas';

  const recipientsCount = audience
    ? formData.send_email
      ? Math.max(audience.email_recipients, formData.send_push ? audience.push_people : 0)
      : audience.push_people
    : null;

  const destinationLabel = PUSH_DESTINATIONS.find((d) => d.id === formData.push_url)?.label || formData.push_url;

  const handleReview = async () => {
    if (hasErrors) {
      setShowErrors(true);
      notify(noChannel ? 'Elige por dónde lo mandas: móvil, email o los dos.' : 'Falta rellenar lo que está marcado en rojo.', 'warning');
      return;
    }

    const ok = await confirm({
      title: '¿Enviamos el aviso?',
      message: (
        <Stack spacing={1.25}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>«{formData.title.trim()}»</Typography>
          {formData.send_push && (
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <NotificationsActiveIcon sx={{ color: C.brandDark, mt: 0.25 }} />
              <Typography>
                <b>Notificación al móvil</b>: {reachPush.toLowerCase()}. Al tocarla se abre: <b>{destinationLabel}</b>.
              </Typography>
            </Stack>
          )}
          {formData.send_email && (
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <EmailIcon sx={{ color: C.brandDark, mt: 0.25 }} />
              <Typography>
                <b>Email</b>: {reachEmail.toLowerCase()}, con el asunto «{formData.subject.trim()}».
              </Typography>
            </Stack>
          )}
          <Alert severity="warning">Se manda a <b>todo el mundo</b> a la vez y, una vez enviado, <b>no se puede retirar</b>.</Alert>
        </Stack>
      ),
      confirmText:
        recipientsCount !== null ? `Sí, enviar a ${plural(recipientsCount, 'cliente', 'clientes')}` : 'Sí, enviar a todo el mundo',
      cancelText: 'No, volver a editar',
    });
    if (!ok) return;
    await handleSend();
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const payload = {
        ...formData,
        subject: formData.subject || formData.title,
        highlighted_text: formData.highlighted_text || null,
      };
      const response = await fetch(`${API_BASE_URL}v1/broadcast-emails/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw response;
      await fetchBroadcasts();
      notify('¡Aviso enviado! Llegará a tus clientes en unos minutos. Abajo, en el historial, verás a cuántas personas les ha llegado.');
      setOpenDialog(false);
      setFormData(EMPTY_FORM);
      setCopiedFrom(null);
    } catch (err) {
      notify(`No se ha podido enviar. ${await friendlyError(err)}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (item: Broadcast) => {
    const ok = await confirm({
      tone: 'danger',
      title: `¿Borrar «${item.title}» del historial?`,
      message:
        'Solo se borra de esta lista. El aviso NO se retira: quienes ya lo recibieron lo siguen teniendo en su email o en su móvil.',
      confirmText: 'Sí, borrar del historial',
    });
    if (!ok) return;
    try {
      const response = await fetch(`${API_BASE_URL}v1/broadcast-emails/${item.id}/`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (!response.ok) throw response;
      await fetchBroadcasts();
      notify('Borrado del historial.');
    } catch (err) {
      notify(`No se ha podido borrar. ${await friendlyError(err)}`, 'error');
    }
  };

  const handleDuplicate = (item: Broadcast) => {
    setFormData({
      subject: item.subject,
      title: item.title,
      description: item.description,
      highlighted_text: item.highlighted_text || '',
      send_email: item.send_email ?? true,
      send_push: item.send_push ?? true,
      push_url: item.push_url || '/',
    });
    setCopiedFrom(item.title);
    setShowErrors(false);
    setOpenDialog(true);
    fetchAudience();
  };

  const filteredList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return broadcasts;
    return broadcasts.filter(
      (b) => b.subject.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
    );
  }, [broadcasts, searchTerm]);

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage]);

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <PageIntro
        pageKey="mails"
        title="Avisos a clientes"
        subtitle="Un mensaje a todos tus clientes: por email, al móvil o las dos cosas."
        actions={
          <Button variant="contained" size="large" startIcon={<SendIcon />} onClick={openNew}>
            Escribir un aviso nuevo
          </Button>
        }
      />

      {audience && (
        <Stack direction="row" spacing={1} mb={2.5} flexWrap="wrap" useFlexGap alignItems="center">
          <Chip icon={<EmailIcon />} label={`${plural(audience.email_recipients, 'cliente', 'clientes')} con email`} variant="outlined" sx={{ fontSize: '0.92rem' }} />
          <Chip
            icon={<NotificationsActiveIcon />}
            label={`${plural(audience.push_people, 'cliente', 'clientes')} con notificaciones en el móvil`}
            variant="outlined"
            color={audience.push_people > 0 ? 'success' : 'default'}
            sx={{ fontSize: '0.92rem' }}
          />
          <HelpTip title="¿A quién llega?">
            El <b>email</b> llega a todas las personas con cuenta activa. La <b>notificación al móvil</b> solo a quienes
            instalaron la app del estudio y dijeron «Permitir» a las notificaciones (un mismo cliente puede tener varios móviles).
          </HelpTip>
        </Stack>
      )}

      <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.45rem', fontWeight: 600, color: C.brown, mb: 1.5 }}>
        Avisos enviados
      </Typography>

      {broadcasts.length > 5 && (
        <TextField
          fullWidth
          data-tour="search" label="Buscar en el historial"
          placeholder="Escribe parte del asunto o el título…"
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
      )}

      {loading && !loadedOnce ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">Cargando los avisos enviados…</Typography>
        </Stack>
      ) : errorMsg ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchBroadcasts} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
          sx={{ alignItems: 'center', fontSize: '1rem' }}
        >
          No se ha podido cargar el historial. {errorMsg}
        </Alert>
      ) : paginatedList.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px dashed rgb(var(--studio-line-rgb) / 0.5)' }}>
          {searchTerm ? (
            <EmptyState title="Ningún aviso coincide" text="Prueba con otra palabra o borra la búsqueda." />
          ) : (
            <EmptyState
              icon={<CampaignIcon />}
              title="Todavía no has mandado ningún aviso"
              text="Cuando mandes el primero, aparecerá aquí con la fecha y a cuántas personas les llegó."
              action={
                <Button variant="contained" startIcon={<SendIcon />} onClick={openNew} sx={{ minHeight: 48 }}>
                  Escribir el primer aviso
                </Button>
              }
            />
          )}
        </Paper>
      ) : (
        <>
          <Stack spacing={1.5}>
            {paginatedList.map((item) => {
              const st = sendState(item);
              return (
                <Paper
                  key={item.id}
                  elevation={0}
                  sx={{ p: { xs: 2, md: 2.25 }, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)', backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.9)' }}
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                        {st === 'sent' && <Chip icon={<CheckCircleIcon />} label="Enviado" color="success" size="small" sx={{ fontSize: '0.85rem' }} />}
                        {st === 'sending' && <Chip icon={<CircularProgress size={12} />} label="Enviando…" size="small" variant="outlined" sx={{ fontSize: '0.85rem' }} />}
                        {st === 'failed' && <Chip icon={<ErrorOutlineIcon />} label="No se envió" color="error" size="small" sx={{ fontSize: '0.85rem' }} />}
                        <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', '&::first-letter': { textTransform: 'uppercase' } }}>
                          {dateFmt.format(new Date(item.sent_at || item.created_at))}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontWeight: 700, fontSize: '1.08rem', color: C.brown }}>{item.title}</Typography>
                      <Typography
                        sx={{
                          color: 'text.secondary', fontSize: '0.95rem',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}
                      >
                        {item.description}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        {item.send_email !== false && (
                          <Chip
                            size="small"
                            icon={<EmailIcon />}
                            label={st === 'sent' ? `Email a ${plural(item.emails_sent ?? 0, 'persona', 'personas')}` : 'Por email'}
                            variant="outlined"
                            sx={{ fontSize: '0.88rem' }}
                          />
                        )}
                        {item.send_push && (
                          <Chip
                            size="small"
                            icon={<NotificationsActiveIcon />}
                            label={st === 'sent' ? `Notificación a ${plural(item.pushes_sent ?? 0, 'móvil', 'móviles')}` : 'Al móvil'}
                            variant="outlined"
                            sx={{ fontSize: '0.88rem' }}
                          />
                        )}
                      </Stack>
                      {st === 'failed' && (
                        <Typography sx={{ mt: 0.75, color: 'error.main', fontSize: '0.92rem' }}>
                          Este aviso no llegó a salir. Pulsa «Reutilizar» para intentarlo otra vez y, si vuelve a fallar, avisa a soporte técnico.
                        </Typography>
                      )}
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0, '& .MuiButton-root': { minHeight: 44 } }}>
                      <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => handleDuplicate(item)}>
                        Reutilizar
                      </Button>
                      <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(item)}>
                        Borrar del historial
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>

          {filteredList.length > pageSize && (
            <Pagination
              count={Math.ceil(filteredList.length / pageSize) || 1}
              page={currentPage}
              onChange={(_, page) => setCurrentPage(page)}
              size="large"
              sx={{ mt: 2.5, display: 'flex', justifyContent: 'center' }}
            />
          )}
        </>
      )}

      {/* ── FORMULARIO ── */}
      <Dialog open={openDialog} onClose={closeForm} maxWidth="lg" fullWidth scroll="paper">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.3rem' }}>
          <CampaignIcon /> {copiedFrom ? `Aviso nuevo (copia de «${copiedFrom}»)` : 'Aviso nuevo a clientes'}
        </DialogTitle>
        <DialogContent dividers>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1.35fr 1fr' }} gap={3}>
            {/* Columna izquierda: formulario */}
            <Box>
              <FormStep n={1} title="¿Por dónde lo mandamos?" hint="Puedes marcar una o las dos.">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <ChannelCard
                    selected={formData.send_push}
                    onToggle={() => set('send_push', !formData.send_push)}
                    icon={<NotificationsActiveIcon />}
                    title="Notificación al móvil"
                    subtitle="Aparece al momento en la pantalla del teléfono"
                    reach={reachPush}
                  />
                  <ChannelCard
                    selected={formData.send_email}
                    onToggle={() => set('send_email', !formData.send_email)}
                    icon={<EmailIcon />}
                    title="Email"
                    subtitle="Llega a su bandeja de entrada"
                    reach={reachEmail}
                  />
                </Stack>
                {noChannel && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>Elige al menos una de las dos opciones.</Alert>
                )}
              </FormStep>

              <FormStep n={2} title="El mensaje">
                <Stack spacing={2.25}>
                  <TextField
                    fullWidth
                    required
                    label="Título"
                    placeholder="Ej.: Nuevas clases de Reformer los sábados"
                    value={formData.title}
                    onChange={(e) => set('title', e.target.value)}
                    error={Boolean(errFor('title'))}
                    helperText={errFor('title') || `Es lo primero que leen, en grande. Corto y claro. (${formData.title.length}/150)`}
                    inputProps={{ maxLength: 150 }}
                  />
                  <TextField
                    fullWidth
                    label="Frase destacada (opcional)"
                    placeholder="Ej.: ¡Reserva ya, quedan pocas plazas!"
                    value={formData.highlighted_text}
                    onChange={(e) => set('highlighted_text', e.target.value)}
                    helperText={formData.send_push
                      ? 'Es el texto de la notificación del móvil. Si la dejas vacía, se usa el principio del mensaje.'
                      : 'Aparece resaltada dentro del email.'}
                  />
                  <TextField
                    fullWidth
                    required
                    multiline
                    minRows={4}
                    label="Mensaje completo"
                    placeholder="Cuéntales todos los detalles: qué, cuándo, dónde…"
                    value={formData.description}
                    onChange={(e) => set('description', e.target.value)}
                    error={Boolean(errFor('description'))}
                    helperText={errFor('description') || 'Puedes escribir varios párrafos: los saltos de línea se respetan.'}
                  />
                </Stack>
              </FormStep>

              {(formData.send_email || formData.send_push) && (
                <FormStep n={3} title={formData.send_email && formData.send_push ? 'Últimos detalles' : formData.send_email ? 'El asunto del email' : '¿Qué se abre al tocarla?'}>
                  <Stack spacing={2.25}>
                    {formData.send_email && (
                      <TextField
                        fullWidth
                        required
                        label="Asunto del email"
                        placeholder="Ej.: Novedades en el estudio esta semana"
                        value={formData.subject}
                        onChange={(e) => set('subject', e.target.value)}
                        error={Boolean(errFor('subject'))}
                        helperText={errFor('subject') || 'Lo que ven en la bandeja de entrada antes de abrirlo.'}
                        inputProps={{ maxLength: 150 }}
                      />
                    )}
                    {formData.send_push && (
                      <SearchSelect
                        label="Al tocar la notificación, abrir…"
                        options={PUSH_DESTINATIONS}
                        value={formData.push_url}
                        onChange={(id) => set('push_url', (id as string) || '/')}
                        helperText="Elige a qué página de la web lleva la notificación. Ej.: el calendario, para que reserven."
                      />
                    )}
                  </Stack>
                </FormStep>
              )}
            </Box>

            {/* Columna derecha: vista previa en vivo */}
            <Stack spacing={2}>
              <Typography sx={{ fontWeight: 600, color: C.brown, fontSize: '1.05rem' }}>Vista previa</Typography>
              {noChannel && (
                <Typography color="text.secondary">Elige móvil o email para ver cómo quedará.</Typography>
              )}
              {formData.send_push && (
                <PushPreview
                  title={formData.title}
                  body={formData.highlighted_text || formData.description}
                />
              )}
              {formData.send_email && (
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>Asunto</Typography>
                  <Typography fontWeight={700} mb={1.5}>
                    {formData.subject || formData.title || 'Asunto del email'}
                  </Typography>
                  <Box sx={{ bgcolor: C.soft, borderRadius: 2, p: 2 }}>
                    <Typography sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: 20, color: C.brown, mb: 1 }}>
                      {formData.title || 'Título'}
                    </Typography>
                    <Typography sx={{ whiteSpace: 'pre-line', color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>
                      {formData.description || 'El mensaje completo aparecerá aquí.'}
                    </Typography>
                    {formData.highlighted_text && (
                      <Box sx={{ mt: 1.5, p: 1.2, borderLeft: `4px solid ${C.brand}`, bgcolor: 'rgb(var(--studio-surface-rgb))', borderRadius: 1 }}>
                        <Typography fontWeight={700} color={C.brandDark} sx={{ fontSize: '0.95rem' }}>
                          {formData.highlighted_text}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Paper>
              )}
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
          <Button variant="outlined" onClick={closeForm} disabled={sending} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={handleReview}
            endIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
            disabled={sending}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {sending ? 'Enviando…' : 'Revisar y enviar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
