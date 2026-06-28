import { claudeBlog, deepmindBlog, mistralNews } from '@neurowire/taps'
import type { Theme } from '../types'

// Frontier AI labs. The three reused taps (claude.com, deepmind.google,
// mistral.ai) ship no feed and use a verified FeedTemplate. The rest are fetched
// directly; the opt-in live test (NEUROWIRE_LIVE) flags any that need a tap.
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
    { name: 'Mistral AI News', url: 'https://mistral.ai/news', tap: mistralNews },
    { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
    { name: 'Cohere Blog', url: 'https://cohere.com/blog' },
    { name: 'AI2 (Allen Institute) Blog', url: 'https://allenai.org/blog' },
    { name: 'Together AI Blog', url: 'https://www.together.ai/blog' },
    { name: 'Stability AI News', url: 'https://stability.ai/news' },
    { name: 'xAI News', url: 'https://x.ai/news' },
    { name: 'EleutherAI Blog', url: 'https://blog.eleuther.ai/index.xml' },
    { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/' },
    { name: 'Microsoft Research Blog', url: 'https://www.microsoft.com/en-us/research/feed/' },
    { name: 'BAIR Blog', url: 'https://bair.berkeley.edu/blog/feed.xml' },
  ],
}

export default frontierLabs
export { frontierLabs }
