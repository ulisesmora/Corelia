// Los 5 capítulos de «Cómo se cobra». Poco texto, con los datos reales del
// estudio (moneda, precios, plazo para cancelar, minutos para aceptar una
// plaza…): ver ./facts.ts y api/api/views_guide.py.
//
//   1 Dos formas de cobrar (resumen) · 2 Clientes online · 3 Clientes del
//   estudio · 4 Cancelaciones y devoluciones · 5 Lista de espera
import { Box, Button, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { METHODS_PATH } from '../setup/payments/methodsApi';
import type { GuideChapter } from './chapters';
import { creditsText, daysText, defaultOptions, methodsText, minutesText, periodText, price, type ChargingFacts } from './facts';
import TwoWorlds, { WORLD_PATHS } from './TwoWorlds';
import { Block, Choices, CancelWindow, Flow, Note, Options, Tiles, Value } from './visuals';

export interface ChapterProps {
  facts: ChargingFacts;
  /** Ir a otra pantalla del panel (cierra la guía) */
  go: (path: string) => void;
  /** Saltar a otro capítulo */
  open: (c: GuideChapter) => void;
}

const lead = { fontSize: '1rem', color: 'var(--studio-muted)', lineHeight: 1.5 } as const;

/** Dónde se cambian las formas de cobro (Ajustes → Cobros). */
const OPTIONS_PATH = '/ajustes?tab=pagos#formas-de-cobro';

// ── 1) Dos formas de cobrar ──────────────────────────────────────────────

export function OverviewChapter({ facts: f, go, open }: ChapterProps) {
  return (
    <>
      <Typography sx={lead}>Hay dos tipos de clientes. Cada uno paga a su manera.</Typography>
      <Box sx={{ mt: 2 }}>
        <TwoWorlds variant="full" facts={f} go={go} open={open} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
        <Button variant="outlined" size="small" onClick={() => go(OPTIONS_PATH)} startIcon={<StudioIcon name="settings" />} sx={{ minHeight: 44 }}>
          Cambiar formas de cobro
        </Button>
      </Box>
    </>
  );
}

// ── 2) Clientes online ───────────────────────────────────────────────────

export function OnlineChapter({ facts: f, go }: ChapterProps) {
  const pack = f.pack;
  const sub = f.subscription;
  const o = f.options || defaultOptions(f.payments.enabled);
  const notSold = 'Ahora no se vende en tu web.';
  const studioWho = o.pay_at_studio.guests && o.pay_at_studio.clients ? 'invitados y clientes con cuenta'
    : o.pay_at_studio.guests ? 'invitados (sin cuenta)' : o.pay_at_studio.clients ? 'clientes con cuenta' : '';
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={lead}>Tu cliente lo hace todo en tu web. Stripe cobra y el panel lo apunta.</Typography>
        <Value tone={o.card ? 'ok' : 'warn'}>{o.card ? 'Activado' : 'Sin activar'}</Value>
      </Box>
      <Box sx={{ mt: 2 }}>
        <Flow label="Cliente online, paso a paso" steps={[
          { icon: 'web', title: 'Reserva o compra en tu web', text: 'Una clase, un bono o una membresía.' },
          { icon: 'card', title: 'Paga con tarjeta', text: 'O con Apple Pay, Google Pay, Bizum… (las que actives).' },
          { icon: 'repeat', title: 'Todo se apunta solo', text: 'Sus créditos, el recibo por email y la renovación de cada mes.' },
          {
            icon: 'stats', title: 'Tú solo miras «Ventas»', text: 'El dinero llega a tu banco en unos 2–7 días.',
            action: { label: 'Ir a Ventas', onClick: () => go(WORLD_PATHS.sales) },
          },
        ]} />
      </Box>

      {!f.payments.enabled && (
        <Block title="Primero, activa los pagos online" icon="card" id="g-activate">
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-ink)' }}>
            Te guiamos paso a paso con Stripe. Son unos 10 minutos.
          </Typography>
          <Button variant="contained" size="small" onClick={() => go(WORLD_PATHS.payments)} startIcon={<StudioIcon name="card" />} sx={{ mt: 1, minHeight: 44 }}>
            Activar pagos online
          </Button>
        </Block>
      )}

      {f.payments.enabled && (
        <Block title="¿Bizum, Apple Pay, domiciliación…?" icon="card" id="g-methods">
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-ink)' }}>
            Elige con qué pueden pagar en tu web: tarjeta, Apple Pay, Google Pay, Bizum y los métodos de tu país.
          </Typography>
          <Button variant="outlined" size="small" onClick={() => go(METHODS_PATH)} startIcon={<StudioIcon name="card" />} sx={{ mt: 1, minHeight: 44 }}>
            Formas de pago en tu web
          </Button>
        </Block>
      )}

      <Block title="Lo que pueden comprar" icon="plans" id="g-products">
        <Tiles items={[
          {
            icon: 'ticket', tint: 'reformer', title: 'Clase suelta', text: o.drop_in_online ? 'Paga solo esa clase al reservar.' : notSold,
            value: <Value>{price(f, f.drop_in_price)}</Value>,
          },
          {
            icon: 'plans', tint: 'mat', title: 'Bono', text: o.packs_online ? 'Varias clases de una vez.' : notSold,
            value: <Value>{pack ? `${pack.credits} clases · ${price(f, pack.price)}` : 'Ej.: 10 clases'}</Value>,
          },
          {
            icon: 'subscriptions', tint: 'barre', title: 'Membresía', text: o.memberships_online ? 'Se cobra sola cada mes.' : notSold,
            value: <Value>{sub ? `${price(f, sub.price)} ${periodText(sub.interval, sub.interval_count)}` : 'Ej.: 8 clases al mes'}</Value>,
          },
        ]} />
      </Block>

      <Block title="Créditos" icon="credits" id="g-credit">
        <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Value tone="n"><StudioIcon name="credits" sx={{ fontSize: 16 }} />1 crédito</Value>
          <Typography sx={{ fontWeight: 700, color: 'var(--studio-muted)' }}>=</Typography>
          <Value tone="n"><StudioIcon name="schedule" sx={{ fontSize: 16 }} />1 clase</Value>
        </Box>
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-ink)' }}>
          Lo que compra se guarda como créditos. Al reservar, se descuentan solos.
        </Typography>
        {f.credits_vary && f.class_types.length > 0 && (
          <Box component="ul" aria-label="Créditos por clase" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {f.class_types.map((c) => (
              <Box component="li" key={c.id}><Value tone="n">{c.title} · {creditsText(c.credits)}</Value></Box>
            ))}
          </Box>
        )}
        <Note icon="clock">
          {pack?.expire_days
            ? <>Los bonos caducan: «{pack.name}» vale <Value>{daysText(pack.expire_days)}</Value>. Lo que no use, se pierde.</>
            : 'Los bonos caducan al tiempo que elijas. Lo que no use, se pierde.'}
        </Note>
      </Block>

      {studioWho && (
        <Block title="¿Reserva online y paga al llegar?" icon="payments" id="g-payatstudio">
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-ink)' }}>
            Lo tienes activado para {studioWho}. Salen en Ventas → «Quién me debe» hasta que las marques como cobradas.
          </Typography>
        </Block>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
        <Button variant="outlined" size="small" onClick={() => go(OPTIONS_PATH)} startIcon={<StudioIcon name="settings" />} sx={{ minHeight: 44 }}>
          Cambiar formas de cobro
        </Button>
        <Button size="small" onClick={() => go('/clases-y-precios?tab=precios')} sx={{ minHeight: 44 }}>
          Cambiar precios
        </Button>
      </Box>
    </>
  );
}

