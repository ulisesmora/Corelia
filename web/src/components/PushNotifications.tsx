"use client";

import { useEffect, useState } from 'react';
import { useLangStore } from './stores/lang.store';
import { API_ROOT } from '../config';

const API_BASE = `${API_ROOT}/`;
const DISMISS_KEY = 'pushPromptDismissedAt';
const DISMISS_DAYS = 14;

const TXT = {
  es: {
    iosTitle: '📲 Instala la app en tu iPhone',
    enableTitle: '🔔 Avisos de tus clases',
    iosBody: 'Para recibir recordatorios de tus clases: toca Compartir (□↑) y luego "Añadir a pantalla de inicio".',
    enableBody: 'Recibe un recordatorio 2 horas antes de cada clase y tu agenda del día.',
    notNow: 'Ahora no',
    enabling: 'Activando…',
    enable: 'Activar avisos',
    gotIt: 'Entendido',
  },
  en: {
    iosTitle: '📲 Install the app on your iPhone',
    enableTitle: '🔔 Class notifications',
    iosBody: 'To get reminders for your classes: tap Share (□↑) and then “Add to Home Screen”.',
    enableBody: 'Get a reminder 2 hours before each class and your schedule for the day.',
    notNow: 'Not now',
    enabling: 'Turning on…',
    enable: 'Turn on notifications',
    gotIt: 'Got it',
  },
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(registration: ServiceWorkerRegistration, token: string): Promise<boolean> {
  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const res = await fetch(`${API_BASE}v1/push/vapid-public-key/`);
      if (!res.ok) return false;
      const { publicKey } = await res.json();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const save = await fetch(`${API_BASE}v1/push/subscribe/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return save.ok;
  } catch (e) {
    console.error('Push subscribe error:', e);
    return false;
  }
}

/**
 * Gestiona las notificaciones push:
 * - Registra el service worker (también necesario para la PWA instalable).
 * - Si el usuario está logueado y ya dio permiso, sincroniza la suscripción.
 * - Si aún no dio permiso, muestra un aviso discreto para activarlas.
 * En iOS solo funciona con la web instalada en pantalla de inicio (iOS 16.4+);
 * si no hay soporte, no se muestra nada.
 */
export default function PushNotifications() {
  const L = TXT[useLangStore((st) => st.lang)] ?? TXT.es;
  const [showPrompt, setShowPrompt] = useState(false);
  const [mode, setMode] = useState<'enable' | 'ios'>('enable');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        let token: string | null = null;
        try {
          token = localStorage.getItem('accessToken');
        } catch {}
        if (!token) return; // solo usuarios logueados

        // En móvil sin instalar, la instalación la guía InstallAppBanner
        // (evitamos dos tarjetas compitiendo). El prompt de avisos aparece
        // dentro de la app instalada o en escritorio.
        const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
        const isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as any).standalone === true;
        if (isMobile && !isStandalone) {
          // Si ya dio permiso antes (p. ej. Android en navegador), re-sincronizamos igual
          if ('PushManager' in window && Notification.permission === 'granted') {
            subscribeToPush(registration, token);
          }
          return;
        }

        if (!('PushManager' in window) || !('Notification' in window)) return;

        if (Notification.permission === 'granted') {
          // Re-sincronizar en silencio (endpoints rotan, usuarios cambian de sesión)
          subscribeToPush(registration, token);
          return;
        }
        if (Notification.permission === 'denied') return;

        // permiso 'default': ofrecer activación si no lo descartó hace poco
        try {
          const dismissed = localStorage.getItem(DISMISS_KEY);
          if (dismissed && Date.now() - Number(dismissed) < DISMISS_DAYS * 24 * 3600 * 1000) return;
        } catch {}
        setShowPrompt(true);
      })
      .catch((e) => console.error('SW register error:', e));
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const token = localStorage.getItem('accessToken');
        if (token) await subscribeToPush(registration, token);
      }
    } finally {
      setBusy(false);
      setShowPrompt(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="sk-panel" style={{
      position: 'fixed', bottom: '86px', right: '16px', zIndex: 1400,
      maxWidth: '320px', padding: '14px 16px',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--heading-color)', marginBottom: '4px' }}>
        {mode === 'ios' ? L.iosTitle : L.enableTitle}
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
        {mode === 'ios' ? L.iosBody : L.enableBody}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={dismiss} disabled={busy} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: '0.85rem', cursor: 'pointer', padding: '8px 10px',
        }}>
          {L.notNow}
        </button>
        {mode === 'enable' && (
          <button className="sk-btn" onClick={enable} disabled={busy} style={{
            padding: '8px 16px',
            fontSize: '0.85rem', cursor: 'pointer', opacity: busy ? 0.7 : 1,
          }}>
            {busy ? L.enabling : L.enable}
          </button>
        )}
        {mode === 'ios' && (
          <button className="sk-btn" onClick={dismiss} style={{
            padding: '8px 16px',
            fontSize: '0.85rem', cursor: 'pointer',
          }}>
            {L.gotIt}
          </button>
        )}
      </div>
    </div>
  );
}
