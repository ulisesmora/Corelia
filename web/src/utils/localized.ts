/**
 * localized.ts — texto del backend en el idioma actual.
 *
 * La API manda cada texto traducible en español (`title`) y, al lado, su
 * versión inglesa plana (`title_en`); vacío = sin traducción. El antiguo JSON
 * `translations` ({ en: { title } }) se mantiene sólo como respaldo.
 */

type Localizable = Record<string, any> | null | undefined;

/**
 * `tr(classType, 'title', lang)` → en inglés devuelve `title_en`, si no
 * `translations.en.title`, y si tampoco el `title` original. En español
 * siempre el original. Nunca lanza: si `obj` es null devuelve ''.
 */
export function tr<T extends Localizable>(obj: T, field: string, lang: string | null | undefined): string {
  if (!obj) return '';
  const o = obj as Record<string, any>;
  const base = o[field];
  if (lang === 'en') {
    const flat = o[`${field}_en`];
    if (typeof flat === 'string' && flat.trim()) return flat;
    const legacy = o.translations?.en?.[field];
    if (typeof legacy === 'string' && legacy.trim()) return legacy;
  }
  return typeof base === 'string' ? base : base == null ? '' : String(base);
}

/**
 * Sólo el texto propio del idioma, sin caer al español: en inglés
 * `title_en` o `translations.en.title` (o '' si no hay); en español el
 * original. Para sitios que, sin traducción, prefieren un texto del
 * diccionario antes que el español de la API.
 */
export function trStrict<T extends Localizable>(obj: T, field: string, lang: string | null | undefined): string {
  if (!obj) return '';
  if (lang !== 'en') return tr(obj, field, lang);
  const o = obj as Record<string, any>;
  const flat = o[`${field}_en`];
  if (typeof flat === 'string' && flat.trim()) return flat;
  const legacy = o.translations?.en?.[field];
  return typeof legacy === 'string' && legacy.trim() ? legacy : '';
}

/** Como `tr` pero devuelve `undefined` cuando no hay texto (útil para `a ?? b`). */
export function trOpt<T extends Localizable>(obj: T, field: string, lang: string | null | undefined): string | undefined {
  const v = tr(obj, field, lang);
  return v ? v : undefined;
}

/** Ficha de una clase en el idioma actual: `/classdetail/<slug>` o `/en/classdetail/<slug>`. */
export function classUrl(slug: string | null | undefined, lang: string | null | undefined): string {
  const s = slug || '';
  return lang === 'en' ? `/en/classdetail/${s}` : `/classdetail/${s}`;
}

/**
 * Nombre de una sala anidada ({ name, title, title_en }) tal y como lo pintan
 * los listados: en español `name` ("Principal"); en inglés `title_en`
 * ("Main studio") o, si no hay, `name`.
 */
export function roomName(
  room: { name?: string | null; title_en?: string | null; translations?: any } | null | undefined,
  lang: string | null | undefined,
): string {
  if (!room) return '';
  return (lang === 'en' ? trStrict(room, 'title', lang) : '') || room.name || '';
}
