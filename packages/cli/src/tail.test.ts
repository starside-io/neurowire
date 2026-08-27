import { type NeurowireEntry, type NeurowireFeed, parseJournal } from '@neurowire/core'
import { describe, expect, it, vi } from 'vitest'
import {
  type SseEvent,
  type TailIo,
  clockTime,
  createSseParser,
  formatTailEntry,
  parseEntryEvent,
  parseIntervalMs,
  runRemoteTail,
  runTail,
  sseBackoffMs,
  streamRemoteTail,
  tailIntervalMs,
} from './tail'

/**
 * Every loop here runs with an injected zero-wait delay and a scripted tick, so
 * the suite exercises the real generators without a network or a real timer.
 */

const entry = (id: string, extra: Partial<NeurowireEntry> = {}): NeurowireEntry => ({
  id,
  title: `Title ${id}`,
  link: `https://example.com/${id}`,
  ...extra,
})

const feedOf = (ids: string[]): NeurowireFeed => ({
  id: 'https://example.com/feed',
  title: 'Example',
  home: 'https://example.com',
  updated: '2026-06-01T00:00:00.000Z',
  entries: ids.map((id) => entry(id)),
})

/** Collect stdout and stderr writes from a tail run. */
function recorder(): { io: TailIo; out: () => string; err: () => string } {
  const out: string[] = []
  const err: string[] = []
  return {
    io: {
      out: (text) => {
        out.push(text)
      },
      err: (text) => {
        err.push(text)
      },
    },
    out: () => out.join(''),
    err: () => err.join(''),
  }
}

/** A tick script: each call returns the next feed, then stops the loop. */
function ticker(feeds: (NeurowireFeed | undefined)[]): () => Promise<NeurowireFeed | undefined> {
  let index = 0
  return async () => feeds[index++]
}

const noDelay = async () => {}

describe('parseIntervalMs', () => {
  it('accepts seconds, which core durations do not cover', () => {
    expect(parseIntervalMs('30s')).toBe(30_000)
    expect(parseIntervalMs(' 90 s ')).toBe(90_000)
  })

  it('falls through to core for minutes, hours, and days', () => {
    expect(parseIntervalMs('5m')).toBe(300_000)
    expect(parseIntervalMs('2h')).toBe(7_200_000)
    expect(parseIntervalMs('1d')).toBe(86_400_000)
  })

  it('rejects anything else', () => {
    expect(parseIntervalMs('soon')).toBeUndefined()
    expect(parseIntervalMs('30')).toBeUndefined()
  })
})

describe('tailIntervalMs', () => {
  it('defaults to the engine default', () => {
    expect(tailIntervalMs(undefined)).toEqual({ ok: true, value: 300_000 })
  })

  it('clamps below the floor', () => {
    expect(tailIntervalMs('1s')).toEqual({ ok: true, value: 30_000 })
  })

  it('reports a bad value', () => {
    const result = tailIntervalMs('nope')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('invalid --interval')
  })
})

describe('formatTailEntry', () => {
  it('renders a stamp, title, meta, and link', () => {
    const at = Date.parse('2026-06-01T12:34:56')
    const text = formatTailEntry(
      entry('a', {
        published: '2026-05-31T00:00:00.000Z',
        source: { name: 'Example' },
        tags: ['release'],
      }),
      { at },
    )
    const lines = text.trimEnd().split('\n')
    expect(lines[0]).toBe(`${clockTime(at)}  Title a`)
    expect(lines[1]).toContain('Example')
    expect(lines[1]).toContain('2026-05-31')
    expect(lines[1]).toContain('#release')
    expect(lines[2]).toContain('https://example.com/a')
  })

  it('omits the meta line when there is nothing to show', () => {
    const text = formatTailEntry(entry('a'), { at: Date.parse('2026-06-01T00:00:00') })
    expect(text.trimEnd().split('\n')).toHaveLength(2)
  })

  it('adds ansi codes only when color is on', () => {
    const plain = formatTailEntry(entry('a'), { color: false })
    const colored = formatTailEntry(entry('a'), { color: true })
    expect(plain).not.toContain('\x1b[')
    expect(colored).toContain('\x1b[')
  })

  it('stamps the current time when none is given', () => {
    expect(formatTailEntry(entry('a'))).toMatch(/^\d\d:\d\d:\d\d {2}/)
  })
})

