import { test, expect, Page } from '@playwright/test'
import { pc, party, start, join, series, video, openEpisode, play, byHand, gap, status } from './party-helpers'

// Watch party, second generation: common clock, who did what, the stream of a friend's
// video, the room that keeps its code, the host's tools. Several windows of the same
// browser stand for several PCs (BroadcastChannel instead of PeerJS; the calls are real).
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } })

test('the films stay within a tenth of a second; who did what is said; each person has a status', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  await play(a, b)
  // Ali jumps: said on Sara's picture and in her chat
  await byHand(a)
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 8; v.play() })
  await expect(b.locator('.po-toast')).toHaveText('Ali jumped to 0:08')
  await expect(b.locator('.wp-chat')).toContainText('Ali jumped to 0:08')
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 7.5)).toBe(true)
  // In step: the clock is common, the last gap is closed by the speed
  expect(await b.evaluate(() => (window as any).__nrParty.snap.synced)).toBe(true)
  await expect.poll(() => gap(a, b), { timeout: 15_000 }).toBeLessThan(0.1)
  await a.waitForTimeout(1500)
  expect(await gap(a, b)).toBeLessThan(0.15)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.playbackRate), { timeout: 15_000 }).toBe(1) // caught up: the speed is back to normal
  expect(await gap(a, b)).toBeLessThan(0.08)
  await expect(status(a, 'Sara')).toHaveText('In sync')
  await expect(status(b, 'Ali')).toHaveText('In sync')
  await expect(status(b, 'Sara')).toHaveText('In sync')
  await expect(b.locator('.wp-role')).toHaveCount(1) // the crown is on the host
  await expect(b.locator('.wp-person', { hasText: 'Ali' }).locator('.wp-role')).toHaveAttribute('aria-label', 'Host')
  // Sara pauses: both stop on the same picture, and Ali is told who did it
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect(a.locator('.po-toast')).toHaveText('Sara paused')
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect.poll(() => gap(a, b)).toBeLessThan(0.06)
  // Ali presses play at once: his player keeps playing (it used to be put back in pause
  // for 3 s after a friend's pause, while the others started again)
  await byHand(a)
  await video(a).evaluate((v: HTMLVideoElement) => { v.play() })
  await expect(b.locator('.po-toast')).toHaveText('Ali resumed playback')
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  await a.waitForTimeout(1200)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  // The position reports of the host are not "actions"
  await a.waitForTimeout(5600)
  expect(await b.locator('.wp-msg.system').allInnerTexts()).toEqual(['Ali started S1 E1 - Chapter 1', 'Ali jumped to 0:08', 'Ali resumed playback'])
  expect(await a.locator('.wp-msg.system').allInnerTexts()).toContain('Sara paused')
})

