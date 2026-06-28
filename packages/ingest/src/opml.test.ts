import { describe, expect, it } from 'vitest'
import { opmlToMesh } from './opml'

const flat = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head><title>My Subscriptions</title></head>
  <body>
    <outline type="rss" text="Claude Blog" title="Claude Blog" xmlUrl="https://claude.com/blog" htmlUrl="https://claude.com/blog"/>
    <outline type="rss" text="OpenAI" xmlUrl="https://openai.com/news/rss.xml"/>
  </body>
</opml>`

const nested = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head><title>Daily</title></head>
  <body>
    <outline text="Models">
      <outline type="rss" text="Claude Blog" xmlUrl="https://claude.com/blog"/>
      <outline type="rss" text="OpenAI" xmlUrl="https://openai.com/news/rss.xml"/>
    </outline>
    <outline text="Releases">
      <outline type="rss" text="Releases" xmlUrl="https://github.com/x/releases.atom"/>
    </outline>
  </body>
</opml>`

describe('opmlToMesh', () => {
  it('imports a flat OPML into mesh sources', () => {
    const mesh = opmlToMesh(flat)
    expect(mesh.name).toBe('My Subscriptions')
    expect(mesh.sources).toEqual([
      { name: 'Claude Blog', url: 'https://claude.com/blog' },
      { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
    ])
  })

  it('flattens nested categories, collecting every leaf outline', () => {
    const mesh = opmlToMesh(nested)
    expect(mesh.name).toBe('Daily')
    expect(mesh.sources.map((s) => s.url)).toEqual([
      'https://claude.com/blog',
      'https://openai.com/news/rss.xml',
      'https://github.com/x/releases.atom',
    ])
  })

  it('skips outlines without an xmlUrl but visits their children', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="Bare Category"/>
      <outline text="Group"><outline text="Leaf" xmlUrl="https://e.com/feed"/></outline>
    </body></opml>`
    const mesh = opmlToMesh(xml)
    expect(mesh.sources).toEqual([{ name: 'Leaf', url: 'https://e.com/feed' }])
  })

  it('falls back name to title then host when text is missing', () => {
    const xml = `<opml version="2.0"><body>
      <outline title="By Title" xmlUrl="https://a.com/feed"/>
      <outline xmlUrl="https://b.com/path/feed.xml"/>
    </body></opml>`
    const mesh = opmlToMesh(xml)
    expect(mesh.sources).toEqual([
      { name: 'By Title', url: 'https://a.com/feed' },
      { name: 'b.com', url: 'https://b.com/path/feed.xml' },
    ])
  })

  it('uses the raw url as a name when it cannot be parsed', () => {
    const xml = `<opml version="2.0"><body>
      <outline xmlUrl="not a url"/>
    </body></opml>`
    const mesh = opmlToMesh(xml)
    expect(mesh.sources).toEqual([{ name: 'not a url', url: 'not a url' }])
  })

  it('names the mesh from the --name argument over the head title', () => {
    expect(opmlToMesh(flat, 'Override').name).toBe('Override')
  })

  it('falls back to "imported" when no name and no head title', () => {
    const xml = `<opml version="2.0"><body><outline xmlUrl="https://e.com/feed"/></body></opml>`
    expect(opmlToMesh(xml).name).toBe('imported')
  })

  it('reads a CDATA-wrapped head title', () => {
    const xml = `<opml version="2.0"><head><title><![CDATA[Wrapped Title]]></title></head><body><outline xmlUrl="https://e.com/feed"/></body></opml>`
    expect(opmlToMesh(xml).name).toBe('Wrapped Title')
  })

  it('produces a schema-valid mesh (sources is an array)', () => {
    const xml = `<opml version="2.0"><head><title>Empty</title></head><body></body></opml>`
    const mesh = opmlToMesh(xml)
    expect(mesh).toEqual({ name: 'Empty', sources: [] })
  })

  it('throws when the document is not OPML', () => {
    expect(() => opmlToMesh('<rss><channel/></rss>')).toThrow(/Not an OPML document/)
  })

  it('throws on malformed XML', () => {
    expect(() => opmlToMesh('<opml><body><outline')).toThrow()
  })
})
