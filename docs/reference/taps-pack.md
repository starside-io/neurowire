# @neurowire/taps-pack

A large, themed catalog of Neurowire sources, organized into a tech cluster and a general-interest cluster. Each theme is a separate entry point, so you import only the themes you want.

`@neurowire/taps-pack` is optional. It depends only on `@neurowire/ingest` for the `FeedTemplate` type and `registerTemplate`. A source is either a real RSS/Atom feed (fetched directly) or a feed-less site that carries a tap (a CSS-selector `FeedTemplate`).

## Install

```bash
pnpm add @neurowire/taps-pack
```

## Usage

Three conditional import styles, each pulling only what you ask for:

```ts
// 1. Static, tree-shakeable: only this theme's data ends up in your bundle.
import gaming from '@neurowire/taps-pack/gaming'
import { themeMesh } from '@neurowire/taps-pack'
const mesh = themeMesh(gaming) // { name, sources: [{ name, url }] }

// 2. Register a theme's taps by name (lazy dynamic import), then fetch as usual:
import { registerTheme } from '@neurowire/taps-pack'
await registerTheme('frontier-labs')

// 3. Everything (opt in to the full catalog):
import { registerAll } from '@neurowire/taps-pack'
await registerAll()
```

From the CLI, register themes with [`--tap-pack`](/guide/cli):

```bash
neurowire --tap-pack gaming https://www.pcgamer.com/rss/ -f json
neurowire --tap-pack all --mesh my.json
```

## Exports

| Export | Description |
|--------|-------------|
| `THEME_KEYS` | Array of every theme key. |
| `THEME_LOADERS` | Map of theme key to a lazy `() => import()` loader. |
| `loadTheme(key)` | Load one theme (dynamic import). |
| `loadAllThemes()` | Load every theme. |
| `registerTheme(key)` | Register a theme's taps with the ingest registry. |
| `registerAll()` | Register every theme's taps. |
| `themeMesh(theme)` | Build a `Mesh` (`{ name, sources }`) from a theme. |

Each theme also has a subpath export: `@neurowire/taps-pack/<key>` (default export is the `Theme`).

## Catalog

| Theme | Key | Sources |
|-------|-----|--------:|
| Frontier AI Labs | `frontier-labs` | 12 |
| AI Tools & ML Platforms | `ai-tools` | 12 |
| Cloud & Infrastructure | `cloud-infra` | 13 |
| Developer Tools | `devtools` | 12 |
| Languages & Frameworks | `languages` | 13 |
| Security | `security` | 12 |
| Databases & Data | `data` | 12 |
| Hardware & Chips | `hardware` | 11 |
| Tech News | `tech-news` | 11 |
| AI Research & Academia | `research` | 12 |
| VC & Startups | `vc-startups` | 12 |
| Product & Design | `product-design` | 12 |
| Space | `space` | 12 |
| Science | `science` | 11 |
| Gaming | `gaming` | 10 |
| Anime | `anime` | 10 |
| Movies & TV | `movies-tv` | 11 |
| Music | `music` | 10 |
| Sports | `sports` | 10 |
| Art & Design | `art-design` | 11 |
| Culture & Ideas | `culture` | 11 |
| World News | `world-news` | 10 |
| Books | `books` | 10 |
| Food | `food` | 11 |
| **Total** | **24 themes** | **271** |

### Frontier AI Labs (`frontier-labs`)

- Anthropic (Claude) Blog *(tap)*: <https://claude.com/blog>
- Google DeepMind Blog *(tap)*: <https://deepmind.google/discover/blog/>
- Google Research Blog: <https://research.google/blog/rss/>
- Hugging Face Blog: <https://huggingface.co/blog/feed.xml>
- Amazon Science Blog: <https://www.amazon.science/index.rss>
- AI2 (Allen Institute) Blog: <https://allenai.org/blog>
- Together AI Blog: <https://www.together.ai/blog>
- Stability AI News: <https://stability.ai/news>
- EleutherAI Blog: <https://blog.eleuther.ai/index.xml>
- Google AI Blog: <https://blog.google/technology/ai/rss/>
- Microsoft Research Blog: <https://www.microsoft.com/en-us/research/feed/>
- BAIR Blog: <https://bair.berkeley.edu/blog/feed.xml>

### AI Tools & ML Platforms (`ai-tools`)

