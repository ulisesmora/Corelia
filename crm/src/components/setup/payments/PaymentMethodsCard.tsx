// «Formas de pago en tu web»: qué ve la clienta al pagar (tarjeta, Apple Pay,
// Bizum, MB WAY, OXXO…) y un interruptor por método. Va en Ajustes → Cobros,
// dentro de «Pagos online» (PaymentsSection), y se enlaza desde el paso
// «¡Listo!» de «Conectar pagos» y desde la guía «Cómo se cobra» → Clientas
// online. El API cambia la configuración de métodos de pago de Stripe de la
// cuenta que cobra (api/api/utils/payment_methods.py).
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Switch, Typography } from '@mui/material';
import StudioIcon from '../../../site/StudioIcon';
import { useConfirm, useNotify } from '../../guide';
import {
  applyRecommended, loadMethods, METHODS_ANCHOR, MethodsApiError, toggleMethod, verifyDomains,
  type DomainRow, type MethodsOverview, type PayMethod,
} from './methodsApi';
import { Pill, type Tone } from './ui';


// ── Marca de cada método: monograma genérico (sin logotipos de terceros) ──
const MARK: Record<string, string> = {
  apple_pay: 'Pay', google_pay: 'G Pay', link: 'Link', bizum: 'Bizum', mb_way: 'MB WAY', ideal: 'iDEAL',
  bancontact: 'BC', cartes_bancaires: 'CB', klarna: 'K.', paypal: 'PP', sepa_debit: 'SEPA', multibanco: 'MB',
  oxxo: 'OXXO', bacs_debit: 'Bacs', us_bank_account: 'ACH', acss_debit: 'PAD',
};

function Mark({ icon }: { icon: string }) {
  const text = MARK[icon];
  const size = text && text.length > 4 ? 8.5 : 11;
  return (
    <Box aria-hidden sx={{
      width: 48, height: 32, flex: 'none', borderRadius: 'var(--studio-radius-sm, 6px)', display: 'grid', placeItems: 'center',
      border: '1px solid var(--studio-border-strong)', background: 'var(--studio-surf)', color: 'var(--studio-ink)',
    }}>
      {text ? (
        <svg width="44" height="24" viewBox="0 0 44 24" role="presentation" focusable="false">
          <text x="22" y="16" textAnchor="middle" fontSize={size} fontWeight="800" fill="currentColor"
            fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" letterSpacing="0.2">{text}</text>
        </svg>
      ) : <StudioIcon name="card" sx={{ fontSize: 20 }} />}
    </Box>
  );
}

const STATUS: Record<PayMethod['status'], { label: string; tone: Tone }> = {
  on: { label: 'Activado', tone: 'ok' },
  off: { label: 'Apagado', tone: 'n' },
  pending: { label: 'Pendiente en Stripe', tone: 'warn' },
  unavailable: { label: 'No disponible', tone: 'n' },
};

function Works({ m }: { m: PayMethod }) {
  const items = [
    { on: m.works.drop_in, text: 'Clase suelta' },
    { on: m.works.packs, text: 'Bonos' },
    { on: m.works.subs, text: 'Cuotas' },
  ];
  return (
    <Box component="ul" aria-label="Dónde sirve" sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <Box component="li" key={i.text} sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 0.75, py: '1px', borderRadius: 'var(--studio-radius-chip, 999px)',
          fontSize: '0.74rem', fontWeight: 600, border: '1px solid var(--studio-border-color)',
          color: i.on ? 'var(--studio-ink)' : 'var(--studio-muted)', textDecoration: i.on ? 'none' : 'line-through',
        }}>
          <StudioIcon name={i.on ? 'done' : 'close'} aria-hidden sx={{ fontSize: 13 }} />
          <span>{i.text}</span>
          <Box component="span" sx={visuallyHidden}>{i.on ? ': sí' : ': no'}</Box>
        </Box>
      ))}
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
} as const;

