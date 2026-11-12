import fs from 'fs'
import { test, expect } from '@playwright/test'

// iPhone (same interface, platform "ios"): no video engine in the app; anime, series
// and movies go through NovelReader on the PC once its link is typed in Settings.
const NOTES = (/^##\s*NovelReader\s+([\d.]+)/m.exec(fs.readFileSync('build/release-notes.md', 'utf8')) || [])[1] || ''
const PC = 'http://192.168.1.5:4580/e/abcdefghjk'

test.beforeEach(async ({ page }) => {
  await page.route('**/plugins.min.json', r => r.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.addInitScript((notes) => {
    (window as any).Capacitor = { getPlatform: () => 'ios', isNativePlatform: () => true }
    if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('onboarded', '1'); localStorage.setItem('lang', 'en'); localStorage.setItem('whatsNewSeen', notes); localStorage.setItem('homeAtStart', '0'); sessionStorage.setItem('__seeded', '1') }
  }, NOTES)
})

test('iPhone: videos through the PC (link typed in Settings, engine calls and streams go to the PC)', async ({ page }) => {
  const calls: string[] = []
  let engineUp = false
  await page.route('http://192.168.1.5:4580/**', r => {
    const u = new URL(r.request().url())
    calls.push(u.pathname + u.search)
    const json = (b: any, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) })
    if (!u.pathname.startsWith('/e/abcdefghjk/')) return r.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' })
    const p = u.pathname.replace('/e/abcdefghjk', '')
    if (p === '/nr/hello') return json({ app: 'NovelReader', device: 'PC', sync: true })
    if (p === '/nr/sync') return json(null)
    if (!engineUp) return json({ error: 'The video engine of the PC is not running.' }, 502)
    if (p === '/api/v1/health') return json({ status: 'ok' })
    if (p === '/api/v1/sources') return json({ manga: [], anime: [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'x.mapple' }] })
    return json({})
  })
  await page.goto('/')
  expect(await page.evaluate(() => [document.documentElement.classList.contains('ios'), document.documentElement.classList.contains('android')])).toEqual([true, true])
  // Not linked yet: a clear sentence, no call anywhere.
  const before = await page.evaluate(() => (window as any).novelReader.miwayomiFetch('/api/v1/sources').then(() => '', (e: any) => e.message))
  expect(before).toContain('Link your PC in Settings')
  expect(await page.evaluate(() => (window as any).novelReader.miwayomiStatus())).toMatchObject({ online: false, starting: false })
  // No in-app updater, cast or downloads on iPhone.
  expect(await page.evaluate(() => ['updateCheck', 'castScan', 'dlStart', 'syncChoose'].filter(k => typeof (window as any).novelReader[k] === 'function'))).toEqual([])
  await page.locator('.m-bottom').getByRole('button', { name: 'More' }).click()
  await page.locator('.m-sheet').getByRole('button', { name: 'Settings' }).click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  const block = page.locator('.pc-link')
  await expect(block).toContainText('Videos and sync through your PC')
  await expect(page.locator('.pc-share')).toHaveCount(0)
  const input = block.getByLabel('Link shown on the PC')
  await input.fill('hello'); await block.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(block.getByRole('alert')).toContainText('not the link shown on the PC')
  await input.fill('192.168.1.5:4580/zzzzzzzzzz'); await block.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(block.getByRole('alert')).toContainText('refused the code')
  await input.fill(' 192.168.1.5:4580/ABCDEFGHJK '); await block.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(block.getByRole('alert')).toContainText('video engine is not running yet')
  engineUp = true
  await block.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(block.getByRole('status')).toContainText('Linked.')
  await expect(block).toContainText('192.168.1.5:4580')
  await expect(block).not.toContainText('abcdefghjk')
  expect(await page.evaluate(() => localStorage.getItem('pcEngine'))).toBe(PC)
  // The engine is now the PC's.
  const src = await page.evaluate(() => (window as any).novelReader.miwayomiFetch('/api/v1/sources'))
  expect(src.anime[0].name).toBe('Mapple')
  expect(calls).toContain('/e/abcdefghjk/api/v1/sources')
  expect(await page.evaluate(() => (window as any).novelReader.miwayomiStatus())).toMatchObject({ online: true, baseUrl: PC })
  await block.getByRole('button', { name: 'Test the link' }).click()
  await expect(block.getByRole('status')).toContainText('Your PC answers.')
  await block.getByRole('button', { name: 'Unlink' }).click()
  await expect(block.getByLabel('Link shown on the PC')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('pcEngine'))).toBeNull()
})
