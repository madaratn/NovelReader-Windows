// Long lists stay quick: a novel of thousands of chapters opens around the chapter being
// read (not with everything before it), a season of a thousand episodes is shown by
// hundreds, and a long history comes day after day.
import { test, expect, type Page } from '@playwright/test'
import { setup, novel } from './helpers'

const rowsDrawn = (page: Page) => page.locator('.chapterrow').count()
const inBox = (page: Page, sel: string) => page.evaluate(sel => { const el = document.querySelector(sel), box = document.querySelector('.chapterlist'); if (!el || !box) return false; const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }, sel)

test('a 3,000-chapter novel opens around the chapter being read; the rest comes while scrolling, without moving the list', async ({ page }) => {
  await setup(page, { library: [novel('big', 'The Very Long Novel', 3000)], reading: { big: { index: 1499 } } })
  await page.goto('/')
  await page.locator('.libtitle').click()
  const current = page.locator('.chapterrow.current')
  await expect(current).toContainText('Reading · Ch. 1500')
  // Around it, not the 1,499 before it.
  expect(await rowsDrawn(page)).toBeLessThanOrEqual(260)
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 1460')
  expect(await inBox(page, '.chapterrow.current')).toBe(true)
  await expect(page.locator('.chaptercount')).toHaveText('3000 chapters')
  // Near the top of what is drawn: the earlier chapters arrive, and what was on screen has not moved.
  const before = await page.evaluate(() => { const box = document.querySelector('.chapterlist') as HTMLElement; box.scrollTop = 260; return Array.from(box.querySelectorAll('.chapterrow')).slice(4, 7).map(r => [r.textContent, Math.round(r.getBoundingClientRect().top)]) })
  await expect.poll(() => rowsDrawn(page)).toBeGreaterThan(400)
  const after = await page.evaluate((names) => Array.from(document.querySelectorAll('.chapterrow')).filter(r => (names as string[]).includes(r.textContent || '')).map(r => [r.textContent, Math.round(r.getBoundingClientRect().top)]), before.map(x => x[0]))
  expect(after.map(x => x[0])).toEqual(before.map(x => x[0]))
  for (let i = 0; i < before.length; i++) expect(Math.abs((after[i][1] as number) - (before[i][1] as number)), String(before[i][0])).toBeLessThanOrEqual(2)
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 1220')
  // At the end of what is drawn: the next ones.
  const drawn = await rowsDrawn(page)
  await page.evaluate(() => { const box = document.querySelector('.chapterlist') as HTMLElement; box.scrollTop = box.scrollHeight })
  await expect.poll(() => rowsDrawn(page)).toBeGreaterThan(drawn)
  // "Show current chapter" comes back to it.
  await page.getByRole('button', { name: 'Show current chapter' }).click()
  await expect.poll(() => inBox(page, '.chapterrow.current')).toBe(true)
  // The filter looks in every chapter, drawn or not; emptied, the list is around the current chapter again.
  await page.fill('.chaptertools input', '2999')
  await expect(page.locator('.chapterrow .chaptername')).toHaveText(['Chapter 2999: The Road'])
  await page.fill('.chaptertools input', '')
  await expect.poll(() => inBox(page, '.chapterrow.current')).toBe(true)
  expect(await rowsDrawn(page)).toBeLessThanOrEqual(500)
  // Newest first: the same, from the other end.
  await page.getByRole('radio', { name: 'Newest first' }).click()
  await expect.poll(() => inBox(page, '.chapterrow.current')).toBe(true)
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 1540')
  // A novel not started: from its first chapter, as before.
  await page.evaluate(() => localStorage.removeItem('reading:big')); await page.reload()
  await page.locator('.libtitle').click()
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 3000')
  await page.getByRole('radio', { name: 'Oldest first' }).click()
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 1:')
  await expect(page.locator('.show-earlier')).toHaveCount(0)
})

test('on a phone the page scrolls: the list starts a little before the current chapter, the earlier ones on request', async ({ page }) => {
  // (The Android layout: the list has no scroll bar of its own.)
  await page.addInitScript(() => { const add = () => document.documentElement?.classList.add('android'); add(); new MutationObserver(add).observe(document, { childList: true }) })
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { library: [novel('big', 'The Very Long Novel', 3000)], reading: { big: { index: 1499 } }, storage: { cardView: 'posters' } })
  await page.goto('/')
  await page.locator('.libcard-cover').first().click()
  await expect(page.locator('.novelhead h1')).toBeVisible()
  // Opening the novel leaves its cover and "Continue" on screen.
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0)
  expect(await rowsDrawn(page)).toBeLessThanOrEqual(260)
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 1460')
  // "Show current chapter" brings it to the middle of the screen.
  await page.getByRole('button', { name: 'Show current chapter' }).click()
  await expect(page.locator('.chapterrow.current')).toBeInViewport()
  // The earlier chapters: a button over the first row; they are added above it and nothing moves.
  await page.locator('.show-earlier').scrollIntoViewIfNeeded()
  const first = page.locator('.chapterrow').first(), name = await first.textContent(), y = (await first.boundingBox())!.y
  await page.locator('.show-earlier').click()
  await expect.poll(() => rowsDrawn(page)).toBeGreaterThan(400)
  const same = page.locator('.chapterrow', { hasText: name! }).first()
  expect(Math.abs((await same.boundingBox())!.y - y)).toBeLessThanOrEqual(2)
  await expect(page.locator('.chapterrow').first()).toContainText('Chapter 1220')
})

