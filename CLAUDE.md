# Neurowire

Turn any blog, website, RSS, or Atom feed into clean, modern feeds. Point it at a URL and get back **NWF** (a compact custom format), **Atom**, **JSON Feed 1.1**, **Markdown**. Bundle many sources into one **mesh**, keep the history in an append-only **journal**, follow it live with **tail**, and exchange journal deltas between nodes with **sync**. Render a feed or mesh into a self-contained **HTML news page**. Usable as a library, a CLI, and an HTTP API.

## Monorepo layout

pnpm workspaces. Dependency direction is strictly one way: `core` <- `ingest` <- (`taps`, `tap-wizard`) <- (`cli`, `api`, `web`). `taps` and `tap-wizard` are siblings and do not import each other.

| Package | Role | Runtime deps |
|---------|------|--------------|
| `@neurowire/core` | The format authority: canonical model (zod), serializers (NWF, atom, jsonfeed, markdown), `validateNwf`, `mergeFeeds`, `Mesh` types. Pure, no network, no DOM. | `zod` only |
| `@neurowire/ingest` | Fetch + detect + parse (RSS/Atom/RDF/JSON Feed), HTML auto-detect, the CSS-template engine + registry, `fetchFeed`/`ingestDocument`/`fetchMesh`, the journal store, the `pollFeed` engine, and the `nwf-sync/1` pull client. | core, cheerio, fast-xml-parser, zod |
| `@neurowire/taps` | Curated per-host `FeedTemplate`s for feed-less sites (`claudeBlog`, `cursorBlog`) + loaders (`registerAllTaps`, `loadTaps`, ...). | core, ingest |
| `@neurowire/tap-wizard` | Deterministic tap authoring and healing: `suggestCandidates`, `previewTemplate`, `verifyTemplate`, `createTapSession`. No LLM, no API key, no network beyond the one fetch. | core, ingest, cheerio |
| `@neurowire/cli` | `neurowire` bin: terminal view, `--format`, `--mesh`, `--taps`, and the `validate`, `tap`, `journal`, `tail`, `sync`, `peers`, `opml` subcommands. | core, ingest, taps, tap-wizard |
| `@neurowire/api` | Hono service: `GET /feed`, `GET`/`POST /mesh`, `GET /tail` (SSE), `/sync/*`, `/healthz`. | core, ingest, taps, hono |
| `@neurowire/web` | Static HTML page generator: `toHtml(feed)` + `neurowire-web` bin (mesh or feed URL -> self-contained page). NOT a React app. | core, ingest, taps |

## Key concepts

