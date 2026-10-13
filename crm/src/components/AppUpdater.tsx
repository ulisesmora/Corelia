import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Snackbar } from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';

/**
 * Mantiene el CRM siempre en la última versión sin que nadie tenga que pulsar
 * "recargar". Cada despliegue publica /version.json con su identificador; si
 * el que hay en el servidor no es el de este código, la página se recarga sola
 * en un momento seguro:
 *  - al abrir o restaurar la pestaña (reabrir el navegador, volver atrás),
 *  - al volver a la pestaña después de estar en otra cosa,
 *  - al cambiar de sección dentro del CRM.
 * Si en ese momento hay una ventana abierta (un formulario a medias) no se
 * recarga: aparece un aviso con el botón "Actualizar" y se hará en el
 * siguiente momento seguro.
 */

const CURRENT = __APP_VERSION__;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const RELOAD_KEY = 'crmUpdateReload';

async function serverVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null; // sin conexión o fallo puntual: se reintenta en la siguiente comprobación
  }
}

// Hay algo a medias en pantalla: una ventana, un menú o un campo con el cursor dentro
function isBusy(): boolean {
  if (document.querySelector('.MuiDialog-root, .MuiDrawer-modal, .MuiPopover-root')) return true;
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true');
}

// Evita un bucle de recargas si el servidor tardara en servir la versión nueva
function alreadyTried(version: string): boolean {
  try {
    const last = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || 'null');
    return last?.version === version && Date.now() - last.at < 60_000;
  } catch {
    return false;
  }
}

function reloadTo(version: string) {
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ version, at: Date.now() }));
  } catch { /* sin sessionStorage se recarga igual */ }
  window.location.reload();
}

export default function AppUpdater() {
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const location = useLocation();
  const firstRoute = useRef(true);

  // Busca versión nueva; si es un momento seguro, recarga; si no, avisa
  const check = useCallback(async (canReload: boolean) => {
    const latest = pendingRef.current ?? (await serverVersion());
    if (!latest || latest === CURRENT) return;
    if (canReload && !isBusy() && !alreadyTried(latest)) {
      reloadTo(latest);
      return;
    }
    pendingRef.current = latest;
    setPending(latest);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    check(true); // al abrir o restaurar la pestaña

    const onVisible = () => { if (document.visibilityState === 'visible') check(true); };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check(true); };
    const onOnline = () => check(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    // Con la pestaña delante solo se avisa: recargar mientras está mirando despista
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') check(false);
    }, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [check]);

  // Cambiar de sección con una versión nueva esperando = recarga ya en la sección nueva
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return; }
    if (pendingRef.current) check(true);
  }, [location.pathname, check]);

  if (!pending) return null;
  return (
    <Snackbar open anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ top: { xs: 72, md: 80 } }}>
      <Alert
        severity="info"
        variant="filled"
        icon={<SystemUpdateAltIcon />}
        action={
          <Button color="inherit" variant="outlined" size="small" onClick={() => reloadTo(pending)}>
            Actualizar
          </Button>
        }
        sx={{ fontSize: '1rem', alignItems: 'center', boxShadow: '0 10px 30px rgb(var(--studio-dark-rgb) / 0.25)' }}
      >
        Hay una versión nueva del programa. Termina lo que estás haciendo y pulsa «Actualizar».
      </Alert>
    </Snackbar>
  );
}
