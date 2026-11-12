import { test, type Page } from '@playwright/test'
import { setup, novel } from './helpers'

// Screenshots of the main screens (desktop, dark and light), to review the design
// before / after a change. Only with SCREENS=<folder>:
//   SCREENS=/tmp/shots npx playwright test screens-design
const DIR = process.env.SCREENS || ''
const COVER = (hue: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${hue + 40},50%,22%)"/></linearGradient></defs><rect width="200" height="300" fill="url(#g)"/></svg>`
const LIB = [novel('mol', 'Mother of Learning', 108, { shelf: 'reading', author: 'nobody103', cover: 'https://img.test/1.svg' } as any), novel('ss', 'Shadow Slave', 2400, { author: 'Guiltythree', newChapters: 3, cover: 'https://img.test/2.svg' } as any), novel('lotm', 'Lord of the Mysteries', 1430, { shelf: 'completed', cover: 'https://img.test/3.svg' } as any), novel('boc', 'Beware of Chicken', 40)]
const item = (i: number, name: string, extra: any = {}) => ({ id: 'series' + i, name, sourceId: '42', sourceName: 'Mapple', url: '/series/' + i, episodes: 8 + i, thumbnail_url: 'https://img.test/' + (10 + i) + '.svg', addedAt: Date.now() - i * 1000, ...extra })

async function engine(page: Page) {
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    const eps = (n: number) => Array.from({ length: n }, (_, i) => ({ url: '/ep/' + (i + 1), name: 'S1 E' + (i + 1) + ' — Episode title ' + (i + 1), episode_number: i + 1, date_upload: Date.now() - (n - i) * 7 * 86400e3 }))
    w.novelReader = { ...base,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567', version: 'test' }),
      miwayomiFetch: async (path: string) => {
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A quiet town, a lighthouse keeper and a mystery that spans three generations.', genre: ['Drama', 'Mystery'], status: 2, thumbnail_url: 'https://img.test/11.svg', author: 'Studio North' }
        if (path.includes('/episodes')) return eps(10)
        if (path.includes('/videos')) return [{ videoUrl: '/fixtures/clip.webm', videoTitle: 'Zeus - 1080p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] }]
        if (path.includes('/extensions/installed')) return [{ name: 'Mapple', pkg: 'mapple' }, { name: 'LaMovie', pkg: 'lamovie' }]
        if (path.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'mapple' }, { id: '43', name: 'LaMovie', lang: 'es', pkg: 'lamovie' }] }
        if (path.includes('/popular') || path.includes('/search') || path.includes('/latest')) return { animes: ['Lanterns', 'Severance', 'The Bear', 'Dune Prophecy', 'Slow Horses', 'Shrinking', 'Silo', 'Andor'].map((t, i) => ({ title: t, url: '/s/' + i, thumbnail_url: 'https://img.test/' + (20 + i) + '.svg' })), hasNextPage: true }
        return []
      } }
  })
}

