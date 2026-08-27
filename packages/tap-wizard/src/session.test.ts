import { afterEach, describe, expect, it, vi } from 'vitest'
import { TAP_STEPS, autoComplete, createTapSession, openTapSession } from './session'
import { fixture, fixtureDoc } from './test-fixtures'

describe('TAP_STEPS', () => {
  it('walks the fields in order, with only item and title required', () => {
    expect(TAP_STEPS.map((step) => step.field)).toEqual([
      'item',
      'title',
      'link',
      'date',
      'summary',
      'author',
      'tags',
    ])
    expect(TAP_STEPS.filter((step) => step.required).map((step) => step.field)).toEqual([
      'item',
      'title',
    ])
    expect(TAP_STEPS.every((step) => step.label && step.hint)).toBe(true)
  })
})

describe('createTapSession', () => {
  it('analyzes once and prefills what is not a selector', () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))

    expect(session.template).toEqual({
      item: '',
      title: '',
      host: 'blog.example.com',
      feedTitle: 'Neon Dispatch',
    })
    expect(session.seed?.item).toBe('article.post-card')
    expect(session.candidates('item')[0]).toBe('article.post-card')
  })

  it('derives the host from the url when the page defeats the proposal', () => {
    const session = createTapSession({
      url: 'https://empty.example.com/blog',
      contentType: 'text/html',
      body: '<html><head><title>Nothing Here</title></head><body><p>hi</p></body></html>',
    })

    expect(session.seed).toBeUndefined()
    expect(session.template).toEqual({
      item: '',
      title: '',
      host: 'empty.example.com',
      feedTitle: 'Nothing Here',
    })
    expect(session.candidates('item')).toEqual([])
  })

  it('leaves host and feedTitle out when the page and url give neither', () => {
    const session = createTapSession({
      url: 'not a url',
      contentType: 'text/html',
      body: '<html><body><p>hi</p></body></html>',
    })

    expect(session.template).toEqual({ item: '', title: '' })
  })

  it('builds the template up one pick at a time, previewing each', async () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))

    const afterItem = await session.choose('item', 'article.post-card')
    expect(afterItem.matched).toBe(5)
    expect(afterItem.entries).toEqual([])

    const afterTitle = await session.choose('title', 'h2')
    expect(afterTitle.matched).toBe(5)
    expect(afterTitle.entries[0]?.title).toBe('Alpha Release Notes')

    expect(session.template).toMatchObject({ item: 'article.post-card', title: 'h2' })
  })

  it('drops an optional field when the pick is blank, and keeps required ones', async () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))
    await session.choose('item', 'article.post-card')
    await session.choose('title', 'h2')
    await session.choose('date', 'time')
    expect(session.template.date).toBe('time')

    await session.choose('date', '   ')
    expect(session.template).not.toHaveProperty('date')

    await session.choose('title', '')
    expect(session.template.title).toBe('')
  })

  it('hands out copies, so a caller cannot mutate the session', () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))

    const template = session.template
    template.item = 'div.hijacked'
    session.candidates('item').push('div.hijacked')

    expect(session.template.item).toBe('')
    expect(session.candidates('item')).not.toContain('div.hijacked')
  })

  it('verifies the current template, not the one it started with', async () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))
    expect((await session.verify()).ok).toBe(false)

    await session.choose('item', 'article.post-card')
    await session.choose('title', 'h2')
    const report = await session.verify()

    expect(report.ok).toBe(true)
    expect(report.matched).toBe(5)
    expect((await session.verify({ minItems: 99 })).ok).toBe(false)
  })

  it('previews without recording a pick', async () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))
    await session.choose('item', 'article.post-card')
    await session.choose('title', 'h2')

    expect((await session.preview()).matched).toBe(5)
  })
})

describe('autoComplete', () => {
  it('accepts the top candidate for every field the page offers', async () => {
    const session = createTapSession(fixtureDoc('clean-list.html'))
    const preview = await autoComplete(session)

    expect(preview.matched).toBe(5)
    expect(session.template).toEqual({
      host: 'blog.example.com',
      feedTitle: 'Neon Dispatch',
      item: 'article.post-card',
      title: 'h2',
      link: 'h2 a',
      date: 'time',
      summary: 'p.post-excerpt',
      author: 'span.post-author',
      tags: 'span.post-tag',
    })
    expect((await session.verify()).ok).toBe(true)
  })

  it('skips fields with no candidate at all', async () => {
    const session = createTapSession(fixtureDoc('nav-heavy.html'))
    await autoComplete(session)

    expect(session.template).not.toHaveProperty('summary')
    expect(session.template).not.toHaveProperty('author')
  })

  it('leaves an unusable page unusable rather than guessing', async () => {
    const session = createTapSession({
      url: 'https://empty.example.com/blog',
      contentType: 'text/html',
      body: '<html><body><p>hi</p></body></html>',
    })
    const preview = await autoComplete(session)

    expect(preview.error).toBe('no item selector yet')
    expect((await session.verify()).ok).toBe(false)
  })
})

describe('openTapSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the page exactly once, no matter how many picks follow', async () => {
    const body = fixture('clean-list.html')
    const fetchMock = vi.fn(
      async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const session = await openTapSession('https://blog.example.com/')
    await session.choose('item', 'article.post-card')
    await session.choose('title', 'h2')
    await session.choose('date', 'time')
    await session.preview()
    await session.verify()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(session.doc.url).toBe('https://blog.example.com/')
    expect((await session.verify()).ok).toBe(true)
  })
})
