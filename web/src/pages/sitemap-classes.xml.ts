// Sitemap dinámico de las fichas de clase (es + en con hreflang) con el dominio
// de la config del estudio (o PUBLIC_SITE_URL). Se genera al
// pedirlo, así que una clase nueva del CRM aparece sin redesplegar.
import { SSR_CACHE, classPath, origin } from '../seo/site';
import { getSiteConfig } from '../lib/site';
import { getClassTypes, getSchedules, offeredClasses } from '../seo/catalog';

export const prerender = false;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET() {
  const [classes, schedules] = await Promise.all([getClassTypes(), getSchedules(), getSiteConfig()]);
  const ORIGIN = origin();
  const items = offeredClasses(classes, schedules);
  const urls: string[] = [];
  const pair = (es: string, en: string, lastmod?: string, priority = '0.8') => {
    for (const loc of [es, en]) {
      urls.push(`  <url>
    <loc>${esc(ORIGIN + loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="es" href="${esc(ORIGIN + es)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${esc(ORIGIN + en)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(ORIGIN + es)}"/>
  </url>`);
    }
  };
  pair('/classes', '/en/classes', undefined, '0.9');
  for (const { cls } of items) {
    pair(classPath(cls.slug, 'es'), classPath(cls.slug, 'en'), cls.updated_at);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': SSR_CACHE },
  });
}
