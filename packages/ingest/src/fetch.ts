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
  /** Per-attempt deadline in milliseconds. Default 15000. Set 0 to disable. */
  timeoutMs?: number
  /** Max additional attempts after the first. Default 2. */
  retries?: number
  /** Base delay in milliseconds for exponential backoff with jitter. Default 500. */
  backoffMs?: number
  /**
   * Sleep function used between retries. Injectable so tests can drive backoff
   * with fake timers instead of real waits. Defaults to a setTimeout-based wait
   * that resolves early if the caller's signal aborts.
   */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** Max redirect hops followed before giving up. */
const MAX_REDIRECTS = 5

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 500
/** Upper bound on a single backoff wait so a large Retry-After cannot stall forever. */
const MAX_BACKOFF_MS = 30000

const USER_AGENT = 'Neurowire/0.1 (+https://github.com/neurowire/neurowire)'
const ACCEPT =
  'application/atom+xml, application/rss+xml, application/feed+json, application/json;q=0.9, text/html;q=0.8, */*;q=0.5'

/**
 * A retryable HTTP failure: an upstream 5xx or 429. Carries the status and any
 * parsed `Retry-After` delay so the retry loop can wait the requested time on a
 * 429. A 4xx other than 429 throws a plain Error instead, which is not retried.
 */
class RetryableHttpError extends Error {
  readonly status: number
  /** Delay in milliseconds parsed from a `Retry-After` header, when present. */
  readonly retryAfterMs?: number
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'RetryableHttpError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** Parse a `Retry-After` header (delta-seconds or an HTTP date) into milliseconds. */
function parseRetryAfter(value: string | null, now: number): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  // Only treat it as delta-seconds when the whole value is digits; Number(' ')
  // and Number('') coerce to 0, which would mean "retry instantly".
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const when = Date.parse(trimmed)
  if (Number.isNaN(when)) return undefined
  return Math.max(0, when - now)
}

/** Default sleep: a setTimeout that also resolves early if the signal aborts. */
function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Full-jitter exponential backoff, capped at {@link MAX_BACKOFF_MS}. */
function backoffDelay(base: number, attempt: number): number {
  const ceiling = base * 2 ** attempt
  const jittered = ceiling * (0.5 + Math.random() / 2)
  return Math.min(jittered, MAX_BACKOFF_MS)
}

/**
 * True for errors a fresh attempt might recover from (network blips, 5xx, 429,
 * and timeout aborts). The caller-driven abort case is handled in the retry loop
 * before this is consulted, so any abort that reaches here is a timeout.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableHttpError) return true
  // A timeout abort (our internal deadline) is retryable.
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true
  }
  // TypeError is what fetch throws for network-level failures (DNS, connection reset).
  return error instanceof TypeError
}

/** Sentinel reason attached to the internal timeout abort so it reads clearly in logs. */
const TIMEOUT_REASON = 'Neurowire fetch timed out'

/**
 * Fetch a URL over HTTP(S) with a per-attempt timeout and bounded retries.
 *
 * Each attempt runs the full manual redirect loop (see {@link attemptFetch}). On
 * a network error, a timeout, an upstream 5xx, or a 429 the request is retried
 * up to `retries` times with full-jitter exponential backoff (a 429 waits its
 * `Retry-After` instead). A 4xx other than 429, an invalid URL, an SSRF reject,
 * too many redirects, or a caller-driven abort are not retried. A 304 is a
 * success and is never retried; the cache is written only on a final 200.
 */
export async function fetchDocument(url: string, options: FetchOptions = {}): Promise<RawDocument> {
  const retries = options.retries ?? DEFAULT_RETRIES
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const delay = options.delay ?? defaultDelay

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    // A caller-driven abort short-circuits immediately, with no further attempts.
    if (options.signal?.aborted) {
      throw new DOMException('The fetch was aborted by the caller.', 'AbortError')
    }
    try {
      return await attemptFetch(url, options)
    } catch (error) {
      // The caller cancelled: reject now, do not retry.
      if (options.signal?.aborted) throw error
      lastError = error
      if (attempt >= retries || !isRetryable(error)) throw error
      const wait =
        error instanceof RetryableHttpError && error.retryAfterMs !== undefined
          ? Math.min(error.retryAfterMs, MAX_BACKOFF_MS)
          : backoffDelay(backoffMs, attempt)
      await delay(wait, options.signal)
    }
  }
  // Unreachable: the loop either returns or throws, but satisfies the type checker.
  throw lastError
}

/**
 * One fetch attempt: follow redirects manually (one hop at a time) so the
 * optional `validate` guard runs against every target, returning the body and
 * final URL. This closes the SSRF hole where a public URL 302-redirects to an
 * internal address: each hop is re-checked. A per-attempt timeout aborts a hung
 * hop; the caller's signal is composed with it so either can cancel.
 */
async function attemptFetch(url: string, options: FetchOptions): Promise<RawDocument> {
  const cacheKey = url
  let current = url

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Compose a per-attempt timeout signal with the caller's signal, if any. Tag
  // the timeout so the catch can distinguish a timeout (retry) from a caller
  // cancel (no retry).
  const timeoutController = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs > 0) {
    // Abort with a DOMException so fetch rejects with a real Error named
    // 'TimeoutError' (a bare string reason would surface as a non-Error that
    // isRetryable cannot classify, silently defeating timeout retries).
    timer = setTimeout(
      () => timeoutController.abort(new DOMException(TIMEOUT_REASON, 'TimeoutError')),
      timeoutMs,
    )
  }
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal

  try {
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
      // Conditional headers only apply to the originally requested URL. They are
      // re-sent on every retried attempt because this runs fresh each attempt.
      if (hop === 0) {
        const cached = options.cache?.get(cacheKey)
        if (cached?.etag) headers['if-none-match'] = cached.etag
        if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified
      }

      const res = await fetch(current, {
        redirect: 'manual',
        signal,
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
        const message = `Upstream responded ${res.status} ${res.statusText} for ${current}`
        // 5xx and 429 are transient; surface them as retryable. 429 carries its
        // Retry-After so the retry loop can honor the requested delay.
        if (res.status >= 500) throw new RetryableHttpError(res.status, message)
        if (res.status === 429) {
          const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'), Date.now())
          throw new RetryableHttpError(res.status, message, retryAfterMs)
        }
        throw new Error(message)
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
  } finally {
    if (timer) clearTimeout(timer)
  }
}