test('a friend without the source watches the stream of the host: picture, sound, subtitles, controls', async ({ context }) => {
  test.setTimeout(90_000)
  const { pages: [a, b] } = await party(context, [{ name: 'Sara', opts: { sources: [] } }], { subs: true })
  await openEpisode(a)
  // Sara does not have the source: one button to watch Ali's video instead
  await b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' }).click()
  await expect(b.locator('.party-theater')).toBeVisible()
  await expect(b.getByRole('dialog', { name: 'Stream of Ali' })).toBeVisible()
  await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 25_000 }).toBe(320)
  await expect(b.locator('.pt-veil')).toHaveCount(0)
  await expect(b.locator('.pt-title b')).toHaveText('Lanterns · S1 E1 - Chapter 1')
  await expect(b.locator('.pt-from')).toContainText('Stream of Ali · 180p', { timeout: 12_000 })
  // The pictures keep coming, taken straight from Ali's player (no redrawing needed for an ordinary video)
  const frames = () => b.evaluate(async () => (await (window as any).__nrParty.viewStats())?.inFrames || 0)
  const f0 = await frames()
  await expect.poll(frames, { timeout: 10_000 }).toBeGreaterThan(f0 + 10)
  expect(await a.evaluate(() => (window as any).__nrParty.source.drawing)).toBe(false)
  // The film's sound: stereo, and it flows
  const sound = () => a.evaluate(async () => { const c = (window as any).__partyStreamCalls; if (!c || c.length !== 1) return null; let out: any = null; (await c[0].pc.getStats()).forEach((r: any) => { if (r.type === 'outbound-rtp' && r.kind === 'audio') out = { bytes: r.bytesSent } }); return { ...out, asked: /stereo=1/.test(c[0].pc.remoteDescription.sdp) && /maxaveragebitrate=160000/.test(c[0].pc.remoteDescription.sdp) } })
  await expect.poll(async () => (await sound())?.bytes || 0, { timeout: 10_000 }).toBeGreaterThan(4000)
  expect((await sound())!.asked).toBe(true)
  // Ali's subtitles are shown to Sara as text
  await expect(b.locator('.pt-cue')).toContainText('Hello there')
  await expect(b.locator('.pt-cue')).toContainText('friend')
  // Ali sees who watches, and Sara's status says it
  await expect(a.locator('.wp-stream')).toHaveText('Sara is watching your video.')
  await expect(a.locator('.wp-chat')).toContainText('Sara is watching your stream.')
  await expect(status(a, 'Sara')).toHaveText('Stream of Ali')
  await expect(b.locator('.wp-stream')).toContainText('You are watching the stream of Ali.')
  // Sara pauses from her screen: it is Ali's player that stops
  await b.locator('.pt-stage').hover({ position: { x: 300, y: 300 } }) // (the bars hide while the film plays)
  await b.locator('.pt-bar').getByRole('button', { name: 'Pause' }).click()
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect(a.locator('.po-toast')).toHaveText('Sara paused')
  // The right arrow jumps 10 s, on Ali's player
  const before = await video(a).evaluate((v: HTMLVideoElement) => v.currentTime)
  await b.keyboard.press('ArrowRight')
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(before + 9)
  await expect.poll(async () => { const [m, sec] = (await b.locator('.pt-time').first().innerText()).split(':').map(Number); return m * 60 + sec }).toBeGreaterThan(before + 9)
  await expect(b.locator('.pt-time').last()).toHaveText('1:00')
  await b.locator('.pt-bar').getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  // Closing the stream: Ali's player stops being captured
  await b.locator('.pt-stage').hover({ position: { x: 300, y: 300 } })
  await b.getByRole('button', { name: 'Close the stream' }).click()
  await expect(b.locator('.party-theater')).toHaveCount(0)
  await expect(a.locator('.wp-stream')).toHaveCount(0)
  await expect.poll(() => a.evaluate(() => (window as any).__nrParty.source.active())).toBe(false)
  // And the way back is still there
  await expect(b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' })).toBeVisible()
})

test('a video whose pictures a call does not take is redrawn for the stream', async ({ context }) => {
  test.setTimeout(90_000)
  const { pages: [a, b] } = await party(context, [{ name: 'Sara', opts: { sources: [] } }], { clip: 'clip.webm' })
  await openEpisode(a)
  await b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' }).click()
  // Nothing comes at first (the placeholder), then the redrawn picture
  await expect.poll(() => a.evaluate(() => (window as any).__nrParty.source.drawing), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 25_000 }).toBe(160)
  const frames = () => b.evaluate(async () => (await (window as any).__nrParty.viewStats())?.inFrames || 0)
  const f0 = await frames()
  await expect.poll(frames, { timeout: 10_000 }).toBeGreaterThan(f0 + 10)
})

test('the party starts while the host already watches: the video is loaded again once to be sent, at the same position', async ({ context }) => {
  test.setTimeout(90_000)
  const a = await pc(context, [series(1, 'Lanterns')])
  await openEpisode(a)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.crossOrigin)).toBeNull() // no party: loaded as always
  await a.waitForTimeout(2600)
  await video(a).evaluate((v: HTMLVideoElement) => { v.currentTime = 20 })
  const code = await start(a)
  const b = await pc(context, [], { sources: [] })
  await join(b, 'Sara', code)
  await expect(b.locator('.wp-now')).toContainText('Lanterns · S1 E1')
  await b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' }).click()
  await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 25_000 }).toBe(320)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.crossOrigin)).toBe('anonymous')
  // Ali did not lose his place
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 19 && v.currentTime < 45)).toBe(true)
  const frames = () => b.evaluate(async () => (await (window as any).__nrParty.viewStats())?.inFrames || 0)
  const f0 = await frames()
  await expect.poll(frames, { timeout: 10_000 }).toBeGreaterThan(f0 + 10)
})

