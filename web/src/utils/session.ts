// Utilidades de sesión compartidas.
// Una sola lista de claves: evita logouts a medias (antes cada componente
// borraba un subconjunto distinto, o TODO el localStorage incluido el carrito).

export const SESSION_KEYS = [
  'accessToken',
  'refreshToken',
  'refresh',       // el login con Google guardaba el refresh con esta clave
  'iduser',
  'username',
  'sessionTimestamp',
] as const;

/** Borra SOLO las claves de sesión (no toca carrito, idioma ni storageVersion). */
export function clearSession(): void {
  try {
    SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* localStorage puede no estar disponible (SSR / privacidad) */
  }
}

/** true si la respuesta indica sesión inválida o caducada. */
export function isAuthExpired(status: number): boolean {
  return status === 401;
}
