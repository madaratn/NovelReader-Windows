// Layout check shared by the PC and Android suites: on the page as it is now, is
// anything wider than the screen? (an element sticking out on the right or the left,
// or the whole page scrolling sideways). Rows that are meant to scroll sideways
// (chips, tabs, carousels: an ancestor with overflow-x auto/scroll/hidden) and
// drawers parked off screen are not counted.
import type { Page } from '@playwright/test'

export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    const name = (el: Element) => {
      const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
      return el.tagName.toLowerCase() + (c ? '.' + c : '') + (txt ? ' "' + txt + '"' : '')
    }
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX) || /(auto|scroll|hidden|clip)/.test(s.overflow)) {
          const r = p.getBoundingClientRect()
          if (r.right <= vw + 1 && r.left >= -1) return true
        }
      }
      return false
    }
    const hidden = (el: Element) => { for (let p: Element | null = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return true } return false }
    const bad = new Set<Element>()
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (r.right <= 0 || r.left >= vw) continue // parked off screen (closed drawer)
      if (r.right <= vw + 1 && r.left >= -1) continue
      if (clipped(el) || hidden(el)) continue
      // Only the outermost element that sticks out.
      let parentBad = false
      for (let p = el.parentElement; p; p = p.parentElement) if (bad.has(p)) { parentBad = true; break }
      bad.add(el)
      if (!parentBad) out.push(name(el) + ' → ' + Math.round(r.left) + '..' + Math.round(r.right) + ' / ' + vw)
    }
    const se = document.scrollingElement!
    if (se.scrollWidth > window.innerWidth + 1) out.unshift('the page scrolls sideways (' + se.scrollWidth + ' > ' + window.innerWidth + ')')
    return out.slice(0, 12)
  })
}

// Controls smaller than `min` px (WCAG 2.5.8: 24 px with a mouse; 2.5.5: 44 px with a
// finger). A checkbox or a radio counts with its label, which is the real target.
export async function smallTargets(page: Page, min: number): Promise<string[]> {
  return page.evaluate((min) => {
    const out = new Map<string, number>()
    for (const el of Array.from(document.querySelectorAll('button,a[href],input:not([type=hidden]),select,summary,[role=tab],[role=button]'))) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || Number(s.opacity) === 0) continue
      const type = (el as HTMLInputElement).type
      if (type === 'checkbox' || type === 'radio') { const l = el.closest('label'); if (l) { const lb = l.getBoundingClientRect(); if (lb.height >= min - 0.5 && lb.width >= min - 0.5) continue } }
      if (type === 'range' && b.width >= min) continue // a slider: its track is thin, its thumb is the target
      if (s.display === 'inline' && el.parentElement && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length + 20) continue // a link inside a sentence (WCAG: inline targets are not concerned)
      if (b.width >= min - 0.5 && b.height >= min - 0.5) continue
      const k = el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.') + (el.getAttribute('type') ? '[' + el.getAttribute('type') + ']' : '') + ' "' + ((el.textContent || '').trim() || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 16) + '" ' + Math.round(b.width) + 'x' + Math.round(b.height)
      out.set(k, (out.get(k) || 0) + 1)
    }
    return [...out.entries()].map(([k, n]) => k + (n > 1 ? ' ×' + n : '')).slice(0, 15)
  }, min)
}

