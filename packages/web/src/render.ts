import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import type { FetchedConstruct } from '@neurowire/ingest'

/**
 * Render a feed to a single self-contained HTML page (neon-glass cyberpunk
 * theme). All CSS is inline, no external requests, system fonts only, so it
 * works offline and in CI. Per-source accent colors are assigned from a palette.
 */

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

// Canonical Neurowire site, linked from the brand header and footer on every page.
const SITE = 'https://starside-io.github.io/neurowire/'

const day = (iso: string | undefined): string => {
  if (!iso) return ''
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
}

// (rail, rail2) accent pairs, cycled per distinct source.
const ACCENTS: ReadonlyArray<readonly [string, string]> = [
  ['#45e6ff', '#2bb6d6'],
  ['#ff5cc8', '#c44fb0'],
  ['#b59bff', '#8d6fe0'],
  ['#5cff9d', '#2bd673'],
  ['#ffd45c', '#d6a52b'],
  ['#ff8f5c', '#d6622b'],
]

export const STYLE = `
  :root {
    --bg: #070b14;
    --bg-2: #0a1120;
    --panel: rgba(18, 27, 46, 0.55);
    --line: rgba(120, 160, 220, 0.14);
    --line-strong: rgba(140, 180, 240, 0.30);
    --ink: #eaf1ff;
    --ink-soft: #aab8d4;
    --ink-faint: #8493b2;
    --cyan: #45e6ff;
    --cyan-deep: #58c7df;
    --magenta: #ff5cc8;
    --violet: #b59bff;
    --glow-cyan: rgba(69, 230, 255, 0.55);
    --glow-magenta: rgba(255, 92, 200, 0.45);
    --radius: 16px;
    --maxw: 780px;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  /* Reserve the scrollbar gutter so content does not shift sideways between
     pages that do and do not need a vertical scrollbar. */
  html { -webkit-text-size-adjust: 100%; scrollbar-gutter: stable; }
  body {
    margin: 0; font-family: var(--sans); color: var(--ink); background: var(--bg);
    line-height: 1.6; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }
  a { color: inherit; }
  ::selection { background: rgba(69, 230, 255, 0.30); color: #fff; }
  body::after {
    content: ""; position: fixed; inset: 0 0 auto 0; height: 2px; z-index: 80; pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--glow-cyan) 14%, var(--cyan) 50%, var(--glow-magenta) 86%, transparent);
    opacity: 0.9;
  }
  .bg {
    position: fixed; inset: 0; z-index: -1;
    background:
      radial-gradient(1100px 620px at 18% -8%, rgba(69, 230, 255, 0.10), transparent 60%),
      radial-gradient(1000px 700px at 92% 4%, rgba(255, 92, 200, 0.10), transparent 62%),
      radial-gradient(900px 900px at 50% 120%, rgba(155, 123, 255, 0.08), transparent 60%),
      linear-gradient(180deg, var(--bg-2), var(--bg) 42%);
  }
  .bg::before {
    content: ""; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(150, 180, 230, 0.16) 1px, transparent 1.4px);
    background-size: 26px 26px; background-position: -13px -13px;
    -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 22%, #000 35%, transparent 88%);
    mask-image: radial-gradient(ellipse 90% 70% at 50% 22%, #000 35%, transparent 88%);
    opacity: 0.5;
  }
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: clamp(30px, 6vw, 76px) clamp(18px, 5vw, 28px) 72px; }
  .head { position: relative; margin-bottom: clamp(30px, 5vw, 50px); }
  .topline { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .brand {
    display: inline-flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12.5px;
    letter-spacing: 0.34em; text-transform: uppercase; color: var(--ink-faint);
    text-decoration: none; transition: color .2s ease;
  }
  .brand:hover { color: var(--cyan-deep); }
  .brand .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 10px 1px var(--glow-cyan); animation: pulse 2.6s ease-in-out infinite; }
  .brand b { color: var(--ink-soft); font-weight: 600; letter-spacing: 0.28em; }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.78); } }
  .wire { display: block; width: 100%; height: 44px; margin: 18px 0 26px; overflow: visible; }
  .wire .track { stroke: var(--line-strong); stroke-width: 1.1; fill: none; }
  .wire .flow { stroke: url(#wireGrad); stroke-width: 2; fill: none; stroke-linecap: round; stroke-dasharray: 10 94; filter: drop-shadow(0 0 5px var(--glow-cyan)); animation: flow 1.9s linear infinite; }
  .wire .node { fill: var(--bg-2); stroke: var(--cyan); stroke-width: 1.5; filter: drop-shadow(0 0 6px var(--glow-cyan)); animation: nodepulse 1.9s ease-in-out infinite; }
  @keyframes flow { to { stroke-dashoffset: -104; } }
  @keyframes nodepulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
  .title {
    margin: 0; font-size: clamp(2.6rem, 9vw, 4.1rem); line-height: 1.0; font-weight: 800; letter-spacing: -0.026em;
    background: linear-gradient(100deg, #ffffff 0%, #cfe6ff 38%, var(--cyan) 80%, var(--magenta) 124%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    text-shadow: 0 0 38px rgba(69, 230, 255, 0.12); overflow-wrap: anywhere;
  }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 18px; font-family: var(--mono); font-size: 12.5px; color: var(--ink-soft); }
  .meta .item { display: inline-flex; align-items: center; gap: 7px; }
  .meta .label { color: var(--ink-faint); }
  .meta time { color: var(--ink); }
  .meta .count { color: var(--cyan); font-weight: 600; }
  .meta .sep { width: 4px; height: 4px; border-radius: 50%; background: var(--line-strong); }
  .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
  .card {
    position: relative; padding: clamp(18px, 4vw, 24px) clamp(18px, 4vw, 26px); border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid color-mix(in srgb, var(--rail, var(--cyan)) 50%, transparent);
    backdrop-filter: blur(13px) saturate(120%); -webkit-backdrop-filter: blur(13px) saturate(120%);
    transition: transform .28s cubic-bezier(.2,.7,.3,1), border-color .28s ease, box-shadow .28s ease;
    opacity: 0; transform: translateY(14px);
    animation: rise .6s cubic-bezier(.2,.8,.25,1) forwards; animation-delay: var(--d, 0ms);
  }
  @keyframes rise { to { opacity: 1; transform: none; } }
  /* A bright segment that travels around the border, like the dots on the wire. */
  @property --bd-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  .card::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.4px; pointer-events: none;
    background: conic-gradient(from var(--bd-angle), transparent 0deg 248deg, var(--rail, var(--cyan)) 300deg, #ffffff 330deg, var(--rail, var(--cyan)) 354deg, transparent 360deg);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    filter: drop-shadow(0 0 4px var(--rail, var(--cyan)));
    animation: bd-travel 4.6s linear infinite;
  }
  @keyframes bd-travel { to { --bd-angle: 360deg; } }
  .card:hover, .card:focus-within {
    transform: translateY(-2px);
    border-color: var(--rail, var(--cyan));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--rail, var(--cyan)) 75%, transparent);
  }
  .card-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 11px; }
  .source {
    display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; font-weight: 600;
    letter-spacing: 0.13em; text-transform: uppercase; color: var(--ink); padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--line-strong); background: rgba(8, 14, 26, 0.6);
  }
  .source .pip { width: 6px; height: 6px; border-radius: 50%; background: var(--rail, var(--cyan)); box-shadow: 0 0 8px 0 var(--rail, var(--glow-cyan)); }
  .card-date { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); margin-left: auto; }
  .card-title { margin: 0 0 9px; font-size: clamp(1.2rem, 3.4vw, 1.45rem); line-height: 1.3; font-weight: 700; letter-spacing: -0.01em; overflow-wrap: anywhere; }
  .card-title a {
    color: var(--ink); text-decoration: none;
    background-image: linear-gradient(var(--rail, var(--cyan)), var(--rail, var(--cyan))); background-size: 0% 1.5px;
    background-repeat: no-repeat; background-position: 0 100%;
    transition: color .2s ease, background-size .3s ease; border-radius: 2px;
  }
  .card-title a .arr { display: inline-block; margin-left: 3px; font-weight: 500; color: var(--rail, var(--cyan)); opacity: 0; transition: opacity .25s ease, transform .25s ease; }
  .card:hover .card-title a, .card-title a:hover, .card-title a:focus-visible { color: #fff; }
  .card-title a:hover, .card-title a:focus-visible { background-size: 100% 1.5px; }
  .card:hover .card-title a .arr, .card-title a:focus-visible .arr { opacity: 1; transform: translate(2px, -2px); }
  a:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
  .summary { margin: 0; font-size: 0.98rem; color: var(--ink-soft); max-width: 64ch; overflow-wrap: anywhere; }
  .tags { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0 0; list-style: none; padding: 0; }
  .tags li {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em; color: var(--ink-soft);
    padding: 3px 9px; border-radius: 6px; border: 1px solid var(--line); background: rgba(120, 160, 220, 0.06);
    transition: color .2s ease, border-color .2s ease;
  }
  .tags li::before { content: "#"; color: var(--cyan-deep); margin-right: 1px; }
  .card:hover .tags li { border-color: var(--line-strong); color: var(--ink); }
  .foot {
    margin-top: 48px; padding-top: 22px; border-top: 1px solid var(--line);
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint);
  }
  .foot .gen { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; transition: color .2s ease; }
  .foot a.gen:hover { color: var(--cyan-deep); }
  .foot .gen .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--magenta); box-shadow: 0 0 9px 0 var(--glow-magenta); }
  .foot b { color: var(--ink-soft); font-weight: 600; }
  @media (max-width: 560px) { .foot { justify-content: flex-start; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .card { opacity: 1; transform: none; }
  }
`

