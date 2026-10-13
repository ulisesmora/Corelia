// Zona horaria del estudio (la de la configuración pública, `timezone`).
//
// Es un `let` exportado a propósito: los módulos que lo importan ven siempre el
// valor actual (enlace vivo de los módulos ES). main.tsx descarga la
// configuración y llama a setStudioTz() ANTES de cargar las pantallas, así que
// también los formateadores de fecha creados al cargar cada módulo usan la zona
// correcta. Si se cambia la zona en los ajustes, los formateadores ya creados
// no se enteran hasta recargar la página.
export const DEFAULT_STUDIO_TZ = 'Europe/Madrid';

export let STUDIO_TZ = DEFAULT_STUDIO_TZ;

/** Fija la zona horaria del estudio si es válida para el navegador. */
export function setStudioTz(tz?: string | null): void {
  if (!tz) return;
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: tz });
    STUDIO_TZ = tz;
  } catch {
    // Zona desconocida: se queda la anterior
  }
}