- **Model** (`core/src/model.ts`): `NeurowireFeed { id, title, home?, self?, updated, authors?, generator?, entries }`, `NeurowireEntry { id, title, link, published?, updated?, summary?, authors?, tags?, source? }`. Every parser produces it; every serializer consumes it. List-metadata only (no full article bodies).
- **Output formats** (`core/src/serialize/`): `nwf`, `atom`, `json` (JSON Feed 1.1), `md`. Registered in `FORMATS`/`MEDIA_TYPES`/`EXTENSIONS` and dispatched by `serialize(feed, format)`. **HTML is deliberately NOT a core format**, it lives in `@neurowire/web` (`toHtml`), so core stays format-pure and dependency-light.
- **nwf** (`core/src/serialize/nwf.ts`): compact line-oriented format (interned authors/tags/sources, relative links, delta timestamps). Round-trips via `fromNwf`. `validateNwf` returns line-numbered diagnostics. Full spec in the README.
- **Taps** (`@neurowire/taps`): a tap is a per-host `FeedTemplate` (CSS selectors) for sites with no feed. `link` is optional (omit it when the matched `item` element is itself the `<a>`). Resolution order in `ingestDocument`: explicit template -> discovered feed link -> registry tap (by host) -> heuristic auto-detect. Users add taps via `--taps`, `NEUROWIRE_TAPS`, or `~/.config/neurowire/taps/*.json`.
- **Tap wizard** (`@neurowire/tap-wizard`): the authoring and anti-rot half of taps, and **deliberately model-free**. `suggestCandidates` ranks selectors from page structure (elements repeating 3 to 300 times that contain a link, keyed `tag.firstClass`), `previewTemplate` runs the real `ingestDocument` so a preview can never disagree with a fetch, and `verifyTemplate` is the gate: minimum item count, non-empty titles, resolvable and unique links, date rate, and a common-ancestor probe that rejects nav and footer matches. **Nothing writes a tap without passing the gate**, not the wizard, not heal. `createTapSession` holds one fetched document and re-applies picks against it, so choosing a field never refetches. CLI: `tap wizard` (interactive, `--yes` for top candidates), `tap check` (CI-safe health report, exits 1 on breakage), `tap heal` (re-author only the broken fields, `.bak` written once). A tap may carry an optional `url` hint naming its listing page; a tap without one is reported `unknown` rather than probed at `https://<host>/`, which would call a healthy path-scoped tap broken.
- **Tail and the poll engine** (`ingest/src/poll.ts`, `cli/src/tail.ts`, `api/src/tail.ts`): `pollFeed(load, opts)` is an async generator (dedupe via `entryKey`/`newEntries`, 30s interval floor, jittered waits, resumable seen-set, per-tick error isolation, abort support) and is **the only polling loop in the codebase**: CLI `tail`, CLI `--watch`, and the API's `GET /tail` all run on it. `tail -f nwf` emits real NWFJ through the Epic 9 encoder, so a live stream *is* a journal being written. `GET /tail` is SSE via Hono's `streamSSE` with a registry of shared loops keyed by **target + interval + journal id** (refcounted, torn down on last unsubscribe), a heartbeat comment, and `Last-Event-ID`/`?since=` replay when a journal is attached. Concept page `docs/concepts/tail.md`.
- **Sync** (`docs/formats/nwf-sync.md`, `ingest/src/sync.ts`, `api/src/sync.ts`): `nwf-sync/1`, a pull-only HTTP protocol that makes NWF a wire protocol, not just a format. Four read-only routes (`/sync/journals`, `/sync/head`, `/sync/since`, `/sync/snapshot`), all carrying `NWF-Sync-Version: 1`. Client `pullJournal`/`syncPeers` short-circuits on a matching head, verifies the hash chain before merging, and recovers from a `410` (cursor older than retention) by bootstrapping from the snapshot. **Responses serve one whole segment, never a concatenation**: NWFJ dictionary indices are per segment and the chain reseeds at each `J` header, so glued segments decode and verify wrongly; clients loop on `NWF-Sync-Complete: 0`. Nothing is published without `NEUROWIRE_SYNC_PUBLISH` or `~/.config/neurowire/sync.json`; optional bearer token via `NEUROWIRE_SYNC_TOKEN`, checked before the publish list so a 401 leaks no journal names. Peer cursors live per `(peer, journal)` and are written **only after** the append lands, so a crash costs a re-pull, not a hole. The hash chain is integrity, **not authenticity**: say so in docs, never imply signing. Concept page `docs/concepts/sync.md`, setup guide `docs/guide/federation.md`.
- **Meshes** (`Mesh` in core, `fetchMesh` in ingest): a named bundle of `{ name, sources: [{ name, url }] }` fetched in parallel and merged (tagged by source, deduped, newest-first). The API serves named meshes from `~/.config/neurowire/meshes/` plus a bundled `ai-news` (see `api/src/meshes.ts`).
- **Journals** (`core/src/journal.ts`, `ingest/src/journal-store.ts`): an append-only archive of a feed's history in **NWFJ** (`nwfj`), the append-only sibling of NWF. Dictionaries grow one line at a time (`A+`/`T+`/`S+`), timestamps are absolute (`published` and `updated` keep separate cells), every entry carries a monotonic `seq` (a cursor), and `C` lines checkpoint a hash chain. **NWFJ is not an output format**: it stores history rather than rendering it, so `FORMATS`/`serialize()` are untouched; read one back with `journalToFeed` and serialize that. The store writes size-capped `<id>.<nnnnn>.nwfj` segments plus a rebuildable `<id>.manifest.json`; queries prune whole segments by date range and dictionary vocabulary. Querying invents no new language: `queryJournal` composes `filterEntries`+`selectEntries`, so archives and live feeds answer identically. CLI: `--journal <id>`/`--journal-dir`, and `journal head|cat|query`. Spec in `docs/formats/nwfj.md`, concept page in `docs/concepts/journals.md`.
- **Constructs** (`Construct` in core, `fetchConstruct`/`flattenConstruct` in ingest): a named bundle of meshes (a "repo" of feeds). Members are inline meshes or `{ ref }` references (string shorthand allowed), resolved by a pluggable `MeshResolver` (`createConfigMeshResolver` reads `~/.config/neurowire/meshes`). `fetchConstruct` keeps the per-mesh grouping (`FetchedConstruct`); `flattenConstruct` collapses it to one feed for the serializers. The CLI shows grouping in the terminal and flattens for `--format`; the API serves only flattened feed formats (no HTML); `@neurowire/web` owns the grouped HTML (`toConstructHtml` overview + per-mesh pages via `toConstructPages`, or `--combined`). API serves named constructs from `~/.config/neurowire/constructs/` plus a bundled `daily` (see `api/src/constructs.ts`).

