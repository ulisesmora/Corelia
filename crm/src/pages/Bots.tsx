import { useState, useEffect, useMemo } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, MenuItem, Pagination, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchSelect from '../components/SearchSelect';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { PhotoPicker } from '../components/guide';
import { EnglishChip, EnglishField, EnglishVersion } from '../components/guide/EnglishVersion';
import { API_BASE_URL } from '../config';
import { ClassTemplatesDialog, PREREQ, StepGuide, TEMPLATES_UI, useActionParam } from '../onboarding';
import { useStudioWebUrl } from '../site/SiteProvider';
import { currencySymbol, money } from '../site/money';

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface Instructor {
  id: number;
  name: string;
}

interface ClassType {
  id: number;
  created_at: string;
  updated_at: string;
  category: Category;
  instructor: Instructor | null;
  title: string;
  slug: string;
  description: string;
  title_en?: string;
  description_en?: string;
  duration_minutes: number;
  level: 'all' | 'beg' | 'int' | 'adv';
  default_price_credits: string;
  default_price_eur: string;
  is_active: boolean;
  image: string; // URL de la imagen
}

interface EditableClassType
  extends Omit<
    ClassType,
    'category' | 'instructor' | 'default_price_credits' | 'default_price_eur' | 'duration_minutes'
  > {
  category_id: number;
  instructor_id: number | null;
  default_price_credits: number;
  default_price_eur: number;
  duration_minutes: number;
}

// Mismos nombres que enseña la web en la tarjeta de la clase
const LEVEL_CHOICES = [
  { value: 'all', label: 'Todos los niveles' },
  { value: 'beg', label: 'Principiante (básico / medio)' },
  { value: 'int', label: 'Intermedio (medio / avanzado)' },
];
const LEVEL_ADV = { value: 'adv', label: 'Avanzado' };
const levelLabel = (v: string) => [...LEVEL_CHOICES, LEVEL_ADV].find((l) => l.value === v)?.label || v;

// La web agrupa las clases por categoría (web/src/utils/classCatalog.ts): cada
// categoría es una pestaña de la portada y de la página «Clases».
const categoryHint = (name?: string) =>
  name ? `Saldrá en la pestaña «${name}» de la portada y de la página «Clases».` : '';

const slugify = (text: string) =>
  text.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');

// --- Clases del horario que usan un tipo de clase (para avisar antes de borrar) ---
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

interface ScheduleLite {
  weekday: number | null;
  start_time: string;
  end_date: string | null;
  is_active: boolean;
}

async function activeSchedules(query: string): Promise<ScheduleLite[]> {
  const res = await fetch(`${API_BASE_URL}v1/recurrences/?is_active=true${query}`);
  if (!res.ok) throw res;
  const d = await res.json();
  const list: ScheduleLite[] = Array.isArray(d) ? d : d.results || [];
  const today = new Date().toISOString().slice(0, 10);
  return list.filter((s) => s.is_active && (!s.end_date || s.end_date >= today));
}

/** Convierte los errores de guardado propios de esta pantalla a lenguaje llano. */
async function saveErrorText(e: unknown): Promise<string> {
  if (e instanceof Response && e.status === 400) {
    try {
      const txt = JSON.stringify(await e.clone().json());
      if (/unique set|conjunto único/i.test(txt)) return 'Ya hay una clase con ese nombre en esa categoría. Cambia un poco el nombre.';
      if (/slug/i.test(txt)) return 'Ya hay otra clase con esa dirección de página. Cámbiala en «Opciones avanzadas».';
      if (/duration_minutes/i.test(txt)) return 'La duración tiene que ser de 15 minutos o más.';
    } catch { /* sin JSON */ }
  }
  return friendlyError(e);
}

// ====================================================================
// COMPONENTE PRINCIPAL
// ====================================================================

