import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, CircularProgress, Stack, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeysPaymentsForm from './KeysPaymentsForm';
import ConnectGuide from './payments/ConnectGuide';
import { NoOnlinePath, StripeFaq, StripeIntro } from './payments/StripeIntro';
import { loadPaymentsStatus, type ConnectReturnTo, type PaymentsStatus, type StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
  /** Pantalla a la que se vuelve desde Stripe («Conectar pagos») */
  returnTo?: ConnectReturnTo;
}

/**
 * «Pagos online» (Ajustes → Cobros), de la mano y con «Conectar pagos»
 * (Stripe Connect) como único camino: qué es Stripe, cuánto cuesta y qué
 * necesitas; los pasos 1 Prepara tus datos → 2 Conecta con Stripe → 3 Stripe
 * lo revisa → 4 ¡Listo!; el camino sin pagos online y las preguntas
 * frecuentes. Nada de copiar claves.
 *
 * Plan B solo para instalaciones propias SIN Connect: «Avanzado» plegado con
 * el formulario de claves de siempre (si STRIPE_KEYS_FALLBACK_ENABLED lo
 * permite). Un estudio que ya cobraba con claves las ve para poder
 * desconectarlas.
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
      setStatus(null); // API antiguo sin «Conectar pagos»: solo claves
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Enlaces a …#pagos-online («Activar pagos online» desde la guía o «Formas de cobro»)
  const { hash } = useLocation();
  useEffect(() => {
    if (!loaded || hash !== '#pagos-online') return;
    document.getElementById('pagos-online')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded, hash]);

  if (!loaded) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 160 }}><CircularProgress aria-label="Cargando los pagos online" /></Box>;
  }

  const connect = Boolean(status && (status.connect_available || status.account_id));
  const country = status?.account_country || status?.default_country || value.country || '';
  const hasKeys = status ? status.has_keys : value.has_stripe;
  const keysAllowed = status ? status.keys_fallback !== false : true;
  const charging = connect ? status?.state === 'active' : hasKeys;

  const currencyText = (
    <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-muted)' }}>
      Cobras en <b>{currencyName ? `${currencyName} (${currency})` : currency}</b>: todos los pagos con tarjeta van en
      esta moneda. Se cambia en <b>Mi estudio → País y moneda</b>.
    </Typography>
  );

  const heading = (
    <Typography component="h2" sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--studio-muted)', mb: -1.5 }}>
      Pagos online
    </Typography>
  );

  // ── Sin Connect en esta instalación: aviso corto y, si se permite, las claves plegadas
  if (!connect || !status) {
    return (
      <Stack spacing={3} id="pagos-online" data-testid="payments-online" sx={{ scrollMarginTop: 80 }}>
        {heading}
        {hasKeys ? (
          <Box sx={boxSx}>
            <Typography fontWeight={700} sx={{ mb: 1.5 }}>Cobras con tus claves de Stripe</Typography>
            <KeysPaymentsForm value={value} onSaved={onSaved} connected onChanged={refreshStatus} />
          </Box>
        ) : (
          <Box data-testid="connect-unavailable" sx={boxSx}>
            <Typography fontWeight={700}>«Conectar pagos» no está activado en esta instalación</Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5 }}>
              Con él, Stripe te guía para abrir tu cuenta y cobrar con tarjeta en unos 10 minutos. Pídeselo a quien
              instaló tu panel (guía: <code>docs/STRIPE_CONNECT.md</code>).
            </Typography>
          </Box>
        )}
        {!hasKeys && keysAllowed && (
          <Accordion disableGutters elevation={0} sx={foldSx} data-testid="keys-fallback">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>Avanzado (instalación propia sin Connect)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)' }}>
                  Si gestionas tu propia instalación y ya tienes cuenta de Stripe, puedes conectar sus claves. El aviso de
                  pagos (webhook) se crea solo.
                </Typography>
                <KeysPaymentsForm value={value} onSaved={onSaved} connected={false} onChanged={refreshStatus} />
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}
        {currencyText}
        {!charging && <NoOnlinePath />}
      </Stack>
    );
  }

  // ── Con «Conectar pagos»: el único camino visible
  return (
    <Stack spacing={3} id="pagos-online" data-testid="payments-online" sx={{ scrollMarginTop: 80 }}>
      {heading}
      {charging ? (
        // Ya cobrando: primero el estado y lo que toca; la explicación, plegada
        <Accordion disableGutters elevation={0} sx={foldSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={700}>¿Qué es Stripe y cuánto cuesta?</Typography>
          </AccordionSummary>
          <AccordionDetails><StripeIntro country={country} /></AccordionDetails>
        </Accordion>
      ) : <StripeIntro country={country} />}
      <ConnectGuide status={status} setStatus={setStatus} value={value} onSaved={onSaved} returnTo={returnTo} />
      {currencyText}
      {!charging && <NoOnlinePath />}
      <StripeFaq country={country} />
      {hasKeys && (
        // Estudio que ya cobraba con claves: solo para verlas y desconectarlas
        <Accordion disableGutters elevation={0} sx={foldSx} data-testid="old-keys">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Tus claves de Stripe de antes</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)' }}>
                Mientras estén conectadas, tu web cobra con ellas. No las desconectes si aún tienes membresías que se
                renuevan en esa cuenta.
              </Typography>
              <KeysPaymentsForm value={value} onSaved={onSaved} connected onChanged={refreshStatus} />
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}

const boxSx = {
  p: { xs: 2, sm: 2.5 }, borderRadius: 'var(--studio-radius-lg)', border: '1px solid var(--studio-border-color)', background: 'var(--studio-surf)',
} as const;

const foldSx = {
  border: '1px solid var(--studio-border-color)', borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-surf)',
  '&:before': { display: 'none' }, overflow: 'hidden',
} as const;