describe('runTail', () => {
  it('prints each entry once, as it arrives', async () => {
    const rec = recorder()
    await runTail({
      tick: ticker([feedOf(['a', 'b']), feedOf(['c', 'a', 'b']), undefined]),
      delay: noDelay,
      io: rec.io,
    })
    const out = rec.out()
    expect(out).toContain('Title a')
    expect(out).toContain('Title b')
    expect(out).toContain('Title c')
    expect(out.match(/Title a/g)).toHaveLength(1)
  })

  it('honors a resumed seen-set', async () => {
    const rec = recorder()
    await runTail({
      tick: ticker([feedOf(['a', 'b']), undefined]),
      delay: noDelay,
      seen: ['a'],
      io: rec.io,
    })
    expect(rec.out()).not.toContain('Title a')
    expect(rec.out()).toContain('Title b')
  })

  it('emits spec-valid nwfj in raw mode', async () => {
    const rec = recorder()
    await runTail({
      tick: ticker([feedOf(['a', 'b']), feedOf(['c', 'a', 'b']), undefined]),
      delay: noDelay,
      raw: true,
      journalId: 'tail-test',
      io: rec.io,
    })
    const parsed = parseJournal(rec.out())
    expect(parsed.issues).toEqual([])
    expect(parsed.header?.journalId).toBe('tail-test')
    expect(parsed.records.map((r) => r.entry.id)).toEqual(['a', 'b', 'c'])
    expect(parsed.head.seq).toBe(3)
  })

  it('writes one journal header even across many ticks', async () => {
    const rec = recorder()
    await runTail({
      tick: ticker([feedOf(['a']), feedOf(['b', 'a']), undefined]),
      delay: noDelay,
      raw: true,
      io: rec.io,
    })
    expect(
      rec
        .out()
        .split('\n')
        .filter((line) => line.startsWith('J\t')),
    ).toHaveLength(1)
  })

  it('uses the emit hook for a serialized format', async () => {
    const rec = recorder()
    const emitted: NeurowireFeed[] = []
    await runTail({
      tick: ticker([feedOf(['a', 'b']), undefined]),
      delay: noDelay,
      emit: (feed) => emitted.push(feed),
      io: rec.io,
    })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(rec.out()).toBe('')
  })

  it('hands only the fresh entries to onFresh', async () => {
    const rec = recorder()
    const seen: string[][] = []
    await runTail({
      tick: ticker([feedOf(['a']), feedOf(['b', 'a']), feedOf(['b', 'a']), undefined]),
      delay: noDelay,
      io: rec.io,
      onFresh: async (feed) => {
        seen.push(feed.entries.map((e) => e.id))
      },
    })
    expect(seen).toEqual([['a'], ['b']])
  })

  it('reports a failing tick and keeps going', async () => {
    const rec = recorder()
    let call = 0
    await runTail({
      tick: async () => {
        call += 1
        if (call === 1) throw new Error('upstream down')
        if (call === 2) return feedOf(['a'])
        return undefined
      },
      delay: noDelay,
      io: rec.io,
    })
    expect(rec.err()).toContain('[tail] error: upstream down')
    expect(rec.out()).toContain('Title a')
  })

  it('stops without a second message when a tick reports a flag error', async () => {
    const rec = recorder()
    await runTail({ tick: ticker([undefined]), delay: noDelay, io: rec.io })
    expect(rec.out()).toBe('')
    expect(rec.err()).toBe('')
  })

  it('stops when the caller aborts', async () => {
    const rec = recorder()
    const controller = new AbortController()
    await runTail({
      tick: async () => {
        controller.abort()
        return feedOf(['a'])
      },
      delay: noDelay,
      signal: controller.signal,
      io: rec.io,
    })
    expect(rec.out()).toBe('')
  })
})

describe('createSseParser', () => {
  it('decodes an event split across chunks', () => {
    const parser = createSseParser()
    expect(parser.push('event: entry\ndata: {"a"')).toEqual([])
    const events = parser.push(':1}\nid: 7\n\n')
    expect(events).toEqual([{ event: 'entry', data: '{"a":1}', id: '7' }])
  })

  it('joins multi-line data and defaults the event name', () => {
    const parser = createSseParser()
    expect(parser.push('data: one\ndata: two\n\n')).toEqual([
      { event: 'message', data: 'one\ntwo' },
    ])
  })

  it('drops comment heartbeats', () => {
    const parser = createSseParser()
    expect(parser.push(': ping\n\n')).toEqual([])
  })

  it('handles CRLF line endings and valueless fields', () => {
    const parser = createSseParser()
    expect(parser.push('event: ping\r\ndata\r\n\r\n')).toEqual([{ event: 'ping', data: '' }])
  })

  it('ignores unknown fields', () => {
    const parser = createSseParser()
    expect(parser.push('retry: 500\nevent: entry\ndata: x\n\n')).toEqual([
      { event: 'entry', data: 'x' },
    ])
  })
})

describe('sseBackoffMs', () => {
  it('doubles per attempt and caps', () => {
    expect(sseBackoffMs(0)).toBe(1000)
    expect(sseBackoffMs(3)).toBe(8000)
    expect(sseBackoffMs(20)).toBe(30_000)
    expect(sseBackoffMs(-1)).toBe(1000)
  })
})

