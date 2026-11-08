import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
test('torrent sources (Torrentio): the best torrents are tried in turn, with progress shown', async ({ page }) => {
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Deep in Love', sourceId: '42', sourceName: 'Torrentio (Torrent / Debrid)', url: '/series/1', episodes: 2, addedAt: Date.now() }]) } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__tried = []
    w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Deep in Love' }
        if (p.includes('/episodes')) return [{ name: 'Episode 1', url: '/ep/1' }, { name: 'Episode 2', url: '/ep/2' }]
        if (p.includes('/videos')) return [
          { videoUrl: 'magnet:?xt=urn:btih:AAA&index=3', videoTitle: 'Torrentio\n4k HDR\nDeep.in.Love.S01.2160p.HEVC\n👤 2 💾 40 GB' },
          { videoUrl: 'magnet:?xt=urn:btih:BBB&index=1', videoTitle: 'Torrentio\n1080p\nDeep.in.Love.S01E02.1080p.WEB.x264\n👤 50 💾 1.2 GB' },
          { videoUrl: 'magnet:?xt=urn:btih:CCC', videoTitle: 'Torrentio\n720p\nDeep.in.Love.S01E02.720p\n👤 10 💾 700 MB' }]
        return []
      },
      torrentStartMagnet: async (m: string) => { w.__tried.push(m.slice(20, 23)); await new Promise(r => setTimeout(r, 600)); if (m.includes('BBB')) throw new Error('Timed out while reading the torrent metadata.'); return { sessionId: 's1', streamUrl: 'http://127.0.0.1:4567/api/v1/proxy?url=torrent' } },
      torrentStatus: async () => ({ state: 'downloading', progress: 0.1, numPeers: 5, downloadSpeed: 1e6 }) }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Deep in Love' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.episodecell').nth(1).locator('.episodecard').click()
  await expect(page.locator('.player-loading')).toContainText('Connecting to the torrent (1/3)')
  await expect(page.locator('.player-loading')).toContainText('Connecting to the torrent (2/3)')
  await expect.poll(() => page.locator('.media-player-top video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 }).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as any).__tried)).toEqual(['BBB', 'CCC']) // 1080p x264 with seeders first; the 4K HEVC one last
})

test('other sources: the right title (series, not the film of the same name) and the episode by season and number', async ({ page }) => {
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Deep in Love', sourceId: '42', sourceName: 'Torrentio (Torrent / Debrid)', url: '/series/1', episodes: 2, addedAt: Date.now() }]) } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__videos = []
    w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p === '/api/v1/sources') return { anime: [{ id: '42', name: 'Torrentio (Torrent / Debrid)', lang: 'all' }, { id: '60', name: 'HexaWatch', lang: 'en' }] }
        if (p.includes('/anime/42/details')) return { title: 'Deep in Love' }
        if (p.includes('/anime/42/episodes')) return [{ name: 'Episode 1', url: '/ep/1' }, { name: 'Episode 2', url: '/ep/2' }]
        if (p.includes('/anime/42/videos')) return []
        if (p.includes('/anime/60/search')) return [{ title: 'Deep in Love', url: '/movie/deep-in-love-2007' }, { title: 'Deep in Love', url: '/tv/deep-in-love' }]
        if (p.includes('/anime/60/episodes')) return p.includes('movie') ? [{ name: 'Movie', url: '/m/1', episode_number: -1 }] : [{ name: 'S1 E2 - The Storm', url: '/tv/s1e2', episode_number: -1 }, { name: 'S1 E1 - Pilot', url: '/tv/s1e1', episode_number: -1 }]
        if (p.includes('/anime/60/videos')) { w.__videos.push(decodeURIComponent(p)); return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'HexaWatch 1080p', headers: {} }] }
        return []
      } }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Deep in Love' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.episodecell').nth(1).locator('.episodecard').click()
  await expect.poll(() => page.evaluate(() => (window as any).__videos), { timeout: 15000 }).toEqual([expect.stringContaining('/tv/s1e2')])
  await expect.poll(() => page.locator('.media-player-top video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15000 }).toBeGreaterThan(0)
})
