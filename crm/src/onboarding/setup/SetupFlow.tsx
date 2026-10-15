import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Typography, useMediaQuery } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useSite, useStudioWebUrl } from '../../site/SiteProvider';
import { useNotify } from '../../components/guide';
import { StudioMark } from '../../components/shell/Sidebar';
import StyleSection from '../../components/setup/StyleSection';
import { loadSettings, saveSettings, STYLE_FIELDS, type StudioSettings } from '../../components/setup/api';
import { paletteBySlug, styleEntry } from '../../design/tokens';
import { confirmFlowStep, setSetupLater, type PackSuggestion, type WeekData } from '../api';
import { WELCOME_STATE } from '../coach/CoachProvider';
import { FLOW, setupStepLink } from '../flow';
import { useSetupProgress } from '../progressContext';
import { useAutosave, useDebouncedSave, type SaveStatus } from './autosave';
import { AutosaveProvider } from './AutosaveProvider';
import SiteMock from './SiteMock';
import StepClasses from './StepClasses';
import StepInstructors from './StepInstructors';
import StepPacks from './StepPacks';
import { PublishReview, Published } from './StepPublish';
import StepRooms from './StepRooms';
import StepSchedule from './StepSchedule';
import StepStudio from './StepStudio';
import { StepHead } from './ui';

// ====================================================================
// Puesta en marcha OBLIGATORIA (pantalla completa, sin menú): 8 pasos, una
// tarea en cada uno, «Paso N de 8», Continuar / Atrás, «Guardar y seguir
// luego» y «Se guarda solo». No se puede saltar ningún paso: se llega hasta
// el primero sin terminar (progress.flow.reached) y se puede volver atrás.
// Al publicar: enhorabuena con enlace y QR, y «Entrar a mi panel» abre la
// visita guiada de bienvenida.
// ====================================================================

const HEADS: { title: string; subtitle: string }[] = [
  { title: '¿Cómo se llama tu estudio?', subtitle: 'Así te verán tus clientas en tu web y en la app.' },
  { title: 'Elige tu estilo', subtitle: 'Tu web y tu panel se verán así. Puedes cambiarlo cuando quieras.' },
  { title: '¿Dónde das las clases?', subtitle: 'Añade tus salas y cuántas personas caben.' },
  { title: '¿Quién da las clases?', subtitle: 'Tus clientas verán su nombre en el horario.' },
  { title: '¿Qué clases ofreces?', subtitle: 'Elige todas las que quieras. Luego puedes cambiarlas.' },
  { title: 'Tu semana tipo', subtitle: 'Toca un hueco para poner una clase. Se repite cada semana.' },
  { title: 'Tus bonos', subtitle: 'Te sugerimos estos. Ajusta el precio y elige cuáles ofrecer.' },
  { title: 'Todo listo para abrir', subtitle: 'Revisa y publica. Podrás cambiar cualquier cosa después.' },
];

const STUDIO_FIELDS: (keyof StudioSettings)[] = ['studio_name', 'city', 'address', 'phone', 'whatsapp', 'contact_email', 'logo_url'];

export default function SetupFlow() {
  return (
    <AutosaveProvider>
      <SetupFrame />
    </AutosaveProvider>
  );
}

