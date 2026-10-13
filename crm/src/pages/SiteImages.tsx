import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { PhotoPicker } from '../components/guide';
import { authHeaders } from '../utils/auth';
import { EnglishChip, EnglishField, EnglishVersion } from '../components/guide/EnglishVersion';
import { API_BASE_URL } from '../config';

// ====================================================================
// PANTALLA "FOTOS DE LA WEB"
// ====================================================================

interface SiteImage {
  id: number;
  section: string;
  image: string;
  title: string | null;
  subtitle: string | null;
  link: string | null;
  order: number;
  is_active: boolean;
  translations: Record<string, Record<string, string> | undefined>;
  title_en?: string;
  subtitle_en?: string;
}

// Texto en inglés: el campo nuevo y, si está vacío, lo que hubiera en el JSON antiguo
const enTitleOf = (i: Partial<SiteImage>) => i.title_en || i.translations?.en?.title || '';
const enSubtitleOf = (i: Partial<SiteImage>) => i.subtitle_en || i.translations?.en?.subtitle || '';

// Dónde usa la web cada apartado (comprobado en la web pública: solo la
// portada lee de aquí, y solo el título; el resto aún no está conectado).
const SECTIONS: { value: string; label: string; where: string; live: boolean }[] = [
  {
    value: 'hero',
    label: 'Portada (lo primero que se ve)',
    where: 'El título de la primera foto visible sale en grande encima del vídeo de la portada. La foto en sí no se ve, porque la portada lleva un vídeo.',
    live: true,
  },
  { value: 'classes', label: 'Apartado de clases', where: 'Todavía no aparece en la web: se guarda para cuando se añada ese apartado.', live: false },
  { value: 'events', label: 'Eventos', where: 'Todavía no aparece en la web: se guarda para cuando se añada ese apartado.', live: false },
  { value: 'gallery', label: 'Galería', where: 'Todavía no aparece en la web: se guarda para cuando se añada ese apartado.', live: false },
  { value: 'about', label: 'Sobre nosotros', where: 'Todavía no aparece en la web: se guarda para cuando se añada ese apartado.', live: false },
  { value: 'contact', label: 'Contacto', where: 'Todavía no aparece en la web: se guarda para cuando se añada ese apartado.', live: false },
];

const sectionOf = (v?: string) => SECTIONS.find((s) => s.value === v);

type Editable = Partial<SiteImage>;

