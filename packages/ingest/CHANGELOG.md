# @neurowire/ingest

## 0.6.0

- Add OPML import: `opmlToMesh` parses an OPML subscription list into a validated mesh.
- Harden fetching: `FetchOptions` (timeout, retries, jittered backoff, caller signal), retry on network/timeout/5xx/429 (honoring `Retry-After`), and source-level failure logging in mesh/construct fetches. Conditional cache and per-hop SSRF guard preserved across retries.

## 0.1.0

- Initial release: `fetchFeed`, `fetchMesh`, and `ingestDocument`, parsers for RSS / Atom / RDF / JSON Feed, HTML auto-detect, and the CSS-template engine plus registry.
