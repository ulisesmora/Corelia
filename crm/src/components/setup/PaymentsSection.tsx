import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useConfirm } from '../guide';
import KeysPaymentsForm from './KeysPaymentsForm';
import {
  disconnectConnect, loadPaymentsStatus, loadSettings, startConnect, syncConnect,
  type ConnectReturnTo, type PaymentsStatus, type StudioSettings,
} from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
  /** Pantalla a la que se vuelve desde Stripe («Conectar pagos») */
  returnTo?: ConnectReturnTo;
}

/**
 * Cobro online (opcional). Sin Stripe, las clientas compran los bonos en el
 * estudio y tú se los añades desde «Créditos».
 *
 * Si la instalación ofrece «Conectar pagos» (Stripe Connect), es la opción
 * principal: un botón, Stripe le abre su propia cuenta y el dinero va a su
 * banco. Las claves de siempre quedan en «Avanzado». Si no lo ofrece, la
 * pantalla es la de siempre (solo claves).
 */
export default function PaymentsSection({ value, onSaved, returnTo = 'settings' }: Props) {
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const currency = (value.currency || 'EUR').toUpperCase();
  const currencyName = value.locale_options?.currencies.find((c) => c.code === currency)?.name;

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await loadPaymentsStatus());
    } catch {
      setStatus(null); // sin «Conectar pagos» en el API: la pantalla de siempre
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const currencyText = (
    <Typography color="text.secondary">
      Cobras en <b>{currencyName ? `${currencyName} (${currency})` : currency}</b>: todos los pagos con tarjeta van en
      esta moneda. Se cambia en <b>Mi estudio → País y moneda</b>.
    </Typography>
  );

  if (!loaded) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 160 }}><CircularProgress /></Box>;
  }

  if (!status || !(status.connect_available || status.account_id)) {
    // Instalación sin «Conectar pagos»: exactamente lo de siempre
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
        {currencyText}
        <KeysPaymentsForm value={value} onSaved={onSaved} connected={value.has_stripe} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <ConnectCard status={status} setStatus={setStatus} value={value} onSaved={onSaved} returnTo={returnTo} />
      {currencyText}
      <Accordion disableGutters defaultExpanded={status.has_keys && status.state === 'none'}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Avanzado: usar mis propias claves de Stripe</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Para quien ya tiene su cuenta de Stripe y prefiere conectarla con sus claves de API. Si conectas claves,
              la web cobra con ellas.
            </Typography>
            <KeysPaymentsForm value={value} onSaved={onSaved} connected={status.has_keys} onChanged={refreshStatus} />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}

interface CardProps {
  status: PaymentsStatus;
  setStatus: (s: PaymentsStatus) => void;
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
  returnTo: ConnectReturnTo;
}

type Busy = '' | 'start' | 'sync' | 'disconnect';

