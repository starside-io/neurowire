# Epic 5: Tap pack (curated source catalog, conditional import)

## Goal

Taps are the product differentiator: turn feed-less sites into feeds. Today only
**4** ship (`claude`, `cursor`, `deepmind`, `mistral` in
[taps/src/index.ts:17](../../packages/taps/src/index.ts)). Grow the catalog to
250+ important sources across tech and general-interest themes, but **without bloating any one bundle**: ship them in a
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
- `@neurowire/taps-pack` is the big opt-in catalog. Importing the whole catalog into every
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

// 3. Everything (explicit opt-in to the full catalog):
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

- Authoring every tap in one PR. Land the package + theme scaffolding + the
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

| Site | Host | Pri | Kind |
|------|------|-----|------|
| OpenAI News | openai.com/news | P0 | Tap |
| Anthropic News | anthropic.com/news | P0 | Tap |
| Google DeepMind | deepmind.google | P0 | Tap (have) |
| Meta AI Blog | ai.meta.com/blog | P0 | Tap |
| Mistral News | mistral.ai/news | P0 | Tap (have) |
| Cohere Blog | cohere.com/blog | P1 | Tap |
| xAI Blog | x.ai/blog | P1 | Tap |
| Stability AI News | stability.ai/news | P1 | Tap |
| Microsoft Research Blog | microsoft.com/en-us/research/blog | P1 | Feed |
| AI21 Labs Blog | ai21.com/blog | P2 | Tap |
| Reka AI | reka.ai | P2 | Tap |
| Aleph Alpha | aleph-alpha.com | P2 | Tap |
| Black Forest Labs | blackforestlabs.ai | P2 | Tap |

### AI tools / ML platforms (`ai-tools`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Cursor Blog | cursor.com/blog | P0 | Tap (have) |
| Hugging Face Blog | huggingface.co/blog | P0 | Feed |
| LangChain Blog | blog.langchain.dev | P1 | Feed |
| LlamaIndex Blog | llamaindex.ai/blog | P1 | Tap |
| Replicate Blog | replicate.com/blog | P1 | Tap |
| Together AI Blog | together.ai/blog | P1 | Tap |
| Modal Blog | modal.com/blog | P2 | Tap |
| Weights & Biases | wandb.ai | P2 | Feed |
| Pinecone Blog | pinecone.io/blog | P2 | Tap |
| Perplexity Hub | perplexity.ai/hub | P1 | Tap |
| ElevenLabs Blog | elevenlabs.io/blog | P2 | Tap |
| GitHub Copilot Blog | github.blog/ai-and-ml | P1 | Feed |

### Cloud / infra (`cloud-infra`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| AWS News Blog | aws.amazon.com/blogs/aws | P1 | Feed |
| Google Cloud Blog | cloud.google.com/blog | P1 | Feed |
| Azure Updates | azure.microsoft.com/updates | P1 | Feed |
| Cloudflare Blog | blog.cloudflare.com | P0 | Feed |
| Vercel Blog | vercel.com/blog | P1 | Tap |
| Netlify Blog | netlify.com/blog | P2 | Feed |
| Fly.io Blog | fly.io/blog | P1 | Feed |
| Railway Blog | blog.railway.app | P2 | Feed |
| DigitalOcean Blog | digitalocean.com/blog | P2 | Feed |
| Kubernetes Blog | kubernetes.io/blog | P1 | Feed |
| CNCF Blog | cncf.io/blog | P2 | Feed |
| Render Blog | render.com/blog | P2 | Tap |

### Dev tools (`devtools`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| GitHub Blog | github.blog | P0 | Feed |
| GitLab Blog | about.gitlab.com/blog | P1 | Feed |
| Stack Overflow Blog | stackoverflow.blog | P1 | Feed |
| JetBrains Blog | blog.jetbrains.com | P1 | Feed |
| Docker Blog | docker.com/blog | P1 | Feed |
| HashiCorp Blog | hashicorp.com/blog | P2 | Feed |
| Sentry Blog | blog.sentry.io | P2 | Feed |
| Linear Changelog | linear.app/changelog | P1 | Tap |
| Raycast Blog | raycast.com/blog | P2 | Tap |
| Warp Blog | warp.dev/blog | P2 | Tap |
| Zed Blog | zed.dev/blog | P1 | Tap |
| Postman Blog | blog.postman.com | P2 | Feed |

