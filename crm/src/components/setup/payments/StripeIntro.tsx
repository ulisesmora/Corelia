// «Pagos online» explicado de la mano: qué es Stripe, para qué, cuánto
// cuesta, qué necesitas y si es seguro; el camino sin pagos online; lo que
// toca cuando ya cobras y las preguntas frecuentes de «Conectar pagos»
// (Stripe Connect): ver PaymentsSection.
import { useNavigate } from 'react-router-dom';
import { Box, Button, Link, Typography } from '@mui/material';
import StudioIcon from '../../../site/StudioIcon';
import { GuideLink } from '../../charging';
import { feeExample, STRIPE_PRICING_URL, stripeFee } from './copy';
import { Faq, FactGrid, IconBox, type FaqItem } from './ui';

/** Qué es Stripe, para qué, cuánto cuesta, qué necesitas y si es seguro. */
export function StripeIntro({ country }: { country: string }) {
  const fee = stripeFee(country);
  const example = feeExample(country);
  return (
    <Box component="section" aria-labelledby="po-intro-h" data-testid="stripe-intro">
      <Typography id="po-intro-h" component="h3" sx={{ fontWeight: 800, fontSize: { xs: '1.2rem', sm: '1.35rem' }, color: 'var(--studio-ink)', fontFamily: 'var(--studio-font-heading)', lineHeight: 1.25 }}>
        Cobra con tarjeta en tu web
      </Typography>
      <Typography sx={{ color: 'var(--studio-muted)', mt: 0.5, mb: 2, fontSize: '0.98rem' }}>
        Te acompañamos paso a paso. Si nunca has usado Stripe, no pasa nada.
      </Typography>
      <FactGrid label="Stripe en pocas palabras" items={[
        {
          icon: 'card', title: '¿Qué es Stripe?',
          text: 'La empresa que cobra los pagos con tarjeta por ti. Como un datáfono, pero online.',
        },
        {
          icon: 'payments', title: '¿Para qué?',
          text: 'Tus clientas pagan al reservar o al comprar un bono. El dinero llega a tu banco en unos 2–7 días.',
        },
        {
          icon: 'ticket', title: '¿Cuánto cuesta?',
          text: (
            <>
              Sin cuota mensual. Stripe cobra por cada pago{fee ? <>: <b>{fee}</b></> : ' una pequeña comisión'}. <b>Corelia: 0 %.</b>
              {example && <> {example}</>}{' '}
              <Link href={STRIPE_PRICING_URL} target="_blank" rel="noopener">Tarifa de tu país</Link>
            </>
          ),
        },
        {
          icon: 'clients', title: '¿Qué necesito?',
          text: 'Tu DNI o NIE (o los datos de tu empresa), tu IBAN, tu móvil y unos 10 minutos.',
        },
        {
          icon: 'security', title: '¿Es seguro?', tone: 'ok',
          text: 'Nunca vemos los datos de las tarjetas ni las claves de tu banco. Todo lo guarda Stripe.',
        },
      ]} />
    </Box>
  );
}

