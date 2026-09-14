import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildRefinement,
  clampLimit,
  describeError,
  errorResult,
  feedResult,
  parseFilterRules,
  summarize,
} from './shape'
import { makeFeed } from './test-fixtures'

const NOW = Date.UTC(2026, 7, 26, 12)

describe('result shaping', () => {
  it('defaults the limit to 30 and clamps it to 1..200', () => {
    expect(clampLimit(undefined)).toBe(30)
    expect(clampLimit(500)).toBe(200)
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(12.7)).toBe(12)
  })

  it('summarizes entry count, sources, newest date, and truncation', () => {
    expect(summarize(makeFeed(3))).toBe('3 entries from "Example Blog", newest 2026-08-25')
    expect(summarize(makeFeed(1, { source: { name: 'A' } }))).toBe(
      '1 entry from 1 source, newest 2026-08-25',
    )
    const mixed = makeFeed(2)
    mixed.entries[0] = { ...mixed.entries[0], source: { name: 'A' } } as never
    mixed.entries[1] = {
      ...mixed.entries[1],
      source: { name: 'B' },
      published: 'nonsense',
    } as never
    expect(summarize(mixed, 1)).toBe('2 entries (showing 1) from 2 sources, newest 2026-08-25')
    expect(summarize({ ...makeFeed(0) })).toBe('0 entries from "Example Blog"')
  })

  it('opens a feed result with the summary and notes, then the body', () => {
    const result = feedResult(makeFeed(40), 'nwf', undefined, ['cursor: 7'])
    const text = (result.content[0] as { text: string }).text
    expect(text.split('\n').slice(0, 2)).toEqual([
      '40 entries (showing 30) from "Example Blog", newest 2026-08-25',
      'cursor: 7',
    ])
    expect(text).toContain('NWF1')
    expect(errorResult('nope')).toEqual({
      content: [{ type: 'text', text: 'error: nope' }],
      isError: true,
    })
  })

  it('describes errors without stack traces, flattening zod issues', () => {
    const zodError = z.object({ url: z.string() }).safeParse({}).error
    expect(describeError(zodError)).toBe('url: Required')
    const rootIssue = z.string().safeParse(1).error
    expect(describeError(rootIssue)).toBe('value: Expected string, received number')
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError('plain')).toBe('plain')
  })

  it('parses field:pattern rules with regex support and rejects unknown fields', () => {
    expect(parseFilterRules(undefined)).toEqual([])
    expect(parseFilterRules(['tag:rust', 'title:/^v\\d/', 'summary'])).toEqual([
      { field: 'tag', pattern: 'rust', regex: false },
      { field: 'title', pattern: '^v\\d', regex: true },
      { field: 'summary', pattern: '', regex: false },
    ])
    expect(() => parseFilterRules(['colour:red'])).toThrow(/bad filter "colour:red"/)
  })

  it('builds the filter spec and window from query input', () => {
    expect(buildRefinement({}, NOW)).toEqual({ filter: undefined, select: {} })
    const built = buildRefinement(
      {
        include: ['tag:ai'],
        since: '24h',
        today: true,
        thisWeek: true,
        sort: 'title',
        order: 'asc',
      },
      NOW,
    )
    expect(built.filter?.include).toHaveLength(1)
    expect(built.select.sort).toBe('title')
    expect(built.select.from).toBeTypeOf('number')
    const between = buildRefinement({ between: '2026-01-01..2026-02-01' }, NOW)
    expect(between.select.to).toBe(Date.parse('2026-02-01'))
    expect(() => buildRefinement({ since: 'soon' }, NOW)).toThrow(/invalid since/)
    expect(() => buildRefinement({ between: '2026-01-01' }, NOW)).toThrow(/between expects/)
    expect(() => buildRefinement({ between: 'x..y' }, NOW)).toThrow(/between expects/)
  })
})
