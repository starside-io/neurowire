import type { Theme } from '../types'

// Cloud platforms and infrastructure. Every source below ships a real RSS/Atom
// feed (verified by fetching the URL), so none need a tap. Vercel publishes its
// changelog feed at /atom. The opt-in live test (NEUROWIRE_LIVE) flags any that
// later drop their feed.
const cloudInfra: Theme = {
  key: 'cloud-infra',
  title: 'Cloud & Infrastructure',
  sources: [
    { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
    { name: 'Google Cloud Blog', url: 'https://cloudblog.withgoogle.com/rss/' },
    { name: 'Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/' },
    { name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/' },
    { name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml' },
    { name: 'CNCF Blog', url: 'https://www.cncf.io/feed/' },
    { name: 'Fly.io Blog', url: 'https://fly.io/blog/feed.xml' },
    { name: 'Vercel Changelog', url: 'https://vercel.com/atom' },
    { name: 'HashiCorp Blog', url: 'https://www.hashicorp.com/blog/feed.xml' },
    { name: 'Grafana Labs Blog', url: 'https://grafana.com/blog/index.xml' },
    { name: 'Tailscale Blog', url: 'https://tailscale.com/blog/index.xml' },
    { name: 'Linode Blog', url: 'https://www.linode.com/blog/feed/' },
    { name: 'Backblaze Blog', url: 'https://www.backblaze.com/blog/feed/' },
  ],
}

export default cloudInfra
export { cloudInfra }
