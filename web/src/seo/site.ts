// Datos del negocio y utilidades de SEO compartidas por todas las páginas.
// Los datos salen de la configuración del estudio (lib/site.ts → panel →
// Ajustes): si cambia la dirección o el teléfono, se cambia allí, no aquí.
import { siteOrigin } from '../config';
import { ICON_URL, addressLine, siteMoney, mapsUrl, socialProfiles, whatsappUrl, type SiteConfig } from '../lib/site';
import type { ApiFaq, ApiInstructor, ApiPlan, ApiSchedule } from './catalog';

export type Lang = 'es' | 'en';

/**
 * Origen público de la web, sin barra final. Sale de `site_url` de la config
 * (dominio propio del panel) o de PUBLIC_SITE_URL. Es una función, no una
 * constante: el estudio puede cambiar de dominio sin reiniciar el servidor.
 * Llama antes a `await getSiteConfig()` (las páginas y endpoints ya lo hacen).
 */
export function origin(): string {
  return siteOrigin();
}

/** Descripción genérica si el estudio aún no ha escrito la suya. */
export function defaultDescription(site: SiteConfig, lang: Lang): string {
  const where = site.contact.city ? (lang === 'en' ? ` in ${site.contact.city}` : ` en ${site.contact.city}`) : '';
  return lang === 'en'
    ? `${site.studio_name}: Pilates, Yoga and movement studio${where}. Small groups, all levels and online booking.`
    : `${site.studio_name}: estudio de Pilates, Yoga y movimiento${where}. Grupos reducidos, todos los niveles y reserva online.`;
}

/** Datos del negocio derivados de la config del estudio. */
export function business(site: SiteConfig) {
  const c = site.contact;
  // Perfiles del mismo negocio en otros sitios (Google los usa para unir la
  // ficha de Google Business, las redes y la web en una sola entidad)
  const sameAs = socialProfiles(site).map((p) => p.url);
  const icon = abs(ICON_URL.icon512);
  const og = site.og_image_url || abs(ICON_URL.og);
  return {
    id: `${origin()}/#business`,
    name: site.studio_name,
    legalName: site.legal.name || site.studio_name,
    phone: c.phone,
    whatsapp: whatsappUrl(site),
    email: c.email,
    address: {
      streetAddress: c.address,
      addressLocality: c.city,
      postalCode: c.postal_code,
      addressCountry: c.country,
    },
    addressLine: addressLine(site),
    // Zonas que atiende: las del panel o, si no hay, la ciudad
    areaServed: c.area_served.length ? c.area_served : [c.city].filter(Boolean),
    logo: site.logo_url || icon,
    image: og,
    // Imagen para compartir: la del panel o la que genera el backend (1200×630)
    ogImage: og,
    sameAs,
    description: {
      es: site.description || defaultDescription(site, 'es'),
      en: site.description_en || defaultDescription(site, 'en'),
    },
  };
}

export function abs(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${origin()}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function classPath(slug: string, lang: Lang): string {
  return `${lang === 'en' ? '/en' : ''}/classdetail/${slug}`;
}

/** Texto plano recortado a una frase completa para meta descriptions. */
export function metaDescription(text: string | null | undefined, max = 155): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '));
  return `${(lastStop > 80 ? cut.slice(0, lastStop) : cut.slice(0, cut.lastIndexOf(' '))).trim()}…`;
}

