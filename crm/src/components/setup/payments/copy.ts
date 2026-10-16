// Textos de «Pagos online» (Ajustes → Cobros): qué significa cada estado de
// la cuenta de Stripe, qué hacer, qué pide Stripe (requirements_due) en
// español llano y lo que cobra Stripe en cada país. Ver api/utils/payments.py
// (payments_status) y docs/STRIPE_CONNECT.md.
import type { ConnectState } from '../api';

// ── Estados (payments_status().state) ──────────────────────────────────────

export interface StateCopy {
  /** Etiqueta corta (chip) */
  label: string;
  tone: 'n' | 'p' | 'ok' | 'warn' | 'bad';
  /** Qué pasa, en una frase */
  what: string;
  /** Qué tienes que hacer ahora, en una frase */
  next: string;
  /** Paso del asistente (0 Prepara · 1 Conecta · 2 Stripe lo revisa · 3 ¡Listo!) */
  step: number;
}

export const STATE_COPY: Record<ConnectState, StateCopy> = {
  none: {
    label: 'Sin conectar', tone: 'n', step: 0,
    what: 'Aún no cobras con tarjeta en tu web.',
    next: 'Ten a mano tus datos y pulsa «Conectar pagos». Stripe te guía; son unos 10 minutos.',
  },
  onboarding: {
    label: 'Alta a medias', tone: 'warn', step: 1,
    what: 'Tu cuenta de Stripe ya existe, pero no terminaste de rellenar tus datos.',
    next: 'Pulsa «Continuar en Stripe»: se abre donde lo dejaste.',
  },
  pending: {
    label: 'Stripe lo revisa', tone: 'p', step: 2,
    what: 'Ya enviaste tus datos y Stripe los está comprobando. Es normal.',
    next: 'No tienes que hacer nada. Suele tardar unos minutos (a veces 1 o 2 días laborables). Lo comprobamos solos.',
  },
  restricted: {
    label: 'Faltan datos', tone: 'warn', step: 2,
    what: 'Stripe necesita algún dato más antes de dejarte cobrar (o de enviarte el dinero).',
    next: 'Pulsa «Completar datos en Stripe» y añade lo que falta (abajo te decimos qué).',
  },
  active: {
    label: 'Cobrando', tone: 'ok', step: 3,
    what: 'Tu web ya cobra con tarjeta y el dinero llega a tu banco.',
    next: 'Haz un pago de prueba para verlo funcionar.',
  },
  mismatch: {
    label: 'Revisar', tone: 'bad', step: 1,
    what: 'Tu cuenta conectada es de otro modo de Stripe (prueba o real) del que usa ahora tu panel, así que no puede cobrar.',
    next: 'Pulsa «Desconectar» y vuelve a «Conectar pagos». Tu cuenta antigua sigue siendo tuya.',
  },
};

// ── Lo que pide Stripe (requirements.currently_due / past_due) ─────────────

/**
 * Clave de Stripe → qué es, en español llano. Se busca la clave completa y,
 * si no está, por su final (los datos de una persona llegan como
 * `individual.…`, `representative.…` o `person_XXXX.…`).
 */
const FIELD_TEXT: [RegExp, string][] = [
  [/verification\.additional_document$/, 'Un justificante de tu dirección (recibo de luz o agua, extracto del banco…)'],
  [/verification\.document$/, 'Foto de tu DNI, NIE o pasaporte, por las dos caras'],
  [/^external_account$/, 'Tu cuenta del banco (IBAN) para recibir el dinero'],
  [/^business_profile\.url$/, 'La dirección de tu web'],
  [/^business_profile\.mcc$/, 'A qué se dedica tu negocio (actividad)'],
  [/^business_profile\.product_description$/, 'Una frase sobre lo que vendes'],
  [/^business_profile\.support_(phone|email|address.*)$/, 'Un teléfono o email de atención a clientas'],
  [/^business_profile\.name$/, 'El nombre de tu negocio'],
  [/^business_type$/, 'Si eres autónoma o empresa'],
  [/^tos_acceptance\./, 'Aceptar las condiciones de Stripe'],
  [/^settings\.payments\.statement_descriptor$/, 'El nombre que verán tus clientas en su extracto del banco'],
  [/^settings\.card_payments\.statement_descriptor_prefix$/, 'El nombre que verán tus clientas en su extracto del banco'],
  [/^company\.verification\.document$/, 'Un documento de la empresa (escrituras o certificado del registro)'],
  [/^company\.tax_id$/, 'El NIF/CIF de la empresa'],
  [/^company\.name$/, 'El nombre legal de la empresa'],
  [/^company\.address/, 'La dirección de la empresa'],
  [/^company\.phone$/, 'El teléfono de la empresa'],
  [/^company\.(owners|directors|executives)_provided$/, 'Quiénes son los socios y administradores'],
  [/^company\./, 'Algún dato de la empresa'],
  [/^(owners|directors|executives)\./, 'Datos de los socios o administradores'],
  [/\.id_number$/, 'Tu número de DNI o NIE'],
  [/\.ssn_last_4$/, 'Tu número de identificación fiscal'],
  [/\.dob\./, 'Tu fecha de nacimiento'],
  [/\.address\./, 'Tu dirección'],
  [/\.(first_name|last_name)$/, 'Tu nombre y apellidos'],
  [/\.email$/, 'Tu email'],
  [/\.phone$/, 'Tu teléfono'],
  [/\.political_exposure$/, 'Si tienes un cargo público (casi siempre: «No»)'],
  [/\.relationship\./, 'Tu cargo en el negocio'],
  [/\.nationality$/, 'Tu nacionalidad'],
];

