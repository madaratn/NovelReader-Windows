// Keep checking for new episodes and chapters while the window is closed (Windows).
// With the option on (default), closing the window hides it: NovelReader stays near
// the clock (tray icon) and keeps its checks running; the tray menu opens it again or
// quits. Optionally it starts with Windows, hidden, for the same purpose.
// The texts come from the page (in the app's language).
function createBackground({ app, Tray, Menu, Notification, nativeImage, iconPath, getWindow, log = console }) {
  let enabled = false, quitting = false, tray = null, told = false
  let texts = { open: 'Open NovelReader', quit: 'Quit', tip: 'NovelReader — checking for new episodes', hiddenTitle: 'NovelReader keeps running', hiddenBody: 'It will tell you about new episodes and chapters. Right-click the icon near the clock to quit.' }
  const background = process.argv.includes('--background')

  const show = () => { const w = getWindow(); if (!w || w.isDestroyed()) return; if (w.isMinimized()) w.restore(); w.show(); w.focus() }
  const ensureTray = () => {
    if (tray || !Tray) return
    try {
      tray = new Tray(nativeImage ? nativeImage.createFromPath(iconPath) : iconPath)
      tray.setToolTip(texts.tip)
      tray.on('click', show)
      tray.on('double-click', show)
      refreshMenu()
    } catch (e) { log.warn && log.warn('[background] tray', e); tray = null }
  }
  const refreshMenu = () => { if (tray && Menu) tray.setContextMenu(Menu.buildFromTemplate([{ label: texts.open, click: show }, { type: 'separator' }, { label: texts.quit, click: () => { quitting = true; app.quit() } }])) }
  const dropTray = () => { if (tray) { try { tray.destroy() } catch {} tray = null } }

  // Called by the window's 'close' event: true when the window was only hidden.
  function onClose(e, win) {
    if (quitting || !enabled) return false
    e.preventDefault()
    // Nothing keeps playing in a hidden window.
    win.webContents.executeJavaScript("document.querySelectorAll('video,audio').forEach(m=>{try{m.pause()}catch{}});window.speechSynthesis&&speechSynthesis.cancel();window.dispatchEvent(new Event('nr-hidden'))").catch(() => {})
    win.hide()
    ensureTray()
    if (!told && Notification && Notification.isSupported()) { told = true; try { new Notification({ title: texts.hiddenTitle, body: texts.hiddenBody, silent: true }).show() } catch {} }
    return true
  }

  function set({ on, startWithWindows, strings } = {}) {
    if (strings && typeof strings === 'object') { texts = { ...texts, ...strings }; if (tray) { tray.setToolTip(texts.tip); refreshMenu() } }
    if (typeof on === 'boolean') { enabled = on; if (!on && !(getWindow() && !getWindow().isVisible())) dropTray() }
    if (typeof startWithWindows === 'boolean' && app.isPackaged && process.platform === 'win32') {
      try { app.setLoginItemSettings({ openAtLogin: startWithWindows && enabled, args: ['--background'] }) } catch (e) { log.warn && log.warn('[background] login item', e) }
    }
    return { on: enabled, startWithWindows: !!(app.getLoginItemSettings && app.isPackaged && app.getLoginItemSettings({ args: ['--background'] }).openAtLogin), background }
  }

  app.on('before-quit', () => { quitting = true })
  app.on('will-quit', dropTray)
  // Started by Windows at log-in: no window, only the tray icon.
  if (background) app.whenReady().then(ensureTray)

  return { onClose, set, startedInBackground: background, show, isQuitting: () => quitting }
}

module.exports = { createBackground }
