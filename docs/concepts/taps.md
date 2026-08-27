# Taps

Many sites publish a blog but ship no RSS or Atom feed. A **tap** wiretaps such a site: it is a per-host recipe of CSS selectors (a `FeedTemplate`) that turns the site's listing page into a Neurowire [feed](/concepts/model).

The template engine lives in [`packages/ingest/src/html/template.ts`](https://github.com/neurowire/neurowire); the curated taps and their loaders live in [`@neurowire/taps`](https://github.com/neurowire/neurowire).

## A tap is a `FeedTemplate`

A tap is a set of CSS selectors describing where each article and its fields live on the listing page. Selectors for fields other than `item` and `title` are looked up **within** each matched item.

| Field | Required | What it selects |
|-------|----------|-----------------|
| `host` | no | Hostname this tap applies to, e.g. `blog.example.com`. Used to match by host in the registry. |
| `feedTitle` | no | Overrides the feed title (otherwise the page `<title>` is used). |
| `item` | yes | Each article row. The other field selectors run inside each match. |
| `title` | yes | The title text within an item. |
| `link` | no | The link (its `href` is read). **Omit it when the matched `item` element is itself the `<a>`.** |
| `date` | no | The date. Reads `[datetime]` first, then the element's text. |
| `summary` | no | The summary text. |
| `author` | no | The author name. |
| `tags` | no | Tag elements (each one's text becomes a tag). |

### How `applyTemplate` extracts entries

For each element matching `item`, the engine reads the `title` text and resolves the link. When `link` is omitted, the item element itself is treated as the anchor (its `href`, or the first `<a>` inside it, is used). An item with no title or no resolvable link is skipped. Dates are normalized, relative links are resolved against the source URL, and entries get [stable synthetic ids](/concepts/model#stable-synthetic-entry-ids-content-hashing) if the source gives none.

```json
{
  "host": "blog.example.com",
  "feedTitle": "Example Blog",
  "item": "article.post",
  "title": "h2",
  "link": "a.permalink",
  "date": "time",
  "summary": "p.excerpt"
}
```

## Resolution order

When Neurowire ingests a page (`ingestDocument`), it tries to produce a feed in this order, taking the first that yields entries:

1. **Explicit template.** A `FeedTemplate` passed directly by the caller always wins.
2. **Discovered feed link.** A declared `<link rel="alternate">` RSS/Atom/JSON feed on the page is followed (the highest-fidelity result).
3. **Registry tap (by host).** A curated per-host tap from the registry. This beats heuristic auto-detect.
4. **Heuristic auto-detect.** On-page extraction (JSON-LD, then semantic HTML).

If none of these extracts a feed, ingestion throws.

::: tip
A real RSS/Atom feed always wins over a tap. Taps only matter for sites that have no feed at all.
:::

## Adding your own taps

Users register custom taps from three sources, applied in order (later sources win on a host collision):

1. The drop-in directory `~/.config/neurowire/taps/` (or `$XDG_CONFIG_HOME/neurowire/taps`). A missing default directory is silently ignored.
2. The `NEUROWIRE_TAPS` environment variable: a path, or a `:` / `,` separated list of paths.
3. The CLI `--taps <path>` flag.

A path may be a single JSON file or a directory of `*.json` files (each loaded in sorted order). Each file holds one tap object or an array of them, and every tap is validated against the schema. An explicitly requested path that is missing or invalid throws (unlike the optional default directory).

```bash
neurowire https://example.com/blog --taps ~/my-taps/example.json
NEUROWIRE_TAPS=~/taps-a:~/taps-b neurowire https://example.com/blog
```

## Authoring a tap with `tap doctor`

You do not have to write selectors by hand. `proposeTemplate(html, url)` inspects a feed-less page and **proposes** a `FeedTemplate`: it finds repeated item-like containers (sibling `article` / `li` / class-patterned `div`s that each hold a heading and an `<a href>`, or a grid of bare `<a>` cards), picks the most consistent selector, and derives `title` / `link` / `date` selectors relative to it. The candidate is validated by actually running `applyTemplate`, so a proposal is returned only when it extracts at least one entry.

The CLI exposes this as `tap doctor <url>`. It prints the proposed template to stdout and a match count plus sample titles to stderr, so you can pipe the template straight to a file:

```bash
neurowire tap doctor https://example.com/blog > ~/.config/neurowire/taps/example.com.json
```

The proposal includes `template`, `matched` (entry count), and `sampleTitles` (up to 5), so you can eyeball the result before saving.

## Authoring a tap with the wizard

`tap doctor` is one shot: it proposes, you take it or you do not. The **wizard** is the same heuristics turned into a loop, so a page the one-shot proposal gets wrong is still authorable without DOM-spelunking.

```
$ neurowire tap wizard https://example.com/blog

  step 1/7  Article block  (required)
  Pick the block that repeats once for each article on the page.
    1) article.post-card
    2) li.entry
    3) div.card
  > 1

  step 2/7  Title  (required)
  The headline text inside each block.
    1) h2
    2) h2.post-title
  > 1
    preview  Rust 1.94 released  https://example.com/posts/rust-194
             Announcing the new API  https://example.com/posts/new-api

  step 3/7  Link  (optional, Enter to skip)
  >

  verify  24 items · items 24 extracted, 3 needed · titles 24/24 non-empty · ...
  wrote   ~/.config/neurowire/taps/example.com.json
```

Type a number to accept a candidate, paste a selector to override it, press Enter to skip an optional field. **One fetch per session:** every pick is re-applied against the document already in memory, which is what keeps the loop instant and the publisher unbothered.

Nothing about this involves a model. Candidates come from structure, ranked by how a page is actually built:

| Field | Where the candidates come from |
|-------|--------------------------------|
| `item` | `article`/`li`/`div`/`section` elements containing a link, keyed as `tag.first-class` and ranked by how often that selector repeats (3 to 300 times). `is-` / `has-` / `js-` state classes are skipped, since those flip at runtime, as are classes CSS cannot address unescaped (`md:flex`, `w-1/2`). |
| `title` | Headings and `[class*=title\|headline]` inside the first matched item. |
| `link` | `a[href]` inside the item. |
| `date` | `time`, `[datetime]`, `[class*=date\|time\|published]`. |
| `summary` | `p`, `[class*=summary\|excerpt\|dek]`. |
| `author` | `[class*=author\|byline]`, `[rel=author]`. |
| `tags` | `[class*=tag\|category\|label]`, `[rel=tag]`. |

Whatever `proposeTemplate` (the `tap doctor` heuristic) returns is seeded as candidate zero for each field, so the existing answer is always the default and the alternatives sit right behind it.

### The verification gate

No tap is written without passing `verifyTemplate`, on the interactive path and on `--yes` alike. The checks are deterministic and give the same verdict every run:

| Check | Hard | What it catches |
|-------|------|-----------------|
| `items` | yes | Fewer than 3 extracted entries: the selector did not really find the list. |
| `titles` | yes | Fewer than 80% of matched items carrying title text. A rate, not a clean sweep, since the engine simply skips a title-less item and one promo card sharing the article class is not a broken tap. |
| `links` | yes | A link that did not resolve to an absolute `http(s)` URL. |
| `link-host` | no | Links pointing off-host. Common enough on link blogs to be a warning, not a failure. |
| `unique-links` | yes | Every item yielding the same href, i.e. a selector that grabbed one shared anchor per item. |
| `dates` | no | A claimed `date` selector that rarely parses. |
| `ancestor` | yes | More than half the matched items sitting inside `nav`, `footer`, or `aside`, or items scattered instead of sharing a parent. This is what stops a tap from "working" by scraping the navigation bar, while a lone "related posts" card in a sidebar is tolerated. |

A template passes when no hard check failed and the share of passing checks clears the threshold (0.75 by default). A tap that clears the gate with a soft check failing is reported as **degraded** rather than healthy.

## Checking and healing taps

Taps rot: sites redesign, classes get renamed, and a broken tap fails silently by producing an empty feed. `tap check` is the smoke alarm.

```bash
neurowire tap check ~/.config/neurowire/taps     # a file or a directory
neurowire tap check --all --json                  # every registered tap
```

Each tap is fetched once and run through the same gate, then classified `healthy`, `degraded`, `broken`, or `unknown`. The command exits 1 if anything is broken, which is what makes it worth putting in CI.

A tap file may carry an optional `url` key naming the listing page to check. It is not part of the template schema (the engine ignores it), it just tells `check` and `heal` where to look. The wizard writes the hint for you.

A tap with no hint is reported `unknown` rather than checked. The `host` is not turned into a page: most listing pages live at a path, so fetching `https://example.com/` to check a tap written for `https://example.com/blog` would report a healthy tap as broken. A check that lies is worse than a check that abstains.

```json
{
  "host": "example.com",
  "item": "article.post-card",
  "title": "h2",
  "url": "https://example.com/blog"
}
```

When a tap does break, `tap heal <path>` re-authors it against the live page: each old selector is re-applied first, the ones that still match are kept, and only the broken fields are walked. The previous file is kept as `<path>.bak`. Bundled taps in `@neurowire/taps` and `@neurowire/taps-pack` are code rather than user files, so a tap under `node_modules` has its replacement printed instead of written.

Nothing in this loop calls a model or needs an API key. Heuristics propose, a human confirms, and a deterministic verifier decides.

## Bundled taps

`@neurowire/taps` ships four curated taps, registered with `registerTaps()` / `registerAllTaps()`:

| Tap | Host | Feed title |
|-----|------|-----------|
| `claudeBlog` | `claude.com` | Claude Blog |
| `cursorBlog` | `cursor.com` | Cursor Blog |
| `deepmindBlog` | `deepmind.google` | Google DeepMind Blog |
| `mistralNews` | `mistral.ai` | Mistral AI News |

`cursorBlog` omits `link` because each post card is itself an `<a href="/blog/...">`, so the matched item element is the anchor.
