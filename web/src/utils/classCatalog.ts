// Clases agrupadas por categoría (las categorías las crea el estudio en el
// panel). Antes las pestañas usaban ids de categoría fijos (1, 2, 3, 4), que
// solo valían para la base de datos original.
import type { ApiClassType } from '../components/OurClasses';
import { API_V1 } from '../config';
import { cachedFetch } from './fetchCache';
import { tr } from './localized';

export interface CategoryGroup {
  /** Clave estable de la pestaña (id de la categoría u 'other'). */
  key: string;
  category: ApiClassType['category'] | null;
  items: ApiClassType[];
}

/** Todas las clases activas, agrupadas por categoría (en el orden en que llegan). */
export async function loadClassGroups(): Promise<CategoryGroup[]> {
  const raw = await cachedFetch<ApiClassType[] | { results: ApiClassType[] }>(`${API_V1}/class-types/`, { ttl: 300 });
  return groupClasses(Array.isArray(raw) ? raw : raw?.results || []);
}

/**
 * Agrupa una lista de clases por categoría. Síncrono: sirve también para los
 * datos que la página ya trae del servidor (render en servidor, sin fetch).
 */
export function groupClasses(all: ApiClassType[]): CategoryGroup[] {
  const list = all.filter((c) => (c as { is_active?: boolean }).is_active !== false);
  const groups = new Map<string, CategoryGroup>();
  for (const c of list) {
    const key = c.category ? String(c.category.id) : 'other';
    if (!groups.has(key)) groups.set(key, { key, category: c.category ?? null, items: [] });
    groups.get(key)!.items.push(c);
  }
  // Las clases sin categoría van al final
  return [...groups.values()].sort((a, b) => (a.key === 'other' ? 1 : 0) - (b.key === 'other' ? 1 : 0)
    || Number(a.key) - Number(b.key));
}

/** Nombre de la categoría en el idioma actual. */
export function categoryName(group: CategoryGroup, lang: string, otherLabel: string): string {
  if (!group.category) return otherLabel;
  const name = tr(group.category, 'name', lang).trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : otherLabel;
}

/** Descripción de la categoría (en inglés no cae al español: devuelve ''). */
export function categoryDescription(group: CategoryGroup, lang: string): string {
  const cat = group.category;
  if (!cat) return '';
  if (lang === 'en') return cat.description_en || cat.translations?.en?.description || '';
  return cat.description || '';
}

/** Tipo de icono para la pestaña según el nombre de la categoría. */
export function categoryIconKind(group: CategoryGroup): 'yoga' | 'mind' | 'move' {
  const n = `${group.category?.name || ''} ${group.category?.slug || ''}`.toLowerCase();
  if (/yoga/.test(n)) return 'yoga';
  if (/medit|mind|respira|breath|relax|calma/.test(n)) return 'mind';
  return 'move';
}