/** Quién: la persona responsable de una empresa (no la autónoma). */
const IS_REPRESENTATIVE = /^(representative|person_[^.]+)\./;

export interface Requirement {
  key: string;
  text: string;
  /** Sin traducción conocida: se enseña la clave tal cual */
  unknown?: boolean;
}

/** Traduce la lista de Stripe, sin repetidos y en un orden fijo (el de FIELD_TEXT). */
export function translateRequirements(keys: string[]): Requirement[] {
  const out: (Requirement & { order: number })[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const order = FIELD_TEXT.findIndex(([re]) => re.test(key));
    if (order < 0) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, text: 'Otro dato que pide Stripe', unknown: true, order: FIELD_TEXT.length });
      continue;
    }
    let text = FIELD_TEXT[order][1];
    if (IS_REPRESENTATIVE.test(key)) {
      // Datos de la persona responsable de una empresa, no de la autónoma
      text = text.replace(/^Tu /, '').replace(/^Foto de tu /, 'Foto del ');
      text = `${text.charAt(0).toUpperCase()}${text.slice(1)} (de la persona responsable)`;
    }
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ key, text, order });
  }
  return out.sort((a, b) => a.order - b.order).map((r) => ({ key: r.key, text: r.text, unknown: r.unknown }));
}

// ── Lo que cobra Stripe ────────────────────────────────────────────────────

const EEA = ['ES', 'PT', 'FR', 'DE', 'IT', 'NL', 'BE', 'AT', 'LU', 'FI', 'GR', 'IE'];

/**
 * Tarifa estándar orientativa de Stripe por pago con una tarjeta del propio
 * país o zona (puede cambiar; la exacta, en stripe.com/pricing). '' si no la
 * conocemos para ese país.
 */
export function stripeFee(country: string): string {
  const c = (country || '').toUpperCase();
  if (EEA.includes(c)) return '1,5 % + 0,25 € por pago con tarjeta europea';
  if (c === 'GB') return '1,5 % + 0,20 £ por pago con tarjeta del Reino Unido';
  if (c === 'US') return '2,9 % + 0,30 $ por pago';
  if (c === 'CA') return '2,9 % + 0,30 $ CA por pago';
  if (c === 'MX') return '3,6 % + 3 MXN (más IVA) por pago';
  if (c === 'BR') return '3,99 % + 0,39 R$ por pago';
  return '';
}

export const STRIPE_PRICING_URL = 'https://stripe.com/es/pricing';

/** Ej. de cuánto te queda de un pago de 50 € (solo zona euro). */
export function feeExample(country: string): string {
  if (!EEA.includes((country || '').toUpperCase())) return '';
  // 50 € → 1,5 % = 0,75 € + 0,25 € = 1 € de comisión
  return 'Ej.: de un bono de 50 €, Stripe se queda 1 € y te llegan 49 €.';
}

/**
 * Nombre para el extracto del banco: el del estudio, en mayúsculas, sin
 * acentos y de 5 a 22 letras (lo que admite Stripe).
 */
export function descriptorFrom(name: string): string {
  const s = (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 22).trim();
  return s.length >= 5 ? s : 'TU ESTUDIO';
}
