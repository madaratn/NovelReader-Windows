import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

// Some hosts (Vidplay…) give an HLS playlist at an address without ".m3u8": the
// player first takes it for a video file, cannot decode it, then sees it is a
// playlist and plays it as HLS instead of giving up on that quality.
const dir = path.join(__dirname, 'fixtures', 'hls')
const playlist = fs.readFileSync(path.join(dir, 'index.m3u8'), 'utf8')
  .replace('URI="init.mp4"', 'URI="http://127.0.0.1:4567/seg/init.mp4"').replace('index0.m4s', 'http://127.0.0.1:4567/seg/index0.m4s')

test('an HLS stream whose address has no .m3u8 still plays', async ({ page }) => {
  const hits: string[] = []
  const cors = { 'Access-Control-Allow-Origin': '*' }
  await page.route('http://127.0.0.1:4567/**', r => {
    const u = new URL(r.request().url())
    hits.push(u.pathname)
    // The host announces it as a plain file (as such hosts do); the engine's HLS route serves it properly.
    if (u.pathname === '/api/v1/proxy') return r.fulfill({ status: 200, body: playlist, headers: { ...cors, 'Content-Type': 'application/octet-stream' } })
    if (u.pathname === '/api/v1/hls') return r.fulfill({ status: 200, body: playlist, headers: { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl' } })
    if (u.pathname.startsWith('/seg/')) return r.fulfill({ status: 200, body: fs.readFileSync(path.join(dir, u.pathname.slice(5))), headers: { ...cors, 'Content-Type': 'video/mp4' } })
    if (u.pathname === '/not-a-video') return r.fulfill({ status: 200, body: 'garbage', headers: { ...cors, 'Content-Type': 'video/mp4' } })
    return r.fulfill({ status: 404, headers: cors })
  })
  await setup(page, { storage: { mode: 'anime', 'lastPage:anime': 'anime', animeLibrary: JSON.stringify([{ id: 'a1', name: 'Mushoku Tensei', sourceId: '42', sourceName: 'Kai', url: '/a/1', episodes: 1, addedAt: Date.now() }]) } })
  await page.addInitScript(() => {
    // Like Android's WebView: the playlist given as a plain video address cannot be read.
    const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!
    Object.defineProperty(HTMLMediaElement.prototype, 'src', { ...d, set(v: string) { d.set!.call(this, String(v).includes('/api/v1/proxy?') ? 'http://127.0.0.1:4567/not-a-video' : v) } })
    const w = window as any, base = w.novelReader
    w.novelReader = {
      ...base,
      miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Mushoku Tensei' }
        if (p.includes('/episodes')) return [{ name: 'Episode 4', url: '/e/4', episode_number: 4 }]
        if (p.includes('/videos')) return [{ videoUrl: 'https://vidplay.test/stream/abc123', videoTitle: 'Vidplay - Dub - 1080p', headers: { Referer: 'https://vidplay.test/' }, subtitleTracks: [], audioTracks: [] }]
        return []
      }
    }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Mushoku Tensei' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.media-hero .primary').click()
  const video = page.locator('.remote-player video')
  await expect.poll(() => hits.includes('/api/v1/hls'), { timeout: 15000 }).toBe(true)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => { v.muted = true; v.play().catch(() => {}); return v.currentTime }), { timeout: 15000 }).toBeGreaterThan(0.5)
  await expect(page.locator('.media-player-top')).not.toContainText('not supported by the built-in player')
})