- Hugging Face Blog: <https://huggingface.co/blog/feed.xml>
- OpenAI News: <https://openai.com/news/rss.xml>
- Together AI Blog: <https://www.together.ai/blog/rss.xml>
- Replicate Blog: <https://replicate.com/blog/rss>
- GitHub Blog: <https://github.blog/feed/>
- JetBrains AI Blog: <https://blog.jetbrains.com/ai/feed/>
- NVIDIA Developer Blog: <https://developer.nvidia.com/blog/feed>
- AWS Machine Learning Blog: <https://aws.amazon.com/blogs/machine-learning/feed/>
- Roboflow Blog: <https://blog.roboflow.com/rss/>
- MIT News (AI): <https://news.mit.edu/rss/topic/artificial-intelligence2>
- Machine Learning Mastery: <https://machinelearningmastery.com/feed/>
- KDnuggets: <https://www.kdnuggets.com/feed>

### Cloud & Infrastructure (`cloud-infra`)

- AWS News Blog: <https://aws.amazon.com/blogs/aws/feed/>
- Google Cloud Blog: <https://cloudblog.withgoogle.com/rss/>
- Azure Blog: <https://azure.microsoft.com/en-us/blog/feed/>
- Cloudflare Blog: <https://blog.cloudflare.com/rss/>
- Kubernetes Blog: <https://kubernetes.io/feed.xml>
- CNCF Blog: <https://www.cncf.io/feed/>
- Fly.io Blog: <https://fly.io/blog/feed.xml>
- Vercel Changelog: <https://vercel.com/atom>
- HashiCorp Blog: <https://www.hashicorp.com/blog/feed.xml>
- Grafana Labs Blog: <https://grafana.com/blog/index.xml>
- Tailscale Blog: <https://tailscale.com/blog/index.xml>
- Linode Blog: <https://www.linode.com/blog/feed/>
- Backblaze Blog: <https://www.backblaze.com/blog/feed/>

### Developer Tools (`devtools`)

- GitHub Blog: <https://github.blog/feed/>
- GitLab Blog: <https://about.gitlab.com/atom.xml>
- Stack Overflow Blog: <https://stackoverflow.blog/feed/>
- JetBrains Blog: <https://blog.jetbrains.com/feed/>
- Docker Blog: <https://www.docker.com/blog/feed/>
- HashiCorp Blog: <https://www.hashicorp.com/blog/feed.xml>
- Sentry Blog: <https://blog.sentry.io/feed.xml>
- Postman Blog: <https://blog.postman.com/feed/>
- Percona Database Blog: <https://www.percona.com/blog/feed/>
- AWS DevOps Blog: <https://aws.amazon.com/blogs/devops/feed/>
- Grafana Labs Blog: <https://grafana.com/blog/index.xml>
- Tailscale Blog: <https://tailscale.com/blog/index.xml>

### Languages & Frameworks (`languages`)

- Rust Blog: <https://blog.rust-lang.org/feed.xml>
- Go Blog: <https://go.dev/blog/feed.atom>
- Python Insider: <https://blog.python.org/feeds/posts/default>
- TypeScript DevBlog: <https://devblogs.microsoft.com/typescript/feed/>
- Node.js Blog: <https://nodejs.org/en/feed/blog.xml>
- Deno Blog: <https://deno.com/feed>
- React Blog: <https://react.dev/rss.xml>
- Vue.js Blog: <https://blog.vuejs.org/feed.rss>
- Svelte Blog: <https://svelte.dev/blog/rss.xml>
- Angular Blog: <https://blog.angular.dev/feed>
- Kotlin Blog: <https://blog.jetbrains.com/kotlin/feed/>
- PHP News: <https://www.php.net/feed.atom>
- Ruby News: <https://www.ruby-lang.org/en/feeds/news.rss>

### Security (`security`)

- Krebs on Security: <https://krebsonsecurity.com/feed/>
- Schneier on Security: <https://www.schneier.com/feed/atom/>
- Google Project Zero: <https://googleprojectzero.blogspot.com/feeds/posts/default>
- Google Security Blog: <https://security.googleblog.com/feeds/posts/default>
- The Hacker News: <https://feeds.feedburner.com/TheHackersNews>
- BleepingComputer: <https://www.bleepingcomputer.com/feed/>
- Troy Hunt: <https://feeds.feedburner.com/troyhunt>
- PortSwigger Research: <https://portswigger.net/research/rss>
- CISA Advisories: <https://www.cisa.gov/cybersecurity-advisories/all.xml>
- tl;dr sec: <https://tldrsec.com/feed.xml>
- Dark Reading: <https://www.darkreading.com/rss.xml>
- SecurityWeek: <https://www.securityweek.com/feed/>

### Databases & Data (`data`)

