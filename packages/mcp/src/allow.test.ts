import { describe, expect, it } from 'vitest'
import { ToolError, assertAllowed, hostAllowed, parseAllowList } from './allow'

describe('allowlist', () => {
  it('parses a comma or whitespace separated host list, unset meaning no restriction', () => {
    expect(parseAllowList(undefined)).toBeUndefined()
    expect(parseAllowList('  ')).toBeUndefined()
    expect(parseAllowList('Example.com, news.test  other.io')).toEqual([
      'example.com',
      'news.test',
      'other.io',
    ])
  })

  it('allows listed hosts and their subdomains only', () => {
    expect(hostAllowed('anything.test', undefined)).toBe(true)
    expect(hostAllowed('example.com', ['example.com'])).toBe(true)
    expect(hostAllowed('blog.Example.com', ['example.com'])).toBe(true)
    expect(hostAllowed('notexample.com', ['example.com'])).toBe(false)
  })

  it('rejects malformed, non-http, and non-allowed URLs with a ToolError', () => {
    expect(() => assertAllowed('https://blog.example.com/x', ['example.com'])).not.toThrow()
    expect(() => assertAllowed('not a url', undefined)).toThrow(/not a valid absolute URL/)
    expect(() => assertAllowed('file:///etc/passwd', undefined)).toThrow(/http or https/)
    expect(() => assertAllowed('https://evil.test/', ['example.com'])).toThrow(ToolError)
    expect(() => assertAllowed('https://evil.test/', ['example.com'])).toThrow(
      'host "evil.test" is not in NEUROWIRE_MCP_ALLOW (allowed: example.com)',
    )
  })
})
