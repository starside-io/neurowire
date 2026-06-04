import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type NeurowireFeed, serialize } from '@neurowire/core'
import { type Tap, taps } from '@neurowire/taps'
import { STYLE, WIRE } from '@neurowire/web'

/**
 * Generate the Neurowire docs: a small multi-page site (Home, Mesh, Taps, Packages)
 * that reuses the @neurowire/web theme (STYLE + the wire animation). The nav also
 * links to the live news example at /example. Output directory is the first CLI
 * argument, defaulting to "public".
 *
 *   pnpm docs                              # writes public/{index,mesh,taps,packages}.html
 *   pnpm exec tsx scripts/build-docs.ts out
 */

const REPO = 'https://github.com/starside-io/neurowire'
const NPM_ORG = 'https://www.npmjs.com/org/neurowire'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const code = (text: string): string => `<pre><code>${esc(text)}</code></pre>`
const fmt = (n: number): string => n.toLocaleString('en-US')

// Tiny, dependency-free syntax highlighting for shell, JSON, and nwf blocks.
const hlShell = (raw: string): string =>
  esc(raw).replace(
    /(#[^\n]*)|(https?:\/\/[^\s'"<]+)|('[^']*'|"[^"]*")|((?:^|\s)--?[A-Za-z][\w-]*)|\b(npx|npm|pnpm|node|neurowire|neurowire-web|neurowire-api|curl)\b/g,
    (m, com, url, str, flag, cmd) => {
      if (com) return `<span class="tok-com">${com}</span>`
      if (url || str) return `<span class="tok-str">${url || str}</span>`
      if (flag) return flag.replace(/(--?[\w-]+)/, '<span class="tok-flag">$1</span>')
      if (cmd) return `<span class="tok-cmd">${cmd}</span>`
      return m
    },
  )
const hlJson = (raw: string): string =>
  esc(raw).replace(
    /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b/g,
    (m, key, colon, str, num, kw) => {
      if (key) return `<span class="tok-key">${key}</span>${colon}`
      if (str) return `<span class="tok-str">${str}</span>`
      if (num) return `<span class="tok-num">${num}</span>`
      if (kw) return `<span class="tok-kw">${kw}</span>`
      return m
    },
  )
const hlNwf = (raw: string): string =>
  esc(raw).replace(/^([A-Za-z][A-Za-z0-9]*)/gm, '<span class="tok-rec">$1</span>')

const codeShell = (text: string): string => `<pre><code>${hlShell(text)}</code></pre>`
const codeJson = (text: string): string => `<pre><code>${hlJson(text)}</code></pre>`
const codeNwf = (text: string): string => `<pre><code>${hlNwf(text)}</code></pre>`

// (rail, rail2) accent pairs, matching the feed page palette.
const ACCENTS: ReadonlyArray<readonly [string, string]> = [
  ['#45e6ff', '#2bb6d6'],
  ['#ff5cc8', '#c44fb0'],
  ['#b59bff', '#8d6fe0'],
  ['#5cff9d', '#2bd673'],
  ['#ffd45c', '#d6a52b'],
  ['#ff8f5c', '#d6622b'],
]

const DOCS_STYLE = `
  :root { --maxw: 1120px; }
  .nav { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
  .nav a { font-family: var(--mono); font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); text-decoration: none; padding: 9px 16px; border-radius: 999px; border: 1px solid transparent; transition: color .2s ease, border-color .2s ease; }
  .nav a:hover, .nav a:focus-visible { color: var(--ink); }
  .nav a.active { color: var(--ink); border-color: color-mix(in srgb, var(--cyan) 45%, transparent); box-shadow: 0 0 8px -2px color-mix(in srgb, var(--cyan) 55%, transparent); }
  .nav a.example { color: #06121b; background: linear-gradient(100deg, var(--cyan), var(--violet)); font-weight: 700; animation: examplepulse 2.6s ease-in-out infinite; }
  .nav a.example:hover { color: #06121b; }
  @media (max-width: 620px) {
    .topline { flex-direction: column; align-items: stretch; }
    .nav { flex-direction: column; align-items: stretch; width: 100%; gap: 8px; }
    .nav a { text-align: center; border-radius: 12px; border: 1px solid var(--line); padding: 12px 16px; }
  }
  @keyframes examplepulse { 0%, 100% { box-shadow: 0 0 11px -3px var(--glow-cyan); } 50% { box-shadow: 0 0 22px -2px var(--glow-cyan); } }
  .lead { margin: 18px 0 0; font-size: clamp(1.05rem, 2.4vw, 1.3rem); line-height: 1.5; color: var(--ink-soft); max-width: 64ch; }
  .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
  .links a { display: inline-flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink); text-decoration: none; padding: 9px 15px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--cyan) 30%, transparent); background: rgba(8, 14, 26, 0.6); transition: color .2s ease, border-color .2s ease, box-shadow .2s ease; }
  .links a:hover, .links a:focus-visible { color: #fff; border-color: var(--cyan); box-shadow: 0 0 18px -5px var(--glow-cyan); }
  .links a.primary { color: #06121b; background: linear-gradient(100deg, var(--cyan), var(--violet)); border-color: transparent; font-weight: 700; }
  .section { margin-top: clamp(40px, 6vw, 64px); }
  .section > h2 { margin: 0 0 8px; font-size: clamp(1.4rem, 3.6vw, 1.95rem); font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(100deg, #ffffff, var(--cyan) 90%); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .section > p { margin: 0; color: var(--ink-soft); max-width: 74ch; }
  .section > p + p { margin-top: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 14px; margin-top: 20px; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr)); gap: 16px; align-items: start; margin-top: 18px; }
  .two > div { min-width: 0; }
  .two h3 { margin: 0 0 8px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); }
  .card .run { margin: 12px 0 0; }
  .stat { display: flex; flex-direction: column; gap: 4px; font-family: var(--mono); }
  .stat .lbl { color: var(--ink-soft); font-size: 13.5px; letter-spacing: 0.01em; }
  .stat .big { font-size: clamp(1.7rem, 5vw, 2.3rem); font-weight: 800; color: var(--rail, var(--cyan)); line-height: 1.05; }
  pre { margin: 0; padding: 15px 18px; border-radius: 12px; background: rgba(6, 11, 20, 0.8); border: 1px solid color-mix(in srgb, var(--cyan) 26%, transparent); box-shadow: 0 0 7px -2px color-mix(in srgb, var(--cyan) 40%, transparent); overflow-x: auto; font-size: 12.5px; line-height: 1.7; color: var(--ink); }
  .section > pre, .card .run + pre { margin-top: 16px; }
  pre code { font-family: var(--mono); }
  .tok-com { color: var(--ink-faint); font-style: italic; }
  .tok-cmd { color: var(--cyan); font-weight: 600; }
  .tok-flag { color: var(--violet); }
  .tok-str { color: #8ee6a8; }
  .tok-num { color: #ffb27a; }
  .tok-key { color: #8fd0ff; }
  .tok-kw { color: var(--magenta); }
  .tok-rec { color: var(--cyan); font-weight: 700; }
  :not(pre) > code { font-family: var(--mono); font-size: 0.9em; background: rgba(120, 160, 220, 0.10); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; color: #cfe6ff; overflow-wrap: anywhere; }
  a.inline { color: var(--cyan-deep); text-decoration: none; border-bottom: 1px solid rgba(69, 230, 255, 0.3); transition: color .2s ease; }
  a.inline:hover { color: #fff; }
  .pkg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .pkg-grid .card { display: flex; flex-direction: column; }
  .pkg-grid .card .run { margin-top: auto; padding-top: 4px; }
  @media (max-width: 620px) { .pkg-grid { grid-template-columns: 1fr; } }
  .taps-explorer { display: grid; grid-template-columns: 232px 1fr; column-gap: 16px; row-gap: 0; margin-top: 20px; align-items: start; }
  .tap-item { grid-column: 1; margin-bottom: 8px; display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; font-family: var(--mono); padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: rgba(8, 14, 26, 0.5); color: var(--ink-soft); transition: border-color .2s ease, box-shadow .2s ease; }
  .tap-item .th { font-size: 13px; color: var(--ink); letter-spacing: 0.02em; }
  .tap-item .ts { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); }
  .tap-item:hover { border-color: var(--line-strong); }
  .tap-item.active { border-color: var(--cyan); box-shadow: 0 0 0 1px color-mix(in srgb, var(--cyan) 50%, transparent), 0 0 11px -3px var(--glow-cyan); }
  .tap-item.active .ts { color: var(--cyan-deep); }
  .tap-detail { grid-column: 2; grid-row: 1 / span 99; min-width: 0; display: none; }
  .tap-detail.active { display: block; animation: fadein .3s ease; }
  @keyframes fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .td-title { margin: 0 0 6px; font-size: 1.1rem; font-weight: 700; color: var(--ink); }
  .td-note { margin: 0 0 14px; max-width: 64ch; color: var(--ink-soft); font-size: 0.95rem; }
  @media (max-width: 620px) { .taps-explorer { grid-template-columns: 1fr; } .tap-detail { grid-column: 1; grid-row: auto; margin-bottom: 8px; } }
`

const SCRIPT = `(function () {
      // Taps explorer: clicking a tap on the left swaps the detail pane on the right.
      document.querySelectorAll('.tap-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-tap');
          document.querySelectorAll('.tap-item').forEach(function (b) {
            var on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', String(on));
          });
          document.querySelectorAll('.tap-detail').forEach(function (d) {
            d.classList.toggle('active', d.getAttribute('data-tap') === id);
          });
        });
      });
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      document.querySelectorAll('.card').forEach(function (card) {
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        });
      });
    })();`

interface PageDef {
  id: string
  label: string
  href: string
}
const PAGES: PageDef[] = [
  { id: 'home', label: 'Home', href: './' },
  { id: 'mesh', label: 'Mesh', href: 'mesh.html' },
  { id: 'taps', label: 'Taps', href: 'taps.html' },
  { id: 'packages', label: 'Packages', href: 'packages.html' },
]

function nav(active: string): string {
  const items = PAGES.map(
    (p) =>
      `<a href="${p.href}"${p.id === active ? ' class="active" aria-current="page"' : ''}>${p.label}</a>`,
  ).join('')
  return `<nav class="nav">${items}<a class="example" href="example/">Example</a></nav>`
}

interface ShellOpts {
  title: string
  description: string
  active: string
  heading: string
  lead: string
  body: string
}

function shell(o: ShellOpts): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="description" content="${esc(o.description)}">
<title>${esc(o.title)}</title>
<style>${STYLE}${DOCS_STYLE}</style>
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <main class="wrap">
    <header class="head">
      <div class="topline">
        <span class="brand"><span class="dot" aria-hidden="true"></span>NEURO<b>WIRE</b></span>
        ${nav(o.active)}
      </div>
      ${WIRE}
      <h1 class="title">${esc(o.heading)}</h1>
      <p class="lead">${o.lead}</p>
    </header>
${o.body}
    <footer class="foot">
      <span class="gen"><span class="dot" aria-hidden="true"></span>Built with <b>Neurowire</b></span>
      <span>neural feed aggregator</span>
    </footer>
  </main>
  <script>${SCRIPT}</script>
</body>
</html>
`
}

// ---- a sample feed, serialized both ways for a real byte comparison ----
const sampleFeed: NeurowireFeed = {
  id: 'https://wire.example.com/ai',
  title: 'AI News',
  home: 'https://wire.example.com/ai',
  self: 'https://wire.example.com/ai/feed.atom',
  updated: '2026-06-01T12:00:00.000Z',
  entries: [
    {
      id: 'https://wire.example.com/ai/posts/gemini-omni',
      title: 'Introducing Gemini Omni',
      link: 'https://wire.example.com/ai/posts/gemini-omni',
      published: '2026-06-01T11:40:00.000Z',
      authors: [{ name: 'Google DeepMind' }],
      tags: ['Models', 'Research'],
      source: { name: 'Google DeepMind', url: 'https://deepmind.google' },
    },
    {
      id: 'https://wire.example.com/ai/posts/o-series-update',
      title: 'An update to the o-series',
      link: 'https://wire.example.com/ai/posts/o-series-update',
      published: '2026-06-01T10:15:00.000Z',
      authors: [{ name: 'OpenAI' }],
      tags: ['Models', 'Product'],
      source: { name: 'OpenAI', url: 'https://openai.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/claude-code-2-2',
      title: 'Claude Code 2.2',
      link: 'https://wire.example.com/ai/posts/claude-code-2-2',
      published: '2026-06-01T09:05:00.000Z',
      authors: [{ name: 'Anthropic' }],
      tags: ['Product', 'Release'],
      source: { name: 'Anthropic', url: 'https://anthropic.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/interpretability',
      title: 'Notes on interpretability',
      link: 'https://wire.example.com/ai/posts/interpretability',
      published: '2026-05-31T16:20:00.000Z',
      authors: [{ name: 'Anthropic' }],
      tags: ['Research', 'Safety'],
      source: { name: 'Anthropic', url: 'https://anthropic.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/agents-at-scale',
      title: 'Running agents at scale',
      link: 'https://wire.example.com/ai/posts/agents-at-scale',
      published: '2026-05-31T13:00:00.000Z',
      authors: [{ name: 'OpenAI' }],
      tags: ['Product', 'Research'],
      source: { name: 'OpenAI', url: 'https://openai.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/open-weights',
      title: 'New open-weight models',
      link: 'https://wire.example.com/ai/posts/open-weights',
      published: '2026-05-30T18:45:00.000Z',
      authors: [{ name: 'Mistral AI' }],
      tags: ['Models', 'Release'],
      source: { name: 'Mistral AI', url: 'https://mistral.ai' },
    },
    {
      id: 'https://wire.example.com/ai/posts/safety-framework',
      title: 'A shared safety framework',
      link: 'https://wire.example.com/ai/posts/safety-framework',
      published: '2026-05-30T12:10:00.000Z',
      authors: [{ name: 'Google DeepMind' }],
      tags: ['Safety', 'Research'],
      source: { name: 'Google DeepMind', url: 'https://deepmind.google' },
    },
    {
      id: 'https://wire.example.com/ai/posts/devday-recap',
      title: 'Dev day recap',
      link: 'https://wire.example.com/ai/posts/devday-recap',
      published: '2026-05-29T20:30:00.000Z',
      authors: [{ name: 'OpenAI' }],
      tags: ['Product'],
      source: { name: 'OpenAI', url: 'https://openai.com' },
    },
  ],
}

const jsonOut = serialize(sampleFeed, 'json')
const nwfOut = serialize(sampleFeed, 'nwf')
const jsonBytes = Buffer.byteLength(jsonOut, 'utf8')
const nwfBytes = Buffer.byteLength(nwfOut, 'utf8')
const smaller = Math.round((1 - nwfBytes / jsonBytes) * 100)
const jsonPretty = JSON.stringify(JSON.parse(jsonOut), null, 2)
const jsonExcerpt = `${jsonPretty.split('\n').slice(0, 22).join('\n')}\n  ...`

// ---------------------------------------------------------------- pages ----

function statCard(label: string, value: string, accent: string): string {
  return `        <article class="card" style="--rail:${accent}"><div class="stat"><span class="lbl">${esc(label)}</span><span class="big">${esc(value)}</span></div></article>`
}

const homeBody = `      <div class="links">
        <a class="primary" href="example/">Live example</a>
        <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="${NPM_ORG}" target="_blank" rel="noopener noreferrer">npm</a>
      </div>
      <section class="section" id="start">
        <h2>Quick start</h2>
        <p>Install a package, or run the CLI with <code>npx</code>. Requires Node 24+.</p>
${codeShell(`# print a feed in your terminal
npx @neurowire/cli https://example.com/blog

# emit Atom (or json, md, nwf)
npx @neurowire/cli https://example.com/feed.xml --format atom > feed.xml

# bundle many sources into one mesh
npx @neurowire/cli --mesh ai-news.json --format atom`)}
      </section>
      <section class="section" id="shape">
        <h2>Shape the output</h2>
        <p>Sort, cap, and date-filter a feed or mesh before it is serialized. <code>--limit</code> keeps payloads small for integrations, and the time-window flags scope a feed to a period without any date math on your side.</p>
${codeShell(`# the 10 newest entries as JSON, ideal for piping into another system
neurowire --mesh ai-news.json --format json --limit 10

# sort by date, title, or source (--order asc|desc to flip)
neurowire https://example.com/feed.xml --sort title --format md

# time windows: --since / --max-age, --today, --this-week, --between
neurowire --mesh ai-news.json --since 24h --format atom
neurowire --mesh ai-news.json --today --limit 20
neurowire --mesh ai-news.json --between 2026-01-01..2026-02-01 --format json`)}
        <p style="margin-top:14px">Windows are evaluated in UTC. Entries without a date are dropped when a window is set, and <code>--limit</code> applies after sorting, so <code>--sort date --limit 10</code> is the ten newest.</p>
      </section>
      <section class="section" id="nwf">
        <h2>The nwf format</h2>
        <p>nwf (Neurowire Feed) is a compact, line-oriented format. It interns authors, tags, and sources into dictionaries referenced by index, stores each link relative to a shared prefix, and stores each date as a delta in seconds before the feed's timestamp. It round-trips back to the canonical model via <code>fromNwf</code>.</p>
        <p>The same ${sampleFeed.entries.length}-entry feed, written as a standard JSON feed and as nwf:</p>
        <div class="grid">
${statCard('Standard JSON feed', `${fmt(jsonBytes)} bytes`, '#5cff9d')}
${statCard('Neurowire nwf', `${fmt(nwfBytes)} bytes`, '#45e6ff')}
${statCard('Smaller', `${smaller}%`, '#ff5cc8')}
        </div>
        <p style="margin-top:14px">Same headlines, less than half the space. A byte is one character of data, so nwf carries this feed in ${fmt(nwfBytes)} characters instead of ${fmt(jsonBytes)}, by storing each repeated author, tag, and source once rather than copying it onto every entry.</p>
        <div class="two">
          <div><h3>As a JSON feed</h3>${codeJson(jsonExcerpt)}</div>
          <div><h3>As nwf</h3>${codeNwf(nwfOut)}</div>
        </div>
      </section>`

const meshBody = `      <section class="section" id="what">
        <h2>What a mesh is</h2>
        <p>A mesh bundles many sources into one named feed. Every source is fetched in parallel, each entry is tagged with its source, and the result is de-duplicated and sorted newest first. Define one as JSON:</p>
${codeJson(`{
  "name": "AI News",
  "sources": [
    { "name": "Claude Code Releases", "url": "https://github.com/anthropics/claude-code/releases.atom" },
    { "name": "Claude Blog", "url": "https://claude.com/blog" },
    { "name": "OpenAI News", "url": "https://openai.com/news/rss.xml" },
    { "name": "Cursor Blog", "url": "https://cursor.com/blog" }
  ]
}`)}
      </section>
      <section class="section" id="use">
        <h2>Use it</h2>
        <p>Render a mesh in any format from the CLI, or serve it from the API. The <code>Mesh</code> type and <code>mergeFeeds</code> live in <code>@neurowire/core</code>; <code>fetchMesh</code> lives in <code>@neurowire/ingest</code>.</p>
${codeShell(`# any format, to stdout or a file
neurowire --mesh ai-news.json --format atom
neurowire --mesh ai-news.json --format nwf --out feed.nwf

# serve a named mesh from the API
curl 'http://localhost:8787/mesh?src=ai-news&format=json'`)}
        <p style="margin-top:16px">The <a class="inline" href="example/">live example</a> is a mesh of Anthropic, OpenAI, Google, Mistral, and the major AI press, rebuilt daily and filtered to the last 24 hours.</p>
      </section>`

const TAP_NOTES: Record<string, string> = {
  'claude.com':
    'A Webflow site with no feed. The publish date and category live in hidden fields that plain auto-detect misses, which is what this tap recovers.',
  'cursor.com':
    'A Next.js site with no feed. Each post is a single link card, so the matched anchor is itself the link (no separate link selector).',
  'deepmind.google':
    'Server-rendered cards. Posts link either to a deepmind.google path or to a cross-posted blog.google URL, and both resolve cleanly.',
  'mistral.ai':
    'A Next.js site with no feed. Scoping the item to article.post-item keeps one entry per post instead of duplicating the featured ones.',
}

const tapItem = (tap: Tap, i: number): string =>
  `<button class="tap-item${i === 0 ? ' active' : ''}" data-tap="${esc(tap.host ?? '')}" role="tab" aria-selected="${i === 0}">
            <span class="th">${esc(tap.host ?? '')}</span>
            <span class="ts">${esc(tap.feedTitle ?? '')}</span>
          </button>`

const tapDetail = (tap: Tap, i: number): string =>
  `<div class="tap-detail${i === 0 ? ' active' : ''}" data-tap="${esc(tap.host ?? '')}" role="tabpanel">
            <h3 class="td-title">${esc(tap.feedTitle ?? tap.host ?? '')}</h3>
            <p class="td-note">${esc(TAP_NOTES[tap.host ?? ''] ?? '')}</p>
            ${codeJson(JSON.stringify(tap, null, 2))}
          </div>`

// Buttons and their detail panes are interleaved as direct grid children. On
// desktop the grid keeps buttons in column 1 and the active detail in column 2;
// on mobile it collapses to one column so each detail renders inline under its
// own button, with no horizontal overflow.
const tapsExplorer = `<div class="taps-explorer" aria-label="Bundled taps">
          ${taps
            .map((tap, i) => `${tapItem(tap, i)}\n          ${tapDetail(tap, i)}`)
            .join('\n          ')}
        </div>`

const tapsBody = `      <section class="section" id="what">
        <h2>What a tap is</h2>
        <p>A tap teaches Neurowire to read a site that ships no RSS or Atom feed, using a small set of CSS selectors over its listing page. Resolution order in <code>ingestDocument</code> is: explicit template, then a discovered feed link, then a registered tap (by host), then heuristic auto-detect.</p>
      </section>
      <section class="section" id="bundled">
        <h2>Bundled taps</h2>
        <p>These ship with <code>@neurowire/taps</code> and register automatically in the CLI, API, and page generator. Pick one to see its selectors:</p>
        ${tapsExplorer}
      </section>
      <section class="section" id="byo">
        <h2>Bring your own</h2>
        <p>Add a tap with <code>--taps</code>, the <code>NEUROWIRE_TAPS</code> env var (a path or list), or by dropping JSON into <code>~/.config/neurowire/taps/</code>. Each file is a validated <code>FeedTemplate</code>:</p>
${codeJson(`{
  "host": "example.com",
  "feedTitle": "Example Blog",
  "item": "article.post",
  "title": "h2",
  "link": "a",
  "date": "time"
}`)}
      </section>`

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

const packagesBody = `      <section class="section" id="grid">
        <h2>Six packages</h2>
        <p>A pnpm monorepo. The dependency direction is one way: core &lt;- ingest &lt;- taps &lt;- (cli, api, web). Installing the CLI pulls core, ingest, and taps automatically.</p>
        <div class="grid pkg-grid">
${PACKAGES.map((p, i) => {
  const [rail] = ACCENTS[i % ACCENTS.length] as readonly [string, string]
  return `        <article class="card" style="--rail:${rail}">
          <div class="card-top"><span class="source"><span class="pip" aria-hidden="true"></span>${esc(p.name)}</span></div>
          <p class="summary">${esc(p.blurb)}</p>
          <p class="run"><code>${esc(p.run)}</code></p>
        </article>`
}).join('\n')}
        </div>
      </section>`

const TAGLINE =
  'Turn any blog, website, RSS, or Atom feed into clean, modern feeds: Atom, JSON Feed 1.1, Markdown, and nwf. Bundle many sources into one mesh, and render it to a self-contained HTML page.'

const docs: ReadonlyArray<{ file: string; html: string }> = [
  {
    file: 'index.html',
    html: shell({
      title: 'Neurowire - clean feeds from anything',
      description:
        'Neurowire turns any blog, website, RSS, or Atom feed into clean Atom, JSON Feed, Markdown, and nwf feeds.',
      active: 'home',
      heading: 'Neurowire',
      lead: esc(TAGLINE),
      body: homeBody,
    }),
  },
  {
    file: 'mesh.html',
    html: shell({
      title: 'Meshes - Neurowire',
      description: 'Bundle many feeds into one named, de-duplicated, newest-first mesh.',
      active: 'mesh',
      heading: 'Meshes',
      lead: 'Bundle many sources into one named feed: fetched in parallel, tagged by source, de-duplicated, newest first.',
      body: meshBody,
    }),
  },
  {
    file: 'taps.html',
    html: shell({
      title: 'Taps - Neurowire',
      description: 'Read sites with no RSS or Atom feed using small CSS-selector templates.',
      active: 'taps',
      heading: 'Taps',
      lead: 'Teach Neurowire to read sites that ship no feed, with a small set of CSS selectors.',
      body: tapsBody,
    }),
  },
  {
    file: 'packages.html',
    html: shell({
      title: 'Packages - Neurowire',
      description: 'The six @neurowire packages and what each one does.',
      active: 'packages',
      heading: 'Packages',
      lead: 'A pnpm monorepo published to npm under the @neurowire scope.',
      body: packagesBody,
    }),
  },
]

const outDir = process.argv[2] ?? 'public'
mkdirSync(outDir, { recursive: true })
for (const { file, html } of docs) {
  writeFileSync(join(outDir, file), html)
}
process.stderr.write(
  `Wrote ${docs.length} docs pages to ${outDir}/ (json ${jsonBytes} B vs nwf ${nwfBytes} B, ${smaller}% smaller)\n`,
)
