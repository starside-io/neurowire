# Epic 5: Tap pack (100 curated taps, conditional import)

## Goal

Taps are the product differentiator: turn feed-less sites into feeds. Today only
**4** ship (`claude`, `cursor`, `deepmind`, `mistral` in
[taps/src/index.ts:17](../../packages/taps/src/index.ts)). Grow the catalog to
~100 important sources, but **without bloating any one bundle**: ship them in a
**new package** organized by theme with **conditional / tree-shakeable import**,
so a consumer pulls only the themes they want.

**Neurowire is general-purpose, not a tech tool.** The shipped example meshes
already span anime, gaming, science, music/film, art/design, culture, and world
news (see `examples/*.mesh.json`). The catalog must reflect that: a **tech
cluster** AND a **general-interest cluster** (space, science, gaming, anime,
movies/TV, music, sports, art/design, culture, world news, books, food, and more
over time). Many general-interest sources already publish RSS, so they ship as
**example meshes** (no tap needed); the catalog still groups them by theme so a
user can pull "gaming" or "space" in one import, and adds **taps** only for the
feed-less ones.

## Why a new package (not more entries in `@neurowire/taps`)

- `@neurowire/taps` stays the small, always-on default (the 4 curated taps the
  CLI/API auto-register). Keep it lean.
- `@neurowire/taps-pack` is the big opt-in catalog. Importing all 100 into every
  CLI invocation is wasteful; a separate package with per-theme entry points lets
  bundlers and users take only what they need.
- Both depend only on `@neurowire/ingest` for the `FeedTemplate` type +
  `registerTemplate`. A tap is just data (a `FeedTemplate` object), so the
  package has **near-zero runtime cost** beyond the objects you import.

## Package design: `@neurowire/taps-pack`

```
packages/taps-pack/
  package.json        # subpath exports, one per theme
  src/
    index.ts          # registerAll() + theme registry (lazy)
    themes/
      # --- tech cluster ---
      frontier-labs.ts
      ai-tools.ts
      cloud-infra.ts
      devtools.ts
      languages.ts
      security.ts
      data.ts
      hardware.ts
      tech-news.ts
      research.ts
      vc-startups.ts
      product-design.ts
      # --- general-interest cluster ---
      space.ts
      science.ts
      gaming.ts
      anime.ts
      movies-tv.ts
      music.ts
      sports.ts
      art-design.ts
      culture.ts
      world-news.ts
      books.ts
      food.ts
    sites/
      <host>.ts       # one FeedTemplate per site (same shape as taps today)
```

### Conditional import (the core requirement)

`package.json` `exports` map exposes **one subpath per theme**, each a separate
module so bundlers tree-shake unused themes:

```jsonc
{
  "name": "@neurowire/taps-pack",
  "exports": {
    ".": "./dist/index.js",
    "./frontier-labs": "./dist/themes/frontier-labs.js",
    "./ai-tools": "./dist/themes/ai-tools.js",
    "./security": "./dist/themes/security.js",
    "./devtools": "./dist/themes/devtools.js"
    // ...one per theme
  }
}
```

Three import styles, all conditional:

```ts
// 1. Static, tree-shakeable: only this theme's objects end up in the bundle.
import { frontierLabs } from '@neurowire/taps-pack/frontier-labs'
for (const tap of frontierLabs) registerTemplate(tap)

// 2. Register a theme by name (node / CLI), lazily dynamic-imported:
import { registerTheme } from '@neurowire/taps-pack'
await registerTheme('security')   // dynamic import('./themes/security.js')

// 3. Everything (explicit opt-in to the full 100):
import { registerAll } from '@neurowire/taps-pack'
await registerAll()
```

`registerTheme(name)` uses `await import()` against a name->loader map, so even
the "by name" path only loads the requested theme's module at runtime.

### CLI integration

Add a flag to the existing CLI (epic-independent, small):

```
--tap-pack <theme[,theme...]>   # register named themes from @neurowire/taps-pack
--tap-pack all                  # register every theme
```

`@neurowire/taps-pack` becomes an optional peer/optional dep of the CLI: if not
installed, `--tap-pack` prints a hint to `pnpm add @neurowire/taps-pack`. This
keeps the base CLI install slim.

## Tap authoring workflow (per site)

Unchanged from today's process (CLAUDE.md "Adding a tap"):

