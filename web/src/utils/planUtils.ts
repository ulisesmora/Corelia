import { trStrict } from './localized';

/**
 * planUtils.ts — Shared helpers for subscription period logic
 */

export type PeriodKey = 'monthly' | 'bimonthly' | 'quarterly' | 'biannual' | 'annual';

/**
 * Maps credits_expire_days from backend to a canonical period key.
 * ≤31d → monthly, ≤65d → bimonthly, ≤92d → quarterly, ≤184d → biannual, else → annual
 */
export function getPeriodKey(days: number | null): PeriodKey {
  if (!days || days <= 31) return 'monthly';
  if (days <= 65) return 'bimonthly';   // 60 days = every 2 months
  if (days <= 92) return 'quarterly';   // 90 days = every 3 months
  if (days <= 184) return 'biannual';   // 180 days = every 6 months
  return 'annual';                       // 365 days = annual
}

/**
 * Nombre visible de un plan en el idioma actual. La API manda los nombres en
 * español ("Paquete 5 creditos") y en `name_en` la versión inglesa
 * ("5-credit pack"); si falta, se prueba `translations` y, para los bonos en
 * inglés, generamos uno.
 */
export function planDisplayName(
  p: {
    name: string; type?: string; credits?: number;
    name_en?: string | null;
    translations?: Record<string, { name?: string } | undefined> | null;
  },
  lang: string,
): string {
  const tr = trStrict(p, 'name', lang);
  if (lang === 'en' && tr) return tr;
  if (lang === 'en' && p.type === 'pack' && p.credits && /^(paquete|bono|un\s+cr[eé]dito)/i.test(p.name.trim())) {
    return p.credits === 1 ? 'Single credit' : `${p.credits}-credit pack`;
  }
  return p.name;
}
