// Windows opened over the page keep the keyboard inside them (Tab goes round), and
// give the focus back to the button that opened them when they close.
import { test, expect } from '@playwright/test'
import { open, novel } from './helpers'
import { historySeed } from '../layout-audit'

const focused = (page: any) => page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a ? (a.className || a.tagName).toString().split(' ')[0] : '' })
const inside = (page: any, sel: string) => page.evaluate((s: string) => !!document.activeElement && !!document.querySelector(s)?.contains(document.activeElement), sel)

test('search everywhere and Continue: Tab stays in the window, closing returns to the button', async ({ page }) => {
  await open(page, { library: [novel('n1', 'Alpha', 30), novel('n2', 'Beta', 12)], reading: { n1: { index: 3 } }, storage: historySeed() })
  // Search everywhere, opened with its button
  await page.locator('aside.sidebar .qs-open').click()
  await expect(page.locator('.qs-input')).toBeFocused()
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await inside(page, '.qs'), 'Tab ' + (i + 1)).toBe(true) }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside(page, '.qs'), 'Shift+Tab ' + (i + 1)).toBe(true) }
  await page.keyboard.press('Escape')
  await expect(page.locator('.qs')).toHaveCount(0)
  await expect(page.locator('aside.sidebar .qs-open')).toBeFocused()
  // Continue panel
  await page.locator('aside.sidebar .home-open').click()
  await page.locator('.home-panel').waitFor()
  const stops = new Set<string>()
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); expect(await inside(page, '.home-panel'), 'Tab ' + (i + 1)).toBe(true); stops.add(await focused(page)) }
  expect(stops.size).toBeGreaterThan(1) // it goes round several buttons, not stuck on one
  await page.keyboard.press('Escape')
  await expect(page.locator('.home-panel')).toHaveCount(0)
  await expect(page.locator('aside.sidebar .home-open')).toBeFocused()
  // Opened from the keyboard with nothing focused: closing leaves the page as it was, no error.
  await page.locator('main h1').first().click()
  await page.keyboard.press('?')
  await page.locator('.kbd-dialog').waitFor()
  await page.keyboard.press('Tab'); expect(await inside(page, '.kbd-dialog')).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.kbd-dialog')).toHaveCount(0)
})

test('a window that leads to another page does not pull the focus back', async ({ page }) => {
  await open(page, { library: [novel('n1', 'Alpha', 30)], reading: { n1: { index: 3 } } })
  await page.locator('aside.sidebar .qs-open').click()
  await page.locator('.qs-input').fill('alp')
  await page.keyboard.press('Enter') // opens the book's page
  await expect(page.locator('.qs')).toHaveCount(0)
  await expect(page.locator('.novelhead, .chapterlist').first()).toBeVisible()
  // A field of the new page takes the focus and keeps it.
  await page.locator('.chaptertools input').first().click()
  await expect(page.locator('.chaptertools input').first()).toBeFocused()
})
