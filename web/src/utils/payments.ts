// Pagos online (Stripe) opcionales. Si el estudio no ha conectado Stripe
// (config → payments_enabled = false), la web no ofrece pago con tarjeta: los
// bonos se compran en el estudio y la reserva con créditos sigue funcionando.
//
// «Formas de cobro» (Ajustes → Cobros del panel): qué se ofrece al reservar y
// al comprar (tarjeta, pagar en el estudio, reservar sin cuenta, qué se vende
// online…). Ver lib/site.ts → PaymentOptions.
import type { Stripe } from '@stripe/stripe-js';
import { getSiteClient, type PaymentOptions, type StudioPayMethod } from '../lib/site';

/** ¿Se ofrece el pago con tarjeta en la web? */
export function paymentsEnabled(): boolean {
  const site = getSiteClient();
  return site.payments_enabled && !!site.stripe_publishable_key && site.payment_options.card;
}

/** «Formas de cobro» efectivas (la tarjeta solo si Stripe.js puede cargarse). */
export function paymentOptions(): PaymentOptions {
  const o = getSiteClient().payment_options;
  if (paymentsEnabled()) return o;
  return { ...o, card: false, drop_in_online: false, packs_online: false, memberships_online: false };
}

/** ¿Las clientas eligen sus clases fijas en la web? (si no, solo el estudio) */
export function clientFixedClasses(): boolean {
  return getSiteClient().payment_options.client_fixed_classes === true;
}

const METHOD_LABELS: Record<'es' | 'en', Record<StudioPayMethod, string>> = {
  es: { cash: 'efectivo', bizum: 'Bizum', card: 'tarjeta', transfer: 'transferencia' },
  en: { cash: 'cash', bizum: 'Bizum', card: 'card', transfer: 'bank transfer' },
};

/** «efectivo, Bizum o tarjeta» / «cash, Bizum or card» ('' si el estudio no lo ha dicho). */
export function studioMethodsText(lang: string): string {
  const L = lang === 'en' ? 'en' : 'es';
  const words = getSiteClient().payment_options.studio_methods.map((m) => METHOD_LABELS[L][m]);
  if (words.length <= 1) return words[0] || '';
  return `${words.slice(0, -1).join(', ')} ${L === 'en' ? 'or' : 'o'} ${words[words.length - 1]}`;
}

/** Nota del estudio para quien paga allí («Paga al llegar, 5 min antes»). */
export function studioPayNote(lang: string): string {
  const o = getSiteClient().payment_options;
  return (lang === 'en' && o.studio_note_en) || o.studio_note || '';
}

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Stripe.js con la clave publicable del estudio (se carga una sola vez).
 * Con «Conectar pagos» la clave es la de la plataforma y el cobro va a la
 * cuenta del estudio (`stripe_account`, cargos directos).
 */
export function getStripe(): Promise<Stripe | null> {
  const { stripe_publishable_key: key, stripe_account: account } = getSiteClient();
  if (!key) return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = import('@stripe/stripe-js').then(({ loadStripe }) =>
      loadStripe(key, account ? { stripeAccount: account } : undefined));
    stripePromise.catch(() => { stripePromise = null; }); // permitir reintento
  }
  return stripePromise;
}

/**
 * ¿La respuesta del backend dice que los pagos están desactivados?
 * (503 con `code: 'payments_disabled'`). No consume el cuerpo original.
 */
export async function isPaymentsDisabled(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    const data = await res.clone().json();
    return data?.code === 'payments_disabled';
  } catch {
    return false;
  }
}
