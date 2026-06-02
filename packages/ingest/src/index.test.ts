import { describe, expect, it } from 'vitest'
import {
  detectKind,
  fetchFeed,
  fetchMesh,
  finalizeFeed,
  parseFeedString,
  registerTemplate,
} from './index'

describe('ingest entry point', () => {
  it('re-exports the public API surface', () => {
    expect(typeof detectKind).toBe('function')
    expect(typeof fetchFeed).toBe('function')
    expect(typeof fetchMesh).toBe('function')
    expect(typeof parseFeedString).toBe('function')
    expect(typeof finalizeFeed).toBe('function')
    expect(typeof registerTemplate).toBe('function')
  })
})
