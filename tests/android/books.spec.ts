import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import qrcode from 'qrcode-generator'
// The QR code of the phone link as the PC draws it (features/qr.tsx).
const QR_CELLS = (() => { const q = (qrcode as any)(0, 'M'); q.addData('192.168.1.5:4580/abcdefghjk'); q.make(); const n = q.getModuleCount(); return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c))) })()

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
const MANIFEST = [{ id: 'testsrc', name: 'Test Source', lang: 'English', version: '1.0.0', url: 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/testsrc.js', iconUrl: '' }]

test.beforeEach(async ({ page }) => {
  await page.route('**/plugins.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(MANIFEST) }))
  await page.route('https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/testsrc.js', r => r.fulfill({ contentType: 'text/javascript', body: PLUGIN }))
  await page.route('https://novels.test/popular', r => r.fulfill({ contentType: 'text/html', body: '<a class="n" href="/novel/shadow">Shadow Slave</a><a class="n" href="/novel/lotm">Lord of the Mysteries</a>' }))
  await page.route('https://novels.test/novel/shadow', r => r.fulfill({ contentType: 'text/html', body: '<h1>Shadow Slave</h1><p class="s">A boy and his shadow.</p><a class="c" href="/c/1">Chapter 1</a><a class="c" href="/c/2">Chapter 2</a>' }))
  await page.addInitScript((notes) => {
    (window as any).Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true }
    if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('onboarded', '1'); localStorage.setItem('whatsNewSeen', notes); localStorage.setItem('homeAtStart', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('enabledPlugins', JSON.stringify(['testsrc'])); sessionStorage.setItem('__seeded', '1') }
  }, (/^##\s*NovelReader\s+([\d.]+)/m.exec(fs.readFileSync('build/release-notes.md', 'utf8')) || [])[1] || '')
})

test('Android: book sources run in the app, search, open a novel, read a chapter, keep it offline', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/android/)
  await page.locator('.m-bottom').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('shadow')
  await page.locator('main input').first().press('Enter')
  await expect(page.locator('main')).toContainText('Shadow Slave', { timeout: 15000 })
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  // Added: parseNovel ran in the page too (chapters fetched from the site)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('library') || '[]').map((n: any) => [n.name, n.chapterCount ?? n.chapters?.length])), { timeout: 15000 }).toEqual([['Shadow Slave', 2]])
  await page.locator('.m-bottom').getByRole('button', { name: 'Library' }).click()
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
  await expect(page.locator('main h1')).toContainText('Video sources')
})

// In-app updates: a newer APK on GitHub is downloaded in the background, then
// "Install" opens Android's installer (native Updater plugin, faked here).
test('Android: update found on GitHub, downloaded, Install opens the installer', async ({ page }) => {
  await page.route('https://api.github.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([
    { tag_name: 'source-status', assets: [{ name: 'source-status.json' }] },
    { tag_name: 'v99.0.0', assets: [{ name: 'NovelReader-Setup-99.0.0.exe', browser_download_url: 'https://x/y.exe', size: 1 }, { name: 'NovelReader-99.0.0.apk', browser_download_url: 'https://github.com/madaratn/NovelReader-Windows/releases/download/v99.0.0/NovelReader-99.0.0.apk', size: 1234 }] },
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
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await page.locator('main').getByRole('button', { name: 'Check for updates' }).click()
  await expect(page.locator('.update-banner')).toContainText('NovelReader 99.0.0 is downloaded. Tap Install and confirm')
  // Scrolled down, the banner stays visible under the top bar (not hidden behind it).
  await page.evaluate(() => { (document.scrollingElement || document.documentElement).scrollTop = 600; document.querySelector('main')?.scrollTo(0, 600) })
  const bar = await page.locator('.m-top').boundingBox(), banner = await page.locator('.update-banner').boundingBox()
  expect(banner!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height)
  await expect(page.locator('.update-banner')).toBeInViewport()
  await expect(page.locator('main')).toContainText('Version 99.0.0 is downloaded: tap Install, Android asks you to confirm.')
  await expect(page.locator('main')).not.toContainText('idle for 15 minutes')
  expect(await page.evaluate(() => (window as any).__updater.downloads)).toEqual([{ url: 'https://github.com/madaratn/NovelReader-Windows/releases/download/v99.0.0/NovelReader-99.0.0.apk', size: 1234 }])
  await page.locator('.update-banner').getByRole('button', { name: 'Install' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__updater.installs)).toBe(1)
})

// Beta releases are opt-in. Switching back to stable must invalidate any queued
// beta APK before it can be presented for installation.
test('Android: beta channel is opt-in, persistent and can be turned off safely', async ({ page }) => {
  const stable='https://github.com/madaratn/NovelReader-Windows/releases/download/v99.0.0/NovelReader-99.0.0.apk'
  const beta='https://github.com/madaratn/NovelReader-Windows/releases/download/v100.0.0/NovelReader-100.0.0.apk'
  let requests=0
  await page.route('https://api.github.com/**',r=>{
    requests++
    return r.fulfill({contentType:'application/json',body:JSON.stringify([
      {tag_name:'v100.0.0',prerelease:true,assets:[{name:'NovelReader-100.0.0.apk',browser_download_url:beta,size:1500}]},
      {tag_name:'v99.0.0',prerelease:false,assets:[{name:'NovelReader-99.0.0.apk',browser_download_url:stable,size:1200}]},
      {tag_name:'v101.0.0',prerelease:true,assets:[{name:'NovelReader-101.0.0.apk',browser_download_url:'https://evil.test/fake.apk',size:1}]},
    ])})
  })
  await page.addInitScript(()=>{
    const w=window as any
    w.__updater={downloads:[] as any[],installs:0}
    w.Capacitor.Plugins={Updater:{
      addListener:()=>({remove(){}}),
      download:async(o:any)=>{w.__updater.downloads.push(o)},
      install:async()=>{w.__updater.installs++;return{started:true}},
      canInstall:async()=>({allowed:true}),
    }}
  })
  await page.goto('/')
  await page.locator('.m-bottom').getByRole('button',{name:'More'}).click()
  await page.locator('.m-sheet').getByRole('button',{name:'Settings'}).click()
  const toggle=page.locator('main').getByRole('checkbox',{name:/Receive beta versions/})
  await expect(toggle).not.toBeChecked()
  await page.locator('main').getByRole('button',{name:'Check for updates'}).click()
  await expect(page.locator('.update-banner')).toContainText('99.0.0')
  expect((await page.evaluate(()=>(window as any).__updater.downloads)).map((v:any)=>v.url)).toEqual([stable])

  await toggle.check()
  await expect(page.locator('.update-banner')).toContainText('100.0.0')
  expect((await page.evaluate(()=>(window as any).__updater.downloads)).map((v:any)=>v.url)).toEqual([stable,beta])
  expect(await page.evaluate(()=>localStorage.getItem('androidBetaUpdates'))).toBe('1')

  await toggle.uncheck()
  await expect(page.locator('.update-banner')).toContainText('99.0.0')
  expect(await page.evaluate(()=>localStorage.getItem('androidBetaUpdates'))).toBe('0')
  await page.locator('.update-banner').getByRole('button',{name:'Install'}).click()
  expect(await page.evaluate(()=>(window as any).__updater.installs)).toBe(1)
  expect(requests).toBeGreaterThanOrEqual(3)

  await page.reload()
  await page.locator('.m-bottom').getByRole('button',{name:'More'}).click()
  await page.locator('.m-sheet').getByRole('button',{name:'Settings'}).click()
  await expect(page.locator('main').getByRole('checkbox',{name:/Receive beta versions/})).not.toBeChecked()
})

// Cast (served by the engine in the app) and online subtitles (run in the app).
test('Android: cast a series to a TV, and find subtitles online', async ({ page }) => {
  const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
  const castCalls: any[] = []
  let playing = true
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await page.route('http://127.0.0.1:4567/**', async r => {
    const u = new URL(r.request().url()), p = u.pathname
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    const json = (b: any, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(b) })
    if (p.startsWith('/api/v1/cast/')) {
      const body = r.request().postData() ? JSON.parse(r.request().postData()!) : null
      castCalls.push([p.slice(13), body])
      if (p.endsWith('/scan')) return json([{ id: 'dlna:tv1', name: 'Salon TV', kind: 'dlna', host: '192.168.1.20' }])
      if (p.endsWith('/start')) return json({ device: { id: 'dlna:tv1', name: 'Salon TV', kind: 'dlna' }, url: 'http://192.168.1.5:4570/t/x/4567/api/v1/proxy' })
      if (p.endsWith('/status')) return json({ time: 42, duration: 1440, playing, state: playing ? 'playing' : 'paused_playback' })
      if (p.endsWith('/control')) { if (body.action === 'pause') playing = false; return json({ ok: true }) }
      return json({ ok: true })
    }
    if (p === '/api/v1/proxy') return r.fulfill({ status: 200, body: clip, headers: { ...cors, 'Content-Type': 'video/webm' } })
    if (p === '/api/v1/health') return json({ status: 'ok' })
    if (p === '/api/v1/sources') return json({ manga: [], anime: [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'mapple' }] })
    if (p.endsWith('/details')) return json({ url: '/series/1', title: 'Lanterns', status: 2, thumbnail_url: '' })
    if (p.endsWith('/episodes')) return json([{ name: 'S1 E1', url: '/ep/1', episode_number: 1 }])
    if (p.endsWith('/videos')) return json([{ videoUrl: 'https://cdn.test/a.mp4', videoTitle: '720p', headers: {}, subtitleTracks: [], audioTracks: [] }])
    return json([])
  })
  await page.route('https://v2.sg.media-imdb.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ d: [{ id: 'tt1234567', l: 'Lanterns', y: 2024, qid: 'tvSeries' }] }) }))
  await page.route('https://sub.wyzie.io/search**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 's1', url: 'https://sub.wyzie.io/c/s1.srt', language: 'en', display: 'English', release: 'Lanterns.S01E01.WEB', format: 'srt', downloadCount: 9 }]) }))
  await page.route('https://sub.wyzie.io/c/**', r => r.fulfill({ contentType: 'text/plain', body: '1\r\n00:00:01,000 --> 00:00:04,000\r\nThe lanterns are lit.\r\n' }))
  await page.addInitScript(() => {
    localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series'); localStorage.setItem('wyzieKey', 'k'); localStorage.setItem('subAutoOnline', '0')
    localStorage.setItem('seriesLibrary', JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', thumbnail: '', episodes: 1, addedAt: Date.now() }]))
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.media-hero .primary').click()
  await expect(page.locator('.remote-player video')).toHaveAttribute('src', /127\.0\.0\.1:4567\/api\/v1\/proxy/)
  // Subtitles found online, added to the player.
  await page.getByRole('button', { name: /Subtitles/ }).first().click()
  await expect(page.locator('.sub-finder')).not.toContainText('Written by AI')
  await page.locator('.sub-results button', { hasText: 'Lanterns.S01E01.WEB' }).click()
  await expect.poll(() => page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => [...v.textTracks].map(t => t.label).join('|'))).toContain('English')
  // Cast: TVs found by the engine, then the remote control.
  await page.locator('.cast-btn').click()
  await page.locator('.cast-menu').getByRole('button', { name: /Salon TV/ }).click()
  await expect(page.locator('.cast-panel')).toContainText('Playing on Salon TV')
  await expect(page.locator('.cast-seek')).toContainText('0:42')
  await page.locator('.cast-panel').getByRole('button', { name: 'Pause' }).click()
  await expect.poll(() => castCalls.some(c => c[0] === 'control' && c[1].action === 'pause')).toBe(true)
  const start = castCalls.find(c => c[0] === 'start')[1]
  expect(start.deviceId).toBe('dlna:tv1')
  expect(start.url).toMatch(/^http:\/\/127\.0\.0\.1:4567\/api\/v1\/proxy\?/)
  await page.locator('.cast-panel').getByRole('button', { name: /Stop casting/ }).click()
  await expect(page.locator('.cast-panel')).toHaveCount(0)
  expect(castCalls.some(c => c[0] === 'stop')).toBe(true)
})

// Phone layout: modes on top, at most 5 tabs at the bottom (no sideways scrolling),
// PC-only pages hidden, full screen while reading.
test('Android: phone navigation fits the screen and gets out of the way to read', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 })
  await page.goto('/')
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
  await expect(page.locator('.m-top [role=tab]')).toHaveText(['Books', 'Anime', 'Series', 'Movies'])
  await expect(page.locator('.m-bottom button')).toHaveCount(5)
  expect(await fits()).toBe(true)
  for (const b of await page.locator('.m-bottom button').all()) { const box = (await b.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(48); expect(box.x + box.width).toBeLessThanOrEqual(360) }
  await page.locator('.m-top').getByRole('tab', { name: 'Anime' }).click()
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await expect(page.locator('.m-sheet')).toContainText('Settings')
  await expect(page.locator('.m-sheet')).toContainText('Local Videos')
  await expect(page.locator('.m-sheet')).not.toContainText('Internet Archive')
  await expect(page.locator('.m-sheet')).toContainText('Downloads')
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('main')).toContainText('Like the phone')
  await expect(page.locator('main')).not.toContainText('Windows notification')
  await expect(page.locator('main')).not.toContainText('Sync between PCs')
  // Read a chapter: no bars around the text.
  await page.locator('.m-top').getByRole('tab', { name: 'Books' }).click()
  await page.locator('.m-bottom').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('shadow')
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await page.locator('.m-bottom').getByRole('button', { name: 'Library' }).click()
  await page.locator('main').getByText('Shadow Slave').first().click()
  await page.locator('main').getByText('Chapter 1', { exact: false }).first().click()
  await expect(page.locator('main')).toContainText('Text of /c/1')
  await expect(page.locator('.m-bottom')).toHaveCount(0)
  await expect(page.locator('.m-top')).toHaveCount(0)
  expect(await fits()).toBe(true)
})

// Text size in the reader applies to the whole chapter, also when the site forces
// sizes in its HTML (inline styles, <font>), not only to the title.
test('Android: reader text size changes the chapter text, not only the title', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 })
  await page.goto('/')
  await page.locator('.m-bottom').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('shadow')
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: '＋ Add', exact: true }).click()
  await page.locator('.m-bottom').getByRole('button', { name: 'Library' }).click()
  await page.locator('main').getByText('Shadow Slave').first().click()
  await page.locator('main').getByText('Chapter 1', { exact: false }).first().click()
  await expect(page.locator('main')).toContainText('Text of /c/1')
  // What some sites send: sizes and fonts written into the text.
  await page.evaluate(() => { const d = document.querySelector('.readercontent > div')!; d.insertAdjacentHTML('beforeend', '<p id="styled" style="font-size:13px;font-family:Arial"><span style="font-size:12px" id="inner">Small text from the site</span></p><p><font size="2" id="font">Old font tag</font></p>') })
  const sizes = () => page.evaluate(() => ['.readercontent h1', '#styled', '#inner', '#font'].map(s => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize)))
  const [h1, p, inner, font] = await sizes()
  expect(p).toBeCloseTo(h1 / 1.5, 0); expect(inner).toBe(p); expect(font).toBe(p)
  await page.locator('.readertools').getByRole('button', { name: 'Aa' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Larger text' }).click()
  const after = await sizes()
  expect(after[1]).toBe(p + 4); expect(after[2]).toBe(p + 4); expect(after[3]).toBe(p + 4)
  expect(after[0]).toBeCloseTo((p + 4) * 1.5, 0)
})

