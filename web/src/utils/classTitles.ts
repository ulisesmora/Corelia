const SMALL_WORDS = new Set(['y', 'e', 'o', 'de', 'del', 'con', 'al', 'a', 'en', 'la', 'el', 'los', 'las', 'para']);

/** "PILATES PRE y POSTPARTO CON BEBÉS" → "Pilates Pre y Postparto con Bebés" */
export function prettyTitle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (/^(i|ii|iii|iv)$/.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.split('/').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('/');
    })
    .join(' ');
}
