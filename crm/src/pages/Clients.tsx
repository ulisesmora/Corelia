import { useState, useEffect, useMemo, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';
import {
  Box, Typography, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Pagination, TextField,
  Alert, Tab, Chip, Button, Stack, InputAdornment, Link, useMediaQuery, useTheme,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import ContactPageIcon from '@mui/icons-material/ContactPage';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';
import QuickClientCreate from '../components/QuickClientCreate';
import { SectionTabs, PageIntro, HelpTip, EmptyState, useConfirm, useNotify } from '../components/guide';

// Importa la URL base desde las variables de entorno
import { API_BASE_URL } from '../config';
import { isPlaceholderEmail } from '../site/email';
import { STUDIO_TZ as TZ } from '../site/timezone';

// ====================================================================
// 1. INTERFACES
// ====================================================================

interface Role {
  id: number;
  name: string;
}

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  role: Role | null;
  stripe_customer_id: string | null;
  city: string | null;
  experience_level: string | null;
  gender: string | null;
  goal_primary: string | null;
  source: string | null;
  consent: boolean;
  notes: string | null;
  date_joined: string;
  is_verified?: boolean | null;
}

interface GuestProfile {
  id: number;
  public_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  stripe_customer_id: string | null;
  // La API devuelve la ficha vinculada como objeto (antes se pintaba tal cual y rompía la página)
  linked_user: { id: number; email: string; first_name?: string } | number | null;
  claimed_at: string | null;
  created_at: string;
}

// ====================================================================
// 2. AYUDANTES
// ====================================================================

/** Minúsculas y sin tildes, para que "maria" encuentre a "María" */
const norm = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = (s?: string | null) => (s || '').replace(/\D/g, '');

function matches(q: string, fields: (string | null | undefined)[], phone?: string | null) {
  const nq = norm(q.trim());
  if (!nq) return true;
  if (fields.some((f) => norm(f).includes(nq))) return true;
  const dq = digits(q);
  return dq.length >= 3 && digits(phone).includes(dq);
}

const dayFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const birthFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const formatDay = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : dayFmt.format(d);
};
const formatBirth = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : birthFmt.format(d);
};

const isInternalEmail = (email?: string | null) => isPlaceholderEmail(email);
const fullName = (u: User) => `${u.first_name || ''} ${u.last_name || ''}`.trim();

const PAGE_SIZE = 10;

/** Dato secundario: "Nivel: Principiante" */
function Detail({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-strong)' }}>
      <Box component="span" sx={{ color: 'var(--studio-text-body)' }}>{label}:</Box> {value}
    </Typography>
  );
}

// ====================================================================
// 3. COMPONENTE PRINCIPAL
// ====================================================================