// Unfolded phone / tablet: the left menu shows the page names and folds to icons.
test('Android tablet: the left menu folds and unfolds', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/')
  const side = page.locator('aside.sidebar')
  const width = async () => (await side.boundingBox())!.width
  await expect(side.getByText('Discover')).toBeVisible()
  await expect.poll(width).toBeGreaterThan(180)
  await side.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(side.getByText('Discover')).toBeHidden()
  await expect.poll(width).toBeLessThan(80)
  await expect(side.getByRole('button', { name: 'Discover' })).toBeVisible()
  await page.reload()
  await expect.poll(width).toBeLessThan(80)
  await side.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(side.getByText('Discover')).toBeVisible()
  await expect.poll(width).toBeGreaterThan(180)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('Android: a source that fails on a phone is marked as failing, whatever the PC check says', async ({ page }) => {
  const S = 'https://github.com/madaratn/NovelReader-Windows/releases/download/source-status/'
  await page.route(S + 'source-status.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ at: '2026-11-10T00:00:00Z', results: [{ name: 'Good', pkg: 'p.good', state: 'ok', detail: '' }, { name: 'PcOnly', pkg: 'p.pconly', state: 'ok', detail: '' }, { name: 'Untested', pkg: 'p.untested', state: 'partial', detail: 'x' }] }) }))
  await page.route(S + 'source-status-android.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ at: '2026-11-11T00:00:00Z', tested: 2, results: [{ name: 'Good', pkg: 'p.good', state: 'ok', detail: '' }, { name: 'PcOnly', pkg: 'p.pconly', state: 'dead', detail: '12 titles → no stream' }, { name: 'Untested', pkg: 'p.untested', state: 'dead', detail: '30 titles → error: timeout: videos' }] }) }))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).novelReader?.sourceStatus)
  const st = await page.evaluate(() => (window as any).novelReader.sourceStatus())
  expect(st.results.map((r: any) => r.state)).toEqual(['ok', 'dead', 'partial'])
  expect(st.results[1].detail).toBe('On Android: 12 titles → no stream')
  // No phone sweep published yet: the PC check is used as it is.
  await page.unroute(S + 'source-status-android.json')
  await page.route(S + 'source-status-android.json', r => r.fulfill({ status: 404, body: '' }))
  const pc = await page.evaluate(() => (window as any).novelReader.sourceStatus())
  expect(pc.results.map((r: any) => r.state)).toEqual(['ok', 'ok', 'partial'])
})

test('Android: sync with the PC through the file the PC wrote (library, positions), and back', async ({ page }) => {
  // The file as the PC left it in the cloud folder.
  const pcFile = { app: 'NovelReader', version: 1, at: Date.now() - 60000, deviceId: 'pc1', deviceName: 'PC-SALON', data: {
    seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', episodes: 2, addedAt: Date.now() - 90000 }]),
    'reading:n1': JSON.stringify({ chapter: 3, at: Date.now() - 80000 }) } }
  await page.addInitScript((file) => {
    const w = window as any
    w.__file = { picked: false, text: JSON.stringify(file), writes: 0 }
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), Sync: {
      status: async () => ({ enabled: w.__file.picked, file: w.__file.picked ? 'library-sync.json' : null, deviceName: 'Google Pixel 8' }),
      choose: async () => { w.__file.picked = true; return {} },
      read: async () => ({ text: w.__file.text }),
      write: async ({ text }: any) => { w.__file.text = text; w.__file.writes++; return {} },
      disable: async () => { w.__file.picked = false; return {} } } }
  }, pcFile)
  await page.goto('/')
  await page.evaluate(() => { localStorage.setItem('animeLibrary', JSON.stringify([{ id: 'a1', name: 'Phone Anime', sourceId: '7', sourceName: 'S', url: '/a/1', episodes: 1, addedAt: Date.now() }])) })
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  await page.locator('.sync-file').getByRole('button', { name: 'Choose the sync file…' }).click()
  const block = page.locator('.settings-block', { hasText: 'Sync with your PC' })
  await expect(block).toContainText('library-sync.json')
  await expect(block).toContainText('Last synced')
  // The PC's series arrived here; the phone's anime went into the file, signed by the phone.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').map((x: any) => x.name))).toEqual(['Lanterns'])
  expect(await page.evaluate(() => localStorage.getItem('reading:n1'))).toContain('"chapter":3')
  const written = JSON.parse(await page.evaluate(() => (window as any).__file.text))
  expect(written.app).toBe('NovelReader'); expect(written.deviceName).toBe('Google Pixel 8'); expect(written.deviceId).not.toBe('pc1')
  expect(JSON.parse(written.data.animeLibrary).map((x: any) => x.name)).toEqual(['Phone Anime'])
  expect(JSON.parse(written.data.seriesLibrary).map((x: any) => x.name)).toEqual(['Lanterns'])
  // A file that is not NovelReader's is refused, nothing is overwritten.
  await page.evaluate(() => { (window as any).__file.text = '{"hello":1}'; (window as any).__file.writes = 0 })
  await block.getByRole('button', { name: 'Sync now' }).click()
  await expect(block.getByRole('alert')).toContainText('not a NovelReader file')
  await block.getByRole('button', { name: 'Stop syncing' }).click()
  await expect(page.locator('.sync-file').getByRole('button', { name: 'Choose the sync file…' })).toBeVisible()
})

test('Android: videos can be kept offline (Downloads page, engine calls, wording without "PC")', async ({ page }) => {
  const calls: string[] = []
  const item = { id: 'series_s1_abc', kind: 'series', mediaId: 's1', mediaName: 'Lanterns', episodeUrl: '/ep/1', episodeName: 'S1 E1', episodeNo: 1, mediaKey: 'series:s1:/ep/1', state: 'done', progress: 1, size: 52428800, type: 'hls', file: 'index.m3u8', title: '720p', subtitles: [], createdAt: 2, finishedAt: 3 }
  const running = { ...item, id: 'series_s1_def', episodeUrl: '/ep/2', episodeName: 'S1 E2', episodeNo: 2, state: 'downloading', progress: 0.4, bytes: 1000, file: '', size: 0 }
  let list: any[] = [item, running]
  await page.route('http://127.0.0.1:4567/api/v1/**', async r => {
    const u = new URL(r.request().url()), p = u.pathname.replace('/api/v1/', '')
    calls.push(r.request().method() + ' ' + p + (r.request().postData() ? ' ' + r.request().postData() : ''))
    const json = (b: any) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) })
    if (p === 'dl/list') return json(list)
    if (p === 'dl/usage') return json({ bytes: 52428800, count: 1, folder: '/x' })
    if (p === 'dl/version') return json({ version: list.length })
    if (p === 'dl/remove') { list = list.filter(x => x.id !== JSON.parse(r.request().postData() || '{}').id); return json({ ok: true }) }
    if (p === 'dl/cancel') { list = list.filter(x => x.id !== JSON.parse(r.request().postData() || '{}').id); return json({ ok: true }) }
    if (p === 'health') return json({ status: 'ok' })
    if (p === 'sources') return json({ manga: [], anime: [] })
    return json({})
  })
  await page.goto('/')
  await page.evaluate(() => { localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'downloads') })
  await page.reload()
  const main = page.locator('main')
  await expect(main).toContainText('Episodes and movies saved on this device.')
  await expect(main).toContainText('Lanterns')
  await expect(main).toContainText('S1 E1')
  await expect(main).toContainText('1 video · 52.4 MB')
  await expect(main.getByRole('button', { name: 'Open folder' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).novelReader.dlBase())).toBe('http://127.0.0.1:4567/api/v1/dl/file')
  // The numbers reach the engine in the form it reads (whole numbers, episode number as a number).
  await page.evaluate(() => (window as any).novelReader.dlConfigure({ maxHeight: 720, limit: 1048576.4 }))
  expect(calls).toContain('POST dl/configure {"maxHeight":720,"limit":1048576}')
  // An engine refusal is shown as its own sentence.
  await page.unroute('http://127.0.0.1:4567/api/v1/**')
  await page.route('http://127.0.0.1:4567/api/v1/dl/start', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'This episode has no stream that can be downloaded.' }) }))
  const err = await page.evaluate(() => (window as any).novelReader.dlStart({ kind: 'series', mediaId: 's1', episodeUrl: '/e', candidates: [] }).then(() => '', (e: any) => e.message))
  expect(err).toBe('This episode has no stream that can be downloaded.')
})

