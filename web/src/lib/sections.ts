// Secciones de la web que el estudio puede apagar desde el panel («Mi web» →
// Secciones). Las guarda el API en SiteConfig.web_sections y las publica en
// la config pública como `sections` ({ next: true, faqs: false, … }); la
// portada siempre se ve. Aunque estén encendidas, una sección sin contenido
// no se pinta (HomeSections.astro). Opiniones, preguntas y galería, además,
// el API ya no las devuelve en sus listas públicas cuando están apagadas.
//
// Sin importar nada de ./site (este archivo lo importa site.ts).
export const SECTION_KEYS = [
  'next', 'classes', 'prices', 'team', 'location', 'testimonials', 'faqs', 'gallery',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export function sectionOn(site: { sections?: Partial<Record<SectionKey, boolean>> }, key: SectionKey): boolean {
  return site.sections?.[key] !== false;
}
