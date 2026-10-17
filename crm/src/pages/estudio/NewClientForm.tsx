// «¿Primera vez? Dale de alta»: ficha de cliente en un momento, sin que tenga
// que crear una cuenta en la web (sin contraseña). Nombre obligatorio; móvil y
// email opcionales. Avisa si ya hay alguien con un nombre parecido.
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { isPlaceholderEmail } from '../../site/email';
import { clientName, studioApi, type ClientLite } from './api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function NewClientForm({ onCreated, onPickExisting, onCancel, submitLabel = 'Dar de alta y seguir', initialName = '' }: {
  onCreated: (u: ClientLite) => void;
  /** Si es una ficha que ya existe («Es esta ficha») */
  onPickExisting: (u: ClientLite) => void;
  onCancel?: () => void;
  submitLabel?: string;
  initialName?: string;
}) {
  const [first, setFirst] = useState(initialName);
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState<ClientLite[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const q = `${first} ${last}`.trim();
    if (q.length < 3) { setSimilar([]); return undefined; }
    timer.current = window.setTimeout(() => {
      studioApi.searchClients(first.trim()).then((l) => setSimilar(l.slice(0, 3))).catch(() => setSimilar([]));
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [first, last]);

  const digits = phone.replace(/\D/g, '');
  const nameError = touched && !first.trim() ? 'Escribe al menos su nombre.' : '';
  const phoneError = phone.trim() && (digits.length < 9 || digits.length > 15 || /[^\d\s+()-]/.test(phone))
    ? 'El móvil no parece completo: 9 números (y el prefijo si es de fuera).' : '';
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? 'Revisa el email (ej.: marta@gmail.com).' : '';

  const save = async () => {
    setTouched(true);
    if (!first.trim() || phoneError || emailError) return;
    setSaving(true);
    setError('');
    try {
      const u = await studioApi.signup({
        first_name: first.trim(), last_name: last.trim(), phone: phone.trim(), email: email.trim().toLowerCase(),
      });
      onCreated(u);
    } catch (e) {
      setError(`No se ha podido registrar. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); save(); }} data-tour="new-client-form">
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label="Nombre" value={first} onChange={(e) => setFirst(e.target.value)} onBlur={() => setTouched(true)}
            required autoFocus fullWidth error={Boolean(nameError)} helperText={nameError || 'Ej.: Álex'}
            slotProps={{ htmlInput: { maxLength: 150, autoComplete: 'off' } }} />
          <TextField label="Apellidos (opcional)" value={last} onChange={(e) => setLast(e.target.value)} fullWidth
            slotProps={{ htmlInput: { maxLength: 150, autoComplete: 'off' } }} />
        </Stack>
        {similar.length > 0 && (
          <Alert severity="warning" sx={{ fontSize: '0.92rem' }}>
            Ya hay {similar.length === 1 ? 'una ficha' : 'fichas'} con un nombre parecido. Si es la misma persona, no la registres dos veces.
            <Stack spacing={1} sx={{ mt: 1 }}>
              {similar.map((u) => (
                <Stack key={u.id} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Typography sx={{ fontSize: '0.92rem', minWidth: 0 }}>
                    <b>{clientName(u)}</b>{u.phone ? ` · ${u.phone}` : ''}{u.email && !isPlaceholderEmail(u.email) ? ` · ${u.email}` : ''}
                  </Typography>
                  <Button size="small" variant="outlined" onClick={() => onPickExisting(u)} sx={{ minHeight: 44, flex: 'none' }}>Es esta ficha</Button>
                </Stack>
              ))}
            </Stack>
          </Alert>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label="Móvil (opcional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth
            error={Boolean(phoneError)} helperText={phoneError || 'Para encontrar su ficha y escribirle.'}
            slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 40 } }} />
          <TextField label="Email (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth
            error={Boolean(emailError)} helperText={emailError || 'Si lo pones, le llega un código para confirmarlo.'}
            slotProps={{ htmlInput: { inputMode: 'email', maxLength: 254 } }} />
        </Stack>
        <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)' }}>
          No necesita contraseña ni crearse una cuenta: la ficha la llevas tú.
        </Typography>
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1.25}>
          {onCancel && <Button variant="outlined" onClick={onCancel} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>}
          <Button type="submit" variant="contained" disabled={saving} sx={{ minHeight: 48 }}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {saving ? 'Registrando…' : submitLabel}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
