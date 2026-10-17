// «Conectar pagos» de la mano (Stripe Connect; api/api/views_payments.py):
// 1 Prepara tus datos → 2 Conecta con Stripe → 3 Stripe lo revisa → 4 ¡Listo!
// El paso sale del estado de la cuenta (payments_status().state) y, mientras
// Stripe revisa, se vuelve a mirar solo cada poco.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import StudioIcon from '../../../site/StudioIcon';
import { useConfirm } from '../../guide';
import {
  disconnectConnect, loadPaymentsStatus, loadSettings, startConnect, syncConnect,
  type ConnectReturnTo, type PaymentsStatus, type StudioSettings,
} from '../api';
import { descriptorFrom, STATE_COPY, translateRequirements } from './copy';
import { METHODS_ANCHOR } from './methodsApi';
import { ReadyTips } from './StripeIntro';
import { Checklist, CopyChip, GuideStepper, IconBox, Pill, ScreenTips, type StepDef } from './ui';

interface Props {
  status: PaymentsStatus;
  setStatus: (s: PaymentsStatus) => void;
  value: StudioSettings;
  onSaved: (s: StudioSettings) => void;
  returnTo: ConnectReturnTo;
}

type Busy = '' | 'start' | 'sync' | 'disconnect';

/** Cada cuánto se vuelve a leer el estado guardado (lo actualizan los avisos de Stripe). */
const POLL_MS = 20_000;
/** Cada cuánto se le pregunta a Stripe directamente (máx. 30 por hora en el API). */
const SYNC_MS = 5 * 60_000;

