import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

// A small LNReader-style plugin, run by the in-page runtime (cheerio, @libs/fetch).
const PLUGIN = `
const cheerio = require('cheerio'); const { fetchApi } = require('@libs/fetch');
module.exports.default = {
  id: 'testsrc', name: 'Test Source', site: 'https://novels.test',
  async popularNovels(page) { const html = await (await fetchApi('https://novels.test/popular')).text(); const $ = cheerio.load(html); return $('a.n').map((i, a) => ({ name: $(a).text(), path: $(a).attr('href'), cover: '' })).get() },
  async searchNovels(q) { return (await this.popularNovels(1)).filter(n => n.name.toLowerCase().includes(q.toLowerCase())) },
  async parseNovel(path) { const $ = cheerio.load(await (await fetchApi('https://novels.test' + path)).text()); return { path, name: $('h1').text(), author: 'Auth', summary: $('p.s').text(), chapters: $('a.c').map((i, a) => ({ name: $(a).text(), path: $(a).attr('href') })).get() } },
  async parseChapter(path) { return '<p>Text of ' + path + '</p>' }
}`
const MANIFEST = [{ id: 'testsrc', name: 'Test Source', lang: 'English', version: '1.0.0', url: 'https://plugins.test/testsrc.js', iconUrl: '' }]

test.beforeEach(async ({ page }) => {
  await page.route('**/plugins.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(MANIFEST) }))
  await page.route('https://plugins.test/testsrc.js', r => r.fulfill({ contentType: 'text/javascript', body: PLUGIN }))
  await page.route('https://novels.test/popular', r => r.fulfill({ contentType: 'text/html', body: '<a class="n" href="/novel/shadow">Shadow Slave</a><a class="n" href="/novel/lotm">Lord of the Mysteries</a>' }))
  await page.route('https://novels.test/novel/shadow', r => r.fulfill({ contentType: 'text/html', body: '<h1>Shadow Slave</h1><p class="s">A boy and his shadow.</p><a class="c" href="/c/1">Chapter 1</a><a class="c" href="/c/2">Chapter 2</a>' }))
  await page.addInitScript(() => {
    (window as any).Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true }
    if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('onboarded', '1'); localStorage.setItem('lang', 'en'); localStorage.setItem('enabledPlugins', JSON.stringify(['testsrc'])); sessionStorage.setItem('__seeded', '1') }
  })
})

test('Android: book sources run in the app, search, open a novel, read a chapter, keep it offline', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/android/)
  await page.locator('.sidebar').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('shadow')
  await page.locator('main input').first().press('Enter')
  await expect(page.locator('main')).toContainText('Shadow Slave', { timeout: 15000 })
  await page.getByRole('button', { name: /Add from Test Source/ }).click()
  // Added: parseNovel ran in the page too (chapters fetched from the site)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('library') || '[]').map((n: any) => [n.name, n.chapterCount ?? n.chapters?.length])), { timeout: 15000 }).toEqual([['Shadow Slave', 2]])
  await page.locator('.sidebar').getByRole('button', { name: 'Library' }).click()
  await page.locator('main').getByText('Shadow Slave').first().click()
  await expect(page.locator('main')).toContainText('Chapter 2', { timeout: 15000 })
  await page.locator('main').getByText('Chapter 1', { exact: false }).first().click()
  await expect(page.locator('main')).toContainText('Text of /c/1', { timeout: 15000 })
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/android-novel.png' })
})

