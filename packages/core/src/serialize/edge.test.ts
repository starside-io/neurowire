import { describe, expect, it } from 'vitest'
import type { NeurowireFeed } from '../model'
import { toAtom } from './atom'
import { toJsonFeedObject } from './jsonfeed'
import { toMarkdown } from './markdown'

const minimal: NeurowireFeed = {
  id: 'urn:min',
  title: 'Minimal',
  updated: '2024-01-01T00:00:00.000Z',
  entries: [{ id: 'e1', title: 'Only', link: 'https://example.com/a' }],
}

const messy: NeurowireFeed = {
  id: 'urn:bad',
  title: 'Messy',
  updated: 'not-a-date',
  generator: { name: 'Neurowire' },
  authors: [{ name: 'Mail Only', email: 'mail@example.com' }],
  entries: [
    {
      id: 'e1',
      title: 'Post',
      link: 'https://example.com/a',
      published: 'also-bad',
      updated: 'still-bad',
    },
  ],
}

describe('atom edge cases', () => {
  it('omits optional elements for a minimal feed', () => {
    const xml = toAtom(minimal)
    expect(xml).not.toContain('<author>')
    expect(xml).not.toContain('<published>')
    expect(xml).not.toContain('<summary')
    expect(xml).not.toContain('<generator')
  })

  it('renders email authors, a versionless generator, and falls back on bad dates', () => {
    const xml = toAtom(messy)
    expect(xml).toContain('<email>mail@example.com</email>')
    expect(xml).toContain('<generator>Neurowire</generator>')
    expect(xml).toContain('<feed')
  })
})

describe('jsonfeed edge cases', () => {
  it('drops optional fields and unparseable dates', () => {
    const min = toJsonFeedObject(minimal)
    expect(min.home_page_url).toBeUndefined()
    expect(min.authors).toBeUndefined()
    expect(min.items[0]?.summary).toBeUndefined()

    const bad = toJsonFeedObject(messy)
    expect(bad.items[0]?.date_published).toBeUndefined()
    expect(bad.items[0]?.date_modified).toBeUndefined()
  })
})

describe('markdown edge cases', () => {
  it('renders a minimal feed and shows unparseable dates verbatim', () => {
    expect(toMarkdown(minimal)).toContain('### [Only](https://example.com/a)')
    expect(toMarkdown(messy)).toContain('still-bad')
  })

  it('omits the meta line and entries when there is nothing to show', () => {
    expect(toMarkdown({ id: 'x', title: 'T', updated: '', entries: [] })).toBe('# T\n')
  })
})