export default function ConnectGuide({ status, setStatus, value, onSaved, returnTo }: Props) {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<Busy>('');
  const [error, setError] = useState('');
  const [country, setCountry] = useState(status.default_country || status.countries[0]?.code || '');
  const [ready, setReady] = useState(false); // «Ya lo tengo» en el paso 1
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const handled = useRef(false);
  const currency = (value.currency || 'EUR').toUpperCase();
  const state = status.state;
  const copy = STATE_COPY[state];
  const webUrl = value.web_url || value.default_web_url || '';
  const descriptor = descriptorFrom(value.studio_name);

  const after = useCallback(async (s: PaymentsStatus) => {
    setStatus(s);
    setCheckedAt(new Date());
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

  // Mientras Stripe revisa (o faltan datos): mirar solos, sin pulsar nada.
  const waiting = state === 'pending' || state === 'restricted' || state === 'onboarding';
  useEffect(() => {
    if (!waiting) return undefined;
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const s = await loadPaymentsStatus();
        if (!alive) return;
        setCheckedAt(new Date());
        if (s.state !== state || s.requirements_due.join() !== status.requirements_due.join()) await after(s);
      } catch { /* sin conexión: se vuelve a probar */ }
    };
    const t1 = window.setInterval(poll, POLL_MS);
    const sync = async () => {
      if (document.hidden) return;
      try {
        const s = await syncConnect();
        if (alive) await after(s);
      } catch { /* Stripe no responde: se vuelve a probar */ }
    };
    const t2 = state === 'pending' ? window.setInterval(sync, SYNC_MS) : 0;
    return () => { alive = false; window.clearInterval(t1); if (t2) window.clearInterval(t2); };
  }, [waiting, state, status.requirements_due, after]);

  const connect = async () => {
    const name = status.countries.find((c) => c.code === country)?.name || country;
    const ok = await confirm({
      title: `¿Abrir tu cuenta de Stripe en ${name}?`,
      message: (
        <>
          Se abre la web de Stripe. Te pedirá los datos de tu negocio y tu IBAN, y al terminar vuelves aquí sola.{' '}
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
  const requirements = translateRequirements(status.requirements_due);
  const current = state === 'none' ? (ready ? 1 : 0) : copy.step;
  const time = checkedAt ? checkedAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';

  const checkButton = (label = 'Comprobar ahora') => (
    <Button onClick={check} disabled={!!busy} startIcon={spinner('sync') || <StudioIcon name="reload" />} sx={{ minHeight: 44 }}>
      {label}
    </Button>
  );

  const steps: StepDef[] = [
    {
      key: 'prepare',
      title: 'Prepara tus datos',
      summary: 'DNI o NIE, IBAN y móvil. Unos 10 minutos.',
      content: (
        <Box>
          <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-muted)', mb: 1.25 }}>
            Ten esto a mano antes de empezar (márcalo si quieres):
          </Typography>
          <Checklist label="Lo que necesitas" items={[
            { key: 'id', title: 'Tu DNI o NIE (o pasaporte)', hint: '¿Tienes una sociedad (SL…)? También su NIF y los datos de quien la representa.' },
            { key: 'iban', title: 'El IBAN de tu cuenta del banco', hint: 'Donde quieres recibir el dinero. A tu nombre o al de tu empresa.' },
            { key: 'phone', title: 'Tu móvil', hint: 'Stripe te manda un código por SMS.' },
            { key: 'web', title: 'La dirección de tu web', hint: webUrl ? <>Stripe te la pide: <CopyChip text={webUrl} label="la dirección de tu web" /></> : 'Stripe te la pide.' },
            { key: 'time', title: 'Unos 10 minutos con calma' },
          ]} />
          {state === 'none' && (
            <Button variant="contained" onClick={() => setReady(true)} endIcon={<StudioIcon name="next" />} sx={{ mt: 1.5, minHeight: 48 }}>
              Ya lo tengo
            </Button>
          )}
        </Box>
      ),
    },
    {
      key: 'connect',
      title: 'Conecta con Stripe',
      summary: 'Rellenas tus datos en la web de Stripe y vuelves aquí sola.',
      content: (
        <Box>
          {state === 'onboarding' && (
            <Alert severity="info" sx={{ mb: 1.5 }}>Tu cuenta ya está creada. Te falta terminar el alta: sigue donde lo dejaste.</Alert>
          )}
          <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-muted)', mb: 1.25 }}>
            Stripe te irá pidiendo esto, pantalla a pantalla:
          </Typography>
          <ScreenTips label="Qué te pedirá Stripe" rows={[
            { title: 'Email y móvil', text: 'Te llega un código por SMS para confirmar que eres tú.' },
            { title: 'Tipo de negocio', text: <>¿Trabajas por tu cuenta? Elige <b>«Persona física»</b> (o «Autónomo»). ¿Tienes SL u otra sociedad? Elige <b>«Empresa»</b>.</> },
            { title: 'Tus datos', text: 'Nombre, fecha de nacimiento, dirección y DNI o NIE, igual que en tu documento.' },
            {
              title: 'Tu negocio',
              text: (
                <>
                  Actividad: <b>«Gimnasios / estudios de fitness»</b>.{' '}
                  Web: {webUrl ? <CopyChip text={webUrl} label="la dirección de tu web" /> : 'la de tu estudio'}.{' '}
                  Descripción: «Clases de pilates y yoga, bonos y membresías».
                </>
              ),
            },
            {
              title: 'Nombre en el extracto (descriptor)',
              text: <>Es lo que verá tu cliente en el extracto de su banco. Pon el de tu estudio, p. ej. <CopyChip text={descriptor} label="el nombre para el extracto" />, para que lo reconozca y no reclame el cargo.</>,
            },
            { title: 'Cuenta del banco', text: 'Tu IBAN. Ahí te llega el dinero.' },
            { title: 'Revisar y enviar', text: 'Comprueba el resumen y acepta. Vuelves aquí automáticamente.' },
          ]} />
          <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', mt: 1.25, display: 'flex', gap: 0.75 }}>
            <StudioIcon name="tip" aria-hidden sx={{ fontSize: 18 }} />
            ¿Se cerró la ventana o caducó el enlace? No pasa nada: vuelve aquí y pulsa «Continuar en Stripe».
          </Typography>
          {state === 'none' && (
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start', mt: 2 }}>
              <TextField select label="País de tu negocio" value={country} onChange={(e) => setCountry(e.target.value)}
                sx={{ minWidth: 220, flex: { xs: '1 1 100%', sm: '0 1 280px' } }} helperText="Donde está registrado. No se puede cambiar después.">
                {status.countries.map((c) => <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>)}
              </TextField>
              <Button variant="contained" size="large" onClick={connect} disabled={!country || !!busy}
                startIcon={spinner('start') || <StudioIcon name="card" />} sx={{ minHeight: 52 }}>
                Conectar pagos
              </Button>
            </Box>
          )}
          {state === 'onboarding' && (
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
              <Button variant="contained" size="large" onClick={() => goToStripe()} disabled={!!busy}
                startIcon={spinner('start') || <StudioIcon name="external" />} sx={{ minHeight: 52 }}>
                Continuar en Stripe
              </Button>
              {checkButton('Ya terminé: comprobar')}
            </Box>
          )}
        </Box>
      ),
    },
    {
      key: 'review',
      title: 'Stripe lo revisa',
      summary: 'Unos minutos (a veces 1 o 2 días laborables).',
      content: (
        <Box>
          {state === 'restricted' ? (
            <>
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Stripe necesita {requirements.length === 1 ? 'un dato más' : 'algunos datos más'} para dejarte cobrar (o para enviarte el dinero).
              </Alert>
              {requirements.length > 0 && (
                <Box component="ul" aria-label="Lo que falta en Stripe" data-testid="requirements" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
                  {requirements.map((r) => (
                    <Box component="li" key={r.key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-warn-soft)' }}>
                      <StudioIcon name="warning" aria-hidden sx={{ fontSize: 20, color: 'var(--studio-warn)', mt: '1px' }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--studio-ink)' }}>{r.text}</Typography>
                        {r.unknown && <Typography sx={{ fontSize: '0.75rem', color: 'var(--studio-muted)', fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' }}>{r.key}</Typography>}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button variant="contained" size="large" onClick={() => goToStripe()} disabled={!!busy}
                  startIcon={spinner('start') || <StudioIcon name="external" />} sx={{ minHeight: 52 }}>
                  Completar datos en Stripe
                </Button>
                {checkButton()}
              </Box>
            </>
          ) : (
            <>
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'var(--studio-ink)', fontSize: '0.92rem', lineHeight: 1.6, '& li': { mb: 0.5 } }}>
                <li><b>«Pendiente»</b> quiere decir que Stripe está comprobando tu identidad y tu banco. Lo exige la ley a todo el que cobra con tarjeta.</li>
                <li>Suele tardar <b>unos minutos</b>; a veces 1 o 2 días laborables.</li>
                <li>Si necesita algo más, te lo diremos aquí y Stripe te escribirá por email.</li>
              </Box>
              {state === 'pending' && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mt: 1.5 }}>
                  <Box role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.86rem', color: 'var(--studio-muted)' }}>
                    <CircularProgress size={14} color="inherit" />
                    Lo comprobamos solos cada poco{time ? ` · última vez a las ${time}` : ''}.
                  </Box>
                  {checkButton()}
                </Box>
              )}
            </>
          )}
        </Box>
      ),
    },
    {
      key: 'ready',
      title: '¡Listo!',
      summary: 'Ya cobras con tarjeta en tu web.',
      content: state === 'active' ? (
        <Box>
          {status.provider !== 'connect' && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              Tu web aún cobra con tus claves de Stripe de antes. Desconéctalas (más abajo, «Tus claves de Stripe de antes») para cobrar con esta cuenta.
            </Alert>
          )}
          {stripeCurrency && stripeCurrency !== currency && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Tu cuenta de Stripe recibe el dinero en <b>{stripeCurrency}</b> y tu estudio cobra en <b>{currency}</b>.
              Funciona, pero Stripe convertirá cada pago y cobra una comisión por el cambio.
            </Alert>
          )}
          <ReadyTips live={status.live} webUrl={webUrl} dashboardUrl={status.dashboard_url} />
          <Button variant="text" onClick={() => document.getElementById(METHODS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            startIcon={<StudioIcon name="card" />} sx={{ mt: 1, minHeight: 44 }} data-testid="go-payment-methods">
            Elegir formas de pago: Apple Pay, Bizum…
          </Button>
          <Button color="error" onClick={disconnect} disabled={!!busy} startIcon={spinner('disconnect')} sx={{ mt: 1.5, minHeight: 44 }}>
            Desconectar mi cuenta de Stripe
          </Button>
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-muted)' }}>
          Cuando Stripe dé el visto bueno, tu web cobrará con tarjeta. Aquí te diremos cómo hacer un pago de prueba, dónde ver el dinero y cómo devolverlo.
        </Typography>
      ),
    },
  ];

  return (
    <Box component="section" aria-labelledby="po-connect-h" data-testid="connect-guide" data-state={state} sx={{
      p: { xs: 2, sm: 3 }, borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-surf)',
      border: '2px solid', borderColor: state === 'active' ? 'var(--studio-ok)' : 'var(--studio-primary-text)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <IconBox icon="card" tone={state === 'active' ? 'ok' : 'p'} />
        <Typography id="po-connect-h" component="h3" sx={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--studio-ink)', flex: 1, minWidth: 160 }}>
          Activa los pagos online
        </Typography>
        <Pill tone={copy.tone}>{copy.label}</Pill>
        {state === 'active' && !status.live && <Pill tone="warn">Modo prueba</Pill>}
      </Box>

      {/* Qué pasa y qué hacer ahora, en dos frases */}
      <Box data-testid="state-summary" aria-live="polite" sx={{ mt: 1.5, mb: 2.5, p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)' }}>
        <Typography sx={{ fontSize: '0.95rem', color: 'var(--studio-ink)' }}>
          {state === 'active' && status.display_name ? <>Cuenta: <b>{status.display_name}</b>. </> : null}
          {state === 'active' && !status.live ? 'Estás en modo prueba: los pagos no son reales. ' : ''}
          {copy.what}
        </Typography>
        <Typography sx={{ fontSize: '0.92rem', color: 'var(--studio-muted)', mt: 0.5, display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
          <StudioIcon name="next" aria-hidden sx={{ fontSize: 18, mt: '2px', color: 'var(--studio-primary-text)' }} />
          <span><b style={{ color: 'var(--studio-ink)' }}>Ahora:</b> {copy.next}</span>
        </Typography>
      </Box>

      {state === 'mismatch' ? (
        <Box>
          <Button color="error" variant="outlined" onClick={disconnect} disabled={!!busy} startIcon={spinner('disconnect')} sx={{ minHeight: 44 }}>
            Desconectar
          </Button>
        </Box>
      ) : (
        <GuideStepper label="Pasos para activar los pagos online" steps={steps} current={current} done={state === 'active'} />
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Box>
  );
}
