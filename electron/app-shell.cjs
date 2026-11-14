// Window state, single instance and auto-updates (main process).

const fs = require('fs')
const path = require('path')

// ---- Window position/size -----------------------------------------------------
function createWindowState({ app, screen }) {
  const file = () => path.join(app.getPath('userData'), 'window-state.json')
  const DEFAULT = { width: 1280, height: 820 }

  function load() {
    try {
      const s = JSON.parse(fs.readFileSync(file(), 'utf8'))
      const width = Math.max(900, Number(s.width) || DEFAULT.width)
      const height = Math.max(600, Number(s.height) || DEFAULT.height)
      const out = { width, height, maximized: !!s.maximized }
      // Only restore the position if it is still visible on a connected display.
      if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
        const visible = screen.getAllDisplays().some(d => {
          const a = d.workArea
          return s.x + 80 > a.x && s.y + 40 > a.y && s.x < a.x + a.width - 80 && s.y < a.y + a.height - 40
        })
        if (visible) Object.assign(out, { x: s.x, y: s.y })
      }
      return out
    } catch { return { ...DEFAULT, maximized: false } }
  }

  function track(win) {
    let timer = null
    const save = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (win.isDestroyed() || win.__nrMini) return // the mini player's size is not the window's
        const maximized = win.isMaximized()
        const b = maximized || win.isMinimized() ? win.getNormalBounds() : win.getBounds()
        try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify({ ...b, maximized })) } catch {}
      }, 400)
    }
    for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, save)
    win.on('close', () => { clearTimeout(timer); timer = null; try {
      const maximized = win.isMaximized(); const b = win.getNormalBounds()
      fs.writeFileSync(file(), JSON.stringify({ ...b, maximized }))
    } catch {} })
  }
  return { load, track }
}

