// The watch party on a phone: the panel, its options, the screen of a watched stream,
// and an invitation link that opens the app. Two pages of the same browser stand for two
// phones (BroadcastChannel instead of PeerJS).
import { test, expect, Page, BrowserContext } from '@playwright/test'
import fs from 'fs'
import { allProblems } from '../layout-audit'
const NOTES = (/^##\s*NovelReader\s+([\d.]+)/m.exec(fs.readFileSync('build/release-notes.md', 'utf8')) || [])[1] || ''

async function phone(context: BrowserContext, opts: { link?: string } = {}) {
  const page = await context.newPage()
  await page.route('http://127.0.0.1:4567/**', r => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    const p = new URL(r.request().url()).pathname
    return r.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(p === '/api/v1/health' ? { status: 'ok' } : p === '/api/v1/sources' ? { manga: [], anime: [] } : []) })
  })
  await page.addInitScript(([notes, link]) => {
    const w = window as any
    // Windows of one browser share their storage; two phones do not (each has its name, its room).
    let id = sessionStorage.getItem('__pc'); if (!id) { id = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('__pc', id) }
    const P = 'pc:' + id + ':', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem
    S.getItem = function (k: string) { return g.call(this, this === localStorage ? P + k : k) }
    S.setItem = function (k: string, v: string) { return s.call(this, this === localStorage ? P + k : k, v) }
    S.removeItem = function (k: string) { return r.call(this, this === localStorage ? P + k : k) }
    // The app's own plugin for links (LinkPlugin.java), scripted.
    const listeners: ((e: any) => void)[] = []
    w.__openLink = (url: string) => listeners.forEach(f => f({ url }))
    w.Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true, Plugins: { Link: { take: async () => ({ url: link }), addListener: async (_n: string, f: (e: any) => void) => { listeners.push(f); return { remove: () => {} } } } } }
    w.__partyFake = true
    if (sessionStorage.getItem('__seed')) return
    sessionStorage.setItem('__seed', '1')
    for (const [k, v] of Object.entries({ onboarded: '1', whatsNewSeen: notes, homeAtStart: '0', lang: 'en', mode: 'series', 'lastPage:series': 'series', welcomeDone: '1' })) localStorage.setItem(k, v as string)
  }, [NOTES, opts.link || ''])
  await page.goto('/')
  await page.locator('main').waitFor()
  return page
}
const openParty = async (p: Page) => { if (await p.locator('.wp-panel').count()) return; await p.getByRole('button', { name: 'More', exact: true }).click(); await p.locator('.wp-open').click() }
const audit = async (p: Page, what: string) => { await p.waitForTimeout(250); const found = await allProblems(p, 44, { native: false }); expect(found, what + ': ' + JSON.stringify(found, null, 1)).toEqual([]) }

