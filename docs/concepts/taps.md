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

## Bundled taps

`@neurowire/taps` ships four curated taps, registered with `registerTaps()` / `registerAllTaps()`:

| Tap | Host | Feed title |
|-----|------|-----------|
| `claudeBlog` | `claude.com` | Claude Blog |
| `cursorBlog` | `cursor.com` | Cursor Blog |
| `deepmindBlog` | `deepmind.google` | Google DeepMind Blog |
| `mistralNews` | `mistral.ai` | Mistral AI News |

`cursorBlog` omits `link` because each post card is itself an `<a href="/blog/...">`, so the matched item element is the anchor.
