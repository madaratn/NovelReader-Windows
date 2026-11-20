// Accessibility (WCAG 2.2, up to level AAA) on every page, in the dark and light
// themes: axe-core checks contrast (7:1 for text at AAA), names of buttons and fields,
// headings, landmarks, ARIA… Pages are opened the way a person does.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { setup, novel } from './helpers'
import { openSettings, openHistory, openYear, historySeed, tourOverlays } from '../layout-audit'

const LONG = 'The Extraordinarily Long Title Of A Story'
const vid = (kind: string, i: number, name: string) => ({ id: kind + i, name, sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, episodes: 8, genres: ['Drama'], addedAt: Date.now() - i * 1000 })
const PAGES: [string, string][] = [
  ['books', 'library'], ['books', 'discover'], ['books', 'search'], ['books', 'sources'], ['books', 'notes'],
  ['anime', 'anime'], ['anime', 'animeDiscover'], ['anime', 'animeSearch'], ['anime', 'animeSources'], ['anime', 'calendar'], ['anime', 'downloads'],
  ['series', 'series'], ['movies', 'movies'], ['movies', 'localVideos'],
]
const TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa', 'wcag22aa', 'best-practice']

async function prepare(page: Page, theme: string) {
  await setup(page, {
    library: [{ ...novel('n1', LONG, 30), genres: ['Fantasy'] } as any, novel('n2', 'Shadow Slave', 12)],
    reading: { n1: { index: 3 } },
    storage: { ...historySeed(), appTheme: theme, cardView: 'posters', 'mediapos:series:series1:/ep/3': JSON.stringify({ t: 0, d: 0, done: true, at: 1 }), animeLibrary: JSON.stringify([vid('anime', 1, 'Frieren')]), seriesLibrary: JSON.stringify([vid('series', 1, 'Lanterns')]), movieLibrary: JSON.stringify([vid('movie', 1, 'Dune')]) },
  })
  // A series that really plays, for the player's own bar, menu and full screen.
  const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', r => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    // Downloads: one episode kept, one on its way (their marks on the episode rows, and the Downloads page).
    const dl = [
      { id: 'd1', kind: 'series', mediaId: 'series1', mediaName: 'Lanterns', episodeUrl: '/ep/1', episodeName: 'S1 E1 - Episode 1', episodeNo: 1, mediaKey: '', state: 'done', progress: 1, size: 412e6, file: 'video.mp4', subtitles: [] },
      { id: 'd2', kind: 'series', mediaId: 'series1', mediaName: 'Lanterns', episodeUrl: '/ep/2', episodeName: 'S1 E2 - Episode 2', episodeNo: 2, mediaKey: '', state: 'downloading', progress: 0.37, bytes: 151e6 }]
    w.novelReader = { ...base, miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      dlList: async () => dl, dlBase: async () => 'http://127.0.0.1:9', dlUsage: async () => ({ bytes: 412e6, count: 1, folder: '' }), dlStart: async () => ({ id: 'x' }), dlRemove: async () => true, dlCancel: async () => true, dlConfigure: async () => true, onDownloadsChanged: () => () => {},
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Lanterns', description: 'A mystery.', genre: ['Drama'], status: 2 }
        if (p.includes('/episodes')) return [1, 2, 3].map(n => ({ name: 'S1 E' + n + ' - Episode ' + n, url: '/ep/' + n, episode_number: n }))
        if (p.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'Zeus - 1080p', headers: {}, timestamps: [{ start: 0, end: 30, name: 'Intro', type: 'Opening' }] }, { videoUrl: 'https://cdn.test/b.webm', videoTitle: 'Hermes - 720p', headers: {} }]
        if (p.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en' }] }
        return []
      } }
  })
}

export async function axeProblems(page: Page, where: string, out: Map<string, { impact: string, help: string, pages: Set<string>, examples: string[] }>) {
  await page.waitForTimeout(300)
  // "Visible text is part of the name": axe skips text it takes for an icon font, a guess
  // made by drawing it — which depends on the fonts of the machine. Every text counts here,
  // so the result is the same on every machine.
  // With a window open over the page, the window is what is checked: the page behind its
  // veil was checked without it (and its colours, dimmed by the veil, are not what is read).
  const modal = await page.locator('[aria-modal="true"]').count()
  let axe = new AxeBuilder({ page }).options({ checks: { 'label-content-name-mismatch': { options: { pixelThreshold: 2, occurrenceThreshold: 1e9 } } } } as any).withTags(TAGS)
  if (modal) axe = axe.include('[aria-modal="true"]')
  const r = await axe.analyze()
  for (const v of r.violations) {
    const e = out.get(v.id) || { impact: String(v.impact), help: v.help, pages: new Set<string>(), examples: [] }
    e.pages.add(where)
    for (const n of v.nodes) {
      const d: any = (n.any && n.any[0] && n.any[0].data) || {}
      const key = v.id === 'color-contrast-enhanced' ? `${d.fgColor} on ${d.bgColor} (${d.contrastRatio})` : n.target.join(' ')
      if (!e.examples.some((x: string) => x.startsWith(key)) && e.examples.length < 60) e.examples.push(key + ' :: ' + where + ' :: ' + n.target.join(' ').slice(0, 90))
    }
    out.set(v.id, e)
  }
}

