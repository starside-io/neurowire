import { describe, expect, it } from 'vitest'
import { sampleFeed } from '../test-fixtures'
import { EXTENSIONS, FORMATS, MEDIA_TYPES, isFormat, serialize } from './index'

describe('serialize dispatcher', () => {
  it('serializes every format and exposes media types and extensions', () => {
    for (const format of FORMATS) {
      expect(serialize(sampleFeed, format).length).toBeGreaterThan(0)
      expect(MEDIA_TYPES[format]).toContain('charset=utf-8')
      expect(EXTENSIONS[format]).toBeTruthy()
    }
  })

  it('isFormat recognizes known formats only', () => {
    expect(isFormat('nwf')).toBe(true)
    expect(isFormat('xml')).toBe(false)
  })
})
