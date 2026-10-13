// Índice de sitemaps (dinámico: dominio de la config del estudio o PUBLIC_SITE_URL).
import { SSR_CACHE, origin } from '../seo/site';
import { getSiteConfig } from '../lib/site';

export const prerender = false;

export async function GET() {
  await getSiteConfig();
  const ORIGIN = origin();
  const now = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${ORIGIN}/sitemap-pages.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${ORIGIN}/sitemap-classes.xml</loc><lastmod>${now}</lastmod></sitemap>
</sitemapindex>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': SSR_CACHE },
  });
}
