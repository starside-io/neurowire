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

For a page the one-shot proposal gets wrong, and for keeping the tap alive afterwards, see [Author a tap and keep it working](#author-a-tap-and-keep-it-working) below.

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

## Share one archive across two machines

A laptop that is closed most of the day cannot fetch what it missed: those entries scrolled off the front page hours ago. Let an always-on machine do the fetching and journaling, then pull the deltas when the laptop wakes.

### On the hub (a VPS, a home server, anything always on)

Journal the mesh on a timer. Re-running adds only what is new, so the interval is not critical:

```bash
# crontab: every 30 minutes
*/30 * * * * neurowire --mesh ai-news.json --journal ai
```

Then publish that journal over [`nwf-sync/1`](/formats/nwf-sync). Nothing is published unless you name it, and the token is optional but wanted on anything reachable from the internet:

```bash
export NEUROWIRE_SYNC_PUBLISH=ai
export NEUROWIRE_SYNC_TOKEN=$(openssl rand -hex 32)
neurowire-api
```

Put it behind a reverse proxy with a real certificate. Neurowire serves plain HTTP and leaves transport security to you.

### On the laptop

Register the hub once:

```bash
neurowire peers add https://hub.example.com --token <the token from above>
```

Then sync on wake, or on a short timer. Being up to date costs one request that returns a number, so checking often is cheap:

```bash
neurowire sync --peers
#   ai: 26 new, cursor 1310, 2 requests, 4.1 KB
```

The result is an ordinary journal, so everything in [Archive a mesh and research it later](#archive-a-mesh-and-research-it-later) applies unchanged:

```bash
neurowire journal query ai --filter tag:rust --since 7d -f md
```

The laptop never fetches the sources, so it never has to keep taps current, and it sees exactly the corpus the hub saw rather than a different snapshot per machine.

::: tip Add a third machine and nothing changes
A node that pulled from the hub can publish `/sync` itself, and a third machine can peer with *that*, even if it never touches the internet. Merges are deduplicated by entry key, so a diamond stores one copy and a cycle terminates. See [Federation](/guide/federation) for the three-node walkthrough and [Sync](/concepts/sync) for the trust model: the hash chain detects corruption, it does not prove authorship, so peer with nodes you trust.
:::

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

## Author a tap and keep it working

A [tap](/concepts/taps) is the only part of Neurowire that depends on how someone else's HTML is laid out, so it is the only part that rots. This is the full lifecycle: author it once, let CI tell you the day it breaks, repair it in a minute.

### 1. Author it

`tap wizard` fetches the page once and walks the seven tap fields, showing ranked candidate selectors and a sample of what the current pick extracts:

```bash
neurowire tap wizard https://example.com/blog
```

Type a number to accept a candidate, paste a selector to override it, press Enter to skip an optional field. For a site the heuristics already handle, skip the prompts entirely:

```bash
neurowire tap wizard https://example.com/blog --yes
```

Either way the tap is written only if it passes the [verification gate](/concepts/taps#the-verification-gate), so `--yes` cannot leave you with a tap that quietly scrapes the navigation bar. By default it lands in `~/.config/neurowire/taps/<host>.json`, where Neurowire picks it up automatically:

```bash
neurowire https://example.com/blog --format atom
```

### 2. Check it in CI

`tap check` re-runs the same gate against the live page. It is one fetch per tap, no model, and no API key, so it is cheap enough to run on a schedule:

```bash
neurowire tap check ~/.config/neurowire/taps
```

```
  healthy   example.com  (24 items)
  degraded  linkblog.example  (31 items)
             link-host: 4/31 on linkblog.example
  1 tap(s): 1 healthy, 1 degraded, 0 broken, 0 unknown
```

The exit code is 0 while every tap is `healthy` or `degraded`, and 1 as soon as one is `broken`, which is all a CI step needs:

```yaml
# .github/workflows/taps.yml
on:
  schedule: [{ cron: '0 6 * * *' }]
jobs:
  taps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm install -g @neurowire/cli
      - run: neurowire tap check ./taps
```

Add `--json` when something downstream should read the result rather than a human:

```bash
neurowire tap check ./taps --json | jq '.taps[] | select(.health == "broken") | .host'
```

::: tip Give each tap a page to check
`check` never guesses a listing page from a tap's `host`, because fetching `https://example.com/` to check a tap written for `https://example.com/blog` would report a healthy tap as broken. Taps written by the wizard carry a `url` hint for this. A tap without one is reported `unknown` and skipped; add the key by hand, or pass `--url`.
:::

### 3. Heal it after a redesign

When the check goes red, `tap heal` re-authors the tap against the page as it stands today. Selectors that still match are kept, and only the broken fields are walked:

```bash
neurowire tap heal ~/.config/neurowire/taps/example.com.json
```

```
  broken  Article block  (was article.post-card)
    1) article.tile-block
  > 1
  keep    Title          h2
  keep    Date           time
  verify  24 items · items 24 extracted, 3 needed · titles 24/24 non-empty · ...
  wrote   ~/.config/neurowire/taps/example.com.json (previous kept as ...json.bak)
```

`--yes` takes the top candidate for each broken field, which is usually right when only the class names changed. The healed tap goes through the same gate, and the file it replaces is kept as `<path>.bak`. Re-run `tap check` to confirm, and CI goes green again.

See [tap wizard](/guide/cli#tap-wizard), [tap check](/guide/cli#tap-check), and [tap heal](/guide/cli#tap-heal).