export default function CustomerViewer() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const notify = useNotify();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentTab, setCurrentTab] = useState(0);

  // --- Clientas con ficha ---
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // --- Invitadas ---
  const [guests, setGuests] = useState<GuestProfile[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(true);
  const [guestsError, setGuestsError] = useState('');
  const [guestCurrentPage, setGuestCurrentPage] = useState(1);

  // Un solo buscador para las dos pestañas
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('buscar') || '');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  // Enlaces directos desde Inicio: ?accion=nueva abre el alta; ?buscar=texto rellena el buscador
  useEffect(() => {
    const accion = searchParams.get('accion');
    const buscar = searchParams.get('buscar');
    if (buscar !== null) {
      setSearchTerm(buscar);
      setUserCurrentPage(1);
      setGuestCurrentPage(1);
    }
    if (accion === 'nueva') {
      setQuickCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('accion');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ====================================================================
  // 4. CARGA DE DATOS
  // ====================================================================

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/users/?is_superuser=false`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const data = await res.json();
      const list: User[] = Array.isArray(data) ? data : data.results || [];
      // Las más recientes primero: así la que acabas de dar de alta sale arriba
      list.sort((a, b) => (b.date_joined || '').localeCompare(a.date_joined || ''));
      setUsers(list);
    } catch (err) {
      setUsersError(await friendlyError(err));
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchGuests = async () => {
    setGuestsLoading(true);
    setGuestsError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/guests/`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const data = await res.json();
      const list: GuestProfile[] = Array.isArray(data) ? data : data.results || [];
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      setGuests(list);
    } catch (err) {
      setGuestsError(await friendlyError(err));
    } finally {
      setGuestsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchGuests();
  }, []);

  // El estudio confirma a mano el email de una clienta que conoce en persona
  const verifyEmail = async (user: User) => {
    const name = fullName(user) || 'esta clienta';
    const ok = await confirm({
      title: `¿Dar por bueno el email de ${name}?`,
      message: (
        <>
          <p style={{ marginTop: 0 }}>
            Email: <b>{user.email}</b>
          </p>
          <p>
            Hazlo solo si conoces a la clienta y sabes que ese email es suyo. Así podrá contratar una
            membresía por la web sin tener que meter el código que le enviamos.
          </p>
          <p style={{ marginBottom: 0 }}>A la clienta no le llega ningún aviso. Esto no se puede deshacer desde aquí.</p>
        </>
      ),
      confirmText: 'Sí, confirmar su email',
    });
    if (!ok) return;
    setVerifyingId(user.id);
    try {
      const res = await fetch(`${API_BASE_URL}v1/users/${user.id}/verify-email/`, {
        method: 'POST', headers: authHeaders(),
      });
      if (!res.ok) throw res;
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_verified: true } : u)));
      notify(`Email de ${name} confirmado ✓`);
    } catch (err) {
      notify(`No se ha podido confirmar el email. ${await friendlyError(err)}`, 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  // ====================================================================
  // 5. FILTRADO Y PAGINACIÓN
  // ====================================================================

  const filteredUsers = useMemo(
    () => users.filter((u) => matches(searchTerm, [fullName(u), u.first_name, u.last_name, isInternalEmail(u.email) ? '' : u.email, u.phone], u.phone)),
    [users, searchTerm],
  );
  const paginatedUsers = useMemo(() => {
    const start = (userCurrentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, userCurrentPage]);

  const filteredGuests = useMemo(
    () => guests.filter((g) => matches(searchTerm, [g.name, g.email, g.phone], g.phone)),
    [guests, searchTerm],
  );
  const paginatedGuests = useMemo(() => {
    const start = (guestCurrentPage - 1) * PAGE_SIZE;
    return filteredGuests.slice(start, start + PAGE_SIZE);
  }, [filteredGuests, guestCurrentPage]);

  const changeSearch = (value: string) => {
    setSearchTerm(value);
    setUserCurrentPage(1);
    setGuestCurrentPage(1);
    // Si venía de Inicio con ?buscar=, lo quitamos para que no pise lo que escribe
    if (searchParams.has('buscar')) {
      const next = new URLSearchParams(searchParams);
      next.delete('buscar');
      setSearchParams(next, { replace: true });
    }
  };

  const clearSearchButton = (
    <Button variant="outlined" onClick={() => changeSearch('')} sx={{ minHeight: 44 }}>
      Borrar la búsqueda
    </Button>
  );

  // ====================================================================
  // 6. PIEZAS DE LA PANTALLA
  // ====================================================================

  const rangeText = (page: number, total: number) => {
    if (total === 0) return '';
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    return `Mostrando ${from}–${to} de ${total}`;
  };

  const loadingBox = (text: string) => (
    <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
      <CircularProgress />
      <Typography sx={{ color: 'text.secondary' }}>{text}</Typography>
    </Stack>
  );

  const errorBox = (msg: string, retry: () => void) => (
    <Alert
      severity="error"
      sx={{ mb: 2, fontSize: '0.95rem', alignItems: 'center' }}
      action={
        <Button color="inherit" startIcon={<RefreshIcon />} onClick={retry} sx={{ minHeight: 44 }}>
          Reintentar
        </Button>
      }
    >
      No se han podido cargar los datos. {msg}
    </Alert>
  );

  const phoneLink = (phone: string | null) =>
    phone ? (
      <Link href={`tel:${phone.replace(/\s/g, '')}`} underline="hover" sx={{ fontSize: '0.95rem' }}>
        {phone}
      </Link>
    ) : (
      <Typography component="span" sx={{ fontSize: '0.9rem', color: 'var(--studio-text-body)' }}>Sin teléfono</Typography>
    );

  const emailBlock = (user: User) => {
    if (isInternalEmail(user.email)) {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-text-body)' }}>Sin email</Typography>
          <HelpTip title="Ficha sin email">
            Esta ficha se creó en el estudio sin email. El programa le puso una dirección interna
            ({user.email}) que no es real: nunca se le envían correos.
          </HelpTip>
        </Stack>
      );
    }
    return (
      <Box>
        <Typography sx={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{user.email}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
          {user.is_verified ? (
            <Chip size="small" color="success" variant="outlined" icon={<VerifiedIcon />} label="Email confirmado" />
          ) : (
            <>
              <Chip size="small" color="warning" variant="outlined" label="Email sin confirmar" />
              <HelpTip title="Email sin confirmar">
                Al registrarse le enviamos un código de 6 números a su email y todavía no lo ha escrito.
                Puede reservar clases igualmente, pero para contratar una membresía necesita el email
                confirmado. Si la conoces y sabes que el email es suyo, pulsa «Confirmar a mano».
              </HelpTip>
              <Button
                size="small"
                variant="outlined"
                onClick={() => verifyEmail(user)}
                disabled={verifyingId === user.id}
                sx={{ minHeight: 44 }}
              >
                {verifyingId === user.id ? 'Confirmando…' : 'Confirmar a mano'}
              </Button>
            </>
          )}
        </Stack>
      </Box>
    );
  };

  const creditsButton = (user: User) => (
    <Button
      variant="outlined"
      startIcon={<AccountBalanceWalletIcon />}
      onClick={() => navigate(`/credits?clienta=${user.id}`)}
      sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
    >
      Ver créditos
    </Button>
  );

  const extraDetails = (user: User) => (
    <>
      <Detail label="Nivel" value={user.experience_level} />
      <Detail label="Objetivo" value={user.goal_primary} />
      <Detail label="Nos conoció por" value={user.source} />
      <Detail label="Nacimiento" value={formatBirth(user.birth_date)} />
    </>
  );

  const searchHasOtherTab = (count: number, tab: number, label: string) =>
    searchTerm && count > 0 ? (
      <Button variant="contained" onClick={() => setCurrentTab(tab)} sx={{ minHeight: 44 }}>
        Ver {count} {label}
      </Button>
    ) : null;

  const renderUsersTab = () => {
    if (usersLoading) return loadingBox('Cargando clientas…');
    if (usersError) return errorBox(usersError, fetchUsers);

    if (filteredUsers.length === 0) {
      return searchTerm ? (
        <EmptyState
          title={`No hay ninguna clienta con ficha que coincida con «${searchTerm}»`}
          text={
            filteredGuests.length > 0
              ? 'Pero sí hay invitadas (reservaron sin crear cuenta) con ese dato.'
              : 'Revisa cómo está escrito o prueba solo con el nombre o el teléfono. Si es nueva, dale de alta.'
          }
          action={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              {searchHasOtherTab(filteredGuests.length, 1, filteredGuests.length === 1 ? 'invitada' : 'invitadas')}
              {clearSearchButton}
              <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setQuickCreateOpen(true)} sx={{ minHeight: 44 }}>
                Dar de alta a una clienta
              </Button>
            </Stack>
          }
        />
      ) : (
        <EmptyState
          title="Todavía no hay clientas"
          text="Cuando alguien se registre en la web o la des de alta tú, aparecerá aquí."
          action={
            <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setQuickCreateOpen(true)} sx={{ minHeight: 44 }}>
              Dar de alta a una clienta
            </Button>
          }
        />
      );
    }

    return (
      <>
        <Typography sx={{ mb: 1.5, color: 'text.secondary', fontSize: '0.95rem' }}>
          {rangeText(userCurrentPage, filteredUsers.length)}
          {searchTerm ? ` · buscando «${searchTerm}»` : ''}
        </Typography>

        {isMobile ? (
          <Stack spacing={1.5}>
            {paginatedUsers.map((user) => (
              <Paper key={user.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)' }}>
                  {fullName(user) || '(Sin nombre)'}
                </Typography>
                <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)', mb: 1 }}>
                  Ficha creada el {formatDay(user.date_joined)}
                </Typography>
                <Stack spacing={1}>
                  <Box>{phoneLink(user.phone)}</Box>
                  {emailBlock(user)}
                  {extraDetails(user)}
                  <Box sx={{ pt: 0.5 }}>{creditsButton(user)}</Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Clienta</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Otros datos</TableCell>
                  <TableCell align="right">Créditos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedUsers.map((user) => (
                  <TableRow key={user.id} hover sx={{ verticalAlign: 'top' }}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>{fullName(user) || '(Sin nombre)'}</Typography>
                      <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)' }}>
                        Ficha creada el {formatDay(user.date_joined)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{phoneLink(user.phone)}</TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>{emailBlock(user)}</TableCell>
                    <TableCell>{extraDetails(user)}</TableCell>
                    <TableCell align="right">{creditsButton(user)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {filteredUsers.length > PAGE_SIZE && (
          <Pagination
            count={Math.ceil(filteredUsers.length / PAGE_SIZE)}
            page={userCurrentPage}
            onChange={(_, page) => { setUserCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            size="large"
            sx={{ mt: 2.5, display: 'flex', justifyContent: 'center' }}
          />
        )}
      </>
    );
  };

  const guestAccount = (g: GuestProfile) => {
    const linked = g.linked_user && typeof g.linked_user === 'object' ? g.linked_user : null;
    if (g.claimed_at || g.linked_user) {
      return (
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label={
            linked?.email && !isInternalEmail(linked.email)
              ? `Ya tiene ficha (${linked.email})`
              : `Ya tiene ficha${g.claimed_at ? ` desde el ${formatDay(g.claimed_at)}` : ''}`
          }
          sx={{ maxWidth: '100%' }}
        />
      );
    }
    return <Chip size="small" label="Todavía sin ficha" />;
  };

  const renderGuestsTab = () => {
    if (guestsLoading) return loadingBox('Cargando invitadas…');
    if (guestsError) return errorBox(guestsError, fetchGuests);

    if (filteredGuests.length === 0) {
      return searchTerm ? (
        <EmptyState
          title={`No hay ninguna invitada que coincida con «${searchTerm}»`}
          text={filteredUsers.length > 0 ? 'Pero sí hay clientas con ficha con ese dato.' : 'Revisa cómo está escrito o prueba solo con el nombre o el teléfono.'}
          action={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              {searchHasOtherTab(filteredUsers.length, 0, filteredUsers.length === 1 ? 'clienta' : 'clientas')}
              {clearSearchButton}
            </Stack>
          }
        />
      ) : (
        <EmptyState
          title="No hay invitadas"
          text="Aquí aparecerán las personas que reserven y paguen en la web sin crear una cuenta."
        />
      );
    }

    return (
      <>
        <Typography sx={{ mb: 1.5, color: 'text.secondary', fontSize: '0.95rem' }}>
          {rangeText(guestCurrentPage, filteredGuests.length)}
          {searchTerm ? ` · buscando «${searchTerm}»` : ''}
        </Typography>

        {isMobile ? (
          <Stack spacing={1.5}>
            {paginatedGuests.map((g) => (
              <Paper key={g.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--studio-dark)' }}>{g.name || '(Sin nombre)'}</Typography>
                <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)', mb: 1 }}>
                  Primera reserva el {formatDay(g.created_at)}
                </Typography>
                <Stack spacing={1}>
                  <Box>{phoneLink(g.phone)}</Box>
                  <Typography sx={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>{g.email || 'Sin email'}</Typography>
                  <Detail label="Nacimiento" value={formatBirth(g.birth_date)} />
                  <Box>{guestAccount(g)}</Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Invitada</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Nacimiento</TableCell>
                  <TableCell>¿Ya tiene ficha?</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedGuests.map((g) => (
                  <TableRow key={g.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)' }}>{g.name || '(Sin nombre)'}</Typography>
                      <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)' }}>
                        Primera reserva el {formatDay(g.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{phoneLink(g.phone)}</TableCell>
                    <TableCell sx={{ wordBreak: 'break-all' }}>{g.email || 'Sin email'}</TableCell>
                    <TableCell>{formatBirth(g.birth_date) || '—'}</TableCell>
                    <TableCell>{guestAccount(g)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {filteredGuests.length > PAGE_SIZE && (
          <Pagination
            count={Math.ceil(filteredGuests.length / PAGE_SIZE)}
            page={guestCurrentPage}
            onChange={(_, page) => { setGuestCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            size="large"
            sx={{ mt: 2.5, display: 'flex', justifyContent: 'center' }}
          />
        )}
      </>
    );
  };

  // ====================================================================
  // 7. RENDER PRINCIPAL
  // ====================================================================

  return (
    <Box>
      <PageIntro
        pageKey="clients"
        title="Clientas"
        subtitle="Todas las personas que vienen al estudio: las que tienen ficha y las invitadas que reservaron por la web sin crear cuenta."
        actions={
          <Button variant="contained" size="large" startIcon={<PersonAddIcon />} onClick={() => setQuickCreateOpen(true)}>
            Dar de alta a una clienta
          </Button>
        }
        steps={[
          { title: 'Busca a la clienta', text: 'Escribe su nombre, su teléfono o su email en el buscador. No hace falta poner tildes.' },
          { title: 'Mira sus datos', text: 'Verás su teléfono (púlsalo para llamarla desde el móvil) y si ya confirmó su email.' },
          { title: '¿Necesita clases?', text: 'Pulsa «Ver créditos» en su fila para ver cuántas le quedan y añadirle más.' },
          { title: '¿Es nueva?', text: 'Pulsa «Dar de alta a una clienta». Si quieres, en la misma ventana la apuntas a una clase.' },
        ]}
        tips={[
          <>Las <b>invitadas</b> están en la segunda pestaña: reservaron y pagaron con tarjeta en la web sin crear una cuenta.</>,
        ]}
      />

      <TextField
        fullWidth
        label="Buscar clienta"
        placeholder="Nombre, teléfono o email"
        helperText="Ej.: Marta, García o 612 345 678. Busca a la vez en las dos pestañas."
        value={searchTerm}
        onChange={(e) => changeSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <Button size="small" onClick={() => changeSearch('')} sx={{ minHeight: 40 }}>Borrar</Button>
              </InputAdornment>
            ) : undefined,
          },
        }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <SectionTabs
          value={currentTab}
          onChange={(_, v: number) => setCurrentTab(v)}
          aria-label="Tipo de clienta"
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab
            label={`Clientas con ficha${usersLoading ? '' : ` (${filteredUsers.length})`}`}
            icon={<PeopleIcon />}
            iconPosition="start"
            id="tab-0"
            sx={{ minHeight: 52 }}
          />
          <Tab
            label={`Invitadas (sin cuenta)${guestsLoading ? '' : ` (${filteredGuests.length})`}`}
            icon={<ContactPageIcon />}
            iconPosition="start"
            id="tab-1"
            sx={{ minHeight: 52 }}
          />
        </SectionTabs>
      </Box>

      {currentTab === 1 && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-text-strong)' }}>
            Personas que reservaron por la web sin crear cuenta.
          </Typography>
          <HelpTip title="¿Qué es una invitada?">
            Alguien que reservó una clase en la web y la pagó con tarjeta, pero sin crearse una cuenta.
            No tiene créditos. Si más tarde se crea una cuenta con el mismo email, verás «Ya tiene ficha».
          </HelpTip>
        </Stack>
      )}

      <Box role="tabpanel" aria-labelledby={`tab-${currentTab}`}>
        {currentTab === 0 ? renderUsersTab() : renderGuestsTab()}
      </Box>

      <QuickClientCreate
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(name) => {
          fetchUsers();
          setCurrentTab(0);
          if (name) changeSearch(name);
        }}
      />
    </Box>
  );
}
