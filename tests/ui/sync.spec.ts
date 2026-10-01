import { test, expect } from '@playwright/test'
import { open, novel, nav } from './helpers'

const otherPc = (data: Record<string, string>) => ({ app: 'NovelReader', version: 1, at: Date.now() - 600_000, deviceId: 'laptop', deviceName: 'LAPTOP', data })

test('sync with another PC through a cloud folder', async ({ page }) => {
  await open(page, { library: [novel('mol', 'Mother of Learning', 108)], reading: { mol: { index: 10, at: Date.now() - 3600_000 } } })
  // The laptop already synced: it has another novel, read further in Mother of Learning, and removed nothing.
  await page.evaluate(remote => sessionStorage.setItem('__syncFile', JSON.stringify(remote)), otherPc({
    library: JSON.stringify([{ id: 'boc', name: 'Beware of Chicken', chapterCount: 40, chapters: Array.from({ length: 40 }, (_, i) => ({ name: 'Chapter ' + (i + 1), path: 'ch-' + (i + 1) })), addedAt: Date.now() - 86400_000 }]),
    'reading:mol': JSON.stringify({ index: 57, path: 'ch-58', at: Date.now() - 600_000 })
  }))
  await nav(page, 'Settings')
  await page.locator('button', { hasText: 'Choose a synced folder' }).click()
  await expect(page.locator('.settings-block', { hasText: 'Sync between PCs' })).toContainText('C:/Users/test/OneDrive')
  await expect(page.locator('.settings-block', { hasText: 'Sync between PCs' })).toContainText('Last synced just now.')
  await nav(page, 'Library')
  await expect(page.locator('.libcard h2')).toHaveText(['Beware of Chicken', 'Mother of Learning'].sort().reverse() as any)
  await expect(page.locator('.lib-resume .primary')).toHaveText('Continue · Ch. 58') // the laptop's newer position
  // This PC's data was written back for the laptop to pick up.
  const file = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__syncFile')!))
  expect(file.deviceName).toBe('THIS-PC')
  expect(JSON.parse(file.data.library).map((n: any) => n.id).sort()).toEqual(['boc', 'mol'])
})

test('a novel removed here does not come back from the other PC', async ({ page }) => {
  await open(page, { library: [novel('mol', 'Mother of Learning', 108), novel('boc', 'Beware of Chicken', 40)] })
  await nav(page, 'Settings')
  await page.locator('button', { hasText: 'Choose a synced folder' }).click()
  await expect(page.locator('.settings-block', { hasText: 'Sync between PCs' })).toContainText('Last synced')
  await nav(page, 'Library')
  await page.locator('.libcard', { hasText: 'Beware of Chicken' }).locator('.removebtn').click()
  // The other PC still lists it in an older copy.
  await page.evaluate(remote => sessionStorage.setItem('__syncFile', JSON.stringify(remote)), otherPc({
    library: JSON.stringify([{ id: 'mol', name: 'Mother of Learning', addedAt: Date.now() - 3600_000 }, { id: 'boc', name: 'Beware of Chicken', addedAt: Date.now() - 3600_000 }])
  }))
  await nav(page, 'Settings')
  await page.locator('button', { hasText: 'Sync now' }).click()
  await expect(page.locator('.settings-block', { hasText: 'Sync between PCs' })).toContainText('Last synced just now.')
  await nav(page, 'Library')
  await expect(page.locator('.libcard h2')).toHaveText(['Mother of Learning'])
})