// ── 3) Clientes del estudio ──────────────────────────────────────────────

export function InStudioChapter({ facts: f, go }: ChapterProps) {
  const pack = f.pack;
  const methods = methodsText(f);
  return (
    <>
      <Typography sx={lead}>Te paga en mano y tú lo apuntas. Así:</Typography>
      <Box sx={{ mt: 2 }}>
        <Flow label="Cliente del estudio, paso a paso" steps={[
          {
            icon: 'payments', title: 'Te paga en mano',
            text: pack
              ? <>{methods ? `En ${methods}. ` : 'Efectivo, Bizum o datáfono. '}Por ejemplo, «{pack.name}» por <Value>{price(f, pack.price)}</Value>.</>
              : `${methods ? `En ${methods}.` : 'Efectivo, Bizum o datáfono.'} Por ejemplo, un bono de 10 clases.`,
          },
          {
            icon: 'addClient', title: 'Dale de alta', text: 'Su nombre y su móvil. Un minuto.',
            action: { label: 'Nuevo cliente del estudio', onClick: () => go(WORLD_PATHS.newStudioClient) },
          },
          {
            icon: 'credits', title: 'Añádele sus créditos', text: 'Los que ha pagado. Queda apuntado con el motivo.',
            action: { label: 'Ir a Créditos', onClick: () => go(WORLD_PATHS.credits) },
          },
          {
            icon: 'booked', title: 'Resérvale o dale una clase fija', text: 'Reserva en la web con sus créditos, o le guardas tú la plaza.',
          },
          {
            icon: 'repeat', title: 'Cada mes: corte de créditos', text: 'Al empezar el mes le cobras otra vez y le pones los créditos nuevos. Lo que no usó, caduca.',
          },
        ]} />
      </Box>

      <Block title="¿Qué uso?" icon="help" id="g-which">
        <Choices label="Qué herramienta usar" rows={[
          { icon: 'credits', when: 'Viene de vez en cuando', use: 'Añadir créditos' },
          {
            icon: 'fixedClasses', when: 'Viene siempre el mismo día y hora', use: 'Clase fija',
            hint: f.options?.client_fixed_classes
              ? 'Su plaza queda guardada cada semana. También puede elegirlas en la web.'
              : 'Le guardas la plaza cada semana. Lo gestionas tú; la web no lo explica.',
            action: { label: 'Ir a Clases fijas', onClick: () => go('/assign-classes') },
          },
          {
            icon: 'chat', when: 'Te pide una clase por WhatsApp', use: 'Haz tú la reserva',
            hint: 'Calendario → toca la clase → «Añadir».',
            action: { label: 'Ir al calendario', onClick: () => go('/calendar') },
          },
        ]} />
      </Block>

      <Block title="Al hacer tú la reserva" icon="addClient" id="g-add">
        <Options label="Al apuntar a un cliente" items={[
          { icon: 'credits', title: 'Descontar de sus créditos', text: 'Como si reservara por su cuenta.', chip: 'Lo normal' },
          { icon: 'celebrate', title: 'Gratis', text: 'No gasta nada. Si luego cancela, no se le devuelve.' },
        ]} />
        <Note>Las semanas que guardas con «Clase fija» no gastan créditos: cóbralas aparte (en mano o con membresía).</Note>
      </Block>

      <Block title="¿Te reserva en la web y paga al llegar?" icon="web" id="g-arrive">
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--studio-ink)' }}>
          Activa «Pagar en el estudio» en Formas de cobro. Esas reservas salen en Ventas → «Quién me debe».
        </Typography>
        <Button size="small" onClick={() => go(OPTIONS_PATH)} sx={{ mt: 0.5, minHeight: 44, px: 1, ml: -1 }}>
          Cambiar formas de cobro
        </Button>
      </Block>
    </>
  );
}

