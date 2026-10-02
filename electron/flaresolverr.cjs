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
const RELEASES = 'https://api.github.com/repos/FlareSolverr/FlareSolverr/releases/latest'

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
      const rel = await getJson(RELEASES)
      const asset = (rel.assets || []).find(a => /windows.*x64.*\.zip$/i.test(a.name)) || (rel.assets || []).find(a => /windows.*\.zip$/i.test(a.name))
      if (!asset) throw new Error('No Windows build found in the latest FlareSolverr release.')
      fs.mkdirSync(root, { recursive: true })
      const zip = path.join(root, 'flaresolverr.zip')
      await download(asset.browser_download_url, zip, p => { state.progress = Math.round(p * 90) })
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
