# CLI reference

The `neurowire` binary (from `@neurowire/cli`) turns a URL, mesh, or construct into a terminal view or a serialized feed, with filtering, sorting, time windows, a live tail, a watch loop, and delivery sinks.

## Synopsis

```
neurowire <url> [options]
neurowire --mesh <file> [options]
neurowire --construct <file> [options]
neurowire validate <file-or-url>
neurowire tap wizard <url> [-o file] [--yes]
neurowire tap check [path] [--all] [--json] [--url <page>]
neurowire tap heal <path> [--yes] [--url <page>]
neurowire tap doctor <url>
neurowire opml export --mesh <file>|--construct <file> [-o out.opml]
neurowire opml import <file-or-url> [-o mesh.json] [--name <name>]
neurowire journal head|cat|query <id> [options]
neurowire tail [url] [options]
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
| `-f, --format <fmt>` | Output format: `nwf`, `atom`, `rss`, `json`, `md`. Omit for the terminal view. |
| `-o, --out <file>` | Write serialized output to a file instead of stdout. |

```bash
neurowire https://example.com/feed.xml --format atom > feed.xml
neurowire --mesh ai-news.json -f json -o ai-news.json
```

::: tip Formats
`atom` and `rss` both produce XML. `json` is JSON Feed 1.1. `md` is Markdown. `nwf` is the compact Neurowire format. See [NWF](/formats/nwf), [Atom](/formats/atom), [RSS](/formats/rss), [JSON Feed](/formats/json-feed), and [Markdown](/formats/markdown).
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

## Tail mode

`neurowire tail` treats a source as a stream instead of a document: it polls forever and prints each new entry as it appears, one at a time. It takes the same sources and the same shaping flags as a normal run, applied per tick.

| Flag | Description |
|------|-------------|
| `--interval <age>` | Poll interval, e.g. `30s`, `15m`, `6h`, `1d`. Default `5m`, floor `30s`. |
| `--state <file>` | JSON file of seen entry keys, so restarts skip already-reported items. |
| `-f nwf` | Stream raw [NWFJ](/formats/nwfj) journal lines instead of the terminal view. |
| `--from <api-url>` | Render a remote [`GET /tail`](/guide/http-api#get-tail) SSE stream instead of polling locally. |
| `--journal <id>` | Append everything seen to a journal, exactly as on a one-shot run. |
| `--sink <url>` | Deliver each tick's new entries to a sink. |

```bash
neurowire tail https://example.com/feed.xml
neurowire tail --mesh ai-news.json --interval 60s --filter tag:release
neurowire tail --mesh ai-news.json -f nwf | grep -i release
neurowire tail --from https://api.example.com/tail?src=ai-news
```

Status lines (the interval, poll errors) go to stderr, so `-f nwf` pipes cleanly: the whole stream is one valid NWFJ document, header and checkpoints included, and `neurowire validate` style tooling can read it back. A tick whose fetch fails prints `[tail] error: ...` and waits for the next one instead of ending the tail.

With another `-f` (`atom`, `rss`, `json`, `md`) each tick serializes just its new entries, which is the batch shape watch mode uses.

`--from` expects the remote stream's default `format=json`. It reconnects on its own with exponential backoff, resuming from the last event id it saw, and reports each failed attempt on stderr rather than retrying silently. `--journal` and `--sink` still apply to what arrives; the shaping flags (`--filter`, `--exclude`, `--sort`, `--order`, `--limit`, `--since`, `--max-age`, `--between`) do not, because the server decides what the stream contains, so passing them prints a warning.

::: tip Tail is the concept page
[Tail](/concepts/tail) covers what "new" means, why the interval has a floor, and how tail, watch, and a one-shot fetch differ.
:::

## Watch mode

Watch is tail's batch-output sibling: the same poll loop, but each tick emits one feed of the new entries rather than a line per entry.

| Flag | Description |
|------|-------------|
| `-w, --watch` | Enable the watch loop. Runs until the process is killed. |
| `--interval <age>` | Poll interval, e.g. `30s`, `30m`, `6h`, `1d`. Default `5m`, floor `30s`. |
| `--state <file>` | JSON file of seen entry keys, so restarts skip already-reported items. |

Each tick re-applies your filters and refinements, prints only the new entries (in `--format` when set), and writes a `[watch] N new (M seen)` line to stderr. A failed fetch is reported as `[watch] error: ...` and retried on the next tick.

```bash
neurowire --mesh ai-news.json --watch --interval 15m -f json
neurowire --mesh ai-news.json --watch --state ~/.neurowire-seen.json
```

::: tip Polling politeness
Both loops clamp the interval to 30 seconds, add a little jitter so many pollers do not arrive together, and revalidate with conditional requests. Choose an interval that suits the source, not the floor.
:::

## Journals

Keep an append-only archive of everything a source has published, so you can come back to it later. Entries the journal already holds are dropped, which makes journaling safe to run on a timer.

| Flag | Description |
|------|-------------|
| `--journal <id>` | Append the fetched entries to the journal `<id>`. |
| `--journal-dir <dir>` | Where journals live. Default `$NEUROWIRE_JOURNAL`, else `~/.config/neurowire/journal`. |

```bash
neurowire --mesh ai-news.json --journal ai
neurowire --mesh ai-news.json --journal ai --watch --interval 30m
```

Each run reports what it added: `Journaled 4 new entries to ai (head 128)`. Journals are stored as [NWFJ](/formats/nwfj) segments plus a rebuildable manifest, and are read back with the `journal` subcommands below.

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
| `--tap-pack <theme>` | Register one or more themes from the optional [`@neurowire/taps-pack`](/reference/taps-pack) catalog (e.g. `gaming,space`, or `all`). Repeatable. |

You can also set the `NEUROWIRE_TAPS` env var (a path or `:`-separated list), or drop `*.json` files into `~/.config/neurowire/taps/`. When custom taps load, the CLI writes `Loaded N custom tap(s)` to stderr. See [Taps](/concepts/taps).

You do not have to write the selectors yourself. [`tap wizard`](#tap-wizard) authors a tap interactively, [`tap check`](#tap-check) tells you when one stops matching, and [`tap heal`](#tap-heal) repairs it after a redesign.

`--tap-pack` needs `@neurowire/taps-pack` installed (`pnpm add @neurowire/taps-pack`); if it is absent the CLI prints an install hint and continues. Unknown theme keys are skipped with a warning. Example: `neurowire --tap-pack gaming https://www.pcgamer.com/rss/ -f json`.

