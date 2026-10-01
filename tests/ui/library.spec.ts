import { test, expect } from '@playwright/test'
import { open, novel } from './helpers'

const LIB = [novel('mol', 'Mother of Learning', 108), novel('boc', 'Beware of Chicken', 40), novel('pge', 'A Practical Guide to Evil', 30), novel('ttr', 'The Lantern Road', 12, { shelf: 'dropped' })]
const READING = { mol: { index: 41 }, pge: { index: 29, at: Date.now() - 50 * 3600_000 } }
const titles = (page: any) => page.locator('.libcard h2').allInnerTexts()

test('resume banner, progress, sorting and filter', async ({ page }) => {
  await open(page, { library: LIB, reading: READING })
  await expect(page.locator('.lib-resume')).toContainText('Mother of Learning')
  await expect(page.locator('.lib-resume .primary')).toHaveText('Continue · Ch. 42')
  await expect(page.locator('.libcard', { hasText: 'Mother of Learning' }).locator('small').last()).toContainText('42 / 108 · 66 left')
  await page.selectOption('.lib-sort select', 'title')
  expect(await titles(page)).toEqual(['A Practical Guide to Evil', 'Beware of Chicken', 'Mother of Learning', 'The Lantern Road'])
  await page.fill('.lib-toolbar input', 'chicken')
  expect(await titles(page)).toEqual(['Beware of Chicken'])
})

test('shelves: inferred, tab counts, manual change, opening a planned novel moves it to Reading', async ({ page }) => {
  await open(page, { library: LIB, reading: READING })
  const tab = (name: string) => page.locator('.shelftab', { hasText: name })
  await expect(tab('All')).toContainText('4')
  await expect(tab('Reading')).toContainText('1')     // Mother of Learning
  await expect(tab('Plan to read')).toContainText('1') // Beware of Chicken (not started)
  await expect(tab('Completed')).toContainText('1')    // Practical Guide: last chapter read
  await expect(tab('Dropped')).toContainText('1')      // explicit shelf
  await tab('Completed').click()
  expect(await titles(page)).toEqual(['A Practical Guide to Evil'])
  await tab('All').click()
  await page.locator('.libcard', { hasText: 'Mother of Learning' }).locator('.shelfselect').selectOption('dropped')
  await expect(tab('Dropped')).toContainText('2')
  await page.locator('.libcard', { hasText: 'Beware of Chicken' }).locator('.primary').click()
  await expect(page.locator('.readercontent')).toBeVisible()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(tab('Reading')).toContainText('1')
  await expect(page.locator('.libcard', { hasText: 'Beware of Chicken' }).locator('.shelfselect')).toHaveValue('reading')
  await page.reload()
  await expect(tab('Dropped')).toContainText('2') // saved
})

test('removal can be undone, with reading progress', async ({ page }) => {
  await open(page, { library: LIB, reading: READING })
  await page.locator('.libcard', { hasText: 'Mother of Learning' }).locator('.removebtn').click()
  await expect(page.locator('.lib-undo')).toContainText('Removed “Mother of Learning”.')
  await expect(page.locator('.libcard', { hasText: 'Mother of Learning' })).toHaveCount(0)
  await page.locator('.lib-undo .undo-btn').click()
  await expect(page.locator('.libcard', { hasText: 'Mother of Learning' })).toHaveCount(1)
  await expect(page.locator('.lib-resume')).toContainText('Mother of Learning')
})

test('new chapter check shows a badge that clears when the novel is opened', async ({ page }) => {
  await open(page, { library: LIB, reading: READING, newChapters: { mol: 113 } })
  await page.locator('.lib-update').click()
  await expect(page.locator('.lib-update-status')).toContainText('1 novel has new chapters.')
  await expect(page.locator('.libcard', { hasText: 'Mother of Learning' }).locator('.newbadge')).toHaveText('+5 new')
  await page.locator('.libcard', { hasText: 'Mother of Learning' }).locator('.libtitle').click()
  await expect(page.locator('.novelhead-meta small')).toContainText('42 / 113 read')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.locator('.newbadge')).toHaveCount(0)
})

test('empty library leads to search', async ({ page }) => {
  await open(page, { library: [] })
  await page.locator('.lib-empty .primary').click()
  await expect(page.locator('main h1')).toHaveText('Find a title everywhere')
})
