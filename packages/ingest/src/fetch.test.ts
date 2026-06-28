import { afterEach, describe, expect, it, vi } from 'vitest'
import { type CachedResponse, createMemoryCache, fetchDocument } from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDocument', () => {
  it('returns the body, content type, and final url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<feed/>', {
            status: 200,
            headers: { 'content-type': 'application/atom+xml' },
          }),
      ),
    )
    const doc = await fetchDocument('https://example.com/feed')
    expect(doc.body).toBe('<feed/>')
    expect(doc.contentType).toContain('atom')
    expect(doc.url).toBe('https://example.com/feed')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' })),
    )
    await expect(fetchDocument('https://example.com/x', { retries: 0 })).rejects.toThrow(
      /Upstream responded 500/,
    )
  })

  it('rejects an invalid URL', async () => {
    await expect(fetchDocument('not a url')).rejects.toThrow(/Invalid URL/)
  })

  it('rejects an unsupported protocol', async () => {
    await expect(fetchDocument('ftp://example.com/x')).rejects.toThrow(/Unsupported protocol/)
  })

  it('sends conditional headers when the cache has validators', async () => {
    const cache = createMemoryCache()
    cache.set('https://example.com/feed', {
      url: 'https://example.com/feed',
      contentType: 'application/atom+xml',
      body: '<feed/>',
      etag: 'W/"abc"',
      lastModified: 'Wed, 21 Oct 2025 07:28:00 GMT',
    })
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('<feed>new</feed>', {
          status: 200,
          headers: { 'content-type': 'application/atom+xml' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchDocument('https://example.com/feed', { cache })

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['if-none-match']).toBe('W/"abc"')
    expect(headers['if-modified-since']).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
  })

  it('returns the cached body on a 304 without throwing', async () => {
    const cache = createMemoryCache()
    const entry: CachedResponse = {
      url: 'https://example.com/feed',
      contentType: 'application/atom+xml',
      body: '<feed>cached</feed>',
      etag: 'W/"abc"',
    }
    cache.set('https://example.com/feed', entry)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 304 })),
    )

    const doc = await fetchDocument('https://example.com/feed', { cache })
    expect(doc.notModified).toBe(true)
    expect(doc.body).toBe('<feed>cached</feed>')
    expect(doc.etag).toBe('W/"abc"')
  })

  it('falls through to a normal read when a 304 has no cache entry', async () => {
    const cache = createMemoryCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<feed/>', {
            status: 200,
            headers: { 'content-type': 'application/atom+xml' },
          }),
      ),
    )
    const doc = await fetchDocument('https://example.com/feed', { cache })
    expect(doc.body).toBe('<feed/>')
    expect(doc.notModified).toBeUndefined()
  })

  it('stores etag and last-modified into the cache on a 200', async () => {
    const cache = createMemoryCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<feed/>', {
            status: 200,
            headers: {
              'content-type': 'application/atom+xml',
              etag: 'W/"v1"',
              'last-modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
            },
          }),
      ),
    )
    const doc = await fetchDocument('https://example.com/feed', { cache })
    expect(doc.etag).toBe('W/"v1"')
    expect(doc.lastModified).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
    const stored = cache.get('https://example.com/feed')
    expect(stored?.etag).toBe('W/"v1"')
    expect(stored?.lastModified).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
    expect(stored?.body).toBe('<feed/>')
  })

  it('does not send conditional headers without a cache', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('<feed/>', {
          status: 200,
          headers: { 'content-type': 'application/atom+xml' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const doc = await fetchDocument('https://example.com/feed')
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['if-none-match']).toBeUndefined()
    expect(headers['if-modified-since']).toBeUndefined()
    expect(doc.body).toBe('<feed/>')
  })

  it('follows redirects manually and resolves a relative Location', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(
        new Response('<feed/>', {
          status: 200,
          headers: { 'content-type': 'application/atom+xml' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const doc = await fetchDocument('https://example.com/start')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/final')
    expect(doc.body).toBe('<feed/>')
  })

  it('runs validate() on every redirect hop and lets it block (SSRF guard)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/' } }),
      )
      .mockResolvedValue(new Response('<feed/>', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const seen: string[] = []
    const validate = (u: string) => {
      seen.push(u)
      if (u.includes('169.254.169.254')) throw new Error('Blocked non-public address')
    }
    await expect(fetchDocument('https://example.com/start', { validate })).rejects.toThrow(
      /Blocked non-public/,
    )
    expect(seen).toEqual(['https://example.com/start', 'http://169.254.169.254/'])
  })

  it('throws after too many redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302, headers: { location: '/loop' } })),
    )
    await expect(fetchDocument('https://example.com/start')).rejects.toThrow(/Too many redirects/)
  })
})

