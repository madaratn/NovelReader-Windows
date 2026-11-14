// The Android app (phone and tablet): every main page fits the screen (tests/layout-audit.ts).
import { test, expect } from '@playwright/test'
import fs from 'fs'
import { layoutProblems } from '../layout-audit'
const NOTES = (/^##\s*NovelReader\s+([\d.]+)/m.exec(fs.readFileSync('build/release-notes.md', 'utf8')) || [])[1] || ''

const LONG = 'The Extraordinarily Long Title Of A Story That Never Seems To End Volume Twelve'
const vid = (kind: string, i: number, name: string) => ({ id: kind + i, name, sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, episodes: 8, addedAt: Date.now() - i * 3600_000 })
const PAGES: [string, string][] = [
  ['books', 'library'], ['books', 'discover'], ['books', 'search'], ['books', 'sources'], ['books', 'history'], ['books', 'notes'], ['books', 'settings'],
  ['anime', 'anime'], ['anime', 'animeDiscover'], ['anime', 'animeSearch'], ['anime', 'animeSources'], ['anime', 'calendar'], ['anime', 'downloads'],
  ['series', 'series'], ['series', 'seriesDiscover'], ['series', 'seriesSearch'], ['series', 'seriesSources'],
  ['movies', 'movies'], ['movies', 'movieDiscover'], ['movies', 'movieSearch'], ['movies', 'movieSources'], ['movies', 'localVideos'],
]

for (const viewport of [{ width: 360, height: 740 }, { width: 412, height: 915 }, { width: 800, height: 1280 }]) {
  test(`Android layout ${viewport.width}×${viewport.height}: every page fits the screen`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await page.route('https://graphql.anilist.co/**', r => r.fulfill({ contentType: 'application/json', body: '{"data":{}}' }))
    await page.route('https://api.tvmaze.com/**', r => r.fulfill({ status: 404, body: '{}' }))
    await page.addInitScript(([long, a, s, m, notes]) => {
      (window as any).Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true }
      if (sessionStorage.getItem('__lay')) return
      sessionStorage.setItem('__lay', '1')
      localStorage.clear(); localStorage.setItem('onboarded', '1'); localStorage.setItem('whatsNewSeen', notes); localStorage.setItem('homeAtStart', '0'); localStorage.setItem('lang', 'en')
      localStorage.setItem('sourcesAdvanced', '1')
      localStorage.setItem('animeLibrary', a); localStorage.setItem('seriesLibrary', s); localStorage.setItem('movieLibrary', m)
      localStorage.setItem('animeRepos', JSON.stringify([{ name: 'A repository with a long name', url: 'https://raw.githubusercontent.com/someone/an-extensions-repository-with-a-very-long-name/main/index.min.json', enabled: true }]))
      void long
    }, [LONG, JSON.stringify([vid('anime', 1, LONG)]), JSON.stringify([vid('series', 1, LONG)]), JSON.stringify([vid('movie', 1, LONG)]), NOTES])
    const found: Record<string, string[]> = {}
    await page.goto('/')
    for (const [mode, name] of PAGES) {
      await page.evaluate(([m, p]) => { localStorage.setItem('mode', m); localStorage.setItem('lastPage:' + m, p) }, [mode, name])
      await page.reload()
      await page.locator('main').waitFor()
      await page.waitForTimeout(250)
      const p = await layoutProblems(page)
      if (p.length) { found[mode + ' › ' + name] = p; console.log('LAYOUT ' + viewport.width + ' | ' + mode + ' › ' + name + ' | ' + p.join(' ; ')) }
    }
    expect(found, JSON.stringify(found, null, 1)).toEqual({})
  })
}
