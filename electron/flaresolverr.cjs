// FlareSolverr helper: solves Cloudflare "checking your browser" pages for the
// video engine (Miwayomi is started with FlareSolverr at http://127.0.0.1:8191).
//
// The user can install it in one click: the official Windows build is
// downloaded from GitHub into <userData>/flaresolverr, extracted with
// PowerShell, and started hidden. Once installed it starts with the app.

const fs = require('fs')
const path = require('path')
const https = require('https')
const { spawn, execFile } = require('child_process')

const PORT = 8191
const URL_BASE = 'http://127.0.0.1:' + PORT
// One exact release, checked against its fingerprint (SHA-256) before it is unpacked
// and run: the app never executes a file it cannot recognise.
const FS_VERSION = 'v3.5.0'
const FS_ZIP = 'https://github.com/FlareSolverr/FlareSolverr/releases/download/' + FS_VERSION + '/flaresolverr_windows_x64.zip'
const FS_SHA256 = '76a6c3e43af7de3827b2ea1badf2bb607f664caa445cef3f14d624b421f7e01e'

function createFlareSolverr({ app }) {
  const root = path.join(app.getPath('userData'), 'flaresolverr')
  let proc = null
  let state = { installing: false, progress: 0, error: null }

  const exePath = () => {
    if (!fs.existsSync(root)) return null
    const stack = [root]
    while (stack.length) {
      const dir = stack.pop()
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name)
        if (/^flaresolverr\.exe$/i.test(name)) return p
        try { if (fs.statSync(p).isDirectory() && stack.length < 50) stack.push(p) } catch {}
      }
    }
    return null
  }

  async function running() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500)
      const r = await fetch(URL_BASE + '/', { signal: ctl.signal }).finally(() => clearTimeout(t))
      return r.ok
    } catch { return false }
  }

  async function status() {
    return { supported: process.platform === 'win32', installed: !!exePath(), running: await running(), url: URL_BASE, ...state }
  }

  function getJson(url) {
    return new Promise((resolve, reject) => https.get(url, { headers: { 'User-Agent': 'NovelReader' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return getJson(r.headers.location).then(resolve, reject)
      let b = ''; r.on('data', d => (b += d)); r.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
    }).on('error', reject))
  }

  function download(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
      const go = u => https.get(u, { headers: { 'User-Agent': 'NovelReader' } }, r => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return go(r.headers.location)
        if (r.statusCode !== 200) return reject(new Error('Download HTTP ' + r.statusCode))
        const total = Number(r.headers['content-length'] || 0); let got = 0
        const f = fs.createWriteStream(dest)
        r.on('data', d => { got += d.length; if (total) onProgress(got / total) })
        r.pipe(f); f.on('finish', () => f.close(resolve)); f.on('error', reject)
      }).on('error', reject)
      go(url)
    })
  }

  function expand(zip, dest) {
    return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`],
      { windowsHide: true, timeout: 10 * 60_000 }, err => (err ? reject(err) : resolve())))
  }

  function start() {
    if (proc) return true
    const exe = exePath(); if (!exe) return false
    proc = spawn(exe, [], { cwd: path.dirname(exe), windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', LOG_LEVEL: 'warning' } })
    proc.on('exit', () => { proc = null })
    proc.on('error', e => { state.error = String(e.message || e); proc = null })
    return true
  }

  async function install() {
    if (process.platform !== 'win32') throw new Error('FlareSolverr one-click install is only available on Windows.')
    if (state.installing) return status()
    state = { installing: true, progress: 0, error: null }
    try {
      fs.mkdirSync(root, { recursive: true })
      const zip = path.join(root, 'flaresolverr.zip')
      await download(FS_ZIP, zip, p => { state.progress = Math.round(p * 88) })
      const got = await new Promise((resolve, reject) => { const h = require('crypto').createHash('sha256'); fs.createReadStream(zip).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject) })
      if (got !== FS_SHA256) { fs.rmSync(zip, { force: true }); throw new Error('The FlareSolverr download does not match the expected file; it was not installed.') }
      state.progress = 92
      await expand(zip, root)
      fs.rmSync(zip, { force: true })
      state.progress = 100
      start()
    } catch (e) { state.error = String(e.message || e); throw e } finally { state.installing = false }
    return status()
  }

  function stop() { if (proc) { try { proc.kill() } catch {} proc = null } }

  return { status, install, start, stop, url: URL_BASE }
}

module.exports = { createFlareSolverr }