// A delay stub that records its waits and resolves instantly (no real timers).
const noWait = () => {
  const waits: number[] = []
  const delay = vi.fn(async (ms: number) => {
    waits.push(ms)
  })
  return { waits, delay }
}

const ok = () =>
  new Response('<feed/>', { status: 200, headers: { 'content-type': 'application/atom+xml' } })

describe('fetchDocument retries', () => {
  it('retries a 500 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay, waits } = noWait()

    const doc = await fetchDocument('https://example.com/x', { delay })
    expect(doc.body).toBe('<feed/>')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(waits).toHaveLength(1)
  })

  it('gives up after the configured number of retries', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    await expect(fetchDocument('https://example.com/x', { retries: 2, delay })).rejects.toThrow(
      /Upstream responded 503/,
    )
    // 1 initial attempt + 2 retries = 3 calls.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries a network error (TypeError) then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    const doc = await fetchDocument('https://example.com/x', { delay })
    expect(doc.body).toBe('<feed/>')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 404', async () => {
    const fetchMock = vi.fn(async () => new Response('gone', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    await expect(fetchDocument('https://example.com/x', { delay })).rejects.toThrow(
      /Upstream responded 404/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry an invalid URL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    await expect(fetchDocument('not a url', { delay })).rejects.toThrow(/Invalid URL/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not retry an SSRF reject from validate', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()
    const validate = () => {
      throw new Error('Blocked non-public address')
    }

    await expect(fetchDocument('https://example.com/x', { validate, delay })).rejects.toThrow(
      /Blocked non-public/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('honors Retry-After (seconds) on a 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow', { status: 429, headers: { 'retry-after': '7' } }))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay, waits } = noWait()

    const doc = await fetchDocument('https://example.com/x', { delay })
    expect(doc.body).toBe('<feed/>')
    expect(waits).toEqual([7000])
  })

  it('retries a 429 without Retry-After using backoff', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow', { status: 429 }))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay, waits } = noWait()

    await fetchDocument('https://example.com/x', { backoffMs: 500, delay })
    expect(waits).toHaveLength(1)
    // Full-jitter backoff: between base*0.5 and base for the first attempt.
    expect(waits[0]).toBeGreaterThanOrEqual(250)
    expect(waits[0]).toBeLessThanOrEqual(500)
  })

  it('parses an HTTP-date Retry-After on a 429', async () => {
    const when = new Date(Date.now() + 5000).toUTCString()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow', { status: 429, headers: { 'retry-after': when } }),
      )
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay, waits } = noWait()

    await fetchDocument('https://example.com/x', { delay })
    expect(waits).toHaveLength(1)
    // Roughly 5 seconds out (allow a little slack for the clock between calls).
    expect(waits[0]).toBeGreaterThan(3000)
    expect(waits[0]).toBeLessThanOrEqual(5000)
  })

  it('falls back to backoff when Retry-After is unparseable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow', { status: 429, headers: { 'retry-after': 'soon-ish' } }),
      )
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay, waits } = noWait()

    await fetchDocument('https://example.com/x', { backoffMs: 500, delay })
    expect(waits[0]).toBeGreaterThanOrEqual(250)
    expect(waits[0]).toBeLessThanOrEqual(500)
  })

  it('uses the real timer-based delay between retries', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('boom', { status: 500 }))
        .mockResolvedValueOnce(ok())
      vi.stubGlobal('fetch', fetchMock)

      const promise = fetchDocument('https://example.com/x', { backoffMs: 100 })
      // Let the first attempt settle, then advance past the backoff wait.
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(30000)
      const doc = await promise
      expect(doc.body).toBe('<feed/>')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps a huge Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow', { status: 429, headers: { 'retry-after': '99999' } }),
      )
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay, waits } = noWait()

    await fetchDocument('https://example.com/x', { delay })
    expect(waits[0]).toBe(30000)
  })

  it('aborts on timeout and retries', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      // Simulate a hung host: reject with the signal's actual reason when it
      // fires, exactly as undici does, so the real timeout DOMException is what
      // the retry classifier sees (a string reason would not be retried).
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject((init.signal as AbortSignal).reason)
        })
      })
    })
    let calls = 0
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      calls++
      if (calls === 1) return fetchMock(url, init)
      return ok()
    })
    vi.stubGlobal('fetch', wrapped)
    const { delay } = noWait()

    const doc = await fetchDocument('https://example.com/x', { timeoutMs: 10, delay })
    expect(doc.body).toBe('<feed/>')
    expect(wrapped).toHaveBeenCalledTimes(2)
  })

  it('gives up after N timeouts when the host stays hung', async () => {
    // Always hang, rejecting with the signal's real reason (the timeout DOMException).
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject((init.signal as AbortSignal).reason)
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    await expect(
      fetchDocument('https://example.com/x', { timeoutMs: 5, retries: 2, delay }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    // 1 initial + 2 retries, every one timing out.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rejects immediately when the caller signal is already aborted, no retry', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()
    const controller = new AbortController()
    controller.abort()

    await expect(
      fetchDocument('https://example.com/x', { signal: controller.signal, delay }),
    ).rejects.toThrow(/aborted/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not retry when the caller aborts mid-flight', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject((init.signal as AbortSignal).reason)
        })
        // Caller cancels right after the request starts.
        controller.abort()
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    await expect(
      fetchDocument('https://example.com/x', { signal: controller.signal, delay }),
    ).rejects.toThrow()
    // Caller abort: exactly one attempt, no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-sends conditional headers on a retried attempt', async () => {
    const cache = createMemoryCache()
    cache.set('https://example.com/feed', {
      url: 'https://example.com/feed',
      contentType: 'application/atom+xml',
      body: '<feed/>',
      etag: 'W/"abc"',
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    await fetchDocument('https://example.com/feed', { cache, delay })
    const first = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    const second = fetchMock.mock.calls[1][1]?.headers as Record<string, string>
    expect(first['if-none-match']).toBe('W/"abc"')
    expect(second['if-none-match']).toBe('W/"abc"')
  })

  it('does not retry a 304', async () => {
    const cache = createMemoryCache()
    cache.set('https://example.com/feed', {
      url: 'https://example.com/feed',
      contentType: 'application/atom+xml',
      body: '<feed>cached</feed>',
      etag: 'W/"abc"',
    })
    const fetchMock = vi.fn(async () => new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()

    const doc = await fetchDocument('https://example.com/feed', { cache, delay })
    expect(doc.notModified).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-validates the whole redirect chain on a retried attempt', async () => {
    const fetchMock = vi
      .fn()
      // First attempt: redirect, then a 500 on the target.
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      // Second attempt: same redirect, then success.
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const { delay } = noWait()
    const seen: string[] = []
    const validate = (u: string) => {
      seen.push(u)
    }

    const doc = await fetchDocument('https://example.com/start', { validate, delay })
    expect(doc.body).toBe('<feed/>')
    // Both hops were re-validated on the retried attempt: start+final, twice.
    expect(seen).toEqual([
      'https://example.com/start',
      'https://example.com/final',
      'https://example.com/start',
      'https://example.com/final',
    ])
  })
})