describe('streamRemoteTail', () => {
  const sse = (body: string) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })

  it('yields the events of a stream', async () => {
    const fetchImpl = vi.fn(async () =>
      sse('event: init\ndata: {}\n\nevent: entry\ndata: 1\nid: 1\n\n'),
    )
    const events: SseEvent[] = []
    for await (const message of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 1,
      delay: noDelay,
    })) {
      events.push(message)
    }
    expect(events.map((e) => e.event)).toEqual(['init', 'entry'])
  })

  it('reconnects with the last event id after the stream ends', async () => {
    const calls: (Record<string, string> | undefined)[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>)
      return sse('event: entry\ndata: 1\nid: 12\n\n')
    })
    const events: SseEvent[] = []
    for await (const message of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 2,
      delay: noDelay,
    })) {
      events.push(message)
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(calls[0]?.['last-event-id']).toBeUndefined()
    expect(calls[1]?.['last-event-id']).toBe('12')
    expect(events).toHaveLength(2)
  })

  it('starts from an explicit cursor', async () => {
    const calls: (Record<string, string> | undefined)[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>)
      return sse('')
    })
    for await (const _ of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 1,
      delay: noDelay,
      lastEventId: '40',
    })) {
      // no events in an empty stream
    }
    expect(calls[0]?.['last-event-id']).toBe('40')
  })

  it('reports a non-ok response and retries', async () => {
    const onError = vi.fn()
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }))
    for await (const _ of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 2,
      delay: noDelay,
      onError,
    })) {
      // never reached
    }
    expect(onError).toHaveBeenCalledTimes(2)
    expect((onError.mock.calls[0]?.[0] as Error).message).toContain('503')
  })

  it('reports a bodyless response', async () => {
    const onError = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    for await (const _ of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 1,
      delay: noDelay,
      onError,
    })) {
      // never reached
    }
    expect((onError.mock.calls[0]?.[0] as Error).message).toContain('no body')
  })

  it('backs off between reconnects', async () => {
    const waits: number[] = []
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused')
    })
    for await (const _ of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 3,
      delay: async (ms) => {
        waits.push(ms)
      },
    })) {
      // never reached
    }
    expect(waits).toEqual([1000, 2000])
  })

  it('stops when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn(async () => sse(''))
    for await (const _ of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
      delay: noDelay,
    })) {
      // never reached
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('stops when the fetch aborts mid-stream', async () => {
    const controller = new AbortController()
    const onError = vi.fn()
    const fetchImpl = vi.fn(async () => {
      controller.abort()
      throw new Error('aborted')
    })
    for await (const _ of streamRemoteTail('https://api.test/tail', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
      delay: noDelay,
    })) {
      // never reached
    }
    expect(onError).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('parseEntryEvent', () => {
  it('accepts a well-formed entry', () => {
    expect(parseEntryEvent('{"id":"a","title":"T","link":"https://x/1"}')).toEqual({
      id: 'a',
      title: 'T',
      link: 'https://x/1',
    })
  })

  it('falls back to the link as the id', () => {
    expect(parseEntryEvent('{"title":"T","link":"https://x/1"}')?.id).toBe('https://x/1')
  })

  it('rejects malformed json and non-entries', () => {
    expect(parseEntryEvent('not json')).toBeUndefined()
    expect(parseEntryEvent('{"title":"T"}')).toBeUndefined()
  })
})

describe('runRemoteTail', () => {
  const stream = (body: string) =>
    vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch

  it('renders init on stderr and entries on stdout', async () => {
    const rec = recorder()
    await runRemoteTail('https://api.test/tail', {
      io: rec.io,
      fetchImpl: stream(
        'event: init\ndata: {"title":"Example"}\n\n' +
          'event: entry\ndata: {"id":"a","title":"Title a","link":"https://example.com/a"}\nid: 1\n\n',
      ),
      maxAttempts: 1,
      delay: noDelay,
    })
    expect(rec.err()).toContain('[tail] connected to')
    expect(rec.out()).toContain('Title a')
  })

  it('re-encodes remote entries as nwfj in raw mode', async () => {
    const rec = recorder()
    await runRemoteTail('https://api.test/tail', {
      io: rec.io,
      raw: true,
      journalId: 'remote',
      fetchImpl: stream(
        'event: entry\ndata: {"id":"a","title":"Title a","link":"https://example.com/a"}\nid: 1\n\n',
      ),
      maxAttempts: 1,
      delay: noDelay,
    })
    const parsed = parseJournal(rec.out())
    expect(parsed.issues).toEqual([])
    expect(parsed.records.map((r) => r.entry.id)).toEqual(['a'])
  })

  it('warns about events that are not json entries', async () => {
    const rec = recorder()
    await runRemoteTail('https://api.test/tail', {
      io: rec.io,
      fetchImpl: stream('event: entry\ndata: E\t1\t-\t-\ta\n\n'),
      maxAttempts: 1,
      delay: noDelay,
    })
    expect(rec.err()).toContain('not a JSON entry')
  })

  it('ignores events it does not handle and calls onEntry', async () => {
    const rec = recorder()
    const seen: NeurowireEntry[] = []
    await runRemoteTail('https://api.test/tail', {
      io: rec.io,
      onEntry: (item) => {
        seen.push(item)
      },
      fetchImpl: stream(
        'event: keepalive\ndata: x\n\n' +
          'event: entry\ndata: {"id":"a","title":"Title a","link":"https://example.com/a"}\n\n',
      ),
      maxAttempts: 1,
      delay: noDelay,
    })
    expect(seen.map((e) => e.id)).toEqual(['a'])
  })
})
