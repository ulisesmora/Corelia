// /robots.txt — dinámico. Bloquea la indexación (Disallow: /) mientras el
// estudio no haya publicado su web (setup_completed: «Publicar mi web» en la
// guía de puesta en marcha del panel, que exige los pasos mínimos) o si el
// servidor tiene NOINDEX=1 (entornos de prueba).
import { envNoindex, origin } from '../seo/site';
import { getSiteConfig, isFallbackSite } from '../lib/site';

export const prerender = false;

// Zonas privadas o sin valor para buscadores (cuenta, pago, formularios con token)
const PRIVATE = [
  '/api/', '/dashboard', '/checkout', '/login', '/myCalendar', '/myPreferences', '/mySubscription',
  '/updatePreferences', '/recover-password', '/verify-account', '/lista-espera', '/en/waitlist',
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
  const site = await getSiteConfig(); // el dominio (Sitemap:) sale de la config del estudio
  // Si el backend no responde (config por defecto) no se decide nada por
  // setup_completed: un corte momentáneo no debe bloquear a los buscadores.
  const fallback = isFallbackSite(site);
  const unfinished = !fallback && !site.setup_completed;
  const noindex = !import.meta.env.PROD || envNoindex() || unfinished;
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
      'Cache-Control': noindex || fallback ? 'no-store' : 'public, max-age=3600',
    },
  });
}
