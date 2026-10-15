import { useState, useEffect } from 'react';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  Stack,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, useConfirm, useNotify } from '../components/guide';

interface Admin {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role: { id: number; name: string } | null;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
}

import { API_BASE_URL } from '../config';
import { STUDIO_TZ as TZ } from '../site/timezone';

const MIN_PASSWORD = 8;
const dayFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

/** id del usuario con la sesión abierta (va dentro del token) */
function currentUserId(): number | null {
  try {
    const raw = localStorage.getItem('user');
    const token: string = raw ? JSON.parse(raw).access : '';
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.user_id != null ? Number(payload.user_id) : null;
  } catch {
    return null;
  }
}

const adminName = (a: Admin) => `${a.first_name || ''} ${a.last_name || ''}`.trim();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** El alta devuelve los errores dentro de "user_errors" */
async function signupError(res: Response): Promise<string> {
  try {
    const body = await res.clone().json();
    if (body?.user_errors) {
      return friendlyError(new Response(JSON.stringify(body.user_errors), { status: 400 }));
    }
  } catch { /* sin JSON */ }
  return friendlyError(res);
}

export default function Admins() {
  const confirm = useConfirm();
  const notify = useNotify();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const myId = currentUserId();

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Formulario de alta
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Paginación y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchAdmins = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}v1/users/?is_superuser=true`, { headers: authHeaders() });
      if (!response.ok) throw response;
      const data = await response.json();
      setAdmins(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(await friendlyError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const emailError = !form.email.trim()
    ? 'Escribe su email.'
    : !validEmail(form.email) ? 'El email no parece correcto: revisa la @ y el punto (ej.: laura@gmail.com).' : '';
  const passwordError = form.password.length < MIN_PASSWORD
    ? `La contraseña necesita al menos ${MIN_PASSWORD} letras o números.`
    : '';

  const handleCreate = async () => {
    setTouched({ email: true, password: true });
    if (emailError || passwordError) return;
    setSaving(true);
    setFormError('');
    const email = form.email.trim();
    try {
      // El alta de administradores crea el usuario ya con acceso completo al CRM
      const response = await fetch(`${API_BASE_URL}signup/`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email,
          // Sin username el alta fallaba siempre (campo obligatorio del modelo) y el error no se veía
          username: email,
          password: form.password,
          first_name: form.name.trim(),
        }),
      });
      if (!response.ok) throw new Error(await signupError(response));

      await fetchAdmins();
      setOpenDialog(false);
      notify(`${form.name.trim() || email} ya puede entrar en el CRM con su email y la contraseña que has escrito ✓`);
    } catch (err) {
      setFormError(await friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (admin: Admin) => {
    const who = adminName(admin) || admin.email;
    const ok = await confirm({
      title: `¿Quitar el acceso a ${who}?`,
      message: (
        <>
          <p style={{ marginTop: 0 }}>
            <b>{admin.email}</b> ya no podrá entrar en este programa.
          </p>
          <p>
            Su usuario se borra para siempre y no se puede deshacer. Si más adelante vuelve a necesitar acceso,
            tendrás que crearlo de nuevo con «Añadir administrador».
          </p>
          <p style={{ marginBottom: 0 }}>Las clientas, las clases y las reservas no se tocan.</p>
        </>
      ),
      confirmText: 'Sí, quitarle el acceso',
      tone: 'danger',
    });
    if (!ok) return;

    setDeletingId(admin.id);
    try {
      const response = await fetch(`${API_BASE_URL}v1/users/${admin.id}/`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) throw response;
      await fetchAdmins();
      notify(`${who} ya no tiene acceso al CRM ✓`);
    } catch (err) {
      notify(`No se ha podido quitar el acceso. ${await friendlyError(err)}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenCreate = () => {
    setForm({ name: '', email: '', password: '' });
    setTouched({ email: false, password: false });
    setShowPassword(false);
    setFormError('');
    setOpenDialog(true);
  };

  // Filtrado y paginación
  const q = searchTerm.trim().toLowerCase();
  const filteredAdmins = admins.filter((admin) =>
    !q || admin.email.toLowerCase().includes(q) || adminName(admin).toLowerCase().includes(q),
  );
  const paginatedAdmins = filteredAdmins.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const deleteBlockReason = (admin: Admin) => {
    if (admin.id === myId) return 'Eres tú: no puedes quitarte el acceso a ti misma.';
    if (admins.length <= 1) return 'Es la única persona con acceso: si la borras nadie podrá entrar.';
    return '';
  };

  const statusChip = (admin: Admin) =>
    admin.is_active
      ? <Chip size="small" color="success" variant="outlined" label="Puede entrar" />
      : <Chip size="small" color="warning" variant="outlined" label="Desactivado" />;

  const deleteButton = (admin: Admin) => {
    const reason = deleteBlockReason(admin);
    return (
      <Box>
        <Button
          variant="outlined"
          color="error"
          startIcon={deletingId === admin.id ? <CircularProgress size={16} color="inherit" /> : <PersonRemoveIcon />}
          onClick={() => handleDelete(admin)}
          disabled={Boolean(reason) || deletingId === admin.id}
          sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
        >
          {deletingId === admin.id ? 'Quitando…' : 'Quitar acceso'}
        </Button>
        {reason && (
          <Typography sx={{ fontSize: '0.85rem', color: 'var(--studio-text-body)', mt: 0.5, maxWidth: 240 }}>{reason}</Typography>
        )}
      </Box>
    );
  };

  const nameBlock = (admin: Admin) => (
    <>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', wordBreak: 'break-all' }}>
          {adminName(admin) || admin.email}
        </Typography>
        {admin.id === myId && <Chip size="small" color="primary" label="Tú" />}
      </Stack>
      {adminName(admin) && (
        <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-text-strong)', wordBreak: 'break-all' }}>{admin.email}</Typography>
      )}
    </>
  );

  const renderList = () => {
    if (isLoading) {
      return (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>Cargando administradores…</Typography>
        </Stack>
      );
    }
    if (error) {
      return (
        <Alert
          severity="error"
          sx={{ alignItems: 'center' }}
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchAdmins} sx={{ minHeight: 44 }}>
              Reintentar
            </Button>
          }
        >
          No se ha podido cargar la lista. {error}
        </Alert>
      );
    }
    if (filteredAdmins.length === 0) {
      return q ? (
        <EmptyState
          title={`Nadie coincide con «${searchTerm}»`}
          text="Revisa cómo está escrito el email o el nombre."
          action={<Button variant="outlined" onClick={() => setSearchTerm('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
        />
      ) : (
        <EmptyState
          title="No hay administradores"
          text="Añade a la primera persona que podrá entrar en el CRM."
          action={<Button variant="contained" startIcon={<PersonAddIcon />} onClick={handleOpenCreate} sx={{ minHeight: 44 }}>Añadir administrador</Button>}
        />
      );
    }

    return (
      <>
        {isMobile ? (
          <Stack spacing={1.5}>
            {paginatedAdmins.map((admin) => (
              <Paper key={admin.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                {nameBlock(admin)}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 1 }}>
                  {statusChip(admin)}
                  <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-text-body)' }}>
                    Desde el {dayFmt.format(new Date(admin.date_joined))}
                  </Typography>
                </Stack>
                {deleteButton(admin)}
              </Paper>
            ))}
          </Stack>
        ) : (
          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Persona</TableCell>
                  <TableCell>¿Puede entrar?</TableCell>
                  <TableCell>Tiene acceso desde</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedAdmins.map((admin) => (
                  <TableRow key={admin.id} sx={{ verticalAlign: 'top' }}>
                    <TableCell>{nameBlock(admin)}</TableCell>
                    <TableCell>{statusChip(admin)}</TableCell>
                    <TableCell>{dayFmt.format(new Date(admin.date_joined))}</TableCell>
                    <TableCell align="right">{deleteButton(admin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {filteredAdmins.length > pageSize && (
          <Pagination
            count={Math.ceil(filteredAdmins.length / pageSize)}
            page={currentPage}
            onChange={(_, page) => setCurrentPage(page)}
            sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}
          />
        )}
      </>
    );
  };

  const loginUrl = `${window.location.origin}/login`;

  return (
    <Box>
      <PageIntro
        pageKey="admins"
        title="Administradores"
        subtitle="Quién puede entrar en este panel."
        actions={
          <Button variant="contained" size="large" startIcon={<PersonAddIcon />} onClick={handleOpenCreate}>
            Añadir administrador
          </Button>
        }
      />

      <TextField
        fullWidth
        data-tour="search" label="Buscar"
        placeholder="Email o nombre"
        value={searchTerm}
        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
        sx={{ mb: 3 }}
      />

      {renderList()}

      {/* Ventana de alta */}
      <Dialog open={openDialog} onClose={() => !saving && setOpenDialog(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.35rem' }}>
          Añadir administrador
          <Typography sx={{ fontSize: '0.95rem', color: 'text.secondary', mt: 0.5 }}>
            Esta persona podrá entrar en el CRM con el email y la contraseña que escribas aquí.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
            <Alert severity="warning" sx={{ mb: 2.5, fontSize: '0.92rem' }}>
              Tendrá acceso completo: podrá ver los datos de todas las clientas y cambiar créditos, pagos y horario.
            </Alert>
            <Stack spacing={2.5}>
              <TextField
                label="Nombre (opcional)"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                helperText="Ej.: Laura. Solo sirve para reconocerla en esta lista."
                fullWidth
                autoFocus
                slotProps={{ htmlInput: { maxLength: 150 } }}
              />
              <TextField
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={touched.email && Boolean(emailError)}
                helperText={(touched.email && emailError) || 'Ej.: laura@gmail.com. Con este email entrará.'}
                fullWidth
                autoComplete="off"
              />
              <TextField
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                required
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={touched.password && Boolean(passwordError)}
                helperText={(touched.password && passwordError) || `Mínimo ${MIN_PASSWORD} letras o números. Apúntala: tendrás que dársela.`}
                fullWidth
                autoComplete="new-password"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button
                          size="small"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-pressed={showPassword}
                          sx={{ minHeight: 40 }}
                        >
                          {showPassword ? 'Ocultar' : 'Mostrar'}
                        </Button>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-text-strong)' }}>
                  ¿Dónde entra? En <b>{loginUrl}</b>
                </Typography>
                <HelpTip title="¿Cómo entra la nueva persona?">
                  Abre esa dirección en el navegador (ordenador o móvil), escribe su email y la contraseña que has
                  puesto aquí y pulsa «Entrar». Si la olvida, puede pulsar «¿Has olvidado tu contraseña?» en esa misma pantalla.
                </HelpTip>
              </Stack>
            </Stack>
            {formError && (
              <Alert severity="error" sx={{ mt: 2.5, fontSize: '0.95rem' }} role="alert">
                No se ha podido crear. {formError}
              </Alert>
            )}
            <button type="submit" hidden />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
          <Button variant="outlined" onClick={() => setOpenDialog(false)} disabled={saving} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PersonAddIcon />}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {saving ? 'Creando…' : 'Crear administrador'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
