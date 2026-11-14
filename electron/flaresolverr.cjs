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
    return { supported: process.platform === 'win32', installed: !!exePath(), running: await running(), starting: !!proc, url: URL_BASE, log: logFile(), ...state }
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

  // What FlareSolverr printed, kept in <userData>/flaresolverr/flaresolverr.log: when
  // it stops at once, the last lines say why (port taken, blocked by an antivirus…).
  const logFile = () => path.join(root, 'flaresolverr.log')
  let lastLines = []
  const keep = chunk => { const lines = String(chunk).split(/\r?\n/).filter(l => l.trim()); lastLines = [...lastLines, ...lines].slice(-30); try { fs.appendFileSync(logFile(), chunk) } catch {} }
  let exitInfo = null
  function start() {
    if (proc) return true
    const exe = exePath(); if (!exe) return false
    state.error = null; exitInfo = null; lastLines = []
    try { fs.writeFileSync(logFile(), '--- ' + new Date().toISOString() + ' ' + exe + '\n') } catch {}
    try {
      proc = spawn(exe, [], { cwd: path.dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', LOG_LEVEL: 'info', HEADLESS: 'true' } })
    } catch (e) { state.error = String(e.message || e); proc = null; return false }
    const me = proc
    me.stdout && me.stdout.on('data', keep)
    me.stderr && me.stderr.on('data', keep)
    me.on('exit', code => { if (proc === me) proc = null; exitInfo = { code, at: Date.now() }; keep('[exited with code ' + code + ']\n') })
    me.on('error', e => { state.error = String(e.message || e); if (proc === me) proc = null })
    return true
  }

  // Started and answering? Waits up to `ms` (FlareSolverr opens a browser first, which
  // takes 5 to 30 s); stops early when it exits. The error says why in plain words.
  async function startAndWait(ms = 45000) {
    if (await running()) return status()
    if (!exePath()) throw new Error('FlareSolverr is not installed.')
    if (!proc && !start()) throw new Error(state.error || 'FlareSolverr could not be started.')
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await running()) { state.error = null; return status() }
      if (!proc) break
      await new Promise(r => setTimeout(r, 1000))
    }
    const tail = lastLines.slice(-6).join('\n')
    if (!proc) {
      const busyPort = /address already in use|10048|only one usage of each socket/i.test(tail)
      state.error = (busyPort ? 'FlareSolverr could not start: port ' + PORT + ' is already used by another program.' : 'FlareSolverr stopped right after starting' + (exitInfo && exitInfo.code != null ? ' (code ' + exitInfo.code + ')' : '') + '. An antivirus may have blocked it: allow it, or reinstall it.') + (tail ? '\n' + tail : '')
    } else {
      state.error = 'FlareSolverr is starting but does not answer yet (after ' + Math.round(ms / 1000) + ' s). Wait a moment and check again.' + (tail ? '\n' + tail : '')
    }
    return status()
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
    } catch (e) { state.error = String(e.message || e); throw e } finally { state.installing = false }
    return startAndWait()
  }

  // The whole tree: FlareSolverr starts a browser of its own, which would otherwise
  // keep running (and keep the port) after NovelReader quits.
  function stop() {
    if (!proc) return
    const pid = proc.pid; proc = null
    if (process.platform === 'win32' && pid) { try { execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {}) } catch {} }
    else { try { process.kill(pid) } catch {} }
  }
  // Removes the installed copy (to install it again cleanly).
  async function reinstall() { stop(); await new Promise(r => setTimeout(r, 1500)); try { fs.rmSync(root, { recursive: true, force: true }) } catch {} return install() }

  return { status, install, start, startAndWait, stop, reinstall, url: URL_BASE, _logLines: () => lastLines }
}

module.exports = { createFlareSolverr }