### Languages / frameworks (`languages`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Rust Blog | blog.rust-lang.org | P1 | Feed |
| Go Blog | go.dev/blog | P1 | Feed |
| Python Insider | blog.python.org | P2 | Feed |
| TypeScript DevBlog | devblogs.microsoft.com/typescript | P1 | Feed |
| Node.js Blog | nodejs.org/en/blog | P1 | Feed |
| Deno Blog | deno.com/blog | P1 | Feed |
| Bun Blog | bun.sh/blog | P1 | Tap |
| React Blog | react.dev/blog | P1 | Tap |
| Vue Blog | blog.vuejs.org | P2 | Feed |
| Svelte Blog | svelte.dev/blog | P2 | Feed |
| Angular Blog | blog.angular.dev | P2 | Feed |
| Kotlin Blog | blog.jetbrains.com/kotlin | P2 | Feed |

### Security (`security`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Krebs on Security | krebsonsecurity.com | P0 | Feed |
| Schneier on Security | schneier.com | P1 | Feed |
| Google Project Zero | googleprojectzero.blogspot.com | P1 | Feed |
| Google Security Blog | security.googleblog.com | P1 | Feed |
| The Hacker News | thehackernews.com | P1 | Feed |
| BleepingComputer | bleepingcomputer.com | P1 | Feed |
| Troy Hunt | troyhunt.com | P2 | Feed |
| PortSwigger Research | portswigger.net/research | P1 | Tap |
| CISA Advisories | cisa.gov/news-events/cybersecurity-advisories | P0 | Feed |
| tl;dr sec | tldrsec.com | P2 | Feed |
| Dark Reading | darkreading.com | P1 | Feed |
| SecurityWeek | securityweek.com | P2 | Feed |

### Databases / data (`data`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| PlanetScale Blog | planetscale.com/blog | P2 | Tap |
| Supabase Blog | supabase.com/blog | P1 | Feed |
| Neon Blog | neon.tech/blog | P2 | Tap |
| ClickHouse Blog | clickhouse.com/blog | P2 | Tap |
| DuckDB News | duckdb.org/news | P1 | Tap |
| MotherDuck Blog | motherduck.com/blog | P2 | Tap |
| Databricks Blog | databricks.com/blog | P1 | Feed |
| dbt Blog | getdbt.com/blog | P2 | Feed |
| Snowflake Blog | snowflake.com/blog | P1 | Feed |
| MongoDB Blog | mongodb.com/blog | P2 | Feed |
| Confluent Blog | confluent.io/blog | P2 | Feed |
| Redis Blog | redis.io/blog | P2 | Feed |
| Elastic Blog | elastic.co/blog | P2 | Feed |

### Hardware / chips (`hardware`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| NVIDIA Blog | blogs.nvidia.com | P1 | Feed |
| Apple Newsroom | apple.com/newsroom | P1 | Feed |
| SemiAnalysis | semianalysis.com | P1 | Feed |
| Tom's Hardware | tomshardware.com | P2 | Feed |
| AnandTech archive | anandtech.com | P2 | Feed |
| IEEE Spectrum | spectrum.ieee.org | P2 | Feed |
| AMD Newsroom | amd.com/en/newsroom | P2 | Tap |
| Intel Newsroom | newsroom.intel.com | P2 | Feed |
| Hackaday | hackaday.com | P1 | Feed |
| Notebookcheck | notebookcheck.net | P2 | Feed |
| The Register Hardware | theregister.com/hardware | P2 | Feed |
| EE Times | eetimes.com | P2 | Feed |

### Tech news / general (`tech-news`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Hacker News front page | news.ycombinator.com | P0 | Feed |
| TechCrunch | techcrunch.com | P1 | Feed |
| The Verge | theverge.com | P1 | Feed |
| Ars Technica | arstechnica.com | P1 | Feed |
| Wired | wired.com | P2 | Feed |
| MIT Technology Review | technologyreview.com | P1 | Feed |
| Stratechery | stratechery.com | P1 | Feed |
| Platformer | platformer.news | P2 | Feed |
| Simon Willison | simonwillison.net | P0 | Feed |
| TLDR Newsletter | tldr.tech | P2 | Tap |
| Engadget | engadget.com | P2 | Feed |
| The Register | theregister.com | P2 | Feed |

