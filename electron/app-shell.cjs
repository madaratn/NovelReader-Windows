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
        if (win.isDestroyed()) return
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
function createUpdater({ app, ipcMain, getWindow, log = console }) {
  let status = { state: 'idle', version: app.getVersion() }
  let updater = null

  const send = patch => {
    status = { ...status, ...patch }
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
  }

  if (app.isPackaged && process.env.NR_SMOKE_TEST !== '1') {
    try {
      updater = require('electron-updater').autoUpdater
      updater.autoDownload = true
      updater.autoInstallOnAppQuit = true
      updater.on('checking-for-update', () => send({ state: 'checking', error: null }))
      updater.on('update-not-available', () => send({ state: 'up-to-date', checkedAt: Date.now() }))
      updater.on('update-available', i => send({ state: 'downloading', next: i && i.version, percent: 0 }))
      updater.on('download-progress', p => send({ state: 'downloading', percent: Math.round(p.percent || 0) }))
      updater.on('update-downloaded', i => send({ state: 'ready', next: i && i.version }))
      updater.on('error', e => { log.warn('[update]', e); send({ state: 'error', error: String(e && e.message || e).split('\n')[0] }) })
    } catch (e) { log.warn('[update] electron-updater unavailable', e) }
  }

  const check = async () => {
    if (!updater) { send({ state: 'unsupported' }); return status }
    try { await updater.checkForUpdates() } catch (e) { send({ state: 'error', error: String(e && e.message || e).split('\n')[0] }) }
    return status
  }

  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', () => check())
  ipcMain.handle('update:install', () => { if (updater && status.state === 'ready') setImmediate(() => updater.quitAndInstall(false, true)); return true })
  ipcMain.handle('app:version', () => app.getVersion())

  function start() {
    if (!updater) return
    setTimeout(check, 10_000)
    setInterval(check, 6 * 3600_000)
  }
  return { start, check }
}

module.exports = { createWindowState, createUpdater }