for (const [theme, phone] of [['dark', false], ['light', false], ['dark', true], ['light', true]] as const) {
  test(`accessibility (WCAG AAA), ${theme} theme${phone ? ', phone size' : ''}: every page`, async ({ page }) => {
    test.setTimeout(300_000)
    if (phone) await page.setViewportSize({ width: 390, height: 844 })
    await prepare(page, theme)
    const found = new Map<string, any>()
    await page.goto('/')
    for (const [mode, p] of PAGES) {
      await page.evaluate(([m, x]) => { localStorage.setItem('mode', m); localStorage.setItem('lastPage:' + m, x) }, [mode, p])
      await page.reload(); await page.locator('main').waitFor()
      await axeProblems(page, mode + ' › ' + p, found)
    }
    await page.evaluate(() => { localStorage.setItem('mode', 'books'); localStorage.setItem('lastPage:books', 'library') }); await page.reload()
    await page.locator('.libcard').first().waitFor(); await tourOverlays(page, where => axeProblems(page, where, found))
    await openSettings(page); await axeProblems(page, 'settings', found)
    await page.reload(); await openHistory(page); await axeProblems(page, 'history', found)
    await page.reload(); await openYear(page); await axeProblems(page, 'your year', found)
    await page.reload(); await page.locator('.libcard').first().locator('.libcard-cover').click(); await axeProblems(page, 'book page', found)
    await page.getByRole('button', { name: /Continue · Ch\.|Start reading/ }).first().click(); await page.locator('.readerpage').waitFor(); await axeProblems(page, 'reader', found)
    await page.evaluate(() => { localStorage.setItem('mode', 'series'); localStorage.setItem('lastPage:series', 'series') }); await page.reload()
    await page.locator('.libcard', { hasText: 'Lanterns' }).locator('.libcard-cover').click(); await page.locator('.media-hero').waitFor(); await axeProblems(page, 'series page', found)
    // The player: its bar, its "⋯" menu, then the whole of it in full screen.
    await page.locator('.media-hero .primary').click(); await page.locator('.remote-player video').waitFor(); await axeProblems(page, 'player', found)
    await page.locator('.player-more .more-btn').click(); await page.locator('.player-more .more-pop').waitFor(); await axeProblems(page, 'player menu', found); await page.keyboard.press('Escape')
    await page.locator('.player-trackbar .player-full').click(); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true); await axeProblems(page, 'player, full screen', found)
    await page.locator('.player-trackbar .player-full').click(); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
    // The other display of the libraries and Discover: the detailed list.
    await page.evaluate(() => localStorage.setItem('cardView', 'list'))
    for (const [mode, p] of [['books', 'library'], ['books', 'discover'], ['series', 'series'], ['series', 'seriesDiscover']]) {
      await page.evaluate(([m, x]) => { localStorage.setItem('mode', m); localStorage.setItem('lastPage:' + m, x) }, [mode, p])
      await page.reload(); await page.locator('main').waitFor(); await axeProblems(page, mode + ' › ' + p + ' (list)', found)
    }
    const report = [...found.entries()].map(([id, e]) => `${id} [${e.impact}] ${e.help} — ${e.pages.size} page(s)\n    ` + e.examples.join('\n    '))
    console.log('AXE ' + theme + (phone ? ' phone' : '') + '\n' + report.join('\n'))
    expect(report, report.join('\n')).toEqual([])
  })
}

// The first-launch guide and the "What's new" window: shown once each, checked too.
for (const [theme, phone] of [['dark', false], ['light', true]] as const) for (const what of ['welcome guide', "what's new"] as const) {
  test(`accessibility (WCAG AAA), ${theme} theme${phone ? ', phone size' : ''}: ${what}`, async ({ page }) => {
    test.setTimeout(120_000)
    if (phone) await page.setViewportSize({ width: 390, height: 844 })
    const found = new Map<string, any>()
    await setup(page, what === 'welcome guide' ? { onboarded: false, storage: { appTheme: theme } } : { storage: { appTheme: theme, whatsNewSeen: '0.1.0' } })
    await page.goto('/')
    if (what === 'welcome guide') {
      await page.locator('.welcome').waitFor()
      for (let step = 1; step <= 3; step++) { await axeProblems(page, 'welcome, step ' + step, found); if (step < 3) await page.locator('.welcome-actions .primary').click() }
    } else { await page.locator('.whats-new').waitFor(); await axeProblems(page, "what's new", found) }
    const report = [...found.entries()].map(([id, e]) => `${id} [${e.impact}] ${e.help} — ${e.pages.size} page(s)\n    ` + e.examples.join('\n    '))
    console.log('AXE ' + what + ' ' + theme + (phone ? ' phone' : '') + '\n' + report.join('\n'))
    expect(report, report.join('\n')).toEqual([])
  })
}
