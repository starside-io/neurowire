import { describe, expect, it } from 'vitest'
import { listConstructNames, resolveConstruct } from './constructs'

describe('resolveConstruct', () => {
  it('resolves the bundled daily construct', () => {
    const construct = resolveConstruct('daily')
    expect(construct?.name).toBe('Daily Brief')
    expect(construct?.meshes.length).toBeGreaterThan(0)
  })

  it('returns undefined for an unknown construct', () => {
    expect(resolveConstruct('nope-not-here')).toBeUndefined()
  })

  it('rejects path-like names to avoid traversal', () => {
    expect(resolveConstruct('../secret')).toBeUndefined()
    expect(resolveConstruct('/etc/passwd')).toBeUndefined()
  })

  it('lists bundled constructs', () => {
    expect(listConstructNames()).toContain('daily')
  })
})