test('sending my video to everyone: the others watch it by themselves, and go back to their own player after', async ({ context }) => {
  test.setTimeout(90_000)
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  // Nothing to send before a video plays
  await expect(a.getByRole('button', { name: 'Send my video to everyone' })).toBeDisabled()
  await play(a, b)
  await a.getByRole('button', { name: 'Send my video to everyone' }).click()
  await expect(a.getByRole('button', { name: 'Stop sending my video' })).toHaveAttribute('aria-pressed', 'true')
  await expect(b.locator('.party-theater')).toBeVisible()
  await expect(b.locator('.wp-chat')).toContainText('Ali is sending their video to everyone.')
  await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 25_000 }).toBe(320)
  await expect(a.locator('.wp-stream')).toHaveText('Your video is sent to everyone: 1 person watches it.')
  // Sara's own player is set aside meanwhile: paused, and that pause is not sent to the group
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  await expect(b.getByRole('button', { name: 'Send my video to everyone' })).toBeDisabled()
  // She closes it: the panel keeps the way back
  await b.locator('.pt-stage').hover({ position: { x: 300, y: 300 } })
  await b.getByRole('button', { name: 'Close the stream' }).click()
  await expect(b.locator('.party-theater')).toHaveCount(0)
  await expect(b.locator('.wp-stream')).toContainText('Ali is sending their video to everyone.')
  await b.locator('.wp-stream').getByRole('button', { name: 'Watch' }).click()
  await expect(b.locator('.party-theater')).toBeVisible()
  await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 25_000 }).toBe(320)
  // Ali stops: Sara is back on her own player, in step with him
  await a.getByRole('button', { name: 'Stop sending my video' }).click()
  await expect(b.locator('.party-theater')).toHaveCount(0)
  await expect(b.locator('.wp-chat')).toContainText('The stream for everyone ended.')
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused), { timeout: 10_000 }).toBe(true)
  await expect.poll(() => gap(a, b), { timeout: 15_000 }).toBeLessThan(0.3)
  await expect.poll(() => a.evaluate(() => (window as any).__nrParty.source.active())).toBe(false)
})

test('the host keeps the controls, then removes someone', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  await play(a, b)
  await a.locator('.wp-gear').click()
  await a.getByLabel('Only I control the playback (play, pause, position)').check()
  await a.locator('.wp-options').getByRole('button', { name: /Back/ }).click()
  await expect(b.locator('.wp-chat')).toContainText('Only the host controls the playback now.')
  await expect(b.locator('.wp-lock')).toBeVisible()
  // Sara pauses: undone here, said, and nothing changes for Ali
  await byHand(b)
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect(b.locator('.po-toast')).toHaveText('Only the host controls the playback.')
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  expect(await video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  // Ali still drives
  await video(a).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  // Controls for everyone again
  await a.locator('.wp-gear').click()
  await a.getByLabel('Only I control the playback (play, pause, position)').uncheck()
  await a.locator('.wp-options').getByRole('button', { name: /Back/ }).click()
  await expect(b.locator('.wp-lock')).toHaveCount(0)
  await byHand(b)
  await video(b).evaluate((v: HTMLVideoElement) => { v.play() })
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  // Removing Sara
  await a.getByRole('button', { name: 'Options for Sara' }).click()
  await a.getByRole('button', { name: 'Remove from the party' }).click()
  await expect(b.locator('.wp-error')).toHaveText('The host removed you from the watch party.')
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)'])
  await expect(a.locator('.wp-chat')).toContainText('Sara was removed from the watch party.')
  await expect(a.locator('.wp-chat')).not.toContainText('Sara left.')
})

