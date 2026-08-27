import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJournal } from '@neurowire/core'
import { openJournalStore } from '@neurowire/ingest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'
import { stopAllTails, tailLoopCount } from './tail'

/**
 * The SSE route driven through app.request(), with the upstream fetch stubbed.
 * The heartbeat is turned down to milliseconds so the connection lifecycle
 * (including the comment ping) is observable without waiting 25 seconds; the
 * poll interval stays at its floor, so exactly one tick happens per test.
 */

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/feed</id>
  <title>Example</title>
  <updated>2026-01-01T00:00:00Z</updated>
  <entry>
    <id>https://example.com/1</id>
    <title>One</title>
    <link href="https://example.com/1"/>
    <updated>2026-01-01T00:00:00Z</updated>
  </entry>
</feed>`

function stubFeed(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(ATOM_FEED, {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const uniqueUrl = () => `https://example.com/t-${Math.random().toString(36).slice(2)}`

interface RawEvent {
  event: string
  data: string
  id?: string
}

interface OpenStream {
  text: () => string
  events: () => RawEvent[]
  /** Wait until `count` events have arrived, or the deadline passes. */
  waitFor: (count: number, timeoutMs?: number) => Promise<RawEvent[]>
  /** Disconnect, the way a client closing the tab does. */
  close: () => Promise<void>
}

/** Consume an SSE response in the background, leaving the connection open. */
function openStream(res: Response): OpenStream {
  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let done = false

  const pump = (async () => {
    if (!reader) return
    try {
      for (;;) {
        const read = await reader.read()
        if (read.done) break
        text += decoder.decode(read.value, { stream: true })
      }
    } catch {
      // cancelled
    } finally {
      done = true
    }
  })()

  return {
    text: () => text,
    events: () => parseEvents(text),
    async waitFor(count, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs
      while (parseEvents(text).length < count && !done && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return parseEvents(text)
    },
    async close() {
      await reader?.cancel().catch(() => {})
      await pump
    },
  }
}

/** A minimal SSE decoder for the assertions below. */
function parseEvents(text: string): RawEvent[] {
  const out: RawEvent[] = []
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue
    let event = 'message'
    let id: string | undefined
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7)
      else if (line.startsWith('data: ')) data.push(line.slice(6))
      else if (line.startsWith('id: ')) id = line.slice(4)
    }
    if (data.length === 0 && event === 'message') continue
    const parsed: RawEvent = { event, data: data.join('\n') }
    if (id !== undefined) parsed.id = id
    out.push(parsed)
  }
  return out
}

beforeEach(() => {
  vi.stubEnv('NEUROWIRE_TAIL_HEARTBEAT_MS', '30')
})

afterEach(async () => {
  stopAllTails()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  // Let the aborted stream unwind before the next test counts loops.
  await new Promise((resolve) => setTimeout(resolve, 20))
})

