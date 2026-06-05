import { describe, expect, it } from 'vitest'
import { hashHex, stableId } from './id'

describe('hashHex', () => {
  it('is deterministic: same input yields the same output', () => {
    expect(hashHex('hello')).toBe(hashHex('hello'))
  })

  it('differs for different inputs', () => {
    expect(hashHex('hello')).not.toBe(hashHex('world'))
  })

  it('always returns a 16-char lowercase hex string', () => {
    for (const input of ['', 'a', 'hello world', '🦄', 'x'.repeat(1000)]) {
      const hex = hashHex(input)
      expect(hex).toMatch(/^[0-9a-f]{16}$/)
    }
  })

  it('handles the empty string', () => {
    // FNV-1a of the empty string is the offset basis itself.
    expect(hashHex('')).toBe('cbf29ce484222325')
  })
})

describe('stableId', () => {
  it('is deterministic: same (link, title) yields the same id', () => {
    expect(stableId('https://example.com/a', 'Hello')).toBe(
      stableId('https://example.com/a', 'Hello'),
    )
  })

  it('differs when the title differs but the link is shared', () => {
    expect(stableId('https://example.com/a', 'One')).not.toBe(
      stableId('https://example.com/a', 'Two'),
    )
  })

  it('differs when the link differs but the title is shared', () => {
    expect(stableId('https://example.com/a', 'Same')).not.toBe(
      stableId('https://example.com/b', 'Same'),
    )
  })

  it('uses the urn:nwf prefix and a 16-char hex body', () => {
    expect(stableId('https://example.com/a', 'Hello')).toMatch(/^urn:nwf:[0-9a-f]{16}$/)
  })

  it('handles empty link and title', () => {
    expect(stableId('', '')).toMatch(/^urn:nwf:[0-9a-f]{16}$/)
  })
})
