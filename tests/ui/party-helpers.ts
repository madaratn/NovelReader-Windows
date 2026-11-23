import { expect, Page, BrowserContext } from '@playwright/test'
import { setup } from './helpers'
import fs from 'fs'

// Shared by the watch party tests of the second generation (premium, compat, live):
// a "PC" is a page with its own storage, a scripted video engine and a real <video>.
export const VTT = 'WEBVTT\n\n1\n00:00:00.200 --> 00:00:19.500\nHello there\nfriend\n'
export const series = (i: number, name: string) => ({ id: 'series' + i, name, sourceId: '42', sourceName: 'Mapple', url: '/series/' + i, thumbnail: '', episodes: 4, addedAt: Date.now() })
// clip: clip420.webm is an ordinary video; clip.webm has a colour format a call does not take (the picture is redrawn).
// old: this page runs the interface of the previous release (PARTY_OLD_DIST); real: through the real connection server.
export type Opts = { sources?: any[], clip?: string, subs?: boolean, storage?: Record<string, string>, old?: boolean, real?: boolean, lang?: 'en' | 'fr' }
export const OLD = process.env.PARTY_OLD_DIST || ''
// The version the old build announces in its "What's new" window: marked as read there, like
// the current one is on the other pages (the window would cover the page).
const oldNotes = () => { try { for (const f of fs.readdirSync(OLD + '/assets')) if (/^index-.*\.js$/.test(f)) { const m = /## NovelReader ([\d.]+)/.exec(fs.readFileSync(OLD + '/assets/' + f, 'utf8')); if (m) return m[1] } } catch {} return '' }
export async function pc(context: BrowserContext, library: any[], opts: Opts = {}) {
  const page = await context.newPage()
  // Windows of one browser share their storage; two PCs do not (each has its room, its recent rooms, its name).
  await page.addInitScript(() => {
    let id = sessionStorage.getItem('__pc'); if (!id) { id = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('__pc', id) }
    const P = 'pc:' + id + ':', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem
    S.getItem = function (k: string) { return g.call(this, this === localStorage ? P + k : k) }
    S.setItem = function (k: string, v: string) { return s.call(this, this === localStorage ? P + k : k, v) }
    S.removeItem = function (k: string) { return r.call(this, this === localStorage ? P + k : k) }
    S.clear = function () { if (this !== localStorage) { for (const k of Object.keys(this)) r.call(this, k); return } for (const k of Object.keys(this)) if (k.startsWith(P)) r.call(this, k) }
  })
  const seen = opts.old ? oldNotes() : ''
  await setup(page, { lang: opts.lang, storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify(library), welcomeDone: '1', ...(seen ? { whatsNewSeen: seen } : {}), ...(opts.storage || {}) } })
  const clip = fs.readFileSync('tests/ui/fixtures/' + (opts.clip || 'clip420.webm'))
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', r => {
    if (r.request().url().includes('en.vtt')) return r.fulfill({ status: 200, body: VTT, headers: { 'Content-Type': 'text/vtt', 'Access-Control-Allow-Origin': '*' } })
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] || '')
    if (!m) return r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } })
    const s = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), clip.length - 1) : clip.length - 1
    return r.fulfill({ status: 206, body: clip.subarray(s, e + 1), headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${clip.length}`, 'Access-Control-Allow-Origin': '*' } })
  })
  await page.addInitScript((o: Opts) => {
    const w = window as any
    w.__partyFake = !o.real
    w.__partyHook = true
    const eps = Array.from({ length: 4 }, (_, i) => ({ name: `S1 E${i + 1} - Chapter ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    const sources = o.sources || [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'p.mapple' }]
    const has = (id: string) => sources.some((s: any) => s.id === id)
    const base = w.novelReader
    w.novelReader = {
      ...base,
      takeDeepLink: async () => '',
      inviteBase: async () => 'https://madaratn.github.io/NovelReader-Windows/party/#',
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string) => {
        const sid = /\/anime\/([^/]+)\//.exec(path)?.[1]
        if (sid && !has(decodeURIComponent(sid))) throw new Error('Source not found: ' + sid)
        if (path.startsWith('/api/v1/extensions/repo')) return [{ name: 'Aniyomi: Mapple', pkg: 'p.mapple', apk: 'mapple.apk', version: '1.0', sources: [{ id: '42', name: 'Mapple' }] }]
        if (path.includes('/search')) return []
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A mystery.' }
        if (path.includes('/episodes')) return eps
        if (path.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: o.subs ? [{ url: 'https://cdn.test/en.vtt', lang: 'English' }] : [], audioTracks: [] }]
        if (path.includes('/sources')) return { anime: sources }
        return []
      }
    }
  }, opts)
  if (opts.old) {
    // Same address as the current interface (so the test transport links the two), files of the old build.
    await page.route('**/old/**', r => { const u = new URL(r.request().url()); const f = OLD + u.pathname.replace(/^\/old/, ''); if (!fs.existsSync(f)) return r.fulfill({ status: 404 }); return r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }) })
    await page.goto('/old/index.html')
  } else await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
  return page
}
export const video = (p: Page) => p.locator('.media-player-top video')
export async function start(a: Page, name = 'Ali') {
  await a.locator('.wp-open').click(); await a.locator('.wp-field input').fill(name)
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 })
  return (await a.locator('.wp-code b').innerText()).trim()
}
export async function join(b: Page, name: string, code: string) {
  await b.locator('.wp-open').click(); await b.locator('.wp-field input').fill(name)
  await b.locator('.wp-join input').fill(code); await b.getByRole('button', { name: 'Join', exact: true }).click()
}
export async function party(context: BrowserContext, guests: { name: string, opts?: Opts }[], hostOpts: Opts = {}) {
  const a = await pc(context, [series(1, 'Lanterns')], hostOpts)
  const code = await start(a)
  const out: Page[] = [a]
  for (const g of guests) {
    const b = await pc(context, [], { clip: hostOpts.clip, ...(g.opts || {}) })
    await join(b, g.name, code)
    await expect(a.locator('.wp-member')).toHaveCount(out.length + 1)
    out.push(b)
  }
  return { pages: out, code }
}
export async function openEpisode(a: Page) {
  await a.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await a.locator('.episodecell').nth(0).locator('.episodecard').click()
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThan(2)
}
export async function play(a: Page, b: Page) {
  await openEpisode(a)
  await expect(b.locator('.media-player-top h2')).toContainText('S1 E1', { timeout: 15_000 })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThan(2)
  await a.waitForTimeout(2600) // a player that has just loaded is left alone for a moment
}
// A click or a key press came just before (what the player does by itself is not sent to the group).
export const byHand = (p: Page) => p.evaluate(() => { window.dispatchEvent(new Event('nr-user-input')) })
// How far apart the two films are, in seconds (each position is read with the time it was read at).
export async function gap(a: Page, b: Page) {
  const read = (p: Page) => video(p).evaluate((v: HTMLVideoElement) => ({ t: v.currentTime, at: performance.timeOrigin + performance.now(), playing: !v.paused }))
  const [x, y] = [await read(a), await read(b)]
  return Math.abs(x.t + (x.playing ? (y.at - x.at) / 1000 : 0) - y.t)
}
export const status = (p: Page, name: string) => p.locator('.wp-person', { hasText: name }).locator('.wp-status')

