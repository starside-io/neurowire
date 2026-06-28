# @neurowire/core

## 0.7.0

- Add the `rss` output format: `toRss` emits RSS 2.0, registered in `serialize` / `FORMATS` / `MEDIA_TYPES` / `EXTENSIONS`, plus a `toRfc822` date helper.
- Add OPML export: `meshToOpml` and `constructToOpml`.

## 0.1.0

- Initial release: canonical feed model and zod schemas, the `atom` / `json` / `md` / `nwf` serializers with `serialize`, `fromNwf`, `validateNwf`, and `mergeFeeds`.
