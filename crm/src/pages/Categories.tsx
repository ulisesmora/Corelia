import { useState, useEffect, useMemo } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { EnglishChip, EnglishField, EnglishVersion } from '../components/guide/EnglishVersion';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { useTheme } from '@mui/material/styles';
import { API_BASE_URL } from '../config';

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  name_en?: string;
  description_en?: string;
}

interface ClassTypeLite {
  id: number;
  title: string;
  category: { id: number } | null;
}

// La web pública pide las clases por el número de categoría (fijo en su código):
// 2 = Pilates, 1 = Yoga, 3 = Mindfulness (portada y página «Clases»), 4 = Eventos (página «Clases»).
const WEB_PLACES: Record<number, string> = {
  2: 'sus clases salen en la pestaña «Pilates» de la portada y de la página «Clases»',
  1: 'sus clases salen en la pestaña «Yoga» de la portada y de la página «Clases»',
  3: 'sus clases salen en la pestaña «Mindfulness» de la portada y de la página «Clases»',
  4: 'sus clases salen en el apartado de eventos de la página «Clases»',
};
// Solo en la portada se leen el nombre y la descripción de la categoría (4 no sale en la portada)
const TEXTS_ON_HOME = [1, 2, 3];

const slugify = (text: string) =>
  text.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');

const isHex = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

