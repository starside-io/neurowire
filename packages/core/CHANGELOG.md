# @neurowire/core

## 0.8.0

- Add the NWF journal (`nwfj`), an append-only sibling of `nwf`: `createJournalEncoder`, `resumeJournalEncoder`, `parseJournal`, `readJournalSince`, `journalHead`, `verifyJournal`, and `journalToFeed`, plus the `JOURNAL_VERSION` / `JOURNAL_MEDIA_TYPE` / `JOURNAL_EXTENSION` constants. Not an output format: `FORMATS` and `serialize()` are unchanged.
- Add the journal query path: `queryJournal` and `journalEntryMatches` reuse `filterEntries` and `selectEntries`, so an archive answers what a live feed answers for the same spec.
- Extract the shared line-format cell grammar (escaping, interning keys, epoch helpers) into `serialize/cells.ts`, used by both `nwf` and `nwfj`. No behavior change to `nwf`.

## 0.7.0

- Add the `rss` output format: `toRss` emits RSS 2.0, registered in `serialize` / `FORMATS` / `MEDIA_TYPES` / `EXTENSIONS`, plus a `toRfc822` date helper.
- Add OPML export: `meshToOpml` and `constructToOpml`.

## 0.1.0

- Initial release: canonical feed model and zod schemas, the `atom` / `json` / `md` / `nwf` serializers with `serialize`, `fromNwf`, `validateNwf`, and `mergeFeeds`.
