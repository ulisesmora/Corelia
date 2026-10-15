import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NOTIFY_SUCCESS_EVENT } from '../components/guide';
import { fetchProgress, setStepStatus, publishSite, type SetupProgress } from './api';
import type { StepKey } from './copy';
import { ProgressContext, type ProgressContextValue } from './progressContext';

/**
 * Progreso de la guía de puesta en marcha para todo el panel (Inicio, la guía
 * y la tarjeta de ayuda de cada pantalla). Se recalcula al cambiar de pantalla
 * y tras cada «Guardado ✓», así que no hace falta avisarle desde cada página.
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const p = await fetchProgress();
      if (alive.current) setProgress(p);
      return p;
    } catch {
      return null; // sin conexión o sin permiso: la guía simplemente no se enseña
    } finally {
      if (alive.current) setReady(true);
    }
  }, []);

  // Varias señales seguidas (guardar → navegar) → una sola petición
  const refreshSoon = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(refresh, 350);
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, []);

  // La primera vez, al momento; después, al cambiar de pantalla
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; refresh(); } else refreshSoon();
  }, [location.pathname, refresh, refreshSoon]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSoon(); };
    window.addEventListener(NOTIFY_SUCCESS_EVENT, refreshSoon);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(NOTIFY_SUCCESS_EVENT, refreshSoon);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshSoon]);

  const setStatus = useCallback(async (key: StepKey | 'welcome', status: 'done' | 'skipped' | 'todo') => {
    const p = await setStepStatus(key, status);
    setProgress(p);
    return p;
  }, []);

  const publish = useCallback(async () => {
    const p = await publishSite();
    setProgress(p);
    return p;
  }, []);

  const value = useMemo<ProgressContextValue>(() => ({
    progress,
    ready,
    refresh,
    setStatus,
    publish,
    apply: setProgress,
    step: (key) => progress?.steps.find((s) => s.key === key),
  }), [progress, ready, refresh, setStatus, publish]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

/** Ruta-envoltorio: el progreso está disponible en el asistente y en todo el panel. */
export function ProgressOutlet() {
  return <ProgressProvider><Outlet /></ProgressProvider>;
}