test('Android: the watch party fits the phone (start, people, options, a watched stream)', async ({ context }) => {
  test.setTimeout(90_000)
  const a = await phone(context)
  await openParty(a)
  await a.locator('.wp-field input').fill('Ali')
  await audit(a, 'start')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  const b = await phone(context)
  await openParty(b)
  await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code)
  await b.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await a.getByRole('button', { name: 'Options for Sara' }).click()
  await a.getByRole('button', { name: 'QR code for a phone' }).click()
  await audit(a, 'people')
  // A phone watches a stream but cannot send its player: no button and no settings for that
  await expect(a.locator('.wp-tools button')).toHaveText(['Voice chat', 'Camera'])
  await a.locator('.wp-gear').click()
  await expect(a.locator('.wp-options')).toContainText("Hide the others' cameras")
  await expect(a.locator('.wp-options')).not.toContainText('Quality of the video I send')
  await audit(a, 'options')
  // Sara watches a stream (the picture is a drawing here): the bars and buttons fit a finger
  await b.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d')!; setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); g.fillRect(0, 0, 320, 180) }, 100); const P = (window as any).__nrParty; P.set({ view: { id: P.snap.members[0].id, state: 'on', error: '', why: '', stream: (c as any).captureStream(10) }, cue: 'Hello there', state: { media: { kind: 'series', sourceId: '42', url: '/s/1', name: 'Lanterns' }, episodeUrl: '/ep/1', episodeName: 'S1 E1 - Chapter 1', playing: false, time: 12, rate: 1, by: 'Ali', dur: 600 } }) })
  await expect(b.locator('.party-theater')).toBeVisible()
  await expect(b.locator('.pt-title b')).toHaveText('Lanterns · S1 E1 - Chapter 1')
  await b.locator('.wp-x[aria-label="Minimize"]').click()
  await audit(b, 'stream')
  // The subtitle line is on the picture (not in the black band under it), clear of the buttons
  await expect(b.locator('.pt-cue')).toHaveText('Hello there')
  const boxes = await b.evaluate(() => { const r = (q: string) => { const e = document.querySelector(q); if (!e) return null; const x = e.getBoundingClientRect(); return { top: x.top, bottom: x.bottom, left: x.left, right: x.right } }; const v = document.querySelector('.pt-video') as HTMLVideoElement, s = v.getBoundingClientRect(), h = Math.min(s.height, s.width * v.videoHeight / v.videoWidth); return { cue: r('.pt-cue span'), bar: r('.po-bar'), ctl: r('.pt-bar'), pic: { top: s.top + (s.height - h) / 2, bottom: s.top + (s.height + h) / 2 }, vw: innerWidth } })
  expect(boxes.cue!.bottom).toBeLessThanOrEqual(boxes.pic.bottom + 1)
  expect(boxes.cue!.top).toBeGreaterThanOrEqual(boxes.pic.top)
  expect(boxes.cue!.bottom).toBeLessThanOrEqual(boxes.bar!.top) // above the reactions and the controls
  expect(boxes.bar!.right).toBeLessThanOrEqual(boxes.vw) // the bar of reactions is not cut by the edge of the screen
  // The reactions open from one button on a narrow screen
  await b.getByRole('button', { name: 'Reactions' }).click()
  await expect(b.locator('.po-emos button')).toHaveCount(7)
  expect(await b.locator('.po-emos').evaluate(e => { const x = e.getBoundingClientRect(); return x.left >= 0 && x.right <= innerWidth })).toBe(true)
  await audit(b, 'reactions')
  // Back (the phone's button): the panel is put away first, then the stream is closed; the party goes on
  await b.locator('.pt-stage').tap({ position: { x: 180, y: 120 } }) // (the bars come back at a touch)
  await b.locator('.po-bar').getByRole('button', { name: 'Chat' }).click() // the chat button over the picture opens the panel
  await expect(b.locator('.wp-panel')).toBeVisible()
  await b.evaluate(() => window.dispatchEvent(new Event('nrBack')))
  await expect(b.locator('.wp-panel')).toHaveCount(0)
  await expect(b.locator('.party-theater')).toBeVisible()
  await b.evaluate(() => window.dispatchEvent(new Event('nrBack')))
  await expect(b.locator('.party-theater')).toHaveCount(0)
  expect(await b.evaluate(() => (window as any).__nrParty.snap.status)).toBe('ready')
})

test('Android: an invitation link opens the app on the party', async ({ context }) => {
  const a = await phone(context)
  await openParty(a)
  await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  // The invitation is the web page (a link the phone can open), not the app's own scheme
  await a.locator('.wp-invite').click()
  expect(await a.evaluate(() => (window as any).__lastInvite)).toContain('https://madaratn.github.io/NovelReader-Windows/party/#' + code)
  // The app was opened by the link: the code is there, the name is asked (first time)
  const b = await phone(context, { link: 'novelreader://party/' + code })
  await expect(b.locator('.wp-panel')).toBeVisible()
  await expect(b.locator('.wp-join input')).toHaveValue(code)
  await b.locator('.wp-field input').fill('Sara')
  await b.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await b.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(a.locator('.wp-member')).toHaveCount(1)
  // A link opened while the app runs: joined at once (the name is known now)
  await b.locator('.wp-x[aria-label="Minimize"]').click()
  await b.evaluate(c => (window as any).__openLink('novelreader://party/' + c), code)
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await expect(b.locator('.wp-panel')).toBeVisible()
})