test('my room keeps its code; a room joined before is one click away; a room already open is joined', async ({ context }) => {
  const a = await pc(context, [series(1, 'Lanterns')]), b = await pc(context, [])
  await a.locator('.wp-open').click(); await a.locator('.wp-field input').fill('Ali')
  const mine = (await a.locator('.wp-room-code').innerText()).trim()
  expect(mine).toMatch(/^[A-Z0-9]{6}$/)
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).toHaveText(mine)
  await expect(a.locator('.wp-chat')).toContainText(`Your room is open. Share the code ${mine}.`)
  await join(b, 'Sara', mine)
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  // Sara leaves: the room is kept under "Join again"
  await b.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(b.locator('.wp-recent-go')).toHaveText(new RegExp('Room of Ali\\s*' + mine))
  await expect(a.locator('.wp-member')).toHaveCount(1)
  // Ali ends and starts again later: same code
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).toHaveText(mine)
  // One click for Sara
  await b.locator('.wp-recent-go').click()
  await expect(a.locator('.wp-member')).toHaveText(['Ali (you)', 'Sara'])
  await expect(b.locator('.wp-member')).toHaveText(['Ali', 'Sara (you)'])
  // Sara opens "her" party with the same code while Ali's is open (she was handed the room, or mistyped): she joins it
  await b.getByRole('button', { name: 'Leave', exact: true }).click()
  await b.evaluate(code => localStorage.setItem('partyRoom', code), mine)
  await b.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(b.locator('.wp-chat')).toContainText('Your room was already open: you joined it.')
  await expect(b.locator('.wp-member')).toHaveText(['Ali', 'Sara (you)'])
  await b.getByRole('button', { name: 'Leave', exact: true }).click()
  // A room can be forgotten
  await b.getByRole('button', { name: 'Forget the room of Ali' }).click()
  await expect(b.locator('.wp-recent')).toHaveCount(0)
  // Another code when wanted; or a new one every time
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await a.getByRole('button', { name: 'New code' }).click()
  const next = (await a.locator('.wp-room-code').innerText()).trim()
  expect(next).not.toBe(mine)
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).toHaveText(next)
  await a.getByRole('button', { name: 'End the watch party' }).click()
  await a.getByLabel(/Always the same code/).uncheck()
  await expect(a.locator('.wp-room-code')).toHaveCount(0)
  await a.getByRole('button', { name: 'Start a watch party' }).click()
  await expect(a.locator('.wp-code b')).not.toHaveText(next)
  await expect(a.locator('.wp-code b')).toHaveText(/^[A-Z0-9]{6}$/)
})

test('the QR code of the invitation, for a phone', async ({ context }) => {
  const a = await pc(context, [series(1, 'Lanterns')])
  const code = await start(a)
  await expect(a.locator('.wp-qr')).toHaveCount(0)
  await a.getByRole('button', { name: 'QR code for a phone' }).click()
  await expect(a.getByRole('img', { name: 'QR code of the invitation' })).toBeVisible()
  // What it says is the invitation link
  const said = await a.evaluate(async () => { const svg = document.querySelector('.wp-qr svg.qr') as SVGSVGElement; const xml = new XMLSerializer().serializeToString(svg); const img = new Image(); await new Promise(r => { img.onload = r; img.src = 'data:image/svg+xml;base64,' + btoa(xml) }); const c = document.createElement('canvas'); c.width = c.height = 396; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 396, 396); const d = g.getImageData(0, 0, 396, 396); const BD = (window as any).BarcodeDetector; if (!BD) return 'no-detector'; const r = await new BD({ formats: ['qr_code'] }).detect(c).catch(() => []); return r[0]?.rawValue || '' })
  if (said !== 'no-detector' && said) expect(said).toBe('https://madaratn.github.io/NovelReader-Windows/party/#' + code)
  await a.getByRole('button', { name: 'QR code for a phone' }).click()
  await expect(a.locator('.wp-qr')).toHaveCount(0)
})

