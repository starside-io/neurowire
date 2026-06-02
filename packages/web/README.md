# @neurowire/web

Render a [Neurowire](https://github.com/starside-io/neurowire) feed or mesh into a single, self-contained HTML news page: all CSS inline, no external assets, no JS framework. Ideal for a static, scheduled publish (for example to GitHub Pages). This is not a React app.

## Install

```bash
npm install @neurowire/web
# or use the bin without installing
npx @neurowire/web --mesh ai-news.json --out public/index.html
```

## CLI

```bash
neurowire-web --mesh ai-news.json --out public/index.html
neurowire-web <feed-url> --out public/index.html
```

It fetches the feed or mesh (using `@neurowire/ingest` and the bundled taps) and writes a complete HTML page.

## Library

```ts
import { toHtml } from '@neurowire/web'
import { fetchMesh } from '@neurowire/ingest'

const feed = await fetchMesh({
  name: 'AI News',
  sources: [{ name: 'Claude Blog', url: 'https://claude.com/blog' }],
})

const html = toHtml(feed) // self-contained HTML string
```

## Scheduling

Drive the bin from any cron or CI routine to republish on a schedule. The repository ships [`.github/workflows/news.yml`](https://github.com/starside-io/neurowire/blob/main/.github/workflows/news.yml) as one example: it regenerates the page and deploys to GitHub Pages.

## License

Apache-2.0
