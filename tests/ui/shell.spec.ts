import { test, expect } from '@playwright/test'
import { open, nav } from './helpers'

test('sidebar: modes, active page, remembered page per mode and after restart', async ({ page }) => {
  await open(page)
  await expect(page.locator('.nav-list .nav-item')).toHaveText(['Library', 'Global Search', 'Sources'])
  await nav(page, 'Global Search')
  await expect(page.locator('.nav-item[aria-current=page]')).toHaveText('Global Search')
  await expect(page).toHaveTitle('Global Search · NovelReader')
  await page.keyboard.press('Control+2')
  await expect(page.locator('.mode-switch [aria-selected=true]')).toHaveText('Anime')
  await nav(page, 'Local Videos')
  await page.keyboard.press('Control+1')
  await expect(page.locator('main h1')).toHaveText('Find a title everywhere') // Books remembered Global Search
  await page.keyboard.press('Control+2')
  await expect(page.locator('main h1')).toHaveText('Local Videos')
  await page.reload()
  await expect(page.locator('main h1')).toHaveText('Local Videos')
})

test('back navigation, shortcuts dialog, collapsible sidebar', async ({ page }) => {
  await open(page)
  await nav(page, 'Sources')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.locator('.nav-item[aria-current=page]')).toHaveText('Library')
  await page.keyboard.press('?')
  await expect(page.locator('.kbd-dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.kbd-dialog')).toBeHidden()
  await page.keyboard.press('Control+b')
  await expect(page.locator('aside.sidebar')).toHaveCSS('width', '68px')
  await page.keyboard.press('Control+b')
  await expect(page.locator('aside.sidebar')).toHaveCSS('width', '236px')
})

test('Ctrl+K focuses the search field of the page', async ({ page }) => {
  await open(page)
  await nav(page, 'Global Search')
  await page.locator('main h1').click()
  await page.keyboard.press('Control+k')
  await expect(page.locator('main .searchbar input')).toBeFocused()
})

test('narrow window: compact sidebar and no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await open(page)
  await expect(page.locator('aside.sidebar')).toHaveCSS('width', '68px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})
