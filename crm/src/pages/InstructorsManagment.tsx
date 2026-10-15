import { useState, useEffect, useMemo } from 'react';
import {
  Alert, Avatar, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, Pagination, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InstagramIcon from '@mui/icons-material/Instagram';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import LanguageIcon from '@mui/icons-material/Language';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageIntro, HelpTip, EmptyState, FormStep, useConfirm, useNotify } from '../components/guide';
import { friendlyError } from '../utils/errors';
import { authHeaders } from '../utils/auth';
import { PhotoPicker } from '../components/guide';
import { EnglishChip, EnglishField, EnglishVersion } from '../components/guide/EnglishVersion';
import { API_BASE_URL } from '../config';

// ====================================================================
// UTILIDADES
// ====================================================================

// Dirección interna a partir del nombre (ej: "José Pérez" -> "jose-perez")
const generateSlug = (text: string) =>
  text.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');

/** Acepta "@usuario", "instagram.com/usuario" o la dirección completa. */
function normalizeInstagram(v: string): string {
  const t = v.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/instagram\.com/i.test(t)) return `https://${t.replace(/^\/+/, '')}`;
  const user = t.replace(/^@/, '').replace(/\s+/g, '');
  return `https://www.instagram.com/${user}`;
}

/** Añade https:// si falta ("miweb.com" -> "https://miweb.com"). */
function normalizeUrl(v: string): string {
  const t = v.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

const looksLikeUrl = (v: string) => !v || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v);

// --- Clases que usan a un instructor (para avisar antes de borrar) ---
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

interface ScheduleLite {
  weekday: number | null;
  start_time: string;
  end_date: string | null;
  is_active: boolean;
  class_type?: { title?: string } | null;
  override_instructor?: { id: number } | null;
}

interface ClassTypeLite {
  id: number;
  title: string;
  instructor: { id: number } | null;
}

async function fetchList<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw res;
  const d = await res.json();
  return Array.isArray(d) ? d : d.results || [];
}

// ====================================================================
// INTERFACES
// ====================================================================

interface Instructor {
  id: number;
  name: string;
  slug: string;
  experience_years: number;
  image: string;
  short_bio: string;
  description: string;
  vision: string;
  short_bio_en?: string;
  description_en?: string;
  vision_en?: string;
  instagram: string;
  linkedin: string;
  website: string;
}

type EditableInstructor = {
  id?: number;
  name: string;
  slug: string;
  experience_years: number | '';
  image: string;
  short_bio: string;
  description: string;
  vision: string;
  short_bio_en: string;
  description_en: string;
  vision_en: string;
  instagram: string;
  linkedin: string;
  website: string;
};

// ====================================================================
// COMPONENTE PRINCIPAL
// ====================================================================

