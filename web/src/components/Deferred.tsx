// PERF: piezas sin contenido para buscadores (aviso de teléfono, avisos push)
// que se descargan y montan solo en el navegador (client:idle en el .astro).
// Las secciones de contenido de la portada se renderizan en el servidor.
// El componente real se importa de forma diferida, así que en el servidor solo
// se renderiza el respaldo (sin tocar localStorage ni window).
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';

function makeDeferred(loader: () => Promise<{ default: ComponentType<any> }>) {
  const Real = lazy(loader);
  return function Deferred({ children }: { children?: ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    // Un <div> real alrededor: client:visible observa el primer hijo de la isla
    // y <astro-slot> (display: contents) no tiene caja, así que nunca "se veía".
    return (
      <div>
        {mounted ? (
          <Suspense fallback={<>{children}</>}>
            <Real />
          </Suspense>
        ) : children}
      </div>
    );
  };
}

export const PhoneUpdateDialogDeferred = makeDeferred(() => import('./UpdatePhoneNumber'));
export const PushNotificationsDeferred = makeDeferred(() => import('./PushNotifications'));
