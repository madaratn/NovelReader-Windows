// Accessibility (WCAG 2.2, up to level AAA) on every page, in the dark and light
// themes: axe-core checks contrast (7:1 for text at AAA), names of buttons and fields,
// headings, landmarks, ARIA… Pages are opened the way a person does.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
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
    storage: { ...historySeed(), appTheme: theme, animeLibrary: JSON.stringify([vid('anime', 1, 'Frieren')]), seriesLibrary: JSON.stringify([vid('series', 1, 'Lanterns')]), movieLibrary: JSON.stringify([vid('movie', 1, 'Dune')]) },
  })
}

export async function axeProblems(page: Page, where: string, out: Map<string, { impact: string, help: string, pages: Set<string>, examples: string[] }>) {
  await page.waitForTimeout(300)
  // "Visible text is part of the name": axe skips text it takes for an icon font, a guess
  // made by drawing it — which depends on the fonts of the machine. Every text counts here,
  // so the result is the same on every machine.
  const r = await new AxeBuilder({ page }).options({ checks: { 'label-content-name-mismatch': { options: { pixelThreshold: 2, occurrenceThreshold: 1e9 } } } } as any).withTags(TAGS).analyze()
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
