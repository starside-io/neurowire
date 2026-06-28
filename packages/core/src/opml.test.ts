import { describe, expect, it } from 'vitest'
import type { Construct, Mesh } from './model'
import { constructToOpml, meshToOpml } from './opml'

const mesh: Mesh = {
  name: 'AI News',
  sources: [
    { name: 'Claude Blog', url: 'https://claude.com/blog' },
    { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  ],
}

describe('meshToOpml', () => {
  it('produces a well-formed OPML 2.0 document', () => {
    const opml = meshToOpml(mesh)
    expect(opml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(opml).toContain('<opml version="2.0">')
    expect(opml).toContain('<title>AI News</title>')
    expect(opml).toContain('</opml>')
  })

  it('emits one outline per source with xmlUrl and htmlUrl', () => {
    const opml = meshToOpml(mesh)
    expect(opml.match(/<outline /g) ?? []).toHaveLength(2)
    expect(opml).toContain(
      '<outline type="rss" text="Claude Blog" title="Claude Blog" xmlUrl="https://claude.com/blog" htmlUrl="https://claude.com/blog"/>',
    )
  })

  it('escapes XML special characters in names and urls', () => {
    const tricky: Mesh = {
      name: 'A & B <c>',
      sources: [{ name: 'Q"x" & <y>', url: 'https://e.com/?a=1&b=2' }],
    }
    const opml = meshToOpml(tricky)
    expect(opml).toContain('<title>A &amp; B &lt;c&gt;</title>')
    expect(opml).toContain('text="Q&quot;x&quot; &amp; &lt;y&gt;"')
    expect(opml).toContain('xmlUrl="https://e.com/?a=1&amp;b=2"')
  })

  it('emits an empty body for a mesh with no sources', () => {
    const opml = meshToOpml({ name: 'Empty', sources: [] })
    expect(opml).toContain('  <body>')
    expect(opml).not.toContain('<outline')
  })
})

describe('constructToOpml', () => {
  const construct: Construct = {
    name: 'Daily',
    meshes: [
      {
        name: 'Models',
        sources: [{ name: 'Claude Blog', url: 'https://claude.com/blog' }],
      },
      { name: 'Empty Group', sources: [] },
      { ref: 'security' },
    ],
  }

  it('nests source outlines inside one category outline per mesh', () => {
    const opml = constructToOpml(construct)
    expect(opml).toContain('<title>Daily</title>')
    expect(opml).toContain('    <outline text="Models" title="Models">')
    expect(opml).toContain(
      '      <outline type="rss" text="Claude Blog" title="Claude Blog" xmlUrl="https://claude.com/blog" htmlUrl="https://claude.com/blog"/>',
    )
    expect(opml).toContain('    </outline>')
  })

  it('emits a self-closing category outline for an empty mesh', () => {
    const opml = constructToOpml(construct)
    expect(opml).toContain('<outline text="Empty Group" title="Empty Group"/>')
  })

  it('emits a self-closing outline for a ref member', () => {
    const opml = constructToOpml(construct)
    expect(opml).toContain('<outline text="security" title="security"/>')
  })
})
