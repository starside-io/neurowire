import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { RawDocument } from '@neurowire/ingest'

/** Read a saved HTML page from `src/__fixtures__/`. */
export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8')
}

/** Wrap a fixture as an already-fetched document, so nothing in a test touches the network. */
export function fixtureDoc(name: string, url = 'https://blog.example.com/'): RawDocument {
  return { url, contentType: 'text/html; charset=utf-8', body: fixture(name) }
}