- PlanetScale Blog: <https://planetscale.com/blog/rss.xml>
- Supabase Blog: <https://supabase.com/rss.xml>
- Neon Blog: <https://neon.tech/blog/rss.xml>
- DuckDB News: <https://duckdb.org/feed.xml>
- Databricks Blog: <https://www.databricks.com/feed>
- dbt Blog: <https://www.getdbt.com/blog/atom.xml>
- Snowflake Blog: <https://www.snowflake.com/feed/>
- MongoDB Blog: <https://www.mongodb.com/blog/rss>
- Confluent Blog: <https://www.confluent.io/feed/>
- Redis Blog: <https://redis.io/blog/feed/>
- Elastic Blog: <https://www.elastic.co/blog/feed>
- Timescale Blog: <https://www.timescale.com/blog/rss/>

### Hardware & Chips (`hardware`)

- NVIDIA Blog: <https://blogs.nvidia.com/feed/>
- Apple Newsroom: <https://www.apple.com/newsroom/rss-feed.rss>
- SemiAnalysis: <https://semianalysis.com/feed/>
- Tom's Hardware: <https://www.tomshardware.com/feeds/all>
- IEEE Spectrum: <https://spectrum.ieee.org/feeds/feed.rss>
- Hackaday: <https://hackaday.com/feed/>
- Intel Newsroom: <https://newsroom.intel.com/feed>
- The Register Hardware: <https://www.theregister.com/headlines.atom>
- EE Times: <https://www.eetimes.com/feed/>
- ServeTheHome: <https://www.servethehome.com/feed/>
- Electronics Weekly: <https://www.electronicsweekly.com/feed/>

### Tech News (`tech-news`)

- Hacker News front page: <https://news.ycombinator.com/rss>
- TechCrunch: <https://techcrunch.com/feed/>
- The Verge: <https://www.theverge.com/rss/index.xml>
- Ars Technica: <https://feeds.arstechnica.com/arstechnica/index>
- Wired: <https://www.wired.com/feed/rss>
- MIT Technology Review: <https://www.technologyreview.com/feed/>
- Stratechery: <https://stratechery.com/feed/>
- Platformer: <https://www.platformer.news/rss/>
- Simon Willison: <https://simonwillison.net/atom/everything/>
- Engadget: <https://www.engadget.com/rss.xml>
- The Register: <https://www.theregister.com/headlines.atom>

### AI Research & Academia (`research`)

- arXiv cs.AI (Artificial Intelligence): <http://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending>
- arXiv cs.LG (Machine Learning): <http://export.arxiv.org/api/query?search_query=cat:cs.LG&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending>
- BAIR Blog (Berkeley AI Research): <https://bair.berkeley.edu/blog/feed.xml>
- The Gradient: <https://thegradient.pub/rss/>
- Import AI (Jack Clark): <https://importai.substack.com/feed>
- Distill: <https://distill.pub/rss.xml>
- MIT News (AI): <https://news.mit.edu/rss/topic/artificial-intelligence2>
- Google DeepMind Blog: <https://deepmind.google/blog/rss.xml>
- Google Research Blog: <https://blog.research.google/feeds/posts/default>
- Sebastian Raschka (Ahead of AI): <https://magazine.sebastianraschka.com/feed>
- Lilian Weng's Blog: <https://lilianweng.github.io/index.xml>
- Papers with Code: <https://paperswithcode.com/latest>

### VC & Startups (`vc-startups`)

- Y Combinator Blog: <https://www.ycombinator.com/blog/rss>
- First Round Review: <https://review.firstround.com/articles/rss>
- Lenny's Newsletter: <https://www.lennysnewsletter.com/feed>
- Stratechery (Ben Thompson): <https://stratechery.com/feed/>
- Sequoia Capital: <https://www.sequoiacap.com/feed/>
- SaaStr: <https://www.saastr.com/feed/>
- Tomasz Tunguz: <https://tomtunguz.com/index.xml>
- Andrew Chen: <https://andrewchen.com/feed/>
- Sam Altman: <https://blog.samaltman.com/posts.atom>
- Not Boring (Packy McCormick): <https://www.notboring.co/feed>
- Will Larson (Irrational Exuberance): <https://lethain.com/feeds/>
- Eli Dourado: <https://www.elidourado.com/feed>

### Product & Design (`product-design`)

- Figma Blog: <https://www.figma.com/blog/feed/atom.xml>
- Nielsen Norman Group: <https://www.nngroup.com/feed/rss/>
- Smashing Magazine: <https://www.smashingmagazine.com/feed/>
- A List Apart: <https://alistapart.com/main/feed/>
- UX Collective: <https://uxdesign.cc/feed>
- Intercom Blog: <https://www.intercom.com/blog/feed/>
- Lenny's Newsletter: <https://www.lennysnewsletter.com/feed>
- Julie Zhuo (The Looking Glass): <https://medium.com/feed/@joulee>
- UX Planet: <https://uxplanet.org/feed>
- UX Movement: <https://feeds.feedburner.com/uxmovement>
- Figma Design (Medium): <https://medium.com/feed/figma-design>
- Stratechery (Ben Thompson): <https://stratechery.com/feed/>

