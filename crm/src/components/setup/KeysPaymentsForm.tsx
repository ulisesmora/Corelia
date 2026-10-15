import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Link, Stack, TextField } from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { useConfirm } from '../guide';
import { connectStripe, disconnectStripe, loadSettings, type StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
  /** Las claves del panel están conectadas */
  connected: boolean;
  /** Tras conectar o desconectar las claves (para volver a leer el estado de los pagos) */
  onChanged?: () => void;
}

/**
 * Cobro con las claves de Stripe del propio estudio: basta pegar dos claves
 * y el aviso automático de pagos (webhook) se crea solo. Es lo de siempre;
 * con «Conectar pagos» disponible queda en «Avanzado».
 */
export default function KeysPaymentsForm({ value, onSaved, connected: hasKeys, onChanged }: Props) {
  const confirm = useConfirm();
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState('');
  // Moneda en la que Stripe le paga al estudio, si no coincide con la del estudio
  const [stripeCurrency, setStripeCurrency] = useState('');
  const currency = (value.currency || 'EUR').toUpperCase();

  const isHttps = value.api_url?.startsWith('https://');
  const ready = /^pk_(live|test)_/.test(pk.trim()) && /^(sk|rk)_(live|test)_/.test(sk.trim());

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await connectStripe(sk.trim(), pk.trim());
      setConnected(r.account_name);
      const sc = (r.stripe_currency || '').toUpperCase();
      setStripeCurrency(sc && sc !== currency ? sc : '');
      setSk('');
      setPk('');
      onSaved(await loadSettings());
      onChanged?.();
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
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Stack spacing={3}>
      {stripeCurrency && (
        <Alert severity="warning">
          Tu cuenta de Stripe recibe el dinero en <b>{stripeCurrency}</b> y tu estudio cobra en <b>{currency}</b>.
          Funciona, pero Stripe convertirá cada pago y cobra una comisión por el cambio. Si tu estudio cobra en{' '}
          {stripeCurrency}, cámbialo en Mi estudio → País y moneda.
        </Alert>
      )}

      {hasKeys ? (
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
      {hasKeys && error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
