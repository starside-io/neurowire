# CLI reference

The `neurowire` binary (from `@neurowire/cli`) turns a URL, mesh, or construct into a terminal view or a serialized feed, with filtering, sorting, time windows, a watch loop, and delivery sinks.

## Synopsis

```
neurowire <url> [options]
neurowire --mesh <file> [options]
neurowire --construct <file> [options]
neurowire validate <file-or-url>
neurowire tap doctor <url>
neurowire opml export --mesh <file>|--construct <file> [-o out.opml]
neurowire opml import <file-or-url> [-o mesh.json] [--name <name>]
```

With no `--format`, Neurowire prints a colorized terminal view. With `--format` it serializes the feed to stdout (or to `--out`).

::: warning Dev vs built binary: the `--` gotcha
When you run the CLI through pnpm in this repo (`pnpm cli -- <args>`), pass flags **after** `--`, otherwise pnpm eats `-f` as its own `--filter`. The CLI also tolerates one leading `--` that pnpm/tsx may inject. The installed binary needs no `--`:

```bash
# dev (in the monorepo)
pnpm cli -- --mesh ai-news.json -f atom

# installed binary
neurowire --mesh ai-news.json -f atom
```
:::

## Source selection

| Flag | Description |
|------|-------------|
| `<url>` (positional) | A website, RSS, or Atom URL. Auto-detected and normalized. |
| `-m, --mesh <file>` | Fetch a mesh: a JSON bundle of named sources, merged into one feed. |
| `-c, --construct <file>` | Fetch a construct: a bundle of meshes. The terminal view keeps the per-mesh grouping; `--format` flattens it into one feed. |
| `-t, --template <file>` | Path to a JSON CSS-selector template, forcing on-page extraction instead of auto-detect (positional URL only). |

`{ ref }` members in a construct (mesh references by name) are resolved from `~/.config/neurowire/meshes` or `NEUROWIRE_MESHES`.

## Output

| Flag | Description |
|------|-------------|
| `-f, --format <fmt>` | Output format: `atom`, `rss`, `json`, `md`, `nwf`. Omit for the terminal view. |
| `-o, --out <file>` | Write serialized output to a file instead of stdout. |

```bash
neurowire https://example.com/feed.xml --format atom > feed.xml
neurowire --mesh ai-news.json -f json -o ai-news.json
```

::: tip Formats
`atom` and `rss` both produce XML. `json` is JSON Feed 1.1. `md` is Markdown. `nwf` is the compact Neurowire format. See [Atom](/formats/atom), [RSS](/formats/rss), [JSON Feed](/formats/json-feed), [Markdown](/formats/markdown), and [NWF](/formats/nwf).
:::

## Shaping the output

These run **before** `--format`, in this order: filters, then sort/order/limit and time windows.

### Filtering

| Flag | Description |
|------|-------------|
| `--filter <field:pattern>` | Keep entries where the field matches. Repeatable. |
| `--exclude <field:pattern>` | Drop entries where the field matches. Repeatable. |

- Fields: `title`, `summary`, `source`, `author`, `tag`.
- The pattern is a case-insensitive **substring** by default.
- Wrap it in slashes for a case-insensitive **regex**: `/pattern/`.
- Splitting is on the first colon only, so patterns may contain colons.

```bash
neurowire --mesh ai-news.json --filter tag:release --exclude title:sponsored -f json
neurowire --mesh ai-news.json --filter 'title:/\bv\d+\.\d+/' -f json
```

### Sort, order, limit

| Flag | Description |
|------|-------------|
| `--sort <key>` | Sort by `date`, `title`, or `source`. |
| `--order <dir>` | `asc` or `desc`. Default: newest-first for date, A-Z otherwise. |
| `-n, --limit <n>` | Keep at most `n` entries (non-negative integer). |

```bash
neurowire --mesh ai-news.json --sort date --order desc --limit 10
```

### Date windows

| Flag | Description |
|------|-------------|
| `--since <age>` | Keep entries within this window, e.g. `24h`, `90m`, `7d`. |
| `--max-age <age>` | Drop entries older than this (same window syntax). |
| `--today` | Keep entries since midnight UTC today. |
| `--this-week` | Keep entries since Monday midnight UTC. |
| `--between <a>..<b>` | Keep entries between two parseable dates, e.g. `2026-01-01..2026-02-01`. |