## Global flags

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help. |
| `-v, --version` | Show the version. |

## Subcommands

### tail

Follow a feed, mesh, or construct as a live stream. See [Tail mode](#tail-mode) above for the flags.

```bash
neurowire tail --mesh ai-news.json --interval 60s
```

### validate

Check that an NWF document is well-formed. Prints line-numbered warnings and errors to stderr; on success prints a summary, on failure exits non-zero.

```bash
neurowire validate feed.nwf
neurowire validate https://example.com/feed.nwf
```

### tap wizard

Author a tap step by step. The page is fetched once, then each of the seven steps shows ranked candidate selectors, a live `matched:` count, and a sample of what the current pick extracts. Type a number to accept a candidate, paste a selector to override it, press Enter to skip an optional field (or to take the top candidate on a required one).

```bash
neurowire tap wizard https://example.com/blog
neurowire tap wizard https://example.com/blog --yes -o ./example.json
```

| Flag | Description |
|------|-------------|
| `-o, --out <file>` | Where to write the tap. Default: `~/.config/neurowire/taps/<host>.json`. |
| `-y, --yes` | Accept every top candidate without prompting. |

Nothing is written unless the template passes [verification](/concepts/taps#the-verification-gate); on a failure the failed checks print and the command exits 1. That holds for `--yes` too: it is a shortcut past the prompts, not past the gate.

The written file carries a `url` hint naming the page it was authored against, so `tap check` and `tap heal` know where to look later. The template engine ignores that key.

### tap check

Do taps still match the pages they were written for? Deterministic and network-cheap (one fetch per tap), so it belongs in CI: it exits 1 the day a redesign breaks a tap, instead of letting the feed quietly go empty.

```bash
neurowire tap check ~/.config/neurowire/taps
neurowire tap check ./example.json --json
neurowire tap check --all
```

| Flag | Description |
|------|-------------|
| `--all` | Check every registered tap instead of a file or directory. |
| `--json` | Print machine-readable results instead of the table. |
| `--url <page>` | Force the page to check against, instead of each tap's own `url` hint. |

Each tap comes back:

| Status | Meaning |
|--------|---------|
| `healthy` | Every check passed. |
| `degraded` | Passed the gate with a soft check failing, e.g. off-host links. |
| `broken` | A hard check failed, or the page could not be fetched. |
| `unknown` | The tap names no page, so there was nothing to check. |

The exit code is 1 if any tap is broken. A tap's `host` is deliberately never turned into a page to fetch: most listing pages live at a path (`example.com/blog`), so fetching the apex would report a perfectly good tap as broken. Give a tap a `url` hint, or pass `--url`, and it gets checked; otherwise it is honestly reported as `unknown`.

### tap heal

A site changed. Re-author the tap against the page as it stands today: fields whose selectors still match are kept verbatim, and only the broken ones are walked. `--yes` takes the top candidate for each broken field.

```bash
neurowire tap heal ~/.config/neurowire/taps/example.com.json
neurowire tap heal ./example.json --yes
```

The healed template goes through the same gate as the wizard, and the previous file is kept as `<path>.bak`. Healing repairs the tap it was given rather than growing it: a field the tap never claimed stays unclaimed, and the tap's `host` and `feedTitle` survive. A tap under `node_modules` is code someone else ships, so its replacement is printed rather than written.

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

### journal head

Print the journal's head cursor, the position to resume from next time.

```bash
neurowire journal head ai
```

### journal cat

Print a journal as a feed, in any output format. With `--cursor <n>` it prints only the entries after that sequence number, which is how you pull a delta rather than the whole archive. A cursor older than the oldest retained entry prints a warning, since compaction means the delta cannot be complete.

| Flag | Description |
|------|-------------|
| `--cursor <n>` | Only entries after this sequence number. Accepts `42` or `42.<hash>`. |
| `-f, --format <fmt>` | Any output format. Omit for the terminal view. |
| `-o, --out <file>` | Write to a file instead of stdout (with `--format`). |

```bash
neurowire journal cat ai -f md
neurowire journal cat ai --cursor 128 -f json
```

### journal query

Query an archive with the same `--filter`, `--exclude`, date-window, `--sort`, and `--limit` flags the fetch path uses, so a journal answers exactly what a live feed answers. Segments that provably cannot match are skipped without being read, and a note goes to stderr when that happens.

```bash
neurowire journal query ai --filter tag:rust --since 30d -f md
neurowire journal query ai --filter source:Anthropic --sort date --limit 20
```

::: tip Journals are plain text
Segments are one record per line, TAB-separated, so `grep` and `awk` work directly on them. Use `journal cat ai -f json` when you want to load an archive into duckdb, sqlite, or pandas. See the [NWFJ format](/formats/nwfj).
:::

### sync

Pull journal deltas from a peer running the [`nwf-sync/1`](/formats/nwf-sync) endpoints, instead of re-fetching every upstream source yourself. Entries land in the local journal store and are then read back with the ordinary `journal` commands.

| Flag | Description |
|------|-------------|
| `--peers` | Sync every peer in `~/.config/neurowire/peers.json` instead of one URL. |
| `--journal <id>` | Sync only this journal. Omit it to sync everything the peer publishes. |
| `--token <t>` | Bearer token, when the peer requires one. |
| `--journal-dir <d>` | Where the local journals live. |

```bash
neurowire sync https://hub.example.com --journal ai --token secret
neurowire sync --peers
```

Each line reports what moved, and the summary closes with the error count. Exits non-zero when any peer or journal failed, so a cron job notices.

```
https://hub.example.com
  ai: 26 new, cursor 1310, 2 requests, 4.1 KB
26 new entries from 1 peer (4.1 KB, 0 errors)
```

Cursors are recorded per peer and journal in `~/.config/neurowire/peers-state.json` (or `$NEUROWIRE_PEERS_STATE`), and only after the entries have been appended, so an interrupted sync costs one re-pull rather than a hole. Re-syncing is idempotent: the store drops entries it already holds.

A line can also carry `bootstrapped from snapshot` (the cursor predated the peer's retention, so the pull restarted from what it still keeps) or `peer journal diverged, cursor reset` (the peer's journal was rebuilt or restored, so the cursor no longer meant anything and the pull started over).

### peers

Manage `~/.config/neurowire/peers.json` (or `$NEUROWIRE_PEERS`). Adding a URL already on the list replaces its entry, which is how you rotate a token. The file is written `0600`, since it holds bearer tokens, and a URL with no scheme is stored as `https://`. If the file cannot be parsed, `add` and `remove` refuse rather than overwriting it.

```bash
neurowire peers add https://hub.example.com --token secret
neurowire peers add http://node-c.lan:8787 --journal ai
neurowire peers list
neurowire peers remove https://hub.example.com
```

::: tip Set up the whole topology
The [Federation guide](/guide/federation) builds a three-node hub, laptop, and offline-relay setup from scratch with these commands.
:::

## More examples

```bash
neurowire https://example.com/blog
neurowire --construct daily.json
neurowire --construct daily.json --format atom --limit 20
neurowire --mesh ai-news.json --filter tag:release --exclude title:sponsored -f json
neurowire tail --mesh ai-news.json --interval 60s --sink https://hooks.slack.com/services/...
neurowire tap wizard https://example.com/blog --yes
neurowire tap check ~/.config/neurowire/taps --json
neurowire sync --peers
```
