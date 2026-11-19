// Full screen is the whole player, not the picture alone: the title, the choice of
// quality, "Skip intro" and the messages stay there; the bar over the picture hides
// when nothing moves. And a stream that cannot be decoded is repaired in steps, then
// given up for another one.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
const dir = path.join(__dirname, 'fixtures', 'hls')
const playlist = fs.readFileSync(path.join(dir, 'index.m3u8'), 'utf8')
  .replace('URI="init.mp4"', 'URI="http://127.0.0.1:4567/seg/init.mp4"').replace('index0.m4s', 'http://127.0.0.1:4567/seg/index0.m4s')

async function series(page: Page, videos: any[]) {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  await page.route('http://127.0.0.1:4567/**', r => {
    const u = new URL(r.request().url())
    if (u.pathname === '/api/v1/proxy') return r.fulfill({ status: 200, body: clip, headers: { ...cors, 'Content-Type': 'video/webm' } })
    if (u.pathname === '/api/v1/hls') return r.fulfill({ status: 200, body: playlist, headers: { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl' } })
    if (u.pathname.startsWith('/seg/')) return r.fulfill({ status: 200, body: fs.readFileSync(path.join(dir, u.pathname.slice(5))), headers: { ...cors, 'Content-Type': 'video/mp4' } })
    return r.fulfill({ status: 404, headers: cors })
  })
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', autoSkip: '0', seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/s/1', episodes: 3, addedAt: Date.now() }]) } })
  await page.addInitScript((videos) => {
    const w = window as any, base = w.novelReader
    w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true }),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Lanterns' }
        if (p.includes('/episodes')) return [1, 2, 3].map(n => ({ name: 'S1 E' + n + ' - Episode ' + n, url: '/ep/' + n, episode_number: n }))
        if (p.includes('/videos')) return videos
        return []
      } }
  }, videos)
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.media-hero .primary').click()
  await page.locator('.remote-player video').waitFor()
}
const fullClass = (page: Page) => page.evaluate(() => document.fullscreenElement?.className || '')
const inFull = (page: Page, sel: string) => page.evaluate(s => { const f = document.fullscreenElement, el = document.querySelector(s); if (!f || !el || !f.contains(el)) return false; const r = el.getBoundingClientRect(), c = getComputedStyle(el); return r.width > 2 && r.height > 2 && c.visibility !== 'hidden' && c.display !== 'none' }, sel)