function SetupFrame() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const site = useSite();
  const webUrl = useStudioWebUrl();
  const notify = useNotify();
  const { progress, ready, apply, publish, refresh } = useSetupProgress();
  const { status, flush, runGuard, track } = useAutosave();
  const wide = useMediaQuery('(min-width:1100px)', { noSsr: true });
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [justPublished, setJustPublished] = useState(false);
  const [classes, setClasses] = useState<WeekData['class_types']>([]);
  const [packs, setPacks] = useState<{ list: PackSuggestion[]; currency: string }>({ list: [], currency: 'EUR' });
  const headRef = useRef<HTMLHeadingElement>(null);
  const pendingPatch = useRef<Partial<StudioSettings>>({});
  const publishing = useRef(false);

  useEffect(() => {
    loadSettings().then(setSettings).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const reached = Math.min(progress?.flow?.reached ?? 1, FLOW.length);
  const requested = Number(params.get('paso')) || reached;
  const step = Math.max(1, Math.min(requested, reached));
  const meta = FLOW[step - 1];
  const published = Boolean(progress?.published) || justPublished;

  // Al cambiar de paso: arriba y el foco en el título
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const id = window.setTimeout(() => headRef.current?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(id);
  }, [step, justPublished]);

  // Datos del estudio y estilo: se guardan solos (con una pausa al escribir)
  const saveStudio = useDebouncedSave(async () => {
    const patch = { ...pendingPatch.current };
    pendingPatch.current = {};
    if (typeof patch.studio_name === 'string' && !patch.studio_name.trim()) delete patch.studio_name;
    if (!Object.keys(patch).length) return;
    const saved = await saveSettings(patch);
    setSettings((s) => (s ? { ...saved, ...pendingPatch.current } : saved));
    await site.refresh?.();
  }, 600);

  const update = useCallback((patch: Partial<StudioSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    const keys = Object.keys(patch) as (keyof StudioSettings)[];
    if (keys.some((k) => STUDIO_FIELDS.includes(k) || (STYLE_FIELDS as readonly string[]).includes(k))) {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      saveStudio(undefined);
    }
  }, [saveStudio]);

  const go = (n: number) => {
    setError('');
    setParams({ paso: String(n) }, { replace: false });
  };

  const next = async () => {
    setError('');
    if (!(await runGuard())) return;
    setBusy(true);
    try {
      if (!(await flush())) {
        setError('No se ha podido guardar. Revisa la conexión e inténtalo otra vez.');
        return;
      }
      if (step === FLOW.length) {
        // Mientras se publica, esta pantalla no se cierra al saberse publicada
        publishing.current = true;
        try {
          await track(publish());
          setJustPublished(true);
        } finally {
          publishing.current = false;
        }
        await site.refresh?.();
        return;
      }
      const p = await confirmFlowStep(meta.key);
      apply(p);
      go(step + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const later = async () => {
    setBusy(true);
    try {
      await flush();
      apply(await setSetupLater(true));
      notify('Guardado. Sigue cuando quieras desde «Hoy».', 'success');
      navigate('/');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Vuelta desde Stripe (enlace antiguo a la bienvenida): a Ajustes → Pagos
  if (params.has('stripe')) return <Navigate to={`/ajustes?tab=pagos&${params.toString()}`} replace />;
  // Web ya publicada: aquí no hay nada que hacer
  if ((site.config.setup_completed || progress?.published) && !justPublished && !publishing.current) return <Navigate to="/" replace />;
  if (loadError || (ready && !progress)) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', p: 3, pt: 8 }}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => { refresh(); loadSettings().then(setSettings).catch(() => {}); setLoadError(''); }}>Reintentar</Button>}>
          No se ha podido cargar la puesta en marcha. {loadError}
        </Alert>
      </Box>
    );
  }
  if (!settings || !progress) {
    return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><CircularProgress aria-label="Cargando" /></Box>;
  }
  if (requested !== step) return <Navigate to={setupStepLink(step)} replace />;

  const preview = wide && !published && [1, 5, 7].includes(step);
  const head = HEADS[step - 1];
  const styleName = (() => {
    const e = styleEntry(settings.style_preset);
    const pal = paletteBySlug(settings.style_preset, settings.palette);
    return `${e.name}${pal ? ` · ${pal.name}` : ''}`;
  })();

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--studio-bg)' }}>
      {/* ── Arriba: estudio, «Paso N de 8», seguir luego y la barra de pasos ── */}
      <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgb(var(--studio-bg-rgb) / 0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, px: { xs: 2, md: 3 }, py: { xs: 1.25, md: 1.75 }, maxWidth: 1280, mx: 'auto', minHeight: { xs: 60, md: 72 } }}>
          <StudioMark size={34} />
          <Typography aria-live="polite" sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--studio-muted)', minWidth: 0 }}>
            Paso <Box component="b" sx={{ color: 'var(--studio-ink)' }}>{step}</Box> de {FLOW.length}
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}> · {meta.label}</Box>
          </Typography>
          {!published && (
            <Button onClick={later} disabled={busy} startIcon={<StudioIcon name="clock" sx={{ fontSize: 18 }} />} sx={{ ml: 'auto', minHeight: 44, color: 'var(--studio-ink)', fontWeight: 700, whiteSpace: 'nowrap' }}>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Guardar y s</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>S</Box>eguir luego
            </Button>
          )}
        </Box>
        <Box
          role="progressbar"
          aria-label="Progreso de la puesta en marcha"
          aria-valuemin={1}
          aria-valuemax={FLOW.length}
          aria-valuenow={step}
          aria-valuetext={`Paso ${step} de ${FLOW.length}: ${meta.label}`}
          sx={{ display: 'grid', gridTemplateColumns: `repeat(${FLOW.length}, 1fr)`, gap: '4px', px: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}
        >
          {FLOW.map((f, i) => {
            const n = i + 1;
            const done = n < step || (n <= reached - 1) || published;
            return (
              <Box key={f.key} title={f.label} sx={{
                height: 5, borderRadius: 9, transition: 'background 300ms',
                background: done && n !== step ? 'var(--studio-primary-fill)'
                  : n === step ? (published ? 'var(--studio-primary-fill)' : 'linear-gradient(90deg, var(--studio-primary-fill) 50%, var(--studio-border-color) 50%)')
                    : 'var(--studio-border-color)',
              }} />
            );
          })}
        </Box>
      </Box>

      {/* ── La tarea del paso ── */}
      <Box sx={{
        flex: 1, width: '100%', maxWidth: 1280, mx: 'auto', px: { xs: 2, md: 3 }, pt: { xs: 3, md: 5 }, pb: '140px',
        display: 'grid', gap: 6, alignItems: 'start',
        gridTemplateColumns: preview ? 'minmax(0, 560px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
      }}>
        <Box component="section" aria-labelledby="su-h" sx={{
          width: '100%', mx: preview ? 0 : 'auto',
          maxWidth: published ? 760 : step === 2 ? 1180 : step === 6 ? 980 : 600,
        }}>
          {published ? (
            <Published webUrl={webUrl || settings.web_url || ''} progress={progress} titleRef={headRef} titleId="su-h" />
          ) : (
            <>
              <StepHead ref={headRef} id="su-h" icon={meta.icon} title={head.title} subtitle={head.subtitle} />
              {step === 1 && <StepStudio value={settings} onChange={update} onBusyChange={setUploading} />}
              {step === 2 && <StyleSection value={settings} onChange={update} />}
              {step === 3 && <StepRooms />}
              {step === 4 && <StepInstructors />}
              {step === 5 && <StepClasses onChanged={setClasses} />}
              {step === 6 && <StepSchedule />}
              {step === 7 && <StepPacks onChanged={(list, currency) => setPacks({ list, currency })} />}
              {step === 8 && (
                <PublishReview
                  onGo={go}
                  summary={{
                    counts: progress.counts, studioName: settings.studio_name, styleName,
                    slots: progress.counts.schedule ?? 0, packs: progress.counts.plans ?? 0,
                  }}
                />
              )}
              {error && <Alert severity="error" sx={{ mt: 2.5 }} role="alert">{error}</Alert>}
            </>
          )}
        </Box>
        {preview && (
          <Box component="aside" aria-label="Vista previa de tu web" sx={{ position: 'sticky', top: 110 }}>
            <SiteMock
              name={settings.studio_name === 'Mi Estudio' ? '' : settings.studio_name}
              city={settings.city}
              logo={settings.logo_url}
              webUrl={webUrl || settings.web_url}
              only={step === 1 ? ['hero'] : step === 5 ? ['hero', 'classes'] : ['prices']}
              classes={classes.map((c) => ({ id: c.id, title: c.title, minutes: c.duration_minutes }))}
              prices={packs.list.filter((p) => p.on).map((p) => ({ name: p.name, price: p.price, note: p.description }))}
              currency={packs.currency}
            />
          </Box>
        )}
      </Box>

      {/* ── Abajo: Atrás, «Se guarda solo» y Continuar ── */}
      <Box component="footer" sx={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25, borderTop: '1px solid var(--studio-border-color)',
        background: 'rgb(var(--studio-bg-rgb) / 0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        px: { xs: 2, md: 3 }, pt: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))',
      }}>
        <Box sx={{ maxWidth: 1280, mx: 'auto', display: 'flex', alignItems: 'center', gap: 1.25 }}>
          {step > 1 && !published && (
            <Button onClick={() => go(step - 1)} disabled={busy} startIcon={<StudioIcon name="back" sx={{ fontSize: 18 }} />} sx={{ minHeight: 48, color: 'var(--studio-ink)', fontWeight: 700 }}>
              Atrás
            </Button>
          )}
          {!published && <SaveIndicator status={status} />}
          <Button
            variant="contained"
            onClick={published ? () => navigate('/', { state: WELCOME_STATE }) : next}
            disabled={busy || uploading}
            endIcon={busy ? <CircularProgress size={18} color="inherit" /> : step === FLOW.length && !published ? <StudioIcon name="launch" /> : <StudioIcon name="next" />}
            sx={{ ml: 'auto', minHeight: 52, minWidth: { xs: 0, sm: 180 }, flex: { xs: 1, sm: 'none' }, px: 3, fontSize: '1rem' }}
          >
            {published ? 'Entrar a mi panel' : step === FLOW.length ? 'Publicar mi web' : 'Continuar'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = status === 'saving' ? 'Guardando…' : status === 'error' ? 'No se ha podido guardar' : status === 'saved' ? 'Guardado' : 'Se guarda solo';
  return (
    <Typography role="status" aria-live="polite" sx={{
      display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.75, ml: 'auto', fontSize: '0.86rem',
      color: status === 'error' ? 'var(--studio-bad)' : 'var(--studio-muted)',
    }}>
      {status === 'saving' ? <CircularProgress size={14} color="inherit" /> : <StudioIcon name={status === 'error' ? 'warning' : 'saved'} sx={{ fontSize: 18 }} />}
      {text}
    </Typography>
  );
}
