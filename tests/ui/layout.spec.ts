// Every page, at phone, small phone, tablet and small PC window sizes: nothing may
// stick out of the screen or make the page scroll sideways, every control is big
// enough to hit (44 px with fingers, 24 px with a mouse), no label is cut and no
// two buttons are drawn over one another (tests/layout-audit.ts).
import { test, expect, type Page } from '@playwright/test'
import { setup, novel } from './helpers'
import { layoutProblems, smallTargets, crampedProblems, nativeLook, tourOverlays, SIZES, openSettings, openHistory, openYear, historySeed } from '../layout-audit'

const LONG = 'The Extraordinarily Long Title Of A Story That Never Seems To End Volume Twelve'
const vid = (kind: string, i: number, name: string) => ({ id: kind + i, name, sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, thumbnail: '', episodes: kind === 'movie' ? 1 : 8, genres: ['Drama', 'Mystery'], addedAt: Date.now() - i * 3600_000 })
const PAGES: [string, string][] = [
  ['books', 'library'], ['books', 'discover'], ['books', 'search'], ['books', 'sources'], ['books', 'notes'],
  ['anime', 'anime'], ['anime', 'animeDiscover'], ['anime', 'animeSearch'], ['anime', 'animeSources'], ['anime', 'calendar'], ['anime', 'downloads'],
  ['series', 'series'], ['series', 'seriesDiscover'], ['series', 'seriesSearch'], ['series', 'seriesSources'],
  ['movies', 'movies'], ['movies', 'movieDiscover'], ['movies', 'movieSearch'], ['movies', 'movieSources'], ['movies', 'localVideos'], ['movies', 'archive'],
]

async function prepare(page: Page) {
  await setup(page, {
    library: [novel('n1', LONG, 120, { author: 'An Author With A Rather Long Pen Name' }), novel('n2', 'Shadow Slave', 40)],
    reading: { n1: { index: 3 } },
    storage: {
      ...historySeed(),
      sourcesAdvanced: '1',
      animeLibrary: JSON.stringify([vid('anime', 1, LONG), vid('anime', 2, 'Frieren')]),
      seriesLibrary: JSON.stringify([vid('series', 1, 'Lanterns'), vid('series', 2, LONG)]),
      movieLibrary: JSON.stringify([vid('movie', 1, LONG)]),
      animeRepos: JSON.stringify([{ name: 'A repository with a long name', url: 'https://raw.githubusercontent.com/someone/an-extensions-repository-with-a-very-long-name/main/index.min.json', enabled: true }]),
    },
  })
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    const eps = Array.from({ length: 12 }, (_, i) => ({ name: `S1 E${i + 1} - A chapter title that is rather long too`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    w.novelReader = { ...base,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string) => {
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A mystery. '.repeat(30), genre: ['Drama'], status: 2 }
        if (path.includes('/episodes')) return eps
        if (path.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en' }, { id: '43', name: 'A source with a very long name indeed (EN)', lang: 'en' }] }
        if (path.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'HubCloud [FSL Server] Lanterns.S01E01.2160p.UHD.BluRay.REMUX.HDR10.DV.HEVC.TrueHD.Atmos.7.1-GROUP [62.4 GB]', headers: {} }]
        return []
      } }
  })
}

for (const [size, viewport] of Object.entries(SIZES)) {
  test(`layout at ${size} size (${viewport.width}×${viewport.height}): nothing wider than the screen`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await prepare(page)
    const found: Record<string, string[]> = {}
    const min = viewport.width <= 600 ? 44 : 24 // the phone layout is used with fingers
    const check = async (where: string) => { await page.waitForTimeout(250); const p = [...await layoutProblems(page), ...(await smallTargets(page, min)).map(x => 'smaller than ' + min + ' px: ' + x), ...await crampedProblems(page), ...await nativeLook(page)]; if (p.length) { found[where] = p; console.log('LAYOUT ' + size + ' | ' + where + ' | ' + p.join(' ; ')) } }
    await page.goto('/')
    for (const [mode, name] of PAGES) {
      await page.evaluate(([m, p]) => { localStorage.setItem('mode', m); localStorage.setItem('lastPage:' + m, p) }, [mode, name])
      await page.reload()
      await page.locator('main').waitFor()
      await check(mode + ' › ' + name)
    }
    // Settings, each tab
    await page.evaluate(() => { localStorage.setItem('mode', 'books'); localStorage.setItem('lastPage:books', 'library') })
    await page.reload()
    await openSettings(page)
    const tabs = page.locator('.settings-tabs [role=tab]')
    await tabs.first().waitFor()
    for (let i = 0; i < await tabs.count(); i++) { await tabs.nth(i).click(); await check('settings › ' + (await tabs.nth(i).innerText()).trim()) }
    // Menus, panels and dialogs of the library
    await page.reload(); await page.locator('.libcard').first().waitFor(); await tourOverlays(page, check)
    // History and Your year
    await page.reload(); await openHistory(page); await check('history')
    await page.reload(); await openYear(page); await check('your year')
    // A book's page, and its reader
    await page.evaluate(() => { localStorage.setItem('lastPage:books', 'library') })
    await page.reload()
    await page.locator('.libcard, .novelcard').first().click()
    await page.waitForTimeout(400)
    await check('book page')
    // A series' page with the player and a very long quality name
    await page.evaluate(() => { localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series') })
    await page.reload()
    await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
    await check('series page')
    await page.locator('.media-hero .primary').click()
    await page.waitForTimeout(800)
    await check('series page, playing')
    expect(found, JSON.stringify(found, null, 1)).toEqual({})
  })
}
