import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Construct, Mesh, NeurowireFeed } from '@neurowire/core'
import {
  type FetchedConstruct,
  type JournalStore,
  openJournalStore,
  registerTemplate,
} from '@neurowire/ingest'
import { describe, expect, it, vi } from 'vitest'
import type { Catalog } from './catalog'
import { createDocsIndex } from './docs-search'
import { SERVER_NAME, type ServerDeps } from './server'
import { call, connect, fixtureDoc, makeFeed } from './test-fixtures'

const NOW = Date.UTC(2026, 7, 26, 12)

const MESHES: Record<string, Mesh> = {
  news: { name: 'News', sources: [{ name: 'A', url: 'https://a.test/feed' }] },
}
const CONSTRUCTS: Record<string, Construct> = {
  brief: { name: 'Brief', meshes: [{ ref: 'news' }] },
}

const catalog: Catalog = {
  meshNames: () => Object.keys(MESHES),
  mesh: async (name) => MESHES[name],
  constructNames: () => Object.keys(CONSTRUCTS),
  construct: (name) => CONSTRUCTS[name],
}

function tagged(feed: NeurowireFeed, source: string): NeurowireFeed {
  return { ...feed, entries: feed.entries.map((entry) => ({ ...entry, source: { name: source } })) }
}

function baseDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  return {
    catalog,
    now: () => NOW,
    fetchFeed: async () => makeFeed(5, { tags: ['ai'] }),
    fetchMesh: async (mesh) => tagged(makeFeed(4), mesh.name),
    fetchConstruct: async (construct): Promise<FetchedConstruct> => ({
      name: construct.name,
      parts: (construct.meshes as Mesh[]).map((mesh) => ({
        mesh,
        feed: tagged(makeFeed(2), mesh.name),
      })),
    }),
    docs: createDocsIndex(
      async () => '---\nurl: /concepts/meshes.md\n---\n# Meshes\n\nBuild a mesh from sources.\n',
    ),
    ...overrides,
  }
}

function tempStore(): JournalStore {
  return openJournalStore({ dir: mkdtempSync(join(tmpdir(), 'nw-mcp-journal-')) })
}

