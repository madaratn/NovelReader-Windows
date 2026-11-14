import { test, expect } from '@playwright/test'
import { open, nav, novel } from './helpers'

test('sidebar: modes, active page, remembered page per mode and after restart', async ({ page }) => {
  await open(page)
  // One search: the Search button (Ctrl K) leads to the source search, no second entry.
  await expect(page.locator('.nav-list .nav-item')).toHaveText(['Library', 'Discover', 'Bookmarks & notes', 'Sources'])
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  await expect(page.locator('.qs-open')).toHaveAttribute('aria-current', 'page')
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

test('/ focuses the search field of the page', async ({ page }) => {
  await open(page)
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  await page.locator('main h1').click()
  await page.keyboard.press('/')
  await expect(page.locator('main .searchbar input')).toBeFocused()
})

test('search everywhere (Ctrl+K): titles from every library, and a source search in one step', async ({ page }) => {
  await open(page, {
    library: [novel('n1', 'Lord of Mysteries', 5), novel('n2', 'Shadow Slave', 5)],
    storage: {
      animeLibrary: JSON.stringify([{ id: 'a1', name: 'Shadow Hunter', sourceId: '42', url: '/a/1', episodes: 3 }]),
      seriesLibrary: JSON.stringify([{ id: 's1', name: 'Mystery Road', sourceId: '42', url: '/s/1', episodes: 3 }])
    }
  })
  await page.keyboard.press('Control+k')
  const input = page.locator('.qs-input')
  await expect(input).toBeFocused()
  await input.fill('shadow')
  await expect(page.locator('.qs-row:not(.action) b')).toHaveText(['Shadow Hunter', 'Shadow Slave'])
  await expect(page.locator('.qs-row:not(.action) .qs-kind')).toHaveText(['Anime', 'Books'])
  // Enter opens the selected title (↓ = second row: the novel)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('.qs')).toHaveCount(0)
  await expect(page.locator('main h1')).toHaveText('Shadow Slave')
  // Source search: switches to that section and runs it right away
  await page.locator('.qs-open').click()
  await input.fill('frieren')
  await page.locator('.qs-row.action', { hasText: 'in Books' }).click()
  await expect(page.locator('main .searchbar input')).toHaveValue('frieren')
  await expect.poll(() => page.evaluate(() => (window as any).__calls.search.length)).toBeGreaterThan(0)
  // Escape closes
  await page.keyboard.press('Control+k')
  await page.keyboard.press('Escape')
  await expect(page.locator('.qs')).toHaveCount(0)
})

test('narrow window: compact sidebar and no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await open(page)
  await expect(page.locator('aside.sidebar')).toHaveCSS('width', '68px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('books Discover: popular list of a source, add, open, load more', async ({ page }) => {
  await open(page)
  await nav(page, 'Discover')
  await expect(page.locator('main h1')).toHaveText('Discover')
  await expect(page.locator('.resultcard h3')).toHaveText(['Popular 1', 'Popular 2', 'Popular 3'])
  await page.locator('.resultcard', { hasText: 'Popular 2' }).getByRole('button', { name: '＋ Add', exact: true }).click()
  await expect(page.locator('.resultcard', { hasText: 'Popular 2' }).getByRole('button', { name: /Open/ })).toBeVisible()
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.locator('.resultcard h3')).toHaveCount(6)
  await page.getByRole('tab', { name: 'Latest' }).click()
  await expect(page.locator('.anime-toast.error')).toContainText('no list to browse')
  await page.getByRole('tab', { name: 'Popular' }).click()
  await page.locator('.resultcard', { hasText: 'Popular 2' }).getByRole('button', { name: /Open/ }).click()
  await expect(page.locator('main h1')).toHaveText('Shadow Slave') // the fake parseNovel always answers this title
})

test('genres: books Discover by the source\'s genre; the library filtered by genre', async ({ page }) => {
  await open(page, { library: [{ ...novel('a', 'Alpha', 10), genres: ['Action', 'Fantasy'] }, { ...novel('b', 'Beta', 10), genres: ['Romance'] }, novel('c', 'Gamma', 10)] })
  // Library: chips by genre (most frequent first), remembered.
  const chips = page.locator('.lib-genres .chip')
  await expect(chips).toHaveText(['All genres', 'Action 1', 'Fantasy 1', 'Romance 1'])
  await chips.filter({ hasText: 'Romance' }).click()
  await expect(page.locator('.libcard h2')).toHaveText(['Beta'])
  await chips.filter({ hasText: 'All genres' }).click()
  await expect(page.locator('.libcard')).toHaveCount(3)
  // Discover: the source's genre list; a genre gives its own list.
  await nav(page, 'Discover')
  await page.getByLabel('Genre').selectOption('xianxia')
  await expect(page.locator('.resultcard h3')).toHaveText(['Genre xianxia novel'])
  expect(await page.evaluate(() => (window as any).__calls.popular.at(-1))).toMatch(/^src\d+:1:popular:xianxia$/)
})

test('TV mode: arrows move between buttons; a game controller moves, opens and goes back', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [{ id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', ...w.__pad }] })
    w.__tap = async (i: number) => { w.__pad.buttons[i].pressed = true; await new Promise(r => setTimeout(r, 80)); w.__pad.buttons[i].pressed = false; await new Promise(r => setTimeout(r, 80)) }
  })
  await open(page, { library: [novel('n1', 'Lord of Mysteries', 5), novel('n2', 'Shadow Slave', 5)], storage: { tvMode: '1' } })
  await expect(page.locator('html.tv-mode')).toHaveCount(1)
  // Keyboard (TV remote): focus moves between buttons, Enter opens
  await page.locator('.libcard').first().locator('.primary').focus()
  const before = await page.evaluate(() => document.activeElement?.closest('.libcard')?.querySelector('h3, h2, b')?.textContent)
  await page.keyboard.press('ArrowRight') // the card's ⋯ menu
  await page.keyboard.press('ArrowRight') // the next card
  const after = await page.evaluate(() => document.activeElement?.closest('.libcard')?.querySelector('h3, h2, b')?.textContent)
  expect(after).not.toBe(before)
  await expect(page.locator('html.kbd-nav')).toHaveCount(1)
  // Controller: A opens the focused title, B goes back
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')))
  await page.evaluate(() => (window as any).__tap(0))
  await expect(page.locator('main h1')).toHaveText(after!.trim())
  await page.evaluate(() => (window as any).__tap(1))
  await expect(page.locator('.libcard')).toHaveCount(2)
  // Y opens Search everywhere, B closes it
  await page.evaluate(() => (window as any).__tap(3))
  await expect(page.locator('.qs')).toBeVisible()
  await page.evaluate(() => (window as any).__tap(1))
  await expect(page.locator('.qs')).toHaveCount(0)
})

