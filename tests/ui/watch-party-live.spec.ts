import { test, expect, BrowserContext } from '@playwright/test'
import { setup } from './helpers'
import { pc as partyPc, series, start, join, openEpisode, video } from './party-helpers'

// Real connection through the public PeerJS server (needs internet): run with LIVE_PEER=1.
test.skip(!process.env.LIVE_PEER, 'needs internet (LIVE_PEER=1)')
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } })

async function pc(context: BrowserContext) {
  const page = await context.newPage()
  await setup(page, { storage: { mode: 'anime', 'lastPage:anime': 'anime' } })
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
  return page
}
test('live watch party over PeerJS: create, join, chat both ways', async ({ browser }) => {
  test.setTimeout(90_000)
  // Two separate browser profiles, like two PCs.
  const ca = await browser.newContext(), cb = await browser.newContext()
  const a = await pc(ca), b = await pc(cb)
  await a.locator('.wp-open').click()
  await a.locator('.wp-field input').fill('Ali')
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 })
  const code = await a.locator('.wp-code b').innerText()
  await b.locator('.wp-open').click()
  await b.locator('.wp-field input').fill('Sara')
  await b.locator('.wp-join input').fill(code)
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'], { timeout: 30_000 })
  await b.locator('.wp-say input').fill('hello from B')
  await b.locator('.wp-say input').press('Enter')
  await expect(a.locator('.wp-chat')).toContainText('Sara hello from B', { timeout: 15_000 })
  await a.locator('.wp-say input').fill('hi from A')
  await a.locator('.wp-say input').press('Enter')
  await expect(b.locator('.wp-chat')).toContainText('Ali hi from A', { timeout: 15_000 })
  // Voice over the real connection: both receive a live microphone track
  await a.getByRole('button', { name: /Join the voice channel/ }).click()
  await expect(b.locator('.wp-member', { hasText: 'Ali' })).toHaveAttribute('title', 'In the voice channel', { timeout: 15_000 })
  await b.getByRole('button', { name: /Join the voice channel/ }).click()
  const live = (p: any) => p.evaluate(() => { const el = document.querySelector('audio[data-wp-voice]') as HTMLAudioElement | null; const st = el?.srcObject as MediaStream | null; return !!st && st.getAudioTracks().some(t => t.readyState === 'live') })
  await expect.poll(() => live(a), { timeout: 30_000 }).toBe(true)
  await expect.poll(() => live(b), { timeout: 30_000 }).toBe(true)
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await expect(b.locator('.wp-error')).toHaveText('The host closed the watch party.', { timeout: 15_000 })
})

// The stream of a friend's video over the real connection: the call is made through
// PeerJS itself (its options for the film's sound, swapping tracks on its connection).
test('live watch party over PeerJS: a friend without the source watches the host\'s video (picture, sound, pause)', async ({ browser }) => {
  test.setTimeout(150_000)
  const ca = await browser.newContext(), cb = await browser.newContext()
  const a = await partyPc(ca, [series(1, 'Lanterns')], { real: true })
  const b = await partyPc(cb, [], { real: true, sources: [] })
  const code = await start(a)
  await join(b, 'Sara', code)
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'], { timeout: 30_000 })
  await openEpisode(a)
  // (The button comes once Sara knows Ali has the video: a few seconds over the network.)
  await b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' }).click({ timeout: 30_000 })
  await expect(b.locator('.party-theater')).toBeVisible()
  await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 45_000 }).toBe(320)
  const frames = () => b.evaluate(async () => (await (window as any).__nrParty.viewStats())?.inFrames || 0)
  const f0 = await frames()
  await expect.poll(frames, { timeout: 15_000 }).toBeGreaterThan(f0 + 10)
  // The film's sound arrives with the picture
  const sound = () => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => { const st = v.srcObject as MediaStream | null; return !!st && st.getAudioTracks().some(t => t.readyState === 'live') })
  await expect.poll(sound, { timeout: 15_000 }).toBe(true)
  // Sara pauses from her screen: Ali's player stops
  await b.locator('.pt-stage').hover({ position: { x: 300, y: 300 } })
  await b.locator('.pt-bar').getByRole('button', { name: 'Pause' }).click()
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused), { timeout: 15_000 }).toBe(true)
  await expect(a.locator('.wp-stream')).toHaveText('Sara is watching your video.')
  // In step with the host's clock over the real connection
  expect(await b.evaluate(() => (window as any).__nrParty.snap.synced)).toBe(true)
})
