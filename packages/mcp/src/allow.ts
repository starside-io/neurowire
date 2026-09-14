/** Thrown for a request the tool refuses, with a message written for the agent. */
export class ToolError extends Error {}

/**
 * Parse `NEUROWIRE_MCP_ALLOW`: a `,`/whitespace separated list of hosts. Unset or
 * empty means no restriction, which is returned as `undefined`.
 */
export function parseAllowList(raw: string | undefined): string[] | undefined {
  const hosts = (raw ?? '')
    .split(/[\s,]+/)
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return hosts.length ? hosts : undefined
}

/** True when `host` is an allowed host or a subdomain of one. */
export function hostAllowed(host: string, allow: string[] | undefined): boolean {
  if (!allow) return true
  const name = host.toLowerCase()
  return allow.some((entry) => name === entry || name.endsWith(`.${entry}`))
}

/**
 * Reject a caller-supplied URL that is malformed, not http(s), or outside the
 * allowlist. Named meshes and constructs never pass through here: the operator
 * configured those, so they are always allowed.
 */
export function assertAllowed(url: string, allow: string[] | undefined): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ToolError(`"${url}" is not a valid absolute URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ToolError(`"${url}" must use http or https`)
  }
  if (!hostAllowed(parsed.hostname, allow)) {
    throw new ToolError(
      `host "${parsed.hostname}" is not in NEUROWIRE_MCP_ALLOW (allowed: ${allow?.join(', ')})`,
    )
  }
}
