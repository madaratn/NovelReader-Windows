import fs from 'fs'
import { test, expect } from '@playwright/test'

// Television (Android TV): the remote's arrows move a visible focus, OK presses,
// Back closes / goes back / leaves. Same app as on the phone.
const NOTES = (/^##\s*NovelReader\s+([\d.]+)/m.exec(fs.readFileSync('build/release-notes.md', 'utf8')) || [])[1] || ''
test.use({ viewport: { width: 960, height: 540 }, hasTouch: false })

test.beforeEach(async ({ page }) => {
  await page.route('**/plugins.min.json', r => r.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.addInitScript((notes) => {
    const w = window as any
    w.__left = 0
    w.Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true, Plugins: { Player: { device: async () => ({ tv: true }), leave: async () => { w.__left++ } } } }
    if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('onboarded', '1'); localStorage.setItem('lang', 'en'); localStorage.setItem('whatsNewSeen', notes); localStorage.setItem('homeAtStart', '0'); sessionStorage.setItem('__seeded', '1') }
  }, NOTES)
})

const focused = (page: any) => page.evaluate(() => { const e = document.activeElement as HTMLElement; return (e?.getAttribute('aria-label') || e?.innerText || e?.tagName || '').trim().split('\n')[0] })
const box = (page: any) => page.evaluate(() => { const r = document.activeElement!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })

test('TV: arrows move the focus in their direction, OK opens, Back goes back then leaves the app', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/tv/)
  // Something is focused from the start, with a visible outline.
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none')
  // Each arrow goes to a control that really is in that direction.
  for (const [key, axis, sign] of [['ArrowDown', 'y', 1], ['ArrowDown', 'y', 1], ['ArrowRight', 'x', 1], ['ArrowUp', 'y', -1], ['ArrowLeft', 'x', -1]] as const) {
    const a = await box(page); await page.keyboard.press(key); const b = await box(page)
    if (b.x !== a.x || b.y !== a.y) expect((b[axis] - a[axis]) * sign, key + ' from ' + JSON.stringify(a) + ' to ' + JSON.stringify(b)).toBeGreaterThan(0)
  }
  // Reach "Settings" in the navigation with the remote only, press OK.
  await page.locator('.sidebar, .m-bottom').first().waitFor()
  await page.evaluate(() => (document.querySelector('.nav-list button, .m-bottom button') as HTMLElement).focus())
  let found = false
  for (let i = 0; i < 14 && !found; i++) { found = /^Settings/.test(await focused(page)); if (!found) await page.keyboard.press('ArrowDown') }
  expect(found, 'Settings reached with the down arrow').toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.locator('main h1')).toContainText('Settings')
  // A dialog keeps the arrows inside it; Back closes it, then goes back a screen, then leaves.
  await page.locator('.home-open, .m-home').first().click()
  const panel = page.getByRole('dialog', { name: 'Continue' })
  await expect(panel).toBeVisible()
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) { await page.keyboard.press(k); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), k + ' stays in the dialog').toBe(true) }
  await page.evaluate(() => window.dispatchEvent(new Event('nrBack')))
  await expect(panel).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('nrBack')))
  await expect(page.locator('main h1')).not.toContainText('Settings')
  expect(await page.evaluate(() => (window as any).__left)).toBe(0)
  await page.evaluate(() => window.dispatchEvent(new Event('nrBack')))
  await expect.poll(() => page.evaluate(() => (window as any).__left)).toBe(1)
})
