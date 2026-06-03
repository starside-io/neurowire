import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { STYLE, WIRE } from '@neurowire/web'

/**
 * Generate the Neurowire docs page: a single self-contained HTML file that reuses
 * the @neurowire/web theme (STYLE + the wire animation). Output path is the first
 * CLI argument, defaulting to public/index.html.
 *
 *   pnpm docs                      # writes public/index.html
 *   pnpm docs out/docs.html        # writes a custom path
 */

const REPO = 'https://github.com/starside-io/neurowire'
const NPM_ORG = 'https://www.npmjs.com/org/neurowire'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const code = (text: string): string => `<pre><code>${esc(text)}</code></pre>`

// (rail, rail2) accent pairs, matching the feed page palette.
const ACCENTS: ReadonlyArray<readonly [string, string]> = [
  ['#45e6ff', '#2bb6d6'],
  ['#ff5cc8', '#c44fb0'],
  ['#b59bff', '#8d6fe0'],
  ['#5cff9d', '#2bd673'],
  ['#ffd45c', '#d6a52b'],
  ['#ff8f5c', '#d6622b'],
]

interface Pkg {
  name: string
  blurb: string
  run: string
}

const PACKAGES: Pkg[] = [
  {
    name: '@neurowire/core',
    blurb:
      'The format authority: the canonical model and the atom, json, md, and nwf serializers, plus mergeFeeds and validateNwf. No network, no DOM.',
    run: 'npm i @neurowire/core',
  },
  {
    name: '@neurowire/ingest',
    blurb:
      'Fetch, detect, and parse RSS, Atom, RDF, and JSON Feed, plus HTML auto-detect and the CSS-template engine.',
    run: 'npm i @neurowire/ingest',
  },
  {
    name: '@neurowire/taps',
    blurb:
      'Curated per-host templates for sites with no feed (Claude, Cursor, Google DeepMind, Mistral), plus loaders for your own.',
    run: 'npm i @neurowire/taps',
  },
  {
    name: '@neurowire/cli',
    blurb:
      'The neurowire bin: print a feed in the terminal or emit any format, fetch a mesh, validate an nwf document.',
    run: 'npx @neurowire/cli <url>',
  },
  {
    name: '@neurowire/api',
    blurb: 'A self-hostable Hono service that serves feeds and meshes over HTTP.',
    run: 'npx @neurowire/api',
  },
  {
    name: '@neurowire/web',
    blurb:
      'Render a feed or mesh into a self-contained HTML news page. This site is built with it.',
    run: 'npx @neurowire/web --mesh ai-news.json',
  },
]

const FORMATS: ReadonlyArray<readonly [string, string, string]> = [
  ['atom', 'Atom 1.0, the primary output', 'application/atom+xml'],
  ['json', 'JSON Feed 1.1', 'application/feed+json'],
  ['md', 'Markdown digest', 'text/markdown'],
  ['nwf', 'Neurowire Feed, a compact line format', 'compact, round-trippable'],
]

function pkgCard(p: Pkg, i: number): string {
  const [rail, rail2] = ACCENTS[i % ACCENTS.length] as readonly [string, string]
  return `        <article class="card" style="--rail:${rail};--rail2:${rail2}">
          <div class="card-top"><span class="source"><span class="pip" aria-hidden="true"></span>${esc(p.name)}</span></div>
          <p class="summary">${esc(p.blurb)}</p>
          <p class="run"><code>${esc(p.run)}</code></p>
        </article>`
}

function formatCard(f: readonly [string, string, string], i: number): string {
  const [id, label, media] = f
  const [rail, rail2] = ACCENTS[i % ACCENTS.length] as readonly [string, string]
  return `        <article class="card" style="--rail:${rail};--rail2:${rail2}">
          <div class="card-top"><span class="source"><span class="pip" aria-hidden="true"></span>${esc(id)}</span><span class="card-date">${esc(media)}</span></div>
          <p class="summary">${esc(label)}</p>
        </article>`
}

const DOCS_STYLE = `
  .lead { margin: 18px 0 0; font-size: clamp(1.05rem, 2.6vw, 1.32rem); line-height: 1.5; color: var(--ink-soft); max-width: 60ch; }
  .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
  .links a { display: inline-flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink); text-decoration: none; padding: 9px 15px; border-radius: 999px; border: 1px solid var(--line-strong); background: rgba(8, 14, 26, 0.6); transition: color .2s ease, border-color .2s ease, box-shadow .2s ease; }
  .links a:hover, .links a:focus-visible { color: #fff; border-color: var(--cyan); box-shadow: 0 0 22px -7px var(--glow-cyan); }
  .links a.primary { color: #06121b; background: linear-gradient(100deg, var(--cyan), var(--violet)); border-color: transparent; font-weight: 700; }
  .section { margin-top: clamp(44px, 8vw, 72px); }
  .section > h2 { margin: 0 0 8px; font-size: clamp(1.45rem, 4.4vw, 2.05rem); font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(100deg, #ffffff, var(--cyan) 88%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .section > p { margin: 0; color: var(--ink-soft); max-width: 68ch; }
  .section > p + p { margin-top: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(248px, 1fr)); gap: 14px; margin-top: 20px; }
  .card .run { margin: 12px 0 0; }
  .card .run code, pre code { font-family: var(--mono); }
  pre { margin: 16px 0 0; padding: 15px 18px; border-radius: 12px; background: rgba(6, 11, 20, 0.78); border: 1px solid var(--line); overflow-x: auto; font-size: 12.5px; line-height: 1.75; color: var(--ink); }
  :not(pre) > code { font-family: var(--mono); font-size: 0.9em; background: rgba(120, 160, 220, 0.10); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; color: #cfe6ff; }
  a.inline { color: var(--cyan-deep); text-decoration: none; border-bottom: 1px solid rgba(69, 230, 255, 0.3); transition: color .2s ease; }
  a.inline:hover { color: #fff; }
`

