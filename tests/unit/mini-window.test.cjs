// electron/mini-window.cjs: the window becomes a small always-on-top video window, then comes back.
const test = require('node:test')
const assert = require('node:assert')
const { createMiniWindow } = require('../../electron/mini-window.cjs')

function fakeWindow() {
  const w = { b: { x: 100, y: 80, width: 1280, height: 820 }, max: true, top: false, min: [900, 600], ratio: 0, focused: 0,
    isDestroyed: () => false, getBounds: () => ({ ...w.b }), getNormalBounds: () => ({ x: 100, y: 80, width: 1280, height: 820 }), isMaximized: () => w.max, isFullScreen: () => false,
    getMinimumSize: () => w.min, setMinimumSize: (a, b) => { w.min = [a, b] }, unmaximize: () => { w.max = false }, maximize: () => { w.max = true },
    setBounds: b => { w.b = { ...b } }, setAlwaysOnTop: on => { w.top = on }, setAspectRatio: r => { w.ratio = r }, setFullScreen: () => {}, focus: () => { w.focused++ } }
  return w
}
const screen = { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) }

test('mini player: small window in the bottom-right corner, above the others; then everything comes back', () => {
  const w = fakeWindow(), mini = createMiniWindow({ screen, getWindow: () => w })
  assert.strictEqual(mini.enter(), true)
  assert.deepStrictEqual(w.b, { x: 1920 - 480 - 16, y: 1040 - 270 - 16, width: 480, height: 270 })
  assert.strictEqual(w.top, true)
  assert.strictEqual(w.max, false)
  assert.strictEqual(w.__nrMini, true, 'the window size is not remembered while mini')
  assert.deepStrictEqual(w.min, [240, 135])
  assert.strictEqual(mini.enter(), true, 'a second call changes nothing')
  assert.strictEqual(mini.exit(), true)
  assert.deepStrictEqual(w.b, { x: 100, y: 80, width: 1280, height: 820 })
  assert.strictEqual(w.max, true)
  assert.strictEqual(w.top, false)
  assert.deepStrictEqual(w.min, [900, 600])
  assert.strictEqual(w.__nrMini, false)
  assert.strictEqual(mini.exit(), false)
})
