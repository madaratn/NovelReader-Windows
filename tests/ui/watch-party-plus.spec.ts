import { test, expect, Page, BrowserContext } from '@playwright/test'
import { setup } from './helpers'
import fs from 'fs'

// Several windows of the same browser stand for several PCs (BroadcastChannel instead of PeerJS).
const series = (i: number, name: string) => ({ id: 'series' + i, name, sourceId: '42', sourceName: 'Mapple', url: '/series/' + i, thumbnail: '', episodes: 4, addedAt: Date.now() })
type Opts = { sources?: any[], other?: boolean }
async function pc(context: BrowserContext, library: any[], opts: Opts = {}) {
  const page = await context.newPage()
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify(library), welcomeDone: '1' } })
  const clip = fs.readFileSync('tests/ui/fixtures/clip.webm')
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', r => {
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] || '')
    if (!m) return r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } })
    const s = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), clip.length - 1) : clip.length - 1
    return r.fulfill({ status: 206, body: clip.subarray(s, e + 1), headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${clip.length}`, 'Access-Control-Allow-Origin': '*' } })
  })
  await page.addInitScript((o: Opts) => {
    const w = window as any
    w.__partyFake = true
    w.__installed = []
    w.__calls = []
    const eps = Array.from({ length: 4 }, (_, i) => ({ name: `S1 E${i + 1} - Chapter ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    let sources = o.sources || [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'p.mapple' }]
    const has = (id: string) => sources.some((s: any) => s.id === id)
    const base = w.novelReader
    w.novelReader = {
      ...base,
      takeDeepLink: async () => '',
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string, method?: string, body?: any) => {
        w.__calls.push(path)
        const sid = /\/anime\/([^/]+)\//.exec(path)?.[1]
        if (sid && !has(decodeURIComponent(sid))) throw new Error('Source not found: ' + sid)
        if (path.startsWith('/api/v1/extensions/repo')) return [{ name: 'Aniyomi: Mapple', pkg: 'p.mapple', apk: 'mapple.apk', version: '1.0', sources: [{ id: '42', name: 'Mapple' }] }]
        if (path.startsWith('/api/v1/extensions/install')) { w.__installed.push(body); sources = [...sources, { id: '42', name: 'Mapple', lang: 'en', pkg: 'p.mapple' }]; return { ok: true } }
        if (path.includes('/search')) return [{ title: 'Lanterns', url: '/other/lanterns' }]
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A mystery.' }
        if (path.includes('/episodes')) return eps
        if (path.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [], audioTracks: [] }]
        if (path.includes('/sources')) return { anime: sources }
        return []
      }
    }
  }, opts)
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
  return page
}
const video = (p: Page) => p.locator('.media-player-top video')
async function party(context: BrowserContext, guests: { name: string, opts?: Opts }[], hostLib = [series(1, 'Lanterns')]) {
  const a = await pc(context, hostLib)
  await a.locator('.wp-open').click(); await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  const out: Page[] = [a]
  for (const g of guests) {
    const b = await pc(context, [], g.opts)
    await b.locator('.wp-open').click(); await b.locator('.wp-field input').fill(g.name)
    await b.locator('.wp-join input').fill(code); await b.getByRole('button', { name: 'Join' }).click()
    await expect(a.locator('.wp-member')).toHaveCount(out.length + 1)
    out.push(b)
  }
  return { pages: out, code }
}
async function play(a: Page, b: Page) {
  await a.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await a.locator('.episodecell').nth(0).locator('.episodecard').click()
  await expect(b.locator('.media-player-top h2')).toContainText('S1 E1', { timeout: 15_000 })
  for (const p of [a, b]) await expect.poll(() => video(p).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThan(2)
}

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

test('watch party without the host\'s source: plays from another source, then installs it in one click', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara', opts: { sources: [{ id: '77', name: 'Gnula', lang: 'en', pkg: 'p.gnula' }] } }])
  await play(a, b)
  // Played from Sara's own source (Gnula), found by title and episode number
  expect(await b.evaluate(() => (window as any).__calls.some((p: string) => p.startsWith('/api/v1/anime/77/videos')))).toBe(true)
  const miss = b.locator('.wp-missing')
  await expect(miss).toContainText('You do not have the source "Mapple". NovelReader looks for the same episode in your other sources.')
  // Position still follows the host
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 9 })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThanOrEqual(8)
  await miss.getByRole('button', { name: 'Install Mapple' }).click()
  await expect(miss).toHaveCount(0)
  expect(await b.evaluate(() => (window as any).__installed)).toEqual([{ repoUrl: expect.any(String), apk: 'mapple.apk' }])
  await expect(b.locator('.wp-chat')).toContainText('Mapple installed.')
  await expect.poll(() => b.evaluate(() => (window as any).__calls.some((p: string) => p.startsWith('/api/v1/anime/42/videos'))), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThan(2)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThanOrEqual(8)
})

