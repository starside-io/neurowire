import type { NeurowireFeed } from '@neurowire/core'
import { describe, expect, it } from 'vitest'
import { toHtml } from './render'

const sample: NeurowireFeed = {
  id: 'https://blog.example.com/feed.atom',
  title: 'Example Blog',
  updated: '2024-03-10T12:00:00.000Z',
  entries: [
    {
      id: '1',
      title: 'Hello, World & <Friends>',
      link: 'https://blog.example.com/posts/hello-world',
      published: '2024-03-09T08:30:00Z',
      summary: 'A first post.',
      tags: ['intro', 'meta'],
    },
    {
      id: '2',
      title: 'Second',
      link: 'https://blog.example.com/posts/second',
      updated: '2024-03-10T11:00:00Z',
    },
  ],
}

describe('toHtml', () => {
  it('renders a self-contained, escaped page', () => {
    const html = toHtml(sample)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Example Blog - Neurowire</title>')
    expect(html).toContain('Hello, World &amp; &lt;Friends&gt;')
    expect(html).toContain('href="https://blog.example.com/posts/hello-world"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<li>intro</li>')
    expect(html).toContain('A first post.')
    expect(html).toContain('>Example Blog<') // source falls back to the feed title
    expect(html).not.toContain('<link ') // no external stylesheet
    expect(html).not.toContain('googleapis') // no external fonts
  })

  it('assigns a distinct accent per source and counts distinct sources', () => {
    const feed: NeurowireFeed = {
      id: 'm',
      title: 'Mesh',
      updated: '2024-01-02T00:00:00.000Z',
      entries: [
        {
          id: '1',
          title: 'One',
          link: 'https://a/1',
          source: { name: 'Source A' },
          updated: '2024-01-02T00:00:00Z',
        },
        { id: '2', title: 'Two', link: 'https://b/2', source: { name: 'Source B' } },
        { id: '3', title: 'Three', link: 'https://a/3', source: { name: 'Source A' } },
      ],
    }
    const html = toHtml(feed)
    expect(html).toContain('>Source A<')
    expect(html).toContain('>Source B<')
    expect(html).toContain('<span class="count">3</span>')
    expect(html).toContain('sources</span> 2')
    expect(html).toContain('--rail: #45e6ff')
    expect(html).toContain('--rail: #ff5cc8')
  })

  it('omits date, summary, and tags when absent and tolerates a bad feed date', () => {
    const feed: NeurowireFeed = {
      id: 'e',
      title: 'Edge',
      updated: 'not-a-date',
      entries: [{ id: '1', title: 'Bare', link: 'https://x/1' }],
    }
    const html = toHtml(feed)
    expect(html).toContain('Bare')
    expect(html).not.toContain('class="summary"')
    expect(html).not.toContain('class="tags"')
    expect(html).not.toContain('class="card-date"')
    expect(html).toContain('>Edge<')
    expect(html).toContain('<time datetime="">')
  })
})
