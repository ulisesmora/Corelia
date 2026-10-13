// Las clientas que se dan de alta sin email (en el estudio, por teléfono…)
// reciben del backend una dirección interna en este dominio reservado, que
// nunca recibe correo. Aquí se reconoce en un solo sitio.
export const PLACEHOLDER_EMAIL_DOMAIN = 'sin-email.invalid';

/** true si la clienta no tiene un email real: vacío o del dominio interno. */
export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return true;
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
