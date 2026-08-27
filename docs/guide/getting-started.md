# Getting started

Neurowire turns any blog, website, RSS, or Atom feed into clean, modern feeds. Point it at a URL and get back **NWF** (a compact custom format), **Atom**, **RSS 2.0**, **JSON Feed 1.1**, or **Markdown**. Bundle many sources into one **mesh**, group meshes into a **construct**, keep the history in an append-only **journal**, and render any feed, mesh, or construct into a self-contained **HTML news page**.

## Three surfaces

Neurowire is one toolkit you can reach through three doors:

- **Library**: the npm packages (`@neurowire/core`, `@neurowire/ingest`, `@neurowire/taps`, `@neurowire/web`). Fetch, parse, merge, and serialize feeds from your own code. See [Library usage](/guide/library).
- **CLI**: the `neurowire` binary. Point it at a URL, get a terminal view or a serialized feed, bundle meshes, watch for new posts, push to Slack. See [CLI reference](/guide/cli).
- **HTTP API**: a small Hono service exposing `GET /feed`, `/mesh`, and `/construct`. Run it yourself and call it over HTTP. See [HTTP API](/guide/http-api).

The data model is the same across all three: every parser produces a single canonical feed shape, and every serializer consumes it. Learn the model in [The model](/concepts/model).

## 60-second quickstart

### 1. Install the CLI

::: code-group

```bash [pnpm]
pnpm add -g @neurowire/cli
```

```bash [npm]
npm install -g @neurowire/cli
```

:::

::: tip Node 24+
Neurowire is ESM-only and needs Node >= 24. See [Installation](/guide/installation) for the full matrix.
:::

### 2. Point it at a URL

```bash
# a terminal view (no --format)
neurowire https://blog.rust-lang.org/feed.xml

# or a serialized feed to stdout
neurowire https://blog.rust-lang.org/feed.xml --format atom > rust.xml
```

Neurowire detects whether the URL is a feed or an HTML page. For an HTML page it follows a declared feed link, falls back to a curated per-host recipe (a [tap](/concepts/taps)), then to heuristic auto-detection.

### 3. Bundle a mesh

A [mesh](/concepts/meshes) is a named bundle of sources, fetched in parallel and merged into one newest-first feed. Drop this into `ai-news.json`:

```json
{
  "name": "AI News",
  "sources": [
    { "name": "Claude Blog", "url": "https://claude.com/blog" },
    { "name": "Simon Willison", "url": "https://simonwillison.net/atom/everything/" }
  ]
}
```

Then fetch it:

```bash
neurowire --mesh ai-news.json --format json --limit 10
```

### 4. Render an HTML page

Install the page generator and turn a mesh into a self-contained HTML page (all CSS inline, no external requests):

::: code-group

```bash [pnpm]
pnpm add -g @neurowire/web
neurowire-web --mesh ai-news.json --out index.html
```

```bash [npm]
npm install -g @neurowire/web
neurowire-web --mesh ai-news.json --out index.html
```

:::

## Pull from a peer instead of fetching

If someone already runs a Neurowire node that journals these sources, you do not have to fetch them yourself. Register the peer once and pull:

```bash
neurowire peers add https://hub.example.com
neurowire sync --peers
#   ai: 1284 new, cursor 1284, 4 requests, 812.0 KB
```

Later syncs move only what is new, and cost one request when nothing is. What you get back is an ordinary [journal](/concepts/journals), so `neurowire journal cat ai -f json` and friends work on it immediately. This matters most for a laptop that is closed most of the day: a live fetch can only show you what is on the front page right now, while a node that stayed awake recorded everything you missed. See [Sync](/concepts/sync) for why, and [Federation](/guide/federation) for how to run the node.

## Where to next

- [CLI reference](/guide/cli): every flag and subcommand.
- [The model](/concepts/model): the canonical feed shape.
- [Atom format](/formats/atom): the default serializer.
- [Journals](/concepts/journals): keep an append-only archive of what a source publishes, and query it back.
- [Sync](/concepts/sync): pull journal deltas from a peer instead of re-fetching every source yourself.
- [Recipes](/guide/recipes): practical end-to-end workflows.
