import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, IconButton, Paper, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';

/**
 * Ayuda para instalar el CRM en el móvil como app "Panel del estudio" (icono en la
 * pantalla de inicio, a pantalla completa). Detecta el dispositivo:
 *  - Android con Chrome: botón que abre la instalación nativa.
 *  - iPhone/iPad, Samsung Internet o sin instalación nativa: pasos exactos
 *    para ese navegador.
 *  - Dentro de Instagram/Facebook: cómo abrirlo en el navegador de verdad.
 * Sale sola una vez al entrar desde el móvil; si se descarta vuelve a los
 * 1, 3, 7 y 14 días. Siempre se puede abrir desde el menú ("Instalar en el móvil").
 */

const OPEN_EVENT = 'crm:install-help';
const INSTALLED_KEY = 'crmAppInstalled';
const DISMISS_KEY = 'crmInstallDismissedAt';
const DISMISS_COUNT_KEY = 'crmInstallDismissCount';
const SESSION_KEY = 'crmInstallShown';
const COOLDOWN_DAYS = [1, 3, 7, 14];

type Device = 'ios-safari' | 'ios-other' | 'android' | 'samsung' | 'in-app' | 'desktop';

function detectDevice(): Device {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (/Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat/i.test(ua)) return 'in-app';
  if (isIOS) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** ¿Tiene sentido ofrecer la instalación aquí? (móvil y todavía sin instalar) */
export function canInstallCrm(): boolean {
  if (typeof window === 'undefined' || isStandalone()) return false;
  try { if (localStorage.getItem(INSTALLED_KEY)) return false; } catch { /* sin almacenamiento */ }
  return detectDevice() !== 'desktop';
}

/** Abre la ayuda de instalación (desde el menú). */
export function openInstallHelp() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// Chrome avisa muy pronto de que se puede instalar: se guarda el aviso aquí,
// antes de que el componente monte, para usarlo al pulsar "Instalar"
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: InstallPrompt | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem(INSTALLED_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
  });
}

const Key = ({ children }: { children: ReactNode }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-block', px: 0.75, border: '1.5px solid var(--studio-primary)', borderRadius: 1.5,
      fontWeight: 700, color: 'var(--studio-primary-dark)', lineHeight: 1.4,
    }}
  >
    {children}
  </Box>
);

function stepsFor(device: Device): ReactNode[] {
  switch (device) {
    case 'ios-safari':
      return [
        <>Toca <Key>⬆</Key> <b>Compartir</b> en la barra de Safari (abajo). Si no lo ves, toca antes <Key>···</Key>.</>,
        <>Baja un poco y elige <b>«Añadir a pantalla de inicio»</b>.</>,
        <>Toca <b>«Añadir»</b>. Aparecerá el icono <b>del panel</b> junto a tus apps.</>,
      ];
    case 'ios-other':
      return [
        <>Toca <Key>⬆</Key> <b>Compartir</b>, arriba a la derecha, en la barra de la dirección.</>,
        <>Elige <b>«Añadir a pantalla de inicio»</b>.</>,
        <>Toca <b>«Añadir»</b>. Aparecerá el icono <b>del panel</b> junto a tus apps.</>,
      ];
    case 'samsung':
      return [
        <>Toca el menú <Key>≡</Key> abajo a la derecha.</>,
        <>Elige <b>«Añadir página a»</b> y luego <b>«Pantalla de inicio»</b>.</>,
        <>Confirma con <b>«Añadir»</b>. Aparecerá el icono <b>del panel</b>.</>,
      ];
    case 'in-app':
      return [
        <>Ahora mismo lo estás viendo dentro de Instagram o Facebook, y desde aquí no se puede instalar.</>,
        <>Toca <Key>···</Key> arriba a la derecha y elige <b>«Abrir en el navegador»</b>.</>,
        <>Allí te saldrá este mismo aviso con el botón para instalar.</>,
      ];
    default:
      return [
        <>Toca el menú <Key>⋮</Key> arriba a la derecha de Chrome.</>,
        <>Elige <b>«Instalar aplicación»</b> (o «Añadir a pantalla de inicio»).</>,
        <>Confirma con <b>«Instalar»</b>. Aparecerá el icono <b>del panel</b>.</>,
      ];
  }
}

const BENEFITS = [
  { icon: <TouchAppIcon fontSize="small" />, text: 'Se abre con un toque desde la pantalla del móvil, sin buscar la web.' },
  { icon: <FullscreenIcon fontSize="small" />, text: 'A pantalla completa: más grande y más cómodo.' },
  { icon: <SystemUpdateAltIcon fontSize="small" />, text: 'Siempre al día: se actualiza sola.' },
];

