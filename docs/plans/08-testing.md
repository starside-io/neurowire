# Epic 8: Test the untested layers (api, cli, web)

## Goal

`core` and `taps` are gated at 100% and `ingest` at 90/95/90
([vitest.config.ts](../../vitest.config.ts)), but **api, cli, and web have no
coverage thresholds** and are largely untested (only `cli/src/sinks.ts` has
tests). These are the layers users actually run. Add real tests and turn on
modest thresholds so the runnable surfaces cannot silently regress.

## Scope

- **api:** route tests via Hono's test client (`app.request(...)`):
  - `GET /` metadata, `GET /healthz`.
  - `GET /feed` happy path, missing `url` (400), unknown `format` (400), upstream
    failure (502). Mock ingest's fetch.
  - `GET /mesh` / `GET /construct` by name (bundled `ai-news` / `daily`), unknown
    name (404), path-traversal name rejected.
  - `POST /mesh` / `POST /construct` with body.
  - Cache behavior: second identical request served from TTL cache; cache key
    includes format; `Cache-Control` header present.
- **cli:** extract pure helpers so they are unit-testable without spawning a
  process, then test:
  - arg parsing + the filter/sort/limit/date-window pipeline (`--filter`,
    `--exclude`, `--sort`, `--order`, `--limit`, `--since`, `--max-age`,
    `--today`, `--this-week`, `--between`).
  - format dispatch (`-f`), template override, mesh/construct selection.
  - watch-mode dedup logic (seen-set, state file round-trip) without real timers
    or network (inject the fetch + clock).
  - sinks already covered; keep.
- **web:** snapshot + assertion tests for `toHtml`, `toConstructHtml`,
  `toConstructPages`:
  - structure (entry count, source accents cycle, per-mesh page filenames +
    collision handling via `meshSlug`).
  - self-contained invariant: output has no off-host `http(s)` refs except entry
    links.
  - date filters (`--since`, `--today`) in the web CLI helper.
  - if Epic 6 lands, cover the search markup + `data-search`.
- Add thresholds to `vitest.config.ts` for the three packages (start modest,
  ratchet up): suggest **api 85/85/85, cli 80/85/80, web 85/85/85**, then raise.

## Non-goals

- Live network tests (those stay `*.live.test.ts`, opt-in via `NEUROWIRE_LIVE`).
- 100% on api/cli/web (start modest; ratchet later).
- E2E/process-spawn tests for the CLI binary (prefer testing extracted pure
  functions; one thin smoke test of `main()` is enough).

## Dependencies

- **Soft dep on all feature epics (1, 2, 3, 6).** Coverage should target the
  *final* code. Two viable strategies:
  1. **Grow alongside:** each feature epic adds its own tests as it lands (1, 2,
     3 already require tests in their plans). Then this epic only fills the
     api/cli/web gaps and turns on thresholds.
  2. **Single pass last:** freeze features, then do one testing sweep.
- Recommended: **do this epic last** (sequence #7) so thresholds lock a stable
  surface. The per-feature tests in epics 1/2/3 keep core/ingest green meanwhile.
- May require small **refactors for testability** (extract pure helpers in cli),
  which is the only place this epic touches non-test code.

## Steps

1. **api:** add `app.test.ts` using `app.request()`. Stub the ingest fetch layer
   (inject or `vi.mock`). Cover routes + cache + error codes above.
2. **cli:** refactor `index.ts` to export the pure pipeline pieces (filter,
   sort, date-window, dedup) so they import cleanly into tests; add
   `pipeline.test.ts`, `watch.test.ts`. Keep `main()` thin.
3. **web:** add `render.test.ts` (snapshots + structural asserts + self-contained
   grep) and `cli.test.ts` for the date-filter helpers.
4. Turn on thresholds in `vitest.config.ts` for api/cli/web; run
   `pnpm test:coverage` and fill gaps until green.
5. `pnpm build && pnpm test && pnpm typecheck && pnpm lint`.
6. Note the new thresholds in CLAUDE.md's coverage section.

## Risks / decisions

- **CLI testability requires extraction.** Keep the refactor mechanical
  (move logic into exported functions, `main()` orchestrates). This is the only
  production-code change; review carefully so behavior is identical.
- **Cross-package dist gotcha:** api/web tests that import sibling packages hit
  built `dist`, not `src` (per CLAUDE.md). Run `pnpm build` first; those imports
  do not count toward the sibling's coverage. Test each package's own `src`.
- **Threshold too high too soon** stalls the epic; start modest, ratchet in a
  follow-up.

## Acceptance

- `pnpm test:coverage` passes with new thresholds on api/cli/web.
- Routes, the CLI filter pipeline, watch dedup, and the three web renderers all
  have direct tests.
- CLAUDE.md coverage section updated.
