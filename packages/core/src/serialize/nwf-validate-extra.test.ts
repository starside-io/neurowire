import { describe, expect, it } from 'vitest'
import { validateNwf } from './nwf'

const doc = (...lines: string[]): string => lines.join('\n')
const allMessages = (text: string): string[] => {
  const result = validateNwf(text)
  return [...result.errors, ...result.warnings].map((issue) => issue.message)
}

describe('validateNwf branch coverage', () => {
  it('accepts a hand-written document with A/T/S/B lines, refs, and a blank line', () => {
    const result = validateNwf(
      doc(
        'NWF1',
        'F\tid\tTitle\thttps://h\thttps://s\t1700000000\t0',
        'A\tAda',
        'T\ttag0\ttag1',
        'S\tsrc0',
        'B\thttps://example.com/',
        '',
        'E\te1\t0\t~p1\t0\t0,1\tHello\tsummary\t0',
      ),
    )
    expect(result.valid).toBe(true)
    expect(result.feed?.entries[0]?.link).toBe('https://example.com/p1')
  })

  it('flags a short F line and a non-integer epoch', () => {
    const msgs = allMessages(doc('NWF1', 'F\tid\tTitle', 'E\te1\t0\thttps://x/1\t\t\tHi\t'))
    expect(msgs.some((m) => /at least 6 cells/.test(m))).toBe(true)
    expect(msgs.some((m) => /updatedEpoch/.test(m))).toBe(true)
  })

  it('flags out-of-range author, tag, and source references', () => {
    const result = validateNwf(
      doc(
        'NWF1',
        'F\tid\tTitle\t\t\t1700000000\t9',
        'A\tAda',
        'T\tonly',
        'S\tsrc',
        'E\te1\t0\thttps://x/1\t5\t7\tHi\t\t3',
      ),
    )
    expect(
      result.errors.filter((e) => /out of range/.test(e.message)).length,
    ).toBeGreaterThanOrEqual(4)
    expect(result.errors.find((e) => /E sourceRef 3 is out of range/.test(e.message))).toBeDefined()
  })

  it('flags a non-integer reference', () => {
    const msgs = allMessages(
      doc('NWF1', 'F\tid\tT\t\t\t1\t', 'T\ta', 'E\te1\t0\thttps://x\t\tz\tHi\t'),
    )
    expect(msgs.some((m) => /is not an integer index/.test(m))).toBe(true)
  })

  it('flags a short E line', () => {
    const msgs = allMessages(doc('NWF1', 'F\tid\tT\t\t\t1\t', 'E\te1\t0\thttps://x'))
    expect(msgs.some((m) => /E line needs at least 7 cells/.test(m))).toBe(true)
  })

  it('flags an empty id and a bad delta', () => {
    const msgs = allMessages(doc('NWF1', 'F\tid\tT\t\t\t1\t', 'E\t\tx\thttps://x/1\t\t\tHi\t'))
    expect(msgs.some((m) => /empty id/.test(m))).toBe(true)
    expect(msgs.some((m) => /delta must be/.test(m))).toBe(true)
  })

  it('warns on an empty base and an empty link', () => {
    const msgs = allMessages(doc('NWF1', 'F\tid\tT\t\t\t1\t', 'B\t', 'E\te1\t0\t\t\t\tHi\t'))
    expect(msgs.some((m) => /no base URL/.test(m))).toBe(true)
    expect(msgs.some((m) => /empty link/.test(m))).toBe(true)
  })

  it('flags a non-integer sourceRef', () => {
    const msgs = allMessages(
      doc('NWF1', 'F\tid\tT\t\t\t1\t', 'S\tsrc', 'E\te1\t0\thttps://x/1\t\t\tHi\t\tnope'),
    )
    expect(msgs.some((m) => /sourceRef must be an integer/.test(m))).toBe(true)
  })

  it('flags an unknown line kind', () => {
    const msgs = allMessages(
      doc('NWF1', 'F\tid\tT\t\t\t1\t', 'E\te1\t0\thttps://x/1\t\t\tHi\t', 'X\tweird'),
    )
    expect(msgs.some((m) => /unknown line kind/.test(m))).toBe(true)
  })

  it('flags a missing F line and warns on no entries', () => {
    const msgs = allMessages(doc('NWF1', 'T\ta'))
    expect(msgs.some((m) => /missing the required F/.test(m))).toBe(true)
    expect(msgs.some((m) => /feed has no entries/.test(m))).toBe(true)
  })

  it('flags a duplicate F line', () => {
    const msgs = allMessages(
      doc('NWF1', 'F\tid\tT\t\t\t1\t', 'F\tid2\tT2\t\t\t2\t', 'E\te1\t0\thttps://x/1\t\t\tHi\t'),
    )
    expect(msgs.some((m) => /exactly one F line/.test(m))).toBe(true)
  })
})
