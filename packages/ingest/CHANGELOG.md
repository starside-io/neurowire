# @neurowire/ingest

## 0.10.0

- `FetchOptions.headers` and `FetchFeedOptions.headers`: extra request headers for a fetch. Caller headers override the default `user-agent` and `accept`, but never the conditional `if-none-match` / `if-modified-since` headers, which the cache owns. Headers are not part of the conditional-cache key.
- Credential headers (`authorization`, `proxy-authorization`, `cookie`) are sent only to the origin of the requested URL. A redirect to another origin (host, scheme, or port) drops them, and so does a discovered feed link on another origin, so a token meant for one host never reaches a host the page chose. `requestHeaders` is exported as the per-hop normalizer.
- `fetchMesh` passes each source's own `headers` to its fetch; other sources never see them, and the default partial-failure warning still logs only the name, url, and error.
- `resolveMeshEnv`, `resolveConstructEnv`, `parseMeshFile`, and `parseConstructFile`: header values in mesh files may reference `${ENV_VAR}`, resolved at load time. A referenced variable that is unset or empty throws, naming the mesh, source, header, and variable. `loadMeshFromConfig` resolves through them. These run only on trusted local config, never on a remote caller's input.

## 0.9.0

- Read NWF back: `detectKind` gains an `nwf` kind (matched on `text/x-neurowire` or an `NWF1` first line) and the new `parseNwf` parses a document through `validateNwf`, so a published `.nwf` file is a source like any feed. It works everywhere `fetchFeed` is used: the terminal view, `--format`, `--watch`, `tail`, journals, and mesh and construct members.
- A malformed NWF document now fails with the line number `validate` would print, rather than a generic parse error. A document's own `self` is preserved; one without it records the URL it was fetched from.

## 0.8.1

- Decode HTML entities in titles and summaries. `stripHtml` now decodes numeric (`&#8217;`, `&#x2019;`) and common named entities, which the XML parser leaves raw inside CDATA, and strips markup that arrived encoded. Atom, RSS, RDF, and JSON Feed entry titles now go through `stripHtml`, so `type="html"` titles no longer carry literal tags.

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