// ---- Auto-updates (GitHub releases, packaged app only) ---------------------------
// Updates download in the background and install silently (no installer window,
// nothing to uninstall): when NovelReader closes, when the user clicks "Restart
// and update", or by itself when the PC has been idle for a while and nothing is
// playing (the app then reopens on its own).
const IDLE_INSTALL_SECONDS = 15 * 60
function createUpdater({ app, ipcMain, getWindow, log = console, powerMonitor = null, version = null, fetchUpdate = require('./update-fallback.cjs').fetchUpdate, retryMs = 30000, stallMs = 90000 }) {
  let failures = 0, lastFail = 0, fallbackBusy = false, manualFile = ''
  let status = { state: 'idle', version: app.getVersion() }
  let updater = null
  let busy = false, autoIdle = true, installing = false

  // A download that stops moving (no error, no progress) also hands over to the second way.
  let stallTimer = null, stallAt = -1
  const watchStall = () => {
    if (status.state !== 'downloading' || fallbackBusy) { clearTimeout(stallTimer); stallTimer = null; stallAt = -1; return }
    if (stallTimer && stallAt === status.percent) return
    clearTimeout(stallTimer); stallAt = status.percent
    stallTimer = setTimeout(() => { stallTimer = null; if (status.state === 'downloading' && !fallbackBusy && status.percent === stallAt) { log.warn('[update] download stalled'); fallback('download stalled') } }, stallMs)
  }
  const send = patch => {
    status = { ...status, ...patch }
    watchStall()
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
  }

  if (app.isPackaged && process.env.NR_SMOKE_TEST !== '1') {
    try {
      updater = require('electron-updater').autoUpdater
      updater.autoDownload = true
      updater.autoInstallOnAppQuit = true // silent install when the app closes
      updater.autoRunAppAfterInstall = true
      updater.on('checking-for-update', () => send({ state: 'checking', error: null }))
      updater.on('update-not-available', () => send({ state: 'up-to-date', checkedAt: Date.now() }))
      updater.on('update-available', i => send({ state: 'downloading', next: i && i.version, percent: 0 }))
      updater.on('download-progress', p => send({ state: 'downloading', percent: Math.round(p.percent || 0) }))
      updater.on('update-downloaded', i => send({ state: 'ready', next: i && i.version }))
      updater.on('error', e => { log.warn('[update]', e); failed(String(e && e.message || e).split('\n')[0]) })
    } catch (e) { log.warn('[update] electron-updater unavailable', e) }
  }

  // ---- When the normal way fails (seen on a home Wi-Fi while 5G worked) ----------
  // It is tried again once after 30 s; then the second way takes over
  // (electron/update-fallback.cjs: Node's network, IPv4 first, resumes, retries).
  const failed = message => {
    if (status.state === 'ready' || installing || fallbackBusy) return
    if (Date.now() - lastFail < 2000) return // the same failure, reported twice
    lastFail = Date.now(); failures++
    send({ state: 'error', error: message })
    if (failures === 1) setTimeout(() => { if (status.state === 'error') check() }, retryMs)
    else fallback(message)
  }
  const fallback = async firstError => {
    if (fallbackBusy || !fetchUpdate) return
    fallbackBusy = true
    log.info && log.info('[update] second way (direct download)')
    try {
      const r = await fetchUpdate({ current: app.getVersion(), dir: path.join(app.getPath('userData'), 'pending-update'),
        onInfo: i => send({ state: 'downloading', next: i.version, percent: 0, error: null }),
        onProgress: p => { const pc = Math.round(p * 100); if (pc !== status.percent) send({ state: 'downloading', percent: pc }) } })
      if (r.state === 'ready') { manualFile = r.file; send({ state: 'ready', next: r.version, error: null }) }
      else send({ state: 'up-to-date', checkedAt: Date.now(), error: null })
      failures = 0
    } catch (e) {
      log.warn('[update] second way failed', e)
      send({ state: 'error', error: firstError, manual: 'https://github.com/madaratn/NovelReader-Windows/releases/latest' })
    } finally { fallbackBusy = false }
  }
  // The installer fetched by the second way: same silent install as electron-updater.
  const runManual = relaunch => {
    try { require('child_process').spawn(manualFile, ['--updated', '/S', ...(relaunch ? ['--force-run'] : [])], { detached: true, stdio: 'ignore' }).unref(); return true } catch (e) { log.warn('[update] installer', e); return false }
  }
  app.on && app.on('will-quit', () => { if (manualFile && status.state === 'ready' && !installing) runManual(false) })

  const check = async () => {
    if (!updater) { send({ state: 'unsupported' }); return status }
    if (fallbackBusy || manualFile && status.state === 'ready') return status
    try { await updater.checkForUpdates() } catch (e) { failed(String(e && e.message || e).split('\n')[0]) }
    return status
  }

  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', () => check())
  // Silent install (no setup window), then NovelReader starts again.
  const install = () => {
    if (!updater || status.state !== 'ready' || installing) return false
    installing = true; send({ state: 'installing' })
    if (manualFile) { setImmediate(() => { if (runManual(true)) app.quit(); else { installing = false; send({ state: 'error', error: 'installer could not start' }) } }); return true }
    setImmediate(() => updater.quitAndInstall(true, true))
    return true
  }
  ipcMain.handle('update:install', () => { install(); return true })
  // The page says whether something is playing, and whether idle install is on.
  ipcMain.handle('update:busy', (_e, o) => { busy = !!(o && o.busy); if (o && typeof o.auto === 'boolean') autoIdle = o.auto; return true })
  const idleTick = () => {
    if (!autoIdle || busy || status.state !== 'ready' || !powerMonitor) return false
    let idle = 0; try { idle = powerMonitor.getSystemIdleTime() } catch {}
    if (idle < IDLE_INSTALL_SECONDS) return false
    log.info && log.info('[update] PC idle, installing', status.next)
    return install()
  }
  // The interface may be newer than the installed app (electron/ui-update.cjs).
  ipcMain.handle('app:version', () => (version ? version() : app.getVersion()))

  function start() {
    if (!updater) return
    setTimeout(check, 10_000)
    setInterval(check, 6 * 3600_000)
    setInterval(idleTick, 60_000)
  }
  return { start, check, idleTick, install, _set: o => { status = { ...status, ...o } } }
}

module.exports = { createWindowState, createUpdater }
