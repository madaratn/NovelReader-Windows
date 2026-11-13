// Next episode, intro skip, "Continue" that moves on, and the next season.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm')) // 20 s
const serve = (r: any) => {
  const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] || '')
  if (!m) return r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } })
  const s = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), clip.length - 1) : clip.length - 1
  return r.fulfill({ status: 206, body: clip.subarray(s, e + 1), headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${clip.length}`, 'Access-Control-Allow-Origin': '*' } })
}
const SERIES = { id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', thumbnail: '', episodes: 3, addedAt: Date.now() }

async function open(page: any, storage: Record<string, string>, stamps: any[] = []) {
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([SERIES]), ...storage } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', serve)
  await page.addInitScript((stamps: any[]) => {
    const w = window as any, base = w.novelReader
    w.__played = []
    w.novelReader = {
      ...base,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Lanterns' }
        if (p.includes('/episodes')) return [3, 2, 1].map(n => ({ name: 'Episode ' + n, url: '/ep/' + n, episode_number: n }))
        if (p.includes('/videos')) { w.__played.push(decodeURIComponent(p.split('url=')[1] || '')); return [{ videoUrl: 'https://cdn.test/e.webm', videoTitle: 'Server - 720p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: stamps }] }
        if (p.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en' }] }
        if (p.includes('/search')) return { animes: [] }
        return []
      }
    }
  }, stamps)
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
}
const video = (page: any) => page.locator('.remote-player video')
const playing = (page: any) => expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.currentTime > 0), { timeout: 15_000 }).toBe(true)

test('credits start: countdown to the next episode, which then plays', async ({ page }) => {
  await open(page, {}, [{ start: 6, end: 19, name: 'Ending', type: 'Ending' }])
  await page.locator('.media-hero .primary').click()
  await playing(page)
  await video(page).evaluate((v: HTMLVideoElement) => { v.muted = true; v.currentTime = 6.5; v.play() })
  const next = page.locator('.player-next')
  await expect(next).toContainText('Next episode in', { timeout: 10_000 })
  await next.getByRole('button', { name: 'Play now' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__played)).toEqual(['/ep/1', '/ep/2'])
})

test('automatic intro skip, and "Watch it" brings it back; no countdown when turned off', async ({ page }) => {
  await open(page, { autoSkip: '1', autoNext: '0' }, [{ start: 0, end: 4, name: 'Opening', type: 'Opening' }, { start: 6, end: 19, name: 'Ending', type: 'Ending' }])
  await page.locator('.media-hero .primary').click()
  await playing(page)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(4)
  const note = page.locator('.player-skipped')
  await expect(note).toContainText('Intro skipped')
  await note.getByRole('button', { name: 'Watch it' }).click()
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(4)
  await video(page).evaluate((v: HTMLVideoElement) => { v.muted = true; v.currentTime = 7; v.play() })
  await page.waitForTimeout(1500)
  await expect(page.locator('.player-next')).toHaveCount(0)
})

const finished = (n: number) => ({ ['mediapos:series:series1:/ep/' + n]: JSON.stringify({ t: 20, d: 20, done: true, at: Date.now() }) })
test('Continue: the next episode once the last one watched is finished', async ({ page }) => {
  await open(page, { 'lastEp:series1': '/ep/1', ...finished(1) })
  await expect(page.locator('.media-hero .primary')).toHaveText('Next · Ep. 2')
})
test('Continue: the same episode while it is not finished', async ({ page }) => {
  await open(page, { 'lastEp:series1': '/ep/2', 'mediapos:series:series1:/ep/2': JSON.stringify({ t: 5, d: 20, at: Date.now() }) })
  await expect(page.locator('.media-hero .primary')).toHaveText('Continue · Ep. 2')
})
test('all watched: look for the next season', async ({ page }) => {
  await open(page, { 'lastEp:series1': '/ep/3', ...finished(3) })
  await expect(page.locator('.media-hero')).toContainText('All watched')
  await page.getByRole('button', { name: 'Look for the next season' }).click()
  await expect(page.locator('main input').first()).toHaveValue('Lanterns season 2')
})
