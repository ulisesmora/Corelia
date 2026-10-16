// «Formas de cobro»: cómo pueden pagar y reservar las clientas en la web.
// Va en Ajustes → Cobros (completa), en «Así cobrarás» (paso 7 de la puesta
// en marcha y Clases y precios → Precios, compacta) y se enlaza desde la guía
// «Cómo se cobra». Guarda en SiteConfig (PATCH /api/v1/site-config/) y el API
// calcula lo que la web ofrece de verdad (api/utils/payment_options.py).
import { useEffect, useId, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Radio, RadioGroup, Switch, TextField, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import StudioIcon, { type StudioIconName } from '../../site/StudioIcon';
import { useSite } from '../../site/SiteProvider';
import { useNotify } from '../guide';
import {
  loadSettings, PAYMENT_OPTION_FIELDS, saveSettings, type StudioPayMethod, type StudioSettings,
} from '../setup/api';
import { useOpenGuide } from './chapters';
import { invalidateChargingFacts, useChargingFacts } from './facts';
import TwoWorlds from './TwoWorlds';

type Form = Pick<StudioSettings, (typeof PAYMENT_OPTION_FIELDS)[number]>;

const METHODS: { key: StudioPayMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'bizum', label: 'Bizum' },
  { key: 'card', label: 'Tarjeta / datáfono' },
  { key: 'transfer', label: 'Transferencia' },
];

const pick = (s: StudioSettings): Form => Object.fromEntries(PAYMENT_OPTION_FIELDS.map((k) => [k, s[k]])) as Form;

/** Lo que verá la web con estos ajustes (misma regla que el API). */
function effective(f: Form, onlineReady: boolean) {
  const card = onlineReady && f.online_card_enabled;
  const studio = f.pay_at_studio_enabled === null ? !card : f.pay_at_studio_enabled;
  return {
    card,
    dropIn: card && f.sell_drop_in_online,
    packs: card && f.sell_packs_online,
    subs: card && f.sell_memberships_online,
    guests: f.guest_booking_enabled,
    studioGuests: studio && f.guest_booking_enabled && f.pay_at_studio_guests,
    studioClients: studio && f.pay_at_studio_clients,
    studio,
  };
}

function Row({ icon, title, hint, control, disabled }: {
  icon: StudioIconName; title: string; hint?: string; control: React.ReactNode; disabled?: boolean;
}) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, opacity: disabled ? 0.6 : 1,
      borderTop: '1px solid var(--studio-border-color)', '&:first-of-type': { borderTop: 0 },
    }}>
      <StudioIcon name={icon} aria-hidden sx={{ color: 'var(--studio-primary-text)', flex: 'none' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--studio-ink)' }}>{title}</Typography>
        {hint && <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)', lineHeight: 1.4 }}>{hint}</Typography>}
      </Box>
      <Box sx={{ flex: 'none' }}>{control}</Box>
    </Box>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 2 }}>
      <Typography id={id} component="h3" sx={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--studio-muted)', mb: 0.5 }}>
        {title}
      </Typography>
      <Box sx={{ px: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)' }}>{children}</Box>
    </Box>
  );
}

/** Pastillas de «Así lo verá tu web». */
function Ways({ label, items }: { label: string; items: { on: boolean; text: string }[] }) {
  const shown = items.filter((i) => i.on);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      <Typography component="span" sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)', flexBasis: { xs: '100%', sm: 'auto' }, minWidth: { sm: 120 } }}>{label}</Typography>
      {shown.length ? shown.map((i) => <Chip key={i.text} size="small" label={i.text} sx={{ fontWeight: 600 }} />)
        : <Chip size="small" color="warning" variant="outlined" label="No pueden reservar" />}
    </Box>
  );
}

