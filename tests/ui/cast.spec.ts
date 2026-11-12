import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
async function open(page: any) {
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', episodes: 2, addedAt: Date.now() }]) } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => {
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] || '')
    if (!m) return r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } })
    const s = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), clip.length - 1) : clip.length - 1
    return r.fulfill({ status: 206, body: clip.subarray(s, e + 1), headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${clip.length}`, 'Access-Control-Allow-Origin': '*' } })
  })
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__tv = { calls: [] as any[], time: 0, playing: false }
    w.novelReader = { ...base,
      miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Lanterns' }
        if (p.includes('/episodes')) return [{ name: 'S1 E1', url: '/ep/1', episode_number: 1 }, { name: 'S1 E2', url: '/ep/2', episode_number: 2 }]
        if (p.includes('/videos')) return [{ videoUrl: 'https://cdn.test/' + (p.includes('ep%2F2') ? 'b' : 'a') + '.webm', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [{ url: 'https://cdn.test/en.vtt', lang: 'English' }], audioTracks: [] }]
        return []
      },
      castScan: async () => { await new Promise(r => setTimeout(r, 300)); return [{ id: 'dlna:1', name: 'Samsung TV', kind: 'dlna' }, { id: 'cast:2', name: 'Chromecast salon', kind: 'cast' }] },
      castStart: async (o: any) => { w.__tv.calls.push(['start', o]); w.__tv.time = o.startAt; w.__tv.playing = true; return { device: { id: o.deviceId, name: o.deviceId === 'cast:2' ? 'Chromecast salon' : 'Samsung TV', kind: 'cast' }, url: 'http://192.168.1.5:5000/t/x' } },
      castControl: async (a: string, v?: number) => { w.__tv.calls.push([a, v]); if (a === 'pause') w.__tv.playing = false; if (a === 'play') w.__tv.playing = true; if (a === 'seek') w.__tv.time = v; return true },
      castStatus: async () => ({ time: w.__tv.time, duration: 20, playing: w.__tv.playing, state: w.__tv.playing ? 'playing' : 'paused' }),
      castStop: async () => { w.__tv.calls.push(['stop']) } }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.episodecell').first().locator('.episodecard').click()
}
const video = (p: any) => p.locator('.media-player-top video')

test('cast to a TV: pick it, the PC pauses, remote control, next episode to the same TV, stop resumes on the PC', async ({ page }) => {
  await open(page)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
  await video(page).evaluate((v: HTMLVideoElement) => { v.currentTime = 6 })
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(5.9)
  await page.getByRole('button', { name: /^Cast$/ }).click()
  const menu = page.locator('.cast-menu')
  await expect(menu).toContainText('Looking for TVs…')
  await expect(menu.locator('li')).toHaveCount(2)
  await expect(menu.locator('li').nth(0)).toContainText('Samsung TV')
  await expect(menu.locator('li').nth(1)).toContainText('Chromecast')
  await menu.getByRole('button', { name: /Samsung TV/ }).click()
  const panel = page.locator('.cast-panel')
  await expect(panel).toContainText('Playing on Samsung TV')
  const start = await page.evaluate(() => (window as any).__tv.calls[0][1])
  expect(start.deviceId).toBe('dlna:1'); expect(start.url).toContain('http://127.0.0.1:4567/api/v1/proxy'); expect(start.startAt).toBeGreaterThanOrEqual(5.9)
  expect(start.title).toContain('S1 E1'); expect(start.subtitles[0].url).toContain('http://127.0.0.1:4567/')
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect(page.getByRole('button', { name: /^On Samsung TV/ })).toBeVisible()
  // Remote control
  await panel.getByRole('button', { name: 'Pause' }).click()
  await panel.getByRole('button', { name: 'Forward 10 seconds' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__tv.calls.slice(1).map((c: any) => c[0]))).toEqual(['pause', 'seek'])
  // The PC video does not start again by itself
  await video(page).evaluate((v: HTMLVideoElement) => v.play().catch(() => {}))
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  // Next episode: same TV, from the start
  await page.getByRole('button', { name: 'Next →' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__tv.calls.filter((c: any) => c[0] === 'start').length)).toBe(2)
  const second = await page.evaluate(() => (window as any).__tv.calls.filter((c: any) => c[0] === 'start')[1][1])
  expect(second.deviceId).toBe('dlna:1'); expect(second.startAt).toBe(0)
  // Stop: back on the PC where the TV was
  await page.evaluate(() => { (window as any).__tv.time = 11 })
  await page.waitForTimeout(1200)
  await panel.getByRole('button', { name: 'Stop casting (continue on the PC)' }).click()
  await expect(panel).toHaveCount(0)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThanOrEqual(11)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
})

test('cast: no TV found explains what to check', async ({ page }) => {
  await open(page)
  await page.evaluate(() => { (window as any).novelReader.castScan = async () => [] })
  await page.getByRole('button', { name: /^Cast$/ }).click()
  await expect(page.locator('.cast-menu')).toContainText('No TV found. Check that the TV is on and on the same Wi-Fi as this PC')
})

test('touch: two quick taps on a side of the video go 10 s back or forward; one tap or the middle do nothing', async ({ page }) => {
  await open(page)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
  await video(page).evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 2 })
  const tap = (fx: number, fy = 0.4) => video(page).evaluate((v: HTMLVideoElement, [fx, fy]) => {
    const r = v.getBoundingClientRect(), t = new Touch({ identifier: 1, target: v, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy })
    v.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t], bubbles: true, cancelable: true }))
  }, [fx, fy])
  const time = () => video(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))
  await tap(0.9); await tap(0.9)
  await expect.poll(time).toBe(12)
  await expect(page.locator('.seek-flash.forward')).toHaveText('10 s »')
  await tap(0.1); await tap(0.1)
  await expect.poll(time).toBe(2)
  await tap(0.1)                       // one tap only
  await tap(0.5); await tap(0.5)       // middle
  await tap(0.9, 0.95); await tap(0.9, 0.95) // seek bar strip
  await page.waitForTimeout(200)
  expect(await time()).toBe(2)
})