test('Android: notifications setting, and the list of titles checked while the app is closed', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__n = { asked: 0, shown: [] as any[], watch: [] as any[] }
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), Notify: {
      status: async () => ({ granted: true }), request: async () => { w.__n.asked++; return { granted: true } },
      show: async (o: any) => { w.__n.shown.push(o); return {} }, watch: async (o: any) => { w.__n.watch.push(o); return {} } } }
    if (!localStorage.getItem('seriesLibrary')) {
      localStorage.setItem('seriesLibrary', JSON.stringify([{ id: 's1', name: 'Lanterns', sourceId: '42', url: '/series/1', episodes: 10 }, { id: 's2', name: 'Dropped', sourceId: '42', url: '/series/2', episodes: 4, shelf: 'dropped' }, { id: 's3', name: 'Tunisian', sourceId: '777000000000000216', url: 'pl:x', episodes: 3 }]))
      localStorage.setItem('animeLibrary', JSON.stringify([{ id: 'a1', title: 'Frieren', sourceId: '7', path: '/a/1', episodes: 28 }]))
    }
  })
  await page.goto('/')
  // The library goes to the closed-app check: no dropped title, no YouTube source; permission asked once.
  await expect.poll(() => page.evaluate(() => (window as any).__n.watch.length), { timeout: 10000 }).toBeGreaterThan(0)
  const w = await page.evaluate(() => (window as any).__n.watch.at(-1))
  expect(w.enabled).toBe(true)
  expect(JSON.parse(w.items)).toEqual([{ name: 'Frieren', sourceId: '7', url: '/a/1', episodes: 28 }, { name: 'Lanterns', sourceId: '42', url: '/series/1', episodes: 10 }])
  expect(await page.evaluate(() => (window as any).__n.asked)).toBe(1)
  // Settings: the choice exists on Android, without the word "Windows"; turning it off stops the check.
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Notifications' }).click()
  const box = page.getByLabel('Show a notification when new episodes are found')
  await expect(box).toBeChecked()
  await box.uncheck()
  await expect.poll(() => page.evaluate(() => (window as any).__n.watch.at(-1).enabled), { timeout: 10000 }).toBe(false)
})

