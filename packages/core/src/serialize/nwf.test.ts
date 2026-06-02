import { describe, expect, it } from 'vitest'
import { roundTripFeed, sampleFeed } from '../test-fixtures'
import { toJsonFeed } from './jsonfeed'
import { fromNwf, toNwf } from './nwf'

describe('nwf', () => {
  it('round-trips a feed through serialize and parse', () => {
    expect(fromNwf(toNwf(roundTripFeed))).toEqual(roundTripFeed)
  })

  it('starts with the NWF1 magic header', () => {
    expect(toNwf(sampleFeed).startsWith('NWF1\n')).toBe(true)
  })

  it('interns repeated tags so each appears once in the dictionary', () => {
    const tagLine =
      toNwf(sampleFeed)
        .split('\n')
        .find((l) => l.startsWith('T\t')) ?? ''
    expect(tagLine.split('\t').filter((c) => c === 'intro')).toHaveLength(1)
  })

  it('is more compact than pretty JSON Feed for the same data', () => {
    expect(toNwf(sampleFeed).length).toBeLessThan(toJsonFeed(sampleFeed).length)
  })

  it('carries and interns per-entry source labels (for meshes)', () => {
    const text = toNwf(roundTripFeed)
    // both entries share one source, so it appears once in the dictionary line
    const sourceLine = text.split('\n').find((l) => l.startsWith('S\t')) ?? ''
    expect(sourceLine.split('\t')).toHaveLength(2)
    expect(fromNwf(text).entries[0]?.source).toEqual({
      name: 'Example Blog',
      url: 'https://blog.example.com/',
    })
  })

  it('throws on input without the NWF1 header', () => {
    expect(() => fromNwf('not a feed')).toThrow(/NWF1/)
  })
})
