// Manifest de la PWA generado con la config del estudio: nombre, colores e
// iconos (los genera el backend a partir del icono/logo, vía el proxy /api).
import { ICON_URL, getSiteConfig, shortName } from '../lib/site';

export const prerender = false;

export async function GET() {
  const site = await getSiteConfig();
  const manifest = {
    name: site.studio_name,
    short_name: shortName(site),
    description: site.description || site.tagline || `Reserva tus clases en ${site.studio_name}`,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: site.theme.background,
    theme_color: site.theme.primary,
    lang: 'es',
    icons: [
      { src: ICON_URL.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: ICON_URL.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: ICON_URL.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
