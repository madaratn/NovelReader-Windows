import { test, expect, Page, BrowserContext } from '@playwright/test'
import { setup } from './helpers'
import fs from 'fs'

// Two windows of the same browser stand for two PCs (BroadcastChannel instead of PeerJS).
const series = (i: number, name: string) => ({ id: 'series' + i, name, sourceId: '42', sourceName: 'Mapple', url: '/series/' + i, thumbnail: '', episodes: 4, addedAt: Date.now() })
async function pc(context: BrowserContext, library: any[]) {
  const page = await context.newPage()
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify(library), welcomeDone: '1' } })
  // The stream, with byte ranges so the video can seek.
  const clip = fs.readFileSync('tests/ui/fixtures/clip.webm')
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', r => {
    const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()['range'] || '')
    if (!m) return r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } })
    const s = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), clip.length - 1) : clip.length - 1
    return r.fulfill({ status: 206, body: clip.subarray(s, e + 1), headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${clip.length}`, 'Access-Control-Allow-Origin': '*' } })
  })
  await page.addInitScript(() => {
    const w = window as any
    w.__partyFake = true
    const eps = Array.from({ length: 4 }, (_, i) => ({ name: `S1 E${i + 1} - Chapter ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    const base = w.novelReader
    w.novelReader = {
      ...base,
      takeDeepLink: async () => sessionStorage.getItem('__deep') || '',
      inviteBase: async () => 'https://madaratn.github.io/NovelReader-Windows/party/#',
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string) => {
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A mystery.' }
        if (path.includes('/episodes')) return eps
        if (path.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] }, { videoUrl: 'https://cdn.test/b.webm', videoTitle: 'Hera - 480p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] }]
        if (path.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en' }] }
        return []
      }
    }
  })
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
  return page
}
const video = (p: Page) => p.locator('.media-player-top video')

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

test('watch party: create, join with the code, same episode, pause and position follow, chat, end', async ({ context }) => {
  const a = await pc(context, [series(1, 'Lanterns')])
  const b = await pc(context, []) // the guest does not even have the title in their library
  // Host
  await a.locator('.wp-open').click()
  await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  // Guest
  await b.locator('.wp-open').click()
  await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code.toLowerCase())
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await expect(b.locator('.wp-member')).toHaveText(['Ali', 'Sara (you)'])
  await expect(a.locator('.wp-chat')).toContainText('Sara joined.')
  // The host opens episode 2: the guest's window follows
  await a.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await a.locator('.episodecell').nth(1).locator('.episodecard').click()
  await expect(a.locator('.media-player-top h2')).toContainText('S1 E2')
  await expect(b.locator('.media-player-top h2')).toContainText('S1 E2', { timeout: 15_000 })
  await expect(b.locator('.wp-now')).toContainText('Lanterns · S1 E2')
  // Position and pause follow
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
  await a.waitForTimeout(300)
  await video(a).evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 9 })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(9)
  expect(await video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  // ...in both directions (once the guest's player has settled)
  await b.waitForTimeout(2600)
  await video(b).evaluate((v: HTMLVideoElement) => { v.currentTime = 4 })
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(4)
  // Chat
  await b.locator('.wp-say input').fill('salut !')
  await b.locator('.wp-say input').press('Enter')
  await expect(a.locator('.wp-chat')).toContainText('Sara salut !')
  // The host ends it
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await expect(b.locator('.wp-error')).toHaveText('The host closed the watch party.')
})