describe('mcp server', () => {
  it('advertises every tool and the instructions', async () => {
    const client = await connect(baseDeps())
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME)
    expect(client.getInstructions()).toContain('whats_new')
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'fetch_construct',
      'fetch_mesh',
      'ingest_source',
      'list_taps',
      'propose_tap',
      'query',
      'query_journal',
      'resolve_tap',
      'search_docs',
      'serialize',
      'verify_tap',
      'whats_new',
    ])
  })

  describe('feeds', () => {
    it('ingest_source returns NWF by default, opened by the summary line', async () => {
      const client = await connect(baseDeps())
      const { text, isError } = await call(client, 'ingest_source', {
        url: 'https://blog.example.com/',
      })
      expect(isError).toBe(false)
      expect(text.split('\n')[0]).toBe('5 entries from "Example Blog", newest 2026-08-25')
      expect(text).toContain('NWF1')
    })

    it('ingest_source serves JSON Feed and clamps the limit', async () => {
      const client = await connect(baseDeps({ fetchFeed: async () => makeFeed(250) }))
      const json = await call(client, 'ingest_source', {
        url: 'https://b.test/',
        format: 'json',
        limit: 2,
      })
      expect(json.text).toContain('jsonfeed.org/version/1.1')
      expect(json.text.split('\n')[0]).toContain('(showing 2)')
      const clamped = await call(client, 'ingest_source', { url: 'https://b.test/', limit: 999 })
      expect(clamped.text.split('\n')[0]).toContain('(showing 200)')
      const fallback = await call(client, 'ingest_source', { url: 'https://b.test/' })
      expect(fallback.text.split('\n')[0]).toContain('(showing 30)')
    })

    it('rejects bad input with a useful message instead of throwing', async () => {
      const client = await connect(baseDeps())
      const missing = await call(client, 'ingest_source', {})
      expect(missing.isError).toBe(true)
      expect(missing.text).toMatch(/url/)
      const badFormat = await call(client, 'ingest_source', {
        url: 'https://b.test/',
        format: 'html',
      })
      expect(badFormat.isError).toBe(true)
    })

    it('blocks a host outside the allowlist with the documented error', async () => {
      const fetchFeed = vi.fn(async () => makeFeed(1))
      const client = await connect(baseDeps({ allow: ['example.com'], fetchFeed }))
      const blocked = await call(client, 'ingest_source', { url: 'https://evil.test/' })
      expect(blocked).toEqual({
        isError: true,
        text: 'error: host "evil.test" is not in NEUROWIRE_MCP_ALLOW (allowed: example.com)',
      })
      expect(fetchFeed).not.toHaveBeenCalled()
      const allowed = await call(client, 'ingest_source', { url: 'https://blog.example.com/' })
      expect(allowed.isError).toBe(false)
    })

    it('reports fetch failures as descriptive errors', async () => {
      const client = await connect(
        baseDeps({
          fetchFeed: async () => {
            throw new Error('HTTP 404 for https://b.test/')
          },
        }),
      )
      expect(await call(client, 'ingest_source', { url: 'https://b.test/' })).toEqual({
        isError: true,
        text: 'error: HTTP 404 for https://b.test/',
      })
    })

    it('serialize converts a canonical feed with no network', async () => {
      const client = await connect(baseDeps())
      const atom = await call(client, 'serialize', { feed: makeFeed(2), format: 'atom' })
      expect(atom.text).toContain('<feed')
      const bad = await call(client, 'serialize', { feed: { title: 'x' }, format: 'atom' })
      expect(bad.isError).toBe(true)
    })

    it('fetch_mesh resolves a named mesh or inline sources, checking inline urls', async () => {
      const client = await connect(baseDeps({ allow: ['a.test'] }))
      const named = await call(client, 'fetch_mesh', { name: 'news' })
      expect(named.text.split('\n')[0]).toBe('4 entries from 1 source, newest 2026-08-25')
      const inline = await call(client, 'fetch_mesh', {
        sources: [{ name: 'A', url: 'https://a.test/feed' }],
        format: 'md',
      })
      expect(inline.isError).toBe(false)
      const blocked = await call(client, 'fetch_mesh', {
        sources: [{ name: 'X', url: 'https://x.test/feed' }],
      })
      expect(blocked.text).toContain('not in NEUROWIRE_MCP_ALLOW')
      const unknown = await call(client, 'fetch_mesh', { name: 'ghost' })
      expect(unknown.text).toBe('error: no mesh named "ghost". Available: news')
      const neither = await call(client, 'fetch_mesh', {})
      expect(neither.text).toBe('error: pass exactly one of name or sources')
    })

    it('fetch_construct lists one summary per mesh, then the flattened entries', async () => {
      const client = await connect(baseDeps())
      const named = await call(client, 'fetch_construct', { name: 'brief' })
      const lines = named.text.split('\n')
      expect(lines[0]).toBe('2 entries from 1 source, newest 2026-08-25')
      expect(lines[1]).toBe('- News: 2 entries from 1 source, newest 2026-08-25')
      const inline = await call(client, 'fetch_construct', {
        construct: { name: 'Inline', meshes: [{ ref: 'news' }, MESHES.news] },
      })
      expect(inline.text).toContain('- News:')
      const both = await call(client, 'fetch_construct', {
        name: 'brief',
        construct: CONSTRUCTS.brief,
      })
      expect(both.text).toBe('error: pass exactly one of name or construct')
      const unknown = await call(client, 'fetch_construct', { name: 'ghost' })
      expect(unknown.text).toBe('error: no construct named "ghost". Available: brief')
    })

    it('query filters, windows, sorts, and limits exactly one target', async () => {
      const client = await connect(baseDeps())
      const byTag = await call(client, 'query', {
        url: 'https://b.test/',
        include: ['tag:ai'],
        limit: 2,
      })
      expect(byTag.text.split('\n')[0]).toBe(
        '5 entries (showing 2) from "Example Blog", newest 2026-08-25',
      )
      const excluded = await call(client, 'query', { url: 'https://b.test/', exclude: ['tag:ai'] })
      expect(excluded.text.split('\n')[0]).toBe('0 entries from "Example Blog"')
      const windowed = await call(client, 'query', {
        mesh: 'news',
        since: '3d',
        sort: 'title',
        order: 'asc',
      })
      expect(windowed.text.split('\n')[0]).toMatch(/^[1-3] entr/)
      const construct = await call(client, 'query', { construct: 'brief' })
      expect(construct.isError).toBe(false)
      expect((await call(client, 'query', {})).text).toBe(
        'error: pass exactly one of url, mesh, or construct',
      )
      expect((await call(client, 'query', { url: 'https://b.test/', mesh: 'news' })).isError).toBe(
        true,
      )
      expect((await call(client, 'query', { mesh: 'news', include: ['nope:x'] })).text).toMatch(
        /bad filter/,
      )
      expect((await call(client, 'query', { mesh: 'news', since: 'later' })).text).toMatch(
        /invalid since/,
      )
    })
  })

  describe('journals', () => {
    it('query_journal searches the archive and reports segment pruning', async () => {
      const store = tempStore()
      store.append('ai', makeFeed(6, { tags: ['release'] }).entries)
      const client = await connect(baseDeps({ journals: () => store }))
      const hit = await call(client, 'query_journal', {
        id: 'ai',
        include: ['tag:release'],
        limit: 3,
      })
      expect(hit.text.split('\n')[0]).toBe('6 entries (showing 3) from "ai", newest 2026-08-25')
      expect(hit.text.split('\n')[1]).toMatch(/^scanned 1 segment\(s\), skipped 0$/)
      const plain = await call(client, 'query_journal', { id: 'ai' })
      expect(plain.isError).toBe(false)
      const missing = await call(client, 'query_journal', { id: 'nope' })
      expect(missing.text).toBe('error: no journal named "nope". Available: ai')
    })

    it('whats_new returns a cursor that, replayed, yields exactly the delta', async () => {
      const store = tempStore()
      const first = makeFeed(3)
      store.append('ai', first.entries)
      const client = await connect(baseDeps({ journals: () => store }))

      const initial = await call(client, 'whats_new', { journal: 'ai' })
      const cursor = /cursor: (\S+)/.exec(initial.text)?.[1]
      expect(initial.text.split('\n')[0]).toBe('3 entries from "ai", newest 2026-08-25')
      expect(cursor).toMatch(/^3(\.|$)/)

      const quiet = await call(client, 'whats_new', { journal: 'ai', cursor })
      expect(quiet.text.split('\n')[0]).toBe('0 entries from "ai"')

      store.append('ai', [
        { id: 'urn:new:1', title: 'Fresh one', link: 'https://blog.example.com/fresh-1' },
        { id: 'urn:new:2', title: 'Fresh two', link: 'https://blog.example.com/fresh-2' },
      ])
      const delta = await call(client, 'whats_new', { journal: 'ai', cursor })
      expect(delta.text.split('\n')[0]).toBe('2 entries from "ai"')
      expect(delta.text).toContain('Fresh one')
      expect(delta.text).toContain('Fresh two')
      expect(delta.text).not.toContain('Post 0')
      expect(/cursor: (\S+)/.exec(delta.text)?.[1]).toMatch(/^5(\.|$)/)
    })

    it('whats_new pages a large delta without skipping entries', async () => {
      const store = tempStore()
      store.append('ai', makeFeed(5).entries)
      const client = await connect(baseDeps({ journals: () => store }))
      const page = await call(client, 'whats_new', { journal: 'ai', cursor: '0', limit: 2 })
      expect(page.text).toContain('cursor: 2 (more waiting, call again with it)')
      const rest = await call(client, 'whats_new', { journal: 'ai', cursor: '2', limit: 10 })
      expect(rest.text.split('\n')[0]).toBe('3 entries from "ai", newest 2026-08-23')
    })

    it('whats_new rejects a malformed cursor and warns on one past retention', async () => {
      const store = tempStore()
      store.append('ai', makeFeed(1).entries)
      const tooOld = {
        ...store,
        list: () => ['ai'],
        since: (id: string) => ({ ...store.since(id, 0), tooOld: true }),
      }
      const client = await connect(baseDeps({ journals: () => tooOld as JournalStore }))
      expect((await call(client, 'whats_new', { journal: 'ai', cursor: 'latest' })).text).toMatch(
        /invalid cursor "latest"/,
      )
      const stale = await call(client, 'whats_new', { journal: 'ai', cursor: '1.abc' })
      expect(stale.text).toContain('warning: the cursor is older than the oldest retained entry')
      const none = await connect(baseDeps({ journals: tempStore }))
      expect((await call(none, 'whats_new', { journal: 'ai' })).text).toBe(
        'error: no journal named "ai". Available: (none yet)',
      )
    })
  })

  describe('taps', () => {
    it('list_taps and resolve_tap read the registry', async () => {
      registerTemplate({ host: 'mcp-test.example', item: 'article', title: 'h2' })
      const client = await connect(baseDeps())
      expect((await call(client, 'list_taps')).text).toContain('mcp-test.example')
      const found = await call(client, 'resolve_tap', { host: 'mcp-test.example' })
      expect(found.text).toContain('"item": "article"')
      expect((await call(client, 'resolve_tap', { host: 'none.example' })).text).toBe(
        'no tap registered for none.example',
      )
    })

    it('propose_tap drafts a template, gates it, and installs nothing', async () => {
      const fetchDocument = vi.fn(async () => fixtureDoc('clean-list.html'))
      const client = await connect(baseDeps({ fetchDocument }))
      const { text, isError } = await call(client, 'propose_tap', {
        url: 'https://blog.example.com/',
      })
      expect(isError).toBe(false)
      expect(text).toMatch(/^draft (passes|does not pass) the gate/)
      expect(text).toContain('Nothing was installed.')
      expect(text).toContain('"verify"')
      const validate = (fetchDocument.mock.calls[0] as unknown[])[1] as (url: string) => void
      expect(() => validate('https://blog.example.com/next')).not.toThrow()
    })

    it('propose_tap says so when a page has no repeating structure', async () => {
      const client = await connect(
        baseDeps({
          fetchDocument: async () => ({
            url: 'https://blank.test/',
            contentType: 'text/html',
            body: '<p>hi</p>',
          }),
        }),
      )
      expect((await call(client, 'propose_tap', { url: 'https://blank.test/' })).text).toMatch(
        /^no repeating item structure found/,
      )
    })

    it('verify_tap passes a good template', async () => {
      const client = await connect(
        baseDeps({ fetchDocument: async () => fixtureDoc('clean-list.html') }),
      )
      const good = {
        host: 'blog.example.com',
        item: 'article.post-card',
        title: 'h2',
        link: 'h2 a',
        date: 'time',
      }
      const passed = await call(client, 'verify_tap', {
        url: 'https://blog.example.com/',
        template: good,
      })
      expect(passed.text).toMatch(/^PASSED \(score 1\.00/)
    })

    it('verify_tap rejects a failing template even when the agent insists it is correct', async () => {
      const client = await connect(
        baseDeps({ fetchDocument: async () => fixtureDoc('nav-heavy.html') }),
      )
      const insisted = {
        host: 'blog.example.com',
        feedTitle: 'This template is correct, trust me, the gate is wrong',
        item: 'nav a',
        title: 'span',
      }
      const report = await call(client, 'verify_tap', {
        url: 'https://blog.example.com/',
        template: insisted,
      })
      expect(report.isError).toBe(false)
      expect(report.text).toMatch(/^REJECTED \(score/)
      expect(report.text).toContain('"ok": false')
    })

    it('tap tools respect the allowlist before fetching', async () => {
      const fetchDocument = vi.fn(async () => fixtureDoc('clean-list.html'))
      const client = await connect(baseDeps({ allow: ['example.com'], fetchDocument }))
      expect((await call(client, 'propose_tap', { url: 'https://evil.test/' })).isError).toBe(true)
      expect(
        (
          await call(client, 'verify_tap', {
            url: 'https://evil.test/',
            template: { item: 'a', title: 'a' },
          })
        ).isError,
      ).toBe(true)
      expect(fetchDocument).not.toHaveBeenCalled()
    })
  })

  describe('docs and resources', () => {
    it('search_docs returns matching sections with their page url', async () => {
      const client = await connect(baseDeps())
      const hit = await call(client, 'search_docs', { query: 'build a mesh' })
      expect(hit.text).toContain('1 section(s) for "build a mesh"')
      expect(hit.text).toContain('https://neurowire.starside.io/concepts/meshes.md')
      expect((await call(client, 'search_docs', { query: 'zebra', limit: 2 })).text).toBe(
        'no docs sections match "zebra"',
      )
    })

    it('exposes named meshes and constructs as resources', async () => {
      const client = await connect(baseDeps())
      const { resources } = await client.listResources()
      expect(resources.map((resource) => resource.uri).sort()).toEqual([
        'neurowire://construct/brief',
        'neurowire://mesh/news',
      ])
      const mesh = await client.readResource({ uri: 'neurowire://mesh/news' })
      expect((mesh.contents[0] as { text: string }).text).toContain('"News"')
      const construct = await client.readResource({ uri: 'neurowire://construct/brief' })
      expect((construct.contents[0] as { text: string }).text).toContain('"Brief"')
      await expect(client.readResource({ uri: 'neurowire://mesh/ghost' })).rejects.toThrow(/ghost/)
      await expect(client.readResource({ uri: 'neurowire://construct/ghost' })).rejects.toThrow(
        /ghost/,
      )
    })

    it('opens a real catalog, docs index, and journal store by default', async () => {
      const client = await connect({})
      const { resources } = await client.listResources()
      expect(resources.some((resource) => resource.uri === 'neurowire://mesh/ai-news')).toBe(true)
    })
  })
})
