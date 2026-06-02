import { describe, expect, it } from 'vitest'
import { sampleFeed } from '../test-fixtures'
import { toAtom } from './atom'

describe('toAtom', () => {
  it('produces a well-formed Atom 1.0 document', () => {
    const xml = toAtom(sampleFeed)
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<id>https://blog.example.com/feed.atom</id>')
    expect(xml).toContain('<link rel="self" href="https://blog.example.com/feed.atom"/>')
    expect(xml).toContain('<updated>2024-03-10T12:00:00.000Z</updated>')
  })

  it('escapes XML special characters in text content', () => {
    expect(toAtom(sampleFeed)).toContain('<title>Hello, World &amp; &lt;Friends&gt;</title>')
  })

  it('emits one entry per item with required fields and categories', () => {
    const xml = toAtom(sampleFeed)
    expect(xml.match(/<entry>/g) ?? []).toHaveLength(sampleFeed.entries.length)
    expect(xml).toContain('<category term="formats"/>')
    expect(xml).toContain('<published>2024-03-09T08:30:00.000Z</published>')
  })
})
