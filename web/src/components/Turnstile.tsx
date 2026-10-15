"use client";

/**
 * Casilla de seguridad de Cloudflare Turnstile (captcha sin cookies de
 * seguimiento; casi siempre se resuelve sola, sin «buscar semáforos»).
 *
 * - Solo se usa en los formularios que la necesitan (crear cuenta, recuperar
 *   contraseña, pagar sin cuenta y entrar tras varios fallos) y el script de
 *   Cloudflare se descarga SOLO cuando este componente se pinta.
 * - Render explícito, en el idioma de la página (es/en).
 * - Sin clave (turnstile_site_key vacía en la config del estudio) no pinta nada.
 * - Es un servicio de seguridad estrictamente necesario: no depende del
 *   consentimiento de cookies (ver la política de cookies).
 */

import { useEffect, useRef } from "react";
import { Box, Text } from "@chakra-ui/react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
      s.onerror = () => { loading = null; reject(new Error("turnstile")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const COPY = {
  es: {
    label: "Por seguridad, comprueba que eres una persona:",
    failed: "No se ha podido cargar la casilla de seguridad. Revisa tu conexión y recarga la página.",
  },
  en: {
    label: "For security, please confirm you're a person:",
    failed: "The security check could not load. Check your connection and reload the page.",
  },
};

interface Props {
  siteKey: string;
  lang: "es" | "en";
  /** Token válido ('' si caduca o falla). Cada token sirve UNA vez. */
  onToken: (token: string) => void;
  /** Cambia el número para pedir una casilla nueva (tras usar el token). */
  resetKey?: number;
  /** Ocultar la frase de arriba (si el formulario ya lo explica). */
  hideLabel?: boolean;
}

export default function Turnstile({ siteKey, lang, onToken, resetKey = 0, hideLabel = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const failed = useRef<HTMLParagraphElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const t = COPY[lang] ?? COPY.es;

  useEffect(() => {
    if (!siteKey) return;
    let widgetId = "";
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current) return;
        widgetId = ts.render(box.current, {
          sitekey: siteKey,
          language: lang,
          size: "flexible",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => {
        onTokenRef.current("");
        if (failed.current) failed.current.hidden = false;
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, lang, resetKey]);

  if (!siteKey) return null;
  return (
    <Box w="full" data-turnstile>
      {!hideLabel && (
        <Text fontSize="14px" color="var(--text-muted)" fontFamily="var(--font-body)" mb={2}>
          {t.label}
        </Text>
      )}
      <Box ref={box} minH="65px" w="full" />
      <Text ref={failed} hidden fontSize="14px" color="var(--danger)" fontFamily="var(--font-body)" mt={1}>
        {t.failed}
      </Text>
    </Box>
  );
}
