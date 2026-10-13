import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { saveSettings, type StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
}

/**
 * «Entrar con Google» en la web (opcional). Solo hace falta un Client ID de
 * Google Cloud, que es público: no hay claves secretas que guardar.
 */
export default function GoogleSection({ value, onSaved }: Props) {
  const [clientId, setClientId] = useState(value.google_client_id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const origin = (value.web_url || '').replace(/\/+$/, '');
  const valid = !clientId.trim() || /^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId.trim());

  const save = async (id: string) => {
    setSaving(true);
    setError('');
    try {
      onSaved(await saveSettings({ google_client_id: id }));
      setClientId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography color="text.secondary">
        Con esto tus clientas pueden registrarse y entrar en la web con su cuenta de Google en un toque, sin crear
        contraseña. Es opcional: sin ello entran con email y contraseña.
      </Typography>
      {value.google_client_id && (
        <Alert severity="success" action={<Button color="inherit" onClick={() => save('')}>Desactivar</Button>}>
          El acceso con Google está <b>activado</b>.
        </Alert>
      )}
      <Box component="ol" sx={{ pl: 3, m: 0, '& li': { mb: 1.4, lineHeight: 1.6 } }}>
        <li>
          Abre <Link href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud</Link>{' '}
          con tu cuenta de Google y crea un proyecto (ponle el nombre de tu estudio).
        </li>
        <li>
          Ve a <Link href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noopener">Pantalla de consentimiento</Link>,
          pulsa <b>Empezar</b>, escribe el nombre de tu estudio y tu email, elige <b>Externo</b> y termina. Después, en
          {' '}<b>Público</b>, pulsa <b>Publicar aplicación</b>.
        </li>
        <li>
          Ve a <Link href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noopener">Clientes → Crear cliente</Link>,
          tipo <b>Aplicación web</b>.
        </li>
        <li>
          En <b>Orígenes de JavaScript autorizados</b> añade la dirección de tu web
          {origin ? <>: <code>{origin}</code></> : ''} (y la de tu dominio propio si tienes). Pulsa <b>Crear</b>.
        </li>
        <li>Copia el <b>ID de cliente</b> (termina en <code>.apps.googleusercontent.com</code>) y pégalo aquí.</li>
      </Box>
      <TextField
        label="ID de cliente de Google" value={clientId} onChange={(e) => setClientId(e.target.value)} fullWidth
        placeholder="123456789-abc….apps.googleusercontent.com" error={!valid}
        helperText={valid ? 'No es una clave secreta: es seguro pegarlo aquí.' : 'Debe terminar en .apps.googleusercontent.com'}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Button variant="contained" size="large" disabled={!valid || saving || clientId.trim() === (value.google_client_id || '')}
          onClick={() => save(clientId.trim())}>
          Guardar
        </Button>
      </Box>
    </Stack>
  );
}
