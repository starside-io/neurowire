import { describe, expect, it } from 'vitest'
import { sampleFeed } from '../test-fixtures'
import { toMarkdown } from './markdown'

describe('toMarkdown', () => {
  it('renders a feed heading and linked entries with dates', () => {
    const md = toMarkdown(sampleFeed)
    expect(md).toContain('# Example Blog')
    expect(md).toContain(
      '### [Hello, World & <Friends>](https://blog.example.com/posts/hello-world)',
    )
    expect(md).toContain('2024-03-09')
    expect(md).toContain('`intro`')
  })
})