// One trunk that splits into parallel branches and merges back into one,
// mirroring how a mesh fans out to many sources and converges into one feed.
const WIRE_LANES: readonly number[] = [6, 14, 26, 34]
const branchPath = (y: number): string =>
  `M220 20 C 260 20 290 ${y} 320 ${y} H 450 C 480 ${y} 510 20 540 20`
const WIRE_PATHS: readonly string[] = [
  'M0 20 H 220',
  ...WIRE_LANES.map(branchPath),
  'M540 20 H 760',
]

export const WIRE = `<svg class="wire" viewBox="0 0 760 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><linearGradient id="wireGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="760" y2="0">
          <stop offset="0" stop-color="#45e6ff"/>
          <stop offset="0.5" stop-color="#b59bff"/>
          <stop offset="1" stop-color="#ff5cc8"/>
        </linearGradient></defs>
        ${WIRE_PATHS.map((d) => `<path class="track" d="${d}"/>`).join('\n        ')}
        ${WIRE_PATHS.map((d) => `<path class="flow" d="${d}"/>`).join('\n        ')}
        <circle class="node" cx="220" cy="20" r="3.6"/>
        <circle class="node" cx="540" cy="20" r="3.6"/>
      </svg>`

const SCRIPT = `(function () {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      document.querySelectorAll('.card').forEach(function (card) {
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        });
      });
    })();`

function entryHtml(
  entry: NeurowireEntry,
  feedTitle: string,
  index: number,
  accentFor: (name: string) => readonly [string, string],
): string {
  const sourceName = entry.source?.name ?? feedTitle
  const [rail, rail2] = accentFor(sourceName)
  const date = day(entry.published ?? entry.updated)
  const delay = Math.min(index * 70, 700)

  const dateRow = date
    ? `<span class="card-date"><time datetime="${escapeAttr(date)}">${escapeText(date)}</time></span>`
    : ''
  const summary = entry.summary
    ? `\n          <p class="summary">${escapeText(entry.summary)}</p>`
    : ''
  const tags = entry.tags?.length
    ? `\n          <ul class="tags">${entry.tags.map((t) => `<li>${escapeText(t)}</li>`).join('')}</ul>`
    : ''

  return `      <li>
        <article class="card" style="--d: ${delay}ms; --rail: ${rail}; --rail2: ${rail2}">
          <div class="card-top">
            <span class="source"><span class="pip" aria-hidden="true"></span>${escapeText(sourceName)}</span>
            ${dateRow}
          </div>
          <h2 class="card-title">
            <a href="${escapeAttr(entry.link)}" target="_blank" rel="noopener noreferrer">${escapeText(entry.title)}<span class="arr" aria-hidden="true">↗</span></a>
          </h2>${summary}${tags}
        </article>
      </li>`
}

/** Render a feed to a self-contained HTML page. */
export function toHtml(feed: NeurowireFeed): string {
  const sources = new Map<string, number>()
  const accentFor = (name: string): readonly [string, string] => {
    let index = sources.get(name)
    if (index === undefined) {
      index = sources.size
      sources.set(name, index)
    }
    return ACCENTS[index % ACCENTS.length] as readonly [string, string]
  }

  const items = feed.entries
    .map((entry, i) => entryHtml(entry, feed.title, i, accentFor))
    .join('\n')
  const updated = day(feed.updated)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="description" content="${escapeAttr(feed.title)} - a Neurowire feed.">
<title>${escapeText(feed.title)} - Neurowire</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <main class="wrap">
    <header class="head">
      <div class="topline">
        <a class="brand" href="${SITE}" target="_blank" rel="noopener noreferrer"><span class="dot" aria-hidden="true"></span>NEURO<b>WIRE</b></a>
      </div>
      ${WIRE}
      <h1 class="title">${escapeText(feed.title)}</h1>
      <div class="meta">
        <span class="item"><span class="label">updated</span> <time datetime="${escapeAttr(updated)}">${escapeText(updated)}</time></span>
        <span class="sep" aria-hidden="true"></span>
        <span class="item"><span class="count">${feed.entries.length}</span> entries</span>
        <span class="sep" aria-hidden="true"></span>
        <span class="item"><span class="label">sources</span> ${sources.size}</span>
      </div>
    </header>
    <ul class="feed">
${items}
    </ul>
    <footer class="foot">
      <a class="gen" href="${SITE}" target="_blank" rel="noopener noreferrer"><span class="dot" aria-hidden="true"></span>Made with NEURO<b>WIRE</b></a>
      <span>neural feed aggregator</span>
    </footer>
  </main>
  <script>${SCRIPT}</script>
</body>
</html>
`
}

// Extra styles for the construct overview page: each card recaps one mesh and
// links to that mesh's own page, with a short preview of its latest entries.
const CONSTRUCT_STYLE = `
  .mesh-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 2px 0 12px; font-family: var(--mono); font-size: 12px; color: var(--ink-soft); }
  .mesh-meta .count { color: var(--rail, var(--cyan)); font-weight: 600; }
  .mesh-meta .sep { width: 4px; height: 4px; border-radius: 50%; background: var(--line-strong); }
  .recap { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .recap li { display: flex; gap: 9px; font-size: 0.94rem; color: var(--ink-soft); min-width: 0; overflow-wrap: anywhere; }
  .recap li::before { content: "›"; color: var(--rail, var(--cyan)); }
  .recap .empty { color: var(--ink-faint); font-style: italic; }
`

/**
 * A self-contained HTML page produced from a construct. `filename` is relative
 * (e.g. "index.html" or "ai-news.html"); write the set into one directory.
 */
export interface ConstructPage {
  filename: string
  html: string
}

export interface ConstructHtmlOptions {
  /** Given a part and its index, return the href its recap card links to (or undefined for no link). */
  meshHref?: (part: FetchedConstruct['parts'][number], index: number) => string | undefined
}

/** Slugify a mesh name into a filename stem, falling back to its 1-based index. */
export function meshSlug(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `mesh-${index + 1}`
}

function meshCardHtml(
  part: FetchedConstruct['parts'][number],
  index: number,
  href: string | undefined,
): string {
  const { mesh, feed } = part
  const [rail, rail2] = ACCENTS[index % ACCENTS.length] as readonly [string, string]
  const delay = Math.min(index * 70, 700)
  const date = day(feed.updated)
  const entryCount = feed.entries.length
  const sourceCount = mesh.sources.length

  const dateRow = date
    ? `<span class="card-date"><time datetime="${escapeAttr(date)}">${escapeText(date)}</time></span>`
    : ''
  const titleInner = `${escapeText(mesh.name)}<span class="arr" aria-hidden="true">↗</span>`
  const title = href
    ? `<a href="${escapeAttr(href)}">${titleInner}</a>`
    : `<span>${escapeText(mesh.name)}</span>`

  const preview = feed.entries.slice(0, 3)
  const recap = preview.length
    ? preview.map((e) => `<li>${escapeText(e.title)}</li>`).join('\n            ')
    : '<li class="empty">no entries</li>'

  return `      <li>
        <article class="card" style="--d: ${delay}ms; --rail: ${rail}; --rail2: ${rail2}">
          <div class="card-top">
            <span class="source"><span class="pip" aria-hidden="true"></span>mesh</span>
            ${dateRow}
          </div>
          <h2 class="card-title">${title}</h2>
          <div class="mesh-meta">
            <span><span class="count">${entryCount}</span> entries</span>
            <span class="sep" aria-hidden="true"></span>
            <span><span class="count">${sourceCount}</span> sources</span>
          </div>
          <ul class="recap">
            ${recap}
          </ul>
        </article>
      </li>`
}

/**
 * Render a construct's overview page: one recap card per mesh, each linking to
 * that mesh's own feed page. This is the "repo of feeds" landing page.
 */
export function toConstructHtml(
  construct: FetchedConstruct,
  options: ConstructHtmlOptions = {},
): string {
  const totalEntries = construct.parts.reduce((sum, part) => sum + part.feed.entries.length, 0)
  const cards = construct.parts
    .map((part, i) => meshCardHtml(part, i, options.meshHref?.(part, i)))
    .join('\n')
  const updated = day(
    construct.parts
      .map((part) => part.feed.updated)
      .filter(Boolean)
      .sort()
      .at(-1),
  )

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="description" content="${escapeAttr(construct.name)} - a Neurowire construct: ${construct.parts.length} meshes.">
<title>${escapeText(construct.name)} - Neurowire</title>
<style>${STYLE}${CONSTRUCT_STYLE}</style>
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <main class="wrap">
    <header class="head">
      <div class="topline">
        <a class="brand" href="${SITE}" target="_blank" rel="noopener noreferrer"><span class="dot" aria-hidden="true"></span>NEURO<b>WIRE</b></a>
      </div>
      ${WIRE}
      <h1 class="title">${escapeText(construct.name)}</h1>
      <div class="meta">
        <span class="item"><span class="label">updated</span> <time datetime="${escapeAttr(updated)}">${escapeText(updated)}</time></span>
        <span class="sep" aria-hidden="true"></span>
        <span class="item"><span class="count">${construct.parts.length}</span> meshes</span>
        <span class="sep" aria-hidden="true"></span>
        <span class="item"><span class="count">${totalEntries}</span> entries</span>
      </div>
    </header>
    <ul class="feed">
${cards}
    </ul>
    <footer class="foot">
      <a class="gen" href="${SITE}" target="_blank" rel="noopener noreferrer"><span class="dot" aria-hidden="true"></span>Made with NEURO<b>WIRE</b></a>
      <span>neural feed aggregator</span>
    </footer>
  </main>
  <script>${SCRIPT}</script>
</body>
</html>
`
}

/**
 * Render a construct into a full set of pages: an `index.html` overview plus one
 * page per mesh. Write the set into a single directory. Mesh filenames are
 * de-duplicated, so two meshes that slugify the same still get distinct files.
 */
export function toConstructPages(construct: FetchedConstruct): ConstructPage[] {
  const seen = new Map<string, number>()
  const slugs = construct.parts.map((part, i) => {
    let slug = meshSlug(part.mesh.name, i)
    const count = seen.get(slug) ?? 0
    seen.set(slug, count + 1)
    if (count > 0) slug = `${slug}-${count + 1}`
    return slug
  })

  const index: ConstructPage = {
    filename: 'index.html',
    html: toConstructHtml(construct, { meshHref: (_part, i) => `${slugs[i]}.html` }),
  }
  const meshPages = construct.parts.map((part, i) => ({
    filename: `${slugs[i]}.html`,
    html: toHtml(part.feed),
  }))
  return [index, ...meshPages]
}
