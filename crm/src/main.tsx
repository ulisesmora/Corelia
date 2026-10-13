import { Sentry } from './sentry';
import React, { useMemo, type ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import CrashScreen from './components/CrashScreen';
import { ConfirmProvider, NotifyProvider } from './components/guide';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import AppUpdater from './components/AppUpdater';
import { SiteProvider, useSite } from './site/SiteProvider';
import { fetchPublicSiteConfig } from './site/siteConfig';
import { setStudioTz } from './site/timezone';
import { buildTheme } from './theme';

// Tema MUI con los colores y fuentes del estudio (src/theme.ts). Se reconstruye
// cuando cambia la configuración (p. ej. tras guardar los ajustes y refresh()).
function StudioTheme({ App }: { App: ComponentType }) {
  const { config } = useSite();
  const theme = useMemo(() => buildTheme(config), [config]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Sentry.ErrorBoundary fallback={({ resetError }) => <CrashScreen onRetry={resetError} />}>
        <BrowserRouter>
          <AppUpdater />
          <NotifyProvider>
            <ConfirmProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ConfirmProvider>
          </NotifyProvider>
        </BrowserRouter>
      </Sentry.ErrorBoundary>
    </ThemeProvider>
  );
}

// Primero la configuración del estudio y después las pantallas: así la zona
// horaria ya está fijada cuando cada pantalla crea sus formateadores de fecha,
// y no se ve un instante con los colores por defecto.
async function bootstrap() {
  const initialConfig = await fetchPublicSiteConfig();
  setStudioTz(initialConfig.timezone);
  const { default: App } = await import('./App');

  ReactDOM.createRoot(document.getElementById('root')!, {
    onUncaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  }).render(
    <React.StrictMode>
      <SiteProvider initialConfig={initialConfig}>
        <StudioTheme App={App} />
      </SiteProvider>
    </React.StrictMode>
  );
}

bootstrap();
