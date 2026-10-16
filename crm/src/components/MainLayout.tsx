import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, useMediaQuery } from '@mui/material';
import InstallCrmApp from './InstallCrmApp';
import QuickClientCreate from './QuickClientCreate';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { authHeaders } from '../utils/auth';
import { useSite } from '../site/SiteProvider';
import { panelLook } from '../theme';
import { CoachProvider } from '../onboarding/coach';
import { useLocks } from '../onboarding/locks';
import LockedScreen from '../onboarding/LockedScreen';
import SetupBanner from '../onboarding/SetupBanner';
import Sidebar from './shell/Sidebar';
import { BottomNav, MobileTopBar, TopBar } from './shell/TopBar';
import CommandPalette from './shell/CommandPalette';
import { NAV, sectionOf } from './shell/navigation';
import { ShellContext } from './shell/ShellContext';
import { useShellExtensions } from './shell/extensions';
import { useTextSize } from './shell/textSize';
import { ChargingGuideHost } from './charging';

// ====================================================================
// Armazón del panel (rediseño, fase 1): menú lateral en tarjeta con los
// colores de la paleta, barra superior con el buscador ⌘K, «Ver como
// clienta», ayuda y «+ Nuevo»; en el móvil, barra de abajo (Hoy, Calendario,
// Reservas, Clientas, Más) y «+» arriba. El mapa de secciones vive en
// ./shell/navigation.ts y las distribuciones añaden lo suyo en
// ./shell/extensions.tsx (sin tocar este archivo).
//
// Fase 2: mientras la puesta en marcha no está terminada, el panel se abre
// por partes (candados en el menú, aviso «Te quedan N pasos» arriba y, si se
// entra por la dirección en algo cerrado, por qué y «Ir a …»; reglas en
// ../onboarding/locks.ts). Y las visitas guiadas (../onboarding/coach).
// ====================================================================

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updateUser } = useAuth();
  const { config } = useSite();
  const locks = useLocks();
  const look = panelLook(config);
  const wide = useMediaQuery('(min-width:1024px)', { noSsr: true });
  const ext = useShellExtensions();
  const [textSize, setTextSize] = useTextSize(user?.email || '');
  const [cmd, setCmd] = useState<{ open: boolean; q: string }>({ open: false, q: '' });
  const [newClient, setNewClient] = useState<false | 'new' | 'existing'>(false);

  // ¿Exige el estudio la verificación en dos pasos y esta persona aún no la
  // tiene? Entonces el API solo le deja activarla: se la lleva a Seguridad.
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE_URL}v1/auth/2fa/`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (alive && s) updateUser({ two_factor_setup_required: Boolean(s.setup_required) }); })
      .catch(() => { /* sin conexión: se comprobará en la próxima carga */ });
    return () => { alive = false; };
    // Solo al abrir el panel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mustSetup2fa = Boolean(user?.two_factor_setup_required) && location.pathname !== '/seguridad';

  // ⌘K / Ctrl+K desde cualquier pantalla
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmd((c) => ({ open: !c.open, q: '' }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openCommand = useCallback((q = '') => setCmd({ open: true, q }), []);
  const openNewClient = useCallback((mode: 'new' | 'existing' = 'new') => setNewClient(mode), []);
  const shell = useMemo(
    () => ({ openCommand, openNewClient, extraSettings: ext.settingsItems }),
    [openCommand, openNewClient, ext.settingsItems],
  );

  const active = sectionOf(location.pathname, location.search);
  // Entrar en algo aún cerrado (por enlace o escribiendo la dirección): se explica
  const lock = locks.route(location.pathname);
  const lockedTitle = !lock ? '' : location.pathname === '/assign-classes' ? 'Clases fijas de clientas'
    : location.pathname === '/plans' ? 'Bonos y precios'
      : NAV.find((n) => n.key === sectionOf(location.pathname))?.label || 'Esta sección';
  const userName = user?.name || user?.email || 'Administración';

  // Al cambiar de pantalla: arriba del todo
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  const content = (
    <Box component="main" id="main" tabIndex={-1} sx={{ width: '100%', maxWidth: 1280, mx: 'auto', outline: 'none', pt: { xs: 1, lg: 0.5 } }}>
      {ext.banner}
      <SetupBanner />
      {mustSetup2fa ? <Navigate to="/seguridad" replace /> : lock ? <LockedScreen lock={lock} title={lockedTitle} /> : <Outlet />}
    </Box>
  );

  return (
    <ShellContext.Provider value={shell}>
      <CoachProvider>
        <Box component="a" href="#main" sx={skipLink}>Saltar al contenido</Box>
        {wide ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: '264px minmax(0, 1fr)', minHeight: '100dvh', p: '12px 0 12px 12px' }}>
            <Sidebar
              active={active}
              guide={null}
              userName={userName}
              userRole="Administración"
              textSize={textSize}
              onTextSize={setTextSize}
              onLogout={logout}
            />
            <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', px: 3, pb: 5 }}>
              <TopBar style={look.classic ? 'classic' : look.style} />
              {content}
            </Box>
          </Box>
        ) : (
          <Box sx={{ minWidth: 0, px: 2, pb: 'calc(96px + env(safe-area-inset-bottom))', overflowX: 'clip' }}>
            <MobileTopBar />
            {content}
            <BottomNav active={active} />
          </Box>
        )}

        <CommandPalette open={cmd.open} initialQuery={cmd.q} onClose={() => setCmd({ open: false, q: '' })} />
        <QuickClientCreate
          open={Boolean(newClient)}
          initialMode={newClient || 'new'}
          onClose={() => setNewClient(false)}
          onCreated={(name) => { setNewClient(false); navigate(name ? `/clients?buscar=${encodeURIComponent(name)}` : '/clients'); }}
        />
        <InstallCrmApp />
        {/* «Cómo se cobra» (?guia=cobros#capítulo): components/charging */}
        <ChargingGuideHost />
      </CoachProvider>
    </ShellContext.Provider>
  );
}

const skipLink = {
  position: 'fixed', left: 12, top: -60, zIndex: 2000, px: 1.75, py: 1.25, borderRadius: '10px',
  background: 'var(--studio-ink)', color: 'var(--studio-surf)', fontWeight: 600, textDecoration: 'none',
  '&:focus': { top: 12 },
} as const;
