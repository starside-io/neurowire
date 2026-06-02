import { describe, expect, it } from 'vitest'
import { listMeshNames, resolveMesh } from './meshes'

describe('resolveMesh', () => {
  it('resolves the bundled ai-news mesh', () => {
    const mesh = resolveMesh('ai-news')
    expect(mesh?.name).toBe('AI News')
    expect(mesh?.sources.length).toBeGreaterThan(0)
  })

  it('returns undefined for an unknown mesh', () => {
    expect(resolveMesh('nope-not-here')).toBeUndefined()
  })

  it('rejects path-like names to avoid traversal', () => {
    expect(resolveMesh('../secret')).toBeUndefined()
    expect(resolveMesh('/etc/passwd')).toBeUndefined()
  })

  it('lists bundled meshes', () => {
    expect(listMeshNames()).toContain('ai-news')
  })
})
