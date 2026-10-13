// URL base del API (con barra final, el código concatena 'v1/...').
// En producción el panel lo sirve el propio backend en el mismo dominio, así
// que basta la ruta relativa '/api/' (sin CORS). En desarrollo el proxy de
// Vite reenvía /api al backend local; VITE_API_URL permite apuntar a otro sitio
// (p. ej. http://localhost:8000/api/).
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || '/api/';