// Videos: the interface talks to the engine inside the app over HTTP
// (http://127.0.0.1:4567, like on the PC), here a scripted fake.
test('Android: a series plays through the engine in the app', async ({ page }) => {
  const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
  const calls: string[] = []
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await page.route('http://127.0.0.1:4567/**', r => {
    const u = new URL(r.request().url()), p = u.pathname
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    calls.push(p)
    const json = (b: any) => r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(b) })
    if (p === '/api/v1/proxy') return r.fulfill({ status: 200, body: clip, headers: { ...cors, 'Content-Type': 'video/webm' } })
    if (p === '/api/v1/health') return json({ status: 'ok', service: 'miwayomi', mangaSources: 0, animeSources: 1 })
    if (p === '/api/v1/sources') return json({ manga: [], anime: [{ id: '42', name: 'Mapple', lang: 'en', type: 'anime', pkg: 'mapple' }] })
    if (p.endsWith('/details')) return json({ url: '/series/1', title: 'Lanterns', description: 'A mystery.', status: 2, thumbnail_url: '' })
    if (p.endsWith('/episodes')) return json([1, 2, 3].map(n => ({ name: `S1 E${n}`, url: '/ep/' + n, episode_number: n })))
    if (p.endsWith('/videos')) return json([{ videoUrl: 'https://cdn.test/a.mp4', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] }])
    return json([])
  })
  await page.addInitScript(() => {
    localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series')
    localStorage.setItem('seriesLibrary', JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', thumbnail: '', episodes: 3, addedAt: Date.now() }]))
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await expect(page.locator('.media-hero h1')).toHaveText('Lanterns')
  await page.locator('.media-hero .primary').click()
  await expect(page.locator('.remote-player video')).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:4567\/api\/v1\/proxy\?/)
  await expect.poll(() => page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  expect(calls).toContain('/api/v1/anime/42/videos')
  // Phone layout: the player takes the width, nothing sticks out on the side.
  const m = await page.evaluate(() => { const main = document.querySelector('main')!.getBoundingClientRect(), p = document.querySelector('.remote-player video')!.getBoundingClientRect(); return { main: main.width, player: p.width, overflow: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName + '.' + e.className).slice(0, 5) } })
  console.log(JSON.stringify(m))
})

// Fresh install: no video source yet. Search says so and leads to Sources.
test('Android: search with no video source points to Sources', async ({ page }) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await page.route('http://127.0.0.1:4567/**', r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    const p = new URL(r.request().url()).pathname
    const body = p === '/api/v1/health' ? { status: 'ok' } : p === '/api/v1/sources' ? { manga: [], anime: [] } : []
    return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
  })
  await page.addInitScript(() => { localStorage.setItem('mode', 'anime'); localStorage.setItem('lastPage:anime', 'animeSearch') })
  await page.goto('/')
  await expect(page.locator('.no-source')).toContainText('No source installed yet')
  await page.locator('main input').first().fill('Naruto')
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.locator('main')).not.toContainText('Choose at least one language.')
  await page.locator('.no-source').getByRole('button', { name: 'Open Sources' }).click()
  await expect(page.locator('.no-source')).toHaveCount(0)
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Sources' })).toHaveAttribute('aria-current', /page|true/)
})

// In-app updates: a newer APK on GitHub is downloaded in the background, then
// "Install" opens Android's installer (native Updater plugin, faked here).
test('Android: update found on GitHub, downloaded, Install opens the installer', async ({ page }) => {
  await page.route('https://api.github.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([
    { tag_name: 'source-status', assets: [{ name: 'source-status.json' }] },
    { tag_name: 'v99.0.0', assets: [{ name: 'NovelReader-Setup-99.0.0.exe', browser_download_url: 'https://x/y.exe', size: 1 }, { name: 'NovelReader-99.0.0.apk', browser_download_url: 'https://github.com/x/NovelReader-99.0.0.apk', size: 1234 }] },
    { tag_name: 'v0.1.0', assets: [{ name: 'NovelReader-0.1.0.apk', browser_download_url: 'https://x/old.apk', size: 1 }] },
  ]) }))
  await page.addInitScript(() => {
    const w = window as any
    w.__updater = { downloads: [] as any[], installs: 0 }
    let progress: any = null
    w.Capacitor.Plugins = { Updater: {
      addListener: (_: string, cb: any) => { progress = cb; return { remove() {} } },
      download: async (o: any) => { w.__updater.downloads.push(o); progress?.({ percent: 50 }); await new Promise(r => setTimeout(r, 300)); progress?.({ percent: 100 }); return { size: o.size } },
      install: async () => { w.__updater.installs++; return { started: true } },
      canInstall: async () => ({ allowed: true, downloaded: true }),
    } }
  })
  await page.goto('/')
  await page.locator('.sidebar').getByRole('button', { name: 'Settings' }).click()
  await page.locator('main').getByRole('button', { name: 'Check for updates' }).click()
  await expect(page.locator('.update-banner')).toContainText('NovelReader 99.0.0 is downloaded. Tap Install and confirm')
  await expect(page.locator('main')).toContainText('Version 99.0.0 is downloaded: tap Install, Android asks you to confirm.')
  await expect(page.locator('main')).not.toContainText('idle for 15 minutes')
  expect(await page.evaluate(() => (window as any).__updater.downloads)).toEqual([{ url: 'https://github.com/x/NovelReader-99.0.0.apk', size: 1234 }])
  await page.locator('.update-banner').getByRole('button', { name: 'Install' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__updater.installs)).toBe(1)
})