### AI research / academia (`research`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| arXiv cs.AI | arxiv.org/list/cs.AI/recent | P0 | Feed |
| arXiv cs.LG | arxiv.org/list/cs.LG/recent | P0 | Feed |
| Papers with Code | paperswithcode.com | P1 | Tap |
| BAIR Blog | bair.berkeley.edu/blog | P2 | Feed |
| Stanford HAI News | hai.stanford.edu/news | P2 | Tap |
| Sebastian Raschka | magazine.sebastianraschka.com | P1 | Feed |
| The Gradient | thegradient.pub | P2 | Feed |
| Import AI (Jack Clark) | jack-clark.net | P1 | Feed |
| MIT CSAIL News | csail.mit.edu/news | P2 | Tap |
| DeepMind Research | deepmind.google/research | P1 | Tap |
| Distill | distill.pub | P2 | Feed |
| Hugging Face Papers | huggingface.co/papers | P1 | Tap |

### VC / startups / business (`vc-startups`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| a16z | a16z.com | P1 | Feed |
| Y Combinator Blog | ycombinator.com/blog | P1 | Feed |
| First Round Review | review.firstround.com | P2 | Tap |
| Lenny's Newsletter | lennysnewsletter.com | P1 | Feed |
| Paul Graham Essays | paulgraham.com | P1 | Tap |
| Both Sides of the Table | bothsidesofthetable.com | P2 | Feed |
| Stratechery Business | stratechery.com | P1 | Feed |
| Sequoia Capital | sequoiacap.com | P2 | Tap |
| SaaStr | saastr.com | P2 | Feed |
| The Information | theinformation.com | P1 | Tap |
| TechCrunch Startups | techcrunch.com/category/startups | P1 | Feed |
| Crunchbase News | news.crunchbase.com | P2 | Feed |

### Product / design (`product-design`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Figma Blog | figma.com/blog | P2 | Tap |
| Nielsen Norman Group | nngroup.com | P2 | Feed |
| Smashing Magazine | smashingmagazine.com | P1 | Feed |
| A List Apart | alistapart.com | P2 | Feed |
| UX Collective | uxdesign.cc | P1 | Feed |
| Intercom Blog | intercom.com/blog | P2 | Feed |
| Lenny's Newsletter | lennysnewsletter.com | P1 | Feed |
| Mind the Product | mindtheproduct.com | P2 | Feed |
| Adobe Design | adobe.design | P2 | Tap |
| Material Design Blog | material.io/blog | P2 | Tap |
| Built for Mars | builtformars.com | P2 | Tap |
| InVision Blog | invisionapp.com/inside-design | P2 | Feed |

## Appendix B: general-interest themes

Neurowire is general-purpose. These themes mirror (and extend) the shipped
`examples/*.mesh.json`. Most sources here already publish RSS (`Feed`, ship as an
example mesh); only the feed-less ones (`Tap`) need a `FeedTemplate`. Verify each
at authoring time.

### Space (`space`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| NASA | nasa.gov/feed | P0 | Feed |
| SpaceNews | spacenews.com/feed | P1 | Feed |
| Spaceflight Now | spaceflightnow.com/feed | P1 | Feed |
| NASASpaceflight | nasaspaceflight.com/feed | P2 | Feed |
| ESA | esa.int | P1 | Tap |
| Ars Technica Space | arstechnica.com/science/space | P2 | Feed |
| Space.com | space.com | P1 | Feed |
| Sky & Telescope | skyandtelescope.org | P2 | Feed |
| The Planetary Society | planetary.org/articles | P2 | Feed |
| Universe Today | universetoday.com | P2 | Feed |
| Astronomy Magazine | astronomy.com | P2 | Feed |
| SpaceX Updates | spacex.com/updates | P1 | Tap |

### Science (`science`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Quanta Magazine | quantamagazine.org/feed | P0 | Feed |
| Phys.org | phys.org/rss-feed | P1 | Feed |
| ScienceDaily | sciencedaily.com/rss/all.xml | P1 | Feed |
| Nature News | nature.com | P1 | Feed |
| Scientific American | scientificamerican.com | P2 | Feed |
| New Scientist | newscientist.com | P2 | Tap |
| Live Science | livescience.com | P2 | Feed |
| Science Magazine News | science.org/news | P1 | Feed |
| Smithsonian Magazine | smithsonianmag.com | P2 | Feed |
| Ars Technica Science | arstechnica.com/science | P2 | Feed |
| The Conversation Science | theconversation.com | P2 | Feed |
| Eos (AGU) | eos.org | P2 | Feed |

