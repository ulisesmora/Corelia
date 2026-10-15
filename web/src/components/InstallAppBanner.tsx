"use client";

import { useEffect, useState } from 'react';
import { useLangStore, type Lang } from './stores/lang.store';
import { slotLabel } from './MembershipSuggestionCard';
import { ICON_URL, getSiteClient, shortName } from '../lib/site';

const DISMISS_KEY = 'installBannerDismissedAt';
const DISMISS_COUNT_KEY = 'installBannerDismissCount';
const INSTALLED_KEY = 'appInstalled';
const SESSION_CONTEXT_KEY = 'installPromptContextShown';
const PROMPT_EVENT = 'site:prompt-install';

// Reaparición escalonada: 1 día tras el primer "Ahora no", luego 3, 7 y 14.
// Insiste, pero cada vez con más espacio (nunca desaparece para siempre).
const COOLDOWN_DAYS = [1, 3, 7, 14];

// Solo tokens del estilo visual (presets.css): se lee igual en estilos oscuros.
const C = {
  brand: 'var(--accent)',
  brandDark: 'var(--accent-text)',
  brown: 'var(--page-text)',
  muted: 'var(--text-muted)',
};

type OS = 'ios' | 'android' | 'other';
type Reason = 'auto' | 'booking' | 'manual';

function detectOS(): OS {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** Navegadores internos de redes sociales: desde ahí NO se puede instalar. */
function isInAppBrowser(): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** ¿Tiene sentido ofrecer la instalación en este dispositivo? */
export function canOfferInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalone()) return false;
  try { if (localStorage.getItem(INSTALLED_KEY)) return false; } catch {}
  return detectOS() !== 'other';
}

// ── Nivel de confianza de quien visita (se guarda en su navegador) ───────────
//   new       → primer día y sin reservas: NUNCA aviso automático
//   returning → ha vuelto otro día, o tiene sesión y ya reservó alguna vez
//   regular   → viene cada semana (lo marca la recomendación de membresía)
const VISIT_DAYS_KEY = 'domVisitDays';
const HAS_BOOKED_KEY = 'domHasBooked';
const AUTO_SHOWN_KEY = 'installAutoShownCount';
const MAX_AUTO_SHOWS = 3; // después, solo el acceso fijo de "Mi cuenta"

type Tier = 'new' | 'returning' | 'regular';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Registra el día de hoy como día de visita (máx. 10 guardados). */
function trackVisitDay(): string[] {
  try {
    const days: string[] = JSON.parse(localStorage.getItem(VISIT_DAYS_KEY) || '[]');
    const today = todayKey();
    if (!days.includes(today)) days.push(today);
    const trimmed = days.slice(-10);
    localStorage.setItem(VISIT_DAYS_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch { return []; }
}

export function visitorTier(): Tier {
  try {
    if (localStorage.getItem('domIsRegular')) return 'regular';
    const days: string[] = JSON.parse(localStorage.getItem(VISIT_DAYS_KEY) || '[]');
    const loggedIn = !!localStorage.getItem('accessToken');
    if (days.length >= 2) return 'returning';
    if (loggedIn && localStorage.getItem(HAS_BOOKED_KEY)) return 'returning';
  } catch {}
  return 'new';
}

/**
 * Pide mostrar el banner de instalación desde cualquier parte de la web.
 * - 'booking': justo tras reservar. En la PRIMERA reserva de alguien nuevo no
 *   abrimos ninguna ventana: devuelve 'inline' para que la pantalla de éxito
 *   muestre solo una línea discreta. Si ya es recurrente → 'overlay'
 *   (una vez por sesión).
 * - 'manual': la persona tocó "Instalar la app" — siempre se muestra.
 * Devuelve qué se va a mostrar: 'overlay' | 'inline' | 'none'.
 */
export function requestInstallPrompt(reason: Exclude<Reason, 'auto'> = 'manual'): 'overlay' | 'inline' | 'none' {
  if (typeof window === 'undefined' || !canOfferInstall()) return 'none';
  if (reason === 'booking') {
    let firstBooking = true;
    try {
      firstBooking = !localStorage.getItem(HAS_BOOKED_KEY);
      localStorage.setItem(HAS_BOOKED_KEY, '1');
    } catch {}
    if (firstBooking && visitorTier() === 'new') return 'inline';
  }
  window.dispatchEvent(new CustomEvent(PROMPT_EVENT, { detail: { reason } }));
  return 'overlay';
}

// Capturamos beforeinstallprompt a nivel de módulo por si dispara antes de
// que el componente monte (Chrome lo emite muy pronto).
let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
  });
  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem(INSTALLED_KEY, String(Date.now())); } catch {}
  });
}

