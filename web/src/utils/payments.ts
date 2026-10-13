// Pagos online (Stripe) opcionales. Si el estudio no ha conectado Stripe
// (config → payments_enabled = false), la web no ofrece pago con tarjeta: los
// bonos se compran en el estudio y la reserva con créditos sigue funcionando.
import type { Stripe } from '@stripe/stripe-js';
import { getSiteClient } from '../lib/site';

/** ¿Están activos los pagos online con tarjeta? */
export function paymentsEnabled(): boolean {
  const site = getSiteClient();
  return site.payments_enabled && !!site.stripe_publishable_key;
}

let stripePromise: Promise<Stripe | null> | null = null;

/** Stripe.js con la clave publicable del estudio (se carga una sola vez). */
export function getStripe(): Promise<Stripe | null> {
  const key = getSiteClient().stripe_publishable_key;
  if (!key) return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = import('@stripe/stripe-js').then(({ loadStripe }) => loadStripe(key));
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
