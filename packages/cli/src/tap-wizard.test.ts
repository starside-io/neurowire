import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawDocument } from '@neurowire/ingest'
import { createTapSession } from '@neurowire/tap-wizard'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type TapCheckResult,
  type TapWizardDeps,
  type WizardIo,
  checkUrlFor,
  classify,
  loadTapEntries,
  parseChoice,
  renderCandidates,
  renderCheckTable,
  renderPreview,
  renderVerify,
  runTapCheck,
  runTapHeal,
  runTapWizard,
  tapFilename,
} from './tap-wizard'

const PAGE = `<!doctype html>
<html><head><title>Neon Dispatch</title></head><body>
  <nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav>
  <main><div class="post-list">
    <article class="post-card">
      <h2 class="post-title"><a href="/posts/alpha">Alpha Release Notes</a></h2>
      <time datetime="2026-03-01T09:00:00Z">March 1, 2026</time>
    </article>
    <article class="post-card">
      <h2 class="post-title"><a href="/posts/beta">Beta Feature Tour</a></h2>
      <time datetime="2026-02-18T09:00:00Z">February 18, 2026</time>
    </article>
    <article class="post-card">
      <h2 class="post-title"><a href="/posts/gamma">Gamma Performance Wins</a></h2>
      <time datetime="2026-02-02T09:00:00Z">February 2, 2026</time>
    </article>
  </div></main>
</body></html>`

/** The same page after a redesign: every class renamed. */
const REDESIGNED = PAGE.replaceAll('post-card', 'tile-block').replaceAll('post-title', 'tile-head')

/** A page with nothing repeating, so the heuristics have nothing to offer. */
const BARREN = '<!doctype html><html><head><title>Nope</title></head><body><p>hi</p></body></html>'

const docOf = (body: string, url = 'https://blog.example.com/'): RawDocument => ({
  url,
  contentType: 'text/html; charset=utf-8',
  body,
})

/** A recording IO whose `ask` replays a scripted list of answers. */
function testIo(answers: string[] = []): { io: WizardIo; log: { out: string; err: string } } {
  const queue = [...answers]
  const log = { out: '', err: '' }
  const io: WizardIo = {
    out: (text: string) => {
      log.out += text
    },
    err: (text: string) => {
      log.err += text
    },
    ask: async () => queue.shift() ?? '',
  }
  return { io, log }
}