// ── 4) Cancelaciones y devoluciones ──────────────────────────────────────

export function RefundsChapter({ facts: f }: ChapterProps) {
  const h = f.cancel_min_hours;
  return (
    <>
      <Typography sx={lead}>Lo que se devuelve depende de quién cancela y cuándo.</Typography>

      <Block title="Si cancela tu cliente" icon="clients" id="g-client">
        <CancelWindow hours={h} />
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box component="li" sx={row}>
            <Value tone="ok">Hasta {h} h antes</Value>
            <span>Cancela en la web y recupera el crédito.</span>
          </Box>
          <Box component="li" sx={row}>
            <Value tone="warn">Últimas {h} h</Value>
            <span>Ya no puede cancelar. Si te escribe, tú decides: quitarle la reserva devolviendo la clase o sin devolver.</span>
          </Box>
        </Box>
        <Note icon="card">Si pagó con tarjeta sin cuenta, no puede cancelar por su cuenta: si quitas tú su reserva, le devolvemos el dinero.</Note>
      </Block>

      <Block title="Si cancelas tú una clase" icon="studio" id="g-studio">
        <Options label="Qué se devuelve al cancelar una clase" items={[
          { icon: 'undo', title: 'Devolver la clase a su bono', text: 'Los créditos vuelven al momento.', chip: 'Recomendado' },
          { icon: 'card', title: 'Devolver el dinero', text: 'A quien pagó esa clase con tarjeta.' },
          { icon: 'close', title: 'No devolver nada' },
        ]} />
        <Note icon="mail">Les avisamos por email y en la app.</Note>
      </Block>

      <Block title="Créditos o tarjeta" icon="payments" id="g-speed">
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
          <Box sx={mini}><StudioIcon name="credits" aria-hidden /><b>Créditos</b><span>Vuelven al bono al instante.</span></Box>
          <Box sx={mini}><StudioIcon name="card" aria-hidden /><b>Tarjeta</b><span>El dinero tarda unos días en verse en su banco.</span></Box>
        </Box>
        <Note>El plazo de {h} horas lo fija quien instaló tu panel.</Note>
      </Block>
    </>
  );
}