// Nombre corto de la app instalada (config del estudio)
const APP = () => shortName(getSiteClient());

// Textos ES/EN (el componente vive en el Navbar, client:only → sin SSR).
const TXT = {
  es: {
    benefits: [
      { icon: '🔔', title: 'Avisos al instante', desc: 'Si tu clase se cancela o cambia de hora, lo sabes al momento.' },
      { icon: '⏰', title: 'Nunca más una clase olvidada', desc: 'Recordatorio 2 horas antes y tu agenda del día cada mañana.' },
      { icon: '📅', title: 'Reserva en dos toques', desc: 'Se abre directa en tu calendario, sin buscar la web.' },
    ],
    regularTitle: (slot: string) => `Entérate al momento si cambia tu clase de ${slot}`,
    regularSub: 'Instala la app: avisos al instante y recordatorio antes de cada clase',
    headlines: {
      auto: { title: `Lleva ${APP()} en tu móvil`, sub: 'Gratis · no ocupa espacio · 10 segundos' },
      booking: { title: '¡Plaza reservada! 🎉', sub: 'Instala la app y te avisamos 2 h antes para que no se te pase' },
      manual: { title: `Instala la app de ${APP()}`, sub: 'Gratis · no ocupa espacio · 10 segundos' },
    } as Record<Reason, { title: string; sub: string }>,
    dialogLabel: `Instala la app de ${APP()}`,
    close: 'Cerrar',
    notNow: 'Ahora no',
    opening: 'Abriendo…',
    installHowTo: 'Instalar — te enseño cómo',
    installApp: 'Instalar la app',
    gotIt: 'Entendido',
    shareHere: 'Compartir está aquí abajo',
    ctaTitle: `Instala la app de ${APP()}`,
    ctaSub: 'Avisos de cambios y recordatorios de tus clases',
    ctaBtn: 'Instalar',
    inlineHint: '¿Quieres un recordatorio 2 h antes?',
    inlineHintBold: 'Instala la app',
  },
  en: {
    benefits: [
      { icon: '🔔', title: 'Instant alerts', desc: 'If your class is cancelled or moved, you’ll know straight away.' },
      { icon: '⏰', title: 'Never forget a class again', desc: 'A reminder 2 hours before and your day’s schedule every morning.' },
      { icon: '📅', title: 'Book in two taps', desc: 'Opens straight to your calendar, no need to look for the website.' },
    ],
    regularTitle: (slot: string) => `Know straight away if your class ${slot} changes`,
    regularSub: 'Install the app: instant alerts and a reminder before every class',
    headlines: {
      auto: { title: `Take ${APP()} with you on your phone`, sub: 'Free · takes no space · 10 seconds' },
      booking: { title: 'Spot booked! 🎉', sub: 'Install the app and we’ll remind you 2 h before so you don’t miss it' },
      manual: { title: `Install the ${APP()} app`, sub: 'Free · takes no space · 10 seconds' },
    } as Record<Reason, { title: string; sub: string }>,
    dialogLabel: `Install the ${APP()} app`,
    close: 'Close',
    notNow: 'Not now',
    opening: 'Opening…',
    installHowTo: 'Install — I’ll show you how',
    installApp: 'Install the app',
    gotIt: 'Got it',
    shareHere: 'Share is down here',
    ctaTitle: `Install the ${APP()} app`,
    ctaSub: 'Alerts about changes and reminders for your classes',
    ctaBtn: 'Install',
    inlineHint: 'Want a reminder 2 h before?',
    inlineHintBold: 'Install the app',
  },
};

function regularHeadline(lang: Lang): { title: string; sub: string } | null {
  try {
    const slot = localStorage.getItem('domFixedSlot');
    if (!slot) return null;
    const L = TXT[lang];
    return { title: L.regularTitle(slotLabel(slot, lang)), sub: L.regularSub };
  } catch { return null; }
}

/**
 * Banner para instalar la web como app (PWA). Montado de forma global (vía
 * Navbar) para que aparezca en toda la web, no solo en portada/dashboard.
 * Android: diálogo nativo de instalación. iPhone: guía paso a paso con una
 * flecha animada señalando el botón Compartir. Instagram/Facebook: explica
 * cómo abrir la web en el navegador (desde ahí no se puede instalar).
 */
