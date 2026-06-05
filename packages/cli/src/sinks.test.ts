import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDiscordBody,
  buildSlackBody,
  buildText,
  buildWebhookBody,
  deliver,
  sinkKind,
} from './sinks'

const entry = (n: number): NeurowireEntry => ({
  id: `https://example.com/p/${n}`,
  title: `Post ${n}`,
  link: `https://example.com/p/${n}`,
})

const feedOf = (entries: NeurowireEntry[], title = 'AI News'): NeurowireFeed => ({
  id: 'https://example.com/feed',
  title,
  updated: '2026-06-01T12:00:00.000Z',
  entries,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sinkKind', () => {
  it('detects slack by host', () => {
    expect(sinkKind('https://hooks.slack.com/services/T/B/X')).toBe('slack')
  })
  it('detects discord by either host', () => {
    expect(sinkKind('https://discord.com/api/webhooks/1/abc')).toBe('discord')
    expect(sinkKind('https://discordapp.com/api/webhooks/1/abc')).toBe('discord')
  })
  it('falls back to webhook', () => {
    expect(sinkKind('https://example.com/hook')).toBe('webhook')
  })
})

describe('buildText', () => {
  it('writes a header and one bullet per entry', () => {
    const text = buildText('AI News', [entry(1), entry(2)])
    const lines = text.split('\n')
    expect(lines[0]).toBe('AI News: 2 new')
    expect(lines[1]).toBe('• Post 1 - https://example.com/p/1')
    expect(lines[2]).toBe('• Post 2 - https://example.com/p/2')
  })

  it('uses a hyphen with spaces, not an em-dash', () => {
    const text = buildText('AI News', [entry(1)])
    expect(text).toContain(' - ')
    expect(text).not.toContain('—')
    expect(text).not.toContain('–')
  })

  it('caps the bullets and adds an overflow line', () => {
    const entries = Array.from({ length: 13 }, (_, i) => entry(i + 1))
    const text = buildText('AI News', entries, 10)
    const lines = text.split('\n')
    expect(lines[0]).toBe('AI News: 13 new')
    // 1 header + 10 bullets + 1 overflow = 12 lines
    expect(lines).toHaveLength(12)
    expect(lines.at(-1)).toBe('…and 3 more')
  })

  it('omits the overflow line at or below max', () => {
    const text = buildText('AI News', [entry(1), entry(2)], 10)
    expect(text).not.toContain('more')
  })
})

describe('buildSlackBody / buildDiscordBody', () => {
  it('slack wraps the text in { text }', () => {
    const body = buildSlackBody('AI News', [entry(1)])
    expect(body).toEqual({ text: 'AI News: 1 new\n• Post 1 - https://example.com/p/1' })
  })

  it('discord wraps the text in { content }', () => {
    const body = buildDiscordBody('AI News', [entry(1)])
    expect(body.content).toContain('AI News: 1 new')
  })

  it('discord truncates content to 2000 chars', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      id: `https://example.com/p/${i}`,
      title: 'A very long title that repeats to push us past the discord limit quickly',
      link: `https://example.com/path/that/is/also/quite/long/indeed/${i}`,
    }))
    const body = buildDiscordBody('AI News', entries)
    expect(body.content.length).toBeLessThanOrEqual(2000)
  })
})

describe('buildWebhookBody', () => {
  it('emits a valid JSON Feed', () => {
    const body = buildWebhookBody(feedOf([entry(1), entry(2)]))
    const parsed = JSON.parse(body)
    expect(parsed.version).toBe('https://jsonfeed.org/version/1.1')
    expect(parsed.title).toBe('AI News')
    expect(parsed.items).toHaveLength(2)
  })
})

describe('deliver', () => {
  it('posts { text } as JSON to a slack url', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const ok = await deliver('https://hooks.slack.com/services/T/B/X', feedOf([entry(1)]))
    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hooks.slack.com/services/T/B/X')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'AI News: 1 new\n• Post 1 - https://example.com/p/1',
    })
  })

  it('posts the JSON Feed as application/feed+json to a generic webhook', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const ok = await deliver('https://example.com/hook', feedOf([entry(1)]))
    expect(ok).toBe(true)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/feed+json')
    const parsed = JSON.parse(init.body as string)
    expect(parsed.version).toBe('https://jsonfeed.org/version/1.1')
  })

  it('returns false and warns on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' })),
    )
    const warn = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const ok = await deliver('https://example.com/hook', feedOf([entry(1)]))
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sink] example.com failed: 500'))
  })

  it('returns false and warns when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const warn = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const ok = await deliver('https://example.com/hook', feedOf([entry(1)]))
    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[sink] example.com failed: network down'),
    )
  })
})
