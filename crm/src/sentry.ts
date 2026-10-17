import * as Sentry from '@sentry/react';

// Sentry del panel (opcional). Solo se activa en producción y cuando existe la
// variable VITE_SENTRY_DSN en el momento de compilar; sin ella no hace nada.
// El panel maneja datos personales de clientes: nada de IPs, ni grabación de
// sesiones, ni cuerpos de peticiones.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn) && import.meta.env.PROD;

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production',
    release: __APP_VERSION__,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    // Muy poco tráfico (solo el equipo): cabe al 100% en la cuota gratuita
    tracesSampleRate: 1.0,
    // Sin cabeceras de traza en las peticiones a la API: quedan exactamente
    // igual que sin Sentry
    tracePropagationTargets: [],
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],
    denyUrls: [/localhost/i, /127\.0\.0\.1/],
  });
}

export { Sentry };
