// Internet Archive client (main process only).
// Only fixed archive.org endpoints are called; the renderer never passes URLs.
// Search is limited to public-domain collections and Creative Commons /
// public-domain licensed items.

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const VIDEO_RE = /\.(mp4|m4v|webm|mkv|ogv|mov)$/i
const OPEN_FILTER =
  '(collection:(classic_cartoons OR feature_films OR prelinger OR silent_films)' +
  ' OR licenseurl:*creativecommons.org* OR licenseurl:*publicdomain*)'

async function getJson(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NovelReader/0.2 (+https://github.com/madaratn/NovelReader-Windows)' } })
    if (!r.ok) throw new Error('archive.org returned HTTP ' + r.status)
    return await r.json()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('archive.org did not answer in time')
    throw e
  } finally { clearTimeout(timer) }
}

function isValidIdentifier(id) { return typeof id === 'string' && ID_RE.test(id) }

async function search(query) {
  const terms = String(query || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().slice(0, 100)
  if (!terms) return []
  const params = new URLSearchParams()
  params.set('q', `(${terms}) AND mediatype:movies AND ${OPEN_FILTER}`)
  for (const f of ['identifier', 'title', 'year', 'downloads', 'licenseurl', 'collection']) params.append('fl[]', f)
  params.set('rows', '40')
  params.append('sort[]', 'downloads desc')
  params.set('output', 'json')
  const data = await getJson('https://archive.org/advancedsearch.php?' + params.toString())
  const docs = data?.response?.docs || []
  return docs.filter(d => isValidIdentifier(d.identifier)).map(d => ({
    identifier: d.identifier,
    title: String(Array.isArray(d.title) ? d.title[0] : d.title || d.identifier),
    year: d.year ? String(d.year) : '',
    downloads: Number(d.downloads) || 0,
    license: d.licenseurl ? String(d.licenseurl) : 'Public domain collection'
  }))
}

async function files(identifier) {
  if (!isValidIdentifier(identifier)) throw new Error('Invalid Internet Archive identifier')
  const data = await getJson('https://archive.org/metadata/' + encodeURIComponent(identifier))
  const all = Array.isArray(data?.files) ? data.files : []
  const hasTorrent = all.some(f => f.format === 'Archive BitTorrent')
  const videos = all
    .filter(f => VIDEO_RE.test(String(f.name || '')) && !/gif/i.test(String(f.format || '')))
    .map(f => ({ name: String(f.name), format: String(f.format || ''), size: Number(f.size) || 0 }))
    // MP4 (H.264) first: it plays in Chromium without any conversion.
    .sort((a, b) => Number(/\.mp4$/i.test(b.name)) - Number(/\.mp4$/i.test(a.name)) || a.size - b.size)
  const meta = data?.metadata || {}
  return {
    identifier,
    title: String(Array.isArray(meta.title) ? meta.title[0] : meta.title || identifier),
    hasTorrent,
    files: videos
  }
}

module.exports = { search, files, isValidIdentifier }
