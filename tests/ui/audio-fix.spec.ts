import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
const serve = (r: any) => {
  const range = r.request().headers()['range'] || ''
  const m = /bytes=(\d+)-(\d*)/.exec(range)
  if (!m) return r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } })
  const s = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), clip.length - 1) : clip.length - 1
  return r.fulfill({ status: 206, body: clip.subarray(s, e + 1), headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${clip.length}`, 'Access-Control-Allow-Origin': '*' } })
}

async function open(page: any, opts: { streams: any[] }) {
  await setup(page, { storage: { mode: 'movies', 'lastPage:movies': 'movies', movieLibrary: JSON.stringify([{ id: 'movie1', name: 'The Odyssey', sourceId: '42', sourceName: 'HubCloud', url: '/movie/1', addedAt: Date.now() }]) } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', serve)
  await page.route('http://127.0.0.1:5999/audio**', serve)
  await page.addInitScript((streams: any[]) => {
    const w = window as any, base = w.novelReader
    w.__forceSilent = true
    w.__fix = []
    w.novelReader = {
      ...base,
      miwayomiStatus: async () => ({ online: true }),
      audioFixStart: async (src: string) => { w.__fix.push(src); return { base: 'http://127.0.0.1:5999/audio', streams } },
      audioFixStop: async () => true,
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'The Odyssey' }
        if (p.includes('/episodes')) return [{ name: 'Movie', url: '/m/1' }]
        if (p.includes('/videos')) return [{ videoUrl: 'https://cdn.test/remux.mkv', videoTitle: 'HubCloud [1080p]', headers: {}, subtitleTracks: [], audioTracks: [] }]
        return []
      }
    }
  }, opts.streams)
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'The Odyssey' }).click()
  await page.getByRole('button', { name: 'Play movie' }).click()
}
const fixAudio = (page: any) => page.locator('audio.audio-fix')

test('a video without readable sound gets its sound converted, kept in step, track choice remembered', async ({ page }) => {
  await open(page, { streams: [{ index: 0, lang: 'eng', codec: 'dts', channels: '5.1', title: '', default: true }, { index: 1, lang: 'fre', codec: 'eac3', channels: '5.1(side)', title: 'VFF', default: false }] })
  const note = page.locator('.audio-fix-note')
  await expect(note).toContainText('Sound converted live (the file uses Dolby / DTS sound).', { timeout: 15000 })
  expect(await page.evaluate(() => (window as any).__fix[0])).toContain('http://127.0.0.1:4567/api/v1/proxy?')
  // The viewer's language (English here) is chosen; the converted sound starts a little ahead
  const src = await fixAudio(page).getAttribute('src')
  expect(src).toMatch(/^http:\/\/127\.0\.0\.1:5999\/audio\?src=http%3A%2F%2F127\.0\.0\.1%3A4567%2Fapi%2Fv1%2Fproxy.*&t=\d+\.\d\d&track=0$/)
  await expect.poll(() => fixAudio(page).evaluate((a: HTMLAudioElement) => !a.paused), { timeout: 10000 }).toBe(true)
  // Pause together
  await page.locator('.media-player-top video').evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => fixAudio(page).evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
  // Volume follows the player
  await page.locator('.media-player-top video').evaluate((v: HTMLVideoElement) => { v.volume = 0.3 })
  await expect.poll(() => fixAudio(page).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.3)
  // The player's volume button is greyed out for such files: the note has its own slider
  await note.getByLabel('Volume').fill('0.7')
  await expect.poll(() => fixAudio(page).evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.7)
  // Another sound track: restarted with it, and remembered
  await note.getByLabel('Sound track').selectOption({ label: 'VFF · FRE · EAC3 · 5.1(side)' })
  await expect.poll(async () => (await fixAudio(page).getAttribute('src')) || '').toMatch(/&track=1$/)
  expect(await page.evaluate(() => localStorage.getItem('audioFixLang'))).toBe('fre')
  // Seeking restarts the sound at the new place
  await page.locator('.media-player-top video').evaluate((v: HTMLVideoElement) => { v.currentTime = 12 })
  await expect.poll(async () => Number(/&t=([\d.]+)/.exec((await fixAudio(page).getAttribute('src')) || '')?.[1])).toBeGreaterThanOrEqual(11.9)
})

test('a file with no sound track at all says so', async ({ page }) => {
  await open(page, { streams: [] })
  await expect(page.locator('.audio-fix-note')).toContainText('This file has no sound track. Pick another quality.', { timeout: 15000 })
  await expect(fixAudio(page)).toHaveCount(0)
})