const quickStart = `      <section class="section" id="start">
        <h2>Quick start</h2>
        <p>Install a package, or run the CLI with <code>npx</code>. Requires Node 20+.</p>
${code(`# print a feed in your terminal
npx @neurowire/cli https://example.com/blog

# emit Atom (or json, md, nwf)
npx @neurowire/cli https://example.com/feed.xml --format atom > feed.xml

# bundle many sources into one mesh
npx @neurowire/cli --mesh ai-news.json --format atom`)}
      </section>`

const packages = `      <section class="section" id="packages">
        <h2>Packages</h2>
        <p>A pnpm monorepo. The dependency direction is one way: core &lt;- ingest &lt;- taps &lt;- (cli, api, web).</p>
        <div class="grid">
${PACKAGES.map(pkgCard).join('\n')}
        </div>
      </section>`

const formats = `      <section class="section" id="formats">
        <h2>Output formats</h2>
        <p>Every parser produces one canonical model; <code>serialize(feed, format)</code> emits any of these. HTML is deliberately not a core format: it lives in @neurowire/web, which renders this site and the example below.</p>
        <div class="grid">
${FORMATS.map(formatCard).join('\n')}
        </div>
      </section>`

const meshes = `      <section class="section" id="meshes">
        <h2>Meshes</h2>
        <p>A mesh bundles many sources into one named feed. Sources are fetched in parallel, tagged by source, de-duplicated, and sorted newest first.</p>
${code(`{
  "name": "AI News",
  "sources": [
    { "name": "Claude Blog", "url": "https://claude.com/blog" },
    { "name": "OpenAI News", "url": "https://openai.com/news/rss.xml" }
  ]
}`)}
${code('neurowire --mesh ai-news.json --format atom')}
      </section>`

const taps = `      <section class="section" id="taps">
        <h2>Taps</h2>
        <p>A tap teaches Neurowire to read a site that ships no RSS or Atom feed, using a small set of CSS selectors. Bundled taps cover claude.com, cursor.com, deepmind.google, and mistral.ai. Add your own with <code>--taps</code>, the <code>NEUROWIRE_TAPS</code> env var, or by dropping JSON into <code>~/.config/neurowire/taps/</code>.</p>
      </section>`

const api = `      <section class="section" id="api">
        <h2>HTTP API</h2>
        <p>Run <code>@neurowire/api</code> on your own server to expose any feed, or your own named meshes, as an API in Atom, JSON Feed, Markdown, or nwf.</p>
${code(`npx @neurowire/api          # listens on PORT (default 8787)

curl 'http://localhost:8787/feed?url=https%3A%2F%2Fexample.com%2Fblog&format=json'
curl 'http://localhost:8787/mesh?src=ai-news&format=nwf'`)}
      </section>`

const example = `      <section class="section" id="example">
        <h2>Live example</h2>
        <p>The <a class="inline" href="./example/">AI News page</a> is a mesh of Anthropic, OpenAI, Google, Mistral, and the major AI press, rebuilt every day and filtered to the last 24 hours. It is generated by @neurowire/web, the same renderer that themes this page.</p>
        <div class="links"><a class="primary" href="./example/">Open the live example -&gt;</a></div>
      </section>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="description" content="Neurowire turns any blog, website, RSS, or Atom feed into clean Atom, JSON Feed, Markdown, and nwf feeds.">
<title>Neurowire - clean feeds from anything</title>
<style>${STYLE}${DOCS_STYLE}</style>
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <main class="wrap">
    <header class="head">
      <div class="topline">
        <span class="brand"><span class="dot" aria-hidden="true"></span>NEURO<b>WIRE</b></span>
      </div>
      ${WIRE}
      <h1 class="title">Neurowire</h1>
      <p class="lead">Turn any blog, website, RSS, or Atom feed into clean, modern feeds: Atom, JSON Feed 1.1, Markdown, and nwf. Bundle many sources into one mesh, and render it to a self-contained HTML page.</p>
      <div class="links">
        <a class="primary" href="./example/">Live example</a>
        <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="${NPM_ORG}" target="_blank" rel="noopener noreferrer">npm</a>
      </div>
    </header>
${quickStart}
${packages}
${formats}
${meshes}
${taps}
${api}
${example}
    <footer class="foot">
      <span class="gen"><span class="dot" aria-hidden="true"></span>Built with <b>Neurowire</b></span>
      <span>neural feed aggregator</span>
    </footer>
  </main>
</body>
</html>
`

const out = process.argv[2] ?? 'public/index.html'
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
process.stderr.write(`Wrote docs (${html.length} bytes) to ${out}\n`)
