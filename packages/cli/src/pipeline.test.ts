import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import { describe, expect, it } from 'vitest'
import {
  type CliValues,
  applyFilterSpec,
  applySelectOptions,
  buildFilterSpec,
  buildSelectOptions,
  parseFilterRule,
  parseFilterRules,
  partitionNew,
} from './pipeline'

const entry = (over: Partial<NeurowireEntry>): NeurowireEntry => ({
  id: over.id ?? over.link ?? 't',
  title: over.title ?? 'Title',
  link: over.link ?? 'https://example.com/x',
  ...over,
})

const feedOf = (entries: NeurowireEntry[]): NeurowireFeed => ({
  id: 'https://example.com/feed',
  title: 'Feed',
  updated: '2026-06-01T00:00:00.000Z',
  entries,
})

describe('parseFilterRule', () => {
  it('parses a substring rule on the first colon only', () => {
    expect(parseFilterRule('title:a:b')).toEqual({ field: 'title', pattern: 'a:b', regex: false })
  })

  it('parses a slash-wrapped pattern as a regex', () => {
    expect(parseFilterRule('summary:/foo/')).toEqual({
      field: 'summary',
      pattern: 'foo',
      regex: true,
    })
  })

  it('treats a field with no colon as an empty substring', () => {
    expect(parseFilterRule('tag')).toEqual({ field: 'tag', pattern: '', regex: false })
  })

  it('returns undefined for an unknown field', () => {
    expect(parseFilterRule('nope:x')).toBeUndefined()
  })
})

describe('parseFilterRules', () => {
  it('collects valid rules', () => {
    const r = parseFilterRules(['title:a', 'tag:b'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(2)
  })

  it('fails on the first bad token', () => {
    const r = parseFilterRules(['title:a', 'bad:x'])
    expect(r).toEqual({ ok: false, bad: 'bad:x' })
  })
})

describe('buildFilterSpec', () => {
  it('returns undefined when no filter flags are present', () => {
    const r = buildFilterSpec({})
    expect(r).toEqual({ ok: true, value: undefined })
  })

  it('builds include and exclude specs', () => {
    const r = buildFilterSpec({ filter: ['title:hi'], exclude: ['tag:ads'] })
    expect(r.ok).toBe(true)
    if (r.ok && r.value) {
      expect(r.value.include).toHaveLength(1)
      expect(r.value.exclude).toHaveLength(1)
    }
  })

  it('propagates a bad include token', () => {
    expect(buildFilterSpec({ filter: ['oops:x'] })).toEqual({ ok: false, bad: 'oops:x' })
  })

  it('propagates a bad exclude token', () => {
    expect(buildFilterSpec({ exclude: ['oops:x'] })).toEqual({ ok: false, bad: 'oops:x' })
  })
})

describe('applyFilterSpec', () => {
  it('keeps included and drops excluded entries', () => {
    const feed = feedOf([
      entry({ id: '1', title: 'Release notes' }),
      entry({ id: '2', title: 'Sponsored post' }),
    ])
    const spec = buildFilterSpec({ filter: ['title:notes'] })
    if (!spec.ok || !spec.value) throw new Error('spec')
    const out = applyFilterSpec(feed, spec.value)
    expect(out.entries.map((e) => e.id)).toEqual(['1'])
  })
})

describe('buildSelectOptions', () => {
  const now = Date.parse('2026-06-10T00:00:00.000Z')

  it('rejects an unknown sort key', () => {
    const r = buildSelectOptions({ sort: 'nope' }, now)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toContain('--sort')
  })

  it('rejects an unknown order', () => {
    const r = buildSelectOptions({ order: 'sideways' }, now)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toContain('--order')
  })

  it('rejects a non-integer or negative limit', () => {
    expect(buildSelectOptions({ limit: 'x' }, now)).toMatchObject({ ok: false })
    expect(buildSelectOptions({ limit: '-1' }, now)).toMatchObject({ ok: false })
  })

  it('rejects an invalid --since duration', () => {
    const r = buildSelectOptions({ since: 'soon' }, now)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toContain('--since')
  })

  it('rejects an invalid --max-age duration', () => {
    expect(buildSelectOptions({ 'max-age': 'soon' }, now)).toMatchObject({ ok: false })
  })

  it('rejects a malformed --between', () => {
    expect(buildSelectOptions({ between: '2026-01-01' }, now)).toMatchObject({ ok: false })
  })

  it('rejects --between with unparseable dates', () => {
    const r = buildSelectOptions({ between: 'foo..bar' }, now)
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toContain('parseable')
  })

  it('accepts a valid since/sort/order/limit combination', () => {
    const r = buildSelectOptions({ since: '24h', sort: 'date', order: 'asc', limit: '5' }, now)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.sort).toBe('date')
      expect(r.value.order).toBe('asc')
      expect(r.value.limit).toBe(5)
      expect(r.value.from).toBeTypeOf('number')
    }
  })

  it('resolves --today and --this-week windows', () => {
    expect(buildSelectOptions({ today: true }, now)).toMatchObject({ ok: true })
    expect(buildSelectOptions({ 'this-week': true }, now)).toMatchObject({ ok: true })
  })

  it('accepts a valid --between', () => {
    const r = buildSelectOptions({ between: '2026-01-01..2026-02-01' }, now)
    expect(r.ok).toBe(true)
  })
})

describe('applySelectOptions', () => {
  const now = Date.parse('2026-06-10T00:00:00.000Z')

  it('applies a date window and limit end-to-end', () => {
    const feed = feedOf([
      entry({ id: 'old', published: '2026-06-01T00:00:00Z' }),
      entry({ id: 'new', published: '2026-06-09T18:00:00Z' }),
    ])
    const opts = buildSelectOptions({ since: '24h', limit: '5' }, now)
    if (!opts.ok) throw new Error('opts')
    const out = applySelectOptions(feed, opts.value)
    expect(out.entries.map((e) => e.id)).toEqual(['new'])
  })
})

describe('partitionNew', () => {
  it('returns only unseen entries and their keys, without mutating seen', () => {
    const feed = feedOf([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })])
    const seen = new Set(['a'])
    const { fresh, keys } = partitionNew(feed, seen)
    expect(fresh.map((e) => e.id)).toEqual(['b', 'c'])
    expect(keys).toEqual(['b', 'c'])
    expect([...seen]).toEqual(['a'])
  })

  it('keys fall back to the link when an id is empty', () => {
    const feed = feedOf([entry({ id: '', link: 'https://example.com/p' })])
    const { keys } = partitionNew(feed, new Set())
    expect(keys).toEqual(['https://example.com/p'])
  })

  it('treats the values bag type as a record', () => {
    // type-only smoke: CliValues is the parseArgs bag shape.
    const v: CliValues = { filter: ['title:x'], today: true }
    expect(buildFilterSpec(v).ok).toBe(true)
  })
})
