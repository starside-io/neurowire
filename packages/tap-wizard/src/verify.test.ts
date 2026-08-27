import type { FeedTemplate } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { fixtureDoc } from './test-fixtures'
import { type VerifyReport, verifyTemplate } from './verify'

const good: FeedTemplate = {
  host: 'blog.example.com',
  item: 'article.post-card',
  title: 'h2',
  link: 'h2 a',
  date: 'time',
}

/** The named check, so a test can assert on one gate without index arithmetic. */
const check = (report: VerifyReport, name: string) =>
  report.checks.find((entry) => entry.name === name)

describe('verifyTemplate', () => {
  it('passes a template that extracts a clean listing page', async () => {
    const report = await verifyTemplate(fixtureDoc('clean-list.html'), good)

    expect(report.ok).toBe(true)
    expect(report.score).toBe(1)
    expect(report.matched).toBe(5)
    expect(report.checks.every((entry) => entry.ok)).toBe(true)
    expect(check(report, 'titles')?.detail).toBe('5/5 non-empty')
  })

  it('fails the uniqueness check when every item yields the same link', async () => {
    const report = await verifyTemplate(fixtureDoc('duplicate-links.html'), {
      item: 'article.post-card',
      title: 'h2',
      link: 'a.cat',
    })

    expect(report.ok).toBe(false)
    expect(check(report, 'unique-links')).toMatchObject({ ok: false, detail: '1/4 unique' })
    expect(check(report, 'items')?.ok).toBe(true)
  })

  it('fails the ancestor probe for a template that rakes in the nav', async () => {
    const report = await verifyTemplate(fixtureDoc('nav-heavy.html'), {
      item: 'li.nav-item',
      title: 'a',
    })

    expect(report.ok).toBe(false)
    expect(check(report, 'ancestor')).toMatchObject({
      ok: false,
      detail: '8/8 inside nav, footer, or aside',
    })
  })

  it('fails the ancestor probe when the matched items share no parent', async () => {
    const boxes = Array.from(
      { length: 4 },
      (_, i) =>
        `<section class="box"><div class="row"><a href="/p${i}"><h2>P${i}</h2></a></div></section>`,
    ).join('')
    const html = `<html><body><main>${boxes}</main></body></html>`
    const report = await verifyTemplate(
      { url: 'https://blog.example.com/', contentType: 'text/html', body: html },
      { item: 'div.row', title: 'h2' },
    )

    expect(check(report, 'ancestor')).toMatchObject({ ok: false, detail: '1/4 share a parent' })
    expect(report.ok).toBe(false)
  })

  it('holds the minimum item count, exactly at the boundary', async () => {
    const three = await verifyTemplate(fixtureDoc('nav-heavy.html'), {
      item: 'article.post-card',
      title: 'h2',
    })
    expect(check(three, 'items')).toMatchObject({ ok: true, detail: '3 extracted, 3 needed' })
    expect(three.ok).toBe(true)

    const strict = await verifyTemplate(fixtureDoc('clean-list.html'), good, { minItems: 6 })
    expect(check(strict, 'items')).toMatchObject({ ok: false, detail: '5 extracted, 6 needed' })
    expect(strict.ok).toBe(false)
  })

  it('fails a template whose selectors the page no longer has', async () => {
    const report = await verifyTemplate(fixtureDoc('redesigned-list.html'), good)

    expect(report.ok).toBe(false)
    expect(report.matched).toBe(0)
    expect(check(report, 'ancestor')).toMatchObject({ ok: false, detail: 'nothing matched' })
  })

  it('reports the engine error as a single failed check on a bad selector', async () => {
    const report = await verifyTemplate(fixtureDoc('clean-list.html'), {
      item: 'article[',
      title: 'h2',
    })

    expect(report).toMatchObject({ ok: false, score: 0, matched: 0 })
    expect(report.checks).toHaveLength(1)
    expect(check(report, 'extract')?.ok).toBe(false)
  })

  it('only checks dates when the template claims a date selector', async () => {
    const withDate = await verifyTemplate(fixtureDoc('clean-list.html'), good)
    expect(check(withDate, 'dates')).toMatchObject({ ok: true, detail: '5/5 parsed' })

    const { date: _date, ...noDate } = good
    expect(
      check(await verifyTemplate(fixtureDoc('clean-list.html'), noDate), 'dates'),
    ).toBeUndefined()
  })

  it('fails the date check when a claimed date selector rarely parses', async () => {
    const report = await verifyTemplate(fixtureDoc('clean-list.html'), {
      ...good,
      date: 'span.post-author',
    })

    expect(check(report, 'dates')).toMatchObject({ ok: false, detail: '0/5 parsed' })
    // A soft check: the template is still saveable, just degraded.
    expect(report.ok).toBe(true)
    expect(report.score).toBeLessThan(1)
  })

  it('treats off-host links as degraded, not broken', async () => {
    const report = await verifyTemplate(fixtureDoc('clean-list.html'), {
      ...good,
      host: 'somewhere.else',
    })

    expect(check(report, 'link-host')).toMatchObject({
      ok: false,
      detail: '0/5 on somewhere.else',
    })
    expect(report.ok).toBe(true)
    expect(report.score).toBeLessThan(1)
  })

  it('fails a draft with no title selector yet', async () => {
    const report = await verifyTemplate(fixtureDoc('clean-list.html'), {
      item: 'article.post-card',
      title: '',
    })

    expect(report.ok).toBe(false)
    expect(check(report, 'titles')).toMatchObject({ ok: false, detail: '0/5 non-empty' })
  })

  it('honors a custom threshold', async () => {
    const doc = fixtureDoc('clean-list.html')
    const degraded = { ...good, host: 'somewhere.else' }

    expect((await verifyTemplate(doc, degraded, { threshold: 1 })).ok).toBe(false)
    expect((await verifyTemplate(doc, degraded, { minHostRate: 0 })).ok).toBe(true)
  })
})
