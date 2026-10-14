// Importes en la moneda del estudio con el formato de SU país.
//
// El locale de Intl sale del idioma de la página + el país del estudio:
//   es + ES → es-ES  "29,00 €"      en + US → en-US  "$29.00"
//   es + MX → es-MX  "$549.00"      en + MX → en-MX  "MX$549.00"
//   es + CL → es-CL  "$15.990"      (CLP no tiene decimales)
// Si el navegador no conoce la combinación, Intl cae al idioma solo.

const ISO2 = /^[A-Z]{2}$/;
const ISO3 = /^[A-Z]{3}$/;

/** 'es' + 'MX' → 'es-MX'. Sin país válido, solo el idioma ('es-ES' para es). */
export function moneyLocale(lang: string = 'es', country?: string | null): string {
  const l = lang === 'en' ? 'en' : 'es';
  const c = String(country || '').toUpperCase();
  if (ISO2.test(c)) return `${l}-${c}`;
  return l === 'en' ? 'en-GB' : 'es-ES';
}

const digitsCache = new Map<string, number>();
/** Decimales de la moneda según ISO 4217 (EUR 2, CLP 0…). */
export function currencyDigits(currency: string): number {
  const code = String(currency || 'EUR').toUpperCase();
  let d = digitsCache.get(code);
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    digitsCache.set(code, d);
  }
  return d;
}

export interface MoneyOptions {
  /** País del estudio (ISO-2): decide separadores y posición del símbolo. */
  country?: string | null;
  /**
   * Decimales: número fijo (nunca más de los que tiene la moneda) o 'auto'
   * (sin decimales si el importe es entero). Por defecto, los de la moneda.
   */
  decimals?: number | 'auto';
}

/**
 * Importe formateado: formatMoney(29, 'EUR', 'es', { country: 'ES' }) → "29,00 €".
 * Nunca lanza: con una moneda desconocida devuelve "29.00 XXX".
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = 'EUR',
  lang: string = 'es',
  opts: MoneyOptions = {},
): string {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const code = ISO3.test(String(currency || '').toUpperCase()) ? String(currency).toUpperCase() : 'EUR';
  const max = currencyDigits(code);
  const want = opts.decimals ?? max;
  const d = want === 'auto' ? (Number.isInteger(value) ? 0 : max) : Math.min(Math.max(0, want), max);
  try {
    return new Intl.NumberFormat(moneyLocale(lang, opts.country), {
      style: 'currency', currency: code, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(value);
  } catch {
    return `${value.toFixed(d)} ${code}`;
  }
}

/**
 * El importe en trozos para pintarlo con el número grande y el símbolo
 * pequeño, respetando el orden del país: es-ES → {before:'', number:'60',
 * after:' €'} · en-US → {before:'$', number:'60', after:''} · es-MX con MXN →
 * {before:'$', number:'1,549', after:''}.
 */
export function formatMoneyParts(
  amount: number | string | null | undefined,
  currency: string = 'EUR',
  lang: string = 'es',
  opts: MoneyOptions = {},
): { before: string; number: string; after: string } {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const code = String(currency || 'EUR').toUpperCase();
  const max = currencyDigits(code);
  const want = opts.decimals ?? 'auto';
  const d = want === 'auto' ? (Number.isInteger(value) ? 0 : max) : Math.min(Math.max(0, want), max);
  try {
    const parts = new Intl.NumberFormat(moneyLocale(lang, opts.country), {
      style: 'currency', currency: code, minimumFractionDigits: d, maximumFractionDigits: d,
    }).formatToParts(value);
    const numeric = new Set(['minusSign', 'plusSign', 'integer', 'group', 'decimal', 'fraction']);
    const first = parts.findIndex((p) => numeric.has(p.type));
    let last = -1;
    parts.forEach((p, i) => { if (numeric.has(p.type)) last = i; });
    const join = (xs: Intl.NumberFormatPart[]) => xs.map((p) => p.value).join('');
    return { before: join(parts.slice(0, first)), number: join(parts.slice(first, last + 1)), after: join(parts.slice(last + 1)) };
  } catch {
    return { before: '', number: value.toFixed(d), after: ` ${code}` };
  }
}

/** Símbolo de la moneda tal y como se ve en ese idioma y país ("€", "$", "MX$", "S/"…). */
export function currencySymbol(currency: string = 'EUR', lang: string = 'es', country?: string | null): string {
  const code = String(currency || 'EUR').toUpperCase();
  try {
    const part = new Intl.NumberFormat(moneyLocale(lang, country), { style: 'currency', currency: code })
      .formatToParts(0).find((p) => p.type === 'currency');
    return part?.value || code;
  } catch {
    return code;
  }
}

/** Nombre de la moneda en plural para textos legales ("euros", "pesos mexicanos", "US dollars"). */
export function currencyName(currency: string = 'EUR', lang: string = 'es'): string {
  const code = String(currency || 'EUR').toUpperCase();
  const l = lang === 'en' ? 'en' : 'es';
  try {
    // Intl da el plural correcto al formatear «2 <moneda>»: se quita el número
    const text = new Intl.NumberFormat(l, { style: 'currency', currency: code, currencyDisplay: 'name', minimumFractionDigits: 0, maximumFractionDigits: 0 })
      .format(2).replace(/^[\d\s\u00a0.,]+/, '').trim();
    if (text) return text;
  } catch { /* moneda desconocida */ }
  try {
    return new Intl.DisplayNames([l], { type: 'currency' }).of(code) || code;
  } catch {
    return code;
  }
}
