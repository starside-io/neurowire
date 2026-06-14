export interface RawDocument {
  /** Final URL after redirects. */
  url: string
  contentType: string
  body: string
  etag?: string
  lastModified?: string
  /** True when the body was served from the cache via a 304 Not Modified. */
  notModified?: boolean
}

/** A previously fetched response plus its validators, kept for conditional requests. */
export interface CachedResponse {
  url: string
  contentType: string
  body: string
  etag?: string
  lastModified?: string
}

/** A store of cached responses, injected by the caller (the library keeps no global state). */
export interface ConditionalCache {
  get(url: string): CachedResponse | undefined
  set(url: string, value: CachedResponse): void
}

/** A simple Map-backed ConditionalCache. */
export function createMemoryCache(): ConditionalCache {
  const store = new Map<string, CachedResponse>()
  return {
    get: (url) => store.get(url),
    set: (url, value) => {
      store.set(url, value)
    },
  }
}

export interface FetchOptions {
  signal?: AbortSignal
  cache?: ConditionalCache
  /**
   * Optional per-URL guard. Called for the initial URL and for every redirect
   * hop before the request is made; throw to block the fetch. Use it to enforce
   * SSRF protection (reject private / internal addresses) on every hop, not just
   * the URL the caller passed in. Redirects are followed manually so this runs
   * on each target.
   */
  validate?: (url: string) => void | Promise<void>
}

/** Max redirect hops followed before giving up. */
const MAX_REDIRECTS = 5

const USER_AGENT = 'Neurowire/0.1 (+https://github.com/neurowire/neurowire)'
const ACCEPT =
  'application/atom+xml, application/rss+xml, application/feed+json, application/json;q=0.9, text/html;q=0.8, */*;q=0.5'

/**
 * Fetch a URL over HTTP(S), following redirects, returning the body and final
 * URL. Redirects are followed manually (one hop at a time) so an optional
 * `validate` guard runs against every target. This closes the SSRF hole where a
 * public URL 302-redirects to an internal address: each hop is re-checked.
 */
export async function fetchDocument(url: string, options: FetchOptions = {}): Promise<RawDocument> {
  const cacheKey = url
  let current = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL
    try {
      parsed = new URL(current)
    } catch {
      throw new Error(`Invalid URL: ${current}`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`)
    }
    // Guard the initial URL and every redirect target before connecting.
    if (options.validate) await options.validate(current)

    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: ACCEPT }
    // Conditional headers only apply to the originally requested URL.
    if (hop === 0) {
      const cached = options.cache?.get(cacheKey)
      if (cached?.etag) headers['if-none-match'] = cached.etag
      if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified
    }

    const res = await fetch(current, {
      redirect: 'manual',
      signal: options.signal,
      headers,
    })

    // Manual redirect handling: resolve Location against the current URL and loop.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (location) {
        current = new URL(location, current).toString()
        continue
      }
    }

    if (res.status === 304) {
      const cached = options.cache?.get(cacheKey)
      if (cached) {
        return {
          url: cached.url,
          contentType: cached.contentType,
          body: cached.body,
          etag: cached.etag,
          lastModified: cached.lastModified,
          notModified: true,
        }
      }
    }

    if (!res.ok) {
      throw new Error(`Upstream responded ${res.status} ${res.statusText} for ${current}`)
    }

    const contentType = res.headers.get('content-type') ?? ''
    const body = await res.text()
    const etag = res.headers.get('etag') ?? undefined
    const lastModified = res.headers.get('last-modified') ?? undefined
    const finalUrl = res.url || current

    if (options.cache) {
      options.cache.set(cacheKey, { url: finalUrl, contentType, body, etag, lastModified })
    }

    return { url: finalUrl, contentType, body, etag, lastModified }
  }

  throw new Error(`Too many redirects for ${url}`)
}
