# Epic 4: Self-host the API (operator owns security)

## Goal

Make `@neurowire/api` trivial to stand up, and make the security posture
**explicit**: neurowire ships no auth, no rate-limit, no CORS policy by default.
Anyone exposing it to the public internet owns hardening it (reverse proxy,
auth, WAF, network policy). We optimize for "run it yourself in 30 seconds" and
document the operator's responsibilities clearly, rather than baking in a
half-measure auth system.

This is a **deliberate non-decision on built-in security**: we expose, you
protect.

## Scope

- **Runnable artifacts:**
  - A documented `pnpm api` / `node packages/api/dist/index.js` entry with
    `PORT` / `HOST` env support (confirm/extend
    [api/src/index.ts](../../packages/api/src/index.ts)).
  - A `Dockerfile` for the api package (multi-stage: build, then a slim runtime
    image running the Hono server).
  - A `docker-compose.yml` example mounting `~/.config/neurowire/{meshes,
    constructs,taps}` so operators drop in their own bundles.
- **Config surface, documented:** `PORT`, `HOST`, `NEUROWIRE_CACHE_TTL`,
  `NEUROWIRE_MESHES`, `NEUROWIRE_CONSTRUCTS`, `NEUROWIRE_TAPS` in one table.
- **Security posture doc (the core of this epic):** a `SECURITY.md` /
  README "Self-hosting" section that states plainly:
  - No built-in auth / rate-limit / CORS. Do not expose raw to the public net.
  - `GET /feed?url=` is an **open fetch proxy** by design (it fetches arbitrary
    user-supplied URLs). The per-hop SSRF guard (commit `54b47c0`) blocks
    internal/loopback targets, but operators on private networks must still put
    it behind their own allowlist / network egress controls.
  - Recommended deployment: behind a reverse proxy (Caddy/nginx/Cloudflare) that
    adds TLS + auth + rate-limit. Provide a copy-paste Caddy and nginx snippet.
- **Optional, env-gated, off by default** (only if cheap, else defer): a
  `NEUROWIRE_CORS_ORIGIN` passthrough and a `NEUROWIRE_DISABLE_FEED_PROXY=1` to
  turn off the arbitrary-URL `/feed` route for operators who only want named
  meshes/constructs. These are knobs, not a security framework.

## Non-goals

- Building an auth system, API keys, user accounts, or a rate limiter in-app.
  (Explicitly punted to the reverse proxy. This is the whole point of the epic.)
- A hosted/managed service.
- Multi-tenant isolation.

## Dependencies

None hard. Pure `api` + docs + ops files. Best done **after the API surface is
stable** (so the Dockerfile/compose/docs do not chase a moving target), i.e.
late in the sequence, but before any public launch announcement.

## Steps

1. Confirm `api/src/index.ts` reads `PORT`/`HOST` from env; add if missing.
2. Write a multi-stage `Dockerfile` (pnpm build -> slim node:24 runtime,
   non-root user, `HEALTHCHECK` hitting `/healthz`).
3. Write `docker-compose.yml` with volume mounts for the three config dirs and an
   example reverse-proxy service (commented Caddy).
4. Write the "Self-hosting" README section + `SECURITY.md`:
   - config env table,
   - the explicit "no built-in security, operator owns it" statement,
   - the `/feed` open-proxy caveat + SSRF-guard note,
   - copy-paste Caddy + nginx reverse-proxy snippets (TLS + basic auth +
     rate-limit).
5. (Optional, only if trivial) add `NEUROWIRE_CORS_ORIGIN` and
   `NEUROWIRE_DISABLE_FEED_PROXY` env knobs + tests; otherwise note as follow-up.
6. Smoke test: `docker build`, `docker run`, hit `/healthz`, `/mesh?src=ai-news`.

## Risks / decisions

- **Open fetch proxy is the real risk.** Even with the SSRF guard, an exposed
  `/feed` lets anyone use your server to fetch arbitrary public URLs (bandwidth
  abuse, being a relay). The docs MUST call this out, and the
  `NEUROWIRE_DISABLE_FEED_PROXY` knob gives a clean opt-out for mesh-only
  operators. Strongly recommend documenting "do not expose `/feed` publicly
  without auth/rate-limit in front."
- **Stating 'security is on you' is a real stance, document it loudly** so an
  operator cannot say they were not warned.

## Acceptance

- `docker compose up` serves `/healthz` and a bundled mesh.
- README + SECURITY.md clearly state the no-built-in-security posture, the
  `/feed` open-proxy caveat, and provide a reverse-proxy recipe.
- Operators can mount their own meshes/constructs/taps without rebuilding.
