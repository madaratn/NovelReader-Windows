import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
test('no picture (video format this PC cannot decode): another quality is tried by itself', async ({ page }) => {
  await setup(page, { storage: { mode: 'movies', 'lastPage:movies': 'movies', movieLibrary: JSON.stringify([{ id: 'movie1', name: 'The Odyssey', sourceId: '42', sourceName: 'HubCloud', url: '/movie/1', addedAt: Date.now() }]) } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__forceNoPicture = true
    w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'The Odyssey' }
        if (p.includes('/episodes')) return [{ name: 'Movie', url: '/m/1' }]
        if (p.includes('/videos')) return [{ videoUrl: 'https://cdn.test/hevc.webm', videoTitle: 'HubCloud [2160p x265 10bit]', headers: {} }, { videoUrl: 'https://cdn.test/h264.webm', videoTitle: 'HubCloud [720p x264]', headers: {} }]
        return []
      } }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'The Odyssey' }).click()
  // Start on the HEVC one (as a remembered server would), then the watchdog moves on
  await page.getByRole('button', { name: 'Play movie' }).click()
  const quality = page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select')
  await quality.selectOption({ label: 'HubCloud [2160p x265 10bit]' })
  await expect(page.locator('.media-player-top')).toContainText('This PC cannot show the picture of this quality', { timeout: 15_000 })
  await expect(quality.locator('option:checked')).toHaveText('HubCloud [720p x264]', { timeout: 10_000 })
})

test('a very long quality name stays inside the player (tablet width)', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1100 })
  await setup(page, { storage: { mode: 'movies', 'lastPage:movies': 'movies', movieLibrary: JSON.stringify([{ id: 'movie1', name: 'The Odyssey', sourceId: '42', sourceName: 'HubCloud', url: '/movie/1', addedAt: Date.now() }]) } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    const long = 'HubCloud [FSL Server] The.Odyssey.2026.2160p.UHD.BluRay.REMUX.HDR10.DV.HEVC.TrueHD.Atmos.7.1-GROUP [62.4 GB]'
    w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'The Odyssey' }
        if (p.includes('/episodes')) return [{ name: 'Movie', url: '/m/1' }]
        if (p.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: long, headers: {} }, { videoUrl: 'https://cdn.test/b.webm', videoTitle: 'HubCloud [720p x264]', headers: {} }]
        return []
      } }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'The Odyssey' }).click()
  await page.getByRole('button', { name: 'Play movie' }).click()
  const quality = page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select')
  await expect(quality).toBeVisible()
  const box = await quality.boundingBox(), panel = await page.locator('.media-player-top').boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.scrollingElement!.scrollLeft === 0)).toBe(true)
})
