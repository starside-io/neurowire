# @neurowire/ingest

## 0.8.0

- Add the poll engine: `pollFeed`, an async generator that loads, dedupes with `entryKey`/`newEntries`, and waits, with a 30 second interval floor, jittered waits, a resumable seen-set, per-tick error isolation, and abort support. `resolvePollInterval` and `nextPollDelay` are exported alongside it. It is the single loop behind the CLI's `tail` and `--watch` and the API's `GET /tail`.
- Add the `nwf-sync/1` pull client: `pullJournal` and `syncPeers` fetch journal deltas from configured peers, verify each response's hash chain before merging it, and append the entries to the local journal store.
- Peer cursors live per `(peer url, journal id)` in `~/.config/neurowire/peers-state.json` (`openPeerState`, `createMemoryPeerState`, `peerStatePath`), and are written only after the append lands, so an interrupted sync costs one re-pull rather than a hole.
- Handle the `410 Gone` too-old-cursor path by re-bootstrapping from `/sync/snapshot`; merges stay idempotent by entry key, so a diamond or a cycle of peers stores one copy.

## 0.7.0

- Add the journal store: `openJournalStore` and `journalConfigDir` persist NWFJ journals as size-capped segments plus a rebuildable `<id>.manifest.json` sidecar, with append-time dedupe, cursor reads (`since`), chain verification, and compaction.
- Journal queries plan against the manifest: segments whose date range or dictionary vocabulary cannot match are skipped without being opened.

## 0.6.0

- Add OPML import: `opmlToMesh` parses an OPML subscription list into a validated mesh.
- Harden fetching: `FetchOptions` (timeout, retries, jittered backoff, caller signal), retry on network/timeout/5xx/429 (honoring `Retry-After`), and source-level failure logging in mesh/construct fetches. Conditional cache and per-hop SSRF guard preserved across retries.

## 0.1.0

- Initial release: `fetchFeed`, `fetchMesh`, and `ingestDocument`, parsers for RSS / Atom / RDF / JSON Feed, HTML auto-detect, and the CSS-template engine plus registry.
