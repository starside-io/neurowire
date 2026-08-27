# Recipes

Practical end-to-end workflows. Each one is a short sequence of commands you can copy. They assume the `neurowire` CLI (and, where noted, `neurowire-web`) are installed. See [Installation](/guide/installation).

## Watch a site and push new posts to Slack

Long-poll a mesh and deliver only the entries you have not seen yet to a Slack incoming webhook. The `--state` file makes restarts skip already-reported items.

```bash
neurowire --mesh ai-news.json \
  --watch --interval 15m \
  --state ~/.neurowire-seen.json \
  --sink https://hooks.slack.com/services/T000/B000/XXXX
```

Swap the sink URL for a Discord webhook (`https://discord.com/api/webhooks/...`) or any generic endpoint (which receives the JSON Feed as `application/feed+json`). The sink kind is auto-detected from the URL. See [CLI sinks](/guide/cli#sinks).

## Build a daily HTML news page from a construct

A [construct](/concepts/constructs) bundles several meshes. Render it to a self-contained page (all CSS inline, no external requests).

Single combined page (every entry tagged by its mesh):

```bash
neurowire-web --construct daily.json --combined --out public/index.html
```

Multi-page "repo of feeds" (an overview plus one page per mesh) into a directory:

```bash
neurowire-web --construct daily.json --out public/
```

Limit to recent items with `--since` or `--today`:

```bash
neurowire-web --construct daily.json --combined --since 24h --out public/index.html
```

## Migrate subscriptions via OPML

Import an OPML export from another reader into a Neurowire mesh, then export it back out if you need to.

Import (the mesh name comes from `--name`, else the OPML title):

```bash
neurowire opml import subscriptions.opml -o my-reader.json --name "My Reader"
```

Use the resulting mesh like any other:

```bash
neurowire --mesh my-reader.json --format json --limit 20
```

Export a mesh (or construct) back to OPML 2.0:

```bash
neurowire opml export --mesh my-reader.json > my-reader.opml
```

See [opml subcommands](/guide/cli#opml-export).

## Add a tap for a feed-less site

A [tap](/concepts/taps) teaches Neurowire to read a site with no RSS/Atom feed. Let `tap doctor` propose one, save it, then use it.

```bash
# propose a template and save it where Neurowire looks for taps
neurowire tap doctor https://example.com/blog \
  > ~/.config/neurowire/taps/example.com.json

# now the site resolves like any feed
neurowire https://example.com/blog --format atom
```

You can also load a tap ad hoc with `--taps <path>` or via the `NEUROWIRE_TAPS` env var. See [tap doctor](/guide/cli#tap-doctor).

## Archive a mesh and research it later

Front pages scroll away. Keep everything a mesh publishes in an append-only [journal](/concepts/journals), then query the archive months later.

Archive on a timer (cron, a systemd timer, a CI schedule). Re-running adds only what is new, so the interval does not have to be precise:

```bash
neurowire --mesh ai-news.json --journal ai
```

Or let a single long-running watch loop do both jobs, archiving every tick while it notifies:

```bash
neurowire --mesh ai-news.json \
  --watch --interval 30m \
  --state ~/.neurowire-seen.json \
  --journal ai \
  --sink https://hooks.slack.com/services/T000/B000/XXXX
```

Then research it with the same flags a live fetch takes:

```bash
# everything tagged rust in the last 30 days, as Markdown
neurowire journal query ai --filter tag:rust --since 30d -f md

# one source, newest first
neurowire journal query ai --filter source:Anthropic --sort date --limit 20
```

Pull just the delta since a position you recorded earlier:

```bash
cursor=$(neurowire journal head ai)
# ...later...
neurowire journal cat ai --cursor "$cursor" -f json
```

To take the archive somewhere else, dump it as JSON and load it into duckdb, sqlite, or pandas:

```bash
neurowire journal cat ai -f json > ai-archive.json
```

See [CLI journals](/guide/cli#journals).

## Pipe a live tail into other tools

`neurowire tail -f nwf` streams [NWFJ](/formats/nwfj) records to stdout as entries arrive: one line per record, TAB-separated, nothing else on the stream. Status output goes to stderr, so the pipe stays clean.

Watch for something specific as it lands. Records are plain lines, so `grep` works, and `--line-buffered` keeps it from sitting on a buffer while it waits for more:

```bash
neurowire tail --mesh ai-news.json -f nwf \
  | grep --line-buffered -i 'release'
```

::: warning A grepped stream is not a document
Filtering by line drops the header and the dictionary lines the entry records point at, which makes the result unparseable as NWFJ. Grep it to look at it; keep the whole stream when you want to read it back.
:::

To keep a file you can query later, write the whole stream and watch a copy:

```bash
neurowire tail --mesh ai-news.json -f nwf \
  | tee -a ~/feeds/ai-news.nwfj \
  | grep --line-buffered '^E'
```

A long-running tail can also archive into a proper [journal](/concepts/journals) as it goes, which is the better option when you want cursors, segments, and `journal query` rather than one growing file:

```bash
neurowire tail --mesh ai-news.json --interval 5m --journal ai
```

Follow a [self-hosted API](/guide/http-api#get-tail) instead of polling the sources yourself, so one machine does the fetching for all your terminals:

```bash
neurowire tail --from 'http://localhost:8787/tail?src=ai-news'
```

See [CLI tail mode](/guide/cli#tail-mode) and the [Tail concept](/concepts/tail).

## Convert any feed to RSS 2.0

Normalize any source (RSS, Atom, JSON Feed, or an HTML page) and re-emit it as RSS 2.0.

```bash
neurowire https://simonwillison.net/atom/everything/ --format rss > willison.rss
```

The same `--format rss` works on a mesh or a (flattened) construct:

```bash
neurowire --mesh ai-news.json --format rss --limit 25 > ai-news.rss
```

See [RSS format](/formats/rss).
