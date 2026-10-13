// Única fuente de la URL del API. NO escribas URLs del backend a mano en ningún
// otro archivo: importa de aquí.
//
// Cómo funciona:
//  - En el NAVEGADOR todas las llamadas van a la ruta RELATIVA `/api/...`. Las
//    recibe el proxy de esta misma web (src/pages/api/[...path].ts), que las
//    reenvía al backend. Así no hay CORS ni URLs del backend en el JS público.
//  - En el SERVIDOR (frontmatter de .astro, endpoints .ts, SSR) se llama
//    directamente al backend: `${API_URL}/api/...`. API_URL es una variable de
//    entorno de ejecución (no de build), p. ej. `http://localhost:8000` o la
//    URL privada de Railway.
//
// (Importa lib/site solo dentro de funciones: no hay ciclo al cargar el módulo.)
//
// Qué usar:
//  - Componentes React (se ejecutan en el navegador): `API_ROOT` ('/api') o
//    `API_V1` ('/api/v1'). Si el componente también se renderiza en servidor y
//    hace fetch allí, usa `apiRoot()` / `apiUrl()`.
//  - Código de servidor: `serverApiRoot()` o `apiUrl('/v1/...')`.
//  - `apiUrl(path)` es isomórfico: detecta `typeof window` y elige la base.

import { getSiteClient } from './lib/site';

/** Base relativa del API para el navegador (pasa por el proxy). Sin barra final. */
export const API_ROOT = '/api';

/** Base relativa de la versión 1 del API para el navegador. Sin barra final. */
export const API_V1 = `${API_ROOT}/v1`;

/** URL del backend (solo servidor). Variable de entorno API_URL en tiempo de ejecución. */
export function backendOrigin(): string {
  // `globalThis.process` para que este archivo no rompa en el navegador (allí
  // no existe `process`) y para que Vite no sustituya el valor en el build.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  // process.env manda (producción, Docker); import.meta.env cubre el .env en `astro dev`
  const raw = env?.API_URL || (import.meta.env.API_URL as string | undefined) || 'http://localhost:8000';
  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
}

/** Raíz del API en el servidor: `${API_URL}/api`. Sin barra final. */
export function serverApiRoot(): string {
  return `${backendOrigin()}/api`;
}

const IS_BROWSER = typeof window !== 'undefined';

/** Raíz del API según dónde se ejecute el código ('/api' en el navegador). Sin barra final. */
export function apiRoot(): string {
  return IS_BROWSER ? API_ROOT : serverApiRoot();
}

/**
 * URL completa para una ruta del API, válida en navegador y servidor.
 *   apiUrl('/v1/plans/') → '/api/v1/plans/' (navegador)
 *                        → 'http://backend:8000/api/v1/plans/' (servidor)
 */
export function apiUrl(path: string): string {
  return `${apiRoot()}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Origen público de la web (canonical, hreflang, OG, sitemap, JSON-LD).
 * Orden: `site_url` de la config del estudio (dominio propio del panel: se
 * cambia sin redesplegar) → PUBLIC_SITE_URL / SITE_URL → http://localhost:4321.
 * En el servidor, la config ya debe estar cargada (`await getSiteConfig()`).
 */
export function siteOrigin(): string {
  const fromConfig = getSiteClient().site_url;
  if (fromConfig) return fromConfig;
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw =
    env?.PUBLIC_SITE_URL ||
    env?.SITE_URL ||
    (import.meta.env.PUBLIC_SITE_URL as string | undefined) ||
    (IS_BROWSER ? window.location.origin : '') ||
    'http://localhost:4321';
  return raw.replace(/\/+$/, '');
}
