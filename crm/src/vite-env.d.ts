/// <reference types="vite/client" />

// Identificador del despliegue (commit o hora del build), lo inyecta vite.config.ts
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** URL del API (con barra final). Por defecto '/api/' (mismo dominio). */
  readonly VITE_API_URL?: string;
  /** DSN de Sentry (opcional) */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}