export default function PaymentOptionsCard({ compact = false, onSaved }: {
  /** Versión corta (paso 7 y Clases y precios): sin la nota en inglés */
  compact?: boolean;
  onSaved?: (s: StudioSettings) => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const notify = useNotify();
  const site = useSite();
  const openGuide = useOpenGuide();
  const [saved, setSaved] = useState<StudioSettings | null>(null);
  const [version, setVersion] = useState(0);
  // Cabecera «Dos formas de cobrar» (solo la versión completa, en Ajustes → Cobros)
  const { facts } = useChargingFacts(!compact, version);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => { setSaved(s); setForm(pick(s)); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Enlaces a …#formas-de-cobro (buscador de Ajustes, guía, Clases y precios)
  const loaded = !!form;
  useEffect(() => {
    if (!loaded || compact || window.location.hash !== '#formas-de-cobro') return;
    document.getElementById('formas-de-cobro')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded, compact]);

  const dirty = useMemo(() => !!form && !!saved && JSON.stringify(form) !== JSON.stringify(pick(saved)), [form, saved]);

  if (error && !saved) return <Alert severity="error">No se han podido cargar las formas de cobro. {error}</Alert>;
  if (!form || !saved) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 120 }}><CircularProgress size={28} /></Box>;

  const onlineReady = Boolean(saved.payment_options?.online_ready ?? saved.payments_enabled);
  const e = effective(form, onlineReady);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const toggleMethod = (m: StudioPayMethod) => set({
    studio_payment_methods: form.studio_payment_methods.includes(m)
      ? form.studio_payment_methods.filter((x) => x !== m)
      : METHODS.map((x) => x.key).filter((k) => k === m || form.studio_payment_methods.includes(k)),
  });
  const studioMode = form.pay_at_studio_enabled === null ? 'auto' : form.pay_at_studio_enabled ? 'on' : 'off';

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const s = await saveSettings(form);
      setSaved(s);
      setForm(pick(s));
      invalidateChargingFacts();
      setVersion((v) => v + 1);
      await site.refresh?.();
      onSaved?.(s);
      notify('Guardado ✓ Tu web ya enseña estas formas de cobro.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const sw = (checked: boolean, onChange: (v: boolean) => void, label: string, disabled = false) => (
    <Switch checked={checked} disabled={disabled} onChange={(_, v) => onChange(v)} inputProps={{ 'aria-label': label }} />
  );

  return (
    <Box component="section" id="formas-de-cobro" aria-labelledby={`${id}-h`} data-testid="payment-options" sx={{
      p: { xs: 1.75, sm: compact ? 2 : 2.5 }, borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-surf)',
      border: '1px solid var(--studio-border-color)', scrollMarginTop: 80,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <StudioIcon name="payments" aria-hidden sx={{ color: 'var(--studio-primary-text)' }} />
        <Typography id={`${id}-h`} component="h2" sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--studio-ink)' }}>Formas de cobro</Typography>
      </Box>
      {compact ? (
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5 }}>
          Elige cómo pueden pagar y reservar tus clientas en tu web. Lo que apuntas tú desde el panel no cambia.
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 0.5, mb: 1.5 }}>
            Tienes dos tipos de clientas. Puedes tener las dos a la vez.
          </Typography>
          <TwoWorlds variant="compact" facts={facts} go={navigate} open={openGuide} />
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', mt: 2 }}>
            Aquí eliges qué ofrece tu web. Lo que apuntas tú desde el panel no cambia.
          </Typography>
        </>
      )}

      <Section title="1 · Clientas online: con tarjeta, en tu web" id={`${id}-card`}>
        <Row icon="card" title="Pago con tarjeta en la web"
          hint={onlineReady ? 'Al reservar o comprar, pagan con tarjeta, Apple Pay o Google Pay.' : 'Primero activa los pagos online (más abajo, «Pagos online»: te guiamos paso a paso).'}
          control={sw(form.online_card_enabled && onlineReady, (v) => set({ online_card_enabled: v }), 'Pago con tarjeta en la web', !onlineReady)}
          disabled={!onlineReady} />
        {[
          { key: 'sell_drop_in_online' as const, icon: 'ticket' as const, title: 'Clase suelta', hint: 'Pagan solo esa clase al reservarla.' },
          { key: 'sell_packs_online' as const, icon: 'plans' as const, title: 'Bonos', hint: 'Compran bonos de clases en la web.' },
          { key: 'sell_memberships_online' as const, icon: 'subscriptions' as const, title: 'Membresías', hint: 'Contratan la cuota mensual en la web.' },
        ].map((r) => (
          <Row key={r.key} icon={r.icon} title={r.title} hint={r.hint} disabled={!e.card}
            control={sw(form[r.key] && e.card, (v) => set({ [r.key]: v } as Partial<Form>), `Vender ${r.title.toLowerCase()} en la web`, !e.card)} />
        ))}
      </Section>

      <Section title="2 · En el estudio: reservan en la web y pagan al llegar" id={`${id}-studio`}>
        <Box sx={{ py: 1.25 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--studio-ink)' }}>Guardar la plaza y pagar al llegar</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'var(--studio-muted)' }}>
            Esas reservas salen en Ventas → «Quién me debe» hasta que las marques como cobradas.
          </Typography>
          <RadioGroup row value={studioMode} aria-label="Pagar en el estudio" sx={{ mt: 0.5 }}
            onChange={(_, v) => set({ pay_at_studio_enabled: v === 'auto' ? null : v === 'on' })}>
            <FormControlLabel value="auto" control={<Radio size="small" />} label={`Automático (${e.card ? 'ahora no, porque cobras con tarjeta' : 'ahora sí, porque no cobras con tarjeta'})`} />
            <FormControlLabel value="on" control={<Radio size="small" />} label="Sí" />
            <FormControlLabel value="off" control={<Radio size="small" />} label="No" />
          </RadioGroup>
        </Box>
        <Row icon="clients" title="Invitadas (sin cuenta)" hint="Dejan nombre, email y teléfono." disabled={!e.studio || !form.guest_booking_enabled}
          control={sw(form.pay_at_studio_guests, (v) => set({ pay_at_studio_guests: v }), 'Invitadas pueden pagar en el estudio', !e.studio || !form.guest_booking_enabled)} />
        <Row icon="addClient" title="Clientas con cuenta" hint="Reservan sin gastar créditos y pagan al llegar." disabled={!e.studio}
          control={sw(form.pay_at_studio_clients, (v) => set({ pay_at_studio_clients: v }), 'Clientas con cuenta pueden pagar en el estudio', !e.studio)} />
        <Box sx={{ py: 1.25, borderTop: '1px solid var(--studio-border-color)' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--studio-ink)', mb: 0.75 }}>Cómo te pueden pagar allí</Typography>
          <Box role="group" aria-label="Formas de pago en el estudio" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {METHODS.map((m) => {
              const on = form.studio_payment_methods.includes(m.key);
              return (
                <Chip key={m.key} label={m.label} clickable aria-pressed={on} onClick={() => toggleMethod(m.key)}
                  color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                  icon={on ? <StudioIcon name="done" sx={{ fontSize: 16 }} /> : undefined} sx={{ minHeight: 36, fontWeight: 600 }} />
              );
            })}
          </Box>
          <TextField size="small" fullWidth label="Nota para tus clientas (opcional)" placeholder="Paga al llegar, 5 min antes"
            value={form.studio_payment_note} onChange={(ev) => set({ studio_payment_note: ev.target.value.slice(0, 140) })}
            inputProps={{ maxLength: 140 }} sx={{ mt: 1.5 }} helperText="Sale en la web al elegir «Pagar en el estudio» y en el email de la reserva." />
          {!compact && (
            <TextField size="small" fullWidth label="La nota en inglés (opcional)" placeholder="Pay when you arrive, 5 min early"
              value={form.studio_payment_note_en} onChange={(ev) => set({ studio_payment_note_en: ev.target.value.slice(0, 140) })}
              inputProps={{ maxLength: 140 }} sx={{ mt: 1.5 }} />
          )}
        </Box>
      </Section>

      <Section title="Reservas" id={`${id}-booking`}>
        <Row icon="clients" title="Reservar sin cuenta (invitadas)"
          hint={form.guest_booking_enabled ? 'Cualquiera reserva dejando sus datos.' : 'Para reservar tienen que entrar o crear su cuenta.'}
          control={sw(form.guest_booking_enabled, (v) => set({ guest_booking_enabled: v }), 'Reservar sin cuenta')} />
        <Row icon="fixedClasses" title="Las clientas eligen sus clases fijas en la web"
          hint="Apagado (recomendado): las clases fijas son para tus clientas frecuentes y se las asignas tú en «Clases fijas». La web no las explica."
          control={sw(form.client_fixed_classes, (v) => set({ client_fixed_classes: v }), 'Las clientas eligen sus clases fijas en la web')} />
      </Section>

      <Box aria-live="polite" sx={{ mt: 2, p: 1.5, borderRadius: 'var(--studio-radius-md)', border: '1px dashed var(--studio-border-strong)', display: 'grid', gap: 0.75 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--studio-ink)' }}>Así lo verán en tu web</Typography>
        <Ways label="Invitadas" items={[
          { on: e.guests && e.dropIn, text: 'Tarjeta ahora' },
          { on: e.studioGuests, text: 'En el estudio' },
        ]} />
        <Ways label="Con cuenta" items={[
          { on: true, text: 'Sus créditos' },
          { on: e.dropIn, text: 'Tarjeta ahora' },
          { on: e.studioClients, text: 'En el estudio' },
        ]} />
        <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>
          Bonos: {e.packs ? 'en la web' : 'en el estudio'} · Membresías: {e.subs ? 'en la web' : 'en el estudio'}
        </Typography>
        {!e.guests && !e.dropIn && !e.studioClients && (
          <Typography sx={{ fontSize: '0.84rem', color: 'var(--studio-muted)' }}>
            Solo reservan con créditos: añádeselos en «Créditos» cuando te paguen.
          </Typography>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2, alignItems: 'center' }}>
        <Button variant="contained" onClick={save} disabled={!dirty || saving} data-testid="save-payment-options"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 44 }}>
          Guardar formas de cobro
        </Button>
        {dirty && <Button onClick={() => setForm(pick(saved))} sx={{ minHeight: 44 }}>Deshacer</Button>}
        {compact && (
          <Button onClick={() => navigate('/ajustes?tab=pagos')} endIcon={<StudioIcon name="next" />} sx={{ minHeight: 44, ml: 'auto' }}>
            Pagos online
          </Button>
        )}
      </Box>
    </Box>
  );
}
