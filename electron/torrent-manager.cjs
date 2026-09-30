// TorrentManager (Electron main process only).
//
// Streams a single video file out of an Internet Archive torrent through a
// local HTTP server bound to 127.0.0.1, with HTTP Range support so the
// Chromium <video> element can start early and seek. Pieces needed by the
// current range are fetched first (WebTorrent's file stream selects them at
// high priority); the rest of the chosen file downloads in the background.
//
// Supports trusted Internet Archive torrents plus magnet URIs supplied by the\n// main process for streams already extracted by the local Miwayomi engine.\n// The renderer only receives a narrow IPC bridge; WebTorrent stays here.

const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const archive = require('./archive.cjs')

const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.mov': 'video/quicktime' }
const VIDEO_RE = /\.(mp4|m4v|webm|mkv|ogv|mov)$/i
const TORRENT_FETCH_TIMEOUT = 20000
const READY_TIMEOUT = 30000
const STALL_AFTER = 45000

function friendly(message, detail) { const e = new Error(message); if (detail) e.detail = detail; return e }

function createTorrentManager({ cacheRoot, log = () => {} }) {
  let client = null
  let server = null
  let port = 0
  const sessions = new Map()

  try { fs.rmSync(cacheRoot, { recursive: true, force: true }) } catch {}

  async function getClient() {
    if (client) return client
    const { default: WebTorrent } = await import('webtorrent')
    // uTP needs a native module built for the exact runtime; TCP + web seeds
    // are enough for archive.org torrents, so keep it off for reliability.
    client = new WebTorrent({ utp: false, maxConns: 55 })
    client.on('error', e => log('torrent client error', e))
    return client
  }

  async function getPort() {
    if (server) return port
    server = http.createServer(handleRequest)
    server.on('error', e => log('torrent http server error', e))
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
    port = server.address().port
    return port
  }

  async function fetchTorrentFile(identifier) {
    const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(identifier)}_archive.torrent`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TORRENT_FETCH_TIMEOUT)
    try {
      const r = await fetch(url, { signal: controller.signal, redirect: 'follow' })
      if (r.status === 404) throw friendly('This Internet Archive item has no torrent.')
      if (!r.ok) throw friendly('archive.org refused the torrent download (HTTP ' + r.status + ').')
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 50 || buf[0] !== 0x64 /* bencoded dictionary */) throw friendly('archive.org returned an invalid torrent file.')
      return buf
    } catch (e) {
      if (e.name === 'AbortError') throw friendly('archive.org did not send the torrent in time.')
      throw e
    } finally { clearTimeout(timer) }
  }

  function pickFile(torrent, wanted) {
    const videos = torrent.files.filter(f => VIDEO_RE.test(f.name))
    if (wanted) {
      const hit = videos.find(f => f.name === wanted || f.path.endsWith('/' + wanted))
      if (hit) return hit
      throw friendly('That file is not included in the item\'s torrent.', 'wanted=' + wanted)
    }
    const rank = f => (/\.mp4$/i.test(f.name) ? 3 : /\.webm$/i.test(f.name) ? 2 : 1)
    return videos.sort((a, b) => rank(b) - rank(a) || b.length - a.length)[0] || null
  }

  async function start({ identifier, fileName, magnet }) {\n    const hasMagnet = typeof magnet === 'string' && magnet.startsWith('magnet:?')\n    if (!hasMagnet && !archive.isValidIdentifier(identifier)) throw friendly('Invalid Internet Archive identifier.')\n    if (magnet != null && !hasMagnet) throw friendly('Invalid magnet URI.')\n    if (magnet && magnet.length > 20000) throw friendly('Magnet URI is too long.')\n    if (fileName != null && (typeof fileName !== 'string' || fileName.length > 300)) throw friendly('Invalid file name.')

    // One active stream at a time: switching video frees the previous one.
    await stopAll()

    const sessionId = crypto.randomBytes(12).toString('hex')
    const session = { id: sessionId, identifier: identifier || '', state: hasMagnet ? 'metadata' : 'fetching', error: null, torrent: null, file: null, lastBytes: 0, lastChange: Date.now(), stopped: false }
    sessions.set(sessionId, session)

    try {
      const [wt, localPort, torrentInput] = await Promise.all([getClient(), getPort(), hasMagnet ? Promise.resolve(magnet) : fetchTorrentFile(identifier)])\n      if (session.stopped) throw friendly('Stopped.')\n      session.state = 'metadata'\n\n      const torrent = wt.add(torrentInput, { path: path.join(cacheRoot, sessionId), deselect: true, destroyStoreOnDestroy: true })
      session.torrent = torrent
      torrent.on('error', e => { session.error = friendly('The torrent failed.', String(e && e.message || e)); session.state = 'error'; log('torrent error', e) })
      torrent.on('warning', w => log('torrent warning', String(w && w.message || w)))

      await new Promise((resolve, reject) => {
        if (torrent.ready) return resolve()
        const t = setTimeout(() => reject(friendly('Timed out while reading the torrent metadata.')), READY_TIMEOUT)
        torrent.once('ready', () => { clearTimeout(t); resolve() })
        torrent.once('error', e => { clearTimeout(t); reject(friendly('The torrent failed.', String(e && e.message || e))) })
      })
      if (session.stopped) throw friendly('Stopped.')

      const file = pickFile(torrent, fileName)
      if (!file) throw friendly('This torrent does not contain a video file.')
      file.select() // background download of the chosen file only (low priority)
      session.file = file
      session.state = 'connecting'
      session.lastChange = Date.now()

      return {
        sessionId,
        streamUrl: `http://127.0.0.1:${localPort}/torrent/${sessionId}/${encodeURIComponent(file.name)}`,
        fileName: file.name,
        size: file.length,
        progress: file.progress
      }
    } catch (e) {
      await stop(sessionId)
      throw e
    }
  }

  function status(sessionId) {
    const s = sessions.get(sessionId)
    if (!s) return { state: 'stopped' }
    const t = s.torrent, f = s.file
    const base = { state: s.state, error: s.error ? s.error.message : null }
    if (!t || !f) return base
    const downloaded = f.downloaded
    if (downloaded !== s.lastBytes) { s.lastBytes = downloaded; s.lastChange = Date.now() }
    let state
    if (s.error) state = 'error'
    else if (f.progress >= 1) state = 'done'
    else if (Date.now() - s.lastChange > STALL_AFTER) state = 'stalled'
    else if (t.numPeers === 0) state = 'connecting'
    else if (downloaded < 4 * 1024 * 1024) state = 'buffering'
    else state = 'downloading'
    s.state = state
    return { ...base, state, fileName: f.name, size: f.length, downloaded, progress: f.progress, downloadSpeed: t.downloadSpeed, numPeers: t.numPeers }
  }

  async function stop(sessionId) {
    const s = sessions.get(sessionId)
    if (!s) return
    s.stopped = true
    sessions.delete(sessionId)
    if (s.torrent && !s.torrent.destroyed) {
      await new Promise(resolve => s.torrent.destroy({ destroyStore: true }, () => resolve()))
    }
    try { await fs.promises.rm(path.join(cacheRoot, sessionId), { recursive: true, force: true }) } catch {}
  }

  async function stopAll() { await Promise.all([...sessions.keys()].map(stop)) }

  async function shutdown() {
    await stopAll()
    if (client) await new Promise(resolve => client.destroy(() => resolve()))
    client = null
    if (server) await new Promise(resolve => server.close(() => resolve()))
    server = null
    try { fs.rmSync(cacheRoot, { recursive: true, force: true }) } catch {}
  }

  function handleRequest(req, res) {
    try {
      // Reject requests not addressed to our loopback origin (DNS rebinding).
      if (req.headers.host !== '127.0.0.1:' + port) { res.writeHead(403); return res.end() }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
      const m = /^\/torrent\/([a-f0-9]{24})\/[^/]+$/.exec(new URL(req.url, 'http://127.0.0.1').pathname)
      const s = m && sessions.get(m[1])
      if (!s || !s.file) { res.writeHead(404); return res.end() }
      const file = s.file
      const size = file.length
      const type = MIME[path.extname(file.name).toLowerCase()] || 'application/octet-stream'
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim())
      let start = 0, end = size - 1, status = 200
      if (range) {
        if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1) }
        else if (range[2]) { start = Math.max(0, size - Number(range[2])) }
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end() }
        status = 206
      }
      const headers = { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      res.writeHead(status, headers)
      if (req.method === 'HEAD') return res.end()
      const stream = file.createReadStream({ start, end })
      stream.on('error', e => { log('torrent stream error', e); res.destroy() })
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    } catch (e) {
      log('torrent http handler error', e)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  }

  return { start, status, stop, stopAll, shutdown }
}

module.exports = { createTorrentManager }
