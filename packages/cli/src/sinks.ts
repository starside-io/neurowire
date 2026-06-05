import { type NeurowireEntry, type NeurowireFeed, serialize } from '@neurowire/core'

/**
 * Sinks are an I/O / delivery concern, so they live in the CLI rather than the
 * pure library. A sink takes the resulting (or freshly-seen) entries and POSTs
 * them to a destination: a Slack incoming webhook, a Discord webhook, or any
 * generic endpoint that accepts a JSON Feed.
 */
export type SinkKind = 'slack' | 'discord' | 'webhook'

/** Detect the sink kind from the destination host. */
export function sinkKind(url: string): SinkKind {
  if (url.includes('slack.com')) return 'slack'
  if (url.includes('discord.com') || url.includes('discordapp.com')) return 'discord'
  return 'webhook'
}

/**
 * Build a short, human message: a header line then up to `max` bullet lines, one
 * per entry, with an overflow line when there are more. The separator between a
 * title and its link is a hyphen with spaces, never an em-dash.
 */
export function buildText(feedTitle: string, entries: NeurowireEntry[], max = 10): string {
  const lines = [`${feedTitle}: ${entries.length} new`]
  for (const entry of entries.slice(0, max)) {
    lines.push(`• ${entry.title} - ${entry.link}`)
  }
  if (entries.length > max) {
    lines.push(`…and ${entries.length - max} more`)
  }
  return lines.join('\n')
}

/** Slack incoming-webhook body: a single `text` field. */
export function buildSlackBody(feedTitle: string, entries: NeurowireEntry[]): { text: string } {
  return { text: buildText(feedTitle, entries) }
}

/** Discord webhook body: a single `content` field, capped at Discord's 2000-char limit. */
export function buildDiscordBody(
  feedTitle: string,
  entries: NeurowireEntry[],
): { content: string } {
  const content = buildText(feedTitle, entries)
  return { content: content.length > 2000 ? content.slice(0, 2000) : content }
}

/** Generic webhook body: the JSON Feed of these entries. */
export function buildWebhookBody(feed: NeurowireFeed): string {
  return serialize(feed, 'json')
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * POST the feed's entries to a sink. Slack/Discord get a JSON message; a generic
 * webhook gets the JSON Feed as `application/feed+json`. Returns true on a 2xx,
 * otherwise writes a one-line warning to stderr and returns false. Never throws,
 * so it is safe to call from the watch loop.
 */
export async function deliver(url: string, feed: NeurowireFeed): Promise<boolean> {
  const kind = sinkKind(url)
  let body: string
  let contentType: string
  if (kind === 'slack') {
    body = JSON.stringify(buildSlackBody(feed.title, feed.entries))
    contentType = 'application/json'
  } else if (kind === 'discord') {
    body = JSON.stringify(buildDiscordBody(feed.title, feed.entries))
    contentType = 'application/json'
  } else {
    body = buildWebhookBody(feed)
    contentType = 'application/feed+json'
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    })
    if (!res.ok) {
      process.stderr.write(`[sink] ${hostOf(url)} failed: ${res.status} ${res.statusText}\n`)
      return false
    }
    return true
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[sink] ${hostOf(url)} failed: ${reason}\n`)
    return false
  }
}