test('a season of a thousand episodes is shown by hundreds, the one being watched first', async ({ page }) => {
  const eps = Array.from({ length: 1150 }, (_, i) => ({ name: 'Episode ' + (i + 1), url: '/ep/' + (i + 1), episode_number: i + 1 }))
  const watched: Record<string, string> = {}; for (let i = 1; i <= 437; i++) watched['mediapos:anime:anime1:/ep/' + i] = JSON.stringify({ t: 0, d: 0, done: true, at: 1 })
  await setup(page, { storage: { ...watched, mode: 'anime', 'lastPage:anime': 'anime', animeLibrary: JSON.stringify([{ id: 'anime1', name: 'One Piece', sourceId: '42', sourceName: 'Mapple', url: '/a/1', episodes: 1150, addedAt: Date.now() }]) } })
  await page.addInitScript((eps) => { const w = window as any, base = w.novelReader; w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true }), miwayomiFetch: async (p: string) => p.includes('/details') ? { title: 'One Piece' } : p.includes('/episodes') ? eps : [] } }, eps)
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'One Piece' }).getByRole('button', { name: 'Show episodes' }).click()
  await expect(page.locator('.episodecell').first()).toBeVisible()
  // The hundred with the next episode to watch (438), not 1,150 rows.
  const parts = page.getByRole('tablist', { name: 'Episodes' })
  await expect(parts.getByRole('tab')).toHaveCount(12)
  await expect(parts.getByRole('tab', { selected: true })).toHaveText('401–500')
  await expect(page.locator('.episodecell')).toHaveCount(100)
  await expect(page.locator('.episodecell').first()).toContainText('Episode 401')
  await expect(page.locator('.episode-tools small')).toHaveText('437 / 1150 watched')
  // Another hundred, two clicks away.
  await parts.getByRole('tab', { name: '1101–1150' }).click()
  await expect(page.locator('.episodecell')).toHaveCount(50)
  await expect(page.locator('.episodecell').last()).toContainText('Episode 1150')
  // The number stays whole in its badge, with three digits and with four.
  for (const cell of [page.locator('.episodecell').first(), page.locator('.episodecell').last()]) expect(await cell.locator('.episodebadge').evaluate((b: HTMLElement) => b.scrollWidth <= b.clientWidth && b.scrollHeight <= b.clientHeight)).toBe(true)
  // Marking is still counted over the whole series, and "the previous ones" (Shift) reaches back across the hundreds.
  await page.locator('.episodecell').first().locator('.ep-watch').click({ force: true, modifiers: ['Shift'] })
  await expect(page.locator('.episode-tools small')).toHaveText('1101 / 1150 watched')
  // Last to first: the hundreds too.
  await page.locator('.episode-tools button').first().click()
  await expect(parts.getByRole('tab').first()).toHaveText('1101–1150')
  await expect(page.locator('.episodecell').first()).toContainText('Episode 1150')
  // A series of ordinary length has no such row.
  await page.evaluate(() => localStorage.setItem('epOrder', 'asc'))
})

test('a long history is drawn day after day', async ({ page }) => {
  const now = Date.now(), hist = Array.from({ length: 1000 }, (_, i) => ({ at: now - i * 3 * 3600e3, kind: 'books', id: 'n1', name: 'Shadow Slave', sub: 'Chapter ' + (1000 - i), on: 'pc' }))
  await setup(page, { library: [novel('n1', 'Shadow Slave', 1200)], reading: { n1: { index: 999 } }, storage: { history: JSON.stringify(hist) } })
  await page.goto('/')
  await page.locator('aside.sidebar .home-open').click()
  await page.locator('.home-panel').getByRole('button', { name: 'Whole history' }).click()
  await expect(page.locator('.history-page li').first()).toContainText('Chapter 1000')
  expect(await page.locator('.history-page li').count()).toBeLessThanOrEqual(130)
  // A title of the library is a link, wherever it is in the list.
  await expect(page.locator('.history-page li').first().getByRole('button', { name: 'Shadow Slave' })).toBeVisible()
  // The older days come at the end of the page.
  await page.locator('.history-page li').last().scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator('.history-page li').count()).toBeGreaterThan(200)
})
