import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ingestDocument } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { registerTaps } from '../index'

const fixture = readFileSync(
  fileURLToPath(new URL('../__fixtures__/deepmind-blog.html', import.meta.url)),
  'utf8',
)

describe('deepmind.google tap', () => {
  it('extracts dated cards and resolves relative and cross-posted links', async () => {
    registerTaps()
    const feed = await ingestDocument({
      url: 'https://deepmind.google/discover/blog/',
      contentType: 'text/html',
      body: fixture,
    })

    expect(feed.title).toBe('Google DeepMind Blog')
    expect(feed.entries).toHaveLength(2)

    expect(feed.entries[0]?.title).toBe('Introducing Gemini Omni')
    expect(feed.entries[0]?.link).toBe(
      'https://blog.google/technology/google-deepmind/gemini-omni/',
    )
    expect(feed.entries[0]?.published).toMatch(/^2026/)

    // Relative /blog/ paths resolve against the host, not the /discover/blog/ listing.
    expect(feed.entries[1]?.link).toBe(
      'https://deepmind.google/blog/strengthening-singapores-ai-future/',
    )
  })
})
