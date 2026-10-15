import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Enlaces directos desde la guía o desde Inicio: «?accion=nueva» abre la
 * ventana de crear de la pantalla (una sola vez; después se quita de la URL).
 */
export function useActionParam(action: string, handler: () => void, ready = true) {
  const [params, setParams] = useSearchParams();
  const current = params.get('accion');
  useEffect(() => {
    if (!ready || current !== action) return;
    handler();
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('accion');
      return p;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current, action]);
}