/** Tarjeta «Conectar pagos»: qué hacer según el estado de la cuenta en Stripe. */
function ConnectCard({ status, setStatus, value, onSaved, returnTo }: CardProps) {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [country, setCountry] = useState(status.default_country || status.countries[0]?.code || '');
  const handled = useRef(false);
  const currency = (value.currency || 'EUR').toUpperCase();

  const after = useCallback(async (s: PaymentsStatus) => {
    setStatus(s);
    onSaved(await loadSettings());
  }, [setStatus, onSaved]);

  const goToStripe = useCallback(async (withCountry?: string) => {
    setBusy('start');
    setError('');
    try {
      const r = await startConnect({ country: withCountry, return_to: returnTo });
      if (r.url) {
        window.location.assign(r.url);
        return; // nos vamos a Stripe
      }
      await after(r.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy('');
  }, [after, returnTo]);

  const check = useCallback(async () => {
    setBusy('sync');
    setError('');
    try {
      await after(await syncConnect());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }, [after]);

  // Vuelta desde Stripe: ?stripe=return → comprobar; ?stripe=refresh (el
  // enlace caducó o ya se usó) → pedir uno nuevo. Luego se quita el parámetro.
  useEffect(() => {
    const back = params.get('stripe');
    if (!back || handled.current) return;
    handled.current = true;
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('stripe');
      return p;
    }, { replace: true });
    if (back === 'refresh') goToStripe();
    else check();
  }, [params, setParams, goToStripe, check]);

  const connect = async () => {
    const name = status.countries.find((c) => c.code === country)?.name || country;
    const ok = await confirm({
      title: `¿Abrir tu cuenta de Stripe en ${name}?`,
      message: (
        <>
          Stripe te pedirá los datos de tu negocio y la cuenta del banco donde quieres recibir el dinero.{' '}
          <b>El país no se puede cambiar después</b>: elige donde está registrado tu negocio.
        </>
      ),
      confirmText: 'Sí, ir a Stripe',
    });
    if (ok) goToStripe(country);
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: '¿Desconectar tu cuenta de Stripe?',
      message: 'La web dejará de ofrecer el pago con tarjeta. Tu cuenta de Stripe sigue siendo tuya, con tu dinero y tus pagos; si vuelves a conectar, se usa la misma.',
      confirmText: 'Sí, desconectar',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('disconnect');
    setError('');
    try {
      await after(await disconnectConnect());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const spinner = (what: Busy) => (busy === what ? <CircularProgress size={18} color="inherit" /> : undefined);
  const stripeCurrency = (status.default_currency || '').toUpperCase();
  const state = status.state;

  return (
    <Box sx={{
      p: { xs: 2, sm: 3 }, borderRadius: 3, border: '2px solid',
      borderColor: state === 'active' ? 'success.main' : 'primary.main',
    }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <AccountBalanceOutlinedIcon color="primary" />
        <Typography fontWeight={700} fontSize="1.1rem">Conectar pagos</Typography>
        {state === 'active' && !status.live && <Chip size="small" color="warning" label="Modo prueba" />}
      </Stack>

      {state === 'none' && (
        <Stack spacing={2}>
          <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 0.75, lineHeight: 1.55 } }}>
            <li>Tus clientas pagan con tarjeta, Apple Pay o Google Pay y <b>el dinero va directo a tu banco</b>.</li>
            <li><b>Corelia no se queda nada</b> (0 %). Solo pagas la comisión de Stripe por cada pago, sin cuota mensual.</li>
            <li>Tienes <b>tu propio panel de Stripe</b> para ver pagos, devoluciones y transferencias.</li>
            <li>Stripe te pide los datos de tu negocio y de tu banco una sola vez (unos 10 minutos).</li>
          </Box>
          <TextField select label="País de tu negocio" value={country} onChange={(e) => setCountry(e.target.value)}
            sx={{ maxWidth: 360 }} helperText="Donde está registrado tu negocio. No se puede cambiar después.">
            {status.countries.map((c) => <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>)}
          </TextField>
          <Box>
            <Button variant="contained" size="large" onClick={connect} disabled={!country || !!busy}
              startIcon={spinner('start') || <CreditCardIcon />}>
              Conectar pagos
            </Button>
          </Box>
        </Stack>
      )}

      {state === 'onboarding' && (
        <Stack spacing={2} alignItems="flex-start">
          <Typography>
            Tu cuenta de Stripe ya está creada. Falta que termines de poner los datos de tu negocio y de tu banco en Stripe.
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="contained" size="large" onClick={() => goToStripe()} disabled={!!busy} startIcon={spinner('start')}>
              Continuar en Stripe
            </Button>
            <Button onClick={check} disabled={!!busy} startIcon={spinner('sync')}>Comprobar</Button>
          </Stack>
        </Stack>
      )}

      {state === 'pending' && (
        <Stack spacing={2} alignItems="flex-start">
          <Typography>
            Stripe está revisando tus datos. Suele tardar unos minutos (a veces uno o dos días). En cuanto puedas cobrar,
            lo verás aquí.
          </Typography>
          <Button variant="outlined" onClick={check} disabled={!!busy} startIcon={spinner('sync')}>Comprobar</Button>
        </Stack>
      )}

      {state === 'restricted' && (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="warning" sx={{ width: '100%' }}>
            Stripe necesita algunos datos más para que puedas cobrar (o para seguir enviándote el dinero).
          </Alert>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="contained" size="large" onClick={() => goToStripe()} disabled={!!busy} startIcon={spinner('start')}>
              Completar datos en Stripe
            </Button>
            <Button onClick={check} disabled={!!busy} startIcon={spinner('sync')}>Comprobar</Button>
          </Stack>
        </Stack>
      )}

      {state === 'active' && (
        <Stack spacing={2}>
          <Alert severity="success">
            {status.display_name ? <>Pagos conectados: <b>{status.display_name}</b>. </> : <>Pagos <b>conectados</b>. </>}
            {status.provider !== 'connect'
              ? 'Ahora tu web cobra con tus propias claves (Avanzado). Desconéctalas para cobrar con esta cuenta.'
              : !status.live
                ? 'Estás en MODO PRUEBA: los pagos no son reales.'
                : 'Los pagos con tarjeta ya están activos en tu web y el dinero llega a tu banco.'}
          </Alert>
          {stripeCurrency && stripeCurrency !== currency && (
            <Alert severity="warning">
              Tu cuenta de Stripe recibe el dinero en <b>{stripeCurrency}</b> y tu estudio cobra en <b>{currency}</b>.
              Funciona, pero Stripe convertirá cada pago y cobra una comisión por el cambio.
            </Alert>
          )}
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" href={status.dashboard_url} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>
              Abrir mi Stripe
            </Button>
            <Button color="error" onClick={disconnect} disabled={!!busy} startIcon={spinner('disconnect')}>
              Desconectar
            </Button>
          </Stack>
        </Stack>
      )}

      {state === 'mismatch' && (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="warning" sx={{ width: '100%' }}>
            Tu cuenta conectada es de otro modo de Stripe (de prueba o real) del que usa ahora esta instalación, así que
            no se puede cobrar con ella. Desconéctala y vuelve a pulsar «Conectar pagos».
          </Alert>
          <Button color="error" variant="outlined" onClick={disconnect} disabled={!!busy} startIcon={spinner('disconnect')}>
            Desconectar
          </Button>
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Box>
  );
}