test('chat: who is writing, the time, and the conversation for someone who arrives later', async ({ context }) => {
  const { pages: [a, b], code } = await party(context, [{ name: 'Sara' }])
  await b.locator('.wp-say input').pressSequentially('hel')
  await expect(a.locator('.wp-typing')).toHaveText('Sara is writing…')
  await b.locator('.wp-say input').fill('hello all')
  await b.locator('.wp-say input').press('Enter')
  await expect(a.locator('.wp-chat')).toContainText('Sara hello all')
  await expect(a.locator('.wp-typing')).toHaveCount(0)
  await expect(a.locator('.wp-msg', { hasText: 'hello all' }).locator('time')).toHaveText(/^\d{1,2}:\d{2}/)
  await a.locator('.wp-say input').fill('hi Sara')
  await a.locator('.wp-say input').press('Enter')
  // Someone who writes and stops is no longer "writing" after a few seconds
  await b.locator('.wp-say input').pressSequentially('so')
  await expect(a.locator('.wp-typing')).toHaveText('Sara is writing…')
  await expect(a.locator('.wp-typing')).toHaveCount(0, { timeout: 8000 })
  // Yanis arrives: he finds what was said
  const c = await pc(context, [])
  await join(c, 'Yanis', code)
  await expect(c.locator('.wp-msg.old')).toHaveText([/Sara hello all/, /Ali hi Sara/])
  await expect(c.locator('.wp-member')).toHaveText(['Ali', 'Sara', 'Yanis (you)'])
})

test('"3, 2, 1" starts the video for everyone; small sounds say who comes in', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  expect(await a.evaluate(() => (window as any).__partySounds)).toContain('join')
  await play(a, b)
  await video(a).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await a.locator('.media-player-top .player-stage').hover()
  await a.getByRole('button', { name: 'Start together: 3, 2, 1' }).click()
  await expect(b.locator('.po-count')).toContainText('Ali starts the video')
  await expect(a.locator('.po-count b')).toHaveText(/^[321]$/)
  expect(await video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => !v.paused), { timeout: 8000 }).toBe(true)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => !v.paused), { timeout: 8000 }).toBe(true)
  await expect(b.locator('.po-count')).toHaveCount(0, { timeout: 6000 })
  expect(await b.evaluate(() => (window as any).__partySounds)).toEqual(expect.arrayContaining(['tick', 'go']))
  // The sounds can be turned off
  await b.locator('.wp-gear').click()
  await b.getByLabel('Sounds of the party (someone comes in, leaves, a message)').uncheck()
  await b.locator('.wp-options').getByRole('button', { name: /Back/ }).click()
  const n = await b.evaluate(() => (window as any).__partySounds.length)
  await b.locator('.wp-x[aria-label="Minimize"]').click()
  await a.locator('.wp-say input').fill('psst'); await a.locator('.wp-say input').press('Enter')
  await expect(b.locator('.wp-badge')).toHaveText('1')
  expect(await b.evaluate(() => (window as any).__partySounds.length)).toBe(n)
})

test('voice: a volume for each person, kept for the next time', async ({ context }) => {
  const { pages: [a, b] } = await party(context, [{ name: 'Sara' }])
  await a.getByRole('button', { name: /Join the voice channel/ }).click()
  await b.getByRole('button', { name: /Join the voice channel/ }).click()
  await expect.poll(() => a.evaluate(() => document.querySelectorAll('audio[data-wp-voice]').length), { timeout: 15_000 }).toBe(1)
  await a.getByRole('button', { name: 'Options for Sara' }).click()
  const slider = a.getByLabel('Volume of the voice of Sara')
  await slider.evaluate((el: HTMLInputElement) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '0.25'); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await expect.poll(() => a.evaluate(() => (document.querySelector('audio[data-wp-voice]') as HTMLAudioElement).volume)).toBeCloseTo(0.25, 2)
  expect(await a.evaluate(() => JSON.parse(localStorage.getItem('partyVolumes') || '{}'))).toEqual({ Sara: 0.25 })
  // The toolbar: muted shows, hanging up leaves the channel
  await a.getByRole('button', { name: 'Mute', exact: true }).click()
  await expect(a.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true')
  await a.getByRole('button', { name: 'Leave the voice channel' }).click()
  await expect(a.getByRole('button', { name: /Join the voice channel/ })).toBeVisible()
})