export default function CategoriesManagement() {
  const theme = useTheme();
  const confirm = useConfirm();
  const notify = useNotify();
  const [categories, setCategories] = useState<Category[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [current, setCurrent] = useState<Partial<Category> | null>(null);
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [res, ctRes] = await Promise.all([
        fetch(`${API_BASE_URL}v1/categories/`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}v1/class-types/`),
      ]);
      if (!res.ok) throw res;
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : data.results || []);
      if (ctRes.ok) {
        const ct = await ctRes.json();
        setClassTypes(Array.isArray(ct) ? ct : ct.results || []);
      }
    } catch (e) {
      setLoadError(await friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const classesOf = (id: number) => classTypes.filter((c) => c.category?.id === id);

  const openCreate = () => {
    setCurrent({ name: '', description: '', color: '', name_en: '', description_en: '' });
    setTriedSave(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const openEdit = (c: Category) => {
    setCurrent(c);
    setTriedSave(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setOpenDialog(false);
    setCurrent(null);
  };

  const colorError = Boolean(current?.color) && !isHex(current?.color || '');
  const nameError = triedSave && !current?.name?.trim();

  const handleSave = async () => {
    if (!current) return;
    setTriedSave(true);
    if (!current.name?.trim() || colorError) return;

    // La dirección interna se crea sola a partir del nombre (solo al crear:
    // al editar se conserva la que ya tenía).
    const body: Partial<Category> = { ...current, name: current.name.trim() };
    if (!body.slug) body.slug = slugify(body.name || '') || `categoria-${Date.now()}`;

    const method = current.id ? 'PATCH' : 'POST';
    const url = current.id ? `${API_BASE_URL}v1/categories/${current.id}/` : `${API_BASE_URL}v1/categories/`;
    setSaving(true);
    try {
      let res = await fetch(url, {
        method, headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
      });
      // Si la dirección interna ya existe (p. ej. de una categoría borrada), se prueba otra
      if (!res.ok && !current.id && res.status === 400) {
        const err = await res.clone().json().catch(() => ({}));
        if (err?.slug && !err?.name) {
          body.slug = `${body.slug}-${Date.now().toString().slice(-4)}`;
          res = await fetch(url, {
            method, headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
          });
        }
      }
      if (!res.ok) throw res;
      notify(current.id
        ? 'Categoría guardada ✓ Puede tardar unos minutos en verse cambiada en la web.'
        : 'Categoría creada ✓ Ya puedes elegirla en «Tipos de clase».');
      setOpenDialog(false);
      setCurrent(null);
      await fetchData();
    } catch (e) {
      const msg = await friendlyError(e);
      notify(/ya existe/.test(msg)
        ? 'Ya hay una categoría con ese nombre (puede que sea una que se borró). Ponle un nombre algo distinto.'
        : msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Category) => {
    const used = classesOf(c.id);
    const ok = await confirm({
      title: `¿Borrar la categoría «${c.name}»?`,
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>Se quita de esta lista y ya no podrás elegirla al crear tipos de clase.</p>
          {used.length > 0 && (
            <Box sx={{ my: 1.5, p: 1.5, borderRadius: 2, backgroundColor: 'rgba(212,165,116,0.14)' }}>
              <strong>Ojo: {used.length} {used.length === 1 ? 'tipo de clase usa' : 'tipos de clase usan'} esta categoría:</strong>{' '}
              {used.slice(0, 6).map((t) => t.title).join(', ')}{used.length > 6 ? '…' : ''}.
              <br />
              Esas clases no se borran, pero cuando las edites tendrás que elegirles otra categoría.
              Mejor cámbiales antes la categoría en «Tipos de clase».
            </Box>
          )}
          <p style={{ margin: 0 }}>Si te equivocas, tu técnico puede recuperarla.</p>
        </>
      ),
      confirmText: used.length ? 'Sí, borrar igualmente' : 'Sí, borrar la categoría',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}v1/categories/${c.id}/`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw res;
      notify(`Categoría «${c.name}» borrada ✓`);
      await fetchData();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return categories.filter((c) => !q || c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }, [categories, searchTerm]);

  const webPlace = current?.id ? WEB_PLACES[current.id] : undefined;

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <PageIntro
        pageKey="categories"
        title="Categorías"
        subtitle="Los grupos de clases de tu web: Pilates, Yoga…"
        actions={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Añadir una categoría
          </Button>
        )}
      />

      <TextField
        data-tour="search" label="Buscar una categoría"
        placeholder="Escribe una palabra…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        fullWidth
        sx={{ mb: 3 }}
      />

      {loading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>Cargando las categorías…</Typography>
        </Stack>
      ) : loadError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchData} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se han podido cargar las categorías. {loadError}
        </Alert>
      ) : categories.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
          <EmptyState
            icon={<CategoryOutlinedIcon />}
            title="Todavía no hay categorías"
            text="Añade al menos una: cada tipo de clase necesita una categoría."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ minHeight: 48 }}>Añadir la primera categoría</Button>}
          />
        </Paper>
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="No hay ninguna categoría con esa palabra"
          action={<Button variant="outlined" onClick={() => setSearchTerm('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
        />
      ) : (
        <Box data-tour="list" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
          {filtered.map((c) => {
            const place = WEB_PLACES[c.id];
            const count = classesOf(c.id).length;
            return (
              <Paper
                key={c.id}
                elevation={0}
                sx={{
                  p: 2.25, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
                  borderLeft: `6px solid ${c.color && isHex(c.color) ? c.color : 'rgb(var(--studio-primary-rgb) / 0.45)'}`,
                  display: 'flex', flexDirection: 'column', gap: 0.75,
                }}
              >
                <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: '1.1rem' }}>{c.name}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Chip label={`${count} ${count === 1 ? 'tipo de clase' : 'tipos de clase'}`} />
                  {place ? (
                    <Chip color="success" label="Sale en la web" />
                  ) : (
                    <Chip label="No sale en la web" />
                  )}
                  <EnglishChip pairs={[[c.name, c.name_en], [c.description, c.description_en]]} />
                </Stack>
                {place && (
                  <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.92rem', '&::first-letter': { textTransform: 'uppercase' } }}>{place}.</Typography>
                )}
                {c.description && (
                  <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.92rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {c.description}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 'auto', pt: 1 }}>
                  <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(c)} sx={{ minHeight: 44, flex: 1 }}>
                    Editar
                  </Button>
                  {place ? (
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'var(--studio-text-body)', px: 1 }}>
                      <LockOutlinedIcon aria-hidden fontSize="small" />
                      <Typography sx={{ fontSize: '0.9rem' }}>Fija</Typography>
                      <HelpTip title="¿Por qué no se puede borrar?">
                        La web busca las clases de esta categoría para su pestaña. Si la borras, esa parte de la web
                        dejaría de funcionar. Puedes cambiarle el nombre y la descripción sin problema.
                      </HelpTip>
                    </Stack>
                  ) : (
                    <Button variant="text" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(c)} sx={{ minHeight: 44 }}>
                      Borrar
                    </Button>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} maxWidth="sm" fullWidth scroll="body">
        <DialogTitle>{current?.id ? `Editar «${current.name}»` : 'Añadir una categoría'}</DialogTitle>
        <DialogContent>
          {current && (
            <>
              {current.id && (
                <Alert severity={webPlace ? 'info' : 'warning'} sx={{ mb: 2.5, fontSize: '0.92rem' }}>
                  {webPlace
                    ? (
                      <>
                        <strong>Dónde se ve:</strong> {webPlace}.{' '}
                        {TEXTS_ON_HOME.includes(current.id)
                          ? 'En la portada, el nombre sale como título grande de esa pestaña y la descripción justo debajo.'
                          : 'El nombre y la descripción de esta categoría no se muestran en la web.'}
                      </>
                    )
                    : 'Esta categoría no aparece en la web; sirve para ordenar clases aquí dentro.'}
                </Alert>
              )}
              {!current.id && (
                <Alert severity="warning" sx={{ mb: 2.5, fontSize: '0.92rem' }}>
                  Una categoría nueva no aparece sola en la web. Si quieres que tenga su propia pestaña, pídeselo al técnico.
                </Alert>
              )}
              <FormStep n={1} title="Nombre">
                <TextField
                  label="Nombre de la categoría"
                  value={current.name || ''}
                  onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                  fullWidth
                  required
                  inputProps={{ maxLength: 120 }}
                  error={nameError}
                  helperText={nameError ? 'Escribe un nombre.' : `Ej.: «Pilates». ${(current.name || '').length}/120`}
                />
              </FormStep>
              <FormStep n={2} title="Descripción (si quieres)">
                <TextField
                  label="Descripción"
                  value={current.description || ''}
                  onChange={(e) => setCurrent({ ...current, description: e.target.value })}
                  multiline
                  minRows={3}
                  fullWidth
                  helperText="Un par de frases que presentan este tipo de clases. Ej.: «Fortalece tu centro y mejora tu postura con grupos reducidos»."
                />
              </FormStep>

              <EnglishVersion pairs={[[current.name, current.name_en], [current.description, current.description_en]]}>
                <EnglishField
                  label="Nombre de la categoría en inglés"
                  es={current.name}
                  value={current.name_en}
                  onChange={(v) => setCurrent({ ...current, name_en: v })}
                  maxLength={120}
                />
                <EnglishField
                  label="Descripción en inglés"
                  es={current.description}
                  value={current.description_en}
                  onChange={(v) => setCurrent({ ...current, description_en: v })}
                  multiline
                />
              </EnglishVersion>

              <Button
                variant="text"
                onClick={() => setShowAdvanced((s) => !s)}
                sx={{ minHeight: 44 }}
              >
                {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas (color)'}
              </Button>
              <Collapse in={showAdvanced}>
                <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mt: 1.5 }}>
                  <Box
                    component="input"
                    type="color"
                    aria-label="Elegir color"
                    value={current.color && isHex(current.color) && current.color.length === 7 ? current.color : theme.palette.primary.main}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrent({ ...current, color: e.target.value })}
                    sx={{ width: 56, height: 56, p: 0, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 2, cursor: 'pointer', flexShrink: 0, background: 'none' }}
                  />
                  <TextField
                    label="Color (opcional)"
                    value={current.color || ''}
                    onChange={(e) => setCurrent({ ...current, color: e.target.value.trim() })}
                    placeholder={theme.palette.primary.main}
                    fullWidth
                    error={colorError}
                    helperText={colorError
                      ? 'Pulsa el cuadrado de color para elegirlo, o déjalo vacío.'
                      : 'Solo se usa aquí, en el CRM, para distinguir las categorías. No se ve en la web.'}
                  />
                </Stack>
              </Collapse>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={closeDialog} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ minHeight: 48, ml: '0 !important' }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
