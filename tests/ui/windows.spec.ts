import { test, expect } from '@playwright/test'
import { open, novel, nav } from './helpers'

test('settings show the installed version and a manual update check', async ({ page }) => {
  await open(page)
  await expect(page.locator('.sidebar .version')).toHaveText('Windows · v0.2.0')
  await nav(page, 'Settings')
  await expect(page.locator('.settings-block', { hasText: 'Updates' })).toContainText('Installed version: 0.2.0')
  await page.locator('button', { hasText: 'Check for updates' }).click()
  await expect(page.locator('.settings-block', { hasText: 'Updates' })).toContainText('NovelReader is up to date.')
})

test('a downloaded update shows a banner that restarts the app', async ({ page }) => {
  await open(page)
  await page.evaluate(() => (window as any).__emitUpdate({ state: 'downloading', version: '0.2.0', next: '0.3.0', percent: 40 }))
  await expect(page.locator('.update-banner')).toHaveCount(0)
  await page.evaluate(() => (window as any).__emitUpdate({ state: 'ready', version: '0.2.0', next: '0.3.0' }))
  await expect(page.locator('.update-banner')).toContainText('NovelReader 0.3.0 is ready to install.')
  await page.locator('.update-banner button', { hasText: 'Later' }).click()
  await expect(page.locator('.update-banner')).toHaveCount(0)
  await nav(page, 'Settings')
  await page.locator('.settings-block button', { hasText: 'Restart and update' }).click()
  expect(await page.evaluate(() => (window as any).__installed)).toBe(true)
})

test('new chapters found in the background raise a Windows notification that opens the library', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('__background', '1'))
  await open(page, { library: [novel('mol', 'Mother of Learning', 108), novel('boc', 'Beware of Chicken', 40)], newChapters: { mol: 110 } })
  await nav(page, 'Settings')
  await nav(page, 'Library')
  await page.locator('.lib-update').click()
  await expect(page.locator('.lib-update-status')).toContainText('1 novel has new chapters.')
  expect(await page.evaluate(() => (window as any).__notes)).toEqual([{ title: '1 novel has new chapters.', body: 'Mother of Learning' }])
  await nav(page, 'Sources')
  await page.evaluate(() => (window as any).__lastNote.onclick())
  await expect(page.locator('main h1')).toHaveText('Your Library')
  expect(await page.evaluate(() => (window as any).__focused)).toBe(1)
})

test('no notification when it is turned off in Settings', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('__background', '1'))
  await open(page, { library: [novel('mol', 'Mother of Learning', 108)], newChapters: { mol: 110 } })
  await nav(page, 'Settings')
  await page.locator('.settings-check', { hasText: 'Windows notification' }).locator('input').uncheck()
  await nav(page, 'Library')
  await page.locator('.lib-update').click()
  await expect(page.locator('.lib-update-status')).toContainText('1 novel has new chapters.')
  expect(await page.evaluate(() => (window as any).__notes.length)).toBe(0)
})

test('library cards keep their actions tidy (no stray wrapped button)', async ({ page }) => {
  await open(page, { library: [novel('mol', 'Mother of Learning', 108)], reading: { mol: { index: 3 } } })
  const card = page.locator('.libcard').first()
  const primary = await card.locator('.libraryactions .primary').boundingBox()
  const select = await card.locator('.shelfselect').boundingBox()
  const remove = await card.locator('.removebtn').boundingBox()
  expect(Math.abs(select!.y - remove!.y)).toBeLessThan(2)       // shelf + remove on one row
  expect(select!.y).toBeGreaterThan(primary!.y + primary!.height - 1) // under the main action
})
