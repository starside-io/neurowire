# OPML

OPML 2.0 is a subscription-list interchange format, used to move feed lists between readers. Neurowire can export a mesh or construct to OPML and import an OPML file into a mesh.

::: info Not a feed format
OPML is **not** a feed serializer. It is not one of the `serialize()` formats (`nwf`, `atom`, `rss`, `json`, `md`) and it does not carry articles. It is lossy interchange: it lists which sources a mesh or construct subscribes to, so you can hand that list to a feed reader, or build a mesh from a reader's export.
:::

| Direction | Function | Package |
|---|---|---|
| Export a mesh | `meshToOpml(mesh)` | `@neurowire/core` (`packages/core/src/opml.ts`) |
| Export a construct | `constructToOpml(construct)` | `@neurowire/core` |
| Import to a mesh | `opmlToMesh(xml, name?)` | `@neurowire/ingest` (`packages/ingest/src/opml.ts`) |

## Export

```ts
import { meshToOpml, constructToOpml } from '@neurowire/core'

const opml = meshToOpml(mesh)
const repoOpml = constructToOpml(construct)
```

### `meshToOpml`

Serializes a mesh to a flat OPML 2.0 list: one `<outline>` per source. Each source outline carries `type="rss"`, `text` and `title` set to the source name, and both `xmlUrl` and `htmlUrl` pointing at the source URL. The OPML `head/title` is the mesh name.

### `constructToOpml`

Serializes a construct with two-level nesting: one category `<outline>` per mesh, each wrapping its source outlines. This mirrors the construct's per-mesh grouping. A reference member (`{ ref }`) carries no sources of its own, so it emits an empty category outline (named after the ref); a mesh with zero sources likewise emits an empty category outline.

## Import

```ts
import { opmlToMesh } from '@neurowire/ingest'

const mesh = opmlToMesh(xml, 'My Reader')
```

`opmlToMesh` parses an OPML 2.0 subscription list into a [`Mesh`](/concepts/meshes):

- Every `<outline>` that has an `xmlUrl` becomes a source `{ name, url }`. The name is the outline's `text`, else its `title`, else the URL's host (falling back to the raw URL).
- Nested categories are walked recursively and **flattened**: a mesh has no per-source grouping, so two-level structure (as exported from a construct) collapses to one list. Outlines without an `xmlUrl` (bare categories) are skipped, but their children are still visited.
- The mesh name is the `name` argument (trimmed), else the OPML `head/title`, else `"imported"`.
- The result is validated against the core `Mesh` schema (`MeshSchema.parse`), so a malformed result throws.

`opmlToMesh` throws on malformed XML or when the document has no `<opml>` root.

## Sample OPML

A mesh exported with `meshToOpml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head>
    <title>AI News</title>
  </head>
  <body>
    <outline type="rss" text="Anthropic" title="Anthropic" xmlUrl="https://www.anthropic.com/news" htmlUrl="https://www.anthropic.com/news"/>
    <outline type="rss" text="OpenAI" title="OpenAI" xmlUrl="https://openai.com/blog/rss.xml" htmlUrl="https://openai.com/blog/rss.xml"/>
  </body>
</opml>
```

A construct exported with `constructToOpml` (two levels):

```xml
<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head>
    <title>Daily</title>
  </head>
  <body>
    <outline text="AI News" title="AI News">
      <outline type="rss" text="Anthropic" title="Anthropic" xmlUrl="https://www.anthropic.com/news" htmlUrl="https://www.anthropic.com/news"/>
    </outline>
    <outline text="Dev" title="Dev">
      <outline type="rss" text="Rust Blog" title="Rust Blog" xmlUrl="https://blog.rust-lang.org/feed.xml" htmlUrl="https://blog.rust-lang.org/feed.xml"/>
    </outline>
  </body>
</opml>
```

## CLI

The `opml` subcommand group has `export` and `import`:

```bash
# Export a mesh or construct to OPML 2.0 (stdout, or -o <file>)
neurowire opml export --mesh ai-news.json > ai-news.opml
neurowire opml export --construct daily.json -o daily.opml

# Import an OPML file or URL into a mesh JSON
neurowire opml import subscriptions.opml -o mesh.json --name "My Reader"
```

`opml export` needs `--mesh <file>` or `--construct <file>`. `opml import` takes a file path or `http(s)` URL; the mesh name comes from `--name`, else the OPML `head/title`, else `"imported"`.

See [the CLI guide](/guide/cli) and [Meshes](/concepts/meshes).
