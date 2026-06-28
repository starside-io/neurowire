# Epic 2: OPML import / export

## Goal

Bridge neurowire meshes/constructs to the wider feed-reader ecosystem. OPML is
the universal subscription-list format every reader (Feedly, Inoreader,
NetNewsWire, ...) imports and exports. A mesh *is* a subscription list, so:

- **Export:** mesh / construct -> OPML, so users seed any reader from neurowire.
- **Import:** OPML -> mesh JSON, so migrants from other readers get a mesh in one
  command.

This makes neurowire a drop-in step in an existing reader workflow.

## Scope

- **Export (core):** `core/src/opml.ts` with `meshToOpml(mesh): string` and
  `constructToOpml(construct): string`. OPML is not a feed serializer, so it does
  NOT join the `serialize()`/`FORMATS` switch; it is a sibling top-level export
  from core (keep it format-pure but it is still pure string work, fits core).
- **Import (ingest):** `ingest/src/opml.ts` with `opmlToMesh(xml, name?): Mesh`.
  Parsing belongs in ingest (it owns `fast-xml-parser` and parsing concerns);
  core stays parser-free except its own formats. Re-validate output against the
  `Mesh` zod schema from core.
- **CLI wiring:**
  - `neurowire opml export --mesh <file>` / `--construct <file>` -> OPML to
    stdout or `-o`.
  - `neurowire opml import <file-or-url> [-o mesh.json] [--name <name>]`.
- Tests: core export 100%; ingest import within 90/95/90 thresholds.

## Non-goals

- Nested OPML categories beyond one level (construct -> mesh -> source maps
  naturally to OPML `outline` nesting two deep; deeper trees out of scope).
- OPML `head` metadata round-trip fidelity (dateCreated, ownerName) beyond
  title; emit minimal valid head.
- API endpoint for OPML (can add later; not in this epic).

## Dependencies

- **Soft, on Epic 1:** none code-wise. Independent. Can ship before or after 1.
- Relies on existing `Mesh` / `Construct` types and zod schemas in core, and
  `fast-xml-parser` already in ingest. No new runtime deps.
- Pairs naturally with **Epic 5** (taps-pack): import an OPML, get a mesh, render
  it. Ship 2 and 5 in either order.

## Mapping

### Export: mesh -> OPML

```
<opml version="2.0">
  <head><title>{mesh.name}</title></head>
  <body>
    <!-- one outline per source -->
    <outline type="rss" text="{source.name}" title="{source.name}"
             xmlUrl="{source.url}" />
  </body>
</opml>
```

`xmlUrl` is the source URL. For feed-less tap sites the URL is the page URL; that
is acceptable (OPML readers will try it; neurowire itself re-taps it). Optionally
set `htmlUrl` = same.

### Export: construct -> OPML

Two-level nesting: one `<outline text="{mesh.name}">` per mesh, each containing
its source outlines. Mirrors `flattenConstruct` grouping without flattening.

### Import: OPML -> mesh

- Walk every `<outline>` that has an `xmlUrl`.
- `{ name: outline.text ?? outline.title ?? host(xmlUrl), url: xmlUrl }`.
- Mesh `name` = `--name` flag, else OPML `head/title`, else `"imported"`.
- Flatten nested categories (we collect all leaf outlines with `xmlUrl`); record
  category as nothing for now (mesh has no per-source grouping; that is what a
  construct is, but importing OPML categories -> construct is a non-goal here).
- Validate the produced object with the core `Mesh` schema before returning.

## Steps

1. **Export:** write `core/src/opml.ts` (`meshToOpml`, `constructToOpml`), reuse
   core's XML-escape helper (extract shared from atom/rss if Epic 1 landed).
   Export from `core/src/index.ts`.
2. **Import:** write `ingest/src/opml.ts` (`opmlToMesh`) using the same
   `fast-xml-parser` config the feed parsers use. Validate with `MeshSchema`.
3. **CLI:** add an `opml` subcommand group in
   [cli/src/index.ts](../../packages/cli/src/index.ts) next to `validate` /
   `tap doctor`. For import-from-URL, reuse the existing fetch util.
4. Tests:
   - core: mesh export, construct export, escaping, empty mesh.
   - ingest: import flat OPML, nested OPML, outlines missing xmlUrl (skipped),
     name fallbacks, malformed XML (throws), schema validation.
5. `pnpm build && pnpm test && pnpm typecheck && pnpm lint`.
6. README: add an "Interop / OPML" subsection with the two commands.

## Risks / decisions

- **Round-trip is lossy by design:** OPML has no concept of neurowire taps,
  dedup, or source tagging. Document that export is "subscription list out",
  import is "subscription list in", not a full backup format (nwf is that).
- **Construct import:** intentionally deferred. If demand appears, map top-level
  OPML categories -> meshes -> a construct. Note it as a follow-up.
- **xmlUrl vs htmlUrl for tap sites:** a tap source URL is an HTML page, not a
  feed. Set both `xmlUrl` and `htmlUrl` to it so strict readers do not drop it.

## Acceptance

- Export a bundled mesh/construct, import the result into a real reader.
- Export from a real reader (e.g. NetNewsWire), `opml import` it, `neurowire
  --mesh` the result renders.
- core export 100%; ingest import within thresholds.
