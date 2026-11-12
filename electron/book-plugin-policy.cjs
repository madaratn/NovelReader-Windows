// Node/Electron counterpart of src/lib/book-plugin-policy.ts.
// Keep the allowlist and test vectors consistent across both platforms.
// This is a publisher allowlist, NOT an untrusted-JS sandbox.
const TRUSTED_BOOK_PLUGIN_PREFIX =
  'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/'
const MAX_BOOK_PLUGIN_BYTES = 2 * 1024 * 1024

function trustedBookPluginUrl(raw) {
  const err = () => Error('Book source blocked: only the official LNReader plugin repository is allowed in this beta.')
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

async function fetchTrustedBookPlugin(raw, fetcher=fetch) {
  const url = trustedBookPluginUrl(raw)
  const response = await fetcher(url, { credentials: 'omit', redirect: 'follow' })
  if (!response.ok) throw Error('Book plugin download HTTP ' + response.status)
  // Chromium/Android can percent-encode square brackets in LNReader bundle names.
  // Accept only that harmless canonical spelling difference, never another host/path.
  if (response.url && response.url.replace(/%5B/gi, '[').replace(/%5D/gi, ']') !== url)
    throw Error('Book plugin redirect blocked: ' + String(response.url).slice(0, 300))
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_BOOK_PLUGIN_BYTES) throw Error('Book plugin is too large.')
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_BOOK_PLUGIN_BYTES) throw Error('Book plugin is too large.')
  return new TextDecoder('utf-8').decode(bytes)
}

module.exports={TRUSTED_BOOK_PLUGIN_PREFIX,MAX_BOOK_PLUGIN_BYTES,trustedBookPluginUrl,fetchTrustedBookPlugin}
