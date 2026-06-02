import type { NeurowireFeed } from '../model'
import { toAtom } from './atom'
import { toJsonFeed } from './jsonfeed'
import { toMarkdown } from './markdown'
import { toNwf } from './nwf'

/** Supported output formats. */
export const FORMATS = ['atom', 'json', 'md', 'nwf'] as const
export type Format = (typeof FORMATS)[number]

/** Content-Type for each format. */
export const MEDIA_TYPES: Record<Format, string> = {
  atom: 'application/atom+xml; charset=utf-8',
  json: 'application/feed+json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  nwf: 'text/x-neurowire; charset=utf-8',
}

/** File extension for each format. */
export const EXTENSIONS: Record<Format, string> = {
  atom: 'xml',
  json: 'json',
  md: 'md',
  nwf: 'nwf',
}

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value)
}

/** Serialize a feed to the requested format. */
export function serialize(feed: NeurowireFeed, format: Format): string {
  switch (format) {
    case 'atom':
      return toAtom(feed)
    case 'json':
      return toJsonFeed(feed)
    case 'md':
      return toMarkdown(feed)
    case 'nwf':
      return toNwf(feed)
  }
}

export { toAtom } from './atom'
export { toJsonFeed, toJsonFeedObject } from './jsonfeed'
export type { JsonFeedDocument } from './jsonfeed'
export { toMarkdown } from './markdown'
export { fromNwf, toNwf, validateNwf } from './nwf'
export type { NwfIssue, NwfValidation } from './nwf'
