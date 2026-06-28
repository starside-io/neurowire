import { type Mesh, MeshSchema } from '@neurowire/core'
import { attr, get, parseXml, text, toArray } from './parsers/xml'

/** Best-effort host of a URL, used as a last-resort source name. Falls back to the raw url. */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/**
 * Collect every leaf `<outline>` that carries an `xmlUrl` into mesh sources.
 * Walks nested categories (constructs export two levels deep), flattening them:
 * a mesh has no per-source grouping, so category structure is dropped. Outlines
 * without an `xmlUrl` (bare categories) are skipped, but their children are still
 * visited.
 */
function collectSources(nodes: unknown, into: Mesh['sources']): void {
  for (const node of toArray(nodes)) {
    const xmlUrl = attr(node, 'xmlUrl')
    if (xmlUrl) {
      const name = attr(node, 'text') ?? attr(node, 'title') ?? hostOf(xmlUrl)
      into.push({ name, url: xmlUrl })
    }
    const children =
      node && typeof node === 'object' ? (node as Record<string, unknown>) : undefined
    if (children && 'outline' in children) collectSources(children.outline, into)
  }
}

/**
 * Parse an OPML 2.0 subscription list into a {@link Mesh}. Every `<outline>` with
 * an `xmlUrl` becomes a source `{ name, url }`, where name is `text`, else
 * `title`, else the url's host. Nested categories are flattened. The mesh name is
 * the `name` argument, else the OPML `head/title`, else `"imported"`. Throws on
 * malformed XML or when the result fails the core `Mesh` schema.
 */
export function opmlToMesh(xml: string, name?: string): Mesh {
  const doc = parseXml(xml)
  const opml = doc.opml as Record<string, unknown> | undefined
  if (!opml) throw new Error('Not an OPML document (missing <opml> root)')

  const body = opml.body as Record<string, unknown> | undefined
  const sources: Mesh['sources'] = []
  if (body) collectSources(body.outline, sources)

  const headTitle = text(get(opml.head, 'title'))
  const meshName = name?.trim() || headTitle || 'imported'

  return MeshSchema.parse({ name: meshName, sources })
}
