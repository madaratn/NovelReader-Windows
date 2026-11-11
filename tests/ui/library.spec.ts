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

test('"Continue": one panel with what is in progress in every section, shown at start, straight back into the book', async ({ page }) => {
  const { setup, novel: nv } = await import('./helpers')
  await setup(page, {
    library: [nv('n1', 'Mother of Learning', 100), nv('n2', 'Untouched', 10), nv('n3', 'With News', 10, { newChapters: 2 } as any)],
    reading: { n1: { index: 41, progress: 0.5 } },                                   // 2 h ago (helper default)
    storage: { homeAtStart: '1',
      seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', url: '/series/1', episodes: 5 }, { id: 'series2', name: 'Finished', sourceId: '42', url: '/series/2', episodes: 3 }]),
      'lastEpInfo:series1': JSON.stringify({ url: '/ep/3', name: 'S1 E3', n: 3, at: Date.now() - 60_000 }),
      'mediapos:series:series1:/ep/3': JSON.stringify({ t: 300, d: 1200, at: Date.now() - 60_000 }),
      'lastEpInfo:series2': JSON.stringify({ url: '/ep/3', name: 'S1 E3', n: 3, at: Date.now() - 30_000 }),
      'mediapos:series:series2:/ep/3': JSON.stringify({ t: 1200, d: 1200, done: true, at: Date.now() - 30_000 }),
      movieLibrary: JSON.stringify([{ id: 'm1', name: 'Dropped Film', sourceId: '42', url: '/m/1', shelf: 'dropped' }]),
      'lastEpInfo:m1': JSON.stringify({ url: '/m/1', at: Date.now() - 10_000 }) } })
  await page.goto('/')
  const panel = page.getByRole('dialog', { name: 'Continue' })
  await expect(panel).toBeVisible()
  const cards = panel.locator('.home-grid').first().locator('.home-card')
  // Most recent first; the finished series and the dropped film are not there.
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('Series'); await expect(cards.nth(0)).toContainText('Lanterns'); await expect(cards.nth(0)).toContainText('S1 E3')
  await expect(cards.nth(1)).toContainText('Books'); await expect(cards.nth(1)).toContainText('Mother of Learning'); await expect(cards.nth(1)).toContainText('Chapter 42')
  expect(await cards.nth(0).locator('.libbar span').evaluate((e: HTMLElement) => e.style.width)).toBe('25%')
  await expect(panel.locator('.home-grid').nth(1)).toContainText('With News')
  await expect(panel.locator('.home-grid').nth(1)).toContainText('2 new chapters')
  await cards.nth(1).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.readerpage')).toContainText('Chapter 42', { timeout: 15000 })
  // Reopened from the sidebar; "not at start" is remembered.
  await page.keyboard.press('Escape')
  await page.goto('/')
  await expect(panel).toBeVisible()
  await panel.getByLabel('Show this when NovelReader starts').uncheck()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await page.reload()
  await expect(page.locator('aside.sidebar')).toBeVisible()
  await expect(panel).toHaveCount(0)
  await page.locator('.sidebar .home-open').click()
  await expect(panel).toBeVisible()
})