// Cramped controls: a label cut by its button or sticking out of it, and buttons of the
// same row drawn over one another. Both happen when a row is too narrow for what it
// holds and nothing wraps or scrolls.
export async function crampedProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth, vh = window.innerHeight
    const name = (el: Element) => el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.') + ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"'
    const shown = (el: Element) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh * 4) return false; for (let p: Element | null = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false } return true }
    const controls = Array.from(document.querySelectorAll('button,[role=tab],[role=button],a[href],summary,select')).filter(shown)
    for (const el of controls) {
      const s = getComputedStyle(el), h = el as HTMLElement
      if (el.tagName === 'SELECT' || !(el.textContent || '').trim()) continue // (a cover that grows a little under the pointer has no label to cut)
      if (h.scrollWidth > h.clientWidth + 2) {
        // Only the text of the button itself: a badge placed on its corner is meant to stick out.
        const range = document.createRange(); range.selectNodeContents(el); const tr = range.getBoundingClientRect(), br = el.getBoundingClientRect()
        const cut = /hidden|clip/.test(s.overflowX)
        if (cut && s.textOverflow !== 'ellipsis' && !Array.from(el.querySelectorAll('*')).some(c => getComputedStyle(c).textOverflow === 'ellipsis')) out.push('label cut: ' + name(el) + ' (' + h.clientWidth + ' px for ' + h.scrollWidth + ')')
        else if (!cut && (tr.right > br.right + 2 || tr.left < br.left - 2)) out.push('label sticks out: ' + name(el) + ' (' + Math.round(br.width) + ' px for ' + Math.round(tr.width) + ')')
      }
    }
    // The sentence under a page title is read whole (no "…" in the middle of it).
    for (const el of Array.from(document.querySelectorAll('main>header p, main header>div>p')).filter(shown)) { const h = el as HTMLElement; if (h.scrollHeight > h.clientHeight + 2) out.push('sentence cut: ' + name(el)) }
    // A number or a word in a small box (a badge) is whole ("E401" was cut on both sides of its square).
    for (const el of Array.from(document.querySelectorAll('span,b,small,strong')).filter(shown)) { const h = el as HTMLElement, s = getComputedStyle(h); if (s.overflowX === 'hidden' && s.textOverflow !== 'ellipsis' && h.clientWidth > 0 && h.clientWidth < 90 && h.scrollWidth > h.clientWidth + 1 && (h.textContent || '').trim()) out.push('cut in its box: ' + name(el) + ' "' + (h.textContent || '').trim().slice(0, 20) + '"') }
    // Siblings of one row over one another.
    const byParent = new Map<Element, Element[]>()
    for (const el of controls) { const p = el.parentElement; if (!p) continue; const pos = getComputedStyle(el).position; if (pos === 'absolute' || pos === 'fixed' || pos === 'sticky') continue; (byParent.get(p) || byParent.set(p, []).get(p)!).push(el) }
    for (const list of byParent.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].getBoundingClientRect(), b = list[j].getBoundingClientRect()
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 3 && h > 3) out.push('over one another: ' + name(list[i]) + ' and ' + name(list[j]))
    }
    return [...new Set(out)].slice(0, 12)
  })
}

// A menu or a panel that is open must really be seen: inside the window, and not cut by a
// parent that scrolls (a menu hanging under a button of a row that scrolls sideways is
// there for the page, with its size and its place, and invisible for the person).
// Checked where the eye lands first: its two top corners and its middle.
export const POPUPS = '.more-pop,.translate-menu,.readersettings,.findbar,.tts-panel,.sub-panel,.sub-finder,.cast-panel,.pf-menu,.home-panel,.qs-panel,.m-sheet,.kbd-dialog,.stats-tip,[role=dialog],[role=menu]'
export async function popupProblems(page: Page, selector = POPUPS): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth, vh = window.innerHeight
    const name = (el: Element) => el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el)
      if (r.width < 40 || r.height < 24 || s.display === 'none' || s.visibility === 'hidden') continue
      let faded = false; for (let p: Element | null = el; p; p = p.parentElement) if (Number(getComputedStyle(p).opacity) === 0) faded = true
      if (faded) continue
      if (r.left < -1 || r.right > vw + 1) { out.push('out of the window: ' + name(el) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' / ' + vw); continue }
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, vh); if (bottom - top < 24) continue // scrolled away
      for (const [x, y] of [[r.left + 10, top + 10], [r.right - 10, top + 10], [(r.left + r.right) / 2, (top + bottom) / 2]]) {
        const at = document.elementFromPoint(x, y)
        if (!at || !(el === at || el.contains(at))) { out.push('not seen: ' + name(el) + ' at ' + Math.round(x) + ',' + Math.round(y) + ' (there: ' + (at ? name(at) : 'nothing') + ')'); break }
      }
    }
    return [...new Set(out)]
  }, selector)
}

