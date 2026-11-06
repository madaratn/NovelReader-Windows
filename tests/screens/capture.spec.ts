import { test, type Page } from '@playwright/test'
import { setup, novel } from '../ui/helpers'

// Captures every section of the app (FR, default theme) for UI reviews.
// Run: npx playwright test -c playwright.screens.config.ts  → screens/*.png

const media = (kind: string, n: number) => Array.from({ length: n }, (_, i) => ({
  id: kind + i, name: [`Solo Leveling`, `Frieren`, `Lanterns`, `Iron Man 3`, `Dune`, `The Bear`][i % 6] + (i > 5 ? ' ' + i : ''),
  sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, thumbnail: '', episodes: kind === 'movie' ? 1 : 12, addedAt: Date.now() - i * 3600_000, ...(kind === 'anime' && i === 1 ? { newEpisodes: 2 } : {})
}))

async function boot(page: Page) {
  await setup(page, {
    lang: 'fr',
    library: [novel('n1', 'Shadow Slave', 2400, { author: 'Guiltythree' }), novel('n2', 'Lord of the Mysteries', 1430), novel('n3', 'Omniscient Reader', 551), novel('n4', 'Reverend Insanity', 2334)],
    reading: { n1: { index: 1200 }, n2: { index: 40 } },
    storage: {
      animeLibrary: JSON.stringify(media('anime', 6)), seriesLibrary: JSON.stringify(media('series', 4)), movieLibrary: JSON.stringify(media('movie', 5)),
      'lastEpInfo:series2': JSON.stringify({ url: '/ep/3', name: 'S1 E3 - OutKast', n: 3, at: Date.now() - 3600_000 }),
      'lastEpInfo:series0': JSON.stringify({ url: '/ep/4', name: 'S1 E4', n: 4, at: Date.now() - 86400_000 }),
      'mediapos:series:series0:/ep/4': JSON.stringify({ t: 0, d: 2700, done: true, at: Date.now() - 86400_000 }),
      'lastEpInfo:series3': JSON.stringify({ url: '/ep/2', name: 'S1 E2', n: 2, at: Date.now() - 2 * 86400_000 }),
      'mediapos:series:series3:/ep/2': JSON.stringify({ t: 1500, d: 2700, at: Date.now() - 2 * 86400_000 }),
      'mediapos:series:series2:/ep/3': JSON.stringify({ t: 1325, d: 2700, at: Date.now() - 3600_000 }),
      'lastEpInfo:movie3': JSON.stringify({ url: '/ep/1', name: '', n: 1, at: Date.now() - 7200_000 }),
      'mediapos:movie:movie3': JSON.stringify({ t: 3100, d: 7800, at: Date.now() - 7200_000 })
    }
  })
  await page.addInitScript(() => {
    const w = window as any
    const desc = 'Two intergalactic cops investigate a murder in the American heartland. **Type:** TV Show **Score:** ★ 8.4 **Tagline:** *Only one can wear the ring.* **First Air Date:** 2026-08-16 **Country:** US ![Backdrop](https://image.tmdb.org/x.jpg)'
    const eps = Array.from({ length: 8 }, (_, i) => ({ name: `S1 E${i + 1} - Episode title ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    const orig = w.novelReader
    w.novelReader = {
      ...orig,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      dlList: async () => [
        { id: 'd1', kind: 'series', mediaId: 'series2', mediaName: 'Lanterns', episodeUrl: '/ep/1', episodeName: 'S1 E1 - Episode title 1', episodeNo: 1, mediaKey: '', state: 'done', progress: 1, size: 412e6, file: 'video.mp4', subtitles: [{ label: 'English', lang: 'en', file: 'sub0.vtt' }] },
        { id: 'd2', kind: 'series', mediaId: 'series2', mediaName: 'Lanterns', episodeUrl: '/ep/2', episodeName: 'S1 E2 - Episode title 2', episodeNo: 2, mediaKey: '', state: 'done', progress: 1, size: 398e6, file: 'video.mp4', subtitles: [] },
        { id: 'd3', kind: 'series', mediaId: 'series2', mediaName: 'Lanterns', episodeUrl: '/ep/3', episodeName: 'S1 E3 - Episode title 3', episodeNo: 3, mediaKey: '', state: 'downloading', progress: 0.37, bytes: 151e6 }
      ],
      reportCollect: async () => ({}), reportCopy: async () => true,
      dlBase: async () => 'http://127.0.0.1:9', dlUsage: async () => ({ bytes: 810e6, count: 2, folder: '' }), dlStart: async () => ({ id: 'x' }), onDownloadsChanged: () => () => {},
      miwayomiFetch: async (path: string) => {
        if (path.includes('/details')) return { title: 'Lanterns', description: desc, genre: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], status: 2, author: 'DC Studios, HBO' }
        if (path.includes('/episodes')) return eps
        if (path.includes('/videos')) return [{ videoUrl: 'https://cdn.test/v.mp4', videoTitle: 'HD-1 - Sub - 1080p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [{ start: 0, end: 85, name: 'Intro', type: 'Opening' }] }]
        if (path.includes('/extensions/installed')) return [{ name: 'Mapple', pkg: 'mapple', anime: 1 }, { name: 'Aniyomi: LaMovie', pkg: 'lamovie', anime: 1 }, { name: 'Anichi', pkg: 'anichi', anime: 1 }]
        if (path.includes('/sources')) return [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'mapple' }, { id: '43', name: 'LaMovie', lang: 'es', pkg: 'lamovie' }, { id: '44', name: 'Anichi', lang: 'en', pkg: 'anichi' }]
        if (path.includes('/43/popular')) throw new Error("Error invoking remote method 'anime:miwayomiFetch': Error: Miwayomi HTTP 500 — {\"error\":\"Hôte inconnu (la.movie)\"}")
        if (path.includes('/42/popular')) return { animes: ['Lanterns', 'Severance', 'Andor', 'The Bear', 'Shogun', 'Dune Prophecy'].map((title, i) => ({ title, url: '/s/' + i })), hasNextPage: true }
        if (path.includes('/popular')) return { animes: [] }
        return []
      }
    }
  })
  await page.goto('/')
  await page.locator('aside.sidebar').waitFor()
}

const shot = (page: Page, name: string) => page.waitForTimeout(400).then(() => page.screenshot({ path: `screens/${name}.png` }))
const navTo = (page: Page, label: string) => page.locator('.sidebar .nav-item', { hasText: label }).first().click()
const mode = (page: Page, i: number) => page.keyboard.press('Control+' + i)

test('capture all sections', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  // Books
  await shot(page, '01-livres-bibliotheque')
  await page.locator('.libcard-cover').nth(1).click().catch(() => {})
  await page.waitForTimeout(500); await shot(page, '02-livres-fiche')
  await navTo(page, 'Bibliothèque')
  await navTo(page, 'Recherche globale'); await shot(page, '03-livres-recherche')
  await navTo(page, 'Sources'); await shot(page, '04-livres-sources')
  // Anime
  await mode(page, 2); await navTo(page, 'Bibliothèque anime'); await shot(page, '10-anime-bibliotheque')
  await page.locator('main').getByText('Solo Leveling').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '11-anime-fiche')
  await navTo(page, 'Recherche globale'); await shot(page, '12-anime-recherche')
  await navTo(page, 'Sources'); await shot(page, '13-anime-sources')
  await page.getByRole('button', { name: 'Tester mes sources' }).click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '13b-anime-sources-test')
  await navTo(page, 'Vidéos locales'); await shot(page, '14-anime-videos-locales')
  await navTo(page, 'Internet Archive'); await shot(page, '15-anime-archive')
  // Series
  await mode(page, 3); await navTo(page, 'Bibliothèque séries'); await shot(page, '20-series-bibliotheque')
  await page.locator('main').getByText('Lanterns').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '21-series-fiche')
  await page.locator('.batch-dl').scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await shot(page, '21c-series-episodes')
  await page.locator('.media-hero .primary').click().catch(() => {})
  await page.waitForTimeout(1500); await shot(page, '21b-series-lecteur')
  await navTo(page, 'Bibliothèque séries'); await shot(page, '20b-series-reprendre')
  await navTo(page, 'Découvrir'); await page.waitForTimeout(600); await shot(page, '22b-series-decouvrir')
  await navTo(page, 'Recherche globale'); await shot(page, '22-series-recherche')
  await navTo(page, 'Sources'); await shot(page, '23-series-sources')
  await navTo(page, 'Téléchargements'); await page.waitForTimeout(500); await shot(page, '24-series-telechargements')
  // Movies
  await mode(page, 4); await navTo(page, 'Bibliothèque films'); await shot(page, '30-films-bibliotheque')
  await page.locator('main').getByText('Iron Man 3').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '31-films-fiche')
  await navTo(page, 'Recherche globale'); await shot(page, '32-films-recherche')
  await navTo(page, 'Sources'); await shot(page, '33-films-sources')
  // Settings
  await page.locator('.sidebar').getByText('Paramètres').first().click().catch(() => {})
  await shot(page, '40-parametres')
  await page.locator('.report-panel').scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await shot(page, '41-parametres-rapport')
  // Dark theme: same key pages
  await page.locator('.settings-seg button', { hasText: 'Sombre' }).click().catch(() => {})
  await mode(page, 1); await navTo(page, 'Bibliothèque'); await shot(page, '50-sombre-livres')
  await mode(page, 2); await navTo(page, 'Bibliothèque anime'); await shot(page, '51-sombre-anime')
  await page.locator('main').getByText('Solo Leveling').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '52-sombre-anime-fiche')
})