test('watch party: a stream reload (server or quality change, stall recovery) does not send everyone back to 0', async ({ context }) => {
  const a = await pc(context, [series(1, 'Lanterns')])
  const b = await pc(context, [])
  await a.locator('.wp-open').click()
  await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  await b.locator('.wp-open').click()
  await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code)
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(a.locator('.wp-member')).toHaveCount(2)
  await a.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await a.locator('.episodecell').nth(0).locator('.episodecard').click()
  await expect(b.locator('.media-player-top h2')).toContainText('S1 E1', { timeout: 15_000 })
  for (const p of [a, b]) await expect.poll(() => video(p).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
  await a.waitForTimeout(2600)
  // Everyone at 12 s, playing
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 12; v.play() })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(11)
  await a.waitForTimeout(500)
  // The host's player reloads its stream (another quality here)
  const before = await video(b).evaluate((v: HTMLVideoElement) => v.currentTime)
  // The host's player reloads its stream (another quality here)
  await a.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select').selectOption({ index: 1 })
  const low: number[] = []
  for (let i = 0; i < 12; i++) { low.push(await video(b).evaluate((v: HTMLVideoElement) => v.currentTime)); await b.waitForTimeout(250) }
  expect(Math.min(...low)).toBeGreaterThan(before - 2)
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(before - 1)
  // The player jumps back to the start by itself (HLS recovery, stream without a saved
  // position): the guest stays, and the host is put back on the group's position
  await video(a).evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 11; v.play() })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThanOrEqual(11) // a normal jump is still shared
  await a.waitForTimeout(1600)
  const group = await video(b).evaluate((v: HTMLVideoElement) => v.currentTime)
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 0 })
  const low2: number[] = []
  for (let i = 0; i < 10; i++) { low2.push(await video(b).evaluate((v: HTMLVideoElement) => v.currentTime)); await b.waitForTimeout(250) }
  expect(Math.min(...low2)).toBeGreaterThan(group - 1)
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(group)
  // Going back to the start by hand is still shared
  await a.evaluate(() => window.dispatchEvent(new Event('nr-user-input')))
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 0 })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(3)
})

test('watch party: when one video is loading, everyone waits, then starts again together', async ({ context }) => {
  const a = await pc(context, [series(1, 'Lanterns')])
  const b = await pc(context, [])
  await a.locator('.wp-open').click()
  await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-check', { hasText: 'Wait for people whose video is loading' })).toBeVisible()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  await b.locator('.wp-open').click()
  await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code)
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(a.locator('.wp-member')).toHaveCount(2)
  await a.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await a.locator('.episodecell').nth(0).locator('.episodecard').click()
  await expect(b.locator('.media-player-top h2')).toContainText('S1 E1', { timeout: 15_000 })
  for (const p of [a, b]) await expect.poll(() => video(p).evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
  await a.waitForTimeout(2600)
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 3; v.play() })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 2.5)).toBe(true)
  // Sara's video gets stuck loading (slow connection)
  await video(b).evaluate((v: HTMLVideoElement) => { const w = window as any; w.__stuck = true; const get = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!.get!; Object.defineProperty(v, 'readyState', { configurable: true, get() { return w.__stuck ? 2 : get.call(this) } }); const buf = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'buffered')!.get!; Object.defineProperty(v, 'buffered', { configurable: true, get() { return w.__stuck ? { length: 0, start: () => 0, end: () => 0 } : buf.call(this) } }) })
  await expect(a.locator('.wp-wait')).toContainText('Waiting for Sara… (video loading)', { timeout: 5000 })
  await expect(b.locator('.wp-wait')).toContainText('Your video is loading, the others are waiting for you…')
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  const at = await video(a).evaluate((v: HTMLVideoElement) => v.currentTime)
  expect(Math.abs(at - await video(b).evaluate((v: HTMLVideoElement) => v.currentTime))).toBeLessThan(1)
  // Loaded again: everyone starts together, from where they stopped
  await b.evaluate(() => { (window as any).__stuck = false })
  await expect(a.locator('.wp-wait')).toHaveCount(0, { timeout: 5000 })
  await expect(b.locator('.wp-wait')).toHaveCount(0)
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  const [ta, tb] = [await video(a).evaluate((v: HTMLVideoElement) => v.currentTime), await video(b).evaluate((v: HTMLVideoElement) => v.currentTime)]
  expect(Math.abs(ta - tb)).toBeLessThan(1.6)
  expect(ta).toBeGreaterThanOrEqual(at - 0.5)
  // With the option off, nobody waits
  await a.getByLabel('Wait for people whose video is loading').uncheck()
  await b.evaluate(() => { (window as any).__stuck = true })
  await a.waitForTimeout(3000)
  await expect(a.locator('.wp-wait')).toHaveCount(0)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
})