function Row({ m, data, busy, onToggle }: {
  m: PayMethod; data: MethodsOverview; busy: boolean; onToggle: (m: PayMethod, on: boolean) => void;
}) {
  const s = STATUS[m.status];
  const checked = m.status === 'on' || m.status === 'pending';
  const domainMissing = m.needs_domain && checked && data.ready && !data.apple_pay_ready;
  let control: ReactNode = null;
  if (m.toggle === 'api') {
    control = busy ? <CircularProgress size={22} aria-label={`Guardando ${m.name}`} sx={{ m: 1.25 }} />
      : <Switch checked={checked} onChange={(_, v) => onToggle(m, v)} inputProps={{ 'aria-label': `${m.name} en tu web` }} />;
  } else if (m.toggle === 'dashboard' && data.ready) {
    control = (
      <Button size="small" variant="outlined" href={data.dashboard_url} target="_blank" rel="noopener"
        endIcon={<StudioIcon name="external" />} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}>
        Abrir en Stripe
      </Button>
    );
  } else if (m.toggle === 'locked') {
    control = <StudioIcon name="lock" aria-label="Siempre activa" sx={{ color: 'var(--studio-muted)', m: 1.25 }} />;
  }
  return (
    <Box component="li" data-method={m.key} data-status={m.status} sx={{
      display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: 1.25, alignItems: 'start', py: 1.5,
      borderTop: '1px solid var(--studio-border-color)', '&:first-of-type': { borderTop: 0 },
      opacity: m.status === 'unavailable' ? 0.7 : 1,
    }}>
      <Box sx={{ pt: 0.25 }}><Mark icon={m.icon} /></Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography component="h4" sx={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--studio-ink)' }}>{m.name}</Typography>
          <Pill tone={s.tone}>{s.label}</Pill>
          {domainMissing && <Pill tone="warn" icon="warning">Falta verificar tu web</Pill>}
          {m.recommended && m.status !== 'on' && m.status !== 'unavailable' && <Pill tone="p">Recomendado</Pill>}
        </Box>
        <Typography sx={{ fontSize: '0.88rem', color: 'var(--studio-ink)', lineHeight: 1.45, mt: 0.25 }}>{m.why}</Typography>
        {m.limits && <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)', lineHeight: 1.4, mt: 0.25 }}>{m.limits}</Typography>}
        <Works m={m} />
        {m.note && (
          <Typography sx={{ fontSize: '0.8rem', color: m.status === 'pending' ? 'var(--studio-warn)' : 'var(--studio-muted)', mt: 0.5, display: 'flex', gap: 0.5 }}>
            <StudioIcon name="tip" aria-hidden sx={{ fontSize: 16, mt: '1px', flex: 'none' }} />
            <span>{m.note}</span>
          </Typography>
        )}
      </Box>
      {/* En el móvil, el botón «Abrir en Stripe» va debajo del texto (no lo estrecha) */}
      <Box sx={m.toggle === 'dashboard'
        ? { alignSelf: 'center', gridColumn: { xs: '2 / -1', sm: 'auto' }, justifySelf: { xs: 'start', sm: 'auto' }, mt: { xs: 1, sm: 0 } }
        : { alignSelf: 'center' }}>
        {control}
      </Box>
    </Box>
  );
}

function Group({ title, intro, items, children, id }: { title: string; intro?: string; items: number; children: ReactNode; id: string }) {
  if (!items) return null;
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 2.5 }}>
      <Typography id={id} component="h3" sx={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--studio-muted)' }}>
        {title}
      </Typography>
      {intro && <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', mt: 0.25 }}>{intro}</Typography>}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.75, px: { xs: 1.25, sm: 1.75 }, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)' }}>
        {children}
      </Box>
    </Box>
  );
}

function DomainBox({ data, busy, onVerify }: { data: MethodsOverview; busy: boolean; onVerify: () => void }) {
  const web = data.domains[0];
  const ok = data.apple_pay_ready;
  const label = (d: DomainRow) => (d.apple_pay === 'active' ? 'verificado' : d.apple_pay === 'missing' ? 'sin registrar'
    : d.apple_pay === 'error' ? 'no se pudo registrar' : 'sin verificar');
  return (
    <Box data-testid="apple-pay-domain" sx={{
      mt: 2, p: 1.5, borderRadius: 'var(--studio-radius-md)', border: '1px solid',
      borderColor: ok ? 'var(--studio-border-color)' : 'var(--studio-warn)', background: ok ? 'var(--studio-surf)' : 'var(--studio-warn-soft)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <StudioIcon name={ok ? 'done' : 'warning'} aria-hidden sx={{ color: ok ? 'var(--studio-ok)' : 'var(--studio-warn)' }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--studio-ink)', flex: 1, minWidth: 180 }}>
          {ok ? `Tu web (${web?.domain}) está verificada para Apple Pay y Google Pay`
            : web ? `Falta verificar ${web.domain} para Apple Pay y Google Pay` : 'Tu web aún no tiene una dirección pública para Apple Pay'}
        </Typography>
        <Button size="small" variant={ok ? 'text' : 'contained'} onClick={onVerify} disabled={busy || !data.ready}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <StudioIcon name="reload" />} sx={{ minHeight: 40 }}>
          Verificar dominio para Apple Pay
        </Button>
      </Box>
      {data.domains.length > 0 && (
        <Box component="ul" aria-label="Direcciones registradas en Stripe" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {data.domains.map((d) => (
            <Box component="li" key={d.domain} title={d.error || undefined} sx={{
              fontSize: '0.76rem', px: 0.75, py: '1px', borderRadius: 'var(--studio-radius-chip, 999px)', border: '1px solid var(--studio-border-color)',
              color: d.apple_pay === 'active' ? 'var(--studio-ok)' : 'var(--studio-muted)', overflowWrap: 'anywhere',
            }}>
              {d.domain} · {label(d)}
            </Box>
          ))}
        </Box>
      )}
      {!ok && (
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)', mt: 0.75 }}>
          {web?.error ? <>Stripe dice: «{web.error}». </> : null}
          Stripe tiene que comprobar cada dirección de tu web (con y sin www). Si acabas de cambiar de dominio, espera a que abra con https y pulsa el botón.
        </Typography>
      )}
    </Box>
  );
}

