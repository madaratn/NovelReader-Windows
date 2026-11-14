// No internet, and the video engine not answering: every page must end its loading
// and say what is going on — no endless spinner, no empty page, no crash.
import { test, expect, type Page } from '@playwright/test'
import { setup, novel } from './helpers'

const vid = (kind: string, i: number, name: string) => ({ id: kind + i, name, sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, episodes: 8, genres: ['Drama'], shelf: 'completed', addedAt: Date.now() - i * 1000 })

async function offline(page: Page) {
  await setup(page, {
    library: [{ ...novel('a', 'Alpha', 20), genres: ['Fantasy'], shelf: 'completed' } as any],
    reading: { a: { index: 3 } },
    storage: { animeLibrary: JSON.stringify([vid('anime', 1, 'Frieren')]), seriesLibrary: JSON.stringify([vid('series', 1, 'Lanterns')]), movieLibrary: JSON.stringify([vid('movie', 1, 'Dune')]) },
  })
  // Every request that leaves the app fails, like with the Wi-Fi off.
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1:41\d\d\/)/, r => r.abort('internetdisconnected'))
  await page.addInitScript(() => {
    const w = window as any, fail = async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED') }
    const iv = setInterval(() => { if (!w.novelReader) return; clearInterval(iv)
      Object.assign(w.novelReader, { searchPlugin: fail, pluginGenres: fail, popularPlugin: fail, parseNovel: fail, parseChapter: fail, translate: fail, archiveSearch: fail,
        miwayomiStatus: async () => ({ online: false, baseUrl: 'http://127.0.0.1:4567' }), miwayomiFetch: async () => { throw new TypeError('Failed to fetch') } }) }, 0)
  })
}

// After an action: loading must end within 20 s, and something must be said.
async function settled(page: Page, where: string, problems: string[]) {
  const busy = page.locator('.spinner:visible, [aria-busy="true"]:visible, .searchstatus.running:visible')
  const t0 = Date.now()
  while (Date.now() - t0 < 20000 && await busy.count()) await page.waitForTimeout(250)
  const took = Date.now() - t0
  if (await busy.count()) problems.push(where + ': still loading after 20 s — ' + (await busy.first().evaluate(e => (e.closest('[role=status]') || e.parentElement || e).textContent || '').catch(() => '')).trim().slice(0, 120))
  const text = (await page.locator('main').innerText().catch(() => '')).trim()
  if (text.length < 15) problems.push(where + ': empty page')
  const said = await page.locator('main [role=status], main [role=alert], main .anime-toast, main .searchstatus, main .empty, main .emptystate, main .lib-update-status').allInnerTexts().catch(() => [])
  // Said in plain words, and true: no raw network error, nothing claiming all is fine.
  const words = said.join(' ')
  if (/Failed to fetch|TypeError|ERR_INTERNET|Everything is up to date|did not return a playable/i.test(words)) problems.push(where + ': unclear or wrong message — ' + words.replace(/\s+/g, ' ').slice(0, 160))
  console.log('OFFLINE | ' + where + ' | ' + took + ' ms | ' + said.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ¦ ').slice(0, 400) + (said.length ? '' : ' || MAIN: ' + text.replace(/\s+/g, ' ').slice(0, 260)))
}

test('without internet, every page says so and stops loading', async ({ page }) => {
  test.setTimeout(900_000)
  const problems: string[] = []
  page.on('pageerror', e => problems.push('crash: ' + String(e.message).slice(0, 200)))
  await offline(page)
  const go = async (mode: string, p: string) => { await page.evaluate(([m, x]) => { localStorage.setItem('mode', m); localStorage.setItem('lastPage:' + m, x) }, [mode, p]); await page.reload(); await page.locator('main').waitFor() }
  await page.goto('/')

  // Books
  await go('books', 'library'); await settled(page, 'books library', problems)
  await page.getByRole('button', { name: /Check for new chapters|Check for updates/ }).first().click({ timeout: 3000 }).catch(() => {}); await settled(page, 'books: check for new chapters', problems)
  await page.locator('.novelcard, .libcard').first().locator('.libcard-cover').click(); await settled(page, 'book page', problems)
  await page.getByRole('button', { name: /Continue · Ch\./ }).first().click({ timeout: 3000 }).catch(() => {}); await settled(page, 'book: open a chapter', problems)
  await go('books', 'search'); await page.locator('main input').first().fill('alpha'); await page.locator('main input').first().press('Enter'); await settled(page, 'books search', problems)
  await go('books', 'discover'); await settled(page, 'books discover › popular', problems)
  for (const tab of ['Latest', 'For you']) { await page.getByRole('tab', { name: tab }).click({ timeout: 3000 }).catch(() => {}); await settled(page, 'books discover › ' + tab, problems) }
  await go('books', 'sources'); await settled(page, 'book sources', problems)

  // Videos
  for (const [mode, lib, disc, search, src] of [['anime', 'anime', 'animeDiscover', 'animeSearch', 'animeSources'], ['series', 'series', 'seriesDiscover', 'seriesSearch', 'seriesSources'], ['movies', 'movies', 'movieDiscover', 'movieSearch', 'movieSources']]) {
    await go(mode, lib); await settled(page, mode + ' library', problems)
    await page.locator('.libcard').first().locator('.libcard-cover').click({ timeout: 3000 }).catch(() => {}); await settled(page, mode + ' title page', problems)
    await page.locator('.media-hero .primary').first().click({ timeout: 3000 }).catch(() => {}); await settled(page, mode + ': play', problems)
    await go(mode, disc); await settled(page, mode + ' discover', problems)
    for (const tab of ['Latest', 'Genres', 'For you']) { await page.getByRole('tab', { name: tab }).click({ timeout: 3000 }).catch(() => {}); await settled(page, mode + ' discover › ' + tab, problems) }
    await go(mode, search); await page.locator('main input').first().fill('test'); await page.locator('main input').first().press('Enter'); await settled(page, mode + ' search', problems)
    await go(mode, src); await settled(page, mode + ' sources', problems)
  }
  await go('anime', 'calendar'); await settled(page, 'calendar', problems)
  expect(problems, problems.join('\n')).toEqual([])
})
