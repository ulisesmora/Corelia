// /robots.txt — dinámico. Para bloquear la indexación (entornos de prueba)
// define NOINDEX=1 en el servidor.
import { origin } from '../seo/site';
import { getSiteConfig } from '../lib/site';

export const prerender = false;

// Zonas privadas o sin valor para buscadores (cuenta, pago, formularios con token)
const PRIVATE = [
  '/api/', '/dashboard', '/checkout', '/login', '/myCalendar', '/myPreferences', '/mySubscription',
  '/updatePreferences', '/recover-password', '/verify-account',
];

// Asistentes y buscadores de IA: se permiten explícitamente en producción
// (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, OAI-SearchBot…) para que
// puedan leer y recomendar el estudio.
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot',
  'CCBot', 'meta-externalagent',
];

export async function GET() {
  await getSiteConfig(); // el dominio (Sitemap:) sale de la config del estudio
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const noindex = !import.meta.env.PROD || env?.NOINDEX === '1' || env?.NOINDEX === 'true';
  const lines: string[] = [];
  if (noindex) {
    lines.push('User-agent: *', 'Disallow: /');
  } else {
    lines.push('User-agent: *', 'Allow: /', ...PRIVATE.map((p) => `Disallow: ${p}`), '');
    for (const bot of AI_BOTS) {
      lines.push(`User-agent: ${bot}`, 'Allow: /', ...PRIVATE.map((p) => `Disallow: ${p}`), '');
    }
  }
  lines.push(`Sitemap: ${origin()}/sitemap-index.xml`);
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': noindex ? 'no-store' : 'public, max-age=3600',
    },
  });
}
