import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, Collapse, LinearProgress, Link, Paper, Stack, TextField,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNotify } from '../components/guide';
import StudioSection from '../components/setup/StudioSection';
import StyleSection, { StylePreview } from '../components/setup/StyleSection';
import { loadSettings, saveSettings, type StudioSettings } from '../components/setup/api';
import { API_BASE_URL } from '../config';
import { useSite, useStudioWebUrl } from '../site/SiteProvider';
import StudioIcon from '../site/StudioIcon';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';
import type { StepState } from './api';
import { ClassTemplatesDialog, ClassTemplatesPicker } from './ClassTemplates';
import { ITEM_TEXT, MISSING_TEXT, STEP_COPY, UI, fill, type StepKey } from './copy';
import { stepRoute, withGuide, nextPendingStep } from './guide';
import { useSetupProgress } from './progressContext';
import QuickRoomDialog from './QuickRoomDialog';
import WebPreview, { WebPreviewButton } from './WebPreview';

const STUDIO_FIELDS = [
  'studio_name', 'tagline', 'logo_url', 'icon_url', 'phone', 'whatsapp', 'contact_email', 'instagram',
  'address', 'city', 'postal_code', 'area_served', 'maps_url', 'country', 'currency',
] as const;
const STYLE_FIELDS = [
  'style_preset', 'icon_style', 'color_primary', 'color_secondary', 'color_dark', 'color_background', 'font_heading', 'font_body',
] as const;

/** Qué página de la web enseña la vista previa en cada paso (sin vista previa: no está). */
const PREVIEW_PATH: Partial<Record<StepKey, string>> = {
  studio: '/', class_types: '/classes', schedule: '/calendar', plans: '/prices', content: '/', google: '/', launch: '/',
};

const pick = <K extends keyof StudioSettings>(s: StudioSettings, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, s[k]])) as Pick<StudioSettings, K>;

const STATUS_TEXT: Record<StepState['status'], string> = {
  done: UI.statusDone, skipped: UI.statusSkipped, todo: UI.statusTodo, blocked: UI.statusBlocked,
};

function StatusChip({ s }: { s: StepState }) {
  if (s.status === 'done') return <Chip size="small" color="success" label={UI.statusDone} />;
  if (s.status === 'skipped') return <Chip size="small" variant="outlined" label={UI.statusSkipped} />;
  if (s.status === 'blocked') return <Chip size="small" variant="outlined" color="warning" label={UI.statusBlocked} />;
  return <Chip size="small" variant="outlined" label={UI.statusTodo} />;
}

function StepIcon({ s, n }: { s: StepState; n: number }) {
  if (s.status === 'done') return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 32 }} />;
  if (s.status === 'blocked') return <LockOutlinedIcon sx={{ color: 'text.disabled', fontSize: 28 }} />;
  if (s.status === 'skipped') return <RadioButtonUncheckedIcon sx={{ color: 'text.disabled', fontSize: 32 }} />;
  return (
    <Box sx={{
      width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700,
      backgroundColor: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)',
    }}>{n}</Box>
  );
}

