/**
 * fetchCache.ts — Stale-While-Revalidate localStorage cache for API calls.
 *
 * Returns cached data immediately if fresh (< ttl seconds).
 * If stale: returns stale data + fires a background refetch to refresh the cache.
 * If missing: awaits the network, stores result, returns it.
 *
 * Usage:
 *   const data = await cachedFetch<MyType[]>('/api/items/', { ttl: 300 });
 */

const CACHE_PREFIX = 'site_fc_';

// SSR-safe: en servidor `window` no existe, no hay localStorage.
// Esto permite que componentes que usen cachedFetch puedan ser renderizados
// vía client:visible / client:idle sin crashear en SSR.
const HAS_LS = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

interface CacheEntry<T> {
  data: T;
  ts: number; // timestamp ms
}

function cacheKey(url: string) {
  return CACHE_PREFIX + url;
}

function readCache<T>(url: string): CacheEntry<T> | null {
  if (!HAS_LS) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(url));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(url: string, data: T) {
  if (!HAS_LS) return;
  try {
    window.localStorage.setItem(cacheKey(url), JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage quota exceeded — ignore
  }
}

async function fetchAndStore<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchCache: ${res.status} ${url}`);
  const data: T = await res.json();
  writeCache(url, data);
  return data;
}

export async function cachedFetch<T = unknown>(
  url: string,
  { ttl = 300, revalidate = true }: { ttl?: number; revalidate?: boolean } = {}
): Promise<T> {
  const entry = readCache<T>(url);
  const now = Date.now();

  if (entry) {
    const age = (now - entry.ts) / 1000; // seconds
    if (age < ttl) {
      // Fresh — return immediately
      return entry.data;
    }
    // Stale — return stale data and revalidate in the background
    if (revalidate) {
      fetchAndStore<T>(url).catch(() => {});
    }
    return entry.data;
  }

  // No cache — must await the network
  return fetchAndStore<T>(url);
}

/** Invalidate a specific cache entry (force fresh fetch next time) */
export function invalidateCache(url: string) {
  if (!HAS_LS) return;
  try {
    window.localStorage.removeItem(cacheKey(url));
  } catch {
    // ignore
  }
}

/** Clear all site_fc_ cache entries */
export function clearAllCache() {
  if (!HAS_LS) return;
  try {
    const keys = Object.keys(window.localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
