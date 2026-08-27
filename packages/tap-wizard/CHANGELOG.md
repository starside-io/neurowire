# @neurowire/tap-wizard

## Unreleased

- Initial release: deterministic tap authoring and healing, with no model in the loop.
- `suggestCandidates(html, seed?)` ranks candidate selectors per tap field from page structure alone, seeding any `proposeTemplate` result as candidate zero.
- `previewTemplate(doc, template)` runs the real engine (`ingestDocument` with an explicit template) so a preview can never disagree with a fetch. With `item` chosen but no `title` yet it reports the raw match count.
- `verifyTemplate(doc, template, options?)` is the gate: a minimum item count, a title on every item, absolute and unique links, an on-host rate, a date-extraction rate when a `date` selector is claimed, and a nav/footer ancestor probe.
- `createTapSession(doc)` / `openTapSession(url)` hold one document for the whole walkthrough: a pick never refetches. `autoComplete(session)` takes every top candidate.