/** «¿Prefieres no cobrar online?»: todo en el estudio, con créditos. */
export function NoOnlinePath() {
  const navigate = useNavigate();
  const toOptions = () => {
    const el = document.getElementById('formas-de-cobro');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else navigate('/ajustes?tab=pagos#formas-de-cobro');
  };
  return (
    <Box component="section" aria-labelledby="po-noonline-h" data-testid="no-online" sx={{
      display: 'flex', gap: 1.5, alignItems: 'flex-start', p: { xs: 1.75, sm: 2 }, borderRadius: 'var(--studio-radius-lg)',
      border: '1px dashed var(--studio-border-strong)', background: 'var(--studio-surf2)',
    }}>
      <IconBox icon="studio" tone="n" />
      <Box sx={{ minWidth: 0 }}>
        <Typography id="po-noonline-h" component="h3" sx={{ fontWeight: 800, color: 'var(--studio-ink)', fontSize: '1rem' }}>
          ¿Prefieres no cobrar online?
        </Typography>
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-muted)', lineHeight: 1.55, mt: 0.25 }}>
          No pasa nada: puedes cobrarlo todo en el estudio. Te pagan en mano (efectivo, Bizum o datáfono) y tú les añades
          los créditos. O reservan en la web y te pagan al llegar.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
          <Button variant="outlined" size="small" onClick={toOptions} startIcon={<StudioIcon name="settings" />} sx={{ minHeight: 44 }}>
            Ver formas de cobro
          </Button>
          <GuideLink chapter="en-estudio">Cómo se cobra en el estudio</GuideLink>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Paso 4, «¡Listo!»: pago de prueba, dónde ver el dinero y cómo devolver.
 * `live`: la cuenta cobra de verdad (si no, modo prueba).
 */
export function ReadyTips({ live, webUrl, dashboardUrl }: { live: boolean; webUrl?: string; dashboardUrl?: string }) {
  const navigate = useNavigate();
  return (
    <Box data-testid="ready-tips">
      <FactGrid label="Ya cobras con tarjeta" items={[
        {
          icon: 'play', title: 'Haz un pago de prueba',
          text: live
            ? 'Reserva una clase en tu web y págala con tu tarjeta. Luego devuélvete el dinero desde el panel.'
            : <>Estás en <b>modo prueba</b>: paga en tu web con la tarjeta <b>4242 4242 4242 4242</b> (cualquier fecha futura y cualquier CVC). No se cobra nada.</>,
        },
        {
          icon: 'stats', title: '¿Dónde veo el dinero?',
          text: 'Cada venta sale en «Ventas». Las transferencias a tu banco, en «Abrir mi Stripe» → Saldos. Llegan solas cada pocos días.',
        },
        {
          icon: 'undo', title: '¿Y si piden una devolución?',
          text: 'Al cancelar una clase eliges «Devolver el dinero» (o lo haces en tu Stripe). Le llega en 5–10 días.',
        },
      ]} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5, alignItems: 'center' }}>
        {webUrl && (
          <Button variant="contained" href={webUrl} target="_blank" rel="noopener" endIcon={<StudioIcon name="external" />} sx={{ minHeight: 44 }}>
            Abrir mi web
          </Button>
        )}
        <Button variant="outlined" onClick={() => navigate('/ventas')} startIcon={<StudioIcon name="stats" />} sx={{ minHeight: 44 }}>
          Ver ventas
        </Button>
        {dashboardUrl && (
          <Button variant="outlined" href={dashboardUrl} target="_blank" rel="noopener" endIcon={<StudioIcon name="external" />} sx={{ minHeight: 44 }}>
            Abrir mi Stripe
          </Button>
        )}
        <GuideLink chapter="reembolsos">Cómo funcionan las devoluciones</GuideLink>
      </Box>
    </Box>
  );
}

/** Preguntas frecuentes de «Conectar pagos». */
export function StripeFaq({ country }: { country: string }) {
  const fee = stripeFee(country);
  const items: FaqItem[] = [
    {
      q: '¿Cuánto cobra Stripe?',
      a: (
        <>
          No hay cuota fija: solo una comisión por cada pago{fee ? ` (${fee})` : ''}. Corelia no se queda nada (0 %).
          La tarifa exacta de tu país está en <Link href={STRIPE_PRICING_URL} target="_blank" rel="noopener">stripe.com/pricing</Link>.
        </>
      ),
    },
    {
      q: '¿Cuándo recibo el dinero?',
      a: 'Stripe lo transfiere solo a tu banco, normalmente en 2–7 días. El primer pago puede tardar algo más (hasta 7–14 días) mientras Stripe revisa tu cuenta.',
    },
    {
      q: '¿Puedo usar mi cuenta de Stripe de antes?',
      a: 'No hace falta. «Conectar pagos» te crea una cuenta de Stripe nueva, a tu nombre y enlazada a tu panel: así los cobros, los recibos y las devoluciones van solos. Si ya tenías otra cuenta, sigue siendo tuya y no se toca.',
    },
    {
      q: '¿Y si una clienta pide una devolución?',
      a: 'La haces desde el panel: al cancelar la clase eliges «Devolver el dinero». También puedes hacerlo desde tu Stripe. Le llega en 5–10 días. La comisión de Stripe de ese pago no se recupera.',
    },
    {
      q: '¿Qué es el modo prueba?',
      a: 'Una versión de práctica de Stripe: todo funciona igual, pero nadie paga de verdad. Paga con la tarjeta 4242 4242 4242 4242. Cuando quieras cobrar de verdad, pasa al modo real.',
    },
  ];
  return <Faq items={items} />;
}
