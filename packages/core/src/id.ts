/**
 * Stable, content-derived entry ids. Pure and dependency-free (no node:crypto)
 * so core stays portable. Used to give entries that lack a real GUID a
 * deterministic id, keeping dedup and round-trips stable across formats.
 */

/** FNV-1a (64-bit) hash of `input`, returned as a fixed 16-char lowercase hex string. */
export function hashHex(input: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * prime) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

/**
 * A deterministic synthetic id derived from an entry's link and title.
 * Same `(link, title)` always yields the same urn; different inputs (essentially)
 * always differ. Shape: `urn:nwf:<16-char hex>`.
 */
export function stableId(link: string, title: string): string {
  return `urn:nwf:${hashHex(`${link}\n${title}`)}`
}