1. `neurowire tap doctor <url>` to propose selectors (uses `proposeTemplate`).
2. Inspect the real page; hand-tune the `FeedTemplate`
   ([shape: template.ts:6](../../packages/ingest/src/html/template.ts)).
3. Add `sites/<host>.ts`, push into the theme array.
4. Offline fixture test + opt-in `*.live.test.ts`.

**Important:** many "important" sources below **already have RSS/Atom** and need
**no tap** (ingest's `discoverFeedLink` finds them). Those belong in **example
meshes**, not taps. Only the feed-less ones need a `FeedTemplate`. The catalog
table marks each `Feed` (use directly in a mesh) or `Tap` (needs a recipe).
**Verify per site at authoring time** (run tap doctor / check for
`<link rel=alternate>`); the marks below are best-effort starting guesses.

## Non-goals

- Authoring all 100 taps in one PR. Land the package + theme scaffolding + the
  top ~20 feed-less taps first, then fill in by theme over follow-ups.
- Taps for sites that already expose RSS/Atom (use them in meshes instead).
- Paywalled sites where the listing page is unreadable without auth.

## Dependencies

- Reuses `FeedTemplate` / `registerTemplate` from `ingest` **unchanged**. No hard
  dep on other epics.
- Adds the most new surface for **Epic 8** (each tap needs a fixture test); keep
  them mechanical. New package should get its own coverage threshold (match
  `taps` at 100%, since taps are pure data + tiny loaders).
- Pairs with **Epic 2** (OPML): a theme can be exported as an OPML/mesh starter.

## Steps

1. Scaffold `packages/taps-pack` (tsup build, per-theme entry points, exports
   map, optional-peer wiring in CLI).
2. Implement `registerAll()` + `registerTheme(name)` (lazy `import()` map) +
   per-theme arrays.
3. Author the first tranche (top feed-less sites from the table), with fixtures.
4. Wire `--tap-pack` into the CLI with the not-installed hint.
5. Build example meshes/constructs from the `Feed` rows (these need no taps).
6. Tests + coverage threshold for the new package.
7. Docs: a catalog page (this table) + README mention.

## Acceptance

- `import '@neurowire/taps-pack/security'` pulls only the security taps (verified
  by a bundle-size / tree-shake check).
- `registerTheme('security')` lazy-loads just that theme at runtime.
- `neurowire --tap-pack frontier-labs <url>` resolves a frontier-lab site.
- First tranche of taps has offline fixture tests; package at its coverage gate.

---

## Appendix A: tech themes (grouped by theme, with priority + feed/tap guess)

Priority: **P0** = launch-critical, **P1** = high, **P2** = nice-to-have.
`Feed` = already has RSS/Atom (put in a mesh, no tap). `Tap` = feed-less, needs a
`FeedTemplate`. Verify per site when authoring.

### Frontier AI labs (`frontier-labs`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 1 | OpenAI News | openai.com/news | P0 | Tap |
| 2 | Anthropic News | anthropic.com/news | P0 | Tap |
| 3 | Google DeepMind | deepmind.google | P0 | Tap (have) |
| 4 | Meta AI Blog | ai.meta.com/blog | P0 | Tap |
| 5 | Mistral News | mistral.ai/news | P0 | Tap (have) |
| 6 | Cohere Blog | cohere.com/blog | P1 | Tap |
| 7 | xAI Blog | x.ai/blog | P1 | Tap |
| 8 | Stability AI News | stability.ai/news | P1 | Tap |
| 9 | AI21 Labs Blog | ai21.com/blog | P2 | Tap |
| 10 | Reka AI | reka.ai | P2 | Tap |
| 11 | Aleph Alpha | aleph-alpha.com | P2 | Tap |
| 12 | Black Forest Labs | blackforestlabs.ai | P2 | Tap |

### AI tools / ML platforms (`ai-tools`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 13 | Cursor Blog | cursor.com/blog | P0 | Tap (have) |
| 14 | Hugging Face Blog | huggingface.co/blog | P0 | Feed |
| 15 | LangChain Blog | blog.langchain.dev | P1 | Feed |
| 16 | LlamaIndex Blog | llamaindex.ai/blog | P1 | Tap |
| 17 | Replicate Blog | replicate.com/blog | P1 | Tap |
| 18 | Together AI Blog | together.ai/blog | P1 | Tap |
| 19 | Modal Blog | modal.com/blog | P2 | Tap |
| 20 | Weights & Biases | wandb.ai | P2 | Feed |
| 21 | Pinecone Blog | pinecone.io/blog | P2 | Tap |
| 22 | Perplexity Hub | perplexity.ai/hub | P1 | Tap |
| 23 | ElevenLabs Blog | elevenlabs.io/blog | P2 | Tap |

### Cloud / infra (`cloud-infra`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 24 | AWS News Blog | aws.amazon.com/blogs/aws | P1 | Feed |
| 25 | Google Cloud Blog | cloud.google.com/blog | P1 | Feed |
| 26 | Azure Updates | azure.microsoft.com/updates | P1 | Feed |
| 27 | Cloudflare Blog | blog.cloudflare.com | P0 | Feed |
| 28 | Vercel Blog | vercel.com/blog | P1 | Tap |
| 29 | Netlify Blog | netlify.com/blog | P2 | Feed |
| 30 | Fly.io Blog | fly.io/blog | P1 | Feed |
| 31 | Railway Blog | blog.railway.app | P2 | Feed |

### Dev tools (`devtools`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 32 | GitHub Blog | github.blog | P0 | Feed |
| 33 | GitLab Blog | about.gitlab.com/blog | P1 | Feed |
| 34 | Stack Overflow Blog | stackoverflow.blog | P1 | Feed |
| 35 | JetBrains Blog | blog.jetbrains.com | P1 | Feed |
| 36 | Docker Blog | docker.com/blog | P1 | Feed |
| 37 | HashiCorp Blog | hashicorp.com/blog | P2 | Feed |
| 38 | Sentry Blog | blog.sentry.io | P2 | Feed |
| 39 | Linear Changelog | linear.app/changelog | P1 | Tap |
| 40 | Raycast Blog | raycast.com/blog | P2 | Tap |
| 41 | Warp Blog | warp.dev/blog | P2 | Tap |
| 42 | Zed Blog | zed.dev/blog | P1 | Tap |

### Languages / frameworks (`languages`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 43 | Rust Blog | blog.rust-lang.org | P1 | Feed |
| 44 | Go Blog | go.dev/blog | P1 | Feed |
| 45 | Python Insider | blog.python.org | P2 | Feed |
| 46 | TypeScript DevBlog | devblogs.microsoft.com/typescript | P1 | Feed |
| 47 | Node.js Blog | nodejs.org/en/blog | P1 | Feed |
| 48 | Deno Blog | deno.com/blog | P1 | Feed |
| 49 | Bun Blog | bun.sh/blog | P1 | Tap |
| 50 | React Blog | react.dev/blog | P1 | Tap |
| 51 | Vue Blog | blog.vuejs.org | P2 | Feed |
| 52 | Svelte Blog | svelte.dev/blog | P2 | Feed |

### Security (`security`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 53 | Krebs on Security | krebsonsecurity.com | P0 | Feed |
| 54 | Schneier on Security | schneier.com | P1 | Feed |
| 55 | Google Project Zero | googleprojectzero.blogspot.com | P1 | Feed |
| 56 | Google Security Blog | security.googleblog.com | P1 | Feed |
| 57 | The Hacker News | thehackernews.com | P1 | Feed |
| 58 | BleepingComputer | bleepingcomputer.com | P1 | Feed |
| 59 | Troy Hunt | troyhunt.com | P2 | Feed |
| 60 | PortSwigger Research | portswigger.net/research | P1 | Tap |
| 61 | CISA Advisories | cisa.gov/news-events/cybersecurity-advisories | P0 | Feed |
| 62 | tl;dr sec | tldrsec.com | P2 | Feed |

### Databases / data (`data`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 63 | PlanetScale Blog | planetscale.com/blog | P2 | Tap |
| 64 | Supabase Blog | supabase.com/blog | P1 | Feed |
| 65 | Neon Blog | neon.tech/blog | P2 | Tap |
| 66 | ClickHouse Blog | clickhouse.com/blog | P2 | Tap |
| 67 | DuckDB News | duckdb.org/news | P1 | Tap |
| 68 | MotherDuck Blog | motherduck.com/blog | P2 | Tap |
| 69 | Databricks Blog | databricks.com/blog | P1 | Feed |
| 70 | dbt Blog | getdbt.com/blog | P2 | Feed |

### Hardware / chips (`hardware`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 71 | NVIDIA Blog | blogs.nvidia.com | P1 | Feed |
| 72 | Apple Newsroom | apple.com/newsroom | P1 | Feed |
| 73 | SemiAnalysis | semianalysis.com | P1 | Feed |
| 74 | Tom's Hardware | tomshardware.com | P2 | Feed |
| 75 | AnandTech archive | anandtech.com | P2 | Feed |
| 76 | Hardware-focused IEEE Spectrum | spectrum.ieee.org | P2 | Feed |

### Tech news / general (`tech-news`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 77 | Hacker News front page | news.ycombinator.com | P0 | Feed |
| 78 | TechCrunch | techcrunch.com | P1 | Feed |
| 79 | The Verge | theverge.com | P1 | Feed |
| 80 | Ars Technica | arstechnica.com | P1 | Feed |
| 81 | Wired | wired.com | P2 | Feed |
| 82 | MIT Technology Review | technologyreview.com | P1 | Feed |
| 83 | Stratechery | stratechery.com | P1 | Feed |
| 84 | Platformer | platformer.news | P2 | Feed |
| 85 | Simon Willison | simonwillison.net | P0 | Feed |
| 86 | TLDR Newsletter | tldr.tech | P2 | Tap |

### AI research / academia (`research`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 87 | arXiv cs.AI | arxiv.org/list/cs.AI/recent | P0 | Feed |
| 88 | arXiv cs.LG | arxiv.org/list/cs.LG/recent | P0 | Feed |
| 89 | Papers with Code | paperswithcode.com | P1 | Tap |
| 90 | BAIR Blog | bair.berkeley.edu/blog | P2 | Feed |
| 91 | Stanford HAI News | hai.stanford.edu/news | P2 | Tap |
| 92 | Sebastian Raschka | magazine.sebastianraschka.com | P1 | Feed |
| 93 | The Gradient | thegradient.pub | P2 | Feed |
| 94 | Import AI (Jack Clark) | jack-clark.net | P1 | Feed |

### VC / startups / business (`vc-startups`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 95 | a16z | a16z.com | P1 | Feed |
| 96 | Y Combinator Blog | ycombinator.com/blog | P1 | Feed |
| 97 | First Round Review | review.firstround.com | P2 | Tap |
| 98 | Lenny's Newsletter | lennysnewsletter.com | P1 | Feed |

### Product / design (`product-design`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 99 | Figma Blog | figma.com/blog | P2 | Tap |
| 100 | Nielsen Norman Group | nngroup.com | P2 | Feed |

## Appendix B: general-interest themes

Neurowire is general-purpose. These themes mirror (and extend) the shipped
`examples/*.mesh.json`. Most sources here already publish RSS (`Feed`, ship as an
example mesh); only the feed-less ones (`Tap`) need a `FeedTemplate`. Verify each
at authoring time.

### Space (`space`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 101 | NASA | nasa.gov/feed | P0 | Feed |
| 102 | SpaceNews | spacenews.com/feed | P1 | Feed |
| 103 | Spaceflight Now | spaceflightnow.com/feed | P1 | Feed |
| 104 | NASASpaceflight | nasaspaceflight.com/feed | P2 | Feed |
| 105 | ESA | esa.int | P1 | Tap |
| 106 | Ars Technica Space | arstechnica.com/science/space | P2 | Feed |

### Science (`science`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 107 | Quanta Magazine | quantamagazine.org/feed | P0 | Feed |
| 108 | Phys.org | phys.org/rss-feed | P1 | Feed |
| 109 | ScienceDaily | sciencedaily.com/rss/all.xml | P1 | Feed |
| 110 | Nature News | nature.com | P1 | Feed |
| 111 | Scientific American | scientificamerican.com | P2 | Feed |
| 112 | New Scientist | newscientist.com | P2 | Tap |
| 113 | Live Science | livescience.com | P2 | Feed |

### Gaming (`gaming`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 114 | IGN | ign.com | P0 | Feed |
| 115 | Rock Paper Shotgun | rockpapershotgun.com/feed | P1 | Feed |
| 116 | Eurogamer | eurogamer.net/feed | P1 | Feed |
| 117 | PC Gamer | pcgamer.com | P1 | Feed |
| 118 | Polygon | polygon.com | P1 | Feed |
| 119 | Kotaku | kotaku.com | P2 | Feed |
| 120 | GameSpot | gamespot.com | P2 | Feed |

### Anime (`anime`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 121 | Anime News Network | animenewsnetwork.com | P0 | Feed |
| 122 | MyAnimeList News | myanimelist.net | P0 | Feed |
| 123 | Crunchyroll News | crunchyroll.com/news | P1 | Tap |
| 124 | Otaku USA | otakuusamagazine.com/feed | P2 | Feed |
| 125 | Anime UK News | animeuknews.net/feed | P2 | Feed |

### Movies / TV (`movies-tv`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 126 | Variety | variety.com/feed | P1 | Feed |
| 127 | The Hollywood Reporter | hollywoodreporter.com/feed | P1 | Feed |
| 128 | Deadline | deadline.com/feed | P1 | Feed |
| 129 | IndieWire | indiewire.com/feed | P2 | Feed |
| 130 | Collider | collider.com/feed | P2 | Feed |
| 131 | /Film | slashfilm.com/feed | P2 | Feed |

### Music (`music`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 132 | Pitchfork | pitchfork.com | P1 | Feed |
| 133 | Stereogum | stereogum.com/feed | P2 | Feed |
| 134 | Consequence | consequence.net/feed | P2 | Feed |
| 135 | Rolling Stone (Music) | rollingstone.com | P2 | Feed |
| 136 | NME | nme.com/feed | P2 | Feed |

### Sports (`sports`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 137 | ESPN | espn.com | P1 | Feed |
| 138 | BBC Sport | feeds.bbci.co.uk/sport | P1 | Feed |
| 139 | Sky Sports | skysports.com | P2 | Feed |
| 140 | The Athletic | theathletic.com | P2 | Tap |

### Art / design (`art-design`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 141 | Colossal | thisiscolossal.com/feed | P1 | Feed |
| 142 | Hyperallergic | hyperallergic.com/feed | P1 | Feed |
| 143 | Designboom | designboom.com/feed | P2 | Feed |
| 144 | It's Nice That | itsnicethat.com | P2 | Feed |
| 145 | Creative Bloq | creativebloq.com | P2 | Feed |

### Culture / ideas (`culture`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 146 | Aeon | aeon.co/feed.rss | P1 | Feed |
| 147 | The Marginalian | themarginalian.org/feed | P1 | Feed |
| 148 | Longreads | longreads.com/feed | P2 | Feed |
| 149 | The Paris Review | theparisreview.org | P2 | Feed |

### World news (`world-news`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 150 | BBC News | feeds.bbci.co.uk/news/rss.xml | P0 | Feed |
| 151 | NPR | feeds.npr.org/1001/rss.xml | P1 | Feed |
| 152 | The Guardian | theguardian.com/world/rss | P1 | Feed |
| 153 | Al Jazeera | aljazeera.com | P2 | Feed |
| 154 | Reuters | reuters.com | P1 | Tap |
| 155 | AP News | apnews.com | P2 | Tap |

### Books (`books`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 156 | Literary Hub | lithub.com/feed | P1 | Feed |
| 157 | The Millions | themillions.com/feed | P2 | Feed |
| 158 | Book Riot | bookriot.com/feed | P2 | Feed |

### Food (`food`)

| # | Site | Host | Pri | Kind |
|---|------|------|-----|------|
| 159 | Serious Eats | seriouseats.com | P1 | Feed |
| 160 | Eater | eater.com/rss/index.xml | P1 | Feed |
| 161 | Bon Appetit | bonappetit.com | P2 | Feed |

More general-interest themes can follow the same pattern (photography, automotive
/ EVs, finance/markets, travel, fashion, comics, podcasts). Add a theme file, fill
its table, ship feed-less sites as taps and RSS sites as example meshes.

### Suggested launch tranche (first PR after scaffolding)

The **P0 feed-less Taps** (highest value, they actually need this package because
no RSS exists): #1 OpenAI, #2 Anthropic, #4 Meta AI, plus carry over the existing
4. Then P1 feed-less taps by theme across both clusters. The P0/P1 **Feed** rows
ship as **example meshes**, not taps, one mesh per theme (the non-tech ones extend
the meshes already in `examples/`).
