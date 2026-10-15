// Secciones de la web que el estudio puede ocultar desde el panel («Mi web» →
// Secciones). La portada siempre se ve. Mientras el API no publique
// `sections` en la config pública (p. ej. { classes: true, prices: false,
// team: true, location: true }), todas están visibles; y aunque estén
// activadas, una sección sin contenido no se pinta (HomeSections.astro).
import type { SiteConfig } from './site';

export type SectionKey = 'next' | 'classes' | 'prices' | 'team' | 'location';

export function sectionOn(site: SiteConfig, key: SectionKey): boolean {
  const raw = (site as unknown as { sections?: unknown }).sections;
  if (!raw || typeof raw !== 'object') return true;
  const v = (raw as Record<string, unknown>)[key];
  return v !== false;
}