export default function SiteImagesManagement() {
  const confirm = useConfirm();
  const notify = useNotify();
  const [images, setImages] = useState<SiteImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [current, setCurrent] = useState<Editable | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const jsonHeaders = () => authHeaders({ 'Content-Type': 'application/json' });

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/site-images/?ordering=section,order`, { headers: authHeaders() });
      if (!res.ok) throw res;
      const d = await res.json();
      setImages(Array.isArray(d) ? d : d.results || []);
    } catch (e) {
      setLoadError(await friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setCurrent({ section: 'hero', image: '', order: 0, is_active: true, translations: {}, title_en: '', subtitle_en: '' });
    setShowAdvanced(false);
    setTriedSave(false);
    setOpenDialog(true);
  };

  const openEdit = (img: SiteImage) => {
    setCurrent({ ...img, title_en: enTitleOf(img), subtitle_en: enSubtitleOf(img) });
    setShowAdvanced(Boolean(img.link));
    setTriedSave(false);
    setOpenDialog(true);
  };

  const closeDialog = () => {
    if (saving || uploading) return;
    setOpenDialog(false);
    setCurrent(null);
  };

  const handleSave = async () => {
    if (!current) return;
    setTriedSave(true);
    if (!current.section || !current.image) return;

    // Inglés: se guarda en los campos nuevos (title_en / subtitle_en). El JSON
    // antiguo se mantiene igual para que la web, que aún lo lee como respaldo,
    // no enseñe un texto viejo al vaciar un campo. Se conservan otros idiomas.
    const enTitle = (current.title_en || '').trim();
    const enSubtitle = (current.subtitle_en || '').trim();
    const translations: Record<string, Record<string, string> | undefined> = { ...(current.translations || {}) };
    const en: Record<string, string> = { ...(translations.en || {}) };
    if (enTitle) en.title = enTitle; else delete en.title;
    if (enSubtitle) en.subtitle = enSubtitle; else delete en.subtitle;
    if (Object.keys(en).length) translations.en = en; else delete translations.en;

    const body = { ...current, title_en: enTitle, subtitle_en: enSubtitle, translations };
    const method = current.id ? 'PATCH' : 'POST';
    const url = current.id ? `${API_BASE_URL}v1/site-images/${current.id}/` : `${API_BASE_URL}v1/site-images/`;
    setSaving(true);
    try {
      const res = await fetch(url, { method, headers: jsonHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw res;
      notify(current.id ? 'Foto guardada ✓' : 'Foto añadida ✓');
      setOpenDialog(false);
      setCurrent(null);
      fetchData();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (img: SiteImage) => {
    const ok = await confirm({
      title: '¿Borrar esta foto?',
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>
            Se quita de esta lista{img.is_active && sectionOf(img.section)?.live ? ' y de la web' : ''}.
          </p>
          <p style={{ margin: 0 }}>
            Si solo quieres quitarla un tiempo, es mejor <strong>ocultarla</strong> con el interruptor «Visible en la web»: así no se pierde.
          </p>
        </>
      ),
      confirmText: 'Sí, borrar la foto',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}v1/site-images/${img.id}/`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw res;
      notify('Foto borrada ✓');
      fetchData();
    } catch (e) {
      notify(await friendlyError(e), 'error');
    }
  };

  const handleToggle = async (img: SiteImage) => {
    const next = !img.is_active;
    setTogglingId(img.id);
    setImages((list) => list.map((i) => (i.id === img.id ? { ...i, is_active: next } : i)));
    try {
      const res = await fetch(`${API_BASE_URL}v1/site-images/${img.id}/`, {
        method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw res;
      notify(next ? 'Foto visible ✓' : 'Foto oculta ✓ (no se ha borrado; puedes volver a mostrarla cuando quieras)');
    } catch (e) {
      setImages((list) => list.map((i) => (i.id === img.id ? { ...i, is_active: img.is_active } : i)));
      notify(await friendlyError(e), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter((i) =>
      i.title?.toLowerCase().includes(q)
      || i.subtitle?.toLowerCase().includes(q)
      || sectionOf(i.section)?.label.toLowerCase().includes(q));
  }, [images, search]);

  const groups = useMemo(() => {
    const known = SECTIONS.map((s) => ({
      ...s,
      items: filtered.filter((i) => i.section === s.value).sort((a, b) => a.order - b.order),
    }));
    const others = filtered.filter((i) => !sectionOf(i.section));
    if (others.length) known.push({ value: '_otros', label: 'Otros', where: '', live: false, items: others });
    return known.filter((g) => g.items.length > 0);
  }, [filtered]);

  const currentSection = sectionOf(current?.section);

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <PageIntro
        pageKey="site-images"
        title="Fotos de la web"
        subtitle="Aquí guardas las fotos y textos de los apartados generales de tu web (portada, galería…). Las fotos de cada clase, instructor o sala se cambian en sus propias pantallas."
        actions={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Añadir una foto
          </Button>
        )}
        steps={[
          { title: 'Pulsa «Añadir una foto»', text: 'O «Editar» en una que ya exista.' },
          { title: 'Elige en qué parte de la web va', text: 'Te decimos debajo dónde se verá exactamente.' },
          { title: 'Sube la foto y escribe los textos', text: 'Verás la foto recortada tal y como saldrá.' },
          { title: 'Pulsa «Guardar»', text: 'Saldrá un aviso verde abajo cuando esté guardada.' },
        ]}
        tips={[
          'Para quitar una foto un tiempo sin perderla, usa el interruptor «Visible en la web». Borrar es para siempre.',
          'Dentro de cada apartado, la foto con la posición más baja (0, 1, 2…) es la que sale primero.',
        ]}
      />

      <Alert severity="info" sx={{ mb: 2.5, fontSize: '0.95rem' }}>
        <strong>Importante:</strong> ahora mismo la web solo usa el <strong>título</strong> del apartado «Portada».
        Las fotos de los demás apartados se guardan aquí, pero la web todavía no las muestra.
      </Alert>

      <TextField
        label="Buscar por título o apartado"
        placeholder="Escribe una palabra…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        sx={{ mb: 3 }}
      />

      {loading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>Cargando las fotos…</Typography>
        </Stack>
      ) : loadError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchData} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se han podido cargar las fotos. {loadError}
        </Alert>
      ) : images.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
          <EmptyState
            icon={<PhotoLibraryOutlinedIcon />}
            title="Todavía no hay fotos guardadas"
            text="Pulsa el botón para añadir la primera."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ minHeight: 48 }}>Añadir una foto</Button>}
          />
        </Paper>
      ) : groups.length === 0 ? (
        <EmptyState
          compact
          title="No hay ninguna foto con esa palabra"
          text="Prueba con otra palabra o borra la búsqueda."
          action={<Button variant="outlined" onClick={() => setSearch('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
        />
      ) : (
        <Stack spacing={4}>
          {groups.map((g) => (
            <Box component="section" key={g.value}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--studio-dark)' }}>
                  {g.label}
                </Typography>
                {g.where && <HelpTip title="¿Dónde se ve esto en la web?">{g.where}</HelpTip>}
              </Stack>
              {!g.live && g.value !== '_otros' && (
                <Typography sx={{ color: 'text.secondary', fontSize: '0.92rem', mb: 1.5 }}>
                  Este apartado aún no aparece en la web.
                </Typography>
              )}
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, mt: 1.5 }}>
                {g.items.map((img) => (
                  <Paper
                    key={img.id}
                    elevation={0}
                    sx={{ borderRadius: 4, overflow: 'hidden', border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)', display: 'flex', flexDirection: 'column' }}
                  >
                    <Box sx={{ position: 'relative', aspectRatio: '16 / 9', backgroundColor: 'rgb(var(--studio-bg-rgb) / 0.8)' }}>
                      <Box
                        component="img"
                        src={img.image}
                        alt={img.title || 'Foto de la web'}
                        loading="lazy"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: img.is_active ? 1 : 0.45 }}
                      />
                      <Chip
                        label={img.is_active ? 'Visible' : 'Oculta'}
                        color={img.is_active ? 'success' : 'default'}
                        sx={{ position: 'absolute', top: 10, left: 10, backgroundColor: img.is_active ? 'rgba(236,244,231,0.95)' : 'rgba(255,255,255,0.92)' }}
                      />
                    </Box>
                    <Box sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: '1.02rem' }}>
                        {img.title || 'Sin título'}
                      </Typography>
                      {img.subtitle && (
                        <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.92rem' }}>{img.subtitle}</Typography>
                      )}
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>Posición: {img.order}</Typography>
                      <Box sx={{ '&:empty': { display: 'none' } }}>
                        <EnglishChip pairs={[[img.title, enTitleOf(img)], [img.subtitle, enSubtitleOf(img)]]} />
                      </Box>
                      <FormControlLabel
                        sx={{ mt: 0.5, ml: 0, minHeight: 44 }}
                        control={(
                          <Switch
                            checked={img.is_active}
                            disabled={togglingId === img.id}
                            onChange={() => handleToggle(img)}
                          />
                        )}
                        label={<Typography sx={{ fontSize: '0.95rem' }}>Visible en la web</Typography>}
                      />
                      <Stack direction="row" spacing={1} sx={{ mt: 'auto', pt: 1 }}>
                        <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => openEdit(img)} sx={{ minHeight: 44, flex: 1 }}>
                          Editar
                        </Button>
                        <Button variant="text" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(img)} sx={{ minHeight: 44 }}>
                          Borrar
                        </Button>
                      </Stack>
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      <Dialog open={openDialog} onClose={closeDialog} maxWidth="md" fullWidth scroll="body">
        <DialogTitle>{current?.id ? 'Editar foto' : 'Añadir una foto'}</DialogTitle>
        <DialogContent>
          {current && (
            <>
              <FormStep n={1} title="¿En qué parte de la web va?">
                <TextField
                  select
                  label="Apartado de la web"
                  value={current.section || ''}
                  onChange={(e) => setCurrent({ ...current, section: e.target.value })}
                  fullWidth
                  error={triedSave && !current.section}
                  helperText={triedSave && !current.section ? 'Elige un apartado.' : undefined}
                >
                  {SECTIONS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                </TextField>
                {currentSection && (
                  <Alert severity={currentSection.live ? 'info' : 'warning'} sx={{ mt: 1.5, fontSize: '0.92rem' }}>
                    <strong>Dónde se ve:</strong> {currentSection.where}
                  </Alert>
                )}
              </FormStep>

              <FormStep n={2} title="La foto">
                <PhotoPicker
                  value={current.image || ''}
                  onChange={(url) => setCurrent((c) => (c ? { ...c, image: url } : c))}
                  onBusyChange={setUploading}
                  aspect="16 / 9"
                  previewWidth={320}
                  shapeHint="Mejor una foto horizontal (más ancha que alta), de al menos 1600 píxeles de ancho."
                />
                {triedSave && !current.image && (
                  <Typography role="alert" sx={{ color: 'error.main', fontSize: '0.92rem', mt: 1 }}>
                    Falta la foto: pulsa «Elegir una foto».
                  </Typography>
                )}
              </FormStep>

              <FormStep n={3} title="Textos (si quieres)" hint="Puedes dejarlos vacíos.">
                <Stack spacing={2}>
                  <TextField
                    label="Título"
                    value={current.title || ''}
                    onChange={(e) => setCurrent({ ...current, title: e.target.value })}
                    fullWidth
                    inputProps={{ maxLength: 200 }}
                    helperText={`${current.section === 'hero' ? 'Sale en grande encima del vídeo de la portada. ' : ''}Ej.: «Pilates en plena naturaleza» · ${(current.title || '').length}/200`}
                  />
                  <TextField
                    label="Subtítulo"
                    value={current.subtitle || ''}
                    onChange={(e) => setCurrent({ ...current, subtitle: e.target.value })}
                    fullWidth
                    multiline
                    minRows={2}
                    inputProps={{ maxLength: 300 }}
                    helperText={`${current.section === 'hero' ? 'En la portada, de momento solo se muestra el subtítulo en inglés (en «Versión en inglés», más abajo). ' : ''}${(current.subtitle || '').length}/300`}
                  />
                </Stack>
              </FormStep>

              <EnglishVersion pairs={[[current.title, current.title_en], [current.subtitle, current.subtitle_en]]}>
                <EnglishField
                  label="Título en inglés"
                  es={current.title}
                  value={current.title_en}
                  onChange={(v) => setCurrent({ ...current, title_en: v })}
                  maxLength={200}
                />
                <EnglishField
                  label="Subtítulo en inglés"
                  es={current.subtitle}
                  value={current.subtitle_en}
                  onChange={(v) => setCurrent({ ...current, subtitle_en: v })}
                  maxLength={300}
                  multiline
                />
              </EnglishVersion>

              <FormStep n={4} title="¿Se ve ya en la web?">
                <Stack spacing={2}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={current.is_active ?? true}
                        onChange={(e) => setCurrent({ ...current, is_active: e.target.checked })}
                      />
                    )}
                    label={current.is_active ?? true
                      ? 'Sí, visible en la web'
                      : 'No, oculta (se guarda pero no se ve en la web)'}
                  />
                  <TextField
                    label="Posición dentro de su apartado"
                    type="number"
                    value={current.order ?? 0}
                    onChange={(e) => setCurrent({ ...current, order: Math.max(0, Number(e.target.value) || 0) })}
                    inputProps={{ min: 0 }}
                    sx={{ maxWidth: 280 }}
                    helperText="0 = la primera. Si hay varias, sale antes la de número más bajo."
                  />
                </Stack>
              </FormStep>

              <Button
                variant="text"
                onClick={() => setShowAdvanced((s) => !s)}
                endIcon={<ExpandMoreIcon sx={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                sx={{ minHeight: 44 }}
              >
                Opciones avanzadas (enlace)
              </Button>
              <Collapse in={showAdvanced}>
                <Stack spacing={2} sx={{ mt: 1.5 }}>
                  <TextField
                    label="Enlace al pulsar la foto (opcional)"
                    value={current.link || ''}
                    onChange={(e) => setCurrent({ ...current, link: e.target.value })}
                    fullWidth
                    placeholder="https://…"
                    helperText="Dirección completa de la página a la que llevaría la foto. Si no lo sabes, déjalo vacío."
                  />
                </Stack>
              </Collapse>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={closeDialog} disabled={saving || uploading} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || uploading}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {uploading ? 'Esperando a la foto…' : saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
