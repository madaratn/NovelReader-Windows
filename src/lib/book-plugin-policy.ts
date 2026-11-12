// Temporary family-beta policy: execute book-source JavaScript only from the
// LNReader plugin publisher the app already uses. This is a publisher allowlist,
// NOT an isolation boundary or a guarantee that upstream code is harmless.
export const TRUSTED_BOOK_PLUGIN_PREFIX =
  'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/'
export const MAX_BOOK_PLUGIN_BYTES = 2 * 1024 * 1024

export function trustedBookPluginUrl(raw: unknown): string {
  const err = () => new Error('Book source blocked: only the official LNReader plugin repository is allowed in this beta.')
  if (typeof raw !== 'string' || raw.length > 2048 || !raw.startsWith(TRUSTED_BOOK_PLUGIN_PREFIX)) throw err()
  const relative = raw.slice(TRUSTED_BOOK_PLUGIN_PREFIX.length)
  if (!relative.endsWith('.js') || relative.length < 4 || /[%?#\\]/.test(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) throw err()
  try {
    const url = new URL(raw)
    if (url.href !== raw || url.protocol !== 'https:' ||
        url.hostname !== 'raw.githubusercontent.com' || url.port ||
        url.username || url.password || url.search || url.hash) throw err()
  } catch { throw err() }
  return raw
}

export function isTrustedBookPluginUrl(raw: unknown): boolean {
  try { trustedBookPluginUrl(raw); return true } catch { return false }
}

export async function fetchTrustedBookPlugin(raw: unknown, fetcher: typeof fetch = fetch): Promise<string> {
  const url = trustedBookPluginUrl(raw)
  const response = await fetcher(url, { credentials: 'omit', redirect: 'error' })
  if (!response.ok) throw Error('Book plugin download HTTP ' + response.status)
  // CapacitorHttp represents the requested URL as a same-app WebView
  // interceptor URL. This is NOT a remote redirect. Accept it only when its
  // single 'u' argument matches the already-validated original URL exactly.
  // A native HTTP interceptor may not expose the ultimate remote redirect URL.
  let capacitorProxy = false
  if (response.url) {
    try {
      const final = new URL(response.url)
      capacitorProxy = final.origin === 'https://localhost' &&
        final.pathname === '/_capacitor_http_interceptor_' &&
        [...final.searchParams.keys()].length === 1 &&
        final.searchParams.get('u') === url
    } catch {}
  }
  if (response.url && response.url.replace(/%5B/gi, '[').replace(/%5D/gi, ']') !== url && !capacitorProxy)
    throw Error('Book plugin redirect blocked.')
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_BOOK_PLUGIN_BYTES) throw Error('Book plugin is too large.')
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_BOOK_PLUGIN_BYTES) throw Error('Book plugin is too large.')
  return new TextDecoder('utf-8').decode(bytes)
}