## Commands

```bash
pnpm install
pnpm build            # tsup build all packages (topological)
pnpm test             # vitest, offline (live tests skip)
pnpm test:live        # NEUROWIRE_LIVE=1, runs the *.live.test.ts network tests
pnpm test:coverage    # v8 coverage + thresholds
pnpm typecheck        # tsc --noEmit per package
pnpm lint             # biome check .
pnpm cli -- <args>    # run the CLI in dev (note the --, see gotchas)
pnpm validate <url>   # validate an NWF file/url
pnpm page -- --mesh <file> --out <html>   # generate an HTML page
pnpm api              # start the API
```

## Publishing to npm (read before you publish)

**Always authenticate with the `NPM_TOKEN` in `.env`, never with `~/.npmrc`.**
`~/.npmrc` may hold a stale, older token that no longer has publish rights, and
because `npm`/`pnpm publish` read `~/.npmrc` by default, using it fails with a
misleading `E404`/`E403` (it looks like the token was "revoked" but it was just
the wrong token). `.env` is gitignored and holds the current token; it is the
single source of truth for publishing.

Publish all packages with the `.env` token, via a throwaway config so `~/.npmrc`
is untouched:

```bash
# from the repo root, with the current token in .env (NPM_TOKEN=...)
NPM_TOKEN=$(grep -E '^NPM_TOKEN=' .env | cut -d= -f2-)
tmp=$(mktemp)
printf '//registry.npmjs.org/:_authToken=%s\nregistry=https://registry.npmjs.org/\n' "$NPM_TOKEN" > "$tmp"
pnpm build
npm_config_userconfig="$tmp" pnpm -r publish --no-git-checks --access public
rm -f "$tmp"
```

Notes:
- Bump the relevant `package.json` versions first; npm versions are immutable, so
  a failed/duplicate version cannot be re-pushed.
- Internal deps use `workspace:*`; pnpm rewrites them to real versions at pack
  time, so publish in topological order (pnpm does this automatically).
- Do not put the real token in any tracked file. `.npmrc.example` keeps the
  `${NPM_TOKEN}` placeholder; the real value lives only in `.env`.
- Bumping `cli` means bumping the `VERSION` constant in `cli/src/index.ts` too,
  or `neurowire --version` lies.

**`workspace:*` publishes as an EXACT pin, so bump every dependent, not just the
package you changed.** pnpm rewrites `workspace:*` to `"0.8.0"`, never `"^0.8.0"`.
If `core`/`ingest` are bumped but `taps` is not, the already-published `taps` keeps
pinning the old `ingest`, npm installs a second copy, and the module-level tap
registry in `ingest/src/html/registry.ts` splits: `taps` registers into one copy
while the CLI reads the other, so every curated tap silently stops resolving. A
`core` or `ingest` release therefore means a patch bump and republish of `taps`,
`tap-wizard`, `taps-pack`, `cli`, `api`, and `web` as well. Verify before publishing with:

