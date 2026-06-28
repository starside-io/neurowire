import type { Theme } from '../types'

// AI tools and ML platforms. Every source below ships a real RSS/Atom feed
// (verified by fetching the URL), so none need a tap. The opt-in live test
// (NEUROWIRE_LIVE) flags any that later drop their feed.
const aiTools: Theme = {
  key: 'ai-tools',
  title: 'AI Tools & ML Platforms',
  sources: [
    { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
    { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml' },
    { name: 'Together AI Blog', url: 'https://www.together.ai/blog/rss.xml' },
    { name: 'Replicate Blog', url: 'https://replicate.com/blog/rss' },
    { name: 'GitHub Blog', url: 'https://github.blog/feed/' },
    { name: 'JetBrains AI Blog', url: 'https://blog.jetbrains.com/ai/feed/' },
    { name: 'NVIDIA Developer Blog', url: 'https://developer.nvidia.com/blog/feed' },
    {
      name: 'AWS Machine Learning Blog',
      url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    },
    { name: 'Roboflow Blog', url: 'https://blog.roboflow.com/rss/' },
    { name: 'MIT News (AI)', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2' },
    { name: 'Machine Learning Mastery', url: 'https://machinelearningmastery.com/feed/' },
    { name: 'KDnuggets', url: 'https://www.kdnuggets.com/feed' },
  ],
}

export default aiTools
export { aiTools }