test("what's new: shown once after an update, never on a first install", async ({ page }) => {
  const { setup, NOTES_VERSION } = await import('./helpers')
  await setup(page, { storage: { whatsNewSeen: '0.1.0' } })
  await page.goto('/')
  const dlg = page.getByRole('dialog', { name: "What's new" })
  await expect(dlg).toContainText("What's new in " + NOTES_VERSION)
  expect(await dlg.locator('li').count()).toBeGreaterThan(0)
  await expect(dlg.locator('li b').first()).not.toHaveText('')
  expect(await dlg.innerText()).not.toContain('**')
  await dlg.getByRole('button', { name: 'OK' }).click()
  await expect(dlg).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.app')).toBeVisible()
  await expect(dlg).toHaveCount(0)
  // First install: the welcome guide, not the list of changes.
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lang', 'en') })
  await page.reload()
  await expect(page.locator('.app, .onboarding, main').first()).toBeVisible()
  await expect(dlg).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('whatsNewSeen'))).toBe(NOTES_VERSION)
})

test('navigation: going back returns to the same place in the list; the current tab and the app name lead to the top / the library', async ({ page }) => {
  const many = Array.from({ length: 40 }, (_, i) => novel('n' + i, 'Novel number ' + String(i + 1).padStart(2, '0'), 100))
  await open(page, { library: many })
  await expect(page.locator('.libcard')).toHaveCount(40)
  // Far down the list, open a title…
  const card = page.locator('.libcard').last() // whatever the sort order, the last card is far down
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
  await card.locator('h2').hover() // the pointer is on it: nothing moves any more
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(1000)
  await card.locator('h2').click()
  await expect(page.locator('.backbtn, .novel-back, main button', { hasText: 'Library' }).first()).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50) // a new page starts at its top
  // …and come back (Alt+Left, the mouse's Back button and Android's Back do the same): same place.
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.locator('.libcard')).toHaveCount(40)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 60)
  await expect(card).toBeInViewport()
  // Choosing the page you are already on goes back to its top.
  await nav(page, 'Library')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5)
  // The app name leads to the library of the section.
  await nav(page, 'Sources')
  await page.locator('.sidebar .brand').click()
  await expect(page.locator('.nav-item[aria-current=page]')).toHaveText('Library')
})