test('Android: engine streams are asked directly (not through the native relay), the rest is unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any, log: string[] = []
    w.__log = log
    // What Capacitor installs before the app: the browser's own calls kept aside, the relayed ones in place.
    const realOpen = XMLHttpRequest.prototype.open
    w.CapacitorWebXMLHttpRequest = { open: function (this: any, m: string, u: string) { log.push('xhr direct ' + u); return realOpen.call(this, m, 'data:text/plain,x') } }
    XMLHttpRequest.prototype.open = function (this: any, m: string, u: any) { (this as any)._url = u; log.push('xhr relayed ' + u); return realOpen.call(this, m, 'data:text/plain,x') } as any
    w.CapacitorWebFetch = async (r: any) => { log.push('fetch direct ' + (typeof r === 'string' ? r : r.url)); return new Response('d') }
    w.fetch = async (r: any) => { log.push('fetch relayed ' + (typeof r === 'string' ? r : r.url)); return new Response('r') }
  })
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).novelReader)
  const log = await page.evaluate(async () => {
    const w = window as any; w.__log.length = 0
    const E = 'http://127.0.0.1:4567/api/v1/'
    for (const u of [E + 'hls?url=a', E + 'proxy?url=b', E + 'dl/file/x/v.mp4', E + 'sources', 'https://example.com/a.m3u8']) { const x = new XMLHttpRequest(); x.open('GET', u); if (u.includes('/hls?')) w.__log.push('_url=' + JSON.stringify((x as any)._url)) }
    const p = new XMLHttpRequest(); p.open('POST', E + 'proxy?url=b')
    await fetch(E + 'proxy?url=c'); await fetch(E + 'health'); await fetch(E + 'proxy?url=c', { method: 'POST' }); await fetch(new Request(E + 'hls?url=d'))
    return w.__log
  })
  expect(log).toEqual([
    'xhr direct http://127.0.0.1:4567/api/v1/hls?url=a', '_url=""',
    'xhr direct http://127.0.0.1:4567/api/v1/proxy?url=b',
    'xhr direct http://127.0.0.1:4567/api/v1/dl/file/x/v.mp4',
    'xhr relayed http://127.0.0.1:4567/api/v1/sources',
    'xhr relayed https://example.com/a.m3u8',
    'xhr relayed http://127.0.0.1:4567/api/v1/proxy?url=b',
    'fetch direct http://127.0.0.1:4567/api/v1/proxy?url=c',
    'fetch relayed http://127.0.0.1:4567/api/v1/health',
    'fetch relayed http://127.0.0.1:4567/api/v1/proxy?url=c',
    'fetch direct http://127.0.0.1:4567/api/v1/hls?url=d',
  ])
})

