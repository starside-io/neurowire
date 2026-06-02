import type { NeurowireFeed } from './model'

const iso = (s: string): string => new Date(s).toISOString()

/** A rich feed that exercises every serializer field (escaping, dates, authors, tags). */
export const sampleFeed: NeurowireFeed = {
  id: 'https://blog.example.com/feed.atom',
  title: 'Example Blog',
  home: 'https://blog.example.com/',
  self: 'https://blog.example.com/feed.atom',
  updated: iso('2024-03-10T12:00:00Z'),
  authors: [{ name: 'Ada Lovelace', url: 'https://ada.example.com' }],
  generator: { name: 'Neurowire', version: '0.1.0' },
  entries: [
    {
      id: 'https://blog.example.com/posts/hello-world',
      title: 'Hello, World & <Friends>',
      link: 'https://blog.example.com/posts/hello-world',
      published: iso('2024-03-09T08:30:00Z'),
      updated: iso('2024-03-09T09:00:00Z'),
      summary: 'A first post about getting started.',
      authors: [{ name: 'Ada Lovelace', url: 'https://ada.example.com' }],
      tags: ['intro', 'meta'],
    },
    {
      id: 'https://blog.example.com/posts/second',
      title: 'On Compact Formats',
      link: 'https://blog.example.com/posts/second',
      published: iso('2024-03-10T11:00:00Z'),
      updated: iso('2024-03-10T11:00:00Z'),
      summary: 'Why fewer bytes can be nicer.',
      authors: [{ name: 'Grace Hopper' }],
      tags: ['intro', 'formats'],
    },
  ],
}

/** A feed restricted to fields that the compact `nwf` format round-trips exactly. */
export const roundTripFeed: NeurowireFeed = {
  id: 'https://blog.example.com/feed.atom',
  title: 'Example Blog',
  home: 'https://blog.example.com/',
  self: 'https://blog.example.com/feed.atom',
  updated: iso('2024-03-10T12:00:00Z'),
  authors: [{ name: 'Ada Lovelace', url: 'https://ada.example.com' }],
  entries: [
    {
      id: 'https://blog.example.com/posts/hello-world',
      title: 'Hello, World',
      link: 'https://blog.example.com/posts/hello-world',
      updated: iso('2024-03-09T09:00:00Z'),
      summary: 'A first post.',
      authors: [{ name: 'Ada Lovelace', url: 'https://ada.example.com' }],
      tags: ['intro', 'meta'],
      source: { name: 'Example Blog', url: 'https://blog.example.com/' },
    },
    {
      id: 'https://blog.example.com/posts/second',
      title: 'On Compact Formats',
      link: 'https://blog.example.com/posts/second',
      updated: iso('2024-03-10T11:00:00Z'),
      authors: [{ name: 'Grace Hopper' }],
      tags: ['intro', 'formats'],
      source: { name: 'Example Blog', url: 'https://blog.example.com/' },
    },
  ],
}
