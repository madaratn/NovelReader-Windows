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
