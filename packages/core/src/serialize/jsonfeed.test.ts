import { describe, expect, it } from 'vitest'
import { sampleFeed } from '../test-fixtures'
import { toJsonFeed, toJsonFeedObject } from './jsonfeed'

describe('toJsonFeed', () => {
  it('maps the feed onto JSON Feed 1.1 fields', () => {
    const doc = toJsonFeedObject(sampleFeed)
    expect(doc.version).toBe('https://jsonfeed.org/version/1.1')
    expect(doc.home_page_url).toBe('https://blog.example.com/')
    expect(doc.feed_url).toBe('https://blog.example.com/feed.atom')
    expect(doc.items).toHaveLength(2)
    expect(doc.items[0]).toMatchObject({
      id: 'https://blog.example.com/posts/hello-world',
      url: 'https://blog.example.com/posts/hello-world',
      title: 'Hello, World & <Friends>',
      date_published: '2024-03-09T08:30:00.000Z',
      tags: ['intro', 'meta'],
    })
  })

  it('serializes to valid JSON', () => {
    const parsed = JSON.parse(toJsonFeed(sampleFeed))
    expect(parsed.items[1].authors).toEqual([{ name: 'Grace Hopper' }])
  })
})
