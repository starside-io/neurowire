# @neurowire/ingest

## 0.7.0

- Add the journal store: `openJournalStore` and `journalConfigDir` persist NWFJ journals as size-capped segments plus a rebuildable `<id>.manifest.json` sidecar, with append-time dedupe, cursor reads (`since`), chain verification, and compaction.
- Journal queries plan against the manifest: segments whose date range or dictionary vocabulary cannot match are skipped without being opened.

## 0.6.0

- Add OPML import: `opmlToMesh` parses an OPML subscription list into a validated mesh.
- Harden fetching: `FetchOptions` (timeout, retries, jittered backoff, caller signal), retry on network/timeout/5xx/429 (honoring `Retry-After`), and source-level failure logging in mesh/construct fetches. Conditional cache and per-hop SSRF guard preserved across retries.

## 0.1.0

- Initial release: `fetchFeed`, `fetchMesh`, and `ingestDocument`, parsers for RSS / Atom / RDF / JSON Feed, HTML auto-detect, and the CSS-template engine plus registry.