### Space (`space`)

- NASA: <https://www.nasa.gov/feed/>
- Phys.org Space News: <https://phys.org/rss-feed/space-news/>
- SpaceNews: <https://spacenews.com/feed/>
- Spaceflight Now: <https://spaceflightnow.com/feed/>
- Space.com: <https://www.space.com/feeds/all>
- Universe Today: <https://www.universetoday.com/feed/>
- Astronomy Magazine: <https://www.astronomy.com/feed/>
- The Planetary Society: <https://www.planetary.org/rss/articles>
- ESA Space News: <https://www.esa.int/rssfeed/Our_Activities/Space_News>
- ESA Space Science: <https://www.esa.int/rssfeed/Our_Activities/Space_Science>
- Ars Technica Space: <https://arstechnica.com/science/space/feed/>
- ScienceDaily Space & Time: <https://www.sciencedaily.com/rss/space_time.xml>

### Science (`science`)

- Quanta Magazine: <https://www.quantamagazine.org/feed/>
- Phys.org: <https://phys.org/rss-feed/>
- ScienceDaily: <https://www.sciencedaily.com/rss/all.xml>
- Nature News: <https://www.nature.com/nature.rss>
- Scientific American: <https://www.scientificamerican.com/platform/syndication/rss/>
- New Scientist: <https://www.newscientist.com/feed/home/>
- Live Science: <https://www.livescience.com/feeds/all>
- Science Magazine News: <https://www.science.org/rss/news_current.xml>
- Smithsonian Magazine: <https://www.smithsonianmag.com/rss/latest_articles/>
- The Conversation: <https://theconversation.com/us/technology/articles.atom>
- Eos (AGU): <https://eos.org/feed>

### Gaming (`gaming`)

- IGN: <https://www.ign.com/rss/articles/feed>
- Rock Paper Shotgun: <https://www.rockpapershotgun.com/feed>
- Eurogamer: <https://www.eurogamer.net/feed>
- PC Gamer: <https://www.pcgamer.com/rss/>
- Polygon: <https://www.polygon.com/rss/index.xml>
- GameSpot: <https://www.gamespot.com/feeds/news/>
- Game Developer: <https://www.gamedeveloper.com/rss.xml>
- Nintendo Life: <https://www.nintendolife.com/feeds/latest>
- VG247: <https://www.vg247.com/feed>
- GamesIndustry.biz: <https://www.gamesindustry.biz/feed>

### Anime (`anime`)

- ComicBook Anime: <https://comicbook.com/anime/news/feed/>
- MyAnimeList News: <https://myanimelist.net/rss/news.xml>
- Crunchyroll Anime: <https://www.crunchyroll.com/rss/anime>
- Otaku USA: <https://otakuusamagazine.com/feed/>
- Anime UK News: <https://animeuknews.net/feed/>
- Honey's Anime: <https://honeysanime.com/feed/>
- Anime Corner: <https://www.animecorner.me/feed/>
- CBR Anime: <https://www.cbr.com/feed/category/anime/>
- Siliconera: <https://www.siliconera.com/feed/>
- Sakuga Blog: <https://blog.sakugabooru.com/feed/>

### Movies & TV (`movies-tv`)

- Variety: <https://variety.com/feed/>
- The Hollywood Reporter: <https://www.hollywoodreporter.com/feed/>
- Deadline: <https://deadline.com/feed/>
- IndieWire: <https://www.indiewire.com/feed/>
- Collider: <https://collider.com/feed/>
- /Film: <https://www.slashfilm.com/feed/>
- Screen Rant: <https://screenrant.com/feed/>
- The Wrap: <https://www.thewrap.com/feed/>
- The AV Club: <https://www.avclub.com/rss>
- Den of Geek: <https://www.denofgeek.com/feed/>
- Rolling Stone TV & Movies: <https://www.rollingstone.com/tv-movies/feed/>

### Music (`music`)

- Pitchfork: <https://pitchfork.com/feed/feed-news/rss>
- Stereogum: <https://www.stereogum.com/feed/>
- Rolling Stone Music: <https://www.rollingstone.com/music/feed/>
- NME: <https://www.nme.com/feed>
- Billboard: <https://www.billboard.com/feed/>
- Brooklyn Vegan: <https://www.brooklynvegan.com/feed/>
- Loudwire: <https://loudwire.com/feed/>
- Spin: <https://www.spin.com/feed/>
- The Fader: <https://www.thefader.com/feed>
- Consequence: <https://consequence.net/feed/>

