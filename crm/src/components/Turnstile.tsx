import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Casilla de seguridad de Cloudflare Turnstile (captcha sin cookies de
 * seguimiento). Solo se pinta cuando el API la pide (captcha_required) y el
 * estudio la tiene configurada (turnstile_site_key en la config pública).
 * El script de Cloudflare se descarga aquí, no en todo el panel.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
      s.onerror = () => { loading = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

interface Props {
  siteKey: string;
  /** Token válido ('' cuando caduca o falla) */
  onToken: (token: string) => void;
  /** Cambia el número para pedir una casilla nueva (tras usar el token) */
  resetKey?: number;
}

export default function Turnstile({ siteKey, onToken, resetKey = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId = '';
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current) return;
        widgetId = ts.render(box.current, {
          sitekey: siteKey,
          language: 'es',
          theme: 'light',
          callback: (t: string) => onTokenRef.current(t),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
        });
      })
      .catch(() => onTokenRef.current(''));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey]);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', mb: 1 }}>
        Por seguridad, marca la casilla para comprobar que eres una persona:
      </Typography>
      <Box ref={box} sx={{ minHeight: 65 }} />
    </Box>
  );
}
