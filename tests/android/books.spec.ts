import { test, expect } from '@playwright/test'

// A small LNReader-style plugin, run by the in-page runtime (cheerio, @libs/fetch).
const PLUGIN = `
const cheerio = require('cheerio'); const { fetchApi } = require('@libs/fetch');
module.exports.default = {
  id: 'testsrc', name: 'Test Source', site: 'https://novels.test',
  async popularNovels(page) { const html = await (await fetchApi('https://novels.test/popular')).text(); const $ = cheerio.load(html); return $('a.n').map((i, a) => ({ name: $(a).text(), path: $(a).attr('href'), cover: '' })).get() },
  async searchNovels(q) { return (await this.popularNovels(1)).filter(n => n.name.toLowerCase().includes(q.toLowerCase())) },
  async parseNovel(path) { const $ = cheerio.load(await (await fetchApi('https://novels.test' + path)).text()); return { path, name: $('h1').text(), author: 'Auth', summary: $('p.s').text(), chapters: $('a.c').map((i, a) => ({ name: $(a).text(), path: $(a).attr('href') })).get() } },
  async parseChapter(path) { return '<p>Text of ' + path + '</p>' }
}`
const MANIFEST = [{ id: 'testsrc', name: 'Test Source', lang: 'English', version: '1.0.0', url: 'https://plugins.test/testsrc.js', iconUrl: '' }]

test.beforeEach(async ({ page }) => {
  await page.route('**/plugins.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(MANIFEST) }))
  await page.route('https://plugins.test/testsrc.js', r => r.fulfill({ contentType: 'text/javascript', body: PLUGIN }))
  await page.route('https://novels.test/popular', r => r.fulfill({ contentType: 'text/html', body: '<a class="n" href="/novel/shadow">Shadow Slave</a><a class="n" href="/novel/lotm">Lord of the Mysteries</a>' }))
  await page.route('https://novels.test/novel/shadow', r => r.fulfill({ contentType: 'text/html', body: '<h1>Shadow Slave</h1><p class="s">A boy and his shadow.</p><a class="c" href="/c/1">Chapter 1</a><a class="c" href="/c/2">Chapter 2</a>' }))
  await page.addInitScript(() => {
    (window as any).Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true }
    if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('onboarded', '1'); localStorage.setItem('lang', 'en'); localStorage.setItem('enabledPlugins', JSON.stringify(['testsrc'])); sessionStorage.setItem('__seeded', '1') }
  })
})

test('Android: book sources run in the app, search, open a novel, read a chapter, keep it offline', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)))
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/android/)
  await page.locator('.sidebar').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('shadow')
  await page.locator('main input').first().press('Enter')
  await expect(page.locator('main')).toContainText('Shadow Slave', { timeout: 15000 })
  await page.getByRole('button', { name: /Add from Test Source/ }).click()
  // Added: parseNovel ran in the page too (chapters fetched from the site)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('library') || '[]').map((n: any) => [n.name, n.chapterCount ?? n.chapters?.length])), { timeout: 15000 }).toEqual([['Shadow Slave', 2]])
  await page.locator('.sidebar').getByRole('button', { name: 'Library' }).click()
  await page.locator('main').getByText('Shadow Slave').first().click()
  await expect(page.locator('main')).toContainText('Chapter 2', { timeout: 15000 })
  await page.locator('main').getByText('Chapter 1', { exact: false }).first().click()
  await expect(page.locator('main')).toContainText('Text of /c/1', { timeout: 15000 })
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/android-novel.png' })
})

test('Android: videos are announced for a next step, books one tap away', async ({ page }) => {
  await page.goto('/')
  await page.locator('.sidebar').getByRole('tab', { name: /Anime/ }).click()
  await expect(page.locator('.android-soon')).toContainText('Videos are coming to the Android app in the next step')
  await page.getByRole('button', { name: 'Go to my books' }).click()
  await expect(page.locator('.android-soon')).toHaveCount(0)
})