### Sports (`sports`)

- ESPN: <https://www.espn.com/espn/rss/news>
- BBC Sport: <https://feeds.bbci.co.uk/sport/rss.xml>
- Sky Sports: <https://www.skysports.com/rss/12040>
- CBS Sports: <https://www.cbssports.com/rss/headlines/>
- Yahoo Sports: <https://sports.yahoo.com/rss/>
- SB Nation: <https://www.sbnation.com/rss/index.xml>
- The Guardian Sport: <https://www.theguardian.com/sport/rss>
- ESPN NFL: <https://www.espn.com/espn/rss/nfl/news>
- Deadspin: <https://deadspin.com/rss>
- Defector: <https://defector.com/feed>

### Art & Design (`art-design`)

- Colossal: <https://www.thisiscolossal.com/feed/>
- Hyperallergic: <https://hyperallergic.com/feed/>
- Designboom: <https://www.designboom.com/feed/>
- It's Nice That: <https://feeds.feedburner.com/itsnicethat>
- Creative Bloq: <https://www.creativebloq.com/feeds/all>
- Dezeen: <https://www.dezeen.com/feed/>
- Core77: <https://www.core77.com/feed>
- Artnet News: <https://news.artnet.com/feed>
- Juxtapoz: <https://www.juxtapoz.com/feed/>
- ArchDaily: <https://www.archdaily.com/rss/>
- The Art Newspaper: <https://www.theartnewspaper.com/rss.xml>

### Culture & Ideas (`culture`)

- Aeon: <https://aeon.co/feed.rss>
- The Marginalian: <https://www.themarginalian.org/feed/>
- Longreads: <https://longreads.com/feed/>
- The Paris Review: <https://www.theparisreview.org/blog/feed/>
- The Atlantic: <https://www.theatlantic.com/feed/all/>
- The New Yorker: <https://www.newyorker.com/feed/everything>
- Nautilus: <https://nautil.us/feed/>
- Open Culture: <https://www.openculture.com/feed>
- Vox: <https://www.vox.com/rss/index.xml>
- Public Books: <https://www.publicbooks.org/feed/>
- Noema Magazine: <https://www.noemamag.com/feed/>

### World News (`world-news`)

- BBC News: <https://feeds.bbci.co.uk/news/world/rss.xml>
- NPR: <https://feeds.npr.org/1001/rss.xml>
- The Guardian: <https://www.theguardian.com/world/rss>
- Al Jazeera: <https://www.aljazeera.com/xml/rss/all.xml>
- Deutsche Welle: <https://rss.dw.com/xml/rss-en-world>
- France 24: <https://www.france24.com/en/rss>
- The New York Times World: <https://rss.nytimes.com/services/xml/rss/nyt/World.xml>
- Politico: <https://rss.politico.com/politics-news.xml>
- CNN World: <http://rss.cnn.com/rss/edition_world.rss>
- NPR World: <https://feeds.npr.org/1004/rss.xml>

### Books (`books`)

- Literary Hub: <https://lithub.com/feed/>
- Book Riot: <https://bookriot.com/feed/>
- The New York Times Books: <https://rss.nytimes.com/services/xml/rss/nyt/Books.xml>
- The Guardian Books: <https://www.theguardian.com/books/rss>
- Electric Literature: <https://electricliterature.com/feed/>
- The Paris Review: <https://www.theparisreview.org/blog/feed/>
- Reactor (Tor.com): <https://reactormag.com/feed/>
- Open Culture: <https://www.openculture.com/feed>
- The Marginalian: <https://www.themarginalian.org/feed/>
- Aeon: <https://aeon.co/feed.rss>

### Food (`food`)

- Eater: <https://www.eater.com/rss/index.xml>
- Bon Appetit: <https://www.bonappetit.com/feed/rss>
- Smitten Kitchen: <https://smittenkitchen.com/feed/>
- The Kitchn: <https://www.thekitchn.com/main.rss>
- Epicurious: <https://www.epicurious.com/feed/rss>
- Saveur: <https://www.saveur.com/feed/>
- The Guardian Food: <https://www.theguardian.com/food/rss>
- David Lebovitz: <https://www.davidlebovitz.com/feed/>
- 101 Cookbooks: <https://101cookbooks.com/feed>
- Minimalist Baker: <https://minimalistbaker.com/feed/>
- Budget Bytes: <https://www.budgetbytes.com/feed/>