test('Android: direct sync with the PC on the home Wi-Fi (link typed once), quiet when away from home', async ({ page }) => {
  // The PC's relay (electron/engine-share.cjs), with the file as the PC left it.
  let file: any = { app: 'NovelReader', version: 1, at: Date.now() - 60000, deviceId: 'pc1', deviceName: 'PC-SALON', data: { seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', url: '/series/1', episodes: 2, addedAt: Date.now() - 90000 }]) } }
  let home = true
  const posts: any[] = []
  await page.route('http://192.168.1.5:4580/**', r => {
    if (!home) return r.abort('connectionrefused')
    const u = new URL(r.request().url()), json = (b: any, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) })
    if (!u.pathname.startsWith('/e/abcdefghjk/')) return r.fulfill({ status: 404, body: '' })
    const p = u.pathname.replace('/e/abcdefghjk', '')
    if (p === '/nr/hello') return json({ app: 'NovelReader', device: 'PC-SALON', sync: true })
    if (p === '/nr/sync' && r.request().method() === 'GET') return json(file)
    if (p === '/nr/sync') { file = JSON.parse(r.request().postData() || '{}'); posts.push(file); return json({ at: Date.now() }) }
    return r.fulfill({ status: 404, body: '' })
  })
  await page.goto('/')
  await page.evaluate(() => { localStorage.setItem('animeLibrary', JSON.stringify([{ id: 'a1', name: 'Phone Anime', sourceId: '7', url: '/a/1', episodes: 1, addedAt: Date.now() }])) })
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  const block = page.locator('.pc-link')
  await expect(block).toContainText('Sync with your PC')
  // The camera (faked: a picture of the PC's QR code) reads the link: nothing to type.
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 400; (window as any).__qrCanvas = c
    navigator.mediaDevices.getUserMedia = async () => (c as any).captureStream(10)
  })
  await block.getByRole('button', { name: 'Scan the QR code' }).click()
  const scanner = page.getByRole('dialog', { name: 'Scan the QR code' })
  await expect(scanner.locator('video')).toBeVisible()
  // Draw the QR code the PC would show (same generator), then keep the picture moving so frames are produced.
  await page.evaluate((cells) => {
    const c = (window as any).__qrCanvas as HTMLCanvasElement, x = c.getContext('2d')!, n = cells.length, q = 4, s = 400 / (n + q * 2)
    const draw = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 400); x.fillStyle = '#000'; cells.forEach((row: boolean[], r: number) => row.forEach((on, col) => { if (on) x.fillRect(Math.floor((col + q) * s), Math.floor((r + q) * s), Math.ceil(s), Math.ceil(s)) })) }
    draw(); (window as any).__qrTimer = setInterval(draw, 100)
  }, QR_CELLS)
  await expect(scanner).toHaveCount(0, { timeout: 15000 })
  await expect(block.getByRole('status')).toContainText('Your library is now shared with your PC.')
  // Both ways at once: the PC's series here, the phone's anime on the PC, signed by the phone.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').map((x: any) => x.name))).toEqual(['Lanterns'])
  await expect.poll(() => posts.length).toBeGreaterThan(0)
  expect(JSON.parse(posts.at(-1).data.animeLibrary).map((x: any) => x.name)).toEqual(['Phone Anime'])
  expect(posts.at(-1).deviceId).not.toBe('pc1'); expect(posts.at(-1).app).toBe('NovelReader')
  await expect(block).toContainText('Last synced')
  await expect(page.locator('.sync-file')).toHaveCount(0)
  // Away from home: a calm sentence, the library is untouched, nothing written.
  home = false; const n = posts.length
  await block.getByRole('button', { name: 'Sync now' }).click()
  await expect(block.getByRole('alert')).toContainText('Sync resumes on the home Wi-Fi')
  expect(posts.length).toBe(n)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').length)).toBe(1)
  await block.getByRole('button', { name: 'Unlink' }).click()
  await expect(page.locator('.sync-file')).toBeVisible()
})

test('Android: backup saved to a file the person chooses, and restored from one', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__files = JSON.parse(sessionStorage.getItem('__files') || '{"saved":null,"open":""}')
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), Files: {
      save: async (o: any) => { w.__files.saved = o; sessionStorage.setItem('__files', JSON.stringify(w.__files)); return { ok: true, path: o.name } },
      open: async () => w.__files.open ? { ok: true, name: 'x.json', text: w.__files.open } : { ok: false, canceled: true } } }
    if (!localStorage.getItem('library')) localStorage.setItem('library', JSON.stringify([{ id: 'n1', name: 'Shadow Slave', pluginId: 'testsrc', path: '/novel/shadow', chapters: [] }]))
    w.confirm = () => true
  })
  await page.goto('/')
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  const block = page.locator('.backup-block')
  await expect(block).toContainText('stored on this device')
  await expect(block).not.toContainText('Automatic backups')
  await block.getByRole('button', { name: 'Export a backup…' }).click()
  await expect(block.getByRole('status')).toContainText(/Backup saved: NovelReader-backup-\d{4}-\d\d-\d\d\.json/)
  const saved = await page.evaluate(() => (window as any).__files.saved)
  const payload = JSON.parse(saved.text)
  expect(payload.app).toBe('NovelReader'); expect(JSON.parse(payload.data.library)[0].name).toBe('Shadow Slave')
  // A file that is not a backup: refused, nothing changes.
  await page.evaluate(() => { (window as any).__files.open = '{"hello":1}' })
  await block.getByRole('button', { name: 'Restore from a file…' }).click()
  await expect(block.getByRole('status')).toContainText('not a NovelReader backup')
  // A real backup with another library: restored.
  payload.data.library = JSON.stringify([{ id: 'n2', name: 'Lord of the Mysteries', pluginId: 'testsrc', path: '/novel/lotm', chapters: [] }])
  await page.evaluate(t => { const w = window as any; w.__files.open = t; sessionStorage.setItem('__files', JSON.stringify(w.__files)) }, JSON.stringify(payload))
  await block.getByRole('button', { name: 'Restore from a file…' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('library') || '[]').map((x: any) => x.name))).toEqual(['Lord of the Mysteries'])
})

