import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  // Feeds that embed full HTML can reference far more than the default 1000
  // entities. Raise the count limit, but keep the total expanded length bounded
  // so entity-expansion bombs (billion laughs) are still rejected.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 20_000_000,
    maxExpandedLength: 50_000_000,
  },
})

export function parseXml(body: string): Record<string, unknown> {
  const result = parser.parse(body)
  return (result ?? {}) as Record<string, unknown>
}

/** Read a property from a parsed XML node (returns undefined for non-objects). */
export function get(node: unknown, key: string): unknown {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    return (node as Record<string, unknown>)[key]
  }
  return undefined
}

/** Coerce a value that may be a single node or an array of nodes into an array. */
export function toArray<T = unknown>(value: unknown): T[] {
  if (value === undefined || value === null) return []
  return (Array.isArray(value) ? value : [value]) as T[]
}

/** Read the text content of a node, whether it is a string or a `{ '#text': ... }` object. */
export function text(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined
  if (typeof node === 'string') return node.trim() || undefined
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  const inner = get(node, '#text')
  if (typeof inner === 'string') return inner.trim() || undefined
  if (typeof inner === 'number') return String(inner)
  return undefined
}

/** Read an attribute value (e.g. `attr(link, 'href')`). */
export function attr(node: unknown, name: string): string | undefined {
  const value = get(node, `@_${name}`)
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  return undefined
}