### Gaming (`gaming`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| IGN | ign.com | P0 | Feed |
| Rock Paper Shotgun | rockpapershotgun.com/feed | P1 | Feed |
| Eurogamer | eurogamer.net/feed | P1 | Feed |
| PC Gamer | pcgamer.com | P1 | Feed |
| Polygon | polygon.com | P1 | Feed |
| Kotaku | kotaku.com | P2 | Feed |
| GameSpot | gamespot.com | P2 | Feed |
| Game Developer | gamedeveloper.com | P2 | Feed |
| Nintendo Life | nintendolife.com | P2 | Feed |
| VG247 | vg247.com | P2 | Feed |
| Destructoid | destructoid.com | P2 | Feed |
| GamesIndustry.biz | gamesindustry.biz | P2 | Feed |

### Anime (`anime`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Anime News Network | animenewsnetwork.com | P0 | Feed |
| MyAnimeList News | myanimelist.net | P0 | Feed |
| Crunchyroll News | crunchyroll.com/news | P1 | Tap |
| Otaku USA | otakuusamagazine.com/feed | P2 | Feed |
| Anime UK News | animeuknews.net/feed | P2 | Feed |
| Anime Trending | anitrendz.net | P2 | Feed |
| Honey's Anime | honeysanime.com | P2 | Feed |
| Anime Corner | animecorner.me | P1 | Feed |
| Comic Book Resources Anime | cbr.com/category/anime-news | P2 | Feed |
| Siliconera | siliconera.com | P2 | Feed |
| Sakuga Blog | blog.sakugabooru.com | P2 | Feed |

### Movies / TV (`movies-tv`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Variety | variety.com/feed | P1 | Feed |
| The Hollywood Reporter | hollywoodreporter.com/feed | P1 | Feed |
| Deadline | deadline.com/feed | P1 | Feed |
| IndieWire | indiewire.com/feed | P2 | Feed |
| Collider | collider.com/feed | P2 | Feed |
| /Film | slashfilm.com/feed | P2 | Feed |
| Screen Rant | screenrant.com/feed | P2 | Feed |
| Vulture | vulture.com | P2 | Feed |
| The AV Club | avclub.com | P2 | Feed |
| Empire | empireonline.com | P2 | Feed |
| Rolling Stone TV & Movies | rollingstone.com/tv-movies | P2 | Feed |

### Music (`music`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Pitchfork | pitchfork.com | P1 | Feed |
| Stereogum | stereogum.com/feed | P2 | Feed |
| Consequence | consequence.net/feed | P2 | Feed |
| Rolling Stone (Music) | rollingstone.com/music | P2 | Feed |
| NME | nme.com/feed | P2 | Feed |
| Billboard | billboard.com | P1 | Feed |
| Resident Advisor | ra.co | P2 | Tap |
| The Fader | thefader.com | P2 | Feed |
| Brooklyn Vegan | brooklynvegan.com | P2 | Feed |
| Loudwire | loudwire.com | P2 | Feed |
| Spin | spin.com | P2 | Feed |

### Sports (`sports`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| ESPN | espn.com | P1 | Feed |
| BBC Sport | feeds.bbci.co.uk/sport | P1 | Feed |
| Sky Sports | skysports.com | P2 | Feed |
| The Athletic | theathletic.com | P2 | Tap |
| The Guardian Sport | theguardian.com/sport/rss | P1 | Feed |
| CBS Sports | cbssports.com | P2 | Feed |
| Bleacher Report | bleacherreport.com | P2 | Feed |
| Yahoo Sports | sports.yahoo.com | P2 | Feed |
| Sports Illustrated | si.com | P2 | Feed |
| The Ringer | theringer.com | P2 | Feed |
| Goal | goal.com | P2 | Feed |
| Reuters Sports | reuters.com/sports | P2 | Tap |

