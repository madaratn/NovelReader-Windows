import { test, expect } from '@playwright/test'
import { open, novel, nav } from './helpers'

test('welcome guide on first launch only', async ({ page }) => {
  await open(page, { onboarded: false, library: [] })
  await expect(page.locator('.welcome h1')).toHaveText('Welcome to NovelReader')
  await page.locator('.welcome-actions .primary').click()
  await expect(page.locator('.welcome h1')).toHaveText('What you can do')
  await page.locator('.welcome-actions .primary').click()
  await page.locator('.welcome-actions .primary', { hasText: 'Search a novel' }).click()
  await expect(page.locator('main h1')).toHaveText('Find a title everywhere')
  await expect(page.locator('main .searchbar input')).toBeFocused()
  await page.reload()
  await expect(page.locator('.welcome')).toHaveCount(0)
})

test('existing users never see the welcome guide', async ({ page }) => {
  await open(page, { onboarded: false, library: [novel('a', 'Existing', 3)] })
  await expect(page.locator('.libcard')).toHaveCount(1)
  await expect(page.locator('.welcome')).toHaveCount(0)
})

test('a crashing page shows a recovery screen and the app keeps working', async ({ page }) => {
  await open(page, { library: [{ ...novel('boom', 'x', 1), name: { bad: 'object' } as any }] })
  await expect(page.locator('.crash h2')).toHaveText('Something went wrong on this page')
  await expect(page.locator('aside.sidebar')).toBeVisible()
  await page.locator('.sidebar .nav-item', { hasText: 'Settings' }).click()
  await expect(page.locator('main h1')).toHaveText('Settings')
  await expect(page.locator('.crash')).toHaveCount(0)
})

test('French interface: detection-free switch, plurals, saved choice', async ({ page }) => {
  await open(page, { library: [novel('a', 'Mother of Learning', 10)], reading: { a: { index: 3 } } })
  await page.locator('.sidebar .nav-item', { hasText: 'Settings' }).click()
  await page.locator('.settings-seg button', { hasText: 'Français' }).click()
  await expect(page.locator('main h1')).toHaveText('Paramètres')
  await page.locator('.sidebar .nav-item', { hasText: 'Bibliothèque' }).click()
  await expect(page.locator('main header p')).toHaveText('1 roman enregistré sur ce PC.')
  await expect(page.locator('.lib-resume small')).toContainText('il y a 2 h')
  await page.reload()
  await expect(page.locator('main h1')).toHaveText('Ma bibliothèque')
})

test('backups: back up now, then restore an automatic backup in two steps', async ({ page }) => {
  await open(page, { library: [novel('a', 'Mother of Learning', 10)] })
  await nav(page, 'Settings')
  await page.locator('button', { hasText: 'Back up now' }).click()
  await expect(page.locator('.settings-block .anime-toast')).toContainText('Automatic backup created.')
  await expect(page.locator('.settings-row')).toHaveCount(1)
  await page.evaluate(() => localStorage.setItem('library', '[]'))
  await page.reload()
  await nav(page, 'Settings')
  const restore = page.locator('.settings-row').last().locator('button')
  await restore.click()
  await expect(restore).toHaveText('Confirm restore')
  await Promise.all([page.waitForEvent('load'), restore.click()])
  await expect(page.locator('aside.sidebar')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('library')!).map((n: any) => n.name))).toEqual(['Mother of Learning'])
})

test('local videos: grouped, resume, keyboard shortcuts, next video', async ({ page }) => {
  await open(page, {
    storage: { mode: 'anime', 'lastPage:anime': 'localVideos' },
    videos: [{ relPath: 'Popeye/S01/01 - Taxi-Turvy.webm' }, { relPath: 'Popeye/S01/02 - Patriotic Popeye.webm' }, { relPath: 'Superman/01 - The Mad Scientist.webm' }]
  })
  await expect(page.locator('.localgroup h3')).toHaveText(['Popeye/S01 2', 'Superman 1'])
  await page.locator('.localcard').first().click()
  const video = page.locator('.local-player video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  await page.locator('main h1').click()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThanOrEqual(10)
  await page.keyboard.press('m')
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true)
  await expect(page.locator('.player-hint b')).toHaveText('02 - Patriotic Popeye.webm')
  await page.keyboard.press('n')
  await expect(page.locator('.local-player h2')).toHaveText('02 - Patriotic Popeye.webm')
})
