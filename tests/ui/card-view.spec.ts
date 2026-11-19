// Covers or list: the libraries and Discover show their titles as a wall of covers (the
// default) or as the detailed list; one choice for the whole app, remembered.
import { test, expect, type Page } from '@playwright/test'
import { open, setup, novel } from './helpers'

const LIB = [novel('n1', 'Mother of Learning', 108), novel('n2', 'Shadow Slave', 2400), novel('n3', 'Lord of the Mysteries', 1430), novel('n4', 'Beware of Chicken', 40), novel('n5', 'The Extraordinarily Long Title Of A Story That Never Seems To End', 12)]
const vid = (i: number, name: string) => ({ id: 'series' + i, name, sourceId: '42', sourceName: 'Mapple', url: '/s/' + i, episodes: 8, addedAt: Date.now() - i * 1000 })
const columns = (page: Page, sel: string) => page.evaluate(s => new Set(Array.from(document.querySelectorAll(s)).map(e => Math.round(e.getBoundingClientRect().left))).size, sel)

test('covers by default: upright cards, several per row; the list is one click away and remembered', async ({ page }) => {
  // cardView '' = no choice made yet (the tests otherwise start on the list).
  await open(page, { library: LIB, reading: { n1: { index: 41 } }, storage: { cardView: '', seriesLibrary: JSON.stringify([vid(1, 'Lanterns'), vid(2, 'Severance')]) } })
  const grid = page.locator('.libgrid')
  await expect(grid).toHaveClass(/posters/)
  await expect(page.getByRole('button', { name: 'Covers' })).toHaveAttribute('aria-pressed', 'true')
  // Upright: the cover is as wide as its card and taller than wide; five titles fit on one row here.
  const card = await page.locator('.libcard').first().boundingBox(), cover = await page.locator('.libcard').first().locator('.libcover').boundingBox()
  expect(Math.abs(cover!.width - card!.width)).toBeLessThan(4)
  expect(cover!.height).toBeGreaterThan(cover!.width * 1.4)
  expect(await columns(page, '.libcard')).toBe(5)
  // Same actions as in the list: the main button reads on, the cover and the title open the book's page.
  const mol = page.locator('.libcard', { hasText: 'Mother of Learning' })
  await expect(mol.locator('.primary')).toHaveText('Ch. 42')
  await expect(mol.getByRole('button', { name: 'Continue · Ch. 42' })).toBeVisible()
  await expect(page.locator('.libcard', { hasText: 'Shadow Slave' }).locator('.primary')).toHaveText('Read')
  // A long title takes two lines at most, and the cards of a row keep the same height.
  const long = page.locator('.libcard', { hasText: 'Extraordinarily' })
  expect((await long.locator('.libtitle').boundingBox())!.height).toBeLessThan(46)
  expect(Math.abs((await long.boundingBox())!.height - card!.height)).toBeLessThan(2)
  await mol.locator('.primary').click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 42: The Road')
  await page.keyboard.press('Alt+ArrowLeft')
  await page.locator('.libcard', { hasText: 'Shadow Slave' }).locator('.libcard-cover').click()
  await expect(page.locator('.novelhead h1')).toHaveText('Shadow Slave')
  await page.keyboard.press('Alt+ArrowLeft')
  // The list: the detailed cards come back, with their full labels.
  await page.getByRole('button', { name: 'List' }).click()
  await expect(grid).not.toHaveClass(/posters/)
  await expect(mol.locator('.primary')).toHaveText('Continue · Ch. 42')
  expect(await page.evaluate(() => localStorage.getItem('cardView'))).toBe('list')
  expect(await columns(page, '.libcard')).toBeLessThan(4)
  // Remembered after a restart, and the same in the other sections and in Discover.
  await page.reload()
  await expect(page.locator('.libgrid')).not.toHaveClass(/posters/)
  await page.keyboard.press('Control+3')
  await expect(page.locator('.libcard', { hasText: 'Lanterns' })).toBeVisible()
  await expect(page.locator('.libgrid')).not.toHaveClass(/posters/)
  await page.getByRole('button', { name: 'Covers' }).click()
  await expect(page.locator('.libgrid')).toHaveClass(/posters/)
  await expect(page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' })).toHaveText('Episodes')
  await page.keyboard.press('Control+1')
  await expect(page.locator('.libgrid')).toHaveClass(/posters/)
  await page.locator('.sidebar').getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.locator('.resultgrid').first()).toHaveClass(/posters/)
  expect(await columns(page, '.resultcard')).toBeGreaterThanOrEqual(3)
  await page.getByRole('button', { name: 'List' }).click()
  await expect(page.locator('.resultgrid').first()).not.toHaveClass(/posters/)
})

test('covers on a phone: two side by side, the menu of a card stays on the screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page, { library: LIB, reading: { n1: { index: 41 } }, storage: { cardView: '' } })
  await page.goto('/')
  await page.locator('.libcard').first().waitFor()
  expect(await columns(page, '.libcard')).toBe(2)
  for (const i of [0, 1]) {
    await page.locator('.libcard').nth(i).locator('.more-btn').click()
    const box = await page.locator('.more-pop').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(360)
    await page.keyboard.press('Escape')
    await expect(page.locator('.more-pop')).toHaveCount(0)
  }
})
