import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ingestDocument } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { registerTaps } from '../index'

const fixture = readFileSync(
  fileURLToPath(new URL('../__fixtures__/mistral-news.html', import.meta.url)),
  'utf8',
)

describe('mistral.ai tap', () => {
  it('extracts post-item cards with titles, links and dates', async () => {
    registerTaps()
    const feed = await ingestDocument({
      url: 'https://mistral.ai/news',
      contentType: 'text/html',
      body: fixture,
    })

    expect(feed.title).toBe('Mistral AI News')
    expect(feed.entries).toHaveLength(2)

    expect(feed.entries[0]?.title).toBe('Vibe gets to work.')
    expect(feed.entries[0]?.link).toBe('https://mistral.ai/news/vibe-agent')
    expect(feed.entries[0]?.published).toMatch(/^2026-05/)

    expect(feed.entries[1]?.link).toBe('https://mistral.ai/news/search-toolkit')
  })
})
