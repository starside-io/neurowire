import { type NeurowireFeed, validateNwf } from '@neurowire/core'
import type { ParseContext } from '../util'

/**
 * Parse an NWF document back into the model. This is the read side of our own
 * format: `toNwf` writes it, the CLI serves it, and a fetch reads it here, so an
 * NWF file published at a URL is a first-class source like any feed.
 *
 * Validation runs first so a malformed document fails with the line number the
 * `validate` command would print, rather than a generic parse error.
 */
export function parseNwf(body: string, ctx: ParseContext): NeurowireFeed {
  const result = validateNwf(body)
  if (!result.valid || !result.feed) {
    const first = result.errors[0]
    const detail = first ? `line ${first.line}: ${first.message}` : 'unknown error'
    const more = result.errors.length > 1 ? ` (+${result.errors.length - 1} more)` : ''
    throw new Error(`Invalid nwf document: ${detail}${more}`)
  }
  // A document is usually served from somewhere other than the `self` it was
  // written with; keep the original when it has one, otherwise record where it
  // was actually fetched from.
  return result.feed.self ? result.feed : { ...result.feed, self: ctx.sourceUrl }
}
