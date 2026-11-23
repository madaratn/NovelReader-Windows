import { test, expect, Page } from '@playwright/test'
import { pc, start, join, series, video, play, byHand, gap, status, OLD } from './party-helpers'

// Watch party between two versions of NovelReader: a friend who has not updated yet still
// joins, and someone up to date still joins a friend who has not. One window runs the
// interface of the previous release, the other the current one (same address, so the
// test transport links them). To run before changing what the PCs say to each other.
// The interface of the previous release, built apart:
//   git worktree add ../old v<previous> && (cd ../old && npm ci && npx vite build --outDir /tmp/old-dist)
//   PARTY_OLD_DIST=/tmp/old-dist npx playwright test watch-party-compat
test.skip(!OLD, 'needs the built interface of the previous release (PARTY_OLD_DIST)')
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } })

const says = (p: Page, text: string) => p.locator('.wp-say input').fill(text).then(() => p.locator('.wp-say input').press('Enter'))

test('new host, guest on the previous release: join, chat, same film, pause both ways, host-only controls, voice', async ({ context }) => {
  test.setTimeout(120_000)
  const a = await pc(context, [series(1, 'Lanterns')])
  const code = await start(a)
  const b = await pc(context, [], { old: true })
  expect(await b.evaluate(() => typeof (window as any).__nrParty.hostNow)).toBe('undefined') // really the old code
  await join(b, 'Sara', code)
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await expect(b.locator('.wp-member')).toHaveText(['Ali', 'Sara (you)'])
  await says(b, 'hello from the old one'); await expect(a.locator('.wp-chat')).toContainText('Sara hello from the old one')
  await says(a, 'hi from the new one'); await expect(b.locator('.wp-chat')).toContainText('Ali hi from the new one')
  await play(a, b)
  await byHand(a)
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 8; v.play() })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 7.5)).toBe(true)
  await a.waitForTimeout(6000) // a few position reports of the new host
  expect(await gap(a, b)).toBeLessThan(1.6)
  await expect(status(a, 'Sara')).toHaveCount(0) // an older version says nothing about its player
  await expect(status(a, 'Ali')).toHaveText('In sync')
  // the old guest pauses: followed, and said
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect(a.locator('.wp-chat')).toContainText('Sara paused')
  await byHand(a)
  await video(a).evaluate((v: HTMLVideoElement) => { v.play() })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  // controls kept for the host: the old guest's pause is put back
  await a.locator('.wp-gear').click()
  await a.getByLabel('Only I control the playback (play, pause, position)').check()
  await a.locator('.wp-options').getByRole('button', { name: /Back/ }).click()
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused), { timeout: 10_000 }).toBe(true)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  // voice between the two versions
  await a.getByRole('button', { name: /Join the voice channel/ }).click()
  await b.getByRole('button', { name: /Join the voice channel/ }).click()
  const live = (p: Page) => p.evaluate(() => { const el = document.querySelector('audio[data-wp-voice]') as HTMLAudioElement | null; const st = el?.srcObject as MediaStream | null; return !!st && st.getAudioTracks().some(t => t.readyState === 'live') })
  await expect.poll(() => live(a), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => live(b), { timeout: 15_000 }).toBe(true)
  // the stream is not offered for someone who could not ask for it; the old guest leaves
  await b.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(a.locator('.wp-chat')).toContainText('Sara left.')
  await expect(a.locator('.wp-member')).toHaveCount(1)
})

test('host on the previous release, new guest: join, chat, same film, pause both ways, voice, no stream offered', async ({ context }) => {
  test.setTimeout(120_000)
  const a = await pc(context, [series(1, 'Lanterns')], { old: true })
  const code = await start(a)
  const b = await pc(context, [])
  await join(b, 'Sara', code)
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await expect(b.locator('.wp-member')).toHaveText(['Ali', 'Sara (you)'])
  await says(b, 'hello from the new one'); await expect(a.locator('.wp-chat')).toContainText('Sara hello from the new one')
  await says(a, 'hi from the old one'); await expect(b.locator('.wp-chat')).toContainText('Ali hi from the old one')
  await play(a, b)
  expect(await b.evaluate(() => { const s = (window as any).__nrParty.snap; return [s.v2, s.synced] })).toEqual([false, false])
  await expect(b.locator('.wp-tool')).toHaveCount(2) // voice and camera: no stream with a host that does not know it
  await expect(b.locator('.wp-status')).toHaveCount(0)
  await byHand(a)
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 8; v.play() })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 7.5)).toBe(true)
  await expect(b.locator('.wp-chat')).toContainText('Ali jumped to 0:08')
  await a.waitForTimeout(6000)
  expect(await gap(a, b)).toBeLessThan(1.6)
  expect(await video(b).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1) // no speed games without a common clock
  // the new guest pauses and resumes: the old host follows
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await byHand(b)
  await video(b).evaluate((v: HTMLVideoElement) => { v.play() })
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  // the old host pauses: followed and said
  await video(a).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect(b.locator('.wp-chat')).toContainText('Ali paused')
  // voice between the two versions
  await a.getByRole('button', { name: /Join the voice channel/ }).click()
  await b.getByRole('button', { name: /Join the voice channel/ }).click()
  const live = (p: Page) => p.evaluate(() => { const el = document.querySelector('audio[data-wp-voice]') as HTMLAudioElement | null; const st = el?.srcObject as MediaStream | null; return !!st && st.getAudioTracks().some(t => t.readyState === 'live') })
  await expect.poll(() => live(a), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => live(b), { timeout: 15_000 }).toBe(true)
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await expect(b.locator('.wp-error')).toHaveText('The host closed the watch party.')
})
