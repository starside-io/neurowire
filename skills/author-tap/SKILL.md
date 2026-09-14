---
name: author-tap
description: Draft and verify a Neurowire tap (a CSS-selector template) for a site that has no RSS or Atom feed. Use when ingest_source returns nothing useful for a listing page, or the user asks to follow a site without a feed.
---

# Authoring a tap

A tap tells Neurowire how to read a listing page with no feed: which element is
one article, and where its title, link, and date live. You may draft one. You do
not decide whether it is good: the deterministic gate in `verify_tap` does.

## Workflow

1. Check first. `resolve_tap` with the host, or `list_taps`. If a tap exists,
   `ingest_source` already uses it.
2. Call `propose_tap` with the listing page URL. It returns a draft template, the
   number of items it matched, sample titles, and the gate's report.
3. If the draft passes, show the user the template and the sample titles.
4. If it does not pass, read the failed checks in the report, adjust the selectors
   (`item`, `title`, `link`, `date`), and call `verify_tap` with your revision.
   Repeat until it reports `PASSED`.
5. Hand the passing template to the user as JSON. Nothing is installed by these
   tools. The user saves it to `~/.config/neurowire/taps/<host>.json`, or runs
   `neurowire tap wizard <url>` to author it interactively with the same gate.

## Rules

- A `REJECTED` result is final for that template. Do not describe a rejected
  template as working, and do not argue with the gate. Change the selectors.
- The common failures: `item` matches navigation or footer links (pick the
  element that wraps each article card), links are not unique (point `link` at
  the headline anchor), or too few items matched (the selector is too narrow).
- Omit `link` when the `item` element is itself the `<a>`.
