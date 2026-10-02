import { test, expect, type Page } from '@playwright/test'
import { setup } from './helpers'

// Anime / Series / Movies: libraries, statuses, resume banner, new episodes,
// detail page, remembered server, skip intro and installed source health.
// The video engine is replaced by a scripted fake (window.__engine).

const item = (kind: string, i: number, name: string, extra: any = {}) => ({ id: kind + i, name, sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, thumbnail: '', episodes: kind === 'movie' ? 1 : 8, addedAt: Date.now() - i * 3600_000, ...extra })

async function openVideo(page: Page, storage: Record<string, string>) {
  await setup(page, { storage })
  await page.addInitScript(() => {
    const w = window as any
    const eps = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S1 E${i + 1} - Chapter ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    w.__engine = { calls: [] as string[], episodes: 8 }
    const base = w.novelReader
    w.novelReader = {
      ...base,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string, method?: string, body?: any) => {
        w.__engine.calls.push((method || 'GET') + ' ' + path)
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A mystery. **Type:** TV Show **Score:** ★ 8.4 ![Backdrop](https://x/y.jpg)', genre: ['Drama'], status: 2, thumbnail_url: 'https://img.test/cover.jpg' }
        if (path.includes('/episodes')) return eps(w.__engine.episodes)
        if (path.includes('/videos')) return [
          { videoUrl: 'https://cdn.test/a.mp4', videoTitle: 'Zeus - 480p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] },
          { videoUrl: 'https://cdn.test/b.mp4', videoTitle: 'Hermes - 1080p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [{ start: 0, end: 85, name: 'Intro', type: 'Opening' }] }
        ]
        if (path.includes('/extensions/installed')) return [{ name: 'Mapple', pkg: 'mapple' }, { name: 'Aniyomi: LaMovie', pkg: 'lamovie' }]
        if (path.includes('/extensions/uninstall')) return { ok: true, pkg: body?.pkg }
        if (path.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'mapple' }, { id: '43', name: 'LaMovie', lang: 'es', pkg: 'lamovie' }] }
        if (path.includes('/43/popular')) throw new Error("Error invoking remote method 'anime:miwayomiFetch': Error: Miwayomi HTTP 500 — {\"error\":\"Hôte inconnu (la.movie)\"}")
        if (path.includes('/popular')) return { animes: [] }
        return []
      }
    }
  })
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
}

test('series library: statuses, resume banner and new episodes badge', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 0, 'The Bear'), item('series', 1, 'Lanterns'), item('series', 2, 'Dune Prophecy', { shelf: 'completed' })]),
    'lastEpInfo:series1': JSON.stringify({ url: '/ep/3', name: 'S1 E3 - Chapter 3', n: 3, at: Date.now() - 3600_000 }),
    'mediapos:series:series1:/ep/3': JSON.stringify({ t: 1325, d: 2700, at: Date.now() - 3600_000 })
  })
  // Resume banner, like the Books library
  const banner = page.locator('.lib-resume')
  await expect(banner).toContainText('Lanterns')
  await expect(banner).toContainText('stopped at 22:05')
  await expect(banner.getByRole('button')).toHaveText('Continue · Ep. 3')
  // Status tabs with counts; the watched title is "Watching" by default
  await expect(page.locator('.shelftab')).toHaveText(['All 3', 'Watching 1', 'Plan to watch 1', 'Completed 1', 'Dropped 0'])
  await page.locator('.shelftab', { hasText: 'Completed' }).click()
  await expect(page.locator('.libcard h2')).toHaveText(['Dune Prophecy'])
  await page.locator('.shelftab', { hasText: 'All' }).click()
  await page.locator('.libcard', { hasText: 'The Bear' }).locator('.shelfselect').selectOption('dropped')
  await expect(page.locator('.shelftab', { hasText: 'Dropped' })).toHaveText('Dropped 1')
  // New episodes: the source now has 10 episodes instead of 8
  await page.evaluate(() => { (window as any).__engine.episodes = 10 })
  await page.getByRole('button', { name: 'Check for new episodes' }).click()
  await expect(page.locator('.lib-update-status')).toHaveText('3 titles have new episodes.')
  await expect(page.locator('.libcard', { hasText: 'Lanterns' }).locator('.newbadge')).toHaveText('+2 new')
  // Missing covers are filled from the source details
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').every((x: any) => x.thumbnail === 'https://img.test/cover.jpg'))).toBe(true)
})

test('series detail: Books-style hero, clean facts, remembered server, skip intro', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]),
    'prefServer:series1': 'Hermes - 1080p'
  })
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await expect(page.locator('.media-hero h1')).toHaveText('Lanterns')
  await expect(page.locator('.media-hero .primary')).toHaveText('Start · Ep. 1')
  await expect(page.locator('.media-description')).toHaveText('A mystery.')
  await expect(page.locator('.media-info dl')).toContainText('Completed') // status 2, not "2"
  await expect(page.locator('.media-info')).not.toContainText('Backdrop')
  await page.locator('.media-hero .primary').click()
  // The server that worked last time is selected first
  await expect(page.locator('.player-trackbar select').first().locator('option:checked')).toHaveText('Hermes - 1080p')
  await expect(page.locator('.player-skip')).toHaveText('Skip intro ⏭')
  await page.locator('.player-skip').click()
  await expect.poll(() => page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(0)
})

test('video sources: test installed sources and remove the dead one', async ({ page }) => {
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'animeSources' })
  await page.getByRole('button', { name: 'Test my sources' }).click()
  await expect(page.locator('.source-health .engine-row p')).toHaveText('1 working, 1 not responding.')
  const dead = page.locator('.health-row.dead')
  await expect(dead).toContainText('LaMovie')
  await expect(dead.locator('small')).toHaveText('Hôte inconnu (la.movie)')
  await page.getByRole('button', { name: 'Remove 1 dead source' }).click()
  await page.getByRole('button', { name: 'Yes, uninstall' }).click()
  await expect(page.locator('.health-row')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => (window as any).__engine.calls.some((c: string) => c === 'POST /api/v1/extensions/uninstall'))).toBe(true)
})