// ── 5) Lista de espera ───────────────────────────────────────────────────

export function WaitlistChapter({ facts: f, go }: ChapterProps) {
  const wl = f.waitlist;
  const claim = minutesText(wl.claim_minutes);
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={lead}>Cuando una clase se llena, no pierdes a nadie.</Typography>
        <Value tone={wl.enabled ? 'ok' : 'n'}>{wl.enabled ? 'Activada' : 'Desactivada'}</Value>
      </Box>
      <Box sx={{ mt: 2 }}>
        <Flow label="Lista de espera, paso a paso" steps={[
          { icon: 'hourglass', title: 'La clase se llena', text: 'El resto puede apuntarse a la lista.' },
          { icon: 'undo', title: 'Alguien cancela', text: 'Queda una plaza libre.' },
          wl.auto_offer
            ? { icon: 'mail', title: 'Quien va primero recibe un aviso', text: <>Por email y en la app. Tiene <Value>{claim}</Value> para aceptarla. Mientras, la plaza es suya.</> }
            : { icon: 'mail', title: 'Tú das la plaza', text: 'La oferta automática está apagada: elige a quién en la clase.' },
          { icon: 'next', title: '¿No contesta a tiempo?', text: 'La plaza pasa a quien va después en la lista.' },
        ]} />
      </Box>
      <Note icon="credits">Al aceptar la plaza, se le descuenta de su bono.</Note>

      <Block title="Tú mandas" icon="settings" id="g-wl-you">
        <Choices label="Lo que puedes hacer tú" rows={[
          { icon: 'booked', when: 'Quieres darle la plaza a alguien', use: '«Dar plaza»', hint: 'En la clase, dentro del calendario.' },
          {
            icon: 'settings', when: 'Encenderla, apagarla o cambiar el tiempo', use: 'Ajustes de la lista',
            action: { label: 'Cambiar ajustes', onClick: () => go('/configuracion?ajuste=espera') },
          },
        ]} />
      </Block>
    </>
  );
}

const row = {
  display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.88rem', color: 'var(--studio-ink)', lineHeight: 1.5,
} as const;

const mini = {
  display: 'flex', flexDirection: 'column', gap: 0.25, p: 1.5, borderRadius: 'var(--studio-radius-md)', background: 'var(--studio-surf2)',
  color: 'var(--studio-ink)', fontSize: '0.86rem', '& svg': { color: 'var(--studio-primary-text)', mb: 0.25 }, '& span': { color: 'var(--studio-muted)' },
} as const;