export default function PaymentMethodsCard() {
  const id = useId();
  const notify = useNotify();
  const confirm = useConfirm();
  const [data, setData] = useState<MethodsOverview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(''); // clave del método, 'recommended' o 'verify'
  const [error, setError] = useState<{ message: string; dashboardUrl: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await loadMethods());
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Enlaces a …#formas-de-pago (paso «¡Listo!», guía «Cómo se cobra», buscador)
  const loaded = !!data;
  useEffect(() => {
    if (!loaded || window.location.hash !== `#${METHODS_ANCHOR}`) return;
    document.getElementById(METHODS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded]);

  const fail = (e: unknown) => {
    if (e instanceof MethodsApiError) setError({ message: e.message, dashboardUrl: e.dashboardUrl });
    else setError({ message: e instanceof Error ? e.message : String(e), dashboardUrl: '' });
  };

  const onToggle = async (m: PayMethod, on: boolean) => {
    if (on && m.group === 'delayed') {
      const ok = await confirm({
        title: `¿Activar ${m.name}?`,
        message: (
          <>
            <p style={{ marginTop: 0 }}>Es un pago que <b>tarda días</b> en confirmarse. {m.limits}</p>
            <p style={{ marginBottom: 0 }}>
              Las <b>reservas de clase no lo ofrecen</b>: se quita solo al reservar, para que una plaza nunca quede guardada
              sin cobrar. Tus clientas lo verán al comprar bonos{m.works.subs ? ' y cuotas' : ''}; los créditos se les ponen cuando llega el pago.
            </p>
          </>
        ),
        confirmText: `Sí, activar ${m.name}`,
      });
      if (!ok) return;
    }
    setBusy(m.key);
    setError(null);
    try {
      const r = await toggleMethod(m.key, on);
      setData(r.overview);
      notify(on ? `${m.name} activado ✓ Ya sale al pagar en tu web.` : `${m.name} apagado.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const onRecommended = async () => {
    setBusy('recommended');
    setError(null);
    try {
      const r = await applyRecommended();
      setData(r.overview);
      const names = (keys: string[]) => keys.map((k) => r.overview.methods.find((x) => x.key === k)?.name || k).join(', ');
      notify(r.changed.length ? `Activado: ${names(r.changed)} ✓` : 'Ya tenías activados los recomendados.');
      if (r.skipped.length) {
        setError({ message: `No se ha podido activar: ${r.skipped.map((s) => `${names([s.key])} (${s.reason})`).join('; ')}`,
          dashboardUrl: r.skipped.some((s) => s.dashboard) ? r.overview.dashboard_url : '' });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const onVerify = async () => {
    setBusy('verify');
    setError(null);
    try {
      const r = await verifyDomains();
      setData((d) => (d ? { ...d, domains: r.domains, apple_pay_ready: r.apple_pay_ready } : d));
      notify(r.apple_pay_ready ? 'Tu web está verificada ✓ Apple Pay y Google Pay salen al pagar.'
        : 'Stripe aún no da por buena tu web. Mira el detalle debajo del botón.', r.apple_pay_ready ? 'success' : 'warning');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const shell = (children: ReactNode) => (
    <Box component="section" id={METHODS_ANCHOR} aria-labelledby={`${id}-h`} data-testid="payment-methods" sx={{
      p: { xs: 1.75, sm: 2.5 }, borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-surf)',
      border: '1px solid var(--studio-border-color)', scrollMarginTop: 80,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <StudioIcon name="card" aria-hidden sx={{ color: 'var(--studio-primary-text)' }} />
        <Typography id={`${id}-h`} component="h2" sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--studio-ink)', flex: 1, minWidth: 180 }}>
          Formas de pago en tu web
        </Typography>
        {data?.ready && !data.live && <Pill tone="warn">Modo prueba</Pill>}
      </Box>
      <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5 }}>
        Lo que ve tu clienta al pagar. Stripe enseña a cada una solo lo que puede usar (por su país, su móvil y el importe).
      </Typography>
      {children}
    </Box>
  );

  if (loadError && !data) {
    return shell(<Alert severity="error" sx={{ mt: 1.5 }} action={<Button onClick={load}>Reintentar</Button>}>No se han podido cargar las formas de pago. {loadError}</Alert>);
  }
  if (!data) {
    return shell(<Box sx={{ display: 'grid', placeItems: 'center', minHeight: 120 }}><CircularProgress size={28} aria-label="Cargando las formas de pago" /></Box>);
  }

  const instant = data.methods.filter((m) => m.group === 'instant');
  const delayed = data.methods.filter((m) => m.group === 'delayed');
  const rec = data.methods.filter((m) => data.recommended.keys.includes(m.key));
  const recPending = rec.filter((m) => m.status === 'off' && m.toggle === 'api');
  const rows = (list: PayMethod[]) => list.map((m) => (
    <Row key={m.key} m={m} data={data} busy={busy === m.key || (busy === 'recommended' && recPending.includes(m))} onToggle={onToggle} />
  ));

  return shell(
    <>
      {!data.ready && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Primero activa los pagos online (aquí debajo, «Pagos online»). Luego eliges aquí con qué pueden pagar.
        </Alert>
      )}
      {data.ready && data.error && <Alert severity="warning" sx={{ mt: 1.5 }} action={<Button onClick={load}>Reintentar</Button>}>{data.error}</Alert>}

      {data.ready && rec.length > 0 && (
        <Box data-testid="recommended" sx={{
          mt: 2, p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-p-soft)',
          display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--studio-ink)' }}>{data.recommended.label}</Typography>
            <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>{rec.map((m) => m.name).join(' + ')}</Typography>
          </Box>
          <Button variant="contained" onClick={onRecommended} disabled={!!busy || recPending.length === 0}
            startIcon={busy === 'recommended' ? <CircularProgress size={16} color="inherit" /> : <StudioIcon name={recPending.length ? 'add' : 'done'} />}
            sx={{ minHeight: 44 }}>
            {recPending.length ? 'Activar los recomendados' : 'Ya los tienes'}
          </Button>
        </Box>
      )}

      {data.ready && <DomainBox data={data} busy={busy === 'verify'} onVerify={onVerify} />}

      {error && (
        <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setError(null)} action={error.dashboardUrl ? (
          <Button color="inherit" size="small" href={error.dashboardUrl} target="_blank" rel="noopener" endIcon={<StudioIcon name="external" />}>
            Abrir en Stripe
          </Button>
        ) : undefined}>
          {error.message}
        </Alert>
      )}

      <Group id={`${id}-now`} title="Al momento" intro="Se cobran en el acto: sirven también para reservar una clase." items={instant.length}>
        {rows(instant)}
      </Group>
      <Group id={`${id}-later`} title="Pagos que tardan días (domiciliación, vales)" items={delayed.length}
        intro={data.booking_protection === 'pmc'
          ? 'Las reservas de clase no los ofrecen (usan la configuración «Reservas» de tu instalación). Sirven para bonos y cuotas.'
          : 'Las reservas de clase no los ofrecen: se quitan solos al reservar para no guardar una plaza sin cobrar. Sirven para bonos y cuotas.'}>
        {rows(delayed)}
      </Group>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
        <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', flex: 1, minWidth: 200 }}>
          ¿Otro método o uno bloqueado? Todos están en tu Stripe → Ajustes → Métodos de pago.
        </Typography>
        {data.ready && (
          <Button variant="outlined" href={data.dashboard_url} target="_blank" rel="noopener" endIcon={<StudioIcon name="external" />} sx={{ minHeight: 44 }}>
            Abrir en Stripe
          </Button>
        )}
      </Box>
    </>,
  );
}
