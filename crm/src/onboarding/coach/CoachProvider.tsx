import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { registerTour } from '../../components/shell/ShellContext';
import { useSite } from '../../site/SiteProvider';
import { loadSeenTips, markTipSeen, resetTips as resetTipsApi } from '../api';
import { useSetupProgress } from '../progressContext';
import CoachOverlay, { type CoachRunView } from './CoachOverlay';
import { CoachContext, type CoachContextValue } from './context';
import { FIRST_TIPS, PAGE_TOURS, SEEN, WELCOME_TOUR, pageKeyOf } from './tours';

interface Run extends CoachRunView {
  /** Se marca como visto al terminar (o al enseñarse, si es un consejo) */
  seenKey?: string;
}

/** Estado de navegación para lanzar la visita de bienvenida al llegar: navigate('/', { state: WELCOME_STATE }) */
export const WELCOME_STATE = { tour: 'welcome' } as const;

const TIP_DELAY = 900;

/**
 * Visitas guiadas del panel (va dentro de MainLayout):
 *  - la de bienvenida (5 pasos) al publicar la web y desde «?» → Visita guiada
 *  - «Cómo funciona» de cada pantalla (3 pasos)
 *  - un consejo la primera vez que se entra en cada sección (con la web ya
 *    publicada), con «Ver más» → su «Cómo funciona»
 * Lo ya visto se guarda en el servidor por persona (/api/v1/setup/tips/).
 */
export function CoachProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { progress } = useSetupProgress();
  const { config } = useSite();
  const published = Boolean(progress?.published || config.setup_completed);

  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const [live, setLive] = useState('');
  const seen = useRef<Set<string>>(new Set());
  const [seenReady, setSeenReady] = useState(false);
  const prevFocus = useRef<HTMLElement | null>(null);
  const welcomePending = useRef(false);

  useEffect(() => {
    let alive = true;
    loadSeenTips()
      .then((r) => { if (alive) seen.current = new Set(r.seen); })
      .catch(() => { /* sin conexión: los consejos se enseñan, sin guardar */ })
      .finally(() => { if (alive) setSeenReady(true); });
    return () => { alive = false; };
  }, []);

  const mark = useCallback((key?: string) => {
    if (!key || seen.current.has(key)) return;
    seen.current.add(key);
    markTipSeen(key).catch(() => { /* se volverá a enseñar: no pasa nada */ });
  }, []);

  const begin = useCallback((r: Omit<Run, 'index'>) => {
    if (!r.steps.length) return;
    const active = document.activeElement;
    if (!runRef.current) prevFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setRun({ ...r, index: 0 });
  }, []);

  const end = useCallback((done: boolean, restoreFocus = true) => {
    const cur = runRef.current;
    if (!cur) return;
    if (cur.seenKey && (done || cur.kind === 'tour' || cur.kind === 'tip')) mark(cur.seenKey);
    setRun(null);
    setLive('');
    if (restoreFocus) {
      const el = prevFocus.current;
      prevFocus.current = null;
      window.setTimeout(() => { if (el && el.isConnected) el.focus({ preventScroll: true }); }, 0);
    }
  }, [mark]);

  const startPage = useCallback((key: string) => {
    const steps = PAGE_TOURS[key];
    if (steps) begin({ steps, kind: 'tour' });
  }, [begin]);

  const startWelcome = useCallback(() => {
    welcomePending.current = false;
    begin({ steps: WELCOME_TOUR, kind: 'tour', seenKey: SEEN.welcome });
  }, [begin]);

  // «?» → «Visita guiada» (ShellContext.registerTour, fase 1)
  useEffect(() => {
    registerTour(startWelcome);
    return () => registerTour(null);
  }, [startWelcome]);

  // Recién publicada la web: la visita de bienvenida al llegar a Hoy
  const welcomeTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const state = location.state as { tour?: string } | null;
    if (state?.tour !== 'welcome' || welcomeTimer.current) return;
    welcomePending.current = true;
    // Se quita del historial (al volver atrás no se repite); el temporizador
    // no se cancela al cambiar el estado, por eso va en una ref.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    welcomeTimer.current = window.setTimeout(() => { welcomeTimer.current = undefined; startWelcome(); }, 600);
  }, [location.state, location.pathname, location.search, navigate, startWelcome]);
  useEffect(() => () => window.clearTimeout(welcomeTimer.current), []);

  // Primera vez en una sección: un consejo (solo con la web publicada)
  const pageKey = pageKeyOf(location.pathname);
  useEffect(() => {
    if (!published || !seenReady || run || welcomePending.current || !pageKey) return;
    const tip = FIRST_TIPS[pageKey];
    if (!tip || seen.current.has(SEEN.tip(pageKey))) return;
    const id = window.setTimeout(() => {
      if (runRef.current || welcomePending.current) return;
      const seenKey = SEEN.tip(pageKey);
      mark(seenKey);
      begin({
        steps: [tip],
        kind: 'tip',
        seenKey,
        extra: PAGE_TOURS[pageKey]
          ? { label: 'Ver más', onClick: () => { end(true, false); window.setTimeout(() => startPage(pageKey), 60); } }
          : undefined,
      });
    }, TIP_DELAY);
    return () => window.clearTimeout(id);
  }, [published, seenReady, run, pageKey, mark, begin, end, startPage]);

  // Al cambiar de pantalla, la visita de la anterior se cierra
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (lastPath.current !== location.pathname && runRef.current?.kind === 'tip') end(false, false);
    lastPath.current = location.pathname;
  }, [location.pathname, end]);

  // Lectores de pantalla: cada paso se anuncia
  useEffect(() => {
    if (!run) return;
    const s = run.steps[run.index];
    setLive(`${run.kind === 'tip' ? 'Consejo' : `Paso ${run.index + 1} de ${run.steps.length}`}: ${s.title}. ${s.text}`);
  }, [run]);

  const resetTips = useCallback(() => {
    seen.current = new Set();
    resetTipsApi().catch(() => {});
  }, []);

  const value = useMemo<CoachContextValue>(() => ({
    startPage,
    startWelcome,
    hasPageTour: (key) => Boolean(PAGE_TOURS[key]),
    currentPage: pageKey,
    resetTips,
    active: Boolean(run),
  }), [startPage, startWelcome, pageKey, resetTips, run]);

  return (
    <CoachContext.Provider value={value}>
      {children}
      <Box role="status" aria-live="polite" sx={visuallyHidden}>{live}</Box>
      {run && (
        <CoachOverlay
          {...run}
          onNext={() => setRun((r) => (r && r.index < r.steps.length - 1 ? { ...r, index: r.index + 1 } : r))}
          onPrev={() => setRun((r) => (r && r.index > 0 ? { ...r, index: r.index - 1 } : r))}
          onClose={(done) => end(done)}
        />
      )}
    </CoachContext.Provider>
  );
}

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
