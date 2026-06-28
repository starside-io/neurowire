# Fetching

Every source Neurowire reads, a feed, a website, a mesh member, goes through one HTTP client: `fetchDocument`, in [`packages/ingest/src/fetch.ts`](https://github.com/neurowire/neurowire). It is built for fetching feeds from untrusted URLs on a schedule, so it handles timeouts, retries, conditional requests, and redirect-based SSRF in one place.

```ts
import { fetchDocument, createMemoryCache } from '@neurowire/ingest'

const doc = await fetchDocument('https://example.com/feed.xml', {
  timeoutMs: 15000,
  retries: 2,
  cache: createMemoryCache(),
})
```

`fetchDocument` returns a `RawDocument`: the final `url` (after redirects), the `contentType`, the `body`, optional `etag` / `lastModified` validators, and a `notModified` flag set when the body came from cache via a 304.

## `FetchOptions`

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `timeoutMs` | `number` | `15000` | Per-attempt deadline. Set `0` to disable. |
| `retries` | `number` | `2` | Max additional attempts after the first. |
| `backoffMs` | `number` | `500` | Base delay for exponential backoff. |
| `signal` | `AbortSignal` | none | Caller-driven cancellation. |
| `cache` | `ConditionalCache` | none | Store for ETag / Last-Modified conditional requests. |
| `validate` | `(url) => void \| Promise<void>` | none | Per-hop guard (throw to block). See SSRF below. |
| `delay` | `(ms, signal) => Promise<void>` | setTimeout-based | Injectable sleep (tests drive it with fake timers). |

## Retry policy

Each attempt runs the full manual redirect loop. On failure the request is retried up to `retries` times. The classification is deliberate:

**Retried** (a fresh attempt might recover):

- Network-level failures (DNS, connection reset), which `fetch` surfaces as a `TypeError`.
- Internal timeout aborts (the per-attempt deadline).
- Upstream `5xx` responses.
- `429 Too Many Requests`.

**Not retried** (a retry cannot help):

- `4xx` other than `429`.
- An invalid or unsupported-protocol URL.
- An SSRF rejection from the `validate` guard.
- Too many redirects (more than 5 hops).
- A caller-driven abort via `signal` (rejects immediately, no further attempts).

### Honoring `Retry-After`

A `429` carries its `Retry-After` header, parsed (delta-seconds or an HTTP date) into milliseconds. When present, the retry loop waits that long instead of the computed backoff, capped at 30 seconds so a hostile or huge `Retry-After` cannot stall the process forever.

### Jittered backoff

When there is no `Retry-After`, the wait is full-jitter exponential backoff: `base * 2 ** attempt`, multiplied by a random factor in `[0.5, 1.0)`, capped at 30 seconds. Jitter spreads out retries so many sources failing at once do not all retry in lockstep.

## Conditional cache (304 handling)

Pass a `ConditionalCache` and `fetchDocument` will make conditional requests. After a successful `200`, it stores the body together with the response's `ETag` and `Last-Modified`. On the next fetch of that URL it sends:

- `If-None-Match` from the stored `ETag`.
- `If-Modified-Since` from the stored `Last-Modified`.

If the server replies `304 Not Modified`, the cached body is returned with `notModified: true`. A `304` is a success and is never retried. The cache is written only on a final `200`.

Conditional headers apply only to the originally requested URL (the first hop), not to redirect targets, and they are re-sent on every retried attempt.

`createMemoryCache()` returns a simple `Map`-backed `ConditionalCache`. The cache is always injected by the caller; the library keeps no global state, so you control its lifetime and scope.

```ts
const cache = createMemoryCache()
await fetchDocument(url, { cache }) // 200, body cached
await fetchDocument(url, { cache }) // may return { notModified: true }
```

## Redirects and the per-hop SSRF guard

Redirects are followed **manually**, one hop at a time, up to 5 hops (`Location` is resolved against the current URL). This exists so the optional `validate` guard runs against **every** target, not just the URL the caller passed in.

This closes the classic SSRF bypass where a public URL `302`-redirects to an internal address (`http://169.254.169.254/`, `http://localhost/`, a private RFC 1918 range). `validate` is called for the initial URL and for each redirect target before the request is made. Throwing from `validate` blocks that hop, and the rejection is **not** retried.

::: warning
If you fetch user-supplied URLs, supply a `validate` that rejects private, loopback, and link-local addresses. Because redirects are re-validated per hop, a public URL cannot redirect its way into your internal network.
:::

Only `http:` and `https:` are allowed; any other protocol throws an unsupported-protocol error.

## Request headers

Every request sends a stable identifying `User-Agent`:

```
Neurowire/0.1 (+https://github.com/neurowire/neurowire)
```

and an `Accept` header that prefers feed formats, then JSON, then HTML:

```
application/atom+xml, application/rss+xml, application/feed+json,
application/json;q=0.9, text/html;q=0.8, */*;q=0.5
```

## Cancellation

The caller's `signal` is composed with the internal per-attempt timeout signal, so either can cancel an in-flight request. A caller abort is distinguished from a timeout: the timeout is retryable, the caller abort is not.
