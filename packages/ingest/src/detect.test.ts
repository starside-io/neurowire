import { describe, expect, it } from 'vitest'
import { detectKind } from './detect'

describe('detectKind', () => {
  it('classifies by content type', () => {
    expect(detectKind('application/atom+xml', '')).toBe('atom')
    expect(detectKind('application/rss+xml', '')).toBe('rss')
    expect(detectKind('application/feed+json', '')).toBe('jsonfeed')
    expect(detectKind('text/html; charset=utf-8', '<!doctype html><html></html>')).toBe('html')
  })

  it('sniffs the body when the content type is unhelpful', () => {
    expect(detectKind('', '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">')).toBe(
      'atom',
    )
    expect(detectKind('', '<?xml version="1.0"?><rss version="2.0">')).toBe('rss')
    expect(
      detectKind('application/json', '{"version":"https://jsonfeed.org/version/1.1","items":[]}'),
    ).toBe('jsonfeed')
  })
})
