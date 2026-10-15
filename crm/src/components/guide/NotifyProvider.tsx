import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { NOTIFY_SUCCESS_EVENT } from './events';

type Severity = 'success' | 'error' | 'info' | 'warning';
type NotifyFn = (message: ReactNode, severity?: Severity) => void;

const NotifyContext = createContext<NotifyFn | null>(null);

/**
 * Aviso grande abajo en el centro tras cada acción ("Guardado ✓", "No se
 * pudo guardar: …"). Los errores se quedan hasta que se cierran; los demás
 * duran 7 s para dar tiempo a leerlos.
 */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; message: ReactNode; severity: Severity }>({
    open: false, message: '', severity: 'success',
  });

  const notify = useCallback<NotifyFn>((message, severity = 'success') => {
    setState({ open: true, message, severity });
    if (severity === 'success') window.dispatchEvent(new Event(NOTIFY_SUCCESS_EVENT));
  }, []);

  const close = () => setState((s) => ({ ...s, open: false }));

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <Snackbar
        open={state.open}
        onClose={(_, reason) => { if (reason !== 'clickaway') close(); }}
        autoHideDuration={state.severity === 'error' ? null : 7000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        // En el móvil, por encima de la barra de secciones de abajo
        sx={(theme) => ({ [theme.breakpoints.down('md')]: { bottom: 'calc(80px + env(safe-area-inset-bottom))' } })}
      >
        <Alert
          onClose={close}
          severity={state.severity}
          variant="filled"
          sx={{ fontSize: '1rem', alignItems: 'center', minWidth: { sm: 380 }, boxShadow: '0 10px 30px rgb(var(--studio-shadow-rgb) / 0.25)' }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyFn {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify necesita <NotifyProvider>');
  return ctx;
}
