import { test, type Page } from '@playwright/test'
import { setup, novel } from '../ui/helpers'

// Captures every section of the app (FR, default theme) for UI reviews.
// Run: npx playwright test -c playwright.screens.config.ts  → screens/*.png

const media = (kind: string, n: number) => Array.from({ length: n }, (_, i) => ({
  id: kind + i, name: [`Solo Leveling`, `Frieren`, `Lanterns`, `Iron Man 3`, `Dune`, `The Bear`][i % 6] + (i > 5 ? ' ' + i : ''),
  sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, thumbnail: '', episodes: kind === 'movie' ? 1 : 12, addedAt: Date.now() - i * 3600_000
}))

async function boot(page: Page) {
  await setup(page, {
    lang: 'fr',
    library: [novel('n1', 'Shadow Slave', 2400, { author: 'Guiltythree' }), novel('n2', 'Lord of the Mysteries', 1430), novel('n3', 'Omniscient Reader', 551), novel('n4', 'Reverend Insanity', 2334)],
    reading: { n1: { index: 1200 }, n2: { index: 40 } },
    storage: { animeLibrary: JSON.stringify(media('anime', 6)), seriesLibrary: JSON.stringify(media('series', 4)), movieLibrary: JSON.stringify(media('movie', 5)) }
  })
  await page.addInitScript(() => {
    const w = window as any
    const desc = 'Two intergalactic cops investigate a murder in the American heartland. **Type:** TV Show **Score:** ★ 8.4 **Tagline:** *Only one can wear the ring.* **First Air Date:** 2026-08-16 **Country:** US ![Backdrop](https://image.tmdb.org/x.jpg)'
    const eps = Array.from({ length: 8 }, (_, i) => ({ name: `S1 E${i + 1} - Episode title ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    const orig = w.novelReader
    w.novelReader = {
      ...orig,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string) => {
        if (path.includes('/details')) return { title: 'Lanterns', description: desc, genre: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'], status: 2, author: 'DC Studios, HBO' }
        if (path.includes('/episodes')) return eps
        if (path.includes('/extensions/installed')) return [{ name: 'Mapple', pkg: 'mapple', anime: 1 }]
        if (path.includes('/sources')) return [{ id: '42', name: 'Mapple', lang: 'en' }]
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
  await navTo(page, 'Vidéos locales'); await shot(page, '14-anime-videos-locales')
  await navTo(page, 'Internet Archive'); await shot(page, '15-anime-archive')
  // Series
  await mode(page, 3); await navTo(page, 'Bibliothèque séries'); await shot(page, '20-series-bibliotheque')
  await page.locator('main').getByText('Lanterns').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '21-series-fiche')
  await navTo(page, 'Recherche globale'); await shot(page, '22-series-recherche')
  await navTo(page, 'Sources'); await shot(page, '23-series-sources')
  // Movies
  await mode(page, 4); await navTo(page, 'Bibliothèque films'); await shot(page, '30-films-bibliotheque')
  await page.locator('main').getByText('Iron Man 3').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '31-films-fiche')
  await navTo(page, 'Recherche globale'); await shot(page, '32-films-recherche')
  await navTo(page, 'Sources'); await shot(page, '33-films-sources')
  // Settings
  await page.locator('.sidebar').getByText('Paramètres').first().click().catch(() => {})
  await shot(page, '40-parametres')
  // Dark theme: same key pages
  await page.locator('.settings-seg button', { hasText: 'Sombre' }).click().catch(() => {})
  await mode(page, 1); await navTo(page, 'Bibliothèque'); await shot(page, '50-sombre-livres')
  await mode(page, 2); await navTo(page, 'Bibliothèque anime'); await shot(page, '51-sombre-anime')
  await page.locator('main').getByText('Solo Leveling').first().click().catch(() => {})
  await page.waitForTimeout(800); await shot(page, '52-sombre-anime-fiche')
})
