import { useId, useState } from 'react';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { creditsText, daysText, defaultOptions, methodsText, periodText, price, useChargingFacts } from './facts';
import PaymentOptionsCard from './PaymentOptionsCard';
import { Badge, Note, Value, type Tint } from './visuals';

/**
 * «Así cobrarás»: resumen compacto de cómo pagan las clientas (clase suelta,
 * bono, membresía) con un «Ver cómo funciona» desplegable. Va en el paso 7
 * de la puesta en marcha y en «Clases y precios» → Precios y bonos.
 * `onGuide`: enlace a la guía completa (solo dentro del panel).
 * «Formas de cobro» (tarjeta, pagar en el estudio, invitadas, qué se vende
 * online) se cambian aquí mismo, sin salir (PaymentOptionsCard compacta).
 */
export default function HowYouCharge({ onGuide, defaultOpen = false, version }: {
  onGuide?: () => void;
  defaultOpen?: boolean;
  /** Cambia cuando cambian los bonos (vuelve a pedir los datos) */
  version?: unknown;
}) {
  const [saves, setSaves] = useState(0);
  const { facts: f } = useChargingFacts(true, `${String(version)}-${saves}`);
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const id = useId();
  const pack = f.pack;
  const sub = f.subscription;
  const o = f.options || defaultOptions(f.payments.enabled);
  const where = (online: boolean) => (online ? 'en la web' : 'en el estudio');
  const tiles: { icon: Parameters<typeof Badge>[0]['icon']; tint: Tint; title: string; text: string }[] = [
    { icon: 'ticket', tint: 'reformer', title: 'Clase suelta', text: `${price(f, f.drop_in_price)} · ${o.drop_in_online ? 'con tarjeta' : (o.pay_at_studio.guests || o.pay_at_studio.clients) ? 'paga al llegar' : 'con créditos'}` },
    { icon: 'plans', tint: 'mat', title: 'Bono', text: `${pack ? `${pack.credits} clases · ${price(f, pack.price)}` : 'Varias clases'} · ${where(o.packs_online)}` },
    { icon: 'subscriptions', tint: 'barre', title: 'Membresía', text: `${sub ? `${price(f, sub.price)} ${periodText(sub.interval, sub.interval_count)}` : 'Cada mes'} · ${where(o.memberships_online)}` },
  ];
  const studioWho = o.pay_at_studio.guests && o.pay_at_studio.clients ? 'invitadas y clientas con cuenta'
    : o.pay_at_studio.guests ? 'invitadas (sin cuenta)' : o.pay_at_studio.clients ? 'clientas con cuenta' : '';
  const methods = methodsText(f);

  return (
    <Box component="section" aria-labelledby={`${id}-h`} data-tour="how-you-charge" sx={{
      p: { xs: 1.75, sm: 2 }, borderRadius: 'var(--studio-radius-lg)', background: 'var(--studio-surf)',
      border: '1px solid var(--studio-border-color)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
        <StudioIcon name="payments" aria-hidden sx={{ color: 'var(--studio-primary-text)' }} />
        <Typography id={`${id}-h`} component="h2" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--studio-ink)' }}>Así cobrarás</Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        {tiles.map((t) => (
          <Box component="li" key={t.title} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)', minWidth: 0 }}>
            <Badge icon={t.icon} tint={t.tint} size={34} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--studio-ink)', lineHeight: 1.2 }}>{t.title}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'var(--studio-muted)', lineHeight: 1.3 }}>{t.text}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-more`}
        sx={{
          mt: 1, minHeight: 44, px: 1, ml: -1, gap: 0.5, borderRadius: 999, fontWeight: 700, fontSize: '0.9rem',
          color: 'var(--studio-primary-text)', fontFamily: 'var(--studio-font-body)',
          '&:hover': { background: 'var(--studio-p-soft)' }, '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)' },
        }}
      >
        <StudioIcon name="help" aria-hidden sx={{ fontSize: 20 }} />
        {open ? 'Ocultar' : 'Ver cómo funciona'}
        <StudioIcon name="next" aria-hidden sx={{ fontSize: 16, transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .2s' }} />
      </ButtonBase>

      <ButtonBase
        onClick={() => setEditing((v) => !v)}
        aria-expanded={editing}
        aria-controls={`${id}-opts`}
        data-testid="edit-payment-options"
        sx={{
          mt: 0.5, minHeight: 44, px: 1, ml: { xs: -1, sm: 1 }, gap: 0.5, borderRadius: 999, fontWeight: 700, fontSize: '0.9rem',
          color: 'var(--studio-primary-text)', fontFamily: 'var(--studio-font-body)',
          '&:hover': { background: 'var(--studio-p-soft)' }, '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)' },
        }}
      >
        <StudioIcon name="settings" aria-hidden sx={{ fontSize: 20 }} />
        {editing ? 'Cerrar formas de cobro' : 'Formas de cobro'}
      </ButtonBase>
      <Collapse in={editing} id={`${id}-opts`} unmountOnExit>
        <Box sx={{ mt: 1 }}>
          <PaymentOptionsCard compact onSaved={() => setSaves((n) => n + 1)} />
        </Box>
      </Collapse>

      <Collapse in={open} id={`${id}-more`}>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box component="li" sx={line}>
            <Badge icon="credits" size={32} />
            <span>
              <b>1 crédito = 1 clase.</b> Lo que compra se guarda en su bono y se descuenta al reservar.
              {f.credits_vary && f.class_types.length > 0 && <> Ej.: {f.class_types.slice(-1).map((c) => `${c.title} gasta ${creditsText(c.credits)}`)}.</>}
            </span>
          </Box>
          <Box component="li" sx={line}>
            <Badge icon="clock" size={32} />
            <span><b>Los bonos caducan</b> {pack?.expire_days ? <>(el de {pack.credits} clases, a los <Value>{daysText(pack.expire_days)}</Value>)</> : 'al tiempo que elijas'}. Lo que no use, se pierde.</span>
          </Box>
          <Box component="li" sx={line}>
            <Badge icon="card" size={32} />
            <span><b>Online:</b> {o.card ? 'paga con tarjeta en tu web.' : f.payments.enabled ? 'la tarjeta está apagada en «Formas de cobro».' : 'paga con tarjeta en tu web (actívalo luego en Ajustes → Cobros).'}</span>
          </Box>
          <Box component="li" sx={line}>
            <Badge icon="payments" size={32} />
            <span>
              <b>En el estudio:</b>{' '}
              {studioWho ? <>reservan y pagan al llegar ({studioWho}){methods ? `, en ${methods}` : ''}. </> : null}
              Si te compran un bono en mano{methods ? '' : ' (efectivo, Bizum…)'}, le añades los créditos en «Créditos».
            </span>
          </Box>
        </Box>
        {onGuide && (
          <ButtonBase onClick={onGuide} sx={{
            mt: 1, minHeight: 44, px: 1, ml: -1, gap: 0.5, borderRadius: 999, fontWeight: 700, fontSize: '0.9rem',
            color: 'var(--studio-primary-text)', fontFamily: 'var(--studio-font-body)', '&:hover': { background: 'var(--studio-p-soft)' },
          }}>
            Cancelaciones, lista de espera y más <StudioIcon name="next" aria-hidden sx={{ fontSize: 16 }} />
          </ButtonBase>
        )}
        {!onGuide && <Note>Más adelante, «?» → «Cómo se cobra» te lo explica con calma.</Note>}
      </Collapse>
    </Box>
  );
}

const line = {
  display: 'flex', alignItems: 'flex-start', gap: 1.25, fontSize: '0.88rem', color: 'var(--studio-ink)', lineHeight: 1.5,
  '& b': { fontWeight: 700 },
} as const;
