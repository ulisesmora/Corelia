import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { FormStep, PageIntro, useNotify } from '../components/guide';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../site/SiteProvider';
import { authHeaders } from '../utils/auth';
import { friendlyError } from '../utils/errors';

interface Status {
  enabled: boolean;
  confirmed_at: string | null;
  recovery_codes_left: number;
  required_by_studio: boolean;
  setup_required: boolean;
}

interface SetupData {
  qr_svg: string;
  secret: string;
  account: string;
  issuer: string;
}

type Body = Record<string, unknown>;

async function api<T>(path: string, body?: Body): Promise<T> {
  const res = await fetch(`${API_BASE_URL}v1/auth/2fa/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* sin JSON */ }
  if (!res.ok) {
    const message = (typeof data.error === 'string' && data.error) || (typeof data.detail === 'string' && data.detail);
    throw new Error(message || await friendlyError(res));
  }
  return data as T;
}

const sixDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/** Lista de códigos de recuperación con descargar / imprimir / copiar. */
function RecoveryCodes({ codes, studio, onDone }: { codes: string[]; studio: string; onDone: () => void }) {
  const notify = useNotify();
  const [saved, setSaved] = useState(false);
  const text = [
    `Códigos de recuperación del panel de ${studio}`,
    'Cada código sirve UNA sola vez para entrar si no tienes el móvil a mano.',
    '',
    ...codes,
    '',
    `Creados el ${new Date().toLocaleDateString('es-ES')}`,
  ].join('\n');

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codigos-de-recuperacion.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=600,height=700');
    if (!w) return;
    w.document.title = 'Códigos de recuperación';
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'font: 16px/1.8 ui-monospace, Menlo, monospace; padding: 24px; white-space: pre-wrap';
    pre.textContent = text;
    w.document.body.appendChild(pre);
    w.focus();
    w.print();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Códigos copiados ✓ Pégalos en un sitio seguro (tu gestor de contraseñas, por ejemplo).');
    } catch {
      notify('No se han podido copiar: usa «Descargar» o «Imprimir».', 'error');
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="warning">
        Guárdalos <b>ahora</b>: es la única vez que se ven. Si pierdes el móvil, cada código te deja entrar una vez.
      </Alert>
      <Box
        component="ul"
        aria-label="Códigos de recuperación"
        sx={{
          listStyle: 'none', p: 2, m: 0, borderRadius: 2, bgcolor: 'var(--studio-bg)',
          display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1.2,
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '1.05rem', textAlign: 'center',
        }}
      >
        {codes.map((c) => <li key={c}>{c}</li>)}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={download}>Descargar (.txt)</Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={print}>Imprimir</Button>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy}>Copiar</Button>
      </Stack>
      <FormControlLabel
        control={<Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} />}
        label="Los he guardado en un sitio seguro"
      />
      <Box>
        <Button variant="contained" size="large" disabled={!saved} onClick={onDone}>Listo</Button>
      </Box>
    </Stack>
  );
}

/** Ventana que pide el código de la app (o la contraseña) para algo delicado. */
function ProveItDialog({ open, title, text, confirmText, danger, onClose, onSubmit }: {
  open: boolean; title: string; text: string; confirmText: string; danger?: boolean;
  onClose: () => void; onSubmit: (body: Body) => Promise<void>;
}) {
  const [usePassword, setUsePassword] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setValue(''); setError(''); setUsePassword(false); } }, [open]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit(usePassword ? { password: value } : { code: value });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2, color: 'text.secondary' }}>{text}</Typography>
        <TextField
          key={usePassword ? 'pw' : 'code'}
          autoFocus fullWidth
          label={usePassword ? 'Tu contraseña' : 'Código de 6 cifras de la app'}
          type={usePassword ? 'password' : 'text'}
          value={value}
          onChange={(e) => setValue(usePassword ? e.target.value : sixDigits(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter' && value) submit(); }}
          autoComplete={usePassword ? 'current-password' : 'one-time-code'}
          slotProps={{ htmlInput: usePassword ? {} : { inputMode: 'numeric', maxLength: 6 } }}
        />
        <Button size="small" sx={{ mt: 1, textTransform: 'none' }} onClick={() => { setUsePassword((v) => !v); setValue(''); }}>
          {usePassword ? 'Usar el código de la app' : 'No tengo el móvil: usar mi contraseña'}
        </Button>
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>No, volver</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} disabled={!value || busy} onClick={submit}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Seguridad: verificación en dos pasos (código del móvil al entrar) de la
 * persona que usa el panel y la norma del estudio para todo el equipo.
 */
export default function Security() {
  const notify = useNotify();
  const { updateUser } = useAuth();
  const { config } = useSite();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<'disable' | 'regenerate' | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<Status>('');
      setStatus(s);
      updateUser({ two_factor_setup_required: s.setup_required });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
    // updateUser cambia en cada render del proveedor: no hace falta como dependencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      setSetup(await api<SetupData>('setup/', {}));
      setCode('');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ recovery_codes: string[] }>('confirm/', { code });
      setCodes(r.recovery_codes);
      setSetup(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (body: Body) => {
    await api('disable/', body);
    setDialog(null);
    notify('Verificación en dos pasos desactivada. Ahora solo se pide la contraseña para entrar.', 'info');
    await load();
  };

  const regenerate = async (body: Body) => {
    const r = await api<{ recovery_codes: string[] }>('recovery-codes/', body);
    setDialog(null);
    setCodes(r.recovery_codes);
    await load();
  };

  const setPolicy = async (require: boolean) => {
    setPolicyBusy(true);
    try {
      await api('policy/', { require });
      notify(require
        ? 'Hecho ✓ A partir de ahora todo el equipo tendrá que activarla para usar el panel.'
        : 'Hecho ✓ Ya no es obligatoria para el equipo.');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setPolicyBusy(false);
    }
  };

  if (loadError) return <Alert severity="error">No se ha podido cargar la seguridad de tu cuenta. {loadError}</Alert>;
  if (!status) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box>;

  const since = status.confirmed_at ? new Date(status.confirmed_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const cardSx = { p: { xs: 2, sm: 4 }, mt: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' } as const;

  return (
    <Box>
      <PageIntro
        pageKey="security"
        title="Seguridad"
        subtitle="Un código del móvil además de la contraseña."
      />

      {status.setup_required && !codes && (
        <Alert severity="warning" sx={{ mt: 2, fontSize: '1rem' }}>
          Tu estudio exige la verificación en dos pasos. Actívala aquí para seguir usando el panel (son 2 minutos).
        </Alert>
      )}

      <Paper elevation={0} sx={cardSx}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <ShieldOutlinedIcon sx={{ color: 'var(--studio-primary)', fontSize: 32 }} />
          <Typography component="h2" sx={{ fontWeight: 600, fontSize: '1.25rem', color: 'var(--studio-dark)' }}>
            Verificación en dos pasos
          </Typography>
        </Stack>

        {codes ? (
          <RecoveryCodes codes={codes} studio={config.studio_name} onDone={() => {
            setCodes(null);
            notify('¡Listo! La próxima vez que entres te pediremos el código de tu móvil.');
          }} />
        ) : status.enabled ? (
          <Stack spacing={2.5}>
            <Alert severity="success">
              Está <b>activada</b>{since ? ` desde el ${since}` : ''}. Al entrar se te pide el código de tu app.
            </Alert>
            <Typography color={status.recovery_codes_left <= 3 ? 'error' : 'text.secondary'}>
              Te quedan <b>{status.recovery_codes_left}</b> códigos de recuperación.
              {status.recovery_codes_left <= 3 && ' Crea otros nuevos para no quedarte sin ninguno.'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="outlined" onClick={() => setDialog('regenerate')}>Crear códigos de recuperación nuevos</Button>
              <Button color="error" onClick={() => setDialog('disable')}>Desactivar</Button>
            </Stack>
          </Stack>
        ) : setup ? (
          <Box>
            <FormStep n={1} title="Instala una app de códigos en tu móvil"
              hint="Google Authenticator, Microsoft Authenticator, 1Password o Authy. Si ya tienes una, pasa al siguiente paso.">
              <span />
            </FormStep>
            <FormStep n={2} title="Escanea este código con la app"
              hint="En la app, pulsa «+» o «Añadir cuenta» y luego «Escanear código QR».">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'center', sm: 'flex-start' }}>
                <Box component="img" src={setup.qr_svg} alt="Código QR para tu app de verificación"
                  sx={{ width: 200, height: 200, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: '#fff' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem', mb: 1 }}>
                    ¿No puedes escanearlo? Elige «Introducir clave» en la app y escribe esta:
                  </Typography>
                  <Typography sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '1.1rem', fontWeight: 600, wordBreak: 'break-all', userSelect: 'all' }}>
                    {setup.secret}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mt: 1 }}>
                    Cuenta: {setup.account} · {setup.issuer}
                  </Typography>
                </Box>
              </Stack>
            </FormStep>
            <FormStep n={3} title="Escribe el código de 6 cifras que muestra la app">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
                <TextField
                  label="Código" value={code} onChange={(e) => setCode(sixDigits(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) confirm(); }}
                  autoComplete="one-time-code" placeholder="123456"
                  slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, style: { fontSize: '1.4rem', letterSpacing: '0.3em' } } }}
                  sx={{ maxWidth: 220 }}
                />
                <Button variant="contained" size="large" disabled={code.length !== 6 || busy} onClick={confirm}
                  sx={{ minHeight: 56 }} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
                  Activar
                </Button>
              </Stack>
              {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
            </FormStep>
            <Button onClick={() => setSetup(null)}>Cancelar</Button>
          </Box>
        ) : (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Ahora mismo solo se pide tu contraseña para entrar. Con la verificación en dos pasos, además, tendrás que
              escribir un código de tu móvil: si alguien averigua tu contraseña, no podrá entrar.
            </Typography>
            <Box>
              <Button variant="contained" size="large" onClick={start} disabled={busy}
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <ShieldOutlinedIcon />}>
                Activar la verificación en dos pasos
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>

      <Paper elevation={0} sx={cardSx}>
        <Typography component="h2" sx={{ fontWeight: 600, fontSize: '1.15rem', color: 'var(--studio-dark)', mb: 1 }}>
          Para todo el equipo
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Si la exiges, cada persona que entra en el panel tendrá que activarla antes de poder usarlo.
        </Typography>
        <FormControlLabel
          control={
            <Switch checked={status.required_by_studio} disabled={policyBusy || (!status.enabled && !status.required_by_studio)}
              onChange={(e) => setPolicy(e.target.checked)} />
          }
          label="Exigir la verificación en dos pasos a todo el equipo"
        />
        {!status.enabled && !status.required_by_studio && (
          <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mt: 0.5 }}>
            Primero actívala tú arriba.
          </Typography>
        )}
      </Paper>

      <ProveItDialog
        open={dialog === 'disable'}
        title="¿Desactivar la verificación en dos pasos?"
        text="Para entrar ya solo se pedirá la contraseña. Escribe el código de tu app para confirmarlo."
        confirmText="Sí, desactivar"
        danger
        onClose={() => setDialog(null)}
        onSubmit={disable}
      />
      <ProveItDialog
        open={dialog === 'regenerate'}
        title="¿Crear códigos de recuperación nuevos?"
        text="Los códigos anteriores dejarán de valer. Escribe el código de tu app para confirmarlo."
        confirmText="Sí, crear nuevos"
        onClose={() => setDialog(null)}
        onSubmit={regenerate}
      />
    </Box>
  );
}