test('Android, app closed: the hidden page finds the novels with new chapters, once, through the native bridge', async ({ page }) => {
  // The host (ChapterCheck.java) seen from the page: web requests and the final report.
  await page.addInitScript(() => {
    const w = window as any, real = window.fetch.bind(window)
    w.Capacitor = undefined
    w.__bg = { done: null as any, http: [] as string[] }
    w.NRBackground = {
      http: (id: number, json: string) => { const q = JSON.parse(json); w.__bg.http.push(q.method + ' ' + q.url)
        real(q.url, { method: q.method, headers: q.headers, body: q.body || undefined }).then(async (r: Response) => { const b = new Uint8Array(await r.arrayBuffer()); let s = ''; b.forEach(x => { s += String.fromCharCode(x) }); const h: any = {}; r.headers.forEach((v, k) => { h[k] = v }); w.__nrHttp(id, { status: r.status, headers: h, url: q.url, body: btoa(s) }) }, (e: any) => w.__nrHttp(id, { error: String(e) })) },
      done: (json: string) => { w.__bg.done = JSON.parse(json) } }
    const src = { id: 'testsrc', name: 'Test Source', url: 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/testsrc.js', lang: 'English' }
    if (!localStorage.getItem('library')) localStorage.setItem('library', JSON.stringify([
      { id: 'n1', name: 'Shadow Slave', source: src, path: '/novel/shadow', chapters: [{ name: 'Chapter 1', path: '/c/1' }] },          // the site has more
      { id: 'n2', name: 'Dropped', source: src, path: '/novel/shadow', chapters: [{ name: 'Chapter 1', path: '/c/1' }], shelf: 'dropped' },
      { id: 'n3', name: 'Gone', source: src, path: '/novel/missing', chapters: [{ name: 'Chapter 1', path: '/c/1' }] }]))
  })
  await page.route('https://novels.test/novel/missing', r => r.fulfill({ status: 404, body: '' }))
  await page.goto('/#bg-chapters')
  await expect.poll(() => page.evaluate(() => (window as any).__bg.done), { timeout: 20000 }).not.toBeNull()
  const first = await page.evaluate(() => (window as any).__bg)
  expect(first.done.names).toEqual(['Shadow Slave'])
  expect(first.http).toContain('GET https://novels.test/novel/shadow')
  // The interface itself is not started in that page.
  await expect(page.locator('.app')).toHaveCount(0)
  // The app will run its own check as soon as it opens.
  expect(await page.evaluate(() => localStorage.getItem('lastUpdateCheck'))).toBe('0')
  // Six hours later, nothing changed on the site: nothing to announce.
  await page.reload()
  await expect.poll(() => page.evaluate(() => (window as any).__bg.done), { timeout: 20000 }).not.toBeNull()
  expect(await page.evaluate(() => (window as any).__bg.done.names)).toEqual([])
  // Turned off in Settings: no request at all.
  await page.evaluate(() => localStorage.setItem('notifyNewChapters', '0'))
  await page.reload()
  await expect.poll(() => page.evaluate(() => (window as any).__bg.done), { timeout: 20000 }).not.toBeNull()
  expect(await page.evaluate(() => (window as any).__bg)).toMatchObject({ done: { skipped: true, names: [] }, http: [] })
})

test('Android: "Continue on my phone" sent from the PC is offered here and opens the book at its chapter', async ({ page }) => {
  let items: any[] = []
  const t0 = Date.now()
  await page.route('http://192.168.1.5:4580/**', r => {
    const u = new URL(r.request().url()), p = u.pathname.replace('/e/abcdefghjk', ''), json = (b: any) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) })
    if (p === '/nr/inbox') return json({ now: t0, items: items.filter(x => x.at > Number(u.searchParams.get('after') || 0)) })
    if (p === '/nr/sync') return json(null)
    return json({})
  })
  await page.addInitScript(() => {
    if (localStorage.getItem('pcEngine')) return
    localStorage.setItem('pcEngine', 'http://192.168.1.5:4580/e/abcdefghjk')
    const src = { id: 'testsrc', name: 'Test Source', url: 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.js/src/plugins/testsrc.js', lang: 'English' }
    localStorage.setItem('library', JSON.stringify([{ id: 'n1', name: 'Shadow Slave', source: src, path: '/novel/shadow', chapters: [{ name: 'Chapter 1', path: '/novel/shadow/1' }, { name: 'Chapter 2', path: '/novel/shadow/2' }] }]))
    localStorage.setItem('reading:n1', JSON.stringify({ index: 1, progress: 0, at: Date.now() }))
  })
  await page.goto('/')
  // The first look only sets the clock; nothing sent before is offered.
  await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('pcInboxAt')))).toBe(t0)
  await expect(page.locator('.incoming-toast')).toHaveCount(0)
  items = [{ at: t0 + 5000, kind: 'books', id: 'n1', name: 'Shadow Slave', sub: 'Chapter 2', url: '', next: false }]
  const toast = page.locator('.incoming-toast')
  await expect(toast).toContainText('Sent from your PC', { timeout: 15000 })
  await expect(toast).toContainText('Shadow Slave')
  await toast.getByRole('button', { name: 'Continue' }).click()
  await expect(toast).toHaveCount(0)
  await expect(page.locator('.readerpage')).toContainText('Chapter 2', { timeout: 15000 })
  // Offered once.
  await page.waitForTimeout(7000)
  await expect(page.locator('.incoming-toast')).toHaveCount(0)
})

test('Android: read aloud uses the phone voices (paragraph after paragraph, word highlight, Stop on the notification)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any, listeners: any[] = []
    w.__tts = { spoken: [] as any[], hold: [] as boolean[], cancels: 0, emit: (e: any) => listeners.forEach(f => f(e)) }
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), Tts: {
      addListener: (_n: string, f: any) => { listeners.push(f); return { remove() {} } },
      voices: async () => ({ ready: true, voices: [{ voiceURI: 'fr-fr-x-vlf-local', name: 'français (France)', lang: 'fr-FR', localService: true }, { voiceURI: 'en-us-x-sfg-local', name: 'English (United States)', lang: 'en-US', localService: true }] }),
      speak: async (o: any) => { w.__tts.spoken.push(o) }, cancel: async () => { w.__tts.cancels++ }, hold: async (o: any) => { w.__tts.hold.push(o.on) } } }
  })
  await page.goto('/')
  // The browser interface the reader relies on is there, backed by the phone.
  const r = await page.evaluate(async () => {
    const w = window as any, log: string[] = []
    await new Promise(x => setTimeout(x, 100))
    const voices = speechSynthesis.getVoices().map(v => v.lang)
    const u = new SpeechSynthesisUtterance('Bonjour tout le monde'); u.rate = 1.25; u.voice = speechSynthesis.getVoices()[0]
    u.onstart = () => log.push('start'); u.onboundary = (e: any) => log.push('word ' + e.charIndex + '+' + e.charLength); u.onend = () => log.push('end'); u.onerror = (e: any) => log.push('error ' + e.error)
    speechSynthesis.speak(u)
    const id = w.__tts.spoken[0].id
    w.__tts.emit({ id, type: 'start' }); w.__tts.emit({ id, type: 'boundary', start: 8, end: 12 }); w.__tts.emit({ id: 'other', type: 'end' }); w.__tts.emit({ id, type: 'end' })
    // A second paragraph, cut by the next one (as the reader does when jumping).
    const u2 = new SpeechSynthesisUtterance('Deux'); u2.onerror = (e: any) => log.push('error ' + e.error); u2.onend = () => log.push('end2')
    speechSynthesis.speak(u2); speechSynthesis.cancel()
    w.__tts.emit({ id: w.__tts.spoken[1].id, type: 'end' }) // late event of the cancelled one: ignored
    let stopped = 0; window.addEventListener('nr-tts-stop', () => stopped++); w.__tts.emit({ type: 'stopped' })
    return { voices, log, spoken: w.__tts.spoken, hold: w.__tts.hold, cancels: w.__tts.cancels, stopped }
  })
  expect(r.voices).toEqual(['fr-FR', 'en-US'])
  expect(r.log).toEqual(['start', 'word 8+4', 'end', 'error interrupted'])
  expect(r.spoken[0]).toMatchObject({ text: 'Bonjour tout le monde', voice: 'fr-fr-x-vlf-local', lang: 'fr-FR', rate: 1.25 })
  expect(r.hold).toEqual([true]) // kept alive while reading; released only after 20 s of silence
  expect(r.cancels).toBe(1); expect(r.stopped).toBe(1)
})

test('Android: videos stored on the phone (a folder chosen once, files listed and played)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__folders = [] as string[]
    w.Capacitor.convertFileSrc = (u: string) => u.replace('content://', 'https://localhost/_capacitor_content_/')
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), Files: {
      folders: async () => ({ folders: w.__folders }),
      addFolder: async () => { w.__folders = ['Movies/Anime']; return { folders: w.__folders } },
      removeFolder: async ({ folder }: any) => { w.__folders = w.__folders.filter((f: string) => f !== folder); return { folders: w.__folders } },
      listVideos: async () => ({ videos: w.__folders.length ? [
        { name: 'E10.mkv', folder: 'Movies/Anime', relPath: 'Frieren/E10.mkv', size: 300e6, mtime: 2, uri: 'content://com.android.externalstorage.documents/tree/primary%3AMovies/document/primary%3AMovies%2FFrieren%2FE10.mkv' },
        { name: 'E2.mkv', folder: 'Movies/Anime', relPath: 'Frieren/E2.mkv', size: 280e6, mtime: 1, uri: 'content://com.android.externalstorage.documents/tree/primary%3AMovies/document/primary%3AMovies%2FFrieren%2FE2.mkv' }] : [] }) } }
    if (!localStorage.getItem('mode')) { localStorage.setItem('mode', 'anime'); localStorage.setItem('lastPage:anime', 'localVideos') }
  })
  await page.goto('/')
  const main = page.locator('main')
  await expect(main).toContainText('Play video files stored on this device.')
  await main.getByRole('button', { name: /Add (a )?folder/ }).first().click()
  // Listed in natural order (E2 before E10), grouped by their folder.
  await expect(main.locator('.localcard')).toHaveCount(2)
  expect(await main.locator('.localcard .localname').allInnerTexts()).toEqual(['E2.mkv', 'E10.mkv'])
  await main.locator('.localcard', { hasText: 'E2.mkv' }).click()
  await expect(main.locator('video')).toHaveAttribute('src', 'https://localhost/_capacitor_content_/com.android.externalstorage.documents/tree/primary%3AMovies/document/primary%3AMovies%2FFrieren%2FE2.mkv')
})

