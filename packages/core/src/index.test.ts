import { describe, expect, it } from 'vitest'
import {
  FeedSchema,
  GENERATOR,
  mergeFeeds,
  parseNeurowireFeed,
  serialize,
  toAtom,
  validateNwf,
} from './index'

describe('core entry point', () => {
  it('re-exports the public API surface', () => {
    expect(typeof serialize).toBe('function')
    expect(typeof toAtom).toBe('function')
    expect(typeof mergeFeeds).toBe('function')
    expect(typeof validateNwf).toBe('function')
    expect(typeof parseNeurowireFeed).toBe('function')
    expect(typeof FeedSchema.parse).toBe('function')
    expect(GENERATOR.name).toBe('Neurowire')
  })
})