// The light theme is made of copies of the dark rules with other colours
// (scripts/light-theme.cjs): it must change colours and nothing else. A border, an
// outline, a shadow or a picture that appears or vanishes with the theme, a padding
// that changes: a copy won or lost against a rule it should not have (a "border:0"
// left out of the copies once drew boxes around links, in the light theme only).
export async function themeDifferences(page: Page): Promise<string[]> {
  const snap = () => page.evaluate(() => Array.from(document.querySelectorAll('body *')).map(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect()
    return { n: el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').split(/\s+/).slice(0, 3).join('.') + (el.parentElement ? ' in ' + el.parentElement.tagName.toLowerCase() + '.' + String(el.parentElement.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.') : ''),
      shown: r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none',
      border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].join(' ') + ' ' + [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle].join(' '),
      outline: s.outlineStyle === 'none' ? 'none' : s.outlineStyle + ' ' + s.outlineWidth,
      picture: s.backgroundImage === 'none' ? 'none' : 'one', shadow: s.boxShadow === 'none' ? 'none' : 'one',
      display: s.display, padding: s.padding, opacity: s.opacity } }))
  const was = await page.evaluate(() => { const st = document.createElement('style'); st.id = 'audit-no-motion'; st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st); return document.documentElement.dataset.theme || '' })
  const set = (th: string) => page.evaluate(th => { if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme }, th)
  let out: string[] = []
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Dark, light, dark again: what also changes between the two dark ones is the page
      // living its life (a check in progress, a list that fills in), not the theme.
      await set('dark'); await page.waitForTimeout(120); const a = await snap()
      await set('light'); await page.waitForTimeout(120); const b = await snap()
      await set('dark'); await page.waitForTimeout(120); const c = await snap()
      if (a.length !== b.length || a.length !== c.length) continue // the page was still filling in: once more
      const seen = new Set<string>()
      for (let i = 0; i < a.length; i++) {
        const x = a[i] as any, y = b[i] as any, z = c[i] as any
        if (!x.shown && !y.shown) continue
        const d = ['border', 'outline', 'picture', 'shadow', 'display', 'padding', 'opacity'].filter(k => x[k] !== y[k] && x[k] === z[k]).map(k => k + ' ' + x[k] + ' (dark) / ' + y[k] + ' (light)')
        if (d.length) seen.add('changes with the theme: ' + x.n + ': ' + d.join(', '))
      }
      out = [...seen].slice(0, 12)
      break
    }
  } finally {
    await set(was); await page.evaluate(() => document.getElementById('audit-no-motion')?.remove())
  }
  return out
}

// Everything the audits know how to see, in one list: wider than the window, too small
// for the finger or the pointer, squeezed, cut, hidden, or left with the browser's look.
export async function allProblems(page: Page, min: number, opt: { native?: boolean, themes?: boolean } = {}): Promise<string[]> {
  return [...await layoutProblems(page), ...(await smallTargets(page, min)).map(x => 'smaller than ' + min + ' px: ' + x), ...await crampedProblems(page), ...await popupProblems(page), ...(opt.native === false ? [] : await nativeLook(page)), ...(opt.themes ? await themeDifferences(page) : [])]
}

// Controls left with the look of the browser (grey bevelled button, white list, sunken
// field): every button, list and field of the app is drawn by its style sheet.
export async function nativeLook(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Map<string, number>()
    for (const el of Array.from(document.querySelectorAll('button,select,input,textarea'))) {
      const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || Number(s.opacity) === 0) continue
      const tag = el.tagName.toLowerCase(), type = (el as HTMLInputElement).type
      let why = ''
      if (tag === 'button' && s.borderTopStyle === 'outset') why = 'browser button'
      else if (tag === 'select' && /^rgb\((118, 118, 118|133, 133, 133)\)$/.test(s.borderTopColor)) why = 'browser list'
      else if (tag === 'input' && (type === 'checkbox' || type === 'radio')) { if (s.appearance !== 'none') why = 'browser ' + type }
      else if ((tag === 'input' && type !== 'range' && type !== 'file' && type !== 'color') || tag === 'textarea') { if (s.borderTopStyle === 'inset') why = 'browser field' }
      if (!why) continue
      const k = why + ': ' + tag + '.' + String(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.') + ' "' + ((el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').slice(0, 18) + '" in ' + (el.parentElement ? el.parentElement.tagName.toLowerCase() + '.' + String(el.parentElement.getAttribute('class') || '').split(/\s+/)[0] : '')
      out.set(k, (out.get(k) || 0) + 1)
    }
    return [...out.entries()].map(([k, n]) => k + (n > 1 ? ' ×' + n : '')).slice(0, 20)
  })
}

