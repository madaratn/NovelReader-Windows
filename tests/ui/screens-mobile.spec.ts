import { test } from '@playwright/test'
import { setup, novel } from './helpers'

// Screenshots of the main pages at phone / foldable / tablet sizes, to review the
// Android layout. Only with SCREENS=<folder>: SCREENS=/tmp/shots npx playwright test screens-mobile
const DIR = process.env.SCREENS || ''
const SIZES: [string, number, number][] = [['phone', 360, 780], ['phone-big', 412, 915], ['landscape', 800, 360], ['fold', 820, 900], ['tablet', 1024, 1366]]
const LIB = [novel('mol', 'Mother of Learning', 1534), novel('ss', 'Shadow Slave', 2400, { author: 'Guiltythree' }), novel('lotm', 'Lord of the Mysteries', 1430), novel('rr', 'The Lantern Road With A Very Long Title For Testing', 12)]

for (const [name, w, h] of SIZES) {
  test(`screens ${name}`, async ({ page }) => {
    test.skip(!DIR, 'SCREENS not set')
    test.setTimeout(120_000)
    await page.setViewportSize({ width: w, height: h })
    await page.addInitScript(() => { const add = () => document.documentElement?.classList.add('android'); add(); new MutationObserver(add).observe(document, { childList: true, subtree: false }) })
    await setup(page, { library: LIB, reading: { mol: { index: 249 } } }); await page.goto('/'); await page.waitForTimeout(600)
    const shot = async (p: string) => { await page.waitForTimeout(400); await page.screenshot({ path: `${DIR}/${name}-${p}.png`, fullPage: false }) }
    const go = async (label: string) => {
      if (await page.locator('.m-bottom').count()) {
        const tab = page.locator('.m-bottom').getByRole('button', { name: label, exact: true })
        if (await tab.count()) return tab.click()
        await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
        return page.locator('.m-sheet').getByRole('button', { name: label }).click()
      }
      await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first().click()
    }
    await shot('1-library')
    await go('Discover'); await page.waitForTimeout(800); await shot('2-discover')
    await go('Global Search'); await page.fill('main input', 'shadow'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500); await shot('3-search')
    await go('Sources'); await shot('4-sources')
    await go('Settings'); await shot('5-settings')
    await go('Library'); await page.locator('.libtitle').first().click(); await page.waitForTimeout(500); await shot('6-novel')
    await page.locator('.chapterrow').first().click(); await page.waitForTimeout(800); await shot('7-reader')
    await page.goBack().catch(() => {}); if (await page.locator('.m-bottom').count()) { await page.locator('.m-top').getByRole('tab', { name: /Anime/ }).click(); await page.waitForTimeout(500); await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click(); await shot('8-more') }
  })
}
