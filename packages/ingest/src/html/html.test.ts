import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { autodetect, discoverFeedLink } from './autodetect'
import { applyTemplate } from './template'

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), 'utf8')

const ctx = { sourceUrl: 'https://blog.example.com/' }

describe('discoverFeedLink', () => {
  it('prefers the declared atom feed link', () => {
    const $ = load(fixture('page-alt-link.html'))
    expect(discoverFeedLink($, ctx.sourceUrl)).toBe('https://blog.example.com/feed.atom')
  })
})

describe('autodetect', () => {
  it('extracts entries from JSON-LD blogPost data', () => {
    const $ = load(fixture('page-jsonld.html'))
    const feed = autodetect($, ctx)
    expect(feed?.entries).toHaveLength(2)
    expect(feed?.entries[0]?.title).toBe('LD Post One')
    expect(feed?.entries[0]?.tags).toEqual(['typescript', 'feeds'])
  })

  it('extracts entries from semantic <article> markup', () => {
    const $ = load(fixture('page-articles.html'))
    const feed = autodetect($, ctx)
    expect(feed?.entries).toHaveLength(3)
    expect(feed?.entries[0]?.link).toBe('https://blog.example.com/articles/one')
  })
})

describe('applyTemplate', () => {
  it('extracts entries with CSS selectors', () => {
    const $ = load(fixture('page-template.html'))
    const feed = applyTemplate(
      $,
      {
        item: '.entry',
        title: '.entry-title',
        link: '.entry-title a',
        date: 'time',
        summary: '.entry-summary',
      },
      ctx,
    )
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries[0]?.title).toBe('First Templated Post')
    expect(feed.entries[0]?.link).toBe('https://blog.example.com/templated/first')
    expect(feed.entries[0]?.published).toBe('2024-03-09T08:30:00.000Z')
  })
})
