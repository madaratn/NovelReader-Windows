import { test, expect } from '@playwright/test'
import { open, novel, nav } from './helpers'

test('download the next chapters, then read them without a connection', async ({ page, context }) => {
  await open(page, { library: [novel('mol', 'Mother of Learning', 30)], reading: { mol: { index: 4 } } })
  await page.locator('.libtitle').click()
  await expect(page.locator('.offline-label')).toContainText('0 chapters available offline')
  await page.locator('.offlinebar button', { hasText: 'Download' }).click()
  await expect(page.locator('.offline-label')).toContainText('10 chapters available offline')
  await expect(page.locator('.chapterrow .offline-mark')).toHaveCount(10)       // chapters 5..14
  await expect(page.locator('.chapterrow', { hasText: 'Chapter 5:' }).locator('.offline-mark')).toHaveCount(1)
  await expect(page.locator('.chapterrow', { hasText: 'Chapter 4:' }).locator('.offline-mark')).toHaveCount(0)
  const fetched = await page.evaluate(() => (window as any).__calls.parseChapter)
  await context.setOffline(true)
  await page.locator('.chapterrow', { hasText: 'Chapter 7:' }).click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 7: The Road')
  expect(await page.evaluate(() => (window as any).__calls.parseChapter)).toBe(fetched) // served from the offline copy
  await page.keyboard.press('Alt+ArrowLeft')
  await page.locator('.chapterrow', { hasText: 'Chapter 20:' }).click()
  await expect(page.locator('[role=alert]')).toContainText('You are offline and this chapter is not downloaded.')
  await context.setOffline(false)
  await page.locator('.offlinebar button', { hasText: 'Delete downloads' }).click()
  await expect(page.locator('.chapterrow .offline-mark')).toHaveCount(0)
})

test('import an LNReader (Android) backup', async ({ page }) => {
  await page.addInitScript(() => {
    const ch = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Chapter ${i + 1}`, path: `/c/${i + 1}` }))
    ;(window as any).__lnImport = { ok: true, appVersion: '2.0.3', skipped: 1, novels: [
      { pluginId: 'src1', path: '/fiction/1', name: 'Mother of Learning', author: 'nobody103', cover: '', chapters: ch(20), reading: { index: 4, path: '/c/5', at: Date.now() - 3600_000, scroll: 0.3 } },
      { pluginId: 'src2', path: '/fiction/2', name: 'Beware of Chicken', author: 'Casualfarmer', cover: '', chapters: ch(10), reading: null },
      { pluginId: 'gone.plugin', path: '/x', name: 'Unknown Source Novel', author: '', cover: '', chapters: ch(3), reading: null }
    ] }
  })
  await open(page, { library: [] })
  await nav(page, 'Settings')
  await page.locator('button', { hasText: 'Import an LNReader backup' }).click()
  await expect(page.locator('.settings-block .anime-toast.ok')).toContainText('2 novels imported · 1 skipped (source not available: gone.plugin)')
  await page.locator('.settings-block .undo-btn', { hasText: 'Open library' }).click()
  await expect(page.locator('.libcard h2')).toHaveText(['Mother of Learning', 'Beware of Chicken'])
  await expect(page.locator('.lib-resume .primary')).toHaveText('Continue · Ch. 5')
  // A second import does not duplicate anything.
  await nav(page, 'Settings')
  await page.locator('button', { hasText: 'Import an LNReader backup' }).click()
  await expect(page.locator('.settings-block .anime-toast.ok')).toContainText('0 novels imported · 2 already in your library')
})

test('find in chapter with Ctrl+F', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await page.locator('.readercontent').waitFor()
  await page.keyboard.press('Control+f')
  await expect(page.locator('.findbar input')).toBeFocused()
  await page.keyboard.type('lantern')
  await expect(page.locator('.findcount')).toHaveText('1 of 40')
  await page.keyboard.press('Enter')
  await expect(page.locator('.findcount')).toHaveText('2 of 40')
  await page.keyboard.press('Shift+Enter')
  await expect(page.locator('.findcount')).toHaveText('1 of 40')
  expect(await page.evaluate(() => (CSS as any).highlights.get('nr-find').size)).toBe(40)
  await page.keyboard.press('Escape')
  await expect(page.locator('.findbar')).toHaveCount(0)
  expect(await page.evaluate(() => (CSS as any).highlights.has('nr-find'))).toBe(false)
})

test('reading statistics: week totals, streak, chapter counted when read', async ({ page }) => {
  const key = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const days: Record<string, { c: number, s: number }> = {}
  for (let i = 1; i <= 3; i++) { const d = new Date(); d.setDate(d.getDate() - i); days[key(d)] = { c: i * 2, s: 600 * i } } // yesterday..3 days ago
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)], storage: { readingStats: JSON.stringify(days) } })
  await expect(page.locator('.stats-head')).toContainText('12 chapters · 1 h')
  await expect(page.locator('.stats-tiles')).toContainText('3days in a row')
  await expect(page.locator('.stats-bar')).toHaveCount(7)
  await page.locator('.stats-bar').nth(5).hover()
  await expect(page.locator('.stats-tip')).toContainText('2 chapters · 10 min')
  await page.locator('.libcard .primary').click()
  await page.locator('.readercontent').waitFor()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.locator('.stats-head')).toContainText('13 chapters')
  await expect(page.locator('.stats-tiles')).toContainText('4days in a row')
})