export default function InstallCrmApp() {
  const [device, setDevice] = useState<Device>('desktop');
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const d = detectDevice();
    setDevice(d);
    if (!canInstallCrm()) return;

    const onOpen = () => { setShowSteps(d !== 'android' || !deferredPrompt); setOpen(true); };
    window.addEventListener(OPEN_EVENT, onOpen);

    // Aparición automática: una vez por sesión y respetando el "Ahora no"
    let timer: number | undefined;
    try {
      const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
      const count = Number(localStorage.getItem(DISMISS_COUNT_KEY) || 0);
      const days = COOLDOWN_DAYS[Math.min(Math.max(count - 1, 0), COOLDOWN_DAYS.length - 1)];
      const resting = dismissed && Date.now() - dismissed < days * 24 * 3600 * 1000;
      if (!resting && !sessionStorage.getItem(SESSION_KEY)) {
        timer = window.setTimeout(() => {
          try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* sin almacenamiento */ }
          setShowSteps(false);
          setOpen(true);
        }, 3000);
      }
    } catch { /* sin almacenamiento: solo desde el menú */ }

    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      localStorage.setItem(DISMISS_COUNT_KEY, String(Number(localStorage.getItem(DISMISS_COUNT_KEY) || 0) + 1));
    } catch { /* sin almacenamiento */ }
    setOpen(false);
    setShowSteps(false);
  };

  const install = async () => {
    if (!deferredPrompt) { setShowSteps(true); return; }
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        try { localStorage.setItem(INSTALLED_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
        setOpen(false);
        return;
      }
    } catch { /* se cerró la ventana del sistema */ }
    setInstalling(false);
  };

  if (!open) return null;

  const native = device === 'android' && !!deferredPrompt;
  const isIOS = device === 'ios-safari' || device === 'ios-other';
  const steps = stepsFor(device);

  return (
    <>
      <Paper
        role="dialog"
        aria-label="Instalar el panel en el móvil"
        elevation={0}
        sx={{
          position: 'fixed',
          left: 12,
          right: 12,
          // Encima de la barra de secciones de abajo
          bottom: 'calc(80px + env(safe-area-inset-bottom))',
          mx: 'auto',
          maxWidth: 440,
          zIndex: 1250,
          p: 2,
          borderRadius: 4,
          backgroundColor: 'var(--studio-bg-light)',
          backdropFilter: 'none',
          border: '1px solid rgb(var(--studio-primary-rgb) / 0.3)',
          boxShadow: '0 16px 48px rgb(var(--studio-dark-rgb) / 0.28)',
          '@keyframes crmSlideUp': { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
          animation: 'crmSlideUp .3s cubic-bezier(.2,.8,.2,1)',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          <Box
            component="img"
            src="/api/v1/site-config/icon/192.png?variant=panel"
            alt=""
            sx={{ width: 54, height: 54, borderRadius: 3.5, flexShrink: 0, boxShadow: '0 4px 12px rgb(var(--studio-dark-rgb) / 0.2)' }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--studio-dark)', lineHeight: 1.3 }}>
              Pon el programa en tu móvil
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--studio-text-muted)', lineHeight: 1.35 }}>
              Como una app más · gratis · 10 segundos
            </Typography>
          </Box>
          <IconButton onClick={dismiss} aria-label="Cerrar" sx={{ alignSelf: 'flex-start', mt: -1, mr: -1, width: 44, height: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {!showSteps ? (
          <>
            <Stack spacing={1} sx={{ mb: 2 }}>
              {BENEFITS.map((b) => (
                <Stack key={b.text} direction="row" spacing={1.25} alignItems="flex-start">
                  <Box sx={{ color: 'var(--studio-primary)', mt: '1px', display: 'flex' }} aria-hidden>{b.icon}</Box>
                  <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-text-strong)', lineHeight: 1.45 }}>{b.text}</Typography>
                </Stack>
              ))}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button onClick={dismiss} sx={{ minHeight: 48, color: 'var(--studio-text-muted)', flexShrink: 0 }}>
                Ahora no
              </Button>
              <Button
                variant="contained"
                fullWidth
                disabled={installing}
                onClick={native ? install : () => setShowSteps(true)}
                sx={{ minHeight: 48, fontSize: '1rem', borderRadius: 999 }}
              >
                {installing ? 'Abriendo…' : native ? 'Instalar' : 'Instalar — te enseño cómo'}
              </Button>
            </Stack>
          </>
        ) : (
          <>
            <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mb: 2, display: 'grid', gap: 1.25 }}>
              {steps.map((s, i) => (
                <Stack component="li" key={i} direction="row" spacing={1.25} alignItems="flex-start">
                  <Box
                    aria-hidden
                    sx={{
                      flexShrink: 0, width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
                      backgroundColor: 'var(--studio-primary)', color: '#fff', fontWeight: 600, fontSize: '0.9rem',
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-dark)', lineHeight: 1.5 }}>{s}</Typography>
                </Stack>
              ))}
            </Box>
            {isIOS && (
              <Typography sx={{ fontSize: '0.85rem', color: 'var(--studio-text-muted)', mb: 1.5, lineHeight: 1.45 }}>
                La primera vez que la abras desde el icono te pedirá entrar con tu email y contraseña.
              </Typography>
            )}
            <Button variant="contained" fullWidth onClick={() => { setOpen(false); setShowSteps(false); }} sx={{ minHeight: 48, borderRadius: 999 }}>
              Entendido
            </Button>
          </>
        )}
      </Paper>

      {/* iPhone con Safari: flecha hacia la barra de Safari, donde está Compartir */}
      {showSteps && device === 'ios-safari' && (
        <Box
          aria-hidden
          sx={{
            position: 'fixed', left: '50%', bottom: 'calc(6px + env(safe-area-inset-bottom))', zIndex: 1251,
            display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
            '@keyframes crmBounce': { '0%,100%': { transform: 'translate(-50%, 0)' }, '50%': { transform: 'translate(-50%, 8px)' } },
            transform: 'translateX(-50%)',
            animation: 'crmBounce 1.1s ease-in-out infinite',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <Box sx={{ backgroundColor: 'var(--studio-dark)', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 1.25, py: 0.5, borderRadius: 999 }}>
            La barra de Safari está aquí abajo
          </Box>
          <Box sx={{ fontSize: '1.6rem', lineHeight: 1, color: 'var(--studio-dark)' }}>↓</Box>
        </Box>
      )}
    </>
  );
}
