# @neurowire/core

The format authority for [Neurowire](https://github.com/starside-io/neurowire): the canonical feed model, the serializers, and the merge logic. Pure TypeScript, no network and no DOM, with `zod` as the only runtime dependency.

## Install

```bash
npm install @neurowire/core
```

## What it gives you

- **Canonical model** (`NeurowireFeed`, `NeurowireEntry`, `Mesh`) plus the zod schemas (`NeurowireFeedSchema`, `MeshSchema`, ...). Every parser produces this model and every serializer consumes it. It carries list metadata only, not full article bodies.
- **Serializers** for four output formats, dispatched by `serialize(feed, format)`:
  - `atom`: Atom 1.0 (`application/atom+xml`)
  - `json`: JSON Feed 1.1 (`application/feed+json`)
  - `md`: Markdown digest
  - `nwf`: Neurowire Feed, a compact line-oriented format (interned authors, tags and sources, relative links, delta timestamps)
- **nwf round-trip and validation**: `fromNwf` parses it back to the model, and `validateNwf` returns line-numbered diagnostics.
- **Merge**: `mergeFeeds` combines many feeds into one, tagged by source, deduped, newest first.

HTML is deliberately not a core format. It lives in [`@neurowire/web`](https://www.npmjs.com/package/@neurowire/web) so core stays format-pure and dependency-light.

## Usage

```ts
import { serialize, mergeFeeds, validateNwf, type NeurowireFeed } from '@neurowire/core'

const feed: NeurowireFeed = {
  id: 'https://example.com/',
  title: 'Example',
  updated: new Date().toISOString(),
  entries: [{ id: '1', title: 'Hello', link: 'https://example.com/hello' }],
}

const atom = serialize(feed, 'atom')
const nwf = serialize(feed, 'nwf')

const result = validateNwf(nwf)
if (!result.valid) console.error(result.errors)
```

`FORMATS`, `MEDIA_TYPES`, and `EXTENSIONS` enumerate the supported formats and their content types and file extensions.

## License

Apache-2.0
