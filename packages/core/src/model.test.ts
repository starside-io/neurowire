import { describe, expect, it } from 'vitest'
import {
  PublicConstructSchema,
  PublicMeshSchema,
  isConstructRef,
  parseConstruct,
  parseMesh,
  parseNeurowireFeed,
} from './model'

describe('model parsers', () => {
  it('parseNeurowireFeed accepts a valid feed and rejects junk', () => {
    const feed = parseNeurowireFeed({
      id: 'x',
      title: 'T',
      updated: '2024-01-01T00:00:00Z',
      entries: [],
    })
    expect(feed.title).toBe('T')
    expect(() => parseNeurowireFeed({ title: 'no id' })).toThrow()
  })

  it('parseMesh accepts a valid mesh and rejects junk', () => {
    const mesh = parseMesh({ name: 'M', sources: [{ name: 'a', url: 'https://a' }] })
    expect(mesh.sources).toHaveLength(1)
    expect(() => parseMesh({ name: 'M' })).toThrow()
  })

  it('parseMesh keeps per-source headers, PublicMeshSchema drops them', () => {
    const input = {
      name: 'M',
      sources: [{ name: 'a', url: 'https://a', headers: { authorization: 'Bearer x' } }],
    }
    expect(parseMesh(input).sources[0].headers).toEqual({ authorization: 'Bearer x' })
    expect(
      parseMesh({ name: 'M', sources: [{ name: 'a', url: 'https://a' }] }).sources[0].headers,
    ).toBeUndefined()
    expect(() =>
      parseMesh({ name: 'M', sources: [{ name: 'a', url: 'https://a', headers: { k: 1 } }] }),
    ).toThrow()
    const pub = PublicMeshSchema.parse(input)
    expect(pub.sources[0]).toEqual({ name: 'a', url: 'https://a' })
    expect('headers' in pub.sources[0]).toBe(false)
  })

  it('PublicConstructSchema drops headers on inline meshes and keeps refs', () => {
    const construct = PublicConstructSchema.parse({
      name: 'Daily',
      meshes: [
        'ai-news',
        { ref: 'security' },
        {
          name: 'Custom',
          sources: [{ name: 'a', url: 'https://a', headers: { authorization: 'Bearer x' } }],
        },
      ],
    })
    expect(construct.meshes[0]).toEqual({ ref: 'ai-news' })
    expect(construct.meshes[1]).toEqual({ ref: 'security' })
    expect(construct.meshes[2]).toEqual({
      name: 'Custom',
      sources: [{ name: 'a', url: 'https://a' }],
    })
  })

  it('parseConstruct accepts inline meshes, refs, and string shorthand', () => {
    const construct = parseConstruct({
      name: 'Daily',
      meshes: [
        'ai-news',
        { ref: 'security' },
        { name: 'Custom', sources: [{ name: 'a', url: 'https://a' }] },
      ],
    })
    expect(construct.meshes).toHaveLength(3)
    const [shorthand, ref, inline] = construct.meshes
    expect(shorthand).toEqual({ ref: 'ai-news' })
    expect(ref).toEqual({ ref: 'security' })
    expect(isConstructRef(shorthand)).toBe(true)
    expect(isConstructRef(ref)).toBe(true)
    expect(isConstructRef(inline)).toBe(false)
    if (!isConstructRef(inline)) expect(inline.sources).toHaveLength(1)
  })

  it('parseConstruct rejects junk', () => {
    expect(() => parseConstruct({ name: 'Daily' })).toThrow()
    expect(() => parseConstruct({ name: 'Daily', meshes: [{ nope: 1 }] })).toThrow()
  })
})