test('Android: a book site behind a Cloudflare check is passed in the app, then searched normally', async ({ page }) => {
  let hits = 0
  await page.unroute('https://novels.test/popular')
  await page.route('https://novels.test/popular', r => {
    hits++
    if (hits === 1) return r.fulfill({ status: 403, contentType: 'text/html', headers: { 'cf-mitigated': 'challenge' }, body: '<html><head><title>Just a moment...</title></head><body>challenge-platform</body></html>' })
    return r.fulfill({ contentType: 'text/html', body: '<a class="n" href="/novel/shadow">Shadow Slave</a>' })
  })
  await page.addInitScript(() => {
    const w = window as any
    w.__solves = []
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), SiteCheck: { solve: async (o: any) => { w.__solves.push(o); return { ok: true, cookie: 'cf_clearance=ok', userAgent: 'Mozilla/5.0 TestWebView' } } } }
  })
  await page.goto('/')
  await page.locator('.m-bottom').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('shadow')
  await page.locator('main input').first().press('Enter')
  await expect(page.locator('main')).toContainText('Shadow Slave', { timeout: 15000 })
  const solves = await page.evaluate(() => (window as any).__solves)
  expect(solves.length).toBe(1)
  expect(solves[0].url).toBe('https://novels.test/popular')
  expect(solves[0].show).toBe(true) // a real check: shown if it wants a click
  expect(hits).toBe(2)
  // The pass is kept for the next requests to that site.
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('siteChecks') || '{}'))
  expect(kept['novels.test'].cookie).toBe('cf_clearance=ok')
  expect(kept['novels.test'].ua).toBe('Mozilla/5.0 TestWebView')
})

test('Android: profiles — each person has their own library, the sources stay shared', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('__lib')) { sessionStorage.setItem('__lib', '1'); localStorage.setItem('library', JSON.stringify([{ id: 'n1', name: 'Shadow Slave', pluginId: 'testsrc', path: '/novel/shadow', chapters: [] }])) } })
  await page.goto('/')
  await page.evaluate(async () => { await (window as any).novelReader.profileCreate('Sam') })
  // Settings › Profiles is there on the phone
  await page.locator('.m-bottom button').last().click()
  await page.locator('.m-sheet-item', { hasText: 'Settings' }).click()
  const panel = page.locator('.profiles-panel')
  await expect(panel.locator('.pf-row')).toHaveCount(2)
  await Promise.all([page.waitForEvent('load'), panel.locator('.pf-row').nth(1).getByRole('button', { name: 'Switch' }).click()])
  // The app reloads on Sam's profile: empty library, same sources and language
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nrProfiles') || '{}').current)).not.toBe('default')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('library'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('enabledPlugins'))).toContain('testsrc')
  expect(await page.evaluate(() => localStorage.getItem('lang'))).toBe('en')
  await page.evaluate(() => localStorage.setItem('library', JSON.stringify([{ id: 'n2', name: 'Lord of the Mysteries', pluginId: 'testsrc', path: '/novel/lotm', chapters: [] }])))
  // Back to the main profile: its library comes back, Sam's is kept aside
  const ready = () => page.waitForFunction(() => typeof (window as any).novelReader?.profileSwitch === 'function')
  await ready()
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => (window as any).novelReader.profileSwitch('default'))])
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('library') || '[]').map((n: any) => n.name))).toEqual(['Shadow Slave'])
  await ready()
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('nrProfiles')!).list[1].id)
  await Promise.all([page.waitForEvent('load'), page.evaluate((i) => (window as any).novelReader.profileSwitch(i), id)])
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('library') || '[]').map((n: any) => n.name))).toEqual(['Lord of the Mysteries'])
})

test('Android: lock-screen controls follow the video, and the "Continue" widget opens the title', async ({ page }) => {
  const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await page.route('http://127.0.0.1:4567/**', r => {
    const p = new URL(r.request().url()).pathname
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    const json = (b: any) => r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(b) })
    if (p === '/api/v1/proxy') return r.fulfill({ status: 200, body: clip, headers: { ...cors, 'Content-Type': 'video/webm' } })
    if (p === '/api/v1/health') return json({ status: 'ok', service: 'miwayomi', mangaSources: 0, animeSources: 1 })
    if (p === '/api/v1/sources') return json({ manga: [], anime: [{ id: '42', name: 'Mapple', lang: 'en', type: 'anime', pkg: 'mapple' }] })
    if (p.endsWith('/details')) return json({ url: '/series/1', title: 'Lanterns', description: 'A mystery.', status: 2, thumbnail_url: '' })
    if (p.endsWith('/episodes')) return json([1, 2, 3].map(n => ({ name: `S1 E${n}`, url: '/ep/' + n, episode_number: n })))
    if (p.endsWith('/videos')) return json([{ videoUrl: 'https://cdn.test/a.mp4', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] }])
    return json([])
  })
  await page.route('https://graphql.anilist.co/**', r => r.fulfill({ contentType: 'application/json', body: '{"data":{}}' }))
  await page.route('https://api.tvmaze.com/**', r => r.fulfill({ status: 404, body: '{}' }))
  await page.addInitScript(() => {
    const w = window as any
    localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series')
    localStorage.setItem('seriesLibrary', JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', thumbnail: 'https://img.test/l.jpg', episodes: 3, addedAt: Date.now() }]))
    const listeners: Record<string, any[]> = {}
    const on = (name: string, f: any) => { (listeners[name] = listeners[name] || []).push(f); return Promise.resolve({ remove: () => {} }) }
    w.__native = { media: [] as any[], widget: [] as any[], cleared: 0, fire: (name: string, e: any) => (listeners[name] || []).forEach(f => f(e)) }
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}),
      Media: { update: async (o: any) => { w.__native.media.push(o) }, clear: async () => { w.__native.cleared++ }, addListener: (n: string, f: any) => on('media:' + n, f) },
      Widget: { update: async (o: any) => { w.__native.widget.push(o) }, take: async () => ({}), addListener: (n: string, f: any) => on('widget:' + n, f) } }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.media-hero .primary').click()
  await page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play().catch(() => {}) })
  await expect.poll(() => page.evaluate(() => { const l = (window as any).__native.media; return l[l.length - 1] })).toMatchObject({ title: 'Lanterns', artist: 'Season 1 · Episode 1', art: 'https://img.test/l.jpg', hasNext: true, hasPrev: false })
  // "Next" on the lock screen plays episode 2
  await page.evaluate(() => (window as any).__native.fire('media:action', { action: 'next' }))
  await expect.poll(() => page.evaluate(() => { const l = (window as any).__native.media; return l[l.length - 1]?.artist })).toBe('Season 1 · Episode 2')
  // "Pause" pauses the video
  await page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play().catch(() => {}) })
  await page.evaluate(() => (window as any).__native.fire('media:action', { action: 'pause' }))
  await expect.poll(() => page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  // The widget is told what is in progress, and a tap on it opens the title
  await page.evaluate(() => { localStorage.setItem('lastEpInfo:series1', JSON.stringify({ url: '/ep/2', name: 'S1 E2', n: 2, at: Date.now() })); document.dispatchEvent(new Event('visibilitychange')) })
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => page.evaluate(() => { const l = (window as any).__native.widget; return l[l.length - 1] })).toMatchObject({ title: 'Lanterns', kind: 'series', id: 'series1', cover: 'https://img.test/l.jpg' })
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))
  await page.locator('.backbtn').first().click()
  await expect(page.locator('.media-hero')).toHaveCount(0)
  await page.evaluate(() => (window as any).__native.fire('widget:open', { kind: 'series', id: 'series1' }))
  await expect(page.locator('.media-hero h1')).toHaveText('Lanterns')
})

