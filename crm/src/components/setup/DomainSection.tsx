import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, Link, Paper, Stack, TextField, Typography,
} from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import { checkDomain, saveSettings, type StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
}

const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

/**
 * Dominio propio (www.tuestudio.com) para la web y, si se quiere, para el
 * panel. Paso a paso, con comprobación antes de guardar: un dominio mal
 * configurado dejaría los enlaces de los emails rotos.
 */
export default function DomainSection({ value, onSaved }: Props) {
  return (
    <Stack spacing={4}>
      <Typography color="text.secondary">
        Tu estudio funciona ya con las direcciones que da el servidor. Si tienes (o compras) un dominio propio, puedes
        usarlo para que tu web sea, por ejemplo, <b>www.tuestudio.com</b>. Es opcional y lo puedes hacer cuando quieras.
      </Typography>

      <DomainCard
        kind="web"
        icon={<LanguageIcon color="primary" />}
        title="Tu web (la que ven tus clientas)"
        service="web"
        example="www.tuestudio.com"
        current={value.web_domain}
        fallback={host(value.default_web_url || value.web_url)}
        onSave={async (d) => onSaved(await saveSettings({ web_domain: d }))}
        googleWarning={Boolean(value.google_client_id)}
      />
      <Divider />
      <DomainCard
        kind="panel"
        icon={<DashboardOutlinedIcon color="primary" />}
        title="Tu panel (este, solo para ti)"
        service="api"
        example="panel.tuestudio.com"
        current={value.panel_domain}
        fallback={host(value.default_api_url || value.api_url)}
        onSave={async (d) => onSaved(await saveSettings({ panel_domain: d }))}
        stripeNote={value.has_stripe}
      />

      <Alert severity="info">
        <b>¿Y el dominio sin «www» (tuestudio.com)?</b> En tu proveedor de dominio, crea una <b>redirección</b> de
        tuestudio.com a https://www.tuestudio.com (casi todos tienen esa opción en «Redirecciones» o «Reenvío web»).
      </Alert>
    </Stack>
  );
}

interface CardProps {
  kind: 'web' | 'panel';
  icon: React.ReactNode;
  title: string;
  service: string;
  example: string;
  current: string;
  fallback: string;
  onSave: (domain: string) => Promise<void>;
  googleWarning?: boolean;
  stripeNote?: boolean;
}

function DomainCard({ kind, icon, title, service, example, current, fallback, onSave, googleWarning, stripeNote }: CardProps) {
  const [domain, setDomain] = useState(current);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; domain?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const check = async () => {
    setChecking(true);
    setResult(null);
    setSavedMsg('');
    try {
      setResult(await checkDomain(domain, kind));
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  };

  const save = async (d: string) => {
    setSaving(true);
    try {
      await onSave(d);
      setSavedMsg(d ? `Guardado: a partir de ahora se usa ${d}.` : 'Vuelves a usar la dirección del servidor.');
      setResult(null);
      if (!d) setDomain('');
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        {icon}
        <Typography variant="h6">{title}</Typography>
      </Stack>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">Dirección actual</Typography>
        <Typography fontWeight={700} sx={{ wordBreak: 'break-all' }}>
          <Link href={`https://${current || fallback}`} target="_blank" rel="noopener">{current || fallback}</Link>
        </Typography>
        {current && (
          <Button size="small" sx={{ mt: 1 }} onClick={() => save('')} disabled={saving}>
            Volver a la dirección del servidor ({fallback})
          </Button>
        )}
      </Paper>

      <Box component="ol" sx={{ pl: 3, m: 0, '& li': { mb: 1.4, lineHeight: 1.6 } }}>
        <li>
          Entra en <Link href="https://railway.com/dashboard" target="_blank" rel="noopener">Railway</Link>, abre tu
          proyecto y pulsa el servicio <b>{service}</b> → <b>Settings</b> → <b>Networking</b> → <b>Custom Domain</b>.
        </li>
        <li>Escribe tu dominio (por ejemplo <code>{example}</code>) y pulsa <b>Add</b>. Railway te enseña un registro <b>CNAME</b> (y a veces otro <b>TXT</b>).</li>
        <li>
          En la web donde compraste el dominio (IONOS, DonDominio, GoDaddy, Namecheap, Cloudflare…), busca
          <b> DNS</b> o <b>Zona DNS</b> y crea esos registros copiando exactamente el nombre y el valor.
          {' '}Si usas Cloudflare, pon la nube en <b>gris</b> («Solo DNS»).
        </li>
        <li>Espera: suele tardar unos minutos (a veces unas horas). Después escribe el dominio aquí y pulsa <b>Comprobar</b>.</li>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
        <TextField
          label="Tu dominio" value={domain} placeholder={example} fullWidth
          onChange={(e) => { setDomain(e.target.value); setResult(null); }}
          helperText="Solo el dominio, sin https://"
        />
        <Button variant="outlined" size="large" onClick={check} disabled={!domain.trim() || checking}
          startIcon={checking ? <CircularProgress size={18} /> : undefined} sx={{ minWidth: 150, height: 56 }}>
          {checking ? 'Comprobando…' : 'Comprobar'}
        </Button>
      </Stack>

      {result && !result.ok && <Alert severity="warning">{result.error}</Alert>}
      {result?.ok && (
        <Alert severity="success" action={
          <Button color="inherit" variant="outlined" onClick={() => save(result.domain || domain)} disabled={saving}>Usar este dominio</Button>
        }>
          ¡<b>{result.domain}</b> ya funciona!
        </Alert>
      )}
      {savedMsg && (
        <Alert severity="success">
          {savedMsg}
          {kind === 'web' && googleWarning && ' Si usas el acceso con Google, añade también https://' + (domain || '') + ' en «Orígenes de JavaScript autorizados» de Google Cloud.'}
          {kind === 'panel' && stripeNote && ' El aviso automático de pagos de Stripe ya apunta al dominio nuevo.'}
          {kind === 'panel' && ' Entra al panel desde la dirección nueva (tendrás que iniciar sesión otra vez).'}
        </Alert>
      )}
    </Stack>
  );
}
