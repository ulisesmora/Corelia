// Mapa del estudio («Cómo llegar»): datos que el servidor pinta en el HTML
// (sin JavaScript) y enlaces para llegar con Google Maps, Apple Maps o Waze.
//
// El mapa interactivo (MapLibre GL + teselas vectoriales de OpenFreeMap) se
// carga aparte y solo cuando el mapa entra en pantalla: lib/studio-map.ts.
// Ver components/sections/StudioMap.astro y docs/ESTILOS.md («Mapa»).
import { addressLine, type SiteConfig } from './site';

/**
 * Estilo base del mapa: «positron» de OpenFreeMap (gris claro, sin puntos de
 * interés ni iconos de transporte). Gratis, sin clave ni cookies. Quien se
 * aloje sus propias teselas puede cambiarlo con PUBLIC_MAP_STYLE_URL (entonces
 * hay que añadir su dominio a connect-src en middleware.ts).
 */
export const MAP_STYLE_URL =
  (import.meta.env.PUBLIC_MAP_STYLE_URL as string | undefined) || 'https://tiles.openfreemap.org/styles/positron';

export interface DirectionLink { id: 'google' | 'apple' | 'waze'; label: string; href: string }

export interface StudioMapData {
  lat: number | null;
  lng: number | null;
  name: string;
  /** Letra del marcador (inicial del estudio). */
  initial: string;
  address: string;
  directions: DirectionLink[];
}

/**
 * Enlaces «Cómo llegar». Con coordenadas van al punto exacto; sin ellas, a la
 * dirección. Si el estudio pegó su enlace de Google Maps en el panel, el botón
 * de Google usa ese (abre su ficha, con reseñas y fotos).
 */
export function directionLinks(site: SiteConfig): DirectionLink[] {
  const { latitude: lat, longitude: lng, maps_url } = site.contact;
  const address = addressLine(site);
  const hasCoords = lat != null && lng != null;
  if (!hasCoords && !address) return [];
  const ll = hasCoords ? `${lat},${lng}` : '';
  const q = encodeURIComponent([site.studio_name, address].filter(Boolean).join(', '));
  const dest = hasCoords ? ll : encodeURIComponent(address);
  return [
    {
      id: 'google',
      label: 'Google Maps',
      href: maps_url || `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
    },
    {
      id: 'apple',
      label: 'Apple Maps',
      href: hasCoords
        ? `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(site.studio_name)}`
        : `https://maps.apple.com/?daddr=${dest}&q=${q}`,
    },
    {
      id: 'waze',
      label: 'Waze',
      href: hasCoords ? `https://waze.com/ul?ll=${ll}&navigate=yes` : `https://waze.com/ul?q=${dest}&navigate=yes`,
    },
  ];
}

export function studioMapData(site: SiteConfig): StudioMapData {
  const { latitude: lat, longitude: lng } = site.contact;
  return {
    lat,
    lng,
    name: site.studio_name,
    initial: (site.studio_name.trim().charAt(0) || '•').toUpperCase(),
    address: addressLine(site),
    directions: directionLinks(site),
  };
}