export default function InstructorManagement() {
  const confirm = useConfirm();
  const notify = useNotify();
  const [openDialog, setOpenDialog] = useState(false);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentInstructor, setCurrentInstructor] = useState<EditableInstructor | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [showSocial, setShowSocial] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // --- CARGA ---
  const fetchInstructors = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}v1/instructors/`);
      if (!res.ok) throw res;
      const data: Instructor[] = await res.json();
      setInstructors(data);
    } catch (err) {
      setError(await friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstructors();
  }, []);

  // --- VENTANA ---
  const handleOpenCreate = () => {
    setCurrentInstructor({
      name: '', slug: '', experience_years: '', image: '', short_bio: '', description: '', vision: '',
      short_bio_en: '', description_en: '', vision_en: '',
      instagram: '', linkedin: '', website: '',
    });
    setTriedSave(false);
    setShowSocial(false);
    setOpenDialog(true);
  };

  const handleOpenEdit = (inst: Instructor) => {
    setCurrentInstructor({
      id: inst.id,
      name: inst.name,
      slug: inst.slug || '',
      experience_years: inst.experience_years ?? '',
      image: inst.image || '',
      short_bio: inst.short_bio || '',
      description: inst.description || '',
      vision: inst.vision || '',
      short_bio_en: inst.short_bio_en || '',
      description_en: inst.description_en || '',
      vision_en: inst.vision_en || '',
      instagram: inst.instagram || '',
      linkedin: inst.linkedin || '',
      website: inst.website || '',
    });
    setTriedSave(false);
    setShowSocial(Boolean(inst.instagram || inst.linkedin || inst.website));
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    if (saving || uploading) return;
    setOpenDialog(false);
    setCurrentInstructor(null);
  };

  const update = (patch: Partial<EditableInstructor>) =>
    setCurrentInstructor((prev) => (prev ? { ...prev, ...patch } : prev));

  const socialErrors = {
    instagram: !looksLikeUrl(normalizeInstagram(currentInstructor?.instagram || '')),
    linkedin: !looksLikeUrl(normalizeUrl(currentInstructor?.linkedin || '')),
    website: !looksLikeUrl(normalizeUrl(currentInstructor?.website || '')),
  };
  const nameError = triedSave && !currentInstructor?.name.trim();

  const handleSave = async () => {
    if (!currentInstructor) return;
    setTriedSave(true);
    if (!currentInstructor.name.trim()) return;
    if (socialErrors.instagram || socialErrors.linkedin || socialErrors.website) {
      setShowSocial(true);
      return;
    }

    const finalData = {
      ...currentInstructor,
      name: currentInstructor.name.trim(),
      experience_years: currentInstructor.experience_years === '' ? 0 : Number(currentInstructor.experience_years),
      instagram: normalizeInstagram(currentInstructor.instagram),
      linkedin: normalizeUrl(currentInstructor.linkedin),
      website: normalizeUrl(currentInstructor.website),
    };
    // La dirección interna se crea sola a partir del nombre si no tiene
    if (!finalData.slug) finalData.slug = generateSlug(finalData.name) || `instructor-${Date.now()}`;

    const url = currentInstructor.id
      ? `${API_BASE_URL}v1/instructors/${currentInstructor.id}/`
      : `${API_BASE_URL}v1/instructors/`;
    const method = currentInstructor.id ? 'PATCH' : 'POST';
    const send = () => fetch(url, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(finalData),
    });

    setSaving(true);
    try {
      let res = await send();
      // Dos personas con el mismo nombre (o una borrada): se prueba otra dirección interna
      if (!res.ok && res.status === 400 && !currentInstructor.id) {
        const err = await res.clone().json().catch(() => ({}));
        if (err?.slug) {
          finalData.slug = `${finalData.slug}-${Date.now().toString().slice(-4)}`;
          res = await send();
        }
      }
      if (!res.ok) throw res;
      notify(currentInstructor.id
        ? 'Instructor guardado ✓ Puede tardar unos 10 minutos en verse cambiado en la web.'
        : 'Instructor añadido ✓ Ya sale en «Nuestro equipo» y puedes elegirlo en las clases.');
      setOpenDialog(false);
      setCurrentInstructor(null);
      await fetchInstructors();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inst: Instructor) => {
    let classes: ClassTypeLite[] | null = null;
    let schedules: ScheduleLite[] | null = null;
    try {
      const [ct, sc] = await Promise.all([
        fetchList<ClassTypeLite>(`${API_BASE_URL}v1/class-types/?instructor=${inst.id}`),
        fetchList<ScheduleLite>(`${API_BASE_URL}v1/recurrences/?is_active=true`),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      classes = ct.filter((c) => c.instructor?.id === inst.id);
      schedules = sc.filter((s) => s.override_instructor?.id === inst.id && s.is_active && (!s.end_date || s.end_date >= today));
    } catch {
      classes = null;
      schedules = null;
    }
    const inUse = (classes?.length || 0) + (schedules?.length || 0) > 0;

    const ok = await confirm({
      title: `¿Borrar a ${inst.name}?`,
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>Dejará de salir en «Nuestro equipo» de la portada y ya no podrás elegirle en las clases.</p>
          {inUse && (
            <Box sx={{ my: 1.5, p: 1.5, borderRadius: 2, backgroundColor: 'rgba(212,165,116,0.14)' }}>
              <strong>Ojo: todavía da clases.</strong>
              <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>
                {classes?.slice(0, 4).map((c) => <li key={`c${c.id}`}>Profesor/a habitual de «{c.title}»</li>)}
                {schedules?.slice(0, 4).map((s, i) => (
                  <li key={`s${i}`}>
                    {s.class_type?.title || 'Clase'} del {s.weekday != null ? WEEKDAYS[s.weekday] : 'día suelto'} a las {s.start_time?.slice(0, 5)}
                  </li>
                ))}
              </ul>
              Su nombre <strong>seguirá saliendo</strong> en esas clases de la web. Antes de borrarle, pon a otra persona
              en «Tipos de clase» y en «Mis clases y horarios».
            </Box>
          )}
          {classes === null && (
            <p style={{ margin: '0 0 8px' }}>
              No hemos podido comprobar si da clases. Si las da, su nombre seguirá saliendo en ellas.
            </p>
          )}
          <p style={{ margin: 0 }}>Las reservas no se tocan. Si te equivocas, tu técnico puede recuperarle.</p>
        </>
      ),
      confirmText: inUse ? 'Sí, borrar igualmente' : 'Sí, borrar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}v1/instructors/${inst.id}/`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw res;
      notify(`${inst.name} borrado/a ✓`);
      await fetchInstructors();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    }
  };

  // --- FILTRADO ---
  const filteredInstructors = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return instructors;
    return instructors.filter((i) => i.name.toLowerCase().includes(q));
  }, [instructors, searchTerm]);

  const paginatedInstructors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInstructors.slice(start, start + pageSize);
  }, [filteredInstructors, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredInstructors.length / pageSize));
  const ci = currentInstructor;

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
      <PageIntro
        pageKey="instructors"
        title="Instructores"
        subtitle="Las personas que dan las clases. Salen en la portada de la web («Nuestro equipo»); al pulsar su foto se abre una ficha con todo lo que escribas aquí."
        actions={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Añadir un instructor
          </Button>
        )}
        steps={[
          { title: 'Pulsa «Añadir un instructor»', text: 'O «Editar» en la tarjeta de alguien que ya esté.' },
          { title: 'Escribe su nombre y sube su foto', text: 'Verás la foto recortada tal y como saldrá.' },
          { title: 'Cuenta algo sobre esa persona', text: 'Frase corta, «Sobre mí» y «Mi visión». Todo es opcional.' },
          { title: 'Pulsa «Guardar»', text: 'Saldrá un aviso verde abajo cuando esté guardado.' },
        ]}
        tips={[
          'Para decir quién da cada clase, ve a «Tipos de clase» (profesor/a habitual) o a «Mis clases y horarios» (sustituciones).',
          'Los cambios pueden tardar unos 10 minutos en verse en la web.',
        ]}
      />

      <TextField
        label="Buscar por nombre"
        placeholder="Escribe un nombre…"
        value={searchTerm}
        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
        fullWidth
        sx={{ mb: 3 }}
      />

      {loading ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }} role="status">
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>Cargando instructores…</Typography>
        </Stack>
      ) : error ? (
        <Alert
          severity="error"
          action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={fetchInstructors} sx={{ minHeight: 44 }}>Reintentar</Button>}
        >
          No se han podido cargar los instructores. {error}
        </Alert>
      ) : instructors.length === 0 ? (
        <Paper elevation={0} sx={{ borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
          <EmptyState
            icon={<SchoolOutlinedIcon />}
            title="Todavía no hay instructores"
            text="Añade a las personas que dan las clases para que salgan en la web."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate} sx={{ minHeight: 48 }}>Añadir el primero</Button>}
          />
        </Paper>
      ) : filteredInstructors.length === 0 ? (
        <EmptyState
          compact
          title="No hay nadie con ese nombre"
          text="Prueba con otra palabra o borra la búsqueda."
          action={<Button variant="outlined" onClick={() => setSearchTerm('')} sx={{ minHeight: 44 }}>Borrar la búsqueda</Button>}
        />
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            {paginatedInstructors.map((inst) => (
              <Paper
                key={inst.id}
                elevation={0}
                sx={{ p: 2, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)', display: 'flex', flexDirection: 'column', gap: 1.25 }}
              >
                <Stack direction="row" spacing={1.75} alignItems="center">
                  <Avatar
                    src={inst.image || undefined}
                    alt={inst.name}
                    sx={{ width: 64, height: 64, border: '2px solid rgb(var(--studio-primary-rgb) / 0.2)', fontSize: '1.4rem' }}
                  >
                    {inst.name[0]}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: '1.08rem' }}>{inst.name}</Typography>
                    <Typography sx={{ color: 'var(--studio-text-body)', fontSize: '0.9rem' }}>
                      {inst.experience_years > 0 ? `${inst.experience_years} años de experiencia` : 'Sin años de experiencia puestos'}
                    </Typography>
                  </Box>
                </Stack>
                <Typography sx={{ color: inst.short_bio ? 'var(--studio-text-strong)' : 'var(--studio-text-hint)', fontSize: '0.92rem', fontStyle: inst.short_bio ? 'normal' : 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {inst.short_bio || 'Sin frase de presentación'}
                </Typography>
                {!inst.image && (
                  <Typography sx={{ color: 'var(--studio-danger-text, #A86B5E)', fontSize: '0.88rem' }}>Le falta la foto</Typography>
                )}
                <Box sx={{ '&:empty': { display: 'none' } }}>
                  <EnglishChip
                    pairs={[[inst.short_bio, inst.short_bio_en], [inst.description, inst.description_en], [inst.vision, inst.vision_en]]}
                  />
                </Box>
                <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
                  <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => handleOpenEdit(inst)} sx={{ minHeight: 44, flex: 1 }}>
                    Editar
                  </Button>
                  <Button variant="text" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(inst)} sx={{ minHeight: 44 }}>
                    Borrar
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Box>
          {totalPages > 1 && (
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={(_, p) => setCurrentPage(p)}
              size="large"
              sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
            />
          )}
        </>
      )}

      {/* --- VENTANA CREAR / EDITAR --- */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth scroll="body">
        <DialogTitle>{ci?.id ? `Editar a ${ci.name || 'instructor'}` : 'Añadir un instructor'}</DialogTitle>
        <DialogContent>
          {ci && (
            <>
              <FormStep n={1} title="¿Cómo se llama?">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    required
                    label="Nombre y apellidos"
                    value={ci.name}
                    onChange={(e) => update({ name: e.target.value })}
                    inputProps={{ maxLength: 120 }}
                    error={nameError}
                    helperText={nameError ? 'Escribe su nombre.' : 'Ej.: «Laura Martín». Sale debajo de su foto en la web.'}
                  />
                  <TextField
                    label="Años de experiencia"
                    type="number"
                    value={ci.experience_years}
                    onChange={(e) => update({ experience_years: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
                    inputProps={{ min: 0 }}
                    helperText="Sale como «8 años de experiencia». Con 0 no se muestra."
                    sx={{ width: { xs: '100%', sm: 260 }, flexShrink: 0 }}
                  />
                </Stack>
              </FormStep>

              <FormStep n={2} title="Su foto" hint="Sale en su tarjeta de «Nuestro equipo» y en su ficha.">
                <PhotoPicker
                  value={ci.image}
                  onChange={(url) => update({ image: url })}
                  onBusyChange={setUploading}
                  aspect="5 / 6"
                  objectPosition="top"
                  previewWidth={220}
                  allowRemove
                  shapeHint="Mejor una foto vertical (de pie) con la cara en la parte de arriba: la web recorta la parte de abajo y los lados."
                />
              </FormStep>

              <FormStep n={3} title="Qué cuenta la web de esta persona" hint="Todo es opcional. Si un texto está vacío, ese apartado no sale.">
                <Stack spacing={2.25}>
                  <TextField
                    fullWidth
                    label="Frase de presentación"
                    value={ci.short_bio}
                    onChange={(e) => update({ short_bio: e.target.value })}
                    inputProps={{ maxLength: 240 }}
                    helperText={`Sale debajo de su nombre en la tarjeta. Ej.: «Instructora de Pilates Reformer y suelo». ${ci.short_bio.length}/240`}
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Sobre mí"
                    value={ci.description}
                    onChange={(e) => update({ description: e.target.value })}
                    helperText="Sale en su ficha (al pulsar su foto en la web), con el título «Sobre mí»."
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="Mi visión"
                    value={ci.vision}
                    onChange={(e) => update({ vision: e.target.value })}
                    helperText="Sale en su ficha, en un recuadro con el título «Mi visión». Ej.: su forma de entender el movimiento."
                  />
                </Stack>
              </FormStep>

              <EnglishVersion
                pairs={[[ci.short_bio, ci.short_bio_en], [ci.description, ci.description_en], [ci.vision, ci.vision_en]]}
              >
                <EnglishField
                  label="Frase de presentación en inglés"
                  es={ci.short_bio}
                  value={ci.short_bio_en}
                  onChange={(v) => update({ short_bio_en: v })}
                  maxLength={240}
                />
                <EnglishField
                  label="«Sobre mí» en inglés"
                  es={ci.description}
                  value={ci.description_en}
                  onChange={(v) => update({ description_en: v })}
                  multiline
                />
                <EnglishField
                  label="«Mi visión» en inglés"
                  es={ci.vision}
                  value={ci.vision_en}
                  onChange={(v) => update({ vision_en: v })}
                  multiline
                />
              </EnglishVersion>

              <Button variant="text" onClick={() => setShowSocial((s) => !s)} sx={{ minHeight: 44 }}>
                {showSocial ? 'Ocultar redes sociales' : 'Redes sociales (si quieres)'}
              </Button>
              <Collapse in={showSocial}>
                <Stack spacing={2} sx={{ mt: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '0.95rem' }}>
                      Salen como iconos en su tarjeta y en su ficha.
                    </Typography>
                    <HelpTip title="¿Qué pongo aquí?">
                      En Instagram puedes poner solo el usuario, por ejemplo <strong>@laura.pilates</strong>, y
                      nosotros lo convertimos en su enlace. En web y LinkedIn copia la dirección de la barra del navegador.
                    </HelpTip>
                  </Stack>
                  <TextField
                    fullWidth
                    label="Instagram"
                    placeholder="@usuario"
                    value={ci.instagram}
                    onChange={(e) => update({ instagram: e.target.value })}
                    error={socialErrors.instagram}
                    helperText={socialErrors.instagram ? 'No parece un usuario de Instagram. Ej.: @laura.pilates' : 'Ej.: @laura.pilates'}
                    InputProps={{ startAdornment: <InputAdornment position="start"><InstagramIcon color="action" /></InputAdornment> }}
                  />
                  <TextField
                    fullWidth
                    label="LinkedIn"
                    placeholder="linkedin.com/in/…"
                    value={ci.linkedin}
                    onChange={(e) => update({ linkedin: e.target.value })}
                    error={socialErrors.linkedin}
                    helperText={socialErrors.linkedin ? 'Copia la dirección de su perfil de LinkedIn.' : 'Solo sale en su ficha.'}
                    InputProps={{ startAdornment: <InputAdornment position="start"><LinkedInIcon color="action" /></InputAdornment> }}
                  />
                  <TextField
                    fullWidth
                    label="Página web propia"
                    placeholder="www.…"
                    value={ci.website}
                    onChange={(e) => update({ website: e.target.value })}
                    error={socialErrors.website}
                    helperText={socialErrors.website ? 'No parece una dirección de página web. Ej.: www.laurapilates.com' : 'Ej.: www.laurapilates.com'}
                    InputProps={{ startAdornment: <InputAdornment position="start"><LanguageIcon color="action" /></InputAdornment> }}
                  />
                </Stack>
              </Collapse>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch' }}>
          <Button variant="outlined" onClick={handleCloseDialog} disabled={saving || uploading} sx={{ minHeight: 48 }}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || uploading} sx={{ minHeight: 48, ml: '0 !important' }}>
            {uploading ? 'Esperando a la foto…' : saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