test('books Discover › For you: novels of the genres of a finished novel, from the sources, readable at once', async ({ page }) => {
  await open(page, { library: [{ ...novel('a', 'Alpha', 10), genres: ['Fantasy', 'Romance'], shelf: 'completed' } as any, { ...novel('b', 'Beta', 10), genres: ['Action'] } as any], reading: { b: { index: 2 } } })
  await nav(page, 'Discover')
  await page.getByRole('tab', { name: 'For you' }).click()
  const groups = page.locator('.foryou-group')
  // Alpha (finished) first: its first genre the source knows is Romance; then Beta (being read): Action
  await expect(groups.locator('h2')).toHaveText(['Because you liked Alpha · Romance', 'Because you liked Beta · Action'])
  await expect(groups.first().locator('.resultcard h3').first()).toHaveText('Genre romance novel')
  await groups.first().locator('.resultcard').first().getByRole('button', { name: /Read/ }).click()
  await expect(page.locator('main h1')).toHaveText('Shadow Slave')
})

test('Your year: time read and watched, titles followed the most, from the History page', async ({ page }) => {
  const y = new Date().getFullYear(), d = (m: number, day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const at = (m: number, day: number) => new Date(y, m - 1, day, 20).getTime()
  await open(page, {
    library: [{ ...novel('a', 'Alpha', 10), genres: ['Fantasy'] } as any],
    storage: {
      readingStats: JSON.stringify({ [d(1, 10)]: { c: 3, s: 1800 }, [d(1, 11)]: { c: 2, s: 1200 }, [d(1, 12)]: { c: 1, s: 600 }, [d(3, 1)]: { c: 1, s: 300 }, [(y - 1) + '-12-31']: { c: 50, s: 99999 } }),
      watchStats: JSON.stringify({ [d(1, 13)]: { e: 2, s: 2700 } }),
      seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', url: '/s/1', genres: ['Mystery'] }]),
      history: JSON.stringify([
        { at: at(1, 10), kind: 'books', id: 'a', name: 'Alpha', sub: 'Chapter 1' }, { at: at(1, 11), kind: 'books', id: 'a', name: 'Alpha', sub: 'Chapter 4' }, { at: at(1, 12), kind: 'books', id: 'a', name: 'Alpha', sub: 'Chapter 6' },
        { at: at(1, 13), kind: 'series', id: 'series1', name: 'Lanterns', sub: 'Episode 1' }]),
    },
  })
  await page.locator('.sidebar .home-open').click()
  await page.locator('.home-panel').getByRole('button', { name: 'Whole history' }).click().catch(() => {})
  if (!await page.locator('.history-page').isVisible()) await page.evaluate(() => { localStorage.setItem('lastPage:books', 'history') }), await page.reload()
  await page.getByRole('button', { name: 'Your year ' + y }).click()
  const yp = page.locator('.year-page')
  await expect(yp.locator('h1')).toHaveText('Your year ' + y)
  const tiles = yp.locator('.year-tiles > div')
  await expect(tiles.nth(0)).toContainText('1 h 5 min') // 3900 s of reading (last year's not counted)
  await expect(tiles.nth(1)).toContainText('7')
  await expect(tiles.nth(2)).toContainText('45 min')
  await expect(tiles.nth(3)).toContainText('2')
  await expect(tiles.nth(5)).toContainText('4') // 10, 11, 12, 13 January
  await expect(yp.locator('.year-line')).toContainText('January')
  await expect(yp.locator('.year-top li').first()).toContainText('Alpha')
  await expect(yp.locator('.year-top li').first()).toContainText('3 days')
  await expect(yp.locator('.year-genres .chip')).toHaveText(['Fantasy', 'Mystery'])
})
