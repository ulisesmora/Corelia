import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

// ====================================================================
// «Se guarda solo»: cada pantalla de la puesta en marcha guarda al momento
// (o tras una pausa al escribir). Este contexto lleva la cuenta de lo que se
// está guardando para el indicador de abajo y para «Continuar» / «Guardar y
// seguir luego», que esperan a que todo esté guardado.
// ====================================================================

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveApi {
  status: SaveStatus;
  /** Guarda algo ya (y lo cuenta en el indicador) */
  track: <T>(p: Promise<T>) => Promise<T>;
  /** Guardados con pausa que hay que forzar antes de seguir */
  registerFlush: (fn: () => Promise<unknown>) => () => void;
  /** Termina de guardar todo; false si algo falló */
  flush: () => Promise<boolean>;
  /** Comprobación del paso antes de «Continuar» (false = no seguir) */
  setGuard: (fn: (() => Promise<boolean> | boolean) | null) => void;
  runGuard: () => Promise<boolean>;
}

export const AutosaveContext = createContext<AutosaveApi | null>(null);

export function useAutosave(): AutosaveApi {
  const ctx = useContext(AutosaveContext);
  if (!ctx) throw new Error('useAutosave necesita <AutosaveProvider>');
  return ctx;
}

/**
 * Guardado con pausa (al escribir): `const save = useDebouncedSave(fn)` y
 * `save(valor, clave?)`; se guarda el último valor de cada clave tras
 * `delay` ms, al salir de la pantalla o al seguir.
 */
export function useDebouncedSave<T>(fn: (value: T) => Promise<unknown>, delay = 700) {
  const { track, registerFlush } = useAutosave();
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(new Map<string, T>());
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    window.clearTimeout(timer.current);
    const items = [...latest.current.values()];
    latest.current.clear();
    await Promise.all(items.map((v) => track(fnRef.current(v))));
  }, [track]);

  useEffect(() => registerFlush(run), [registerFlush, run]);
  // Al salir de la pantalla, lo pendiente se guarda
  useEffect(() => () => { if (latest.current.size) void run().catch(() => {}); }, [run]);

  return useCallback((value: T, key = '') => {
    latest.current.set(key, value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void run().catch(() => {}); }, delay);
  }, [delay, run]);
}

/** Comprobación de «Continuar» del paso actual. */
export function useStepGuard(fn: () => Promise<boolean> | boolean) {
  const { setGuard } = useAutosave();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    setGuard(() => ref.current());
    return () => setGuard(null);
  }, [setGuard]);
}
