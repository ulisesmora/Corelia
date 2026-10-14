// Texto para asistentes de IA (ChatGPT, Claude, Gemini, Perplexity):
//  - /llms.txt       → resumen: datos clave, clases, precios, FAQs, equipo.
//  - /llms-full.txt  → todo el contenido textual (descripciones completas,
//                      "sobre nosotros", FAQs y precios).
// Se genera en cada petición con los datos reales de la config y la API.
import { business, classPath, faqText, metaDescription, niceTitle, origin } from './site';
import {
  LEVELS, WEEKDAYS, getClassTypes, getFaqs, getInstructors, getPlans, getSchedules, getRooms,
  hhmm, offeredClasses, tr,
} from './catalog';
import { siteMoney, getSiteConfig, lt, mapsUrl, socialProfiles } from '../lib/site';

export async function buildLlmsText(full: boolean): Promise<string> {
  const [site, classes, schedules, plans, faqsHome, faqsPrices, instructors, rooms] = await Promise.all([
    getSiteConfig(), getClassTypes(), getSchedules(), getPlans(), getFaqs('home'), getFaqs('prices'),
    getInstructors(), getRooms(),
  ]);
  const ORIGIN = origin();
  const b = business(site);
  const c = site.contact;
  const money = (n: number) => siteMoney(n, site, 'en');
  const items = offeredClasses(classes, schedules);
  const packs = plans.filter((p) => p.type === 'pack').sort((a, b2) => a.credits - b2.credits);
  const subs = plans.filter((p) => p.type === 'sub').sort((a, b2) => Number(a.price_eur) - Number(b2.price_eur));
  // FAQs sin repetir (la misma pregunta puede estar en portada y precios) y sin
  // las de ejemplo (is_sample): aquí solo va información real del estudio
  const seen = new Set<string>();
  const faqs = [...faqsHome, ...faqsPrices]
    .filter((f) => !f.is_sample)
    .filter((f) => !seen.has(f.question) && seen.add(f.question));
  const map = mapsUrl(site);

  const L: string[] = [];
  L.push(`# ${b.name}`, '');
  L.push(`> ${b.description.en}`, '');
  if (b.description.es !== b.description.en) L.push(`> (ES) ${b.description.es}`, '');

  L.push('## Key facts');
  if (b.addressLine) L.push(`- Address: ${b.addressLine}${c.country ? `, ${c.country}` : ''}`);
  if (c.latitude != null && c.longitude != null) L.push(`- Coordinates: ${c.latitude}, ${c.longitude}`);
  if (site.google_business_url) L.push(`- Google Business Profile (reviews, photos, opening hours): ${site.google_business_url}`);
  if (map && map !== site.google_business_url) L.push(`- Map: ${map}`);
  if (b.areaServed.length) L.push(`- Areas served: ${b.areaServed.join(', ')}`);
  L.push(`- Website and online booking: ${ORIGIN}`);
  L.push(`- Weekly timetable: ${ORIGIN}/calendar`);
  L.push(`- Classes: ${ORIGIN}/classes (Spanish) · ${ORIGIN}/en/classes (English)`);
  L.push(`- Prices and memberships: ${ORIGIN}/prices`);
  if (b.phone) L.push(`- Phone: ${b.phone}`);
  if (b.whatsapp) L.push(`- WhatsApp: ${b.whatsapp}`);
  if (b.email) L.push(`- Email: ${b.email}`);
  for (const p of socialProfiles(site)) {
    if (p.network !== 'google-business') L.push(`- ${p.label}: ${p.url}`);
  }
  if (site.google_review_url) L.push(`- Leave a Google review: ${site.google_review_url}`);
  if (Number(site.drop_in_price) > 0) L.push(`- Drop-in class: ${money(Number(site.drop_in_price))} (1 credit).`);
  L.push(`- Cancellation: free up to ${site.cancel_min_hours} hours before the class.`);
  L.push(`- Online card payments: ${site.payments_enabled ? 'yes' : 'no (packs are bought at the studio)'}`);
  L.push('');

  if (full) {
    const aboutTitle = lt(site.content, 'about_title', 'es');
    const aboutText = lt(site.content, 'about_text', 'es');
    const aboutTextEn = site.content.about_text_en;
    if (aboutText || aboutTextEn) {
      L.push(`## About us${aboutTitle ? ` — ${aboutTitle}` : ''}`);
      if (aboutTextEn) L.push(aboutTextEn, '');
      if (aboutText) L.push(`(ES) ${aboutText}`, '');
    }
  }

  if (items.length) {
    L.push('## Classes and weekly schedule');
    for (const { cls, slots } of items) {
      const title = niceTitle(tr(cls, 'title', 'en'));
      const es = niceTitle(cls.title);
      const when = slots.map((s) => `${WEEKDAYS.en[s.weekday!]} ${hhmm(s.start_time)}–${hhmm(s.end_time)}`).join('; ');
      const level = LEVELS[cls.level || 'all']?.en;
      const descEn = tr(cls, 'description', 'en').trim();
      const descEs = (cls.description || '').trim();
      const head = `- [${title}${es.toLowerCase() !== title.toLowerCase() ? ` (${es})` : ''}](${ORIGIN}${classPath(cls.slug, 'en')})`;
      const meta = `Schedule: ${when}. Level: ${level}. Price: ${Number(cls.default_price_credits || 1)} credit(s).`;
      if (full) {
        L.push(`${head}`, `  ${meta}`);
        if (descEn) L.push(`  ${descEn.replace(/\s*\n\s*/g, ' ')}`);
        if (descEs && descEs !== descEn) L.push(`  (ES) ${descEs.replace(/\s*\n\s*/g, ' ')}`);
      } else {
        L.push(`${head}: ${metaDescription(descEn, 220)} ${meta}`);
      }
    }
    L.push('');
  }

  if (packs.length || subs.length) {
    L.push('## Prices');
    for (const p of packs) {
      L.push(`- ${p.name_en || p.name}: ${p.credits} credits for ${money(Number(p.price_eur))} (one-off class pack${p.credits_expire_days ? `, valid ${p.credits_expire_days} days` : ''})`);
      if (full && (p.description_en || p.description)) L.push(`  ${p.description_en || p.description}`);
    }
    for (const p of subs) {
      const months = p.interval_count && p.interval_count > 1 ? `every ${p.interval_count} months` : 'per month';
      L.push(`- ${p.name_en || p.name} membership: ${p.credits} credits ${months} for ${money(Number(p.price_eur))}, automatic renewal, no long-term commitment`);
      if (full && (p.description_en || p.description)) L.push(`  ${p.description_en || p.description}`);
    }
    L.push('');
  }

  const team = instructors || [];
  if (team.length) {
    L.push('## Team');
    for (const i of team) {
      const bio = full
        ? ((i.description_en || i.description || i.short_bio_en || i.short_bio || '').trim())
        : ((i.short_bio_en || i.short_bio || '').trim());
      L.push(`- ${i.name}${i.experience_years ? ` (${i.experience_years} years of experience)` : ''}${bio ? `: ${bio.replace(/\s*\n\s*/g, ' ')}` : ''}`);
    }
    L.push('');
  }

  if (full) {
    const activeRooms = (rooms || []).filter((r) => r.is_active !== false);
    if (activeRooms.length) {
      L.push('## Studios / rooms');
      for (const r of activeRooms) {
        const desc = (r.description_en || r.description || '').trim();
        L.push(`- ${r.title_en || r.title || r.name}${r.capacity ? ` (up to ${r.capacity} people)` : ''}${desc ? `: ${desc}` : ''}`);
      }
      L.push('');
    }
  }

  if (faqs.length) {
    L.push('## Frequently asked questions');
    for (const f of faqs) {
      const en = faqText(f, 'en');
      L.push(`### ${en.q}`, full ? en.a : metaDescription(en.a, 400), '');
      if (full && f.question_en && f.question_en !== f.question) {
        L.push(`(ES) ${f.question}`, f.answer, '');
      }
    }
  }

  L.push('## How to book');
  L.push(`1. Choose a class on ${ORIGIN}/classes or the timetable at ${ORIGIN}/calendar.`);
  L.push(site.payments_enabled
    ? '2. Book online with a single class, a credit pack or a membership.'
    : '2. Buy your credits at the studio, then book online with your account.');
  if (b.whatsapp || b.phone || b.email) L.push(`3. Questions: ${b.whatsapp || b.phone || b.email}.`);
  L.push('');
  if (!full) L.push(`Full content (all descriptions, FAQs and prices): ${ORIGIN}/llms-full.txt`, '');
  return L.join('\n');
}
