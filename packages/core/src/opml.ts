import type { Construct, ConstructMember, Mesh } from './model'
import { isConstructRef } from './model'

// Inline XML escaping kept local to this module on purpose: the serialize/
// package owns its own escaping and we must not couple to it.
const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

/** A single `<outline>` for a mesh source. `xmlUrl` and `htmlUrl` both point at the source URL. */
function sourceOutline(name: string, url: string, indent: string): string {
  const text = escapeAttr(name)
  const href = escapeAttr(url)
  return `${indent}<outline type="rss" text="${text}" title="${text}" xmlUrl="${href}" htmlUrl="${href}"/>`
}

function head(title: string): string {
  return ['  <head>', `    <title>${escapeText(title)}</title>`, '  </head>'].join('\n')
}

/** Serialize a mesh to an OPML 2.0 subscription list: one `<outline>` per source. */
export function meshToOpml(mesh: Mesh): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<opml version="2.0">',
    head(mesh.name),
    '  <body>',
  ]
  for (const source of mesh.sources) {
    lines.push(sourceOutline(source.name, source.url, '    '))
  }
  lines.push('  </body>', '</opml>', '')
  return lines.join('\n')
}

/** Lines for one construct member: a category `<outline>` wrapping its sources. */
function categoryOutline(member: ConstructMember): string[] {
  if (isConstructRef(member)) {
    return [`    <outline text="${escapeAttr(member.ref)}" title="${escapeAttr(member.ref)}"/>`]
  }
  const text = escapeAttr(member.name)
  if (member.sources.length === 0) {
    return [`    <outline text="${text}" title="${text}"/>`]
  }
  const lines = [`    <outline text="${text}" title="${text}">`]
  for (const source of member.sources) {
    lines.push(sourceOutline(source.name, source.url, '      '))
  }
  lines.push('    </outline>')
  return lines
}

/**
 * Serialize a construct to an OPML 2.0 document with two-level nesting: one
 * category `<outline>` per mesh, each wrapping its source outlines. Mirrors the
 * construct's per-mesh grouping. Reference members (`{ ref }`) carry no sources
 * of their own here, so they emit an empty category outline.
 */
export function constructToOpml(construct: Construct): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<opml version="2.0">',
    head(construct.name),
    '  <body>',
  ]
  for (const member of construct.meshes) {
    lines.push(...categoryOutline(member))
  }
  lines.push('  </body>', '</opml>', '')
  return lines.join('\n')
}
