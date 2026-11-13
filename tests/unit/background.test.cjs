// Closing the window keeps NovelReader near the clock (electron/background.cjs).
const test = require('node:test'), assert = require('node:assert')
const { createBackground } = require('../../electron/background.cjs')

function env() {
  const calls = [], handlers = {}
  const app = { isPackaged: true, on: (n, f) => { handlers[n] = f }, whenReady: () => Promise.resolve(), quit: () => calls.push('quit'), setLoginItemSettings: o => calls.push(['login', o]), getLoginItemSettings: () => ({ openAtLogin: false }) }
  class Tray { constructor() { calls.push('tray') } setToolTip(t) { calls.push(['tip', t]) } on() {} setContextMenu(m) { calls.push(['menu', m.map(x => x.label)]) } destroy() { calls.push('tray-gone') } }
  const Menu = { buildFromTemplate: x => x }
  const Notification = class { static isSupported() { return true } constructor(o) { calls.push(['note', o.title]) } show() {} }
  const win = { hidden: false, hide() { this.hidden = true }, isVisible() { return !this.hidden }, isDestroyed: () => false, isMinimized: () => false, show() { this.hidden = false }, focus() {}, webContents: { executeJavaScript: async js => { calls.push(['js', js.includes('pause()')]) } } }
  const bg = createBackground({ app, Tray, Menu, Notification, nativeImage: null, iconPath: 'icon.png', getWindow: () => win, log: { warn() {} } })
  return { bg, calls, win, handlers }
}

test('option off: closing really closes', () => {
  const { bg, win } = env(); let prevented = false
  assert.equal(bg.onClose({ preventDefault: () => { prevented = true } }, win), false)
  assert.equal(prevented, false)
})

test('option on: the window hides, playback stops, the tray appears with the texts of the app, a note is shown once', () => {
  const { bg, calls, win } = env()
  bg.set({ on: true, strings: { open: 'Ouvrir NovelReader', quit: 'Quitter NovelReader', hiddenTitle: 'NovelReader reste ouvert' } })
  let prevented = 0
  assert.equal(bg.onClose({ preventDefault: () => prevented++ }, win), true)
  assert.equal(prevented, 1); assert.equal(win.hidden, true)
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'js' && c[1]))
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'menu' && c[1].includes('Quitter NovelReader')))
  win.show(); bg.onClose({ preventDefault() {} }, win)
  assert.equal(calls.filter(c => Array.isArray(c) && c[0] === 'note').length, 1)
})

test('quitting from the menu or for an update really closes; start with Windows registers --background', () => {
  const { bg, calls, win, handlers } = env()
  bg.set({ on: true, startWithWindows: true })
  if (process.platform === 'win32') assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'login' && c[1].openAtLogin === true && c[1].args.includes('--background')))
  handlers['before-quit']()
  assert.equal(bg.onClose({ preventDefault() { throw new Error('should close') } }, win), false)
})
