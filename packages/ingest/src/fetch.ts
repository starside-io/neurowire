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
}

const USER_AGENT = 'Neurowire/0.1 (+https://github.com/neurowire/neurowire)'
const ACCEPT =
  'application/atom+xml, application/rss+xml, application/feed+json, application/json;q=0.9, text/html;q=0.8, */*;q=0.5'

/** Fetch a URL over HTTP(S), following redirects, returning the body and final URL. */
export async function fetchDocument(url: string, options: FetchOptions = {}): Promise<RawDocument> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`)
  }

  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: ACCEPT }
  const cached = options.cache?.get(url)
  if (cached?.etag) headers['if-none-match'] = cached.etag
  if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified

  const res = await fetch(url, {
    redirect: 'follow',
    signal: options.signal,
    headers,
  })

  if (res.status === 304 && cached) {
    return {
      url: cached.url,
      contentType: cached.contentType,
      body: cached.body,
      etag: cached.etag,
      lastModified: cached.lastModified,
      notModified: true,
    }
  }

  if (!res.ok) {
    throw new Error(`Upstream responded ${res.status} ${res.statusText} for ${url}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  const body = await res.text()
  const etag = res.headers.get('etag') ?? undefined
  const lastModified = res.headers.get('last-modified') ?? undefined
  const finalUrl = res.url || url

  if (options.cache) {
    options.cache.set(url, { url: finalUrl, contentType, body, etag, lastModified })
  }

  return { url: finalUrl, contentType, body, etag, lastModified }
}