function depsFor(body: string, answers: string[] = []) {
  const { io, log } = testIo(answers)
  const deps: TapWizardDeps = {
    io,
    openSession: async (url: string) => createTapSession(docOf(body, url)),
    loadDocument: async (url: string) => docOf(body, url),
  }
  return { log, deps }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'neurowire-tap-'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('parseChoice', () => {
  const candidates = ['article.post-card', 'li.nav-item']

  it('accepts a candidate by number', () => {
    expect(parseChoice('2', candidates, true)).toEqual({ kind: 'pick', selector: 'li.nav-item' })
  })

  it('rejects a number outside the list', () => {
    expect(parseChoice('9', candidates, true)).toMatchObject({ kind: 'invalid' })
    expect(parseChoice('0', candidates, true)).toMatchObject({ kind: 'invalid' })
  })

  it('takes anything else as a hand-written selector', () => {
    expect(parseChoice('  h3.custom ', candidates, false)).toEqual({
      kind: 'pick',
      selector: 'h3.custom',
    })
  })

  it('skips an optional field on a blank line', () => {
    expect(parseChoice('', candidates, false)).toEqual({ kind: 'skip' })
  })

  it('takes the top candidate on a blank line for a required field', () => {
    expect(parseChoice('', candidates, true)).toEqual({
      kind: 'pick',
      selector: 'article.post-card',
    })
  })

  it('has nothing to fall back on when a required field has no candidate', () => {
    expect(parseChoice('', [], true)).toMatchObject({ kind: 'invalid' })
  })
})

describe('rendering', () => {
  it('numbers the candidates, and says so when there are none', () => {
    expect(renderCandidates(['a', 'b'])).toBe('    1) a\n    2) b')
    expect(renderCandidates([])).toContain('no suggestion')
  })

  it('shows a sample of what a pick extracts', () => {
    const preview = {
      matched: 2,
      entries: [
        { title: 'One', link: '/1', date: '', summary: '', author: '', tags: [] },
        { title: 'Two', link: '/2', date: '', summary: '', author: '', tags: [] },
      ],
    }
    expect(renderPreview(preview, 1)).toBe('    preview  One  /1')
    expect(renderPreview({ matched: 3, entries: [] })).toContain('3 match(es)')
    expect(renderPreview({ matched: 0, entries: [], error: 'boom' })).toContain('boom')
  })

  it('lists the failed checks under a failing verdict only', () => {
    const failing = renderVerify({
      score: 0.5,
      matched: 2,
      ok: false,
      checks: [
        { name: 'items', ok: false, detail: '2 extracted, 3 needed' },
        { name: 'titles', ok: true, detail: '2/2 non-empty' },
      ],
    })
    expect(failing).toContain('failed  items: 2 extracted, 3 needed')
    expect(failing).not.toContain('failed  titles')

    const passing = renderVerify({ score: 1, matched: 2, ok: true, checks: [] })
    expect(passing).toBe('  verify  2 items · ')
  })

  it('renders a check table with a count line', () => {
    const results: TapCheckResult[] = [
      { host: 'a.test', source: 'a.json', health: 'healthy', matched: 5, score: 1, checks: [] },
      {
        host: 'b.test',
        source: 'b.json',
        health: 'broken',
        matched: 0,
        score: 0,
        checks: [{ name: 'items', ok: false, detail: 'none' }],
      },
    ]
    const table = renderCheckTable(results)

    expect(table).toContain('healthy   a.test  (5 items)')
    expect(table).toContain('items: none')
    expect(table).toContain('2 tap(s): 1 healthy, 0 degraded, 1 broken')
  })
})

describe('classify', () => {
  it('splits healthy from degraded from broken', () => {
    expect(classify({ score: 1, matched: 3, ok: true, checks: [] })).toBe('healthy')
    expect(classify({ score: 0.9, matched: 3, ok: true, checks: [] })).toBe('degraded')
    expect(classify({ score: 0.9, matched: 3, ok: false, checks: [] })).toBe('broken')
  })
})

describe('tapFilename', () => {
  it('names the file after the host', () => {
    expect(tapFilename({ host: 'blog.example.com', item: 'a', title: 'b' }, 'x')).toBe(
      'blog.example.com.json',
    )
  })

  it('falls back to the url, then to a generic name', () => {
    expect(tapFilename({ item: 'a', title: 'b' }, 'https://news.example.org/blog')).toBe(
      'news.example.org.json',
    )
    expect(tapFilename({ item: 'a', title: 'b' }, 'not a url')).toBe('tap.json')
  })
})

describe('loadTapEntries and checkUrlFor', () => {
  it('keeps the url hint the schema would strip', () => {
    const path = join(dir, 'one.json')
    writeFileSync(
      path,
      JSON.stringify({
        host: 'blog.example.com',
        item: 'article.post-card',
        title: 'h2',
        url: 'https://blog.example.com/posts',
      }),
    )

    const [entry] = loadTapEntries(path)
    expect(entry?.template).not.toHaveProperty('url')
    expect(entry?.url).toBe('https://blog.example.com/posts')
    expect(checkUrlFor(entry as never)).toBe('https://blog.example.com/posts')
  })

  it('reads every json file in a directory, arrays included', () => {
    writeFileSync(join(dir, 'b.json'), JSON.stringify([{ item: 'i', title: 't', host: 'b.test' }]))
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ item: 'i', title: 't', host: 'a.test' }))
    writeFileSync(join(dir, 'skip.txt'), 'ignored')

    expect(loadTapEntries(dir).map((entry) => entry.template.host)).toEqual(['a.test', 'b.test'])
  })

  it('never guesses a page from the host, and honors an override', () => {
    const entry = { template: { host: 'a.test', item: 'i', title: 't' }, source: 'a.json' }
    // Most listing pages live at a path, so the apex host is not a safe guess.
    expect(checkUrlFor(entry)).toBeUndefined()
    expect(checkUrlFor(entry, 'http://127.0.0.1:8080/p')).toBe('http://127.0.0.1:8080/p')
    expect(checkUrlFor({ ...entry, url: 'https://a.test/blog' })).toBe('https://a.test/blog')
  })
})

