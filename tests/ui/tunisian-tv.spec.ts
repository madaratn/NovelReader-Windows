import { test, expect } from '@playwright/test'
import { setup } from './helpers'

// Tunisian TV: the series of Tunisian channels' official YouTube channels, served by
// the app from the published catalog (faked here), played in YouTube's own player.
test('Tunisian TV: turned on in one click (no key), found in Global Search, episodes in order, played by YouTube', async ({ page }) => {
  const got: string[] = []
  let online = false
  await page.route('https://raw.githubusercontent.com/madaratn/NovelReader-Windows/catalog/tntv/**', r => {
    const file = r.request().url().split('/').pop()!
    got.push(file)
    if (!online) return r.fulfill({ status: 503, body: '' })
    const json = (b: any) => r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) })
    if (file === 'tntv-catalog.json') return json({ at: '2026-11-10T00:00:00Z', channels: [{ id: 'UC1', name: 'Elhiwar Ettounsi', file: 'tntv-1.json' }, { id: 'UC0', name: 'Télévision Tunisienne', file: 'tntv-0.json' }], playlists: [
      { id: 'PL-awled', title: 'مسلسل أولاد مفيدة - الموسم الأول', thumb: 'https://i.ytimg.com/a.jpg', channel: 'Elhiwar Ettounsi', count: 3 },
      { id: 'PL-clips', title: 'مقاطع أولاد مفيدة', thumb: '', channel: 'Elhiwar Ettounsi', count: 50 },
      { id: 'PL-choufli', title: 'Choufli Hal - شوفلي حل', thumb: '', channel: 'Télévision Tunisienne', count: 2 }] })
    if (file === 'tntv-1.json') return json({ playlists: { 'PL-awled': [['vid22222222', 'أولاد مفيدة الحلقة 2'], ['vid11111111', 'أولاد مفيدة الحلقة 1'], ['vid33333333', 'أولاد مفيدة الحلقة 3']] } })
    return r.fulfill({ status: 404, body: '' })
  })
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body style="background:#000;color:#fff">YouTube player</body></html>' }))
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'seriesSources', 'mediaLangs:Series': JSON.stringify(['en']) } })
  await page.goto('/')
  const row = page.locator('.tntv-row')
  await expect(row).toContainText('Tunisian TV (official YouTube channels)')
  await expect(row.locator('input')).toHaveCount(0)
  // The catalog cannot be downloaded: clear message, nothing turned on.
  await row.getByRole('button', { name: 'Turn on' }).click()
  await expect(row.locator('.anime-toast')).toContainText('could not be downloaded')
  await expect(row.getByRole('button', { name: 'Turn on' })).toBeVisible()
  online = true
  await row.getByRole('button', { name: 'Turn on' }).click()
  await expect(row.locator('.anime-toast')).toContainText('Tunisian TV is ready')
  await expect(row).toContainText('Turned on')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mediaLangs:Series')!))).toEqual(['en', 'ar'])
  // Search with another spelling (no hamza): found.
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  await page.locator('main input').first().fill('اولاد مفيده')
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.locator('main')).toContainText('مسلسل أولاد مفيدة - الموسم الأول', { timeout: 15000 })
  // The full series first, its extracts after.
  const titles = await page.locator('.resultcard').allInnerTexts()
  expect(titles.findIndex(x => x.includes('مسلسل أولاد مفيدة'))).toBeLessThan(titles.findIndex(x => x.includes('مقاطع')))
  await page.locator('.resultcard', { hasText: 'مسلسل أولاد مفيدة' }).getByRole('button', { name: /Add to library/ }).click()
  await expect(page.locator('.resultcard', { hasText: 'مسلسل أولاد مفيدة' })).toContainText('In your library')
  await page.locator('.sidebar').getByRole('button', { name: 'Series Library' }).click()
  await page.locator('.libcard', { hasText: 'أولاد مفيدة' }).getByRole('button', { name: 'Show episodes' }).click()
  // Episodes in order.
  await expect(page.locator('main')).toContainText('أولاد مفيدة الحلقة 3', { timeout: 15000 })
  const names = await page.locator('.episodecell').allInnerTexts()
  const order = ['الحلقة 1', 'الحلقة 2', 'الحلقة 3'].map(x => names.findIndex(n => n.includes(x)))
  expect(order.every(i => i >= 0)).toBe(true); expect(order).toEqual([...order].sort((a, b) => a - b))
  await page.locator('.episodecell', { hasText: 'الحلقة 1' }).locator('.episodecard').click()
  const frame = page.locator('.youtube-player iframe')
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/vid11111111\?autoplay=1/)
  await expect(page.locator('.youtube-player')).toContainText('Played by YouTube')
  // Live: one entry with the channels, played by YouTube's live player of the channel.
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  await page.locator('main input').first().fill('live')
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('.resultcard', { hasText: 'Live: Tunisian channels' }).getByRole('button', { name: /Add to library/ }).click()
  await page.locator('.sidebar').getByRole('button', { name: 'Series Library' }).click()
  await page.locator('.libcard', { hasText: 'Live: Tunisian channels' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.episodecell', { hasText: 'Elhiwar Ettounsi' }).locator('.episodecard').click()
  await expect(page.locator('.youtube-player iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube\.com\/embed\/live_stream\?channel=UC1&autoplay=1/)
  // The catalog is downloaded once, and only the file of the channel that was opened.
  expect(got.filter(x => x === 'tntv-catalog.json').length).toBe(2)
  expect(got.filter(x => x === 'tntv-1.json').length).toBe(1)
  expect(got).not.toContain('tntv-0.json')
})
