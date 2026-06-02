import { describe, expect, it } from 'vitest'
import { roundTripFeed } from '../test-fixtures'
import { toNwf, validateNwf } from './nwf'

describe('validateNwf', () => {
  it('accepts a well-formed document', () => {
    const result = validateNwf(toNwf(roundTripFeed))
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.feed?.entries).toHaveLength(2)
  })

  it('rejects a missing NWF1 header', () => {
    const result = validateNwf('not a feed')
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.line).toBe(1)
  })

  it('flags an out-of-range tag reference with its line number', () => {
    // T has one tag (index 0); the entry on line 4 references tag index 5.
    const doc = [
      'NWF1',
      'F\tid\tTitle\t\t\t1700000000\t',
      'T\tonly',
      'E\te1\t0\thttps://x/1\t\t5\tHello\t',
    ].join('\n')
    const result = validateNwf(doc)
    expect(result.valid).toBe(false)
    expect(result.errors.find((e) => /out of range/.test(e.message))?.line).toBe(4)
  })

  it('reports a non-integer updatedEpoch', () => {
    const doc = ['NWF1', 'F\tid\tTitle\t\t\tnope\t', 'E\te1\t0\thttps://x/1\t\t\tHello\t'].join(
      '\n',
    )
    const result = validateNwf(doc)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => /updatedEpoch/.test(e.message))).toBe(true)
  })
})
