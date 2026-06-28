import { claudeBlog, deepmindBlog } from '@neurowire/taps'
import type { Theme } from '../types'

// Frontier AI labs. The two reused taps (claude.com, deepmind.google) ship no
// feed and use a verified FeedTemplate. The rest are real RSS/Atom feeds, fetched
// directly; the opt-in live test (NEUROWIRE_LIVE) validates every source.
const frontierLabs: Theme = {
  key: 'frontier-labs',
  title: 'Frontier AI Labs',
  sources: [
    { name: 'Anthropic (Claude) Blog', url: 'https://claude.com/blog', tap: claudeBlog },
    {
      name: 'Google DeepMind Blog',
      url: 'https://deepmind.google/discover/blog/',
      tap: deepmindBlog,
    },
    { name: 'Google Research Blog', url: 'https://research.google/blog/rss/' },
    { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
    { name: 'Amazon Science Blog', url: 'https://www.amazon.science/index.rss' },
    { name: 'AI2 (Allen Institute) Blog', url: 'https://allenai.org/blog' },
    { name: 'Together AI Blog', url: 'https://www.together.ai/blog' },
    { name: 'Stability AI News', url: 'https://stability.ai/news' },
    { name: 'EleutherAI Blog', url: 'https://blog.eleuther.ai/index.xml' },
    { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/' },
    { name: 'Microsoft Research Blog', url: 'https://www.microsoft.com/en-us/research/feed/' },
    { name: 'BAIR Blog', url: 'https://bair.berkeley.edu/blog/feed.xml' },
  ],
}

export default frontierLabs
export { frontierLabs }
