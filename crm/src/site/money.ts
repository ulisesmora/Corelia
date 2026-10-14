// Importes del panel en la moneda del estudio y con el formato de su país
// (configuración pública: `currency` y `country`).
//
//   money(29)                 → "29,00 €"   (estudio en España, EUR)
//   money(549)                → "$549.00"   (estudio en México, MXN)
//   money(15990)              → "$15.990"   (Chile, CLP: sin decimales)
//   formatMoney(29, 'EUR')    → "29,00 €"   (un pago antiguo, con SU moneda)
//
// Igual que la zona horaria (./timezone), main.tsx llama a setStudioMoney()
// antes de cargar las pantallas y SiteProvider lo repite al cambiar los
// ajustes (en refresh(), antes de volver a pintar: tras guardar la moneda
// nueva, las pantallas ya la usan).

export const DEFAULT_CURRENCY = 'EUR';
export const DEFAULT_COUNTRY = 'ES';

export let STUDIO_CURRENCY = DEFAULT_CURRENCY;
export let STUDIO_COUNTRY = DEFAULT_COUNTRY;
/** Precio de la clase suelta (Ajustes), en la moneda del estudio; 0 = sin poner. */
export let STUDIO_DROP_IN_PRICE = 0;

const ISO3 = /^[A-Z]{3}$/;
const ISO2 = /^[A-Z]{2}$/;

export function normalizeCurrency(c?: string | null): string {
  const code = String(c || '').trim().toUpperCase();
  return ISO3.test(code) ? code : DEFAULT_CURRENCY;
}

export function normalizeCountry(c?: string | null): string {
  const code = String(c || '').trim().toUpperCase();
  return ISO2.test(code) ? code : DEFAULT_COUNTRY;
}

/** Fija la moneda, el país y la clase suelta del estudio (configuración pública). */
export function setStudioMoney(currency?: string | null, country?: string | null, dropIn?: number | string | null): void {
  STUDIO_CURRENCY = normalizeCurrency(currency);
  STUDIO_COUNTRY = normalizeCountry(country);
  const n = Number(dropIn);
  STUDIO_DROP_IN_PRICE = Number.isFinite(n) && n > 0 ? n : 0;
}

/** El panel está en español: 'es-' + país del estudio (es-ES, es-MX…). */
export const moneyLocale = (country: string = STUDIO_COUNTRY) => `es-${normalizeCountry(country)}`;

/** Decimales de la moneda (EUR 2, CLP 0…). */
export function currencyDigits(currency: string = STUDIO_CURRENCY): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: normalizeCurrency(currency) })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export interface MoneyOptions {
  /** Número fijo (nunca más de los de la moneda) o 'auto' = sin decimales si es entero. */
  decimals?: number | 'auto';
  country?: string;
}

/** Importe en una moneda concreta (p. ej. la que se guardó en un pago antiguo). */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = STUDIO_CURRENCY,
  opts: MoneyOptions = {},
): string {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const code = normalizeCurrency(currency);
  const max = currencyDigits(code);
  const want = opts.decimals ?? max;
  const d = want === 'auto' ? (Number.isInteger(value) ? 0 : max) : Math.min(Math.max(0, want), max);
  try {
    return new Intl.NumberFormat(moneyLocale(opts.country), {
      style: 'currency', currency: code, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(value);
  } catch {
    return `${value.toFixed(d)} ${code}`;
  }
}

/** Importe en la moneda del estudio. */
export const money = (amount: number | string | null | undefined, opts: MoneyOptions = {}) =>
  formatMoney(amount, STUDIO_CURRENCY, opts);

/** Símbolo de la moneda ("€", "$", "S/"…), p. ej. para el final de un campo de precio. */
export function currencySymbol(currency: string = STUDIO_CURRENCY, country: string = STUDIO_COUNTRY): string {
  try {
    const part = new Intl.NumberFormat(moneyLocale(country), { style: 'currency', currency: normalizeCurrency(currency) })
      .formatToParts(0).find((p) => p.type === 'currency');
    return part?.value || normalizeCurrency(currency);
  } catch {
    return normalizeCurrency(currency);
  }
}
