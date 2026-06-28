# Epic 3: Fetch hardening (timeout, retry, backoff)

## Goal

Make `fetchFeed` / `fetchMesh` / `fetchConstruct` resilient. Today
[fetch.ts](../../packages/ingest/src/fetch.ts) has:

- no request timeout (a hung host can stall a whole mesh/construct fetch),
- no retry (one transient 5xx or DNS blip drops a source permanently),
- no backoff.

Meshes already fail partial-silent (failed sources are dropped via
`Promise.allSettled`), so a flaky source silently disappears from output. This is
the highest-impact reliability fix and everything else (watch mode, API, sinks)
rides on it.

## Scope

- Add a `FetchOptions` bag threaded through `fetchFeed` (and forwarded by
  `fetchMesh` / `fetchConstruct`):
  - `timeoutMs?: number` (default e.g. 15000) - per-attempt deadline via
    `AbortController`.
  - `retries?: number` (default e.g. 2) - max additional attempts.
  - `backoffMs?: number` (default e.g. 500) - base for exponential backoff with
    jitter.
  - `signal?: AbortSignal` - caller cancellation, composed with the timeout
    signal.
- Retry policy: retry on network error, timeout/abort (not caller abort), and
  `5xx` / `429`. Do **not** retry `4xx` (except 429), invalid URL, SSRF reject,
  or too-many-redirects. Honor `Retry-After` on 429 when present.
- Preserve existing conditional-cache behavior (ETag / Last-Modified) and the
  per-hop SSRF `validate` guard (commit `54b47c0`) unchanged across retries.
- Surface a structured failure so callers (mesh) can log *which* source failed
  and *why* instead of a silent drop (still non-fatal for meshes).

## Non-goals

- robots.txt (separate concern, separate epic).
- Connection pooling / global rate limiting across hosts (revisit if needed).
- Pagination / multi-page following.
- Changing the partial-failure semantics of meshes (still skip-and-continue);
  only improve *observability* of the skip.

## Dependencies

None hard. Pure `ingest`. Should land **early** (sequence #1) because Epic 8
testing and any future watch/API work benefit from a stable fetch core. Uses
only Web-standard `AbortController` / `AbortSignal` (Node >=24), no new deps.

## Design notes

- **Compose signals:** build an internal `AbortController` for the timeout, and
  if the caller passed `signal`, abort the internal one when the caller's fires
  (`AbortSignal.any([...])` is available on Node 24; prefer it).
- **Distinguish abort causes:** caller-cancel must reject immediately and NOT
  retry; timeout-cancel should retry (until retries exhausted). Tag the abort
  reason so the catch can tell them apart.
- **Backoff:** `delay = backoffMs * 2**attempt * (0.5 + random/2)` (full jitter),
  capped. On 429 with `Retry-After`, use that instead.
- **Conditional cache + retry:** a `304` is success, never retried. Cache writes
  happen only on a final `200`. Ensure a retried request re-sends the conditional
  headers each attempt.
- **Redirects + retry:** the manual 5-hop redirect loop stays inside one attempt;
  a retry restarts from the original URL (re-validates every hop again, keeping
  the SSRF guarantee).

## Steps

1. Read [fetch.ts](../../packages/ingest/src/fetch.ts) end to end: redirect loop,
   conditional-cache hooks, the `validate` SSRF callback, error throw points.
2. Introduce `FetchOptions` and an internal `attemptFetch()` (one try, current
   logic) wrapped by a `withRetry()` loop.
3. Implement timeout + signal composition + jittered backoff + 429 `Retry-After`.
4. Thread `FetchOptions` through `fetchFeed`, `fetchMesh`, `fetchConstruct`
   (forward, with sane defaults; do not break existing call sites - options are
   optional).
5. Improve mesh/construct partial-failure logging to include source name + error
   (stderr, still non-fatal).
6. Tests (ingest, keep 90/95/90): mock `fetch`/timers (vitest fake timers).
   - retries on 500 then succeeds; gives up after N.
   - no retry on 404 / invalid URL / SSRF reject.
   - 429 honors `Retry-After`.
   - timeout aborts and retries; caller `signal` aborts immediately, no retry.
   - conditional headers re-sent on retry; 304 not retried.
   - redirect chain re-validated on a retried attempt.
7. `pnpm build && pnpm test && pnpm typecheck && pnpm lint`.

## Risks / decisions

- **Default retries could amplify load on a truly-down host.** Keep defaults
  small (2) with jitter; document the knobs.
- **Fake timers + AbortController** interplay in tests is fiddly; isolate the
  delay function so it is injectable/mantellable in tests.
- **Backwards compat:** all new options optional; existing callers unchanged.

## Acceptance

- A source returning 500 then 200 ends up in the feed.
- A hung host aborts at `timeoutMs` instead of stalling the whole mesh.
- Caller can cancel an in-flight fetch via `signal`.
- Failed sources are logged with name + reason, not silently dropped.
- ingest coverage stays within thresholds.