describe('runTapWizard', () => {
  it('writes a verified tap on the --yes path', async () => {
    const out = join(dir, 'tap.json')
    const { log, deps } = depsFor(PAGE)

    expect(await runTapWizard('https://blog.example.com/', { yes: true, out }, deps)).toBe(0)

    const written = JSON.parse(readFileSync(out, 'utf8'))
    expect(written).toMatchObject({
      host: 'blog.example.com',
      item: 'article.post-card',
      title: 'h2',
      url: 'https://blog.example.com/',
    })
    expect(log.out).toContain('verify  3 items')
    expect(log.out).toContain(`wrote   ${out}`)
  })

  it('refuses to write a template that fails the gate', async () => {
    const out = join(dir, 'tap.json')
    const { log, deps } = depsFor(BARREN)

    expect(await runTapWizard('https://blog.example.com/', { yes: true, out }, deps)).toBe(1)
    expect(log.err).toContain('did not pass verification')
    expect(() => readFileSync(out, 'utf8')).toThrow()
  })

  it('needs a url', async () => {
    const { log, deps } = depsFor(PAGE)
    expect(await runTapWizard(undefined, {}, deps)).toBe(1)
    expect(log.err).toContain('needs a url')
  })

  it('walks the steps interactively, honoring numbers, overrides, and skips', async () => {
    const out = join(dir, 'tap.json')
    // item: candidate 1, title: hand-written, then skip every optional field.
    const { log, deps } = depsFor(PAGE, ['1', 'h2.post-title', '', '', '', '', ''])

    expect(await runTapWizard('https://blog.example.com/', { out }, deps)).toBe(0)

    const written = JSON.parse(readFileSync(out, 'utf8'))
    expect(written).toMatchObject({ item: 'article.post-card', title: 'h2.post-title' })
    expect(written).not.toHaveProperty('date')
    expect(log.out).toContain('step 1/7  Article block  (required)')
    expect(log.out).toContain('preview  Alpha Release Notes')
  })

  it('keeps the tap it is about to replace, and only the original', async () => {
    const out = join(dir, 'tap.json')
    writeFileSync(out, JSON.stringify({ item: 'hand.written', title: 'h1' }))

    const first = depsFor(PAGE)
    expect(await runTapWizard('https://blog.example.com/', { yes: true, out }, first.deps)).toBe(0)
    expect(first.log.out).toContain(`(previous kept as ${out}.bak)`)
    expect(JSON.parse(readFileSync(`${out}.bak`, 'utf8')).item).toBe('hand.written')

    // A second run must not bury the hand-written original under its own output.
    const second = depsFor(PAGE)
    expect(await runTapWizard('https://blog.example.com/', { yes: true, out }, second.deps)).toBe(0)
    expect(JSON.parse(readFileSync(`${out}.bak`, 'utf8')).item).toBe('hand.written')
  })

  it('re-asks when a hand-written selector pulls nothing off the page', async () => {
    const out = join(dir, 'tap.json')
    const { log, deps } = depsFor(PAGE, ['div.nope', '1', '1', '', '', '', '', ''])

    expect(await runTapWizard('https://blog.example.com/', { out }, deps)).toBe(0)
    expect(log.err).toContain('div.nope pulls nothing off this page')
    expect(JSON.parse(readFileSync(out, 'utf8')).item).toBe('article.post-card')
  })

  it('gives up on a step that never gets a usable answer', async () => {
    const { log, deps } = depsFor(PAGE, ['99', '99', '99'])

    expect(await runTapWizard('https://blog.example.com/', {}, deps)).toBe(1)
    expect(log.err).toContain('gave up on that step')
    expect(log.err).toContain('no candidate 99')
  })
})

