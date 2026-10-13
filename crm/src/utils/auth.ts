/** Cabecera de sesión del CRM (token de admin guardado en localStorage 'user'). */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  try {
    const raw = localStorage.getItem('user');
    const token = raw ? JSON.parse(raw).access : '';
    return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
  } catch {
    return { ...extra };
  }
}