test('Android: kids profile — parent code for Settings and for leaving, stored hashed', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof (window as any).novelReader?.profileParental === 'function')
  const sam = await page.evaluate(async () => { const nr = (window as any).novelReader; const p = await nr.profileCreate('Sam'); await nr.profileParental({ newPin: '1234' }); await nr.profileParental({ pin: '1234', id: p.id, kids: true }); return p.id })
  expect(await page.evaluate(() => localStorage.getItem('nrProfiles'))).not.toContain('1234')
  await Promise.all([page.waitForEvent('load'), page.evaluate((id) => (window as any).novelReader.profileSwitch(id), sam)])
  await page.waitForFunction(() => typeof (window as any).novelReader?.profileSwitch === 'function')
  // Settings asks for the code
  await page.locator('.m-bottom button').last().click()
  await page.locator('.m-sheet-item', { hasText: 'Settings' }).click()
  const gate = page.locator('.pin-gate')
  await expect(gate).toBeVisible()
  await expect(page.locator('.profiles-panel')).toHaveCount(0)
  await gate.getByLabel('Parent code').fill('0000')
  await gate.getByRole('button', { name: 'Unlock' }).click()
  await expect(gate.getByRole('alert')).toHaveText('Wrong code.')
  await gate.getByLabel('Parent code').fill('1234')
  await gate.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.locator('.profiles-panel')).toBeVisible()
  await expect(page.locator('.profiles-panel .pf-row').nth(1)).toContainText('In use')
  // Leaving the kids profile without the code is refused by the profile store itself
  const err = await page.evaluate(() => (window as any).novelReader.profileSwitch('default').then(() => '', (e: any) => String(e.message)))
  expect(err).toBe('Wrong parent code')
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => (window as any).novelReader.profileSwitch('default', '1234'))])
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nrProfiles') || '{}').current)).toBe('default')
})

test('Android: download the rest of the season, on Wi-Fi only', async ({ page }) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  const started: string[] = []
  await page.route('http://127.0.0.1:4567/**', async r => {
    const u = new URL(r.request().url()), p = u.pathname
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    const json = (b: any) => r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(b) })
    if (p === '/api/v1/health') return json({ status: 'ok', service: 'miwayomi', mangaSources: 0, animeSources: 1 })
    if (p === '/api/v1/sources') return json({ manga: [], anime: [{ id: '42', name: 'Mapple', lang: 'en', type: 'anime', pkg: 'mapple' }] })
    if (p.endsWith('/details')) return json({ url: '/series/1', title: 'Lanterns', description: 'A mystery.', status: 2, thumbnail_url: '' })
    if (p.endsWith('/episodes')) return json([1, 2, 3, 4].map(n => ({ name: `S1 E${n}`, url: '/ep/1-' + n, episode_number: n, season: 1 })).concat([1, 2].map(n => ({ name: `S2 E${n}`, url: '/ep/2-' + n, episode_number: n, season: 2 }))))
    if (p.endsWith('/videos')) return json([{ videoUrl: 'https://cdn.test/a.mp4', videoTitle: 'Zeus - 720p', headers: {} }])
    if (p === '/api/v1/dl/start') { const b = r.request().postDataJSON(); started.push(b.episodeUrl); return json({ id: 'd' + started.length }) }
    if (p === '/api/v1/dl/list') return json(started.map((u2, i) => ({ id: 'd' + (i + 1), kind: 'series', mediaId: 'series1', mediaName: 'Lanterns', episodeUrl: u2, episodeName: '', mediaKey: '', state: 'queued', progress: 0 })))
    if (p.startsWith('/api/v1/dl/')) return json({ ok: true, bytes: 0, count: 0 })
    return json([])
  })
  await page.route('https://api.tvmaze.com/**', r => r.fulfill({ status: 404, body: '{}' }))
  await page.addInitScript(() => {
    const w = window as any
    localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series')
    localStorage.setItem('seriesLibrary', JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', addedAt: Date.now() }]))
    // Watched up to S1 E2
    localStorage.setItem('lastEpInfo:series1', JSON.stringify({ url: '/ep/1-2', name: 'S1 E2', n: 2, at: Date.now() }))
    const listeners: any[] = []
    w.__net = { state: { connected: true, unmetered: false, wifi: false }, set: (s: any) => { w.__net.state = s; listeners.forEach(f => f(s)) } }
    w.Capacitor.Plugins = { ...(w.Capacitor.Plugins || {}), Net: { status: async () => w.__net.state, addListener: (n: string, f: any) => { listeners.push(f); return Promise.resolve({ remove() {} }) } } }
  })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('mediapos:series:series1:/ep/1-2', JSON.stringify({ t: 0, d: 0, done: true, at: Date.now() })))
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  const box = page.locator('.batch-dl')
  await box.getByLabel('How many episodes').selectOption({ label: 'The rest of the season' })
  await box.getByLabel('Wi-Fi only').check()
  // On mobile data: nothing starts, the episodes wait for Wi-Fi
  await box.getByRole('button', { name: /Download the next episodes/ }).click()
  await expect(box.locator('.batch-dl-msg')).toHaveText('2 episodes will download on Wi-Fi.')
  expect(started).toEqual([])
  await expect(page.locator('.ep-dl', { hasText: '📶' })).toHaveCount(2)
  // Wi-Fi comes back: S1 E3 and E4 start (not season 2)
  await page.evaluate(() => (window as any).__net.set({ connected: true, unmetered: true, wifi: true }))
  await expect.poll(() => started.slice().sort()).toEqual(['/ep/1-3', '/ep/1-4'])
})

test('Android: Video sources › Advanced stays inside the screen (long repository addresses)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mode', 'anime'); localStorage.setItem('lastPage:anime', 'animeSources'); localStorage.setItem('sourcesAdvanced', '1')
    localStorage.setItem('animeRepos', JSON.stringify([{ name: 'Yūzōnō', url: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json', enabled: true }, { name: 'salmanbappi', url: 'https://raw.githubusercontent.com/salmanbappi/extensions-repository-with-a-very-long-name/main/index.min.json', enabled: true }]))
  })
  await page.goto('/')
  await expect(page.locator('.sources-advanced-body')).toBeVisible()
  const over = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return [...document.querySelectorAll('.sources-advanced, .sources-advanced-body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1 }).map(e => (e.className || e.tagName).toString().slice(0, 40)).slice(0, 8)
  })
  expect(over).toEqual([])
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true)
  if (process.env.SHOT) await page.locator('.sources-advanced').screenshot({ path: process.env.SHOT })
})