describe('GET /tail errors', () => {
  it('400s with JSON when no target is given', async () => {
    const res = await app.request('/tail')
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('json')
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('missing target')
  })

  it('404s an unknown mesh without opening a stream', async () => {
    const res = await app.request('/tail?src=nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toContain('event-stream')
  })

  it('400s an unknown tail format', async () => {
    const res = await app.request(`/tail?url=${encodeURIComponent(uniqueUrl())}&format=atom`)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { formats: string[] }
    expect(body.formats).toEqual(['json', 'nwf'])
  })
})

describe('GET /tail stream', () => {
  it('streams init then entries with cursor ids', async () => {
    stubFeed()
    const res = await app.request(`/tail?url=${encodeURIComponent(uniqueUrl())}&interval=60`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')

    const stream = openStream(res)
    const events = await stream.waitFor(2)
    await stream.close()
    expect(events[0]?.event).toBe('init')
    const init = JSON.parse(events[0]?.data ?? '{}') as { resume: string; intervalMs: number }
    expect(init.resume).toBe('live')
    expect(init.intervalMs).toBe(60_000)

    const entries = events.filter((e) => e.event === 'entry')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe('1')
    const entry = JSON.parse(entries[0]?.data ?? '{}') as { title: string; link: string }
    expect(entry.title).toBe('One')
  })

  it('sends nwfj journal lines when format=nwf', async () => {
    stubFeed()
    const res = await app.request(`/tail?url=${encodeURIComponent(uniqueUrl())}&format=nwf`)
    const stream = openStream(res)
    const events = await stream.waitFor(2)
    await stream.close()
    const entries = events.filter((e) => e.event === 'entry')
    expect(entries).toHaveLength(1)
    const parsed = parseJournal(`${entries[0]?.data ?? ''}\n`)
    expect(parsed.issues).toEqual([])
    expect(parsed.records[0]?.entry.title).toBe('One')
  })

  it('writes a comment heartbeat while the stream is idle', async () => {
    stubFeed()
    const res = await app.request(`/tail?url=${encodeURIComponent(uniqueUrl())}`)
    const stream = openStream(res)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const text = stream.text()
    await stream.close()
    expect(text).toContain(': ping')
  })

  it('shares one poll loop across two subscribers to the same target', async () => {
    const fetchMock = stubFeed()
    const url = uniqueUrl()
    const before = fetchMock.mock.calls.length

    const first = openStream(await app.request(`/tail?url=${encodeURIComponent(url)}`))
    const firstEvents = await first.waitFor(2)
    const afterFirst = fetchMock.mock.calls.length
    expect(afterFirst).toBeGreaterThan(before)

    // The second client attaches while the first is still connected.
    const second = openStream(await app.request(`/tail?url=${encodeURIComponent(url)}`))
    const secondEvents = await second.waitFor(2)
    // It is served from the running loop's backlog, so no new upstream fetch.
    expect(fetchMock.mock.calls.length).toBe(afterFirst)
    expect(firstEvents.some((e) => e.event === 'entry')).toBe(true)
    expect(secondEvents.some((e) => e.event === 'entry')).toBe(true)
    await first.close()
    await second.close()
  })

  it('does not share a loop between clients asking for different intervals', async () => {
    const fetchMock = stubFeed()
    const url = uniqueUrl()

    const first = openStream(await app.request(`/tail?url=${encodeURIComponent(url)}&interval=60`))
    await first.waitFor(2)
    const afterFirst = fetchMock.mock.calls.length

    const second = openStream(
      await app.request(`/tail?url=${encodeURIComponent(url)}&interval=600`),
    )
    await second.waitFor(2)
    // A different cadence is a different loop, so the init event is not a lie.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst)
    await first.close()
    await second.close()
  })

  it('stops the loop once the last client disconnects', async () => {
    stubFeed()
    const stream = openStream(await app.request(`/tail?url=${encodeURIComponent(uniqueUrl())}`))
    await stream.waitFor(2)
    await stream.close()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(tailLoopCount()).toBe(0)
  })
})

describe('GET /tail resume', () => {
  it('replays a journal from ?since= and reports it in init', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-route-'))
    vi.stubEnv('NEUROWIRE_JOURNAL', dir)
    try {
      const store = openJournalStore({ dir })
      store.append('replay', [
        { id: 'old-1', title: 'Old one', link: 'https://example.com/old-1' },
        { id: 'old-2', title: 'Old two', link: 'https://example.com/old-2' },
        { id: 'old-3', title: 'Old three', link: 'https://example.com/old-3' },
      ])
      stubFeed()

      const res = await app.request(
        `/tail?url=${encodeURIComponent(uniqueUrl())}&journal=replay&since=1`,
      )
      const stream = openStream(res)
      const events = await stream.waitFor(3)
      await stream.close()
      const init = JSON.parse(events[0]?.data ?? '{}') as {
        resume: string
        replayed: number
        head: number
      }
      expect(init.resume).toBe('journal')
      expect(init.replayed).toBe(2)
      expect(init.head).toBe(3)

      const replayed = events.filter((e) => e.event === 'entry').slice(0, 2)
      expect(replayed.map((e) => e.id)).toEqual(['2', '3'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('replays from Last-Event-ID when no ?since is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-route-'))
    vi.stubEnv('NEUROWIRE_JOURNAL', dir)
    try {
      openJournalStore({ dir }).append('resume', [
        { id: 'old-1', title: 'Old one', link: 'https://example.com/old-1' },
        { id: 'old-2', title: 'Old two', link: 'https://example.com/old-2' },
      ])
      stubFeed()

      const res = await app.request(`/tail?url=${encodeURIComponent(uniqueUrl())}&journal=resume`, {
        headers: { 'Last-Event-ID': '1' },
      })
      const stream = openStream(res)
      const events = await stream.waitFor(2)
      await stream.close()
      const replayed = events.filter((e) => e.event === 'entry')
      expect(replayed[0]?.id).toBe('2')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('runs live-only when the named journal does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-route-'))
    vi.stubEnv('NEUROWIRE_JOURNAL', dir)
    try {
      stubFeed()
      const res = await app.request(
        `/tail?url=${encodeURIComponent(uniqueUrl())}&journal=absent&since=1`,
      )
      const stream = openStream(res)
      const events = await stream.waitFor(1)
      await stream.close()
      const init = JSON.parse(events[0]?.data ?? '{}') as { resume: string }
      expect(init.resume).toBe('live')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
