import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';

export interface ConfirmOptions {
  /** Pregunta clara: "¿Borrar la clase Pilates Mat de los lunes?" */
  title: string;
  /** Qué va a pasar exactamente, en frases cortas */
  message?: ReactNode;
  /** Texto del botón que ejecuta la acción: "Sí, borrar la clase" */
  confirmText?: string;
  cancelText?: string;
  /** 'danger' pinta el botón en rojo y muestra el icono de aviso */
  tone?: 'danger' | 'normal';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Sustituye a window.confirm(): ventana grande, con la pregunta en lenguaje
 * llano, qué va a pasar y botones que dicen lo que hacen ("Sí, borrar" /
 * "No, volver"). Uso: `if (!(await confirm({...}))) return;`
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOpts(null);
  };

  const danger = opts?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(opts)} onClose={() => close(false)} maxWidth="xs" fullWidth>
        {opts && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  aria-hidden
                  sx={{
                    width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                    backgroundColor: danger ? 'rgba(194,133,122,0.15)' : 'rgb(var(--studio-primary-rgb) / 0.15)',
                    color: danger ? '#A86B5E' : 'var(--studio-primary-shade)',
                  }}
                >
                  {danger ? <WarningAmberRoundedIcon /> : <HelpOutlineRoundedIcon />}
                </Box>
                <Box component="span" sx={{ fontSize: '1.25rem', lineHeight: 1.35 }}>{opts.title}</Box>
              </Stack>
            </DialogTitle>
            {opts.message && (
              <DialogContent>
                <Typography component="div" sx={{ fontSize: '1rem', color: 'var(--studio-text-strong)', lineHeight: 1.65 }}>
                  {opts.message}
                </Typography>
              </DialogContent>
            )}
            <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
              <Button variant="outlined" onClick={() => close(false)} sx={{ minHeight: 48 }} autoFocus>
                {opts.cancelText || 'No, volver'}
              </Button>
              <Button
                variant="contained"
                onClick={() => close(true)}
                sx={{
                  minHeight: 48, ml: '0 !important',
                  ...(danger && {
                    background: '#B5584A !important',
                    '&:hover': { background: '#9C4A3E !important' },
                  }),
                }}
              >
                {opts.confirmText || 'Sí, continuar'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm necesita <ConfirmProvider>');
  return ctx;
}
