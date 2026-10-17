import { forwardRef, useImperativeHandle, useState, useEffect, useMemo } from 'react';
import type { CatalogHandle, EmbedProps } from './catalogo/embed';
import {
  Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Pagination, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { PhotoPicker } from '../components/guide';
import { EnglishChip, EnglishField, EnglishVersion } from '../components/guide/EnglishVersion';
import { API_BASE_URL } from '../config';
import { useActionParam } from '../onboarding';

interface Room {
  id: number;
  name: string;
  title: string | null;
  description: string | null;
  capacity: number;
  location: string | null;
  image: string | null;
  title_en?: string;
  description_en?: string;
}

// --- Clases del horario que usan una sala (para avisar antes de borrar) ---
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

interface ScheduleLite {
  weekday: number | null;
  start_time: string;
  end_date: string | null;
  is_active: boolean;
  class_type?: { title?: string } | null;
}

async function activeSchedules(query: string): Promise<ScheduleLite[]> {
  const res = await fetch(`${API_BASE_URL}v1/recurrences/?is_active=true${query}`);
  if (!res.ok) throw res;
  const d = await res.json();
  const list: ScheduleLite[] = Array.isArray(d) ? d : d.results || [];
  const today = new Date().toISOString().slice(0, 10);
  return list.filter((s) => s.is_active && (!s.end_date || s.end_date >= today));
}

const describeSchedule = (s: ScheduleLite) =>
  `${s.class_type?.title || 'Clase'} · ${s.weekday != null ? WEEKDAYS[s.weekday] : 'día suelto'} a las ${s.start_time?.slice(0, 5)}`;

/** Pantalla completa; `embedded`: solo sus ventanas, para «Clases y precios» (./catalogo/embed.ts). */
const RoomsManagement = forwardRef<CatalogHandle, EmbedProps>(function RoomsManagement({ embedded = false, onChanged }, ref) {
  const confirm = useConfirm();
  const notify = useNotify();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Partial<Room> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const pageSize = 12;

  const fetchRooms = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/rooms/`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const d = await res.json();
      setRooms(Array.isArray(d) ? d : d.results || []);
    } catch (e) {
      setLoadError(await friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, []);

  const openCreate = () => {
    setCurrentRoom({ name: '', title: '', description: '', location: '', image: '', title_en: '', description_en: '' });
    setTriedSave(false);
    setShowMore(false);
    setOpenDialog(true);
  };

  const openEdit = (r: Room) => {
    setCurrentRoom(r);
    setTriedSave(false);
    setShowMore(Boolean(r.title));
    setOpenDialog(true);
  };

  const closeDialog = () => {
    if (saving || uploading) return;
    setOpenDialog(false);
    setCurrentRoom(null);
  };

  const nameError = triedSave && !currentRoom?.name?.trim();
  const capacityError = triedSave && !(Number(currentRoom?.capacity) >= 1);

  const handleSave = async () => {
    if (!currentRoom) return;
    setTriedSave(true);
    if (!currentRoom.name?.trim() || !(Number(currentRoom.capacity) >= 1)) return;

    const method = currentRoom.id ? 'PATCH' : 'POST';
    const url = currentRoom.id ? `${API_BASE_URL}v1/rooms/${currentRoom.id}/` : `${API_BASE_URL}v1/rooms/`;
    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: currentRoom.name.trim(),
          title: currentRoom.title || '',
          description: currentRoom.description || '',
          capacity: Number(currentRoom.capacity),
          location: currentRoom.location || '',
          image: currentRoom.image || '',
          title_en: currentRoom.title_en || '',
          description_en: currentRoom.description_en || '',
        }),
      });
      if (!res.ok) throw res;
      notify(currentRoom.id
        ? 'Sala guardada ✓ Puede tardar unos 10 minutos en verse cambiada en la web.'
        : 'Sala creada ✓ Ya puedes elegirla al poner clases en el horario.');
      setOpenDialog(false);
      setCurrentRoom(null);
      fetchRooms();
      onChanged?.();
    } catch (e) {
      const msg = await friendlyError(e);
      notify(/ya existe/.test(msg)
        ? 'Ya hay una sala con ese nombre (puede que sea una que se borró). Ponle un nombre algo distinto.'
        : msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (room: Room) => {
    let usage: ScheduleLite[] | null = null;
    try { usage = await activeSchedules(`&room=${room.id}`); } catch { usage = null; }

    const ok = await confirm({
      title: `¿Borrar la sala «${room.name}»?`,
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>
            Dejará de aparecer en «Nuestras salas» de la portada y ya no podrás elegirla al poner clases nuevas en el horario.
          </p>
          {usage && usage.length > 0 && (
            <Box sx={{ my: 1.5, p: 1.5, borderRadius: 2, backgroundColor: 'rgba(212,165,116,0.14)' }}>
              <strong>Ojo: hay {usage.length} {usage.length === 1 ? 'clase' : 'clases'} en el horario en esta sala:</strong>
              <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>
                {usage.slice(0, 5).map((s, i) => <li key={i}>{describeSchedule(s)}</li>)}
                {usage.length > 5 && <li>y {usage.length - 5} más</li>}
              </ul>
              Esas clases <strong>no se borran</strong>: seguirán en el horario con esta sala. Si quieres cambiarlas de sala,
              hazlo antes en «Calendario».
            </Box>
          )}
          {usage === null && (
            <p style={{ margin: '0 0 8px' }}>
              No hemos podido comprobar si hay clases en el horario en esta sala. Si las hay, seguirán apareciendo con ella.
            </p>
          )}
          <p style={{ margin: 0 }}>Las reservas que ya existen no se tocan. Si te equivocas, tu técnico puede recuperarla.</p>
        </>
      ),
      confirmText: usage && usage.length > 0 ? 'Sí, borrar igualmente' : 'Sí, borrar la sala',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}v1/rooms/${room.id}/`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw res;
      notify(`Sala «${room.name}» borrada ✓`);
      fetchRooms();
      onChanged?.();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) =>
      !q || r.name.toLowerCase().includes(q) || r.title?.toLowerCase().includes(q) || r.location?.toLowerCase().includes(q));
  }, [rooms, search]);

  const paginated = useMemo(() => { const s = (page - 1) * pageSize; return filtered.slice(s, s + pageSize); }, [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Enlaces directos desde la guía de puesta en marcha (?accion=nueva)
  useActionParam('nueva', openCreate);

  useImperativeHandle(ref, () => ({ create: openCreate, edit: (r) => openEdit(r as Room), remove: (r) => handleDelete(r as Room) }));

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      {!embedded && (<>
      <PageIntro
        pageKey="rooms"
        title="Salas"
        subtitle="Dónde se dan las clases. Salen en tu web."
        actions={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Añadir una sala
          </Button>
        )}
      />

      <TextField
        data-tour="search" label="Buscar una sala"
        placeholder="Nombre o ubicación…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        fullWidth
        sx={{ mb: 3 }}
      />

      {loading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>Cargando las salas…</Typography>
        </Stack>
      ) : loadError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchRooms} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se han podido cargar las salas. {loadError}
        </Alert>
      ) : rooms.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
          <EmptyState
            icon={<MeetingRoomOutlinedIcon />}
            title="Todavía no hay salas"
            text="Añade al menos una: la necesitas para poner clases en el horario."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ minHeight: 48 }}>Añadir la primera sala</Button>}
          />
        </Paper>
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="No hay ninguna sala con esa palabra"
          text="Prueba con otra palabra o borra la búsqueda."
          action={<Button variant="outlined" onClick={() => setSearch('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
        />
      ) : (
        <>
          <Box data-tour="list" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            {paginated.map((r) => (
              <Paper
                key={r.id}
                elevation={0}
                sx={{ borderRadius: 4, overflow: 'hidden', border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)', display: 'flex', flexDirection: 'column' }}
              >
                <Box sx={{ aspectRatio: '16 / 10', backgroundColor: 'rgb(var(--studio-bg-rgb) / 0.8)', display: 'grid', placeItems: 'center' }}>
                  {r.image ? (
                    <Box component="img" src={r.image} alt={r.title || r.name} loading="lazy"
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <Stack alignItems="center" spacing={0.5} sx={{ color: 'var(--studio-primary-shade)' }}>
                      <MeetingRoomOutlinedIcon aria-hidden sx={{ fontSize: 40 }} />
                      <Typography sx={{ fontSize: '0.9rem' }}>Sin foto</Typography>
                    </Stack>
                  )}
                </Box>
                <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: '1.08rem' }}>{r.name}</Typography>
                  {r.title && r.title !== r.name && (
                    <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.92rem' }}>En la web: «{r.title}»</Typography>
                  )}
                  <Box sx={{ '&:empty': { display: 'none' } }}>
                    <EnglishChip pairs={[[r.title || r.name, r.title_en], [r.description, r.description_en]]} />
                  </Box>
                  <Stack direction="row" spacing={2} sx={{ color: 'var(--studio-text-strong)', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <PeopleOutlineIcon aria-hidden fontSize="small" />
                      <Typography sx={{ fontSize: '0.92rem' }}>{r.capacity} personas</Typography>
                    </Stack>
                    {r.location && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PlaceOutlinedIcon aria-hidden fontSize="small" />
                        <Typography sx={{ fontSize: '0.92rem' }}>{r.location}</Typography>
                      </Stack>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 'auto', pt: 1.5 }}>
                    <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(r)} sx={{ minHeight: 44, flex: 1 }}>
                      Editar
                    </Button>
                    <Button variant="text" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(r)} sx={{ minHeight: 44 }}>
                      Borrar
                    </Button>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Box>
          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={3}>
              <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} size="large" />
            </Box>
          )}
        </>
      )}

      </>)}

      <Dialog open={openDialog} onClose={closeDialog} maxWidth="md" fullWidth scroll="body">
        <DialogTitle>{currentRoom?.id ? `Editar la sala «${currentRoom.name}»` : 'Añadir una sala'}</DialogTitle>
        <DialogContent>
          {currentRoom && (
            <>
              <FormStep n={1} title="¿Cómo se llama y cuántas personas caben?">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Nombre de la sala"
                    value={currentRoom.name || ''}
                    onChange={(e) => setCurrentRoom({ ...currentRoom, name: e.target.value })}
                    fullWidth
                    required
                    inputProps={{ maxLength: 120 }}
                    error={nameError}
                    helperText={nameError
                      ? 'Escribe el nombre de la sala.'
                      : 'Ej.: «Sala Reformer». Lo ven tus clientes en el horario y en sus reservas.'}
                  />
                  <TextField
                    label="Personas que caben"
                    type="number"
                    value={currentRoom.capacity ?? ''}
                    onChange={(e) => setCurrentRoom({
                      ...currentRoom,
                      capacity: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                    })}
                    inputProps={{ min: 1 }}
                    required
                    error={capacityError}
                    helperText={capacityError ? 'Pon un número, como mínimo 1.' : 'Sale en la web como «10 personas».'}
                    sx={{ width: { xs: '100%', sm: 240 }, flexShrink: 0 }}
                  />
                </Stack>
              </FormStep>

              <FormStep n={2} title="La foto de la sala" hint="Sale de fondo en la tarjeta de la sala, en la portada de la web.">
                <PhotoPicker
                  value={currentRoom.image || ''}
                  onChange={(url) => setCurrentRoom((c) => (c ? { ...c, image: url } : c))}
                  onBusyChange={setUploading}
                  aspect="4 / 5"
                  previewWidth={240}
                  allowRemove
                  shapeHint="Mejor una foto vertical (más alta que ancha) con lo importante en el centro: la web recorta los lados."
                />
              </FormStep>

              <FormStep n={3} title="Lo que se cuenta en la web (si quieres)">
                <Stack spacing={2}>
                  <TextField
                    label="Descripción"
                    value={currentRoom.description || ''}
                    onChange={(e) => setCurrentRoom({ ...currentRoom, description: e.target.value })}
                    fullWidth
                    multiline
                    minRows={3}
                    helperText="Unas frases sobre la sala. Salen en su tarjeta, en la portada. Ej.: «Luminosa, con vistas al jardín y 8 máquinas Reformer»."
                  />
                  <TextField
                    label="Dónde está"
                    value={currentRoom.location || ''}
                    onChange={(e) => setCurrentRoom({ ...currentRoom, location: e.target.value })}
                    fullWidth
                    inputProps={{ maxLength: 200 }}
                    helperText="Ej.: «Planta baja» o «Dentro del domo». Sale en la tarjeta de la web."
                  />
                </Stack>
              </FormStep>

              <EnglishVersion
                pairs={[
                  [currentRoom.title || currentRoom.name, currentRoom.title_en],
                  [currentRoom.description, currentRoom.description_en],
                ]}
              >
                <EnglishField
                  label="Nombre de la sala en inglés"
                  es={currentRoom.title || currentRoom.name}
                  value={currentRoom.title_en}
                  onChange={(v) => setCurrentRoom({ ...currentRoom, title_en: v })}
                  maxLength={200}
                />
                <EnglishField
                  label="Descripción en inglés"
                  es={currentRoom.description}
                  value={currentRoom.description_en}
                  onChange={(v) => setCurrentRoom({ ...currentRoom, description_en: v })}
                  multiline
                />
              </EnglishVersion>

              <Button
                variant="text"
                onClick={() => setShowMore((s) => !s)}
                sx={{ minHeight: 44 }}
              >
                {showMore ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas (nombre distinto en la web)'}
              </Button>
              <Collapse in={showMore}>
                <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 1.5 }}>
                  <TextField
                    label="Nombre para la web (opcional)"
                    value={currentRoom.title || ''}
                    onChange={(e) => setCurrentRoom({ ...currentRoom, title: e.target.value })}
                    fullWidth
                    inputProps={{ maxLength: 200 }}
                    helperText={`Si lo rellenas, la tarjeta de la web muestra este nombre en vez del de arriba. Ej.: «El Domo». ${(currentRoom.title || '').length}/200`}
                  />
                  <HelpTip title="¿Para qué sirve?">
                    El «Nombre de la sala» es el que se usa en el horario y en las reservas. Si en la web quieres
                    un nombre más bonito o largo, ponlo aquí. Si lo dejas vacío, la web usa el nombre normal.
                  </HelpTip>
                </Stack>
              </Collapse>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={closeDialog} disabled={saving || uploading} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || uploading} sx={{ minHeight: 48, ml: '0 !important' }}>
            {uploading ? 'Esperando a la foto…' : saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default RoomsManagement;
