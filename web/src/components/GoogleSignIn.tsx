"use client";

/**
 * Botón "Continuar con Google" con Google Identity Services (GIS).
 *
 * - El script de Google (accounts.google.com/gsi/client) se carga BAJO DEMANDA,
 *   solo cuando se muestra el botón (formulario de acceso).
 * - El client_id sale de la config del estudio (`google_client_id`). Si está
 *   vacío, el botón no se muestra.
 * - Google devuelve un ID token (JWT) en `response.credential`; se envía a
 *   POST /api/google-login/ { credential } y el backend responde con los
 *   mismos tokens que el login con email (access, refresh, userid, username…).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { toaster } from './ui/toaster';
import { useLangStore } from './stores/lang.store';
import { API_ROOT } from '../config';
import { useSite } from '../lib/site';

const API_LOGIN_URL = `${API_ROOT}/google-login/`;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface AuthResponse {
  access: string;
  refresh: string;
  user_id?: number;
  userid?: number;
  username?: string | null;
  email?: string;
  detail?: string;
  name?: string | null;
}

interface GoogleCredentialResponse { credential?: string }

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const T = {
  es: {
    loading: 'Entrando con Google…',
    welcome: (n: string) => `¡Hola, ${n}!`,
    welcomeDesc: 'Has entrado con Google.',
    errTitle: 'No hemos podido entrar con Google',
    errGeneric: 'No hemos podido entrar con Google. Inténtalo de nuevo o usa tu email.',
    errNetwork: 'No hay conexión. Revisa tu internet e inténtalo de nuevo.',
    errLoad: 'No se ha podido cargar el acceso con Google. Si usas un bloqueador o el navegador de una app, abre esta web en Safari o Chrome, o entra con tu email.',
    errServer: 'Algo ha fallado por nuestra parte. Inténtalo en unos minutos o entra con tu email.',
  },
  en: {
    loading: 'Signing in with Google…',
    welcome: (n: string) => `Hi, ${n}!`,
    welcomeDesc: "You're logged in with Google.",
    errTitle: "We couldn't log you in with Google",
    errGeneric: "We couldn't log you in with Google. Try again or use your email.",
    errNetwork: 'No connection. Check your internet and try again.',
    errLoad: "Google sign-in couldn't load. If you use a blocker or an in-app browser, open this site in Safari or Chrome, or use your email.",
    errServer: 'Something went wrong on our side. Try again in a few minutes or use your email.',
  },
};

// Una sola carga del script por página, compartida por todos los botones
let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.google?.accounts?.id ? resolve() : reject(new Error('gsi')));
      s.onerror = () => reject(new Error('gsi'));
      document.head.appendChild(s);
    });
    gsiPromise.catch(() => { gsiPromise = null; }); // permitir reintento
  }
  return gsiPromise;
}

/** ¿Hay que mostrar el acceso con Google? (config del estudio) */
export function useGoogleLoginEnabled(): boolean {
  const site = useSite();
  return !!(site.google_login_enabled && site.google_client_id);
}

interface GoogleAuthButtonProps {
  /** Tras guardar la sesión. Si no se pasa: aviso + recarga. */
  onSuccess?: (data: { access: string; refresh: string; user_id: number; username?: string; name?: string }) => void;
  /** Mensaje ya traducido. Si no se pasa, se muestra un toast. */
  onError?: (message: string) => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ onSuccess, onError }) => {
  const lang = useLangStore((s) => s.lang);
  const tx = lang === 'en' ? T.en : T.es;
  const site = useSite();
  const clientId = site.google_client_id;
  const boxRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fail = useCallback((message: string) => {
    if (onError) onError(message);
    else toaster.create({ title: tx.errTitle, description: message, type: 'error' });
  }, [onError, tx]);

  // El callback de GIS se fija una vez al inicializar: guardamos la versión
  // más reciente de la función en una ref para que use siempre props/idioma actuales.
  const handleCredentialRef = useRef<(r: GoogleCredentialResponse) => void>(() => {});
  handleCredentialRef.current = async (resp: GoogleCredentialResponse) => {
    if (!resp?.credential) { fail(tx.errGeneric); return; }
    setIsLoading(true);
    try {
      let response: Response;
      try {
        response = await fetch(API_LOGIN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: resp.credential }),
        });
      } catch {
        fail(tx.errNetwork);
        return;
      }

      if (!response.ok) {
        // 4xx con mensaje claro del backend (p. ej. email sin verificar): se muestra.
        let detail = '';
        try { detail = (await response.json())?.detail || ''; } catch { /* sin cuerpo */ }
        fail(response.status >= 500 ? tx.errServer : (lang === 'es' && detail) || tx.errGeneric);
        return;
      }

      const data: AuthResponse = await response.json();
      const userId = data.user_id ?? data.userid;
      const displayName = (data.username || data.name || (data.email || '').split('@')[0] || '').trim();

      try {
        localStorage.setItem('accessToken', data.access);
        localStorage.setItem('refreshToken', data.refresh);
        localStorage.setItem('refresh', data.refresh); // clave antigua (compatibilidad)
        if (userId != null) localStorage.setItem('iduser', String(userId));
        if (displayName) localStorage.setItem('username', displayName);
        localStorage.setItem('sessionTimestamp', Date.now().toString());
      } catch { /* localStorage no disponible */ }

      if (onSuccess) {
        onSuccess({ access: data.access, refresh: data.refresh, user_id: Number(userId), username: displayName, name: displayName });
      } else {
        toaster.create({
          title: tx.welcome(displayName.split(' ')[0] || ''),
          description: tx.welcomeDesc,
          type: 'success',
        });
        setTimeout(() => window.location.reload(), 1000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Carga GIS, inicializa con el client_id del estudio y pinta el botón oficial.
  // Se vuelve a pintar al cambiar de idioma (el texto lo pone Google).
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !boxRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r: GoogleCredentialResponse) => handleCredentialRef.current(r),
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        boxRef.current.innerHTML = '';
        const width = Math.min(400, Math.max(200, Math.round(boxRef.current.offsetWidth || 320)));
        window.google.accounts.id.renderButton(boxRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width,
          locale: lang,
        });
        setLoadError(false);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [clientId, lang]);

  if (!clientId) return null;

  return (
    <Box w="full" position="relative" aria-busy={isLoading || undefined}>
      {/* Aquí GIS pinta su botón (iframe de Google) */}
      <Box ref={boxRef} w="full" minH="44px" display="flex" justifyContent="center"
        opacity={isLoading ? 0.4 : 1} pointerEvents={isLoading ? 'none' : 'auto'} />
      {isLoading && (
        <Text mt={2} textAlign="center" fontSize="sm" color="var(--brand-secondary)" fontFamily="var(--font-body)" fontWeight={600}>
          {tx.loading}
        </Text>
      )}
      {loadError && (
        <Text mt={2} textAlign="center" fontSize="sm" color="#8A5A00" fontFamily="var(--font-body)">
          {tx.errLoad}
        </Text>
      )}
    </Box>
  );
};

export default GoogleAuthButton;
