export interface CacheEntry {
  body: string
  contentType: string
  expires: number
}

/** A tiny in-memory TTL cache. `now` is injected so expiry is testable. */
export interface TtlCache {
  get(key: string, now: number): CacheEntry | undefined
  set(key: string, entry: CacheEntry): void
}

export function createTtlCache(): TtlCache {
  const store = new Map<string, CacheEntry>()
  return {
    get(key, now) {
      const entry = store.get(key)
      if (!entry) return undefined
      if (entry.expires <= now) {
        store.delete(key)
        return undefined
      }
      return entry
    },
    set(key, entry) {
      store.set(key, entry)
    },
  }
}
