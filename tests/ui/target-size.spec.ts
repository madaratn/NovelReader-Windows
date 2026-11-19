// Target size (WCAG 2.5.8 on the PC: 24 px; 2.5.5 on the phone layout: 44 px): every
// button, field and tab is big enough to hit.
import { test, expect } from '@playwright/test'
import { setup, novel } from './helpers'
import { openSettings, smallTargets } from '../layout-audit'
for (const [w, min] of [[390, 44], [1280, 24]] as const) test(`controls are at least ${min} px (${w === 390 ? 'phone, fingers' : 'PC, mouse'})`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: 844 })
  await setup(page, { library: [novel('n1', 'Alpha', 30)], reading: { n1: { index: 3 } }, storage: { animeLibrary: JSON.stringify([{ id: 'a1', name: 'Frieren', sourceId: '42', url: '/a/1', episodes: 8 }]) } })
  const small: Record<string, any> = {}
  await page.goto('/')
  const scan = async (where: string) => { await page.waitForTimeout(300); const r = await smallTargets(page, min); if (r.length) small[where] = r }
  await scan('library')
  await page.locator('.libcard').first().locator('.libcard-cover').click(); await scan('book')
  await page.getByRole('button', { name: /Continue · Ch\./ }).first().click(); await page.locator('.readerpage').waitFor(); await scan('reader')
  // The reader's panels: settings (Aa), read aloud, translation, find.
  for (const [name, sel] of [['reading settings', '.readersettings-btn'], ['read aloud', '.tts-toggle'], ['translation', '.translate-more'], ['find', '.find-toggle']]) { await page.locator(sel).click(); await scan('reader › ' + name); await page.locator(sel).click() }
  for (const [m, p] of [['books', 'discover'], ['books', 'sources'], ['anime', 'anime'], ['anime', 'animeSources'], ['anime', 'calendar']]) { await page.evaluate(([a, b]) => { localStorage.setItem('mode', a); localStorage.setItem('lastPage:' + a, b) }, [m, p]); await page.reload(); await page.locator('main').waitFor(); await scan(p) }
  await page.evaluate(() => { localStorage.setItem('mode', 'books'); localStorage.setItem('lastPage:books', 'library') }); await page.reload(); await openSettings(page); await scan('settings')
  expect(small, JSON.stringify(small, null, 1)).toEqual({})
})
