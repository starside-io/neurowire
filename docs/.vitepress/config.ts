import { defineConfig } from 'vitepress'

// VitePress config for the Neurowire documentation site.
// srcDir is docs/. The roadmap plans under docs/plans/ are internal, so they are
// excluded from the built site.
export default defineConfig({
  title: 'Neurowire',
  description:
    'Turn any blog, website, RSS, or Atom feed into clean, modern feeds: NWF, Atom, JSON Feed, Markdown, RSS, OPML, and self-contained HTML pages.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['plans/**', '**/README.md'],
  head: [['meta', { name: 'theme-color', content: '#45e6ff' }]],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Concepts', link: '/concepts/model' },
      { text: 'Formats', link: '/formats/atom' },
      { text: 'API Reference', link: '/reference/core' },
      {
        text: 'npm',
        items: [
          { text: '@neurowire/core', link: 'https://www.npmjs.com/package/@neurowire/core' },
          { text: '@neurowire/ingest', link: 'https://www.npmjs.com/package/@neurowire/ingest' },
          { text: '@neurowire/cli', link: 'https://www.npmjs.com/package/@neurowire/cli' },
          { text: '@neurowire/web', link: 'https://www.npmjs.com/package/@neurowire/web' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'CLI', link: '/guide/cli' },
            { text: 'Library', link: '/guide/library' },
            { text: 'HTTP API', link: '/guide/http-api' },
            { text: 'Recipes', link: '/guide/recipes' },
          ],
        },
      ],
      '/concepts/': [
        {
          text: 'Concepts',
          items: [
            { text: 'The model', link: '/concepts/model' },
            { text: 'Output formats', link: '/concepts/output-formats' },
            { text: 'Fetching', link: '/concepts/fetching' },
            { text: 'Taps', link: '/concepts/taps' },
            { text: 'Meshes', link: '/concepts/meshes' },
            { text: 'Constructs', link: '/concepts/constructs' },
            { text: 'Sinks', link: '/concepts/sinks' },
          ],
        },
      ],
      '/formats/': [
        {
          text: 'Formats',
          items: [
            { text: 'NWF', link: '/formats/nwf' },
            { text: 'Atom', link: '/formats/atom' },
            { text: 'JSON Feed', link: '/formats/json-feed' },
            { text: 'Markdown', link: '/formats/markdown' },
            { text: 'RSS 2.0', link: '/formats/rss' },
            { text: 'OPML', link: '/formats/opml' },
            { text: 'HTML page', link: '/formats/html' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'API Reference',
          items: [
            { text: '@neurowire/core', link: '/reference/core' },
            { text: '@neurowire/ingest', link: '/reference/ingest' },
            { text: '@neurowire/taps', link: '/reference/taps' },
            { text: '@neurowire/web', link: '/reference/web' },
            { text: '@neurowire/api', link: '/reference/api' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/starside-io/neurowire' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/starside-io/neurowire/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2025 Neurowire',
    },
  },
})