### Art / design (`art-design`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Colossal | thisiscolossal.com/feed | P1 | Feed |
| Hyperallergic | hyperallergic.com/feed | P1 | Feed |
| Designboom | designboom.com/feed | P2 | Feed |
| It's Nice That | itsnicethat.com | P2 | Feed |
| Creative Bloq | creativebloq.com | P2 | Feed |
| Dezeen | dezeen.com/feed | P1 | Feed |
| Core77 | core77.com | P2 | Feed |
| ArtNet News | news.artnet.com | P2 | Feed |
| Juxtapoz | juxtapoz.com | P2 | Feed |
| Booooooom | booooooom.com | P2 | Feed |
| ArchDaily | archdaily.com | P2 | Feed |
| The Art Newspaper | theartnewspaper.com | P2 | Feed |

### Culture / ideas (`culture`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Aeon | aeon.co/feed.rss | P1 | Feed |
| The Marginalian | themarginalian.org/feed | P1 | Feed |
| Longreads | longreads.com/feed | P2 | Feed |
| The Paris Review | theparisreview.org | P2 | Feed |
| The Atlantic | theatlantic.com | P1 | Feed |
| The New Yorker | newyorker.com | P1 | Feed |
| Nautilus | nautil.us | P2 | Feed |
| The New York Review of Books | nybooks.com | P2 | Feed |
| Vox | vox.com | P2 | Feed |
| The Baffler | thebaffler.com | P2 | Feed |
| Public Books | publicbooks.org | P2 | Feed |
| Noema Magazine | noemamag.com | P2 | Feed |

### World news (`world-news`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| BBC News | feeds.bbci.co.uk/news/rss.xml | P0 | Feed |
| NPR | feeds.npr.org/1001/rss.xml | P1 | Feed |
| The Guardian | theguardian.com/world/rss | P1 | Feed |
| Al Jazeera | aljazeera.com | P2 | Feed |
| Reuters | reuters.com | P1 | Tap |
| AP News | apnews.com | P2 | Tap |
| Deutsche Welle | dw.com | P2 | Feed |
| France 24 | france24.com | P2 | Feed |
| The New York Times World | nytimes.com/section/world | P1 | Feed |
| Politico | politico.com | P2 | Feed |
| CNN World | cnn.com/world | P2 | Feed |
| The Economist | economist.com | P1 | Tap |

### Books (`books`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Literary Hub | lithub.com/feed | P1 | Feed |
| The Millions | themillions.com/feed | P2 | Feed |
| Book Riot | bookriot.com/feed | P2 | Feed |
| Kirkus Reviews | kirkusreviews.com | P1 | Feed |
| The New York Times Books | nytimes.com/section/books | P1 | Feed |
| Publishers Weekly | publishersweekly.com | P2 | Feed |
| The Guardian Books | theguardian.com/books/rss | P1 | Feed |
| Electric Literature | electricliterature.com | P2 | Feed |
| Tor.com | reactormag.com | P2 | Feed |
| The New York Review of Books | nybooks.com | P2 | Feed |
| Los Angeles Review of Books | lareviewofbooks.org | P2 | Feed |

### Food (`food`)

| Site | Host | Pri | Kind |
|------|------|-----|------|
| Serious Eats | seriouseats.com | P1 | Feed |
| Eater | eater.com/rss/index.xml | P1 | Feed |
| Bon Appetit | bonappetit.com | P2 | Feed |
| Smitten Kitchen | smittenkitchen.com/feed | P2 | Feed |
| The Kitchn | thekitchn.com | P2 | Feed |
| Food52 | food52.com | P2 | Feed |
| NYT Cooking | cooking.nytimes.com | P1 | Tap |
| Epicurious | epicurious.com | P2 | Feed |
| Food & Wine | foodandwine.com | P2 | Feed |
| Saveur | saveur.com | P2 | Feed |
| The Guardian Food | theguardian.com/food/rss | P2 | Feed |

More general-interest themes can follow the same pattern (photography, automotive
/ EVs, finance/markets, travel, fashion, comics, podcasts). Add a theme file, fill
its table, ship feed-less sites as taps and RSS sites as example meshes.

### Suggested launch tranche (first PR after scaffolding)

The **P0 feed-less Taps** (highest value, they actually need this package because
no RSS exists): OpenAI News, Anthropic News, Meta AI Blog (all in `frontier-labs`),
plus carry over the existing 4 (`claude`, `cursor`, `deepmind`, `mistral`). Then P1
feed-less taps by theme across both clusters. The P0/P1 **Feed** rows ship as
**example meshes**, not taps, one mesh per theme (the non-tech ones extend the
meshes already in `examples/`).
