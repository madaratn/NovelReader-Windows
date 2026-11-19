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
      if (el.tagName === 'SELECT') continue
      if (h.scrollWidth > h.clientWidth + 2) {
        // Only the text of the button itself: a badge placed on its corner is meant to stick out.
        const range = document.createRange(); range.selectNodeContents(el); const tr = range.getBoundingClientRect(), br = el.getBoundingClientRect()
        const cut = /hidden|clip/.test(s.overflowX)
        if (cut && s.textOverflow !== 'ellipsis' && !Array.from(el.querySelectorAll('*')).some(c => getComputedStyle(c).textOverflow === 'ellipsis')) out.push('label cut: ' + name(el) + ' (' + h.clientWidth + ' px for ' + h.scrollWidth + ')')
        else if (!cut && (tr.right > br.right + 2 || tr.left < br.left - 2)) out.push('label sticks out: ' + name(el) + ' (' + Math.round(br.width) + ' px for ' + Math.round(tr.width) + ')')
      }
    }
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

export const SIZES = {
  phone: { width: 390, height: 844 },
  smallPhone: { width: 360, height: 740 },
  tablet: { width: 820, height: 1180 },
  window: { width: 1024, height: 640 },
}

// Pages that are not in the menu (Settings, History, Your year), opened the way a
// person does, on the PC (sidebar) or the phone (top bar and More sheet).
export async function openSettings(page: Page) {
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
