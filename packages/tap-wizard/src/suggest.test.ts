import type { FeedTemplate } from '@neurowire/ingest'
import { proposeTemplate } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { TAP_FIELDS, countMatches, emptyCandidates, suggestCandidates } from './suggest'
import { fixture } from './test-fixtures'

const url = 'https://blog.example.com/'

/** The seed candidate zero comes from, exactly as the session builds it. */
const seedFor = (name: string): FeedTemplate | undefined =>
  proposeTemplate(fixture(name), url)?.template

/** A page of `count` blocks all sharing one class, for the repeat-window checks. */
function repeatedBlocks(className: string, count: number): string {
  const block = `<div class="${className}"><a href="/x">Item</a></div>`
  return `<html><body><main>${block.repeat(count)}</main></body></html>`
}

describe('suggestCandidates', () => {
  it('ranks the repeating article block first on a clean listing page', () => {
    const candidates = suggestCandidates(fixture('clean-list.html'))

    expect(candidates.item[0]).toBe('article.post-card')
    expect(candidates.title).toContain('h2.post-title')
    expect(candidates.link).toContain('a[href]')
    expect(candidates.date).toContain('time')
    expect(candidates.summary).toEqual(['p.post-excerpt'])
    expect(candidates.author).toEqual(['span.post-author'])
    expect(candidates.tags).toEqual(['span.post-tag'])
  })

  it('keeps every field even when the page has nothing to offer for it', () => {
    const candidates = suggestCandidates(fixture('nav-heavy.html'))
    expect(Object.keys(candidates).sort()).toEqual([...TAP_FIELDS].sort())
    expect(candidates.summary).toEqual([])
    expect(candidates.author).toEqual([])
  })

  it('does not rank the nav first once the proposal seeds candidate zero', () => {
    const seed = seedFor('nav-heavy.html')
    expect(seed?.item).toBe('article.post-card')

    // Raw frequency alone would put the 8-item nav on top: the seed is what
    // corrects that, and the nav stays available as a lower-ranked option.
    expect(suggestCandidates(fixture('nav-heavy.html')).item[0]).toBe('li.nav-item')

    const candidates = suggestCandidates(fixture('nav-heavy.html'), seed)
    expect(candidates.item[0]).toBe('article.post-card')
    expect(candidates.item).toContain('li.nav-item')
  })

  it('skips is-/has-/js- state classes when keying an item selector', () => {
    const candidates = suggestCandidates(fixture('utility-classes.html'))

    expect(candidates.item).toEqual(['article.entry-card'])
    expect(candidates.item).not.toContain('article.is-visible')
    expect(candidates.item).not.toContain('article.js-hydrate')
    expect(candidates.title).toContain('h3.entry-title')
  })

  it('always makes the seed candidate zero for the fields it fills', () => {
    const seed: FeedTemplate = { item: 'div.post-list', title: 'span.headline' }
    const candidates = suggestCandidates(fixture('clean-list.html'), seed)

    expect(candidates.item[0]).toBe('div.post-list')
    // The structural answer stays right behind the seed.
    expect(candidates.item[1]).toBe('article.post-card')
    expect(candidates.title[0]).toBe('span.headline')
  })

  it('ignores blocks with no link and blocks with no usable class', () => {
    const blocks = [
      '<div class="no-link"><p>nothing</p></div>'.repeat(4),
      '<div><a href="/a">bare</a></div>'.repeat(4),
      '<div class="card"><a href="/b">carded</a></div>'.repeat(4),
    ].join('')

    expect(suggestCandidates(`<html><body><main>${blocks}</main></body></html>`).item).toEqual([
      'div.card',
    ])
  })

  it('keeps only selectors repeating 3 to 300 times', () => {
    expect(suggestCandidates(repeatedBlocks('twice', 2)).item).toEqual([])
    expect(suggestCandidates(repeatedBlocks('thrice', 3)).item).toEqual(['div.thrice'])
    expect(suggestCandidates(repeatedBlocks('plenty', 300)).item).toEqual(['div.plenty'])
    expect(suggestCandidates(repeatedBlocks('everything', 301)).item).toEqual([])
  })

  it('caps the item list at six candidates, ranked by frequency', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => repeatedBlocks(`c${i}`, 10 - i))
      .join('')
      .replaceAll(/<\/?(html|body|main)>/g, '')
    const candidates = suggestCandidates(`<html><body><main>${blocks}</main></body></html>`)

    expect(candidates.item).toHaveLength(6)
    expect(candidates.item[0]).toBe('div.c0')
    expect(candidates.item[5]).toBe('div.c5')
  })

  it('falls back to the seed alone when the page cannot be parsed', () => {
    const seed: FeedTemplate = { item: 'article.x', title: 'h2', date: 'time' }
    const candidates = suggestCandidates(undefined as unknown as string, seed)

    expect(candidates).toEqual({ ...emptyCandidates(), item: ['article.x'], title: ['h2'] })
  })

  it('falls back to nothing at all when there is no seed either', () => {
    expect(suggestCandidates(undefined as unknown as string)).toEqual(emptyCandidates())
  })

  it('returns early when the chosen item selector matches nothing', () => {
    const candidates = suggestCandidates('<html><body><p>flat</p></body></html>', {
      item: 'article.gone',
      title: 'h2',
    })

    expect(candidates.item).toEqual(['article.gone'])
    expect(candidates.title).toEqual([])
  })
})

describe('countMatches', () => {
  it('counts what a selector matches', () => {
    expect(countMatches(fixture('clean-list.html'), 'article.post-card')).toBe(5)
  })

  it('is zero for a blank or invalid selector', () => {
    expect(countMatches(fixture('clean-list.html'), '  ')).toBe(0)
    expect(countMatches(fixture('clean-list.html'), 'article[')).toBe(0)
  })
})