test('full screen keeps the title, the quality choice and "Skip intro"; the bar hides when nothing moves', async ({ page }) => {
  await series(page, [
    { videoUrl: 'https://cdn.test/a.webm', videoTitle: 'Zeus - 1080p', headers: {}, timestamps: [{ start: 0, end: 30, name: 'Intro', type: 'Opening' }] },
    { videoUrl: 'https://cdn.test/b.webm', videoTitle: 'Hermes - 720p', headers: {} }])
  // (The stream with the intro marked is picked by hand.)
  await page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select').selectOption({ label: 'Zeus - 1080p' })
  await expect(page.locator('.player-skip')).toContainText('Skip intro')
  const player = page.locator('.remote-player')
  await expect(player).toHaveClass(/shell/)
  // The video's own button would show the picture alone: ours takes its place.
  expect(await page.locator('.remote-player video').evaluate((v: any) => v.controlsList.contains('nofullscreen'))).toBe(true)
  await expect(page.locator('.media-fs-name')).toBeHidden()
  await page.locator('.player-trackbar').getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await expect.poll(() => fullClass(page)).toContain('media-player-top')
  await expect(player).toHaveClass(/full/)
  // The name of the series comes before the episode's, over the picture.
  await expect(page.locator('.media-player-title h2')).toHaveText('Lanterns · S1 E1 - Episode 1', { useInnerText: true })
  for (const sel of ['.media-player-title h2', '.player-trackbar select', '.player-skip', '.remote-player video']) expect(await inFull(page, sel), sel).toBe(true)
  await expect(page.locator('.player-skip')).toContainText('Skip intro')
  // The video fills the screen, and the row under it (previous / next) is put away.
  const box = await page.locator('.remote-player video').boundingBox(), vp = page.viewportSize()!
  expect(Math.round(box!.width)).toBe(vp.width); expect(Math.round(box!.height)).toBe(vp.height)
  await expect(page.locator('.player-row')).toBeHidden()
  // Nothing moves for 3 s while it plays: the bar and the pointer hide; a move brings them back.
  await page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play() })
  await expect(player).toHaveClass(/idle/, { timeout: 8000 })
  await expect(page.locator('.player-trackbar')).toHaveCSS('opacity', '0')
  await expect(page.locator('.media-player-title')).toHaveCSS('opacity', '0')
  expect(await page.locator('.media-player-top').evaluate(el => getComputedStyle(el).cursor)).toBe('none')
  await page.mouse.move(300, 300); await page.mouse.move(320, 310)
  await expect(player).not.toHaveClass(/idle/)
  await expect(page.locator('.player-trackbar')).toHaveCSS('opacity', '1')
  // Paused: the bar stays.
  await page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => v.pause())
  await page.waitForTimeout(3600)
  await expect(player).not.toHaveClass(/idle/)
  // Changing the quality works from there, and full screen is kept.
  await page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select').selectOption({ label: 'Hermes - 720p' })
  await expect(page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select option:checked')).toHaveText('Hermes - 720p')
  await expect(page.locator('.player-skip')).toHaveCount(0)
  expect(await fullClass(page)).toContain('media-player-top')
  // …and from one episode to the next (N), with the new title over the picture.
  await page.keyboard.press('n')
  await expect(page.locator('.media-player-title h2')).toHaveText('Lanterns · S1 E2 - Episode 2', { useInnerText: true })
  await page.locator('.remote-player video').waitFor()
  expect(await fullClass(page)).toContain('media-player-top')
  await expect(page.locator('.remote-player')).toHaveClass(/full/)
  // Out with the same button, back in with F, out with a double click on the picture.
  await page.locator('.player-trackbar').getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect.poll(() => fullClass(page)).toBe('')
  await expect(player).not.toHaveClass(/full/)
  await page.locator('h1, h2').first().click({ force: true }).catch(() => {})
  await page.keyboard.press('f')
  await expect.poll(() => fullClass(page)).toContain('media-player-top')
  await page.locator('.remote-player video').dblclick({ position: { x: 200, y: 150 } })
  await expect.poll(() => fullClass(page)).toBe('')
})

test('a stream that cannot be decoded: two repairs, then another stream is tried', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hlsForTest = (h: any) => { (window as any).__hls = h; (window as any).__hlsCalls = []; for (const k of ['recoverMediaError', 'swapAudioCodec']) { const o = h[k].bind(h); h[k] = (...a: any[]) => { (window as any).__hlsCalls.push(k); return o(...a) } } } })
  await series(page, [
    { videoUrl: 'https://cdn.test/one/index.m3u8', videoTitle: 'Zeus - 1080p', headers: {} },
    { videoUrl: 'https://cdn.test/b.webm', videoTitle: 'Hermes - 720p', headers: {} }])
  // (The plain file is played first; the HLS stream is picked by hand.)
  await page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select').selectOption({ label: 'Zeus - 1080p' })
  await expect.poll(() => page.evaluate(() => !!(window as any).__hls)).toBe(true)
  const fatal = () => page.evaluate(() => { const h = (window as any).__hls; h.trigger('hlsError', { type: 'mediaError', details: 'bufferAppendError', fatal: true }) })
  await fatal()
  expect(await page.evaluate(() => (window as any).__hlsCalls)).toEqual(['recoverMediaError'])
  await fatal()
  expect(await page.evaluate(() => (window as any).__hlsCalls)).toEqual(['recoverMediaError', 'swapAudioCodec', 'recoverMediaError'])
  await expect(page.locator('.media-player-top')).not.toContainText('cannot be decoded')
  await fatal()
  // Third time within 20 s: said, and the next stream takes over.
  await expect(page.locator('.media-player-top')).toContainText('cannot be decoded on this device')
  await expect(page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select option:checked')).toHaveText('Hermes - 720p', { timeout: 10_000 })
})