/** Primera letra en mayúscula y el resto como está (los títulos llegan en MAYÚSCULAS a veces). */
export function niceTitle(title: string): string {
  const t = (title || '').trim();
  if (t && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{4,}/.test(t)) {
    const keep = new Set(['II', 'III', 'TIKTOK']);
    return t
      .toLowerCase()
      .split(' ')
      .map((w) => (keep.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return t;
}

const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (t: string) => (t || '').slice(0, 5);

/**
 * Horario de apertura deducido de las clases semanales: por día de la semana,
 * la hora de inicio de la primera clase y la de fin de la última.
 */
export function openingHoursFromSchedules(schedules: ApiSchedule[] | null | undefined) {
  const today = new Date().toISOString().slice(0, 10);
  const byDay = new Map<number, { opens: string; closes: string }>();
  for (const s of schedules || []) {
    if (!s.is_active || s.is_recurrent === false || s.weekday == null) continue;
    if (s.end_date && s.end_date < today) continue;
    const opens = hhmm(s.start_time);
    const closes = hhmm(s.end_time);
    if (!opens || !closes) continue;
    const cur = byDay.get(s.weekday);
    byDay.set(s.weekday, {
      opens: !cur || opens < cur.opens ? opens : cur.opens,
      closes: !cur || closes > cur.closes ? closes : cur.closes,
    });
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, h]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[day]}`,
      opens: h.opens,
      closes: h.closes,
    }));
}

/** Rango de precios ("12 € – 110 €", "$12 – $110"…) a partir de la clase suelta y los planes. */
export function priceRange(site: SiteConfig, plans: ApiPlan[] = [], lang: Lang = 'es'): string {
  const prices = [Number(site.drop_in_price), ...plans.map((p) => Number(p.price_eur))]
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? siteMoney(min, site, lang) : `${siteMoney(min, site, lang)} – ${siteMoney(max, site, lang)}`;
}

/** Instructor/a como Person (va dentro de `employee` del negocio). */
export function personJsonLd(i: ApiInstructor, lang: Lang) {
  const bio = (lang === 'en' && i.short_bio_en) || i.short_bio || '';
  return {
    '@type': 'Person',
    name: i.name,
    jobTitle: lang === 'en' ? 'Instructor' : 'Instructor/a',
    ...(bio ? { description: bio } : {}),
    ...(i.image ? { image: i.image } : {}),
    ...(i.instagram || i.website ? { sameAs: [i.website, i.instagram].filter(Boolean) } : {}),
  };
}

/** Planes (bonos y membresías) como OfferCatalog. */
export function offerCatalogJsonLd(site: SiteConfig, plans: ApiPlan[], lang: Lang) {
  const b = business(site);
  return {
    '@type': 'OfferCatalog',
    name: lang === 'en' ? `${site.studio_name} packs and memberships` : `Bonos y membresías de ${site.studio_name}`,
    url: abs(lang === 'en' ? '/en/prices' : '/prices'),
    itemListElement: plans.map((p) => ({
      '@type': 'Offer',
      name: (lang === 'en' && p.name_en) || p.name,
      price: Number(p.price_eur),
      priceCurrency: site.currency,
      ...(((lang === 'en' && p.description_en) || p.description) ? { description: (lang === 'en' && p.description_en) || p.description } : {}),
      url: abs(lang === 'en' ? '/en/prices' : '/prices'),
      seller: { '@id': b.id },
    })),
  };
}

/** Datos extra (opcionales) para enriquecer el negocio en JSON-LD. */
export interface BusinessExtras {
  schedules?: ApiSchedule[] | null;
  instructors?: ApiInstructor[] | null;
  plans?: ApiPlan[] | null;
}

/** Negocio local para JSON-LD (se referencia desde las demás páginas por su @id). */
export function businessJsonLd(site: SiteConfig, lang: Lang, extras: BusinessExtras = {}) {
  const b = business(site);
  const { address } = b;
  const c = site.contact;
  const hasAddress = address.streetAddress || address.addressLocality || address.postalCode;
  const hours = openingHoursFromSchedules(extras.schedules);
  const range = priceRange(site, extras.plans || [], lang);
  // La ficha de Google Business es el mejor «mapa»: enlaza la web con ella
  const map = site.google_business_url || mapsUrl(site);
  return {
    '@context': 'https://schema.org',
    '@type': ['SportsActivityLocation', 'ExerciseGym', 'LocalBusiness'],
    '@id': b.id,
    name: b.name,
    ...(site.legal.name ? { legalName: site.legal.name } : {}),
    description: b.description[lang],
    url: lang === 'en' ? `${origin()}/en` : origin(),
    logo: b.logo,
    image: b.image,
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.email ? { email: b.email } : {}),
    currenciesAccepted: site.currency,
    ...(range ? { priceRange: range } : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(address.streetAddress ? { streetAddress: address.streetAddress } : {}),
            ...(address.addressLocality ? { addressLocality: address.addressLocality } : {}),
            ...(address.postalCode ? { postalCode: address.postalCode } : {}),
            ...(address.addressCountry ? { addressCountry: address.addressCountry } : {}),
          },
        }
      : {}),
    ...(c.latitude != null && c.longitude != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } }
      : {}),
    ...(map ? { hasMap: map } : {}),
    ...(b.areaServed.length ? { areaServed: b.areaServed.map((name) => ({ '@type': 'Place', name })) } : {}),
    ...(b.sameAs.length ? { sameAs: b.sameAs } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(extras.instructors?.length ? { employee: extras.instructors.map((i) => personJsonLd(i, lang)) } : {}),
    ...(extras.plans?.length ? { hasOfferCatalog: offerCatalogJsonLd(site, extras.plans, lang) } : {}),
    knowsLanguage: ['es', 'en'],
    ...(b.phone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: b.phone,
            contactType: 'customer service',
            availableLanguage: ['Spanish', 'English'],
          },
        }
      : {}),
  };
}

/** Pregunta/respuesta en el idioma pedido (inglés con respaldo al español). */
export function faqText(f: ApiFaq, lang: Lang) {
  return {
    q: (lang === 'en' && f.question_en?.trim()) || f.question,
    a: (lang === 'en' && f.answer_en?.trim()) || f.answer,
  };
}

/**
 * FAQPage (solo si hay preguntas propias del estudio). Las preguntas de
 * ejemplo (`is_sample`, de los datos de demostración) se ven en la web pero no
 * se publican como datos estructurados: no son información real del negocio.
 */
export function faqJsonLd(faqs: ApiFaq[], lang: Lang) {
  const own = faqs.filter((f) => !f.is_sample);
  if (!own.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: own.map((f) => {
      const { q, a } = faqText(f, lang);
      return { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } };
    }),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}

/** NOINDEX=1 (o true) en el servidor: entorno de pruebas, fuera de buscadores. */
export function envNoindex(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.NOINDEX === '1' || env?.NOINDEX === 'true';
}

/**
 * El estudio todavía no debe salir en buscadores: no ha terminado el asistente
 * de bienvenida (la web aún tiene textos y datos de ejemplo) o NOINDEX=1.
 */
export function siteNoindex(site: SiteConfig): boolean {
  return !site.setup_completed || envNoindex();
}

/**
 * Contenido de <meta name="robots"> de una página. `indexable` = la página en
 * sí puede indexarse; `noindexValue` = lo que se pone si no.
 */
export function robotsContent(site: SiteConfig, indexable = true, noindexValue = 'noindex,nofollow'): string {
  if (siteNoindex(site)) return 'noindex,nofollow';
  return indexable ? 'index,follow,max-image-preview:large' : noindexValue;
}

/** Cabecera de caché para páginas renderizadas en servidor (CDN / proxy delante). */
export const SSR_CACHE = 'public, s-maxage=600, stale-while-revalidate=86400';

/** Caché corta para páginas que llevan la marca del estudio (se cambia desde el panel). */
export const BRAND_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';