test('reactions fly over everyone\'s video; in fullscreen the chat shows over the video and Enter writes', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  await play(a, b)
  await a.locator('.po-bar').getByRole('button', { name: 'React 🔥' }).click()
  await expect(b.locator('.po-fly', { hasText: '🔥' })).toContainText('Ali')
  await expect(a.locator('.po-fly', { hasText: '🔥' })).toHaveCount(1)
  await expect(b.locator('.po-fly')).toHaveCount(0, { timeout: 6000 })
  // The video's own fullscreen button is replaced by ours, which keeps the overlay
  expect(await video(b).evaluate((v: any) => v.controlsList.contains('nofullscreen'))).toBe(true)
  await b.locator('.po-bar').getByRole('button', { name: 'Fullscreen' }).click()
  await expect.poll(() => b.evaluate(() => document.fullscreenElement?.className || '')).toContain('player-stage')
  await a.locator('.wp-say input').fill('look at that')
  await a.locator('.wp-say input').press('Enter')
  await expect(b.locator('.po-line')).toContainText('Ali look at that')
  await b.keyboard.press('Enter')
  await b.locator('.po-say input').fill('wow')
  await b.locator('.po-say input').press('Enter')
  await expect(a.locator('.wp-chat')).toContainText('wow')
  // Space in the message box does not pause the film
  await b.keyboard.press('t')
  await b.locator('.po-say input').pressSequentially('a b')
  expect(await video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  await b.locator('.po-say input').press('Escape')
  await expect(b.locator('.po-say')).toHaveCount(0)
  await b.locator('.po-bar').getByRole('button', { name: 'Exit fullscreen' }).click()
  await expect.poll(() => b.evaluate(() => !!document.fullscreenElement)).toBe(false)
})

test('the host leaves and hands over: the party goes on with the new host', async ({ context }) => {
  const { pages: [a, b, c] } = await party(context, [{ name: 'Sara' }, { name: 'Yanis' }])
  await a.getByRole('button', { name: 'Leave (Sara becomes the host)' }).click()
  await expect(b.locator('.wp-chat')).toContainText('You are now the host of the watch party.', { timeout: 20_000 })
  await expect(b.locator('.wp-member')).toHaveText(['Sara (you)', 'Yanis'], { timeout: 20_000 })
  await expect(c.locator('.wp-member')).toHaveText(['Sara', 'Yanis (you)'])
  await expect(c.locator('.wp-chat')).toContainText('Ali left; Sara is now the host.')
  await c.locator('.wp-say input').fill('still here'); await c.locator('.wp-say input').press('Enter')
  await expect(b.locator('.wp-chat')).toContainText('still here')
})

test('the host\'s PC disappears: the first guest takes over and the others reconnect by themselves', async ({ context }) => {
  test.setTimeout(90_000)
  const { pages: [a, b, c] } = await party(context, [{ name: 'Sara' }, { name: 'Yanis' }])
  await a.close()
  await expect(c.locator('.wp-chat')).toContainText('Connection to the watch party lost. Reconnecting…', { timeout: 20_000 })
  await expect(b.locator('.wp-member')).toHaveText(['Sara (you)', 'Yanis'], { timeout: 40_000 })
  await expect(c.locator('.wp-member')).toHaveText(['Sara', 'Yanis (you)'])
  await expect(c.locator('.wp-chat')).toContainText('Reconnected.')
})

