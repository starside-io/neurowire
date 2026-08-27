import { type FeedTemplate, ingestDocument } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { previewTemplate } from './preview'
import { fixtureDoc } from './test-fixtures'

const full: FeedTemplate = {
  item: 'article.post-card',
  title: 'h2',
  link: 'h2 a',
  date: 'time',
  summary: 'p.post-excerpt',
  author: 'span.post-author',
  tags: 'span.post-tag',
}

describe('previewTemplate', () => {
  it('reports exactly what the engine extracts for the same template', async () => {
    const doc = fixtureDoc('clean-list.html')
    const preview = await previewTemplate(doc, full)
    const feed = await ingestDocument(doc, { template: full })

    expect(preview.error).toBeUndefined()
    expect(preview.matched).toBe(feed.entries.length)
    expect(preview.entries.map((entry) => entry.title)).toEqual(
      feed.entries.map((entry) => entry.title),
    )
    expect(preview.entries.map((entry) => entry.link)).toEqual(
      feed.entries.map((entry) => entry.link),
    )
  })

  it('flattens every field a row carries', async () => {
    const preview = await previewTemplate(fixtureDoc('clean-list.html'), full)

    expect(preview.entries[0]).toEqual({
      title: 'Alpha Release Notes',
      link: 'https://blog.example.com/posts/alpha',
      date: '2026-03-01T09:00:00.000Z',
      summary: 'What shipped in the alpha, and what is still behind a flag.',
      author: 'Ada Vex',
      tags: ['release'],
    })
  })

  it('leaves absent fields blank rather than undefined', async () => {
    const preview = await previewTemplate(fixtureDoc('nav-heavy.html'), {
      item: 'article.post-card',
      title: 'h2',
    })

    expect(preview.entries[0]).toMatchObject({ date: '', summary: '', author: '', tags: [] })
  })

  it('reports the raw item count when no title is chosen yet', async () => {
    const preview = await previewTemplate(fixtureDoc('clean-list.html'), {
      item: 'article.post-card',
      title: '',
    })

    expect(preview.matched).toBe(5)
    expect(preview.entries).toEqual([])
    expect(preview.error).toBeUndefined()
  })

  it('says so when no item selector has been chosen', async () => {
    const preview = await previewTemplate(fixtureDoc('clean-list.html'), {
      item: '  ',
      title: 'h2',
    })

    expect(preview).toEqual({ matched: 0, entries: [], error: 'no item selector yet' })
  })

  it('returns the engine error instead of throwing on a bad selector', async () => {
    const preview = await previewTemplate(fixtureDoc('clean-list.html'), {
      item: 'article[',
      title: 'h2',
    })

    expect(preview.matched).toBe(0)
    expect(preview.entries).toEqual([])
    expect(preview.error).toBeTruthy()
  })
})