```bash
neurowire --mesh ai-news.json --since 24h --sort date -f atom
neurowire --mesh ai-news.json --between 2026-01-01..2026-02-01 -f json
```

## Watch mode

Long-poll a feed, mesh, or construct on an interval and emit only entries not seen yet.

| Flag | Description |
|------|-------------|
| `-w, --watch` | Enable the watch loop. Runs until the process is killed. |
| `--interval <age>` | Poll interval, e.g. `30m`, `6h`, `1d`. Default `5m`. |
| `--state <file>` | JSON file of seen entry keys, so restarts skip already-reported items. |

Each tick re-applies your filters and refinements, prints only the new entries (in `--format` when set), and writes a `[watch] N new (M seen)` line to stderr.

```bash
neurowire --mesh ai-news.json --watch --interval 15m -f json
neurowire --mesh ai-news.json --watch --state ~/.neurowire-seen.json
```

## Sinks

Push entries to a destination over HTTP POST. Repeatable. The destination kind is auto-detected from the URL host: Slack (`slack.com`), Discord (`discord.com`/`discordapp.com`), or a generic webhook (everything else, which receives the JSON Feed as `application/feed+json`).

| Flag | Description |
|------|-------------|
| `--sink <url>` | POST entries to this destination. Repeatable. |

Sinks are additive to stdout and never abort the run: a failing sink prints a one-line warning and continues. With `--watch`, only the fresh entries are delivered each tick.

```bash
neurowire --mesh ai-news.json --watch --sink https://hooks.slack.com/services/...
neurowire --mesh ai-news.json --sink https://discord.com/api/webhooks/...
```

::: tip Slack and Discord message shape
Slack and Discord receive a short text message: a header line then up to 10 bullet lines (title - link), with an overflow line when there are more. Discord content is capped at 2000 characters.
:::

## Taps

Taps teach Neurowire to read sites with no RSS/Atom feed. The built-in taps load automatically. Add your own:

| Flag | Description |
|------|-------------|
| `--taps <path>` | Load extra taps from a `.json` file or a directory. Repeatable. |

You can also set the `NEUROWIRE_TAPS` env var (a path or `:`-separated list), or drop `*.json` files into `~/.config/neurowire/taps/`. When custom taps load, the CLI writes `Loaded N custom tap(s)` to stderr. See [Taps](/concepts/taps).

## Global flags

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help. |
| `-v, --version` | Show the version. |

## Subcommands

### validate

Check that an NWF document is well-formed. Prints line-numbered warnings and errors to stderr; on success prints a summary, on failure exits non-zero.

```bash
neurowire validate feed.nwf
neurowire validate https://example.com/feed.nwf
```

### tap doctor

Inspect a feed-less page and propose a `FeedTemplate` (a tap). The proposed template prints as pretty JSON to stdout (redirect it into a taps file); a human preview of matched entries prints to stderr. Exits non-zero when nothing can be proposed.

```bash
neurowire tap doctor https://example.com/blog > ~/.config/neurowire/taps/example.com.json
```

::: tip Alias
`neurowire doctor <url>` is accepted as a shorthand for `neurowire tap doctor <url>`.
:::

### opml export

Export a mesh or construct to OPML 2.0. Requires `--mesh <file>` or `--construct <file>`. Writes to `--out` or stdout.

```bash
neurowire opml export --mesh ai-news.json > ai-news.opml
neurowire opml export --construct daily.json -o daily.opml
```

### opml import

Import an OPML file or URL into a mesh JSON. The mesh name comes from `--name`, else the OPML head title, else `imported`. Writes to `--out` or stdout.

| Flag | Description |
|------|-------------|
| `-o, --out <file>` | Write the mesh JSON here instead of stdout. |
| `--name <name>` | Set the imported mesh's name. |

```bash
neurowire opml import subscriptions.opml -o mesh.json --name "My Reader"
```

## More examples

```bash
neurowire https://example.com/blog
neurowire --construct daily.json
neurowire --construct daily.json --format atom --limit 20
neurowire --mesh ai-news.json --filter tag:release --exclude title:sponsored -f json
```