export default function InstallAppBanner() {
  const lang = useLangStore((st) => st.lang);
  const L = TXT[lang] ?? TXT.es;
  const [os, setOs] = useState<OS>('other');
  const [inApp, setInApp] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [reason, setReason] = useState<Reason>('auto');

  useEffect(() => {
    const system = detectOS();
    setOs(system);
    setInApp(isInAppBrowser());
    if (!canOfferInstall()) return;

    // Disparo por contexto (tras reservar) o por botón
    const onRequest = (e: Event) => {
      const r = ((e as CustomEvent).detail?.reason || 'manual') as Reason;
      if (!canOfferInstall()) return;
      if (r === 'booking') {
        try {
          if (sessionStorage.getItem(SESSION_CONTEXT_KEY)) return;
          sessionStorage.setItem(SESSION_CONTEXT_KEY, '1');
        } catch {}
      }
      setReason(r);
      setShowSteps(r === 'manual' && system === 'ios');
      setVisible(true);
    };
    window.addEventListener(PROMPT_EVENT, onRequest);

    // Aparición automática SOLO para quien vuelve (o viene cada semana).
    // Alguien nuevo nunca ve el aviso sin pedirlo: primero que conozca el estudio.
    let t: ReturnType<typeof setTimeout> | undefined;
    trackVisitDay();
    try {
      const tier = visitorTier();
      const autoShown = Number(localStorage.getItem(AUTO_SHOWN_KEY) || 0);
      const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
      const count = Number(localStorage.getItem(DISMISS_COUNT_KEY) || 0);
      const cooldown = COOLDOWN_DAYS[Math.min(Math.max(count - 1, 0), COOLDOWN_DAYS.length - 1)];
      const resting = dismissed && Date.now() - dismissed < cooldown * 24 * 3600 * 1000;
      if (tier !== 'new' && autoShown < MAX_AUTO_SHOWS && !resting) {
        t = setTimeout(() => {
          setReason('auto');
          setVisible(true);
          try { localStorage.setItem(AUTO_SHOWN_KEY, String(autoShown + 1)); } catch {}
        }, 4000);
      }
    } catch {}

    return () => {
      window.removeEventListener(PROMPT_EVENT, onRequest);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      const count = Number(localStorage.getItem(DISMISS_COUNT_KEY) || 0);
      localStorage.setItem(DISMISS_COUNT_KEY, String(count + 1));
    } catch {}
    setVisible(false);
    setShowSteps(false);
  };

  const handleInstallAndroid = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (choice.outcome === 'accepted') {
          try { localStorage.setItem(INSTALLED_KEY, String(Date.now())); } catch {}
          setVisible(false);
          return;
        }
      } catch {}
      setInstalling(false);
    } else {
      // Sin evento (navegador sin soporte): instrucciones manuales
      setShowSteps(true);
    }
  };

  if (!visible) return null;

  const pill = (content: React.ReactNode) => (
    <span style={{
      display: 'inline-block', border: `1.5px solid ${C.brandDark}`, borderRadius: 'var(--radius-chip)',
      padding: '0 6px', fontWeight: 800, color: C.brandDark, lineHeight: 1.4,
    }}>{content}</span>
  );

  const browser = os === 'ios' ? 'Safari' : 'Chrome';
  const iosSteps = lang === 'en' ? [
    { n: '1', text: <>Tap {pill('⬆')} <b>Share</b> in Safari’s bottom bar.</> },
    { n: '2', text: <>Scroll down and choose <b>“Add to Home Screen”</b>.</> },
    { n: '3', text: <>Tap <b>“Add”</b>. Done! Open <b>{APP()}</b> from your home screen and turn on notifications.</> },
  ] : [
    { n: '1', text: <>Toca {pill('⬆')} <b>Compartir</b>, en la barra de abajo de Safari.</> },
    { n: '2', text: <>Baja y elige <b>«Añadir a pantalla de inicio»</b>.</> },
    { n: '3', text: <>Toca <b>«Añadir»</b>. ¡Listo! Abre <b>{APP()}</b> desde tu pantalla y activa los avisos.</> },
  ];

  const androidSteps = lang === 'en' ? [
    { n: '1', text: <>Tap the {pill('⋮')} menu at the top right of Chrome.</> },
    { n: '2', text: <>Choose <b>“Install app”</b> (or “Add to Home screen”).</> },
    { n: '3', text: <>Confirm with <b>“Install”</b>. Open <b>{APP()}</b> from your home screen and turn on notifications.</> },
  ] : [
    { n: '1', text: <>Toca el menú {pill('⋮')} arriba a la derecha de Chrome.</> },
    { n: '2', text: <>Elige <b>«Instalar aplicación»</b> (o «Añadir a pantalla de inicio»).</> },
    { n: '3', text: <>Confirma con <b>«Instalar»</b>. Abre <b>{APP()}</b> desde tu pantalla y activa los avisos.</> },
  ];

  const inAppSteps = lang === 'en' ? [
    { n: '1', text: <>You’re inside Instagram/Facebook, and the app can’t be installed from here.</> },
    { n: '2', text: <>Tap {pill('⋯')} at the top right and choose <b>“Open in {browser}”</b> (or “Open in browser”).</> },
    { n: '3', text: <>You’ll see this same message there, with the button to install.</> },
  ] : [
    { n: '1', text: <>Estás dentro de Instagram/Facebook y desde aquí no se puede instalar.</> },
    { n: '2', text: <>Toca {pill('⋯')} arriba a la derecha y elige <b>«Abrir en {browser}»</b> (o «Abrir en navegador»).</> },
    { n: '3', text: <>Allí te aparecerá este mismo aviso con el botón para instalar.</> },
  ];

  const steps = inApp ? inAppSteps : os === 'ios' ? iosSteps : androidSteps;
  const head = (reason === 'auto' && regularHeadline(lang)) || L.headlines[reason];
  const showIosArrow = showSteps && os === 'ios' && !inApp && !/iPad/.test(navigator.userAgent);

  return (
    <>
      {/* Fondo atenuado solo en el momento de máxima intención (tras reservar) */}
      {reason === 'booking' && (
        <div
          onClick={dismiss}
          style={{
            position: 'fixed', inset: 0, background: 'var(--overlay)',
            zIndex: 1349, animation: 'domFadeIn .25s ease',
          }}
        />
      )}

      <style>{`
        @keyframes domSlideUp { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes domFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes domBounce { 0%,100% { transform: translate(-50%, 0) } 50% { transform: translate(-50%, 8px) } }
        @media (prefers-reduced-motion: reduce) {
          .site-install-card, .site-install-arrow { animation: none !important; }
        }
      `}</style>

      <div
        className="site-install-card sk-panel"
        role="dialog"
        aria-label={L.dialogLabel}
        style={{
          position: 'fixed',
          left: '12px',
          right: '12px',
          bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
          zIndex: 1350,
          padding: '16px',
          fontFamily: 'var(--font-body)',
          maxWidth: '420px',
          margin: '0 auto',
          animation: 'domSlideUp .3s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* Cabecera con el icono real de la app */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <img
            src={ICON_URL.icon192}
            alt=""
            width={54}
            height={54}
            style={{ borderRadius: '14px', flexShrink: 0, boxShadow: '0 4px 12px color-mix(in srgb, var(--brand-dark) 28%, transparent)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--heading-color)', lineHeight: 1.25 }}>
              {head.title}
            </div>
            <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.35, marginTop: 2 }}>
              {head.sub}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label={L.close}
            style={{
              background: 'none', border: 'none', color: 'var(--text-subtle)',
              fontSize: '1.4rem', cursor: 'pointer', padding: '8px', lineHeight: 1,
              minWidth: 44, minHeight: 44, alignSelf: 'flex-start', marginTop: -8, marginRight: -8,
            }}
          >
            ×
          </button>
        </div>

        {!showSteps ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '14px' }}>
              {L.benefits.map((b) => (
                <div key={b.title} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.1rem', lineHeight: 1.3 }} aria-hidden>{b.icon}</span>
                  <div style={{ fontSize: '0.84rem', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700, color: C.brown }}>{b.title}. </span>
                    <span style={{ color: C.muted }}>{b.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={dismiss}
                style={{
                  flex: '0 0 auto', background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '0.85rem', cursor: 'pointer', padding: '12px', fontWeight: 600,
                  minHeight: 44, fontFamily: 'var(--font-body)',
                }}
              >
                {L.notNow}
              </button>
              <button
                className="sk-btn"
                onClick={inApp || os === 'ios' ? () => setShowSteps(true) : handleInstallAndroid}
                disabled={installing}
                style={{
                  flex: 1, padding: '13px 16px',
                  fontSize: '0.95rem', cursor: 'pointer', minHeight: 48,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {installing ? L.opening : inApp || os === 'ios' ? L.installHowTo : L.installApp}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
              {steps.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span
                    style={{
                      flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
                      background: C.brand, color: 'var(--on-primary)', fontWeight: 800, fontSize: '0.82rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {s.n}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: C.brown, lineHeight: 1.5 }}>{s.text}</span>
                </div>
              ))}
            </div>
            <button
              className="sk-btn"
              onClick={dismiss}
              style={{
                width: '100%', padding: '13px 16px',
                fontSize: '0.95rem', cursor: 'pointer', minHeight: 48,
                fontFamily: 'var(--font-body)',
              }}
            >
              {L.gotIt}
            </button>
          </>
        )}
      </div>

      {/* iPhone: flecha que señala el botón Compartir de Safari (abajo al centro) */}
      {showIosArrow && (
        <div
          className="site-install-arrow"
          aria-hidden
          style={{
            position: 'fixed', left: '50%', bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
            zIndex: 1351, transform: 'translateX(-50%)',
            animation: 'domBounce 1.1s ease-in-out infinite',
            display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
          }}
        >
          <span style={{
            background: 'var(--deep-bg)', color: 'var(--deep-text)', fontSize: '0.72rem', fontWeight: 700,
            padding: '4px 10px', borderRadius: 'var(--radius-chip)', fontFamily: 'var(--font-body)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>
            {L.shareHere}
          </span>
          <span style={{ fontSize: '1.6rem', lineHeight: 1, color: C.brown, textShadow: '0 2px 6px var(--page-bg)' }}>↓</span>
        </div>
      )}
    </>
  );
}

/**
 * Acceso fijo para instalar (tarjeta compacta, no flotante). Se coloca en
 * "Mi cuenta" para que quien descartó el banner siempre tenga el camino a mano.
 * No se muestra en escritorio ni si la app ya está instalada.
 */
export function InstallAppCTA({ compact = false }: { compact?: boolean }) {
  const L = TXT[useLangStore((st) => st.lang)] ?? TXT.es;
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(canOfferInstall()); }, []);
  if (!show) return null;

  return (
    <button
      onClick={() => requestInstallPrompt('manual')}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        padding: compact ? '10px 12px' : '14px 16px', borderRadius: 'var(--radius-card)', cursor: 'pointer',
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent-border)', fontFamily: 'var(--font-body)',
        minHeight: 56,
      }}
    >
      <img src={ICON_URL.icon192} alt="" width={compact ? 36 : 44} height={compact ? 36 : 44}
        style={{ borderRadius: 11, flexShrink: 0, boxShadow: '0 2px 8px color-mix(in srgb, var(--brand-dark) 22%, transparent)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', color: C.brown }}>
          {L.ctaTitle}
        </span>
        <span style={{ display: 'block', fontSize: '0.76rem', color: C.muted, lineHeight: 1.35 }}>
          {L.ctaSub}
        </span>
      </span>
      <span className="sk-btn" style={{
        flexShrink: 0, padding: '8px 14px', fontSize: '0.8rem',
      }}>
        {L.ctaBtn}
      </span>
    </button>
  );
}

/**
 * Línea discreta para la pantalla de éxito de la PRIMERA reserva: invita sin
 * abrir ninguna ventana. Solo si tiene sentido ofrecer la instalación.
 */
export function InstallInlineHint() {
  const L = TXT[useLangStore((st) => st.lang)] ?? TXT.es;
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(canOfferInstall()); }, []);
  if (!show) return null;
  return (
    <button type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(PROMPT_EVENT, { detail: { reason: 'manual' } }))}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        padding: '10px 12px', borderRadius: 'var(--radius-input)', cursor: 'pointer', minHeight: 48,
        background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
        fontFamily: 'var(--font-body)',
      }}>
      <img src={ICON_URL.icon192} alt="" width={32} height={32} style={{ borderRadius: 8, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.84rem', color: C.brown, lineHeight: 1.35 }}>
        {L.inlineHint} <b>{L.inlineHintBold}</b>
      </span>
      <span style={{ color: C.brandDark, fontWeight: 800, fontSize: '0.84rem' }}>→</span>
    </button>
  );
}
