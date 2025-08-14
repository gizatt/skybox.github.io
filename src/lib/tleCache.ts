import { get as idbGet, set as idbSet } from "idb-keyval";

type CachedText = {
  url: string;
  body: string;
  etag?: string | null;
  lastModified?: string | null;
  fetchedAt: number;       // ms since epoch
  ttlMs: number;           // how long we consider it "fresh" without revalidation
};

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function key(url: string) { return `tle:${url}`; }

/**
 * Fetch text with local persistent cache + HTTP conditionals (ETag/Last-Modified).
 * Uses injected `fetchFn` so tests can mock; stores small metadata in IndexedDB.
 */
export async function fetchTextCached(
  url: string,
  fetchFn: FetchFn,
  { ttlMs = 6 * 60 * 60 * 1000, revalidate = true }: { ttlMs?: number; revalidate?: boolean } = {}
): Promise<string> {
  const k = key(url);
  const now = Date.now();
  const cached = (await idbGet(k)) as CachedText | undefined;
  const isFresh = cached && (now - cached.fetchedAt) < cached.ttlMs;

  // If fresh and caller doesn't want to revalidate, use it with zero network.
  if (isFresh && !revalidate) {
    console.log(`[tleCache] Cache hit for URL: ${url} (fresh, no network request)`);
    return cached!.body;
  }

  if (cached) {
    console.log(`[tleCache] Cache entry found for URL: ${url}`);
    console.log(`[tleCache] ETag: ${cached.etag}, Last-Modified: ${cached.lastModified}, Fresh: ${isFresh}, Revalidate: ${revalidate}`);
  } else {
    console.log(`[tleCache] No cache entry for URL: ${url}`);
  }

  // Build conditional headers if we have validators.
  const headers: Record<string, string> = {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag!;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified!;

  console.log(`[tleCache] Cache miss or revalidation required for URL: ${url} (network request)`);
  const res = await fetchFn(url, {
    method: "GET",
    headers,
    mode: "cors" as RequestMode,
    cache: "no-cache",       // ensure we get 304s when applicable
  });

  if (res.status === 304 && cached) {
    console.log(`[tleCache] Conditional network request for URL: ${url} (304 Not Modified, cache used)`);
    console.log(`[tleCache] Response headers: ETag: ${res.headers.get("etag")}, Last-Modified: ${res.headers.get("last-modified")}`);
    // Not modified → bump freshness and keep body
    const updated: CachedText = {
      ...cached,
      etag: res.headers.get("etag") ?? cached.etag ?? null,
      lastModified: res.headers.get("last-modified") ?? cached.lastModified ?? null,
      fetchedAt: now,
      ttlMs,
    };
    await idbSet(k, updated);
    return cached.body;
  }

  if (!res.ok) {
    // Be resilient: if we have anything cached, serve it stale
    if (cached) {
      console.warn(`[tleCache] Network error for URL: ${url} (serving stale cache)`);
      return cached.body;
    }
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const body = await res.text();
  console.log(`[tleCache] Full network fetch for URL: ${url} (new data cached)`);
  console.log(`[tleCache] Response headers: ETag: ${res.headers.get("etag")}, Last-Modified: ${res.headers.get("last-modified")}`);
  const record: CachedText = {
    url,
    body,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    fetchedAt: now,
    ttlMs,
  };
  await idbSet(k, record);
  return body;
}