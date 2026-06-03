import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'

/**
 * Render a feed to a single self-contained HTML page (neon-glass cyberpunk
 * theme). All CSS is inline, no external requests, system fonts only, so it
 * works offline and in CI. Per-source accent colors are assigned from a palette.
 */

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

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

const STYLE = `
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
  html { -webkit-text-size-adjust: 100%; }
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
  }
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
    text-shadow: 0 0 38px rgba(69, 230, 255, 0.12);
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
    background: var(--panel); border: 1px solid var(--line);
    backdrop-filter: blur(13px) saturate(120%); -webkit-backdrop-filter: blur(13px) saturate(120%);
    transition: transform .28s cubic-bezier(.2,.7,.3,1), border-color .28s ease, box-shadow .28s ease;
    overflow: hidden; opacity: 0; transform: translateY(14px);
    animation: rise .6s cubic-bezier(.2,.8,.25,1) forwards; animation-delay: var(--d, 0ms);
  }
  @keyframes rise { to { opacity: 1; transform: none; } }
  .card::before {
    content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 2px; border-radius: 2px;
    background: linear-gradient(180deg, var(--rail, var(--cyan)), var(--rail2, var(--magenta)));
    opacity: 0.55; transition: opacity .28s ease, box-shadow .28s ease;
  }
  .card::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(420px 220px at var(--mx, 30%) -40%, rgba(69, 230, 255, 0.12), transparent 70%);
    opacity: 0; transition: opacity .3s ease;
  }
  .card:hover, .card:focus-within {
    transform: translateY(-3px); border-color: var(--line-strong);
    box-shadow: 0 0 0 1px rgba(69, 230, 255, 0.12), 0 14px 40px -16px rgba(0, 0, 0, 0.7), 0 0 34px -6px var(--rail, var(--glow-cyan));
  }
  .card:hover::before, .card:focus-within::before { opacity: 1; box-shadow: 0 0 12px 0 var(--rail, var(--glow-cyan)); }
  .card:hover::after, .card:focus-within::after { opacity: 1; }
  .card-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 11px; }
  .source {
    display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; font-weight: 600;
    letter-spacing: 0.13em; text-transform: uppercase; color: var(--ink); padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--line-strong); background: rgba(8, 14, 26, 0.6);
  }
  .source .pip { width: 6px; height: 6px; border-radius: 50%; background: var(--rail, var(--cyan)); box-shadow: 0 0 8px 0 var(--rail, var(--glow-cyan)); }
  .card-date { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); margin-left: auto; }
  .card-title { margin: 0 0 9px; font-size: clamp(1.2rem, 3.4vw, 1.45rem); line-height: 1.3; font-weight: 700; letter-spacing: -0.01em; }
  .card-title a {
    color: var(--ink); text-decoration: none;
    background-image: linear-gradient(var(--cyan), var(--cyan)); background-size: 0% 1.5px;
    background-repeat: no-repeat; background-position: 0 100%;
    transition: color .2s ease, background-size .3s ease; border-radius: 2px;
  }
  .card-title a .arr { display: inline-block; margin-left: 3px; font-weight: 500; color: var(--cyan); opacity: 0; transition: opacity .25s ease, transform .25s ease; }
  .card:hover .card-title a, .card-title a:hover, .card-title a:focus-visible { color: #fff; }
  .card-title a:hover, .card-title a:focus-visible { background-size: 100% 1.5px; }
  .card:hover .card-title a .arr, .card-title a:focus-visible .arr { opacity: 1; transform: translate(2px, -2px); }
  a:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; }
  .summary { margin: 0; font-size: 0.98rem; color: var(--ink-soft); max-width: 64ch; }
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
  .foot .gen { display: inline-flex; align-items: center; gap: 9px; }
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

const WIRE = `<svg class="wire" viewBox="0 0 760 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
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
        <span class="brand"><span class="dot" aria-hidden="true"></span>NEURO<b>WIRE</b></span>
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
      <span class="gen"><span class="dot" aria-hidden="true"></span>Generated by <b>Neurowire</b></span>
      <span>neural feed aggregator</span>
    </footer>
  </main>
  <script>${SCRIPT}</script>
</body>
</html>
`
}
