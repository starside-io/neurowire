import { type NeurowireFeed, serialize } from '@neurowire/core'

// Build-time data loader: serialize one representative feed as JSON Feed and as
// NWF and report the byte comparison shown in the hero card. Recomputed on every
// docs build, so the numbers track the real serializers. Mirrors the sample used
// by the live news site (scripts/build-docs.ts).
const sampleFeed: NeurowireFeed = {
  id: 'https://wire.example.com/ai',
  title: 'AI News',
  home: 'https://wire.example.com/ai',
  self: 'https://wire.example.com/ai/feed.atom',
  updated: '2026-06-01T12:00:00.000Z',
  entries: [
    {
      id: 'https://wire.example.com/ai/posts/gemini-omni',
      title: 'Introducing Gemini Omni',
      link: 'https://wire.example.com/ai/posts/gemini-omni',
      published: '2026-06-01T11:40:00.000Z',
      authors: [{ name: 'Google DeepMind' }],
      tags: ['Models', 'Research'],
      source: { name: 'Google DeepMind', url: 'https://deepmind.google' },
    },
    {
      id: 'https://wire.example.com/ai/posts/o-series-update',
      title: 'An update to the o-series',
      link: 'https://wire.example.com/ai/posts/o-series-update',
      published: '2026-06-01T10:15:00.000Z',
      authors: [{ name: 'OpenAI' }],
      tags: ['Models', 'Product'],
      source: { name: 'OpenAI', url: 'https://openai.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/claude-code-2-2',
      title: 'Claude Code 2.2',
      link: 'https://wire.example.com/ai/posts/claude-code-2-2',
      published: '2026-06-01T09:05:00.000Z',
      authors: [{ name: 'Anthropic' }],
      tags: ['Product', 'Release'],
      source: { name: 'Anthropic', url: 'https://anthropic.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/interpretability',
      title: 'Notes on interpretability',
      link: 'https://wire.example.com/ai/posts/interpretability',
      published: '2026-05-31T16:20:00.000Z',
      authors: [{ name: 'Anthropic' }],
      tags: ['Research', 'Safety'],
      source: { name: 'Anthropic', url: 'https://anthropic.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/agents-at-scale',
      title: 'Running agents at scale',
      link: 'https://wire.example.com/ai/posts/agents-at-scale',
      published: '2026-05-31T13:00:00.000Z',
      authors: [{ name: 'OpenAI' }],
      tags: ['Product', 'Research'],
      source: { name: 'OpenAI', url: 'https://openai.com' },
    },
    {
      id: 'https://wire.example.com/ai/posts/open-weights',
      title: 'New open-weight models',
      link: 'https://wire.example.com/ai/posts/open-weights',
      published: '2026-05-30T18:45:00.000Z',
      authors: [{ name: 'Mistral AI' }],
      tags: ['Models', 'Release'],
      source: { name: 'Mistral AI', url: 'https://mistral.ai' },
    },
    {
      id: 'https://wire.example.com/ai/posts/safety-framework',
      title: 'A shared safety framework',
      link: 'https://wire.example.com/ai/posts/safety-framework',
      published: '2026-05-30T12:10:00.000Z',
      authors: [{ name: 'Google DeepMind' }],
      tags: ['Safety', 'Research'],
      source: { name: 'Google DeepMind', url: 'https://deepmind.google' },
    },
    {
      id: 'https://wire.example.com/ai/posts/devday-recap',
      title: 'Dev day recap',
      link: 'https://wire.example.com/ai/posts/devday-recap',
      published: '2026-05-29T20:30:00.000Z',
      authors: [{ name: 'OpenAI' }],
      tags: ['Product'],
      source: { name: 'OpenAI', url: 'https://openai.com' },
    },
  ],
}

export interface NwfStats {
  entries: number
  jsonBytes: number
  nwfBytes: number
  smaller: number
}

declare const data: NwfStats
export { data }

export default {
  load(): NwfStats {
    const bytes = (s: string) => new TextEncoder().encode(s).length
    const jsonBytes = bytes(serialize(sampleFeed, 'json'))
    const nwfBytes = bytes(serialize(sampleFeed, 'nwf'))
    return {
      entries: sampleFeed.entries.length,
      jsonBytes,
      nwfBytes,
      smaller: Math.round((1 - nwfBytes / jsonBytes) * 100),
    }
  },
}
