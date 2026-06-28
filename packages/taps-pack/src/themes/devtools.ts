import type { Theme } from '../types'

// Developer tools. Every source below ships a real RSS/Atom feed (verified by
// fetching the URL), so none need a tap. The opt-in live test (NEUROWIRE_LIVE)
// flags any that later drop their feed.
const devtools: Theme = {
  key: 'devtools',
  title: 'Developer Tools',
  sources: [
    { name: 'GitHub Blog', url: 'https://github.blog/feed/' },
    { name: 'GitLab Blog', url: 'https://about.gitlab.com/atom.xml' },
    { name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/' },
    { name: 'JetBrains Blog', url: 'https://blog.jetbrains.com/feed/' },
    { name: 'Docker Blog', url: 'https://www.docker.com/blog/feed/' },
    { name: 'HashiCorp Blog', url: 'https://www.hashicorp.com/blog/feed.xml' },
    { name: 'Sentry Blog', url: 'https://blog.sentry.io/feed.xml' },
    { name: 'Postman Blog', url: 'https://blog.postman.com/feed/' },
    { name: 'Percona Database Blog', url: 'https://www.percona.com/blog/feed/' },
    { name: 'AWS DevOps Blog', url: 'https://aws.amazon.com/blogs/devops/feed/' },
    { name: 'Grafana Labs Blog', url: 'https://grafana.com/blog/index.xml' },
    { name: 'Tailscale Blog', url: 'https://tailscale.com/blog/index.xml' },
  ],
}

export default devtools
export { devtools }
