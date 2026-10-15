// Sitemap de las páginas públicas fijas (portada, precios, horario, estudio, contacto). Las legales
// llevan noindex y no se incluyen.
// Las fichas de clase van en /sitemap-classes.xml.
import { SSR_CACHE, origin } from '../seo/site';
import { getSiteConfig } from '../lib/site';

export const prerender = false;

const PAGES: { loc: string; alt?: { es: string; en: string }; priority: string; changefreq: string }[] = [
  { loc: '/', alt: { es: '/', en: '/en' }, priority: '1.0', changefreq: 'weekly' },
  { loc: '/en', alt: { es: '/', en: '/en' }, priority: '0.9', changefreq: 'weekly' },
  { loc: '/calendar', priority: '0.9', changefreq: 'daily' },
  { loc: '/prices', alt: { es: '/prices', en: '/en/prices' }, priority: '0.8', changefreq: 'monthly' },
  { loc: '/en/prices', alt: { es: '/prices', en: '/en/prices' }, priority: '0.7', changefreq: 'monthly' },
  { loc: '/estudio', alt: { es: '/estudio', en: '/en/studio' }, priority: '0.7', changefreq: 'monthly' },
  { loc: '/en/studio', alt: { es: '/estudio', en: '/en/studio' }, priority: '0.6', changefreq: 'monthly' },
  { loc: '/contacto', alt: { es: '/contacto', en: '/en/contact' }, priority: '0.7', changefreq: 'monthly' },
  { loc: '/en/contact', alt: { es: '/contacto', en: '/en/contact' }, priority: '0.6', changefreq: 'monthly' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET() {
  await getSiteConfig();
  const ORIGIN = origin();
  const url = (path: string) => esc(ORIGIN + (path === '/' ? '/' : path));
  const urls = PAGES.map((p) => `  <url>
    <loc>${url(p.loc)}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>${p.alt ? `
    <xhtml:link rel="alternate" hreflang="es" href="${url(p.alt.es)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${url(p.alt.en)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${url(p.alt.es)}"/>` : ''}
  </url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': SSR_CACHE },
  });
}
