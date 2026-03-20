type CachedResponse = {
  body: any;
  statusCode: number;
  headers: Record<string, string>;
  cachedAt: number;
};

export class ResponseCache {
  private cache = new Map<string, CachedResponse>();

  constructor(private readonly ttlMs: number = 5000) {}

  get(
    fingerprint: string
  ): { body: any; statusCode: number; headers: Record<string, string> } | null {
    const entry = this.cache.get(fingerprint);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.cachedAt >= this.ttlMs) {
      this.cache.delete(fingerprint);
      return null;
    }

    return {
      body: entry.body,
      statusCode: entry.statusCode,
      headers: entry.headers
    };
  }

  set(
    fingerprint: string,
    body: any,
    statusCode: number,
    headers: Record<string, string>
  ): void {
    this.cache.set(fingerprint, {
      body,
      statusCode,
      headers,
      cachedAt: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const responseCaches = new Map<string, ResponseCache>();

export function getOrCreateCache(route: string, ttlMs: number): ResponseCache {
  const existingCache = responseCaches.get(route);

  if (existingCache) {
    return existingCache;
  }

  const cache = new ResponseCache(ttlMs);
  responseCaches.set(route, cache);
  return cache;
}

export function removeCache(route: string): boolean {
  const cache = responseCaches.get(route);

  if (!cache) {
    return false;
  }

  cache.clear();
  return responseCaches.delete(route);
}