```bash
cd packages/cli && pnpm pack --pack-destination /tmp >/dev/null &&
  tar -xzOf /tmp/neurowire-cli-*.tgz package/package.json | grep '@neurowire'
```

### Release order (do not improvise this)

1. Bump versions + `CHANGELOG.md` entries + docs, in one change.
2. `pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm docs:build`.
3. **Land it on `main` first.** Published artifacts must trace to mainline; never
   publish from an unmerged branch.
4. Publish to npm (the command above).
5. **Deploy the docs (a separate, manual step, see below).** Merging does not do it.

Steps 3 and 4 are in that order on purpose. Publishing first leaves the registry
serving code that is not on `main`.

**Always update the docs as part of a bump + publish.** A release is not done
until the docs reflect it. Whenever you bump a version and publish, in the same
change:
- update each changed package's `CHANGELOG.md` with the new version entry, and
- update the VitePress docs under `docs/` (and `README.md` where relevant) for any
  new or changed behavior: new flags/subcommands in `docs/guide/cli.md`, new
  formats in `docs/formats/` + `docs/concepts/output-formats.md`, new exports in
  the `docs/reference/<pkg>.md` page, etc.
- run `pnpm docs:build` and confirm it passes (it fails on dead links).
- follow the NWF naming/ordering convention in any docs you touch (write the
  format as `NWF` in prose, and lead every format list with NWF; code literals
  like the `nwf` key, `.nwf`, `toNwf` stay lowercase).

## Deploying the docs site (read this before saying anything is "published")

**https://neurowire.starside.io is hosted on Vercel, and the Vercel project has NO
git integration. Pushing to `main` deploys nothing.** The docs go live only when
someone runs, from the repo root:

```bash
vercel --prod --yes
```

Vercel builds it per `vercel.json`: `pnpm docs:build` (VitePress), serving
`docs/.vitepress/dist`. Until that command runs, the live site keeps serving the
previous build no matter how many commits land. It has silently drifted two months
behind `main` this way.

**`.github/workflows/pages.yml` does NOT build the VitePress docs.** Despite the
name, it runs `scripts/build-docs.ts`, a separate hand-rolled 7-page site
(`index/mesh/taps/packages...`), plus the `/example` construct, and deploys those to
**GitHub Pages** (`starside-io.github.io/neurowire`). It never invokes VitePress.
Its push trigger also filters on `packages/**`, `examples/*.json`, and `scripts/**`,
with no `docs/**`, so editing `docs/` does not even rebuild that other site except
on its 6-hourly cron.

Two sites, two pipelines, neither driven by a plain `git push`:

| Surface | Built by | Deployed by | Trigger |
|---------|----------|-------------|---------|
| neurowire.starside.io (the real docs) | `pnpm docs:build` (VitePress, `docs/`) | Vercel | **manual `vercel --prod`** |
| starside-io.github.io/neurowire + `/example` | `scripts/build-docs.ts` | GitHub Pages | push to `main` (filtered paths) + 6h cron |