test('watch party: wrong code', async ({ context }) => {
  const b = await pc(context, [])
  await b.locator('.wp-open').click()
  await b.locator('.wp-join input').fill('ZZZZZZ')
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(b.locator('.wp-error')).toHaveText('No watch party with this code. Check the code with your friend.')
})

test('watch party voice channel: join, hear each other, mute, leave', async ({ context }) => {
  const a = await pc(context, []), b = await pc(context, [])
  await a.locator('.wp-open').click(); await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  await b.locator('.wp-open').click(); await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code); await b.getByRole('button', { name: 'Join' }).click()
  await expect(a.locator('.wp-member')).toHaveCount(2)
  // Ali joins first, then Sara: Sara calls Ali
  await a.getByRole('button', { name: /Join the voice channel/ }).click()
  await expect(b.locator('.wp-member', { hasText: 'Ali' })).toHaveText('🎙 Ali')
  await b.getByRole('button', { name: /Join the voice channel/ }).click()
  await expect(a.locator('.wp-member', { hasText: 'Sara' })).toHaveText('🎙 Sara')
  // Each side receives the other's microphone
  const live = (p: Page) => p.evaluate(() => { const el = document.querySelector('audio[data-wp-voice]') as HTMLAudioElement | null; const st = el?.srcObject as MediaStream | null; return !!st && st.getAudioTracks().some(t => t.readyState === 'live') })
  await expect.poll(() => live(a), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => live(b), { timeout: 15_000 }).toBe(true)
  // Mute shows on the other side
  await b.getByRole('button', { name: /Mute/ }).click()
  await expect(a.locator('.wp-member', { hasText: 'Sara' })).toHaveText('🔇 Sara')
  // Leaving hangs up on both sides
  await b.getByRole('button', { name: 'Leave the voice channel' }).click()
  await expect(a.locator('.wp-member', { hasText: 'Sara' })).toHaveText('Sara')
  await expect.poll(() => a.evaluate(() => document.querySelectorAll('audio[data-wp-voice]').length)).toBe(0)
  await expect(b.locator('.wp-chat')).toContainText('You left the voice channel.')
})

test('watch party invitation link: copy it, and opening it joins directly', async ({ context }) => {
  const a = await pc(context, [])
  await a.locator('.wp-open').click(); await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  const code = (await a.locator('.wp-code b').innerText()).trim()
  await a.getByRole('button', { name: /Copy an invitation link/ }).click()
  await expect(a.locator('.wp-invite')).toContainText('Invitation copied')
  expect(await a.evaluate(() => (window as any).__lastInvite)).toBe(`Join my NovelReader watch party: https://madaratn.github.io/NovelReader-Windows/party/#${code} (code ${code})`)
  // The friend clicks the link: NovelReader opens with novelreader://party/CODE
  const b = await context.newPage()
  await setup(b, { storage: { mode: 'series', 'lastPage:series': 'series' } })
  await b.addInitScript(([c]) => { sessionStorage.setItem('__deep', 'novelreader://party/' + c); localStorage.setItem('partyName', 'Sara') }, [code])
  await b.addInitScript(() => { const w = window as any; w.__partyFake = true; const base = w.novelReader; w.novelReader = { ...base, takeDeepLink: async () => sessionStorage.getItem('__deep') || '' } })
  await b.goto('/')
  await expect(b.locator('.wp-panel')).toBeVisible()
  await expect(b.locator('.wp-member')).toHaveText(['Ali', 'Sara (you)'])
})

test('invitation link without a name yet: code filled in, name asked', async ({ context }) => {
  const b = await context.newPage()
  await setup(b, { storage: { mode: 'series', 'lastPage:series': 'series' } })
  await b.addInitScript(() => { sessionStorage.setItem('__deep', 'novelreader://party/ABC234'); localStorage.removeItem('partyName'); const w = window as any; w.__partyFake = true; const base = w.novelReader; w.novelReader = { ...base, takeDeepLink: async () => sessionStorage.getItem('__deep') || '' } })
  await b.goto('/')
  await expect(b.locator('.wp-join input')).toHaveValue('ABC234')
  await expect(b.locator('.wp-field input')).toBeFocused()
})
