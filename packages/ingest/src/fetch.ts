export interface RawDocument {
  /** Final URL after redirects. */
  url: string
  contentType: string
  body: string
}

export interface FetchOptions {
  signal?: AbortSignal
}

const USER_AGENT = 'Neurowire/0.1 (+https://github.com/neurowire/neurowire)'
const ACCEPT =
  'application/atom+xml, application/rss+xml, application/feed+json, application/json;q=0.9, text/html;q=0.8, */*;q=0.5'

/** Fetch a URL over HTTP(S), following redirects, returning the body and final URL. */
export async function fetchDocument(url: string, options: FetchOptions = {}): Promise<RawDocument> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`)
  }

  const res = await fetch(url, {
    redirect: 'follow',
    signal: options.signal,
    headers: { 'user-agent': USER_AGENT, accept: ACCEPT },
  })
  if (!res.ok) {
    throw new Error(`Upstream responded ${res.status} ${res.statusText} for ${url}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  const body = await res.text()
  return { url: res.url || url, contentType, body }
}
