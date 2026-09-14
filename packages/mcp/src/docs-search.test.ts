import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOCS_INDEX_URL,
  createDocsIndex,
  fetchDocsIndex,
  searchSections,
  splitSections,
} from './docs-search'

const INDEX = [
  '---',
  'url: /concepts/meshes.md',
  '---',
  '# Meshes',
  '',
  'A mesh bundles many sources into one feed.',
  '',
  '```json',
  '# not a heading',
  'url: not-a-page',
  '```',
  '',
  '## Build a mesh',
  '',
  'Write a mesh file with a name and sources, then fetch the mesh.',
  '',
  '---',
  'url: /concepts/journals.md',
  '---',
  '# Journals',
  '',
  'An append-only archive.',
  '# Empty',
].join('\n')

describe('docs search', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('splits the index into heading-led sections tagged with absolute page urls', () => {
    const sections = splitSections(INDEX)
    expect(sections.map((section) => section.title)).toEqual(['Meshes', 'Build a mesh', 'Journals'])
    expect(sections[0]?.url).toBe('https://neurowire.starside.io/concepts/meshes.md')
    expect(sections[0]?.body).toContain('# not a heading')
    expect(sections[2]?.url).toBe('https://neurowire.starside.io/concepts/journals.md')
  })

  it('ranks title hits above body hits and ignores empty queries', () => {
    const sections = splitSections(INDEX)
    expect(searchSections(sections, 'build mesh', 5)[0]?.title).toBe('Build a mesh')
    expect(searchSections(sections, 'archive', 5).map((s) => s.title)).toEqual(['Journals'])
    expect(searchSections(sections, 'a', 5)).toEqual([])
    expect(searchSections(sections, 'zebra', 5)).toEqual([])
    expect(searchSections(sections, 'mesh', 1)).toHaveLength(1)
  })

  it('caches a successful load and retries after a failed one', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(INDEX)
    const index = createDocsIndex(load)
    await expect(index.search('mesh', 5)).rejects.toThrow('offline')
    expect((await index.search('mesh', 5)).length).toBeGreaterThan(0)
    await index.search('journal', 5)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('fetches the published index and surfaces HTTP failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(INDEX, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchDocsIndex()).toBe(INDEX)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(DOCS_INDEX_URL)
    await expect(fetchDocsIndex('https://docs.test/llms-full.txt')).rejects.toThrow('HTTP 503')
  })
})
