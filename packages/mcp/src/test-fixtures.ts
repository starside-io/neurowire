import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import type { RawDocument } from '@neurowire/ingest'
import { type ServerDeps, createServer } from './server'

/** Wrap a saved HTML page from `src/__fixtures__/` as an already-fetched document. */
export function fixtureDoc(name: string, url = 'https://blog.example.com/'): RawDocument {
  const body = readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    'utf8',
  )
  return { url, contentType: 'text/html; charset=utf-8', body }
}

/** A feed of `count` entries, dated one day apart going back from 2026-08-25. */
export function makeFeed(count: number, extra: Partial<NeurowireEntry> = {}): NeurowireFeed {
  const entries: NeurowireEntry[] = Array.from({ length: count }, (_, index) => ({
    id: `urn:e:${index}`,
    title: `Post ${index}`,
    link: `https://blog.example.com/p/${index}`,
    published: new Date(Date.UTC(2026, 7, 25) - index * 86_400_000).toISOString(),
    ...extra,
  }))
  return {
    id: 'https://blog.example.com/',
    title: 'Example Blog',
    updated: '2026-08-25T00:00:00.000Z',
    entries,
  }
}

/** Connect a client to a fresh server over an in-memory transport pair. */
export async function connect(deps: ServerDeps): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const server = createServer(deps)
  await server.connect(serverSide)
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientSide)
  return client
}

/** Call a tool and return its text plus the error flag. */
export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; isError: boolean }> {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as { type: string; text?: string }[]
  return {
    text: content.map((part) => part.text ?? '').join('\n'),
    isError: Boolean(result.isError),
  }
}