/** Lista de sub-tareas con su enlace. */
function Items({ s }: { s: StepState }) {
  if (!s.items.length) return null;
  return (
    <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {s.items.map((it) => {
        const text = ITEM_TEXT[it.key];
        if (!text) return null;
        return (
          <Stack component="li" key={it.key} direction="row" spacing={1} alignItems="center">
            {it.done
              ? <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} aria-label="Hecho" />
              : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: 'text.disabled' }} aria-label="Pendiente" />}
            <Link component={RouterLink} to={withGuide(text.route)} sx={{ py: 1, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              {text.label}
            </Link>
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * /puesta-en-marcha — todos los pasos en orden, con su estado, qué son, por
 * qué importan y lo necesario para hacerlos (aquí mismo o en su pantalla).
 * El asistente de bienvenida termina aquí. En ordenador, a la derecha, cómo
 * queda la web.
 */
export default function GuidePage() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const { progress, refresh, setStatus, publish } = useSetupProgress();
  const [params, setParams] = useSearchParams();
  const notify = useNotify();
  const site = useSite();
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refs = useRef<Partial<Record<StepKey, HTMLDivElement | null>>>({});

  const open = (params.get('paso') as StepKey | null) || progress?.next_step || null;
  const setOpen = useCallback((key: StepKey | null, scroll = true) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (key) p.set('paso', key); else p.delete('paso');
      return p;
    }, { replace: true });
    if (key && scroll) setTimeout(() => refs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }, [setParams]);

  useEffect(() => { refresh(); }, [refresh]);

  // Al llegar con ?paso=…, el paso abierto a la vista
  const firstScroll = useRef(false);
  useEffect(() => {
    if (firstScroll.current || !progress || !open) return;
    firstScroll.current = true;
    if (params.get('paso')) setTimeout(() => refs.current[open]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [progress, open, params]);

  // Los ajustes (nombre, estilo…) se cargan solo si se abre uno de esos pasos
  useEffect(() => {
    if (settings || (open !== 'studio' && open !== 'style')) return;
    loadSettings().then(setSettings).catch((e) => setSettingsError(e instanceof Error ? e.message : String(e)));
  }, [open, settings]);

  if (!progress) {
    return <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress aria-label="Cargando la guía" /></Stack>;
  }

  const update = (patch: Partial<StudioSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const goNext = (from: StepKey) => {
    const n = nextPendingStep(progress, from);
    setOpen(n ? n.key : null);
  };

  const saveFields = async (fields: readonly (keyof StudioSettings)[], after?: () => Promise<unknown>) => {
    if (!settings) return false;
    setBusy(true);
    try {
      const saved = await saveSettings(pick(settings, fields));
      setSettings(saved);
      await site.refresh();
      if (after) await after();
      notify(UI.saved);
      setReloadKey((k) => k + 1);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const mark = async (key: StepKey, status: 'done' | 'skipped' | 'todo') => {
    setBusy(true);
    try {
      const p = await setStatus(key, status);
      if (status !== 'todo') {
        const n = nextPendingStep(p, key);
        setOpen(n ? n.key : null);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      await publish();
      notify(UI.published);
      setReloadKey((k) => k + 1);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Tras guardar «Tu estudio» o «Tu estilo»: progreso nuevo y al siguiente paso
  const goNextAfterSave = (from: StepKey) => {
    refresh().then((p) => {
      const n = p ? nextPendingStep(p, from) : undefined;
      setOpen(n ? n.key : null);
    });
  };

  const pct = Math.round((progress.done_count / progress.total) * 100);
  const previewPath = open ? PREVIEW_PATH[open] : undefined;
  const showSide = wide && (open === 'style' ? Boolean(settings) : Boolean(previewPath));

  const body = (s: StepState): ReactNode => {
    switch (s.key) {
      case 'studio':
        return settingsError ? <Alert severity="error">{settingsError}</Alert> : !settings ? <CircularProgress /> : (
          <Stack spacing={2.5}>
            {s.missing.length > 0 && (
              <Alert severity="info">Falta: {s.missing.map((m) => MISSING_TEXT[m] || m).join(', ')}.</Alert>
            )}
            <StudioSection value={settings} onChange={update} onBusyChange={setUploading} />
            <Box>
              <Button variant="contained" size="large" disabled={busy || uploading || !settings.studio_name.trim()}
                onClick={async () => { if (await saveFields(STUDIO_FIELDS)) goNextAfterSave('studio'); }}
                sx={{ minHeight: 48 }}>
                Guardar y seguir
              </Button>
            </Box>
          </Stack>
        );
      case 'style':
        return settingsError ? <Alert severity="error">{settingsError}</Alert> : !settings ? <CircularProgress /> : (
          <Stack spacing={2.5}>
            <StyleSection value={settings} onChange={update} hidePreview={wide} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button variant="contained" size="large" disabled={busy} sx={{ minHeight: 48 }}
                onClick={async () => { if (await saveFields(STYLE_FIELDS, () => setStatus('style', 'done'))) goNextAfterSave('style'); }}>
                {UI.likeStyle}
              </Button>
            </Stack>
          </Stack>
        );
      case 'rooms':
        return <RoomsQuick />;
      case 'instructors':
        return <InstructorsQuick />;
      case 'class_types':
        return (
          <Stack spacing={2}>
            <ClassTemplatesPicker onCreated={() => setReloadKey((k) => k + 1)} />
            <Typography color="text.secondary">
              ¿Una clase que no está en la lista? <Link component={RouterLink} to={withGuide('/classes?accion=nueva')}>Créala a mano en «Tipos de clase»</Link>,
              donde también puedes poner foto y precio a cada una.
            </Typography>
          </Stack>
        );
      case 'schedule':
        return <SchedulePrereqs s={s} />;
      case 'plans':
        return (
          <Stack spacing={1.5} alignItems="flex-start">
            <Typography>Lo más habitual: un <b>bono de 5 o 10 clases</b> y una <b>membresía mensual</b>. Cada clase gasta sus créditos (Reformer suele gastar 2).</Typography>
            <Button variant="contained" component={RouterLink} to={withGuide('/plans?accion=nueva')} sx={{ minHeight: 48 }}>
              Crear un bono o una membresía
            </Button>
          </Stack>
        );
      case 'payments':
      case 'content':
        return <Items s={s} />;
      case 'google':
        return <GoogleHelp s={s} />;
      case 'launch':
        return <Launch s={s} busy={busy} onPublish={doPublish} />;
      default:
        return null;
    }
  };

  return (
    <Box sx={{ maxWidth: showSide ? 1400 : 980, mx: 'auto' }}>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.7rem', md: '2.2rem' } }}>{UI.guideTitle}</Typography>
      <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: { xs: '0.98rem', md: '1.05rem' }, maxWidth: 760, lineHeight: 1.6 }}>
        {UI.guideSubtitle}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2, mb: 3 }}>
        <LinearProgress variant="determinate" value={pct} aria-label={UI.progress(progress.done_count, progress.total)}
          sx={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgb(var(--studio-primary-rgb) / 0.15)' }} />
        <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{UI.progress(progress.done_count, progress.total)}</Typography>
      </Stack>

      {progress.published ? (
        <Alert severity="success" sx={{ mb: 3 }}>{UI.published}</Alert>
      ) : progress.can_publish ? (
        <Alert severity="success" sx={{ mb: 3 }} action={
          <Button color="inherit" variant="outlined" onClick={() => setOpen('launch')} sx={{ minHeight: 44 }}>{UI.publish}</Button>
        }>
          {UI.readyToPublish}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>{UI.publishHelp}</Alert>
      )}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: showSide ? 'minmax(0, 1fr) 440px' : 'minmax(0, 1fr)', alignItems: 'start' }}>
        <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {progress.steps.map((s, i) => {
            const copy = STEP_COPY[s.key];
            const expanded = open === s.key;
            const headId = `paso-${s.key}`;
            return (
              <Paper
                component="li"
                key={s.key}
                ref={(el: HTMLLIElement | null) => { refs.current[s.key] = el as unknown as HTMLDivElement; }}
                elevation={0}
                sx={{
                  borderRadius: 4, overflow: 'hidden', scrollMarginTop: 80,
                  border: expanded ? '2px solid var(--studio-primary)' : '1.5px solid rgb(var(--studio-line-rgb) / 0.3)',
                }}
              >
                <ButtonBase
                  id={headId}
                  onClick={() => setOpen(expanded ? null : s.key, false)}
                  aria-expanded={expanded}
                  aria-controls={`${headId}-body`}
                  sx={{
                    width: '100%', textAlign: 'left', justifyContent: 'flex-start', gap: 1.75, p: { xs: 1.75, md: 2 }, minHeight: 64,
                    '&:focus-visible': { outline: '3px solid var(--studio-primary)', outlineOffset: -3 },
                  }}
                >
                  <Box aria-hidden sx={{ flexShrink: 0, width: 36, display: 'grid', placeItems: 'center' }}><StepIcon s={s} n={i + 1} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: { xs: '1.02rem', md: '1.1rem' }, color: 'var(--studio-dark)', lineHeight: 1.3 }}>
                      <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                        {UI.stepOf(i + 1, progress.total)}:{' '}
                      </Box>
                      {copy.label}
                    </Typography>
                    <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>
                      {s.required ? UI.required : s.key === 'launch' ? UI.finalStep : UI.optional}
                      {s.done && s.count != null ? ` · ${fill(copy.doneText, s.count)}` : ''}
                    </Typography>
                  </Box>
                  {/* En el móvil el icono de la izquierda ya dice el estado (y el lector de pantalla lo lee aquí) */}
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}><StatusChip s={s} /></Box>
                  <Box component="span" sx={{ display: { sm: 'none' }, position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    {STATUS_TEXT[s.status]}
                  </Box>
                  <ExpandMoreIcon aria-hidden sx={{ transition: 'transform .2s', transform: expanded ? 'rotate(180deg)' : 'none', color: 'text.secondary' }} />
                </ButtonBase>
                <Collapse in={expanded} unmountOnExit>
                  <Box id={`${headId}-body`} role="region" aria-labelledby={headId} sx={{ px: { xs: 2, md: 3 }, pb: 3, pt: 0.5 }}>
                    <Typography sx={{ color: 'var(--studio-text-strong)', lineHeight: 1.6 }}>{copy.what}</Typography>
                    <Typography sx={{ mt: 1, color: 'var(--studio-text-body)', lineHeight: 1.6 }}><b>{UI.why}:</b> {copy.why}</Typography>
                    <Typography sx={{ mt: 0.75, mb: 2.5, color: 'var(--studio-text-body)', lineHeight: 1.6 }}>
                      <b>{UI.example}:</b> <i>{copy.example}</i>
                    </Typography>
                    {s.sample && <Alert severity="info" sx={{ mb: 2 }}>{UI.sampleWarning}</Alert>}
                    {s.done && s.key !== 'launch' && <Alert severity="success" sx={{ mb: 2 }}>{fill(copy.doneText, s.count)}</Alert>}
                    {body(s)}
                    {!wide && PREVIEW_PATH[s.key] && s.key !== 'launch' && (
                      <Box sx={{ mt: 2 }}><WebPreviewButton path={PREVIEW_PATH[s.key]} reloadKey={reloadKey} /></Box>
                    )}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
                      {!['studio', 'style', 'launch', 'payments', 'content', 'google'].includes(s.key) && (
                        <Button variant={s.done ? 'outlined' : 'contained'} component={RouterLink} to={stepRoute(s.key)} sx={{ minHeight: 48 }}
                          endIcon={<StudioIcon name="next" />}>
                          {copy.cta}
                        </Button>
                      )}
                      {s.can_skip && s.status !== 'done' && s.status !== 'skipped' && (
                        <>
                          <Button variant="outlined" disabled={busy} onClick={() => mark(s.key, 'done')} sx={{ minHeight: 48 }}>{UI.markDone}</Button>
                          <Button disabled={busy} onClick={() => mark(s.key, 'skipped')} sx={{ minHeight: 48 }}>{UI.skip}</Button>
                        </>
                      )}
                      {s.status === 'skipped' && (
                        <Button disabled={busy} onClick={() => mark(s.key, 'todo')} sx={{ minHeight: 48 }}>{UI.unskip}</Button>
                      )}
                      {(s.done || s.status === 'skipped') && nextPendingStep(progress, s.key) && (
                        <Button variant="contained" onClick={() => goNext(s.key)} sx={{ minHeight: 48 }} endIcon={<StudioIcon name="next" />}>
                          {UI.next(STEP_COPY[nextPendingStep(progress, s.key)!.key].label)}
                        </Button>
                      )}
                    </Stack>
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>

        {showSide && (
          <Box sx={{ position: 'sticky', top: 88 }}>
            <Typography sx={{ fontWeight: 600, mb: 1, color: 'var(--studio-dark)' }}>
              {open === 'style' ? UI.previewLive : UI.previewTitle}
            </Typography>
            {open === 'style' && settings
              ? <StylePreview value={settings} />
              : <WebPreview path={previewPath} reloadKey={reloadKey} height="calc(100vh - 170px)" />}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ── Salas: «Sala principal» ya creada, editable aquí mismo ──────────────────

interface RoomLite { id: number; name: string; capacity: number }

function RoomsQuick() {
  const notify = useNotify();
  const [rooms, setRooms] = useState<RoomLite[] | null>(null);
  const [edits, setEdits] = useState<Record<number, { name: string; capacity: string }>>({});
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}v1/rooms/`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setRooms(Array.isArray(d) ? d : d.results || []))
      .catch(() => setRooms([]));
  }, []);
  useEffect(load, [load]);

  const save = async (room: RoomLite) => {
    const e = edits[room.id];
    if (!e) return;
    try {
      const res = await fetch(`${API_BASE_URL}v1/rooms/${room.id}/`, {
        method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: e.name.trim(), capacity: Number(e.capacity) }),
      });
      if (!res.ok) throw res;
      notify(`Sala «${e.name.trim()}» guardada ✓`);
      setEdits((x) => { const n = { ...x }; delete n[room.id]; return n; });
      load();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    }
  };

  if (!rooms) return <CircularProgress aria-label="Cargando salas" />;
  return (
    <Stack spacing={1.5}>
      {rooms.length === 0 ? (
        <Typography>Aún no tienes ninguna sala. Crea la tuya: basta con un nombre y las plazas.</Typography>
      ) : (
        <Typography>Ya hemos creado tu sala. Cámbiale el nombre o las plazas si quieres, o añade otra si tienes más de una.</Typography>
      )}
      {rooms.map((r) => {
        const e = edits[r.id] || { name: r.name, capacity: String(r.capacity) };
        const dirty = Boolean(edits[r.id]);
        return (
          <Stack key={r.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'center' }}>
            <TextField label="Nombre de la sala" value={e.name} size="small" sx={{ flex: 1 }}
              onChange={(ev) => setEdits((x) => ({ ...x, [r.id]: { ...e, name: ev.target.value } }))} />
            <TextField label="Plazas" type="number" value={e.capacity} size="small" sx={{ width: { sm: 110 } }}
              inputProps={{ min: 1 }}
              onChange={(ev) => setEdits((x) => ({ ...x, [r.id]: { ...e, capacity: ev.target.value } }))} />
            <Button variant="outlined" disabled={!dirty || !e.name.trim() || !(Number(e.capacity) >= 1)} onClick={() => save(r)} sx={{ minHeight: 44 }}>
              {UI.save}
            </Button>
          </Stack>
        );
      })}
      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
        <Button variant={rooms.length ? 'text' : 'contained'} startIcon={<StudioIcon name="add" />} onClick={() => setAdding(true)} sx={{ minHeight: 44 }}>
          {rooms.length ? 'Añadir otra sala' : 'Crear mi sala'}
        </Button>
        <Button component={RouterLink} to={withGuide('/rooms')} sx={{ minHeight: 44 }}>Fotos y descripción de las salas</Button>
      </Stack>
      <QuickRoomDialog open={adding} onClose={() => setAdding(false)} onCreated={load} />
    </Stack>
  );
}

// ── Profesores: añadir uno rápido (nombre y una frase) ──────────────────────

const slugify = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function InstructorsQuick() {
  const notify = useNotify();
  const [list, setList] = useState<{ id: number; name: string }[] | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}v1/instructors/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setList(Array.isArray(d) ? d : d.results || []))
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}v1/instructors/`, {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: name.trim(), slug: `${slugify(name) || 'profesor'}-${Date.now().toString(36)}`, short_bio: bio.trim() || null }),
      });
      if (!res.ok) throw res;
      notify(`${name.trim()} añadido/a ✓`);
      setName(''); setBio('');
      load();
    } catch (err) {
      notify(await friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.75}>
      {list && list.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap aria-label="Profesores">
          {list.map((i) => <Chip key={i.id} label={i.name} />)}
        </Stack>
      )}
      <Typography>Añade a alguien ahora con su nombre y una frase. La foto y la presentación completa, en «Profesores».</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} size="small" sx={{ flex: 1 }} inputProps={{ maxLength: 120 }} />
        <TextField label="Una frase sobre ella o él (opcional)" value={bio} onChange={(e) => setBio(e.target.value)} size="small" sx={{ flex: 2 }}
          inputProps={{ maxLength: 240 }} placeholder="Instructora de Pilates desde 2015" />
        <Button variant="contained" disabled={!name.trim() || saving} onClick={add} sx={{ minHeight: 44 }}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <StudioIcon name="add" />}>
          Añadir
        </Button>
      </Stack>
    </Stack>
  );
}

// ── Horario: lo que falta antes y el botón para empezar ─────────────────────

function SchedulePrereqs({ s }: { s: StepState }) {
  const [rooms, setRooms] = useState(false);
  const [templates, setTemplates] = useState(false);
  if (s.status !== 'blocked') {
    return (
      <Typography>
        Pulsa <b>«{STEP_COPY.schedule.cta}»</b> y después <b>«Añadir una clase»</b>: eliges la clase, el día, la hora, la sala y las plazas.
        Si es semanal, se repite sola cada semana.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5}>
      <Alert severity="warning">{UI.blockedBy(s.blocked_by.map((k) => STEP_COPY[k].label).join(' y '))}</Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        {s.blocked_by.includes('rooms') && (
          <Button variant="contained" onClick={() => setRooms(true)} sx={{ minHeight: 48 }}>Crear una sala</Button>
        )}
        {s.blocked_by.includes('class_types') && (
          <Button variant="contained" onClick={() => setTemplates(true)} sx={{ minHeight: 48 }}>Crear un tipo de clase</Button>
        )}
      </Stack>
      <QuickRoomDialog open={rooms} onClose={() => setRooms(false)} />
      <ClassTemplatesDialog open={templates} onClose={() => setTemplates(false)} />
    </Stack>
  );
}

// ── Google: ficha de Google Maps, Search Console y dominio ──────────────────

function GoogleHelp({ s }: { s: StepState }) {
  return (
    <Stack spacing={2}>
      <Box component="ol" sx={{ pl: 2.5, m: 0, '& li': { mb: 1.25, lineHeight: 1.6 } }}>
        <li>
          <b>Tu ficha de Google (Google Maps).</b> Entra en{' '}
          <Link href="https://business.google.com/create" target="_blank" rel="noopener">Google Business Profile</Link>{' '}
          con tu cuenta de Google, busca tu estudio y pulsa «Reclamar» (o créala). Categoría: «Estudio de pilates» o
          «Centro de yoga». Usa el mismo nombre, dirección y teléfono que en tu web, y pon tu web en el campo «Sitio web».
          Google te enviará un código para verificar que el negocio es tuyo. Después copia el enlace de tu ficha y pégalo en{' '}
          <Link component={RouterLink} to={withGuide('/ajustes?tab=google')}>Ajustes → Google y anuncios</Link>.
        </li>
        <li>
          <b>Avisa a Google de que la web es tuya.</b> En{' '}
          <Link href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</Link>{' '}
          añade tu web como «Prefijo de la URL», elige el método «Etiqueta HTML» y pega el código en{' '}
          <Link component={RouterLink} to={withGuide('/ajustes?tab=google')}>Ajustes → Google y anuncios</Link>. Vuelve a Search
          Console y pulsa «Verificar». Así verás qué buscan para encontrarte.
        </li>
        <li>
          <b>Tu propio dominio (opcional).</b> Una dirección como <i>www.tuestudio.com</i> da más confianza y es más fácil de
          recordar. Se compra en un registrador (unos 10-15 € al año) y se conecta en{' '}
          <Link component={RouterLink} to={withGuide('/ajustes?tab=dominio')}>Ajustes → Tu dominio</Link>, donde te explicamos cada paso.
        </li>
      </Box>
      <Items s={s} />
    </Stack>
  );
}

// ── Prueba y lanzamiento ─────────────────────────────────────────────────────

function Launch({ s, busy, onPublish }: { s: StepState; busy: boolean; onPublish: () => void }) {
  const webUrl = useStudioWebUrl();
  const notify = useNotify();
  const navigate = useNavigate();
  const { progress } = useSetupProgress();
  if (!progress) return null;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(webUrl); notify('Enlace copiado ✓'); } catch { notify(webUrl, 'info'); }
  };
  const missing = progress.missing_to_publish.map((k) => STEP_COPY[k].label).join(', ');
  return (
    <Stack spacing={2.5}>
      <Box component="ol" sx={{ pl: 2.5, m: 0, '& li': { mb: 1.5, lineHeight: 1.6 } }}>
        <li>
          <b>Haz una reserva de prueba</b> como si fueras una clienta: abre tu web en el móvil, crea una cuenta con otro
          email y reserva una clase. Comprueba que te llega el email y después cancélala desde «Mi cuenta».
          <Box sx={{ mt: 1 }}>
            <Button variant="outlined" href={`${webUrl}/calendar`} target="_blank" rel="noopener"
              endIcon={<OpenInNewIcon />} disabled={!webUrl} sx={{ minHeight: 44 }}>
              Abrir el horario de mi web
            </Button>
          </Box>
        </li>
        <li>
          <b>Da de alta a tus clientas</b> de siempre (con sus créditos si ya tienen un bono), o pídeles que se registren en
          tu web: les llegará un email para confirmar su cuenta.
          <Box sx={{ mt: 1 }}>
            <Button variant="outlined" onClick={() => navigate(withGuide('/clients?accion=nueva'))} sx={{ minHeight: 44 }}>
              Dar de alta a una clienta
            </Button>
          </Box>
        </li>
        <li>
          <b>Comparte tu web</b> en tu Instagram, en tu estado de WhatsApp y en la puerta del estudio (en Ajustes → Avisos al
          móvil tienes un cartel con QR para imprimir).
          {webUrl && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
              <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyLink} sx={{ minHeight: 44 }}>Copiar el enlace</Button>
              <Button variant="outlined" href={`https://wa.me/?text=${encodeURIComponent(`Ya puedes reservar tus clases aquí: ${webUrl}`)}`}
                target="_blank" rel="noopener" sx={{ minHeight: 44 }}>
                Enviar por WhatsApp
              </Button>
            </Stack>
          )}
        </li>
        <li>
          <b>Publica tu web</b> para que Google pueda enseñarla. {UI.publishHelp}
        </li>
      </Box>
      <Items s={s} />
      {progress.published ? (
        <Alert severity="success">{UI.published}</Alert>
      ) : (
        <Stack spacing={1.25} alignItems="flex-start">
          {!progress.can_publish && <Alert severity="warning">{UI.publishMissing(missing)}</Alert>}
          <Button
            variant="contained" size="large" disabled={!progress.can_publish || busy} onClick={onPublish}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <StudioIcon name="launch" />}
            sx={{ minHeight: 52, px: 4 }}
          >
            {UI.publish}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
