# @neurowire/taps

Curated per-host feed templates for sites with no RSS/Atom feed (version 0.3.0), plus the
loaders that register them. A "tap" wiretaps a site's listing page (via CSS selectors) and
turns it into a [`NeurowireFeed`](/reference/core#model). See [taps](/concepts/taps).

```bash
npm install @neurowire/taps
```

Depends on `core` and [`ingest`](/reference/ingest) (a `Tap` is an ingest `FeedTemplate`).

## Type

```ts
type Tap = FeedTemplate
```

A `Tap` is exactly an ingest [`FeedTemplate`](/reference/ingest#the-css-template-engine): a
per-host recipe of CSS selectors. `link` is optional (omit it when the matched `item`
element is itself the `<a>`).

## Bundled taps

```ts
const taps: Tap[]
```

The taps Neurowire ships by default. Each is also exported individually.

| Export | Host | Site |
|--------|------|------|
| `claudeBlog` | `claude.com` | Claude blog |
| `cursorBlog` | `cursor.com` | Cursor blog |
| `deepmindBlog` | `deepmind.google` | Google DeepMind blog |
| `mistralNews` | `mistral.ai` | Mistral news |

```ts
const claudeBlog: Tap
const cursorBlog: Tap
const deepmindBlog: Tap
const mistralNews: Tap
```

## Registering taps

```ts
function registerTaps(): void
function registerAllTaps(extraPaths?: string[]): { user: Tap[] }
```

| Export | Description |
|--------|-------------|
| `registerTaps()` | Register the bundled taps with the ingest registry. Safe to call repeatedly. |
| `registerAllTaps(extraPaths?)` | Register the built-in taps, then user taps from (in order) the default drop-in directory, the `NEUROWIRE_TAPS` env var, and any `extraPaths`. Later sources win on host collision. Returns the user taps registered. |

`registerAllTaps` resolution order and rules:

1. Built-in taps (`registerTaps`).
2. The default drop-in directory ([`defaultTapsDir()`](#paths)), ignored if missing.
3. `NEUROWIRE_TAPS`: a path, or a `:`/`,`-separated list of paths.
4. `extraPaths` (e.g. the CLI `--taps` flag).

A missing default directory is ignored; an explicitly requested path that is missing or
invalid throws.

## Loading taps

```ts
function loadTaps(pathOrDir: string): Tap[]
function registerTapsFrom(pathOrDir: string): Tap[]
```

| Export | Description |
|--------|-------------|
| `loadTaps(pathOrDir)` | Load taps from a JSON file, or from every `*.json` file in a directory (sorted). Each is validated against `FeedTemplateSchema`. A file may hold one tap or an array. |
| `registerTapsFrom(pathOrDir)` | `loadTaps` plus registering each into the ingest registry. Returns what was registered. |

## Paths

```ts
function defaultTapsDir(): string
```

The default drop-in directory for user taps: `$XDG_CONFIG_HOME/neurowire/taps` (or
`~/.config/neurowire/taps`).

## Usage

```ts
import { fetchFeed } from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'

// Register built-in + user taps once at startup.
registerAllTaps()

// Now a feed-less host with a bundled tap resolves automatically.
const feed = await fetchFeed('https://claude.com/blog')
```

::: tip
Adding a new tap: add `packages/taps/src/sites/<host>.ts`, push it into the `taps` array,
and add an offline fixture test plus an opt-in `*.live.test.ts`. Inspect the real page
first.
:::