So: after a docs change, verify the live URL, do not infer it from a green CI run.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://neurowire.starside.io/<page>?cb=$RANDOM"
```

A cache-busting query is needed because Vercel serves `x-vercel-cache: HIT`; check
the `age` header if a page looks stale (a large `age` means no redeploy happened).

## Git workflow

- **Integrate feature branches by rebase, not merge commits.** Keep history
  linear: `git rebase <base> <feature>` (or rebase the feature onto the base and
  fast-forward), so the log is a straight line with no "merge: ..." commits.
- When several feature branches/worktrees are built in parallel, rebase them in
  sequence onto the integration branch and resolve conflicts during the rebase,
  rather than a chain of merge commits.

## Tooling & conventions

- TypeScript strict, ESM, `moduleResolution: Bundler`, `verbatimModuleSyntax` (use `import type` for type-only imports). Build with **tsup** (dist + d.ts), run dev with **tsx**.
- **Biome** for lint + format: single quotes, no semicolons, trailing commas, width 100. Run `pnpm lint`; auto-fix with `biome check --write`.
- **No em-dashes** anywhere (code, comments, docs, UI copy). Use commas, periods, parens, or colons.
- Tests: **vitest**, colocated as `*.test.ts` next to source; fixtures in `src/__fixtures__/`; network tests are `*.live.test.ts` gated behind `NEUROWIRE_LIVE` via `describe.skipIf`.
- Coverage thresholds (`vitest.config.ts`): `core` and `taps` at 100% statements/functions/lines; `tap-wizard` at 95/95/95 (pure and fixture-driven); `ingest` at 90/95/90; the runnable layers `api` at 85/85/85, `cli` at 80/85/80, and `web` at 85/85/85 (modest, ratchet up later). Keep them green when adding code to those packages. The thin process/server entrypoints (`api/src/index.ts`, `cli/src/index.ts`, `web/src/cli.ts`) are excluded from coverage: their pure logic is extracted into tested modules (`cli/src/pipeline.ts`, `web/src/cli-helpers.ts`, `api/src/app.ts`) and the entrypoints are just argv/fs/network/`serve()` orchestration.

## Gotchas (read before editing)

- **Cross-package tests import the sibling's built `dist`**, not its `src` (e.g. taps tests import `@neurowire/ingest` from dist). So `pnpm build` before running tests if you changed a dependency, and such tests do NOT count toward the dependency's `src` coverage. A package's OWN tests import its `src`.
- **In dev, pass CLI flags after `--`** (`pnpm cli -- --mesh x.json -f atom`): pnpm otherwise eats `-f` as its own `--filter`. The CLI also strips one leading `--` that pnpm/tsx inject. The built binary needs no `--`.
- **Adding an output format**: edit `core/src/serialize/` (the serializer + `FORMATS`/`MEDIA_TYPES`/`EXTENSIONS`/`serialize` switch/re-export) and add a test (core must stay 100%). Do not add presentation/page formats to core.
- **Touching the line formats**: `nwf` and `nwfj` share one cell grammar in `core/src/serialize/cells.ts` (escaping, Unit-Separator sub-fields, interning keys, epoch helpers). Change it there, never in one format only, or the two drift apart. The journal chain uses core's FNV-1a `hashHex` on purpose: core stays free of `node:crypto`, so the chain detects corruption but is **not** a signature, and the `J` version cell is the upgrade path.
- **Adding a tap**: inspect the real page first (a throwaway cheerio script over the saved HTML), or just run `neurowire tap wizard <url>`, then add `taps/src/sites/<host>.ts`, push it into the `taps` array, and add an offline fixture test plus an opt-in `*.live.test.ts`. Bundled taps are code, not user files: `tap heal` prints a diff for them rather than writing into the repo or `node_modules`.
- **Touching the polling loop**: there is exactly one (`ingest/src/poll.ts`). CLI `tail`, CLI `--watch`, and the API's `GET /tail` all consume it, so a change there hits three surfaces. Keep the `delay`/`random` injection points: every poll test runs on them instead of real timers.
- **Touching sync**: the wire payload is raw NWFJ segment bytes, so a change to segment layout or the chain in `core/src/journal.ts` is a protocol change. `docs/formats/nwf-sync.md` is written before the code and the `NWF-Sync-Version` header is the negotiation slot; bump it rather than silently changing a response shape.
- The remote is `origin` -> `github.com/starside-io/neurowire`, default branch `main`. `.github/workflows/pages.yml` deploys the **hand-rolled** `scripts/build-docs.ts` site plus the AI news example (`/example`) to GitHub Pages; it does **not** touch the VitePress docs, and the live docs site is a manual Vercel deploy. See "Deploying the docs site" above before claiming anything is published.