describe('runTapCheck', () => {
  const tapFile = (name: string, body: Record<string, unknown>): string => {
    const path = join(dir, name)
    writeFileSync(path, JSON.stringify(body))
    return path
  }

  it('reports a healthy tap and exits 0', async () => {
    const path = tapFile('ok.json', {
      host: 'blog.example.com',
      item: 'article.post-card',
      title: 'h2',
      date: 'time',
      url: 'https://blog.example.com/',
    })
    const { log, deps } = depsFor(PAGE)

    expect(await runTapCheck(path, {}, deps)).toBe(0)
    expect(log.out).toContain('healthy   blog.example.com  (3 items)')
  })

  it('reports a broken tap and exits 1', async () => {
    const path = tapFile('broken.json', {
      host: 'blog.example.com',
      item: 'article.post-card',
      title: 'h2',
      url: 'https://blog.example.com/',
    })
    const { log, deps } = depsFor(REDESIGNED)

    expect(await runTapCheck(path, {}, deps)).toBe(1)
    expect(log.out).toContain('broken')
    expect(log.out).toContain('items: 0 extracted, 3 needed')
  })

  it('reports a degraded tap without failing the run', async () => {
    const path = tapFile('degraded.json', {
      host: 'somewhere.else',
      item: 'article.post-card',
      title: 'h2',
      url: 'https://blog.example.com/',
    })
    const { log, deps } = depsFor(PAGE)

    expect(await runTapCheck(path, {}, deps)).toBe(0)
    expect(log.out).toContain('degraded')
    expect(log.out).toContain('link-host')
  })

  it('emits a machine-readable shape with --json', async () => {
    const path = tapFile('json.json', {
      host: 'blog.example.com',
      item: 'article.post-card',
      title: 'h2',
      url: 'https://blog.example.com/',
    })
    const { log, deps } = depsFor(PAGE)

    expect(await runTapCheck(path, { json: true }, deps)).toBe(0)
    const parsed = JSON.parse(log.out)
    expect(parsed).toMatchObject({ checked: 1, healthy: 1, degraded: 0, broken: 0 })
    expect(parsed.taps[0]).toMatchObject({
      host: 'blog.example.com',
      health: 'healthy',
      matched: 3,
    })
    expect(Array.isArray(parsed.taps[0].checks)).toBe(true)
  })

  it('treats a failed fetch as broken rather than throwing', async () => {
    const path = tapFile('gone.json', {
      host: 'gone.test',
      item: 'i',
      title: 't',
      url: 'https://gone.test/blog',
    })
    const { io, log } = testIo()
    const deps: TapWizardDeps = {
      io,
      loadDocument: async () => {
        throw new Error('Upstream responded 503')
      },
    }

    expect(await runTapCheck(path, {}, deps)).toBe(1)
    expect(log.out).toContain('fetch: Upstream responded 503')
  })

  it('says unknown, not broken, when a tap names no page', async () => {
    const path = tapFile('hostless.json', {
      host: 'a.test',
      item: 'article.post-card',
      title: 'h2',
    })
    const { log, deps } = depsFor(PAGE)

    // Guessing the page would report a working tap as broken, so an unknown tap
    // is reported honestly and does not fail the run.
    expect(await runTapCheck(path, {}, deps)).toBe(0)
    expect(log.out).toContain('unknown')
    expect(log.out).toContain('add a "url" key')
  })

  it('checks a tap whose page only the --url flag knows', async () => {
    const path = tapFile('flagged.json', {
      host: 'blog.example.com',
      item: 'article.post-card',
      title: 'h2',
    })
    const { log, deps } = depsFor(PAGE)

    expect(await runTapCheck(path, { url: 'https://blog.example.com/' }, deps)).toBe(0)
    expect(log.out).toContain('healthy')
  })

  it('checks every registered tap with --all, taking pages from the user files', async () => {
    // A hermetic tap directory: the developer's real ~/.config must not decide
    // what this test sees.
    vi.stubEnv('XDG_CONFIG_HOME', dir)
    vi.stubEnv('NEUROWIRE_TAPS', '')
    mkdirSync(join(dir, 'neurowire', 'taps'), { recursive: true })
    writeFileSync(
      join(dir, 'neurowire', 'taps', 'mine.json'),
      JSON.stringify({
        host: 'mine.test',
        item: 'article.post-card',
        title: 'h2',
        url: 'https://mine.test/blog',
      }),
    )
    const { log, deps } = depsFor(PAGE)

    await runTapCheck(undefined, { all: true }, deps)

    // The bundled taps carry no page, so they are enumerated but not judged; the
    // user's own tap carries its hint through the schema-stripping registry.
    expect(log.out).toContain('unknown   claude.com')
    expect(log.out).toContain('healthy   mine.test')
    expect(log.out).not.toContain('example-blog.test')
  })

  it('needs a path or --all', async () => {
    const { log, deps } = depsFor(PAGE)
    expect(await runTapCheck(undefined, {}, deps)).toBe(1)
    expect(log.err).toContain('needs a path or --all')
  })

  it('says so when a directory holds no taps', async () => {
    const { log, deps } = depsFor(PAGE)
    expect(await runTapCheck(dir, {}, deps)).toBe(1)
    expect(log.err).toContain('no taps to check')
  })
})