export const SIZES = {
  phone: { width: 390, height: 844 },
  smallPhone: { width: 360, height: 740 },
  tablet: { width: 820, height: 1180 },
  window: { width: 1024, height: 640 },
}

// Pages that are not in the menu (Settings, History, Your year), opened the way a
// person does, on the PC (sidebar) or the phone (top bar and More sheet).
export async function openSettings(page: Page) {
  await page.locator('main').waitFor() // (right after a reload, nothing is there yet)
  const side = page.locator('aside.sidebar').getByRole('button', { name: 'Settings' })
  if (await side.isVisible().catch(() => false)) return side.click()
  await page.locator('.m-bottom button').last().click()
  await page.locator('.m-sheet-item', { hasText: 'Settings' }).click()
}
export async function openHistory(page: Page) {
  const home = page.locator('aside.sidebar .home-open, .m-top .m-home').first()
  await home.click()
  await page.locator('.home-panel').getByRole('button', { name: 'Whole history' }).click()
  await page.locator('.history-page').waitFor()
}
export async function openYear(page: Page) {
  await openHistory(page)
  await page.locator('.history-page').getByRole('button', { name: /^🎉/ }).click()
  await page.locator('.year-page').waitFor()
}
// Panels and dialogs of the books library, opened the way a person does: the "⋯" menu of
// a card, the Continue panel, the search everywhere box, then the More sheet (phone) or
// the keyboard shortcuts (PC). `visit` is called with each one open.
export async function tourOverlays(page: Page, visit: (where: string) => Promise<void>) {
  const phone = await page.locator('.m-bottom').isVisible().catch(() => false)
  const more = page.locator('.libcard .more-btn').first()
  if (await more.count()) { await more.click(); await page.locator('.more-pop').waitFor(); await visit('card menu'); await page.keyboard.press('Escape'); await page.locator('.more-pop').waitFor({ state: 'detached' }) }
  await page.locator('aside.sidebar .home-open, .m-top .m-home').first().click()
  await page.locator('.home-panel').waitFor(); await visit('continue panel'); await page.keyboard.press('Escape'); await page.locator('.home-panel').waitFor({ state: 'detached' })
  await page.locator('aside.sidebar .qs-open, .m-top .m-search:not(.m-home)').first().click()
  await page.locator('.qs-input').waitFor(); await visit('search everywhere'); await page.locator('.qs-input').fill('a'); await visit('search everywhere, typing'); await page.keyboard.press('Escape'); await page.locator('.qs-input').waitFor({ state: 'detached' })
  if (phone) { await page.locator('.m-bottom button').last().click(); await page.locator('.m-sheet').waitFor(); await visit('more sheet'); await page.locator('.m-sheet-backdrop').click({ position: { x: 5, y: 5 } }); await page.locator('.m-sheet').waitFor({ state: 'detached' }) }
  else { await page.keyboard.press('?'); await page.locator('.kbd-dialog').waitFor(); await visit('keyboard shortcuts'); await page.keyboard.press('Escape'); await page.locator('.kbd-dialog').waitFor({ state: 'detached' }) }
}

// Enough history for the Continue panel to offer "Whole history", and for "Your year".
export function historySeed() {
  const now = Date.now(), y = new Date().getFullYear()
  const d = (n: number) => { const x = new Date(now - n * 86400e3); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') }
  const LONG = 'The Extraordinarily Long Title Of A Story That Never Seems To End Volume Twelve'
  return {
    history: JSON.stringify([0, 1, 2, 3].map(i => ({ at: now - i * 3600e3, kind: 'books', id: 'n1', name: LONG, sub: 'Chapter ' + (10 - i), on: i % 2 ? 'phone' : 'pc' }))),
    readingStats: JSON.stringify({ [d(0)]: { c: 3, s: 1800 }, [d(1)]: { c: 2, s: 900 } }),
    watchStats: JSON.stringify({ [d(0)]: { e: 1, s: 1500 } }),
    _year: String(y),
  }
}
