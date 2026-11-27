// Accessibility of the watch party (WCAG 2.2 up to AAA, like the rest of the app): the
// panel with people, statuses, a stream and messages; its options; the start page with a
// room to join again; the screen of a watched stream. Dark and light themes.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { pc, start, join, series, video, openEpisode } from './party-helpers'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa', 'wcag22aa', 'best-practice']
async function problems(page: Page, where: string, include: string, out: string[]) {
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).options({ checks: { 'label-content-name-mismatch': { options: { pixelThreshold: 2, occurrenceThreshold: 1e9 } } } } as any).withTags(TAGS).include(include).analyze()
  for (const v of r.violations) for (const n of v.nodes) {
    const d: any = (n.any && n.any[0] && n.any[0].data) || {}
    out.push(`${where} | ${v.id} | ${v.id === 'color-contrast-enhanced' ? `${d.fgColor} on ${d.bgColor} (${d.contrastRatio}) ` : ''}${n.target.join(' ').slice(0, 110)}`)
  }
}

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } })

for (const theme of ['dark', 'light']) {
  test(`watch party accessibility (WCAG AAA), ${theme} theme: panel, options, start page, stream screen`, async ({ context }) => {
    test.setTimeout(120_000)
    const found: string[] = []
    const a = await pc(context, [series(1, 'Lanterns')], { storage: { appTheme: theme }, subs: true })
    await a.locator('.wp-open').click(); await a.locator('.wp-field input').fill('Ali')
    await problems(a, 'start', '.wp-panel', found)
    const code = await start(a)
    const b = await pc(context, [], { storage: { appTheme: theme }, sources: [] })
    await join(b, 'Sara', code)
    await expect(a.locator('.wp-member')).toHaveCount(2)
    await openEpisode(a)
    await b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' }).waitFor()
    await problems(b, 'guest without the source', '.wp-panel', found)
    await b.locator('.wp-missing').getByRole('button', { name: 'Watch the stream of Ali' }).click()
    await expect.poll(() => b.locator('.pt-video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 25_000 }).toBe(320)
    // Voice (a muted member), a message with its time, someone writing, a person's options, the QR code
    await a.getByRole('button', { name: /Join the voice channel/ }).click()
    await b.getByRole('button', { name: /Join the voice channel/ }).click()
    await b.locator('.wp-panel').getByRole('button', { name: 'Mic on: Mute', exact: true }).click()
    await b.locator('.wp-say input').fill('hello'); await b.locator('.wp-say input').press('Enter')
    await b.locator('.wp-say input').pressSequentially('and')
    await a.getByRole('button', { name: 'Options for Sara' }).click()
    await a.getByRole('button', { name: 'QR code for a phone' }).click()
    await expect(a.locator('.wp-typing')).toBeVisible()
    await expect(a.locator('.wp-stream')).toBeVisible()
    await problems(a, 'host panel', '.wp-panel', found)
    await a.getByRole('button', { name: 'QR code for a phone' }).click()
    // The host keeps the controls: the lock next to the title, on the guest's side
    await a.locator('.wp-gear').click()
    await a.getByLabel('Only I control the playback (play, pause, position)').check()
    await problems(a, 'options', '.wp-panel', found)
    await a.locator('.wp-options').getByRole('button', { name: /Back/ }).click()
    await expect(b.locator('.wp-lock')).toBeVisible()
    await problems(b, 'guest panel', '.wp-panel', found)
    // The screen of the stream, bars showing; then paused by the host (a toast, the play button)
    await b.locator('.wp-x[aria-label="Minimize"]').click()
    await b.locator('.pt-stage').hover({ position: { x: 300, y: 300 } })
    await problems(b, 'stream screen', '.party-theater', found)
    await video(a).evaluate((v: HTMLVideoElement) => v.pause())
    await expect(b.locator('.po-toast')).toBeVisible()
    await problems(b, 'stream screen paused', '.party-theater', found)
    // Back on the start page, with the room to join again
    await b.locator('.party-overlay').getByRole('button', { name: 'Chat' }).click()
    await b.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(b.locator('.wp-recent')).toBeVisible()
    await problems(b, 'start with a recent room', '.wp-panel', found)
    expect(found, found.join('\n')).toEqual([])
  })
}
