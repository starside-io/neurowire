import { describe, expect, it } from 'vitest'
import { createTtlCache } from './cache'

describe('ttl cache', () => {
  it('returns a stored entry within the ttl', () => {
    const cache = createTtlCache()
    cache.set('k', { body: 'hi', contentType: 'text/plain', expires: 1000 })
    const hit = cache.get('k', 500)
    expect(hit?.body).toBe('hi')
    expect(hit?.contentType).toBe('text/plain')
  })

  it('misses after the entry has expired', () => {
    const cache = createTtlCache()
    cache.set('k', { body: 'hi', contentType: 'text/plain', expires: 1000 })
    expect(cache.get('k', 1000)).toBeUndefined()
    expect(cache.get('k', 1500)).toBeUndefined()
  })

  it('misses for an unknown key', () => {
    const cache = createTtlCache()
    expect(cache.get('absent', 0)).toBeUndefined()
  })

  it('overwrites an existing entry', () => {
    const cache = createTtlCache()
    cache.set('k', { body: 'old', contentType: 'text/plain', expires: 1000 })
    cache.set('k', { body: 'new', contentType: 'text/plain', expires: 2000 })
    expect(cache.get('k', 1500)?.body).toBe('new')
  })
})
