import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Peer, SyncReport } from '@neurowire/ingest'

/**
 * Pure helpers behind `neurowire sync` and `neurowire peers`. Everything that
 * touches the filesystem or the network stays in index.ts; parsing, editing, and
 * formatting live here so they can be tested without a peer to talk to.
 */

/** Where the peer list lives: `$NEUROWIRE_PEERS`, else the config directory. */
export function peersConfigPath(): string {
  const fromEnv = (process.env.NEUROWIRE_PEERS ?? '').trim()
  if (fromEnv) return fromEnv
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'neurowire', 'peers.json')
}

/**
 * Normalize a peer URL so the same node is one entry: no trailing slash, no
 * fragment. A value with no scheme gets `https://`, because otherwise it is
 * stored as-is and only fails much later, deep in a sync, as a bare
 * "Invalid URL" with no hint about what was missing.
 */
export function normalizePeerUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    parsed.hash = ''
    const text = parsed.toString()
    return text.endsWith('/') ? text.slice(0, -1) : text
  } catch {
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  }
}

/** Read one entry of a peers file: a bare URL string, or an object with a url. */
function readPeer(value: unknown): Peer | undefined {
  if (typeof value === 'string') {
    const url = normalizePeerUrl(value)
    return url ? { url } : undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const raw = value as { url?: unknown; token?: unknown; journals?: unknown }
  if (typeof raw.url !== 'string') return undefined
  const url = normalizePeerUrl(raw.url)
  if (!url) return undefined
  const peer: Peer = { url }
  if (typeof raw.token === 'string' && raw.token) peer.token = raw.token
  if (Array.isArray(raw.journals)) {
    const journals = raw.journals.filter((id): id is string => typeof id === 'string')
    if (journals.length) peer.journals = journals
  }
  return peer
}

/**
 * Parse a peers config. Accepts `{ "peers": [...] }` or a bare array, and each
 * member as a URL string or an object. Unreadable members are dropped rather
 * than failing the whole file, so one bad line cannot take a working sync down.
 */
export function parsePeersConfig(text: string): Peer[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(raw) ? raw : ((raw as { peers?: unknown })?.peers ?? [])
  if (!Array.isArray(list)) return []
  return list.map(readPeer).filter((peer): peer is Peer => peer !== undefined)
}

/** A peers file that parsed, or the reason it did not. */
export type PeersConfigResult = { ok: true; peers: Peer[] } | { ok: false; error: string }

/**
 * Parse a peers config strictly, separating "no peers" from "unreadable file".
 *
 * `parsePeersConfig` answers both with an empty list, which is right for reading
 * but catastrophic for writing: a hand-edited file with a trailing comma would
 * otherwise be silently replaced by whatever `peers add` was adding, taking
 * every other peer and its token with it.
 */
export function readPeersConfig(text: string): PeersConfigResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const list = Array.isArray(raw) ? raw : (raw as { peers?: unknown } | null)?.peers
  if (!Array.isArray(list)) {
    return { ok: false, error: 'expected { "peers": [...] } or an array of peers' }
  }
  return { ok: true, peers: list.map(readPeer).filter((peer): peer is Peer => peer !== undefined) }
}

/** Serialize a peers config, in the `{ "peers": [...] }` shape the parser prefers. */
export function formatPeersConfig(peers: Peer[]): string {
  return `${JSON.stringify({ peers }, null, 2)}\n`
}

/** Add a peer, replacing any existing entry for the same URL. */
export function addPeer(peers: Peer[], peer: Peer): Peer[] {
  const url = normalizePeerUrl(peer.url)
  const next = { ...peer, url }
  const existing = peers.findIndex((candidate) => normalizePeerUrl(candidate.url) === url)
  if (existing === -1) return [...peers, next]
  return peers.map((candidate, index) => (index === existing ? next : candidate))
}

/** Remove a peer by URL. Reports whether anything matched. */
export function removePeer(peers: Peer[], url: string): { peers: Peer[]; removed: boolean } {
  const target = normalizePeerUrl(url)
  const kept = peers.filter((candidate) => normalizePeerUrl(candidate.url) !== target)
  return { peers: kept, removed: kept.length !== peers.length }
}

/** Build a one-shot peer from a URL plus the `--token` and `--journal` flags. */
export function peerFromArgs(url: string, token?: string, journal?: string): Peer {
  const peer: Peer = { url: normalizePeerUrl(url) }
  if (token) peer.token = token
  if (journal) peer.journals = [journal]
  return peer
}

/** Human-readable byte size, so a report can show what a delta actually cost. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Render a {@link SyncReport} as the lines the CLI prints, one per journal. */
export function formatSyncReport(report: SyncReport): string[] {
  const lines: string[] = []
  for (const peer of report.peers) {
    lines.push(peer.url)
    if (peer.error) {
      lines.push(`  error: ${peer.error}`)
      continue
    }
    if (peer.journals.length === 0) {
      lines.push('  no journals published')
      continue
    }
    for (const journal of peer.journals) {
      if (journal.error) {
        lines.push(`  ${journal.journal}: error: ${journal.error}`)
        continue
      }
      const notes = [
        `${journal.added} new`,
        `cursor ${journal.head.seq}`,
        `${journal.requests} request${journal.requests === 1 ? '' : 's'}`,
        formatBytes(journal.bytes),
      ]
      if (journal.bootstrapped) notes.push('bootstrapped from snapshot')
      if (journal.reset) notes.push('peer journal diverged, cursor reset')
      lines.push(`  ${journal.journal}: ${notes.join(', ')}`)
    }
  }
  const summary = `${report.added} new entr${report.added === 1 ? 'y' : 'ies'} from ${
    report.peers.length
  } peer${report.peers.length === 1 ? '' : 's'} (${formatBytes(report.bytes)}, ${report.errors} error${
    report.errors === 1 ? '' : 's'
  })`
  lines.push(summary)
  return lines
}

/** Render the configured peers as the lines `peers list` prints. */
export function formatPeersList(peers: Peer[]): string[] {
  if (peers.length === 0) return ['no peers configured']
  return peers.map((peer) => {
    const notes: string[] = []
    if (peer.token) notes.push('token')
    notes.push(peer.journals?.length ? peer.journals.join(', ') : 'all journals')
    return `${peer.url}  (${notes.join(', ')})`
  })
}
