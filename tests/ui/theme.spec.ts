import { test, expect, type Page } from '@playwright/test'
import { open, novel, nav } from './helpers'

// Every visible text must reach WCAG AA (4.5:1) against its background, in both themes.
async function lowContrast(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } }
    const L = ({ r, g, b }: any) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const bgOf = (el: Element | null): any => { while (el) { const cs = getComputedStyle(el); if (cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c.a > 0.5) return c; el = el.parentElement } return parse(getComputedStyle(document.body).backgroundColor) }
    const out: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim())) continue
      const r = (el as HTMLElement).getBoundingClientRect(); if (!r.width || !r.height) continue
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5 || (el as HTMLButtonElement).disabled) continue
      const bg = bgOf(el); if (!bg) continue // text over images/gradients (covers) is not measurable this way
      const a = L(parse(cs.color)), b = L(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < 4.5) out.push(`${ratio.toFixed(2)} "${el.textContent!.trim().slice(0, 30)}" ${cs.color} on rgb(${bg.r},${bg.g},${bg.b})`)
    }
    return [...new Set(out)]
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`readable text everywhere in the ${theme} theme`, async ({ page }) => {
    await open(page, { storage: { appTheme: theme }, library: [novel('mol', 'Mother of Learning', 108, { shelf: 'reading' }), novel('boc', 'Beware of Chicken', 40)], reading: { mol: { index: 41 } } })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    expect(await lowContrast(page)).toEqual([])
    await page.locator('.libcard').first().locator('.libtitle').click()
    expect(await lowContrast(page)).toEqual([])
    await nav(page, 'Global Search'); await page.fill('.search-main input', 'shadow slave'); await page.locator('.search-main button').click()
    await expect(page.locator('.resultcard').first()).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
    await nav(page, 'Sources'); expect(await lowContrast(page)).toEqual([])
    await nav(page, 'Settings'); expect(await lowContrast(page)).toEqual([])
  })
}

test('appearance: light, dark, or like Windows; saved; reader follows by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light') // "Like Windows" by default
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await nav(page, 'Settings')
  await page.locator('.settings-seg button', { hasText: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(241, 242, 246)')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await nav(page, 'Library')
  await page.locator('.libcard .primary').click()
  await expect(page.locator('.readerpage')).toHaveClass(/rtheme-light/) // reader theme never chosen: follows the app
})
