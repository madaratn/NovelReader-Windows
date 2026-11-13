// Second way to get an update, used when the normal one (electron-updater, through
// Chromium's network) fails twice — seen on a home Wi-Fi where the same PC updates
// fine through a phone's 5G. This one goes through Node's own network code, asks for
// IPv4 first (a Wi-Fi box with a broken IPv6 route lets small requests through and
// stalls big downloads), resumes where it stopped, and retries.
// The installer is only kept if its SHA-512 is the one written in latest.yml.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const FEED = 'https://github.com/madaratn/NovelReader-Windows/releases/latest/download/'
const STALL_MS = 30000

function newer(a, b) { // is version a newer than b?
  const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) }
  return false
}

function parseLatest(text) {
  const pick = k => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(text); return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '' }
  const info = { version: pick('version'), file: pick('path'), sha512: pick('sha512') }
  const size = /^\s+size:\s*(\d+)/m.exec(text); info.size = size ? Number(size[1]) : 0
  if (!info.version || !/^[\w.() -]+\.exe$/i.test(info.file) || !/^[A-Za-z0-9+/=]{80,}$/.test(info.sha512)) throw new Error('latest.yml not understood')
  return info
}

// One GET that follows redirects. family: 4 (IPv4 only) or 0 (whatever works).
function open(url, { family = 4, headers = {}, hops = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url) } catch { return reject(new Error('bad address')) }
    const lib = u.protocol === 'http:' ? require('http') : require('https')
    const req = lib.get(u, { family, headers: { 'User-Agent': 'NovelReader-updater', ...headers }, timeout: STALL_MS }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        if (hops > 6) return reject(new Error('too many redirects'))
        return resolve(open(new URL(res.headers.location, u).href, { family, headers, hops: hops + 1 }))
      }
      resolve(res)
    })
    req.on('timeout', () => req.destroy(new Error('no answer')))
    req.on('error', reject)
  })
}

async function text(url, family) {
  const res = await open(url, { family })
  if (res.statusCode !== 200) { res.resume(); throw new Error('HTTP ' + res.statusCode) }
  let s = ''; res.setEncoding('utf8')
  for await (const c of res) { s += c; if (s.length > 200000) throw new Error('too large') }
  return s
}

// Downloads to `file`, continuing a partial file. Throws on a stall or a cut.
async function pull(url, file, total, family, onProgress) {
  let have = 0; try { have = fs.statSync(file).size } catch {}
  if (total && have > total) { fs.rmSync(file, { force: true }); have = 0 }
  if (total && have === total) return
  const res = await open(url, { family, headers: have ? { Range: 'bytes=' + have + '-' } : {} })
  if (res.statusCode === 200 && have) { fs.rmSync(file, { force: true }); have = 0 } // no resume: start again
  else if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); throw new Error('HTTP ' + res.statusCode) }
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file, { flags: have ? 'a' : 'w' })
    let stall = setTimeout(() => res.destroy(new Error('download stalled')), STALL_MS)
    res.on('data', c => { have += c.length; clearTimeout(stall); stall = setTimeout(() => res.destroy(new Error('download stalled')), STALL_MS); onProgress && onProgress(total ? have / total : 0) })
    res.on('error', e => { clearTimeout(stall); out.destroy(); reject(e) })
    out.on('error', e => { clearTimeout(stall); res.destroy(); reject(e) })
    out.on('finish', () => { clearTimeout(stall); resolve() })
    res.pipe(out)
  })
  if (total && have < total) throw new Error('download cut')
}

function sha512(file) {
  return new Promise((resolve, reject) => { const h = crypto.createHash('sha512'); fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('base64'))).on('error', reject) })
}

// -> { state: 'up-to-date' } or { state: 'ready', version, file }
async function fetchUpdate({ current, dir, feed = FEED, onProgress = null, onInfo = null, tries = 5, wait = 3000 }) {
  let info = null, err = null
  for (const family of [4, 0]) { try { info = parseLatest(await text(feed + 'latest.yml', family)); break } catch (e) { err = e } }
  if (!info) throw err || new Error('update server not reachable')
  if (!newer(info.version, current)) return { state: 'up-to-date', version: info.version }
  onInfo && onInfo(info)
  fs.mkdirSync(dir, { recursive: true })
  // Older downloads are not kept.
  for (const f of fs.readdirSync(dir)) if (f !== info.file) fs.rmSync(path.join(dir, f), { force: true, recursive: true })
  const file = path.join(dir, info.file)
  for (let i = 0; i < tries; i++) {
    try {
      await pull(feed + encodeURIComponent(info.file), file, info.size, i % 2 ? 0 : 4, onProgress)
      if (await sha512(file) === info.sha512) return { state: 'ready', version: info.version, file }
      fs.rmSync(file, { force: true }); err = new Error('the downloaded update does not match the published one')
    } catch (e) { err = e }
    await new Promise(r => setTimeout(r, wait))
  }
  throw err || new Error('download failed')
}

module.exports = { fetchUpdate, parseLatest, newer, FEED }