test('voice: the film gets quieter while someone speaks; push to talk with V', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  await play(a, b)
  await video(b).evaluate((v: HTMLVideoElement) => { v.volume = 0.8 })
  await b.getByRole('button', { name: /Join the voice channel/ }).click()
  await expect(b.getByRole('button', { name: /Mute/ })).toBeVisible()
  // Ali speaks
  await b.evaluate(() => { const p = (window as any).__nrParty; p.set({ speaking: [p.snap.members[0].id] }) })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.volume)).toBeCloseTo(0.28, 2)
  expect(await b.evaluate(() => JSON.parse(localStorage.getItem('videoVolume') || '{}').v)).toBeCloseTo(0.8) // the lowered volume is not kept
  await b.evaluate(() => { (window as any).__nrParty.set({ speaking: [] }) })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.volume)).toBeCloseTo(0.8, 2)
  // Push to talk
  const mic = () => b.evaluate(() => { const p = (window as any).__nrParty; return p.local.getAudioTracks()[0].enabled })
  expect(await mic()).toBe(true)
  await b.getByLabel('Push to talk (hold V)').check()
  expect(await mic()).toBe(false)
  await expect(b.locator('.wp-ptt')).toHaveText('Microphone off until you hold V')
  await b.locator('.wp-chat').click()
  await b.keyboard.down('v')
  await expect(b.locator('.wp-ptt')).toHaveText('Talking…')
  expect(await mic()).toBe(true)
  await b.keyboard.up('v')
  expect(await mic()).toBe(false)
})

test('cameras: off by default, small bubbles for everyone when turned on, enlarge, hide, turn off', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  await expect(a.locator('.party-cams')).toHaveCount(0)
  await a.getByRole('button', { name: 'Turn my camera on' }).click()
  await expect(a.getByRole('button', { name: 'Turn my camera off' })).toBeVisible()
  // My own preview (mirrored), and Sara sees Ali's camera with his name
  await expect(a.locator('.cam-bubble')).toHaveCount(1)
  await expect(a.locator('.cam-bubble video.mirror')).toHaveCount(1)
  await expect(b.locator('.cam-bubble')).toHaveText('Ali', { timeout: 15_000 })
  await expect.poll(() => b.locator('.cam-bubble video').evaluate((v: HTMLVideoElement) => { const st = v.srcObject as MediaStream | null; return !!st && st.getVideoTracks().some(t => t.readyState === 'live') && v.videoWidth > 0 }), { timeout: 15_000 }).toBe(true)
  await expect(b.locator('.wp-member', { hasText: 'Ali' })).toHaveText('Ali'); await expect(b.locator('.wp-member', { hasText: 'Ali' }).locator('svg.icon')).toHaveCount(1)
  // Click to enlarge
  await b.locator('.cam-bubble').click()
  await expect(b.locator('.cam-bubble')).toHaveClass(/big/)
  // Drag the group somewhere else: remembered, and not taken as a click
  const box = (await b.locator('.party-cams').boundingBox())!
  await b.mouse.move(box.x + 20, box.y + 20); await b.mouse.down(); await b.mouse.move(box.x - 200, box.y + 120, { steps: 6 }); await b.mouse.up()
  await expect(b.locator('.cam-bubble')).toHaveClass(/big/)
  expect(await b.evaluate(() => JSON.parse(localStorage.getItem('partyCamsPos') || 'null'))).toEqual({ x: expect.any(Number), y: expect.any(Number) })
  // Sara turns hers on too: both see two bubbles
  await b.getByRole('button', { name: 'Turn my camera on' }).click()
  await expect(a.locator('.cam-bubble')).toHaveCount(2, { timeout: 15_000 })
  await expect(a.locator('.cam-bubble').nth(1)).toHaveText('Sara')
  // Hiding the others' cameras keeps only my own preview
  await a.getByLabel("Hide the others' cameras").check()
  await expect(a.locator('.cam-bubble')).toHaveCount(1)
  await a.getByLabel("Hide the others' cameras").uncheck()
  await expect(a.locator('.cam-bubble')).toHaveCount(2)
  // Ali turns his off: gone for Sara
  await a.getByRole('button', { name: 'Turn my camera off' }).click()
  await expect(b.locator('.cam-bubble')).toHaveCount(1, { timeout: 15_000 })
  await expect(b.locator('.cam-bubble')).toHaveText('You')
  expect(await a.evaluate(() => (window as any).__nrParty.snap.camLocal)).toBeNull()
})
