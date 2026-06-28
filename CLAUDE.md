# Neurowire

Turn any blog, website, RSS, or Atom feed into clean, modern feeds. Point it at a URL and get back **NWF** (a compact custom format), **Atom**, **JSON Feed 1.1**, **Markdown**. Bundle many sources into one **mesh**, and render a feed or mesh into a self-contained **HTML news page**. Usable as a library, a CLI, and an HTTP API.

## Monorepo layout

pnpm workspaces. Dependency direction is strictly one way: `core` <- `ingest` <- `taps` <- (`cli`, `api`, `web`).

| Package | Role | Runtime deps |
|---------|------|--------------|
| `@neurowire/core` | The format authority: canonical model (zod), serializers (NWF, atom, jsonfeed, markdown), `validateNwf`, `mergeFeeds`, `Mesh` types. Pure, no network, no DOM. | `zod` only |
| `@neurowire/ingest` | Fetch + detect + parse (RSS/Atom/RDF/JSON Feed), HTML auto-detect, the CSS-template engine + registry, `fetchFeed`/`ingestDocument`/`fetchMesh`. | core, cheerio, fast-xml-parser, zod |
| `@neurowire/taps` | Curated per-host `FeedTemplate`s for feed-less sites (`claudeBlog`, `cursorBlog`) + loaders (`registerAllTaps`, `loadTaps`, ...). | core, ingest |
| `@neurowire/cli` | `neurowire` bin: terminal view, `--format`, `--mesh`, `--taps`, `validate` subcommand. | core, ingest, taps |
| `@neurowire/api` | Hono service: `GET /feed`, `GET`/`POST /mesh`, `/healthz`. | core, ingest, taps, hono |
| `@neurowire/web` | Static HTML page generator: `toHtml(feed)` + `neurowire-web` bin (mesh or feed URL -> self-contained page). NOT a React app. | core, ingest, taps |

## Key concepts

- **Model** (`core/src/model.ts`): `NeurowireFeed { id, title, home?, self?, updated, authors?, generator?, entries }`, `NeurowireEntry { id, title, link, published?, updated?, summary?, authors?, tags?, source? }`. Every parser produces it; every serializer consumes it. List-metadata only (no full article bodies).
- **Output formats** (`core/src/serialize/`): `nwf`, `atom`, `json` (JSON Feed 1.1), `md`. Registered in `FORMATS`/`MEDIA_TYPES`/`EXTENSIONS` and dispatched by `serialize(feed, format)`. **HTML is deliberately NOT a core format**, it lives in `@neurowire/web` (`toHtml`), so core stays format-pure and dependency-light.
- **nwf** (`core/src/serialize/nwf.ts`): compact line-oriented format (interned authors/tags/sources, relative links, delta timestamps). Round-trips via `fromNwf`. `validateNwf` returns line-numbered diagnostics. Full spec in the README.
- **Taps** (`@neurowire/taps`): a tap is a per-host `FeedTemplate` (CSS selectors) for sites with no feed. `link` is optional (omit it when the matched `item` element is itself the `<a>`). Resolution order in `ingestDocument`: explicit template -> discovered feed link -> registry tap (by host) -> heuristic auto-detect. Users add taps via `--taps`, `NEUROWIRE_TAPS`, or `~/.config/neurowire/taps/*.json`.
- **Meshes** (`Mesh` in core, `fetchMesh` in ingest): a named bundle of `{ name, sources: [{ name, url }] }` fetched in parallel and merged (tagged by source, deduped, newest-first). The API serves named meshes from `~/.config/neurowire/meshes/` plus a bundled `ai-news` (see `api/src/meshes.ts`).
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
- Coverage thresholds (`vitest.config.ts`): `core` and `taps` at 100% statements/functions/lines; `ingest` at 90/95/90; the runnable layers `api` at 85/85/85, `cli` at 80/85/80, and `web` at 85/85/85 (modest, ratchet up later). Keep them green when adding code to those packages. The thin process/server entrypoints (`api/src/index.ts`, `cli/src/index.ts`, `web/src/cli.ts`) are excluded from coverage: their pure logic is extracted into tested modules (`cli/src/pipeline.ts`, `web/src/cli-helpers.ts`, `api/src/app.ts`) and the entrypoints are just argv/fs/network/`serve()` orchestration.

## Gotchas (read before editing)

- **Cross-package tests import the sibling's built `dist`**, not its `src` (e.g. taps tests import `@neurowire/ingest` from dist). So `pnpm build` before running tests if you changed a dependency, and such tests do NOT count toward the dependency's `src` coverage. A package's OWN tests import its `src`.
- **In dev, pass CLI flags after `--`** (`pnpm cli -- --mesh x.json -f atom`): pnpm otherwise eats `-f` as its own `--filter`. The CLI also strips one leading `--` that pnpm/tsx inject. The built binary needs no `--`.
- **Adding an output format**: edit `core/src/serialize/` (the serializer + `FORMATS`/`MEDIA_TYPES`/`EXTENSIONS`/`serialize` switch/re-export) and add a test (core must stay 100%). Do not add presentation/page formats to core.
- **Adding a tap**: inspect the real page first (a throwaway cheerio script over the saved HTML), then add `taps/src/sites/<host>.ts`, push it into the `taps` array, and add an offline fixture test plus an opt-in `*.live.test.ts`.
- This repo is not a git repo by default and has no GitHub remote assumed. The `.github/workflows/pages.yml` workflow deploys the docs (site root) and the AI news example (`/example`) to GitHub Pages on push and daily; the generator (`neurowire-web` / `pnpm page`) runs from any cron or routine.