describe('runTapHeal', () => {
  const brokenTap = (name = 'tap.json'): string => {
    const path = join(dir, name)
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          host: 'blog.example.com',
          feedTitle: 'Neon Dispatch',
          item: 'article.post-card',
          title: 'h2',
          date: 'time',
          url: 'https://blog.example.com/',
        },
        null,
        2,
      )}\n`,
    )
    return path
  }

  it('re-authors a broken tap and keeps the old file as a .bak', async () => {
    const path = brokenTap()
    const { log, deps } = depsFor(REDESIGNED)

    expect(await runTapHeal(path, { yes: true }, deps)).toBe(0)

    const healed = JSON.parse(readFileSync(path, 'utf8'))
    expect(healed).toMatchObject({
      host: 'blog.example.com',
      feedTitle: 'Neon Dispatch',
      item: 'article.tile-block',
      url: 'https://blog.example.com/',
    })
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8')).item).toBe('article.post-card')
    expect(log.out).toContain('broken  Article block  (was article.post-card)')
    // The date selector never broke, so it is kept rather than re-picked.
    expect(log.out).toContain('keep    Date')
  })

  it('leaves a healthy tap alone', async () => {
    const path = brokenTap()
    const { log, deps } = depsFor(PAGE)

    expect(await runTapHeal(path, { yes: true }, deps)).toBe(0)
    expect(log.out).toContain('nothing to heal')
    expect(JSON.parse(readFileSync(path, 'utf8')).item).toBe('article.post-card')
  })

  it('walks the broken field interactively', async () => {
    const path = brokenTap()
    const { log, deps } = depsFor(REDESIGNED, ['1', '1'])

    expect(await runTapHeal(path, {}, deps)).toBe(0)
    expect(JSON.parse(readFileSync(path, 'utf8')).item).toBe('article.tile-block')
    expect(log.out).toContain('broken  Article block')
  })

  it('refuses to write a heal that fails the gate', async () => {
    const path = brokenTap()
    const { log, deps } = depsFor(BARREN)

    expect(await runTapHeal(path, { yes: true }, deps)).toBe(1)
    expect(log.err).toContain('did not pass verification')
    expect(JSON.parse(readFileSync(path, 'utf8')).item).toBe('article.post-card')
  })

  it('prints the diff instead of writing a vendored tap', async () => {
    mkdirSync(join(dir, 'node_modules'))
    const path = brokenTap(join('node_modules', 'tap.json'))
    const { log, deps } = depsFor(REDESIGNED)

    expect(await runTapHeal(path, { yes: true }, deps)).toBe(0)
    expect(log.out).toContain('vendored tap, not writing')
    expect(log.out).toContain('article.tile-block')
    // Untouched on disk, and no .bak litter next to it.
    expect(JSON.parse(readFileSync(path, 'utf8')).item).toBe('article.post-card')
    expect(existsSync(`${path}.bak`)).toBe(false)
  })

  it('needs a path, one tap in it, and a page to heal against', async () => {
    const { log, deps } = depsFor(PAGE)
    expect(await runTapHeal(undefined, {}, deps)).toBe(1)
    expect(log.err).toContain('needs a tap file')

    const empty = join(dir, 'empty.json')
    writeFileSync(empty, '[]')
    expect(await runTapHeal(empty, {}, deps)).toBe(1)
    expect(log.err).toContain('holds no taps')

    const many = join(dir, 'many.json')
    writeFileSync(
      many,
      JSON.stringify([
        { host: 'a.test', item: 'i', title: 't' },
        { host: 'b.test', item: 'i', title: 't' },
      ]),
    )
    expect(await runTapHeal(many, {}, deps)).toBe(1)
    expect(log.err).toContain('heal one tap per file')

    const hostless = join(dir, 'hostless.json')
    writeFileSync(hostless, JSON.stringify({ item: 'i', title: 't' }))
    expect(await runTapHeal(hostless, {}, deps)).toBe(1)
    expect(log.err).toContain('no host and no url hint')
  })
})