for (const theme of ['dark', 'light'] as const) {
  test(`design screens ${theme}`, async ({ page }) => {
    test.skip(!DIR, 'SCREENS not set')
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.route('https://img.test/**', r => { const n = Number(/(\d+)\.svg/.exec(r.request().url())?.[1] || 0); return r.fulfill({ contentType: 'image/svg+xml', body: COVER((n * 47) % 360) }) })
    await setup(page, { library: LIB, reading: { mol: { index: 41, progress: 0.4 } }, storage: { appTheme: theme,
      seriesLibrary: JSON.stringify([item(1, 'Lanterns', { newEpisodes: 2 }), item(2, 'The Bear'), item(3, 'Dune Prophecy', { shelf: 'completed' }), item(4, 'Severance')]),
      'lastEpInfo:series1': JSON.stringify({ url: '/ep/3', name: 'S1 E3', n: 3, at: Date.now() - 60_000 }), 'mediapos:series:series1:/ep/3': JSON.stringify({ t: 300, d: 1200, at: Date.now() - 60_000 }) } })
    await engine(page)
    await page.goto('/'); await page.waitForTimeout(800)
    const shot = async (name: string) => { await page.waitForTimeout(500); await page.screenshot({ path: `${DIR}/${theme}-${name}.png` }) }
    const nav = (label: string) => page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first().click()
    await shot('01-books-library')
    await page.locator('.libtitle').first().click(); await shot('02-novel')
    await nav('Sources'); await shot('03-book-sources')
    await nav('Settings'); await shot('04-settings')
    await page.locator('.home-open').click(); await shot('05-continue'); await page.keyboard.press('Escape')
    await page.locator('.mode-switch, .modes').getByText('Series', { exact: true }).first().click().catch(async () => { await page.getByRole('button', { name: 'Series', exact: true }).first().click() })
    await page.waitForTimeout(600); await shot('06-series-library')
    await nav('Discover'); await page.waitForTimeout(800); await shot('07-discover')
    await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click()); await page.locator('main input').first().fill('lanterns'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200); await shot('08-search')
    await nav('Sources'); await page.waitForTimeout(600); await shot('09-video-sources')
    await nav('Series Library'); await page.locator('.libcard').first().getByRole('button', { name: 'Show episodes' }).click(); await page.waitForTimeout(800); await shot('10-episodes')
    await page.locator('.episodecard').first().click(); await page.waitForTimeout(1500); await shot('11-player')
  })
}

// Heights of the buttons and fields on each screen (MEASURE=<file>): a design check.
test('design measure', async ({ page }) => {
  test.skip(!process.env.MEASURE, 'MEASURE not set')
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await setup(page, { library: LIB, reading: { mol: { index: 41, progress: 0.4 } }, storage: { seriesLibrary: JSON.stringify([item(1, 'Lanterns', { newEpisodes: 2 }), item(2, 'The Bear')]) } })
  await engine(page)
  await page.goto('/'); await page.waitForTimeout(800)
  const out: Record<string, any> = {}
  const measure = async (name: string) => {
    await page.waitForTimeout(400)
    out[name] = await page.evaluate(() => {
      const res: Record<string, number[]> = {}
      for (const el of document.querySelectorAll('main button, main select, main input:not([type=checkbox]):not([type=radio]):not([type=range])')) {
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue
        const cs = getComputedStyle(el)
        // Cards and tiles made of a button are not "buttons" for this check.
        if (r.height > 64) continue
        const par = el.parentElement, pk = par ? (par.tagName.toLowerCase() + (par.classList.length ? '.' + Array.from(par.classList).join('.') : '')) : ''
        const key = pk + ' > ' + el.tagName.toLowerCase() + (el.classList.length ? '.' + Array.from(el.classList).join('.') : '') + ' r' + cs.borderRadius + ' f' + cs.fontSize
        ;(res[key] ||= []).push(Math.round(r.height))
      }
      return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Array.from(new Set(v)).join('/')]))
    })
    require('fs').writeFileSync(process.env.MEASURE!, JSON.stringify(out, null, 1))
  }
  const nav = (label: string) => page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first().click()
  await measure('library'); await page.locator('.libtitle').first().click(); await measure('novel')
  await nav('Sources'); await measure('book-sources'); await nav('Settings'); await measure('settings')
  await page.locator('.mode-switch, .modes').getByText('Series', { exact: true }).first().click(); await page.waitForTimeout(500); await measure('series-library')
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click()); await page.locator('main input').first().fill('lanterns'); await page.keyboard.press('Enter'); await page.waitForTimeout(1000); await measure('search')
  await nav('Sources'); await measure('video-sources')
  await nav('Series Library'); await page.locator('.libcard').first().getByRole('button', { name: 'Show episodes' }).click(); await page.waitForTimeout(800); await measure('episodes')
  require('fs').writeFileSync(process.env.MEASURE!, JSON.stringify(out, null, 1))
})
