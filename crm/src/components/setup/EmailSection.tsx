import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Link, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { saveSettings, sendTestEmail, type StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
}

type Mode = 'gmail' | 'other';

const PROVIDERS = [
  { id: 'resend', label: 'Resend', host: 'smtp.resend.com', port: 587, user: 'resend', help: 'Usuario: resend · Contraseña: tu API key (re_…). El remitente debe ser de tu dominio verificado en Resend.' },
  { id: 'brevo', label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, user: '', help: 'Usuario y clave SMTP: Brevo → SMTP y API → SMTP.' },
  { id: 'zoho', label: 'Zoho Mail', host: 'smtp.zoho.eu', port: 587, user: '', help: 'Usuario: tu email de Zoho · Contraseña: una contraseña específica de aplicación.' },
  { id: 'custom', label: 'Otro', host: '', port: 587, user: '', help: 'Los datos SMTP te los da tu proveedor de email o de hosting.' },
];

/**
 * Emails a los clientes (confirmaciones, avisos, recordatorios) desde la
 * cuenta del propio estudio. Primero se prueba y, si llega, se activa.
 */
export default function EmailSection({ value, onSaved }: Props) {
  const gmailNow = value.smtp_host === 'smtp.gmail.com';
  const [mode, setMode] = useState<Mode>(value.smtp_host && !gmailNow ? 'other' : 'gmail');
  const [gmail, setGmail] = useState(gmailNow ? value.smtp_user : '');
  const [provider, setProvider] = useState(
    PROVIDERS.find((p) => p.host === value.smtp_host)?.id || (value.smtp_host && !gmailNow ? 'custom' : 'resend'),
  );
  const [host, setHost] = useState(gmailNow ? '' : value.smtp_host);
  const [port, setPort] = useState(String(value.smtp_port || 587));
  const [user, setUser] = useState(gmailNow ? '' : value.smtp_user);
  const [fromAddress, setFromAddress] = useState(value.email_from_address);
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testedOk, setTestedOk] = useState(false);

  const smtp = () => mode === 'gmail'
    ? { smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: gmail.trim(), smtp_use_tls: true, smtp_use_ssl: false, email_from_address: gmail.trim() }
    : {
      smtp_host: host.trim(), smtp_port: Number(port) || 587, smtp_user: user.trim(),
      smtp_use_ssl: Number(port) === 465, smtp_use_tls: Number(port) !== 465,
      email_from_address: (fromAddress || user).trim(),
    };

  const canTest = mode === 'gmail'
    ? /\S+@\S+\.\S+/.test(gmail) && (password.replace(/\s/g, '').length >= 16 || value.has_smtp_password)
    : Boolean(host.trim() && user.trim() && (password || value.has_smtp_password));

  const test = async () => {
    setTesting(true);
    setError('');
    setTestedOk(false);
    try {
      await sendTestEmail({ ...smtp(), smtp_password: password.replace(mode === 'gmail' ? /\s/g : /^$/, '') || undefined });
      setTestedOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const activate = async () => {
    try {
      const saved = await saveSettings({
        ...smtp(),
        ...(password ? { smtp_password: mode === 'gmail' ? password.replace(/\s/g, '') : password } : {}),
        email_enabled: true,
      });
      setPassword('');
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deactivate = async () => {
    try {
      onSaved(await saveSettings({ email_enabled: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const prov = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <Stack spacing={3}>
      <Typography color="text.secondary">
        Con los emails activados, tus clientes reciben la confirmación de cada reserva, los avisos si cambia o se
        cancela una clase y los recordatorios. <b>Sin activarlos todo funciona igual</b>: las reservas, el panel
        y los avisos al móvil de quien tenga la app.
      </Typography>

      {value.email_ready && (
        <Alert severity="success" icon={<MarkEmailReadOutlinedIcon />}
          action={<Button color="inherit" onClick={deactivate}>Desactivar</Button>}>
          Los emails están <b>activados</b> y salen desde <b>{value.email_from_address || value.smtp_user}</b>.
          Puedes cambiar la cuenta abajo.
        </Alert>
      )}

      <ToggleButtonGroup
        exclusive value={mode} onChange={(_, m) => m && (setMode(m), setTestedOk(false), setError(''))}
        color="primary" fullWidth
      >
        <ToggleButton value="gmail" sx={{ py: 1.5 }}>Con mi Gmail</ToggleButton>
        <ToggleButton value="other" sx={{ py: 1.5 }}>Con otro proveedor</ToggleButton>
      </ToggleButtonGroup>

      {mode === 'gmail' ? (
        <Stack spacing={2}>
          <Box component="ol" sx={{ pl: 3, m: 0, '& li': { mb: 1.2, lineHeight: 1.6 } }}>
            <li>
              En tu cuenta de Google, activa la{' '}
              <Link href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noopener">
                verificación en dos pasos
              </Link>{' '}(si ya la tienes, salta este paso).
            </li>
            <li>
              Abre{' '}
              <Link href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">
                Contraseñas de aplicaciones
              </Link>, escribe un nombre (por ejemplo «Mi estudio») y pulsa <b>Crear</b>.
            </li>
            <li>Google te enseña una clave de <b>16 letras</b>. Cópiala y pégala aquí abajo.</li>
          </Box>
          <TextField label="Tu dirección de Gmail" type="email" value={gmail} onChange={(e) => setGmail(e.target.value)}
            placeholder="tuestudio@gmail.com" fullWidth />
          <TextField
            label="Contraseña de aplicación (16 letras)" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={value.has_smtp_password && gmailNow ? '•••• •••• •••• (ya guardada)' : 'abcd efgh ijkl mnop'}
            fullWidth autoComplete="off"
            helperText="No es tu contraseña normal de Gmail. Gmail permite unos 500 emails al día: de sobra para un estudio."
          />
        </Stack>
      ) : (
        <Stack spacing={2}>
          <TextField select label="Proveedor" value={provider} fullWidth
            onChange={(e) => {
              const p = PROVIDERS.find((x) => x.id === e.target.value)!;
              setProvider(p.id);
              if (p.host) setHost(p.host);
              setPort(String(p.port));
              if (p.user) setUser(p.user);
            }}>
            {PROVIDERS.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
          </TextField>
          <Alert severity="info">{prov.help}</Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Servidor SMTP" value={host} onChange={(e) => setHost(e.target.value)} fullWidth />
            <TextField label="Puerto" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              sx={{ maxWidth: { sm: 140 } }} helperText="587 o 465" />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Usuario" value={user} onChange={(e) => setUser(e.target.value)} fullWidth autoComplete="off" />
            <TextField label="Contraseña / clave" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={value.has_smtp_password && !gmailNow ? '(ya guardada)' : ''} fullWidth autoComplete="new-password" />
          </Stack>
          <TextField label="Enviar como (dirección)" type="email" value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)} placeholder="hola@tuestudio.com" fullWidth
            helperText="La dirección que verán tus clientes. Vacío = el usuario." />
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {testedOk && (
        <Alert severity="success">
          ¡Email de prueba enviado! Mira tu bandeja de entrada (y la carpeta de spam). Si te ha llegado, pulsa <b>Activar emails</b>.
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button variant="outlined" size="large" onClick={test} disabled={!canTest || testing}
          startIcon={testing ? <CircularProgress size={18} /> : undefined}>
          {testing ? 'Enviando…' : 'Enviarme un email de prueba'}
        </Button>
        <Button variant="contained" size="large" onClick={activate} disabled={!testedOk}>
          Activar emails
        </Button>
      </Stack>
    </Stack>
  );
}