export default function ClassTypeManagement() {
  // Web pública del estudio (de sus ajustes): '' si aún no se conoce
  const webUrl = useStudioWebUrl();
  const confirm = useConfirm();
  const notify = useNotify();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentClassType, setCurrentClassType] = useState<Partial<EditableClassType> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Data principal
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [classTypesLoading, setClassTypesLoading] = useState(false);
  const [classTypesError, setClassTypesError] = useState('');

  // Data de soporte
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');
  const [instructors, setInstructors] = useState<Instructor[]>([]);

  // Paginación y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // ====================================================================
  // CARGA
  // ====================================================================

  const fetchClassTypes = async () => {
    setClassTypesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/class-types/`);
      if (!res.ok) throw res;
      const data = await res.json();
      setClassTypes(data);
      setClassTypesError('');
    } catch (err) {
      setClassTypesError(await friendlyError(err));
    } finally {
      setClassTypesLoading(false);
    }
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/categories/`);
      if (!res.ok) throw res;
      const data = await res.json();
      setCategories(data);
      setCategoriesError('');
    } catch (err) {
      setCategoriesError(await friendlyError(err));
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchInstructors = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}v1/instructors/`);
      if (res.ok) setInstructors(await res.json());
    } catch { /* la lista de instructores es opcional */ }
  };

  const reloadAll = () => {
    fetchClassTypes();
    fetchCategories();
    fetchInstructors();
  };

  useEffect(() => {
    reloadAll();
  }, []);

  // ====================================================================
  // GUARDAR / BORRAR
  // ====================================================================

  const cur = currentClassType;
  const errors = {
    title: triedSave && !cur?.title?.trim(),
    category: triedSave && !cur?.category_id,
    duration: triedSave && !(Number(cur?.duration_minutes) >= 15),
    credits: triedSave && !(Number(cur?.default_price_credits) > 0),
    eur: triedSave && !(Number(cur?.default_price_eur) >= 0),
  };

  const handleSave = async (data: Partial<EditableClassType>) => {
    setTriedSave(true);
    if (
      !data.title?.trim() || !data.category_id || !(Number(data.duration_minutes) >= 15)
      || !(Number(data.default_price_credits) > 0) || !(Number(data.default_price_eur) >= 0)
    ) return;

    const finalData = { ...data, title: data.title.trim(), image: data.image || '' };
    // La dirección de su página se crea sola a partir del nombre (al editar se conserva)
    if (!finalData.slug) finalData.slug = slugify(finalData.title) || `clase-${Date.now()}`;

    const dataToSend: Record<string, unknown> = {
      ...finalData,
      duration_minutes: Number(finalData.duration_minutes),
      default_price_eur: Number(finalData.default_price_eur),
      default_price_credits: Number(finalData.default_price_credits) || 1,
      category: finalData.category_id,
      instructor: finalData.instructor_id ?? null,
    };
    delete dataToSend.category_id;
    delete dataToSend.instructor_id;

    const url = data.id ? `${API_BASE_URL}v1/class-types/${data.id}/` : `${API_BASE_URL}v1/class-types/`;
    const send = () => fetch(url, {
      method: data.id ? 'PATCH' : 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(dataToSend),
    });

    setSaving(true);
    try {
      let res = await send();
      // Al crear, si la dirección de página ya existe (p. ej. de una clase borrada), se prueba otra
      if (!res.ok && res.status === 400 && !data.id) {
        const err = await res.clone().json().catch(() => ({}));
        if (err?.slug && !err?.non_field_errors) {
          dataToSend.slug = `${finalData.slug}-${Date.now().toString().slice(-4)}`;
          res = await send();
        }
      }
      if (!res.ok) throw res;
      await fetchClassTypes();
      notify(data.id
        ? 'Clase guardada ✓ Puede tardar unos 5 minutos en verse cambiada en la web.'
        : 'Clase creada ✓ Ahora ponle días y horas en «Mis clases y horarios».');
      handleCloseDialog(true);
    } catch (err) {
      notify(await saveErrorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ct: ClassType) => {
    let usage: ScheduleLite[] | null = null;
    try { usage = await activeSchedules(`&class_type=${ct.id}`); } catch { usage = null; }

    const ok = await confirm({
      title: `¿Borrar la clase «${ct.title}»?`,
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>
            Dejará de aparecer en la web: en los carruseles de clases y en su página propia.
          </p>
          {usage && usage.length > 0 && (
            <Box sx={{ my: 1.5, p: 1.5, borderRadius: 2, backgroundColor: 'rgba(212,165,116,0.14)' }}>
              <strong>Ojo: está en el horario {usage.length} {usage.length === 1 ? 'vez' : 'veces'}:</strong>
              <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>
                {usage.slice(0, 5).map((s, i) => (
                  <li key={i}>{s.weekday != null ? WEEKDAYS[s.weekday] : 'Día suelto'} a las {s.start_time?.slice(0, 5)}</li>
                ))}
                {usage.length > 5 && <li>y {usage.length - 5} más</li>}
              </ul>
              Esas clases <strong>no se borran</strong>: seguirán en el horario y se podrán reservar. Si quieres dejar de
              darla, quítala primero en «Mis clases y horarios».
            </Box>
          )}
          {usage === null && (
            <p style={{ margin: '0 0 8px' }}>
              No hemos podido comprobar si está en el horario. Si lo está, esas clases seguirán apareciendo.
            </p>
          )}
          <p style={{ margin: 0 }}>Las reservas que ya existen no se tocan. Si te equivocas, tu técnico puede recuperarla.</p>
        </>
      ),
      confirmText: usage && usage.length > 0 ? 'Sí, borrar igualmente' : 'Sí, borrar la clase',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      const response = await fetch(`${API_BASE_URL}v1/class-types/${ct.id}/`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) throw response;
      await fetchClassTypes();
      notify(`Clase «${ct.title}» borrada ✓`);
    } catch (err) {
      notify(await friendlyError(err), 'error');
    }
  };

  // ====================================================================
  // VENTANA
  // ====================================================================

  const handleOpenCreate = () => {
    setCurrentClassType({
      title: '',
      slug: '',
      description: '',
      title_en: '',
      description_en: '',
      duration_minutes: 60,
      level: 'all',
      default_price_credits: 1,
      default_price_eur: 0,
      is_active: true,
      image: '',
      category_id: undefined,
      instructor_id: null,
    } as Partial<EditableClassType>);
    setTriedSave(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleOpenEdit = (classType: ClassType) => {
    const editable: Partial<EditableClassType> = {
      ...classType,
      category_id: classType.category.id,
      instructor_id: classType.instructor ? classType.instructor.id : null,
      default_price_credits: Number(classType.default_price_credits),
      default_price_eur: Number(classType.default_price_eur),
      duration_minutes: Number(classType.duration_minutes),
    };
    setCurrentClassType(editable);
    setTriedSave(false);
    setShowAdvanced(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = (force = false) => {
    if (!force && (saving || isUploading)) return;
    setOpenDialog(false);
    setCurrentClassType(null);
  };

  const update = (patch: Partial<EditableClassType>) =>
    setCurrentClassType((prev) => (prev ? { ...prev, ...patch } : prev));

  const filteredClassTypes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return classTypes.filter(
      (c) =>
        !q
        || c.title.toLowerCase().includes(q)
        || c.category.name.toLowerCase().includes(q)
        || c.instructor?.name.toLowerCase().includes(q)
    );
  }, [classTypes, searchTerm]);

  const paginatedClassTypes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredClassTypes.slice(start, start + pageSize);
  }, [filteredClassTypes, currentPage]);

  const isLoading = classTypesLoading || categoriesLoading;
  const isError = classTypesError || categoriesError;
  const totalPages = Math.ceil(filteredClassTypes.length / pageSize) || 1;
  const levelOptions = cur?.level === 'adv' ? [...LEVEL_CHOICES, LEVEL_ADV] : LEVEL_CHOICES;
  const slugPreview = cur?.slug || slugify(cur?.title || '');

  // Enlaces directos desde la guía de puesta en marcha (?accion=nueva / ?accion=plantillas)
  useActionParam('nueva', handleOpenCreate, !categoriesLoading);
  useActionParam('plantillas', () => setTemplatesOpen(true));

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <StepGuide step="class_types" />
      <PageIntro
        pageKey="class-types"
        title="Tipos de clase"
        subtitle={(
          <>
            Aquí decides <strong>qué clases ofreces</strong>: su nombre, foto, descripción y precio. Es lo que ven las
            clientas en la web. <strong>Cuándo</strong> se dan (día y hora) se pone después en «Mis clases y horarios».
          </>
        )}
        actions={(
          <>
            <Button variant="outlined" onClick={() => setTemplatesOpen(true)}>
              {TEMPLATES_UI.fromTemplate}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
              Añadir un tipo de clase
            </Button>
          </>
        )}
        steps={[
          { title: 'Pulsa «Añadir un tipo de clase»', text: 'O «Editar» en una clase que ya exista para cambiar su foto, texto o precio.' },
          { title: 'Rellena los pasos de la ventana', text: 'Nombre, categoría, foto, descripción, duración y precio.' },
          { title: 'Pulsa «Guardar»', text: 'Saldrá un aviso verde abajo. Con «Ver en la web» compruebas cómo ha quedado.' },
          { title: 'Ponle días y horas', text: 'En «Mis clases y horarios», para que las clientas puedan reservarla.' },
        ]}
        tips={[
          'Si cambias el precio, se aplica a las reservas nuevas. Las que ya están hechas no cambian.',
          'Los cambios pueden tardar unos 5 minutos en verse en la portada de la web.',
        ]}
      />

      <TextField
        fullWidth
        label="Buscar una clase"
        placeholder="Nombre, categoría o instructor…"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setCurrentPage(1);
        }}
        sx={{ mb: 3 }}
      />

      {isLoading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>Cargando las clases…</Typography>
        </Stack>
      ) : isError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={reloadAll} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se han podido cargar las clases. {isError}
        </Alert>
      ) : classTypes.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
          <EmptyState
            icon={<ClassOutlinedIcon />}
            title="Todavía no hay tipos de clase"
            text="Lo más rápido: elige tus clases de la lista de plantillas (Reformer, Mat, Barre, Yoga…) y cámbialas a tu gusto. Después les pones días y horas en el horario."
            action={(
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button variant="contained" onClick={() => setTemplatesOpen(true)} sx={{ minHeight: 48 }}>{TEMPLATES_UI.fromTemplate}</Button>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={handleOpenCreate} sx={{ minHeight: 48 }}>{TEMPLATES_UI.manual}</Button>
              </Stack>
            )}
          />
        </Paper>
      ) : filteredClassTypes.length === 0 ? (
        <EmptyState
          compact
          title="No hay ninguna clase con esa palabra"
          text="Prueba con otra palabra o borra la búsqueda."
          action={<Button variant="outlined" onClick={() => setSearchTerm('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
        />
      ) : (
        <>
          <Stack spacing={2}>
            {paginatedClassTypes.map((ct) => {
              const credits = Number(ct.default_price_credits);
              const eur = Number(ct.default_price_eur);
              return (
                <Paper
                  key={ct.id}
                  elevation={0}
                  sx={{
                    p: 2, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
                    display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: '100%', sm: 108 }, maxWidth: { xs: 220, sm: 108 }, aspectRatio: '3 / 4', flexShrink: 0,
                      borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgb(var(--studio-bg-rgb) / 0.8)',
                      display: 'grid', placeItems: 'center', alignSelf: { xs: 'center', sm: 'flex-start' },
                    }}
                  >
                    {ct.image ? (
                      <Box component="img" src={ct.image} alt={ct.title} loading="lazy"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <Stack alignItems="center" spacing={0.5} sx={{ color: 'var(--studio-danger-text, #A86B5E)', p: 1, textAlign: 'center' }}>
                        <ImageNotSupportedOutlinedIcon aria-hidden />
                        <Typography sx={{ fontSize: '0.85rem' }}>Sin foto</Typography>
                      </Stack>
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: '1.12rem' }}>{ct.title}</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                      <Chip label={ct.category.name} />
                      <Chip label={levelLabel(ct.level)} variant="outlined" />
                      <Chip label={`${ct.duration_minutes} min`} variant="outlined" />
                      <EnglishChip pairs={[[ct.title, ct.title_en], [ct.description, ct.description_en]]} />
                    </Stack>
                    <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>
                      Precio: <strong>{credits} {credits === 1 ? 'crédito' : 'créditos'}</strong>
                      {eur > 0 ? <> o <strong>{money(eur, { decimals: 'auto' })}</strong> suelta</> : ' (no se vende suelta con tarjeta)'}
                    </Typography>
                    <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.92rem' }}>
                      Profesor/a habitual: {ct.instructor?.name || 'sin poner'}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 'auto', pt: 1 }}>
                      <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => handleOpenEdit(ct)} sx={{ minHeight: 44 }}>
                        Editar
                      </Button>
                      {ct.slug && webUrl && (
                        <Button
                          variant="text"
                          startIcon={<OpenInNewIcon />}
                          href={`${webUrl}/classdetail/${ct.slug}`}
                          target="_blank"
                          rel="noopener"
                          sx={{ minHeight: 44 }}
                        >
                          Ver en la web
                        </Button>
                      )}
                      <Button variant="text" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(ct)} sx={{ minHeight: 44 }}>
                        Borrar
                      </Button>
                    </Stack>
                  </Box>
                </Paper>
              );
            })}
          </Stack>

          {totalPages > 1 && (
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={(_, page) => setCurrentPage(page)}
              size="large"
              sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
            />
          )}
        </>
      )}

      {/* Ventana crear/editar */}
      <Dialog open={openDialog} onClose={() => handleCloseDialog()} maxWidth="md" fullWidth scroll="body">
        <DialogTitle>
          {cur?.id ? `Editar «${cur.title || 'clase'}»` : 'Añadir un tipo de clase'}
        </DialogTitle>
        <DialogContent>
          {cur && (
            <>
              <FormStep n={1} title="¿Cómo se llama y de qué tipo es?">
                <Stack spacing={2.25}>
                  <TextField
                    fullWidth
                    required
                    label="Nombre de la clase"
                    value={cur.title || ''}
                    onChange={(e) => update({ title: e.target.value })}
                    inputProps={{ maxLength: 160 }}
                    error={errors.title}
                    helperText={errors.title
                      ? 'Escribe el nombre de la clase.'
                      : `Ej.: «Pilates Reformer». Es el título grande en la web y en el horario. ${(cur.title || '').length}/160`}
                  />
                  <Box>
                    <SearchSelect
                      label="Categoría *"
                      options={categories.map((cat) => ({ id: cat.id, label: cat.name }))}
                      value={cur.category_id || ''}
                      onChange={(id) => { if (id) update({ category_id: Number(id) }); }}
                      disabled={categoriesLoading}
                      helperText={categoriesError
                        || (cur.category_id
                          ? categoryHint(categories.find((c) => c.id === cur.category_id)?.name)
                          : categories.length ? 'Elige en qué grupo va: Pilates, Yoga, Mindfulness…' : PREREQ.needCategoryText)}
                    />
                    {errors.category && (
                      <Typography role="alert" sx={{ color: 'error.main', fontSize: '0.9rem', mt: 0.5, ml: 1.75 }}>
                        Elige una categoría.
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                    <TextField
                      select
                      fullWidth
                      label="Nivel"
                      value={cur.level || 'all'}
                      onChange={(e) => update({ level: e.target.value as EditableClassType['level'] })}
                      helperText="Sale en la tarjeta de la clase para que cada clienta sepa si es para ella."
                    >
                      {levelOptions.map((level) => (
                        <MenuItem key={level.value} value={level.value} sx={{ minHeight: 44 }}>
                          {level.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <HelpTip title="¿Qué es el nivel?">
                      Indica para quién es la clase. En la web sale como «Todos los niveles», «Principiante» o
                      «Intermedio». No impide que nadie reserve: es solo orientativo.
                    </HelpTip>
                  </Stack>
                </Stack>
              </FormStep>

              <FormStep n={2} title="La foto" hint="Sale en la tarjeta del carrusel de clases y arriba del todo en la página de la clase.">
                <PhotoPicker
                  value={cur.image || ''}
                  onChange={(url) => update({ image: url })}
                  onBusyChange={setIsUploading}
                  aspect="3 / 4"
                  previewWidth={220}
                  allowRemove
                  shapeHint="Mejor una foto vertical (de pie) con la persona en el centro: la web recorta los lados."
                />
              </FormStep>

              <FormStep n={3} title="Descripción">
                <TextField
                  fullWidth
                  label="Descripción de la clase"
                  multiline
                  minRows={4}
                  value={cur.description || ''}
                  onChange={(e) => update({ description: e.target.value })}
                  helperText="Sale en la página de la clase (cuando la clienta pulsa en la tarjeta). Cuenta en qué consiste, para quién es y qué beneficios tiene."
                />
              </FormStep>

              <EnglishVersion pairs={[[cur.title, cur.title_en], [cur.description, cur.description_en]]}>
                <EnglishField
                  label="Nombre de la clase en inglés"
                  es={cur.title}
                  value={cur.title_en}
                  onChange={(v) => update({ title_en: v })}
                  maxLength={160}
                />
                <EnglishField
                  label="Descripción de la clase en inglés"
                  es={cur.description}
                  value={cur.description_en}
                  onChange={(v) => update({ description_en: v })}
                  multiline
                />
              </EnglishVersion>

              <FormStep n={4} title="Duración y precio">
                <Stack spacing={2.25}>
                  <TextField
                    label="Duración"
                    type="number"
                    value={cur.duration_minutes ?? ''}
                    onChange={(e) => update({ duration_minutes: e.target.value === '' ? undefined : Number(e.target.value) })}
                    inputProps={{ min: 15, step: 5 }}
                    InputProps={{ endAdornment: <InputAdornment position="end">minutos</InputAdornment> }}
                    error={errors.duration}
                    helperText={errors.duration
                      ? 'Tiene que ser de 15 minutos o más.'
                      : 'Sale en la web como «60 min». La hora de cada clase se pone en el horario.'}
                    sx={{ maxWidth: 360 }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      label="Precio en créditos"
                      type="number"
                      value={cur.default_price_credits ?? ''}
                      onChange={(e) => update({ default_price_credits: e.target.value === '' ? undefined : Number(e.target.value) })}
                      inputProps={{ min: 0.5, step: 0.5 }}
                      error={errors.credits}
                      helperText={errors.credits
                        ? 'Pon cuántos créditos cuesta (normalmente 1).'
                        : 'Cuántos créditos del bono gasta la clienta al reservar. Normalmente 1.'}
                    />
                    <TextField
                      fullWidth
                      label="Precio suelta con tarjeta"
                      type="number"
                      value={cur.default_price_eur ?? ''}
                      onChange={(e) => update({ default_price_eur: e.target.value === '' ? undefined : Number(e.target.value) })}
                      inputProps={{ min: 0, step: 0.5 }}
                      InputProps={{ endAdornment: <InputAdornment position="end">{currencySymbol()}</InputAdornment> }}
                      error={errors.eur}
                      helperText={errors.eur
                        ? 'Pon un precio (0 o más).'
                        : 'Lo que paga quien reserva sin bono. Con 0 solo se puede reservar con créditos.'}
                    />
                  </Stack>
                  <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.9rem' }}>
                    Si una clase concreta del horario tiene otro precio, se cambia allí. Las reservas ya hechas no cambian de precio.
                  </Typography>
                </Stack>
              </FormStep>

              <FormStep n={5} title="¿Quién la da normalmente?" hint="Sale en la tarjeta y en la página de la clase. Si un día la da otra persona, se cambia en el horario.">
                <SearchSelect
                  label="Profesor/a habitual"
                  options={instructors.map((i) => ({ id: i.id, label: i.name }))}
                  value={cur.instructor_id ?? ''}
                  onChange={(id) => update({ instructor_id: id ? Number(id) : null })}
                  allowEmpty
                  emptyLabel="— Sin profesor/a fijo —"
                  helperText="Si no aparece, añádelo antes en «Instructores»."
                />
              </FormStep>

              <Button variant="text" onClick={() => setShowAdvanced((s) => !s)} sx={{ minHeight: 44 }}>
                {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas (dirección de su página)'}
              </Button>
              <Collapse in={showAdvanced}>
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  <TextField
                    fullWidth
                    label="Dirección de su página en la web"
                    value={cur.slug || ''}
                    onChange={(e) => update({ slug: slugify(e.target.value) })}
                    placeholder={slugify(cur.title || '') || 'pilates-reformer'}
                    InputProps={{ startAdornment: <InputAdornment position="start">…/classdetail/</InputAdornment> }}
                    helperText={cur.id
                      ? 'Si la cambias, los enlaces antiguos (Google, WhatsApp…) dejarán de funcionar. Normalmente no hace falta tocarla.'
                      : 'Se crea sola con el nombre de la clase. Déjala vacía si no sabes qué poner.'}
                  />
                  {slugPreview && (
                    <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                      Quedará así: {webUrl || 'tu web'}/classdetail/{slugPreview}
                    </Typography>
                  )}
                </Stack>
              </Collapse>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={() => handleCloseDialog()} disabled={saving || isUploading} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => cur && handleSave(cur)}
            disabled={saving || isUploading}
            sx={{ minHeight: 48, ml: '0 !important' }}
          >
            {isUploading ? 'Esperando a la foto…' : saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
      <ClassTemplatesDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} onCreated={() => reloadAll()} />
    </Box>
  );
}
