import { test, expect, type Page } from '@playwright/test'
import { open, novel, nav } from './helpers'

// Select characters [from, to) of the n-th paragraph, like a mouse drag would.
async function select(page: Page, n: number, from: number, to: number) {
  await page.evaluate(([n, from, to]) => {
    const p = document.querySelectorAll('.readercontent p')[n]
    const tn = p.firstChild!
    const r = document.createRange(); r.setStart(tn, from); r.setEnd(tn, to)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(r)
    p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }, [n, from, to])
}

test('highlight a passage; it is painted again after a restart', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await select(page, 2, 0, 11) // "Paragraph 3"
  await expect(page.locator('.selbar')).toBeVisible()
  await page.locator('.selcolor.c-green').click()
  await expect(page.locator('.selsaved')).toHaveText('Highlighted')
  expect(await page.evaluate(() => (CSS as any).highlights.get('nr-hl-green')?.size)).toBe(1)
  await page.reload()
  await page.locator('.lib-resume .primary').click()
  await page.locator('.readercontent').waitFor()
  await expect.poll(() => page.evaluate(() => { const h = (CSS as any).highlights.get('nr-hl-green'); return h ? [...h][0].toString() : '' })).toBe('Paragraph 3')
})

test('add a note, find it in Bookmarks & notes, edit and delete it', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await select(page, 4, 12, 43) // "of chapter 1. The lantern light"
  await page.locator('.seltext').click()
  await page.locator('.selnote textarea').fill('Lovely image')
  await page.locator('.selnote button.primary').click()
  await expect(page.locator('.selsaved')).toHaveText('Note saved')
  await nav(page, 'Bookmarks & notes')
  await expect(page.locator('.notesgroup h2')).toContainText('The Lantern Road')
  await expect(page.locator('.noteitem blockquote')).toHaveText('of chapter 1. The lantern light')
  await expect(page.locator('.noteitem .notetext')).toHaveText('Lovely image')
  await page.locator('.noteitem button', { hasText: 'Edit note' }).click()
  await page.locator('.noteitem textarea').fill('Lovely image, reread later')
  await page.locator('.noteitem .selnote button.primary').click()
  await expect(page.locator('.noteitem .notetext')).toHaveText('Lovely image, reread later')
  await page.locator('.noteitem .removebtn').click()
  await expect(page.locator('.lib-empty')).toContainText('Nothing saved yet')
})

test('bookmark a place and reopen it at the same paragraph', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3)] })
  await page.locator('.libcard .primary').click()
  await page.keyboard.press('ArrowRight') // chapter 2
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  await page.locator('.readercontent p').nth(3).hover()
  await page.mouse.wheel(0, 1800)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000)
  const y = await page.evaluate(() => scrollY)
  await page.mouse.wheel(0, -60) // bring the toolbar back
  await expect(page.locator('.readerbar')).not.toHaveClass(/hidden/)
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y - 200) // still deep in the chapter
  await page.locator('.bm-toggle').click()
  await expect(page.locator('.selsaved')).toHaveText('Bookmark added')
  await expect(page.locator('.bm-toggle')).toHaveClass(/on/)
  const quote = await page.evaluate(() => JSON.parse(localStorage.getItem('annotations')!)[0].text)
  await page.keyboard.press('ArrowLeft') // back to chapter 1
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 1: The Road')
  await nav(page, 'Bookmarks & notes')
  await page.locator('.shelftab', { hasText: 'Bookmarks' }).click()
  await expect(page.locator('.noteitem blockquote')).toHaveText(quote)
  await page.locator('.noteitem .primary', { hasText: 'Open' }).click()
  await expect(page.locator('.readerbar-title small')).toHaveText('Chapter 2: The Road')
  const target = page.locator('.readercontent p', { hasText: quote.slice(0, 40) })
  await expect(target).toBeInViewport()
})

test('the novel page links to its saved passages', async ({ page }) => {
  await open(page, { library: [novel('n1', 'The Lantern Road', 3), novel('n2', 'Other Book', 2)] })
  await page.locator('.libcard', { hasText: 'The Lantern Road' }).locator('.primary').click()
  await select(page, 1, 0, 11)
  await page.locator('.selcolor.c-yellow').click()
  await page.keyboard.press('Alt+ArrowLeft')
  await page.locator('.libcard', { hasText: 'Other Book' }).locator('.primary').click()
  await select(page, 0, 0, 11)
  await page.locator('.selcolor.c-pink').click()
  await nav(page, 'Library')
  await page.locator('.libcard', { hasText: 'The Lantern Road' }).locator('.libtitle').click()
  await page.locator('.novelhead button', { hasText: '1 saved passage' }).click()
  await expect(page.locator('main h1')).toHaveText('Bookmarks & notes')
  await expect(page.locator('.notesgroup')).toHaveCount(1)
  await page.locator('.notes-filter').click()
  await expect(page.locator('.notesgroup')).toHaveCount(2)
})
