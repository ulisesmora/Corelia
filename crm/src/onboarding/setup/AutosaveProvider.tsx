import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AutosaveContext, type SaveStatus } from './autosave';

/** «Se guarda solo»: cuenta lo que se está guardando (ver ./autosave.ts). */
export function AutosaveProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const pending = useRef(new Set<Promise<unknown>>());
  const flushers = useRef(new Set<() => Promise<unknown>>());
  const failed = useRef(false);
  const guard = useRef<(() => Promise<boolean> | boolean) | null>(null);

  const track = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    pending.current.add(p);
    setStatus('saving');
    const done = (ok: boolean) => {
      pending.current.delete(p);
      if (!ok) failed.current = true;
      if (!pending.current.size) {
        setStatus(failed.current ? 'error' : 'saved');
        failed.current = false;
      }
    };
    p.then(() => done(true), () => done(false));
    return p;
  }, []);

  const registerFlush = useCallback((fn: () => Promise<unknown>) => {
    flushers.current.add(fn);
    return () => { flushers.current.delete(fn); };
  }, []);

  const flush = useCallback(async () => {
    const results = await Promise.allSettled([...flushers.current].map((f) => f()));
    const rest = await Promise.allSettled([...pending.current]);
    return [...results, ...rest].every((r) => r.status === 'fulfilled');
  }, []);

  const setGuard = useCallback((fn: (() => Promise<boolean> | boolean) | null) => { guard.current = fn; }, []);
  const runGuard = useCallback(async () => (guard.current ? guard.current() : true), []);

  const value = useMemo(() => ({ status, track, registerFlush, flush, setGuard, runGuard }), [status, track, registerFlush, flush, setGuard, runGuard]);
  return <AutosaveContext.Provider value={value}>{children}</AutosaveContext.Provider>;
}

