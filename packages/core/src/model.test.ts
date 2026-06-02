import { describe, expect, it } from 'vitest'
import { parseMesh, parseNeurowireFeed } from './model'

describe('model parsers', () => {
  it('parseNeurowireFeed accepts a valid feed and rejects junk', () => {
    const feed = parseNeurowireFeed({
      id: 'x',
      title: 'T',
      updated: '2024-01-01T00:00:00Z',
      entries: [],
    })
    expect(feed.title).toBe('T')
    expect(() => parseNeurowireFeed({ title: 'no id' })).toThrow()
  })

  it('parseMesh accepts a valid mesh and rejects junk', () => {
    const mesh = parseMesh({ name: 'M', sources: [{ name: 'a', url: 'https://a' }] })
    expect(mesh.sources).toHaveLength(1)
    expect(() => parseMesh({ name: 'M' })).toThrow()
  })
})
