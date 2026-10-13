import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useConfirm } from '../guide';
import { connectStripe, disconnectStripe, loadSettings, type StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
}

/**
 * Cobro online con Stripe (opcional). Sin Stripe, las clientas compran los
 * bonos en el estudio y tú se los añades desde «Créditos». Con Stripe basta
 * pegar dos claves: el aviso automático de pagos (webhook) se crea solo.
 */
export default function PaymentsSection({ value, onSaved }: Props) {
  const confirm = useConfirm();
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState('');

  const isHttps = value.api_url?.startsWith('https://');
  const ready = /^pk_(live|test)_/.test(pk.trim()) && /^(sk|rk)_(live|test)_/.test(sk.trim());

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await connectStripe(sk.trim(), pk.trim());
      setConnected(r.account_name);
      setSk('');
      setPk('');
      onSaved(await loadSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: '¿Desconectar Stripe?',
      message: 'La web dejará de ofrecer el pago con tarjeta. Las reservas con créditos siguen funcionando y no se pierde ningún pago ya hecho.',
      confirmText: 'Sí, desconectar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await disconnectStripe();
      onSaved(await loadSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box sx={{ flex: 1, p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <StorefrontOutlinedIcon color="primary" />
            <Typography fontWeight={700}>Sin pagos online</Typography>
          </Stack>
          <Typography color="text.secondary">
            Tus clientas compran los bonos en el estudio (efectivo, Bizum, datáfono…) y tú les añades los créditos
            desde <b>Créditos</b>. Ellas reservan en la web con esos créditos.
          </Typography>
        </Box>
        <Box sx={{ flex: 1, p: 2.5, borderRadius: 3, border: '1px solid', borderColor: value.has_stripe ? 'success.main' : 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <CreditCardIcon color="primary" />
            <Typography fontWeight={700}>Con Stripe</Typography>
          </Stack>
          <Typography color="text.secondary">
            Pagan con tarjeta, Apple Pay o Google Pay al reservar o comprar bonos y membresías. Los créditos se
            añaden solos. Stripe cobra una pequeña comisión por pago (sin cuota mensual).
          </Typography>
        </Box>
      </Stack>

      {value.has_stripe ? (
        <Alert severity="success" action={<Button color="inherit" onClick={disconnect}>Desconectar</Button>}>
          {connected ? <>Stripe conectado: <b>{connected}</b>. </> : <>Stripe está <b>conectado</b>. </>}
          {value.stripe_mode === 'test'
            ? 'Estás en MODO PRUEBA: los pagos no son reales. Cuando quieras cobrar de verdad, conecta las claves «live».'
            : 'Los pagos con tarjeta ya están activos en tu web.'}
        </Alert>
      ) : !isHttps ? (
        <Alert severity="info">
          Stripe se conecta cuando el panel ya está publicado en internet (con https). En tu ordenador no se puede.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <Box component="ol" sx={{ pl: 3, m: 0, '& li': { mb: 1.2, lineHeight: 1.6 } }}>
            <li>
              Crea tu cuenta gratis en{' '}
              <Link href="https://dashboard.stripe.com/register" target="_blank" rel="noopener">stripe.com</Link>{' '}
              y completa los datos de tu negocio y tu cuenta bancaria.
            </li>
            <li>
              Abre{' '}
              <Link href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">
                Desarrolladores → Claves de API
              </Link>.
            </li>
            <li>Copia la <b>clave publicable</b> (empieza por <code>pk_</code>) y la <b>clave secreta</b> (<code>sk_</code>, pulsa «Revelar»).</li>
          </Box>
          <TextField label="Clave publicable (pk_…)" value={pk} onChange={(e) => setPk(e.target.value)} fullWidth autoComplete="off" />
          <TextField label="Clave secreta (sk_…)" type="password" value={sk} onChange={(e) => setSk(e.target.value)}
            fullWidth autoComplete="new-password"
            helperText="Se guarda cifrada y nunca se vuelve a mostrar. Para probar sin cobrar, usa las claves de modo prueba (pk_test / sk_test)." />
          {error && <Alert severity="error">{error}</Alert>}
          <Box>
            <Button variant="contained" size="large" onClick={connect} disabled={!ready || busy}
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <CreditCardIcon />}>
              {busy ? 'Conectando con Stripe…' : 'Conectar Stripe'}
            </Button>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
