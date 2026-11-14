// Mini player (Windows): the app's own window becomes a small video window that
// stays above the other programs, in a corner of the screen; the same video keeps
// playing (with its subtitles, which Chromium's own picture-in-picture leaves out).
// Back to the normal window: its size, place and maximized state come back.
const W = 480, H = 270, MARGIN = 16

function createMiniWindow({ screen, getWindow }) {
  let saved = null
  const isOn = () => !!saved

  function enter() {
    const win = getWindow()
    if (!win || win.isDestroyed() || saved) return isOn()
    saved = { bounds: win.getNormalBounds ? win.getNormalBounds() : win.getBounds(), maximized: win.isMaximized(), fullScreen: win.isFullScreen(), min: win.getMinimumSize() }
    win.__nrMini = true
    if (saved.fullScreen) win.setFullScreen(false)
    if (saved.maximized) win.unmaximize()
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    win.setMinimumSize(240, 135)
    win.setBounds({ x: area.x + area.width - W - MARGIN, y: area.y + area.height - H - MARGIN, width: W, height: H })
    win.setAlwaysOnTop(true, 'floating')
    try { win.setAspectRatio(16 / 9) } catch {}
    return true
  }

  function exit() {
    const win = getWindow()
    if (!saved) return false
    const s = saved; saved = null
    if (!win || win.isDestroyed()) return false
    win.setAlwaysOnTop(false)
    win.__nrMini = false
    try { win.setAspectRatio(0) } catch {}
    win.setMinimumSize(s.min[0] || 900, s.min[1] || 600)
    win.setBounds(s.bounds)
    if (s.maximized) win.maximize()
    if (s.fullScreen) win.setFullScreen(true)
    win.focus()
    return true
  }

  return { enter, exit, isOn }
}

module.exports = { createMiniWindow }
