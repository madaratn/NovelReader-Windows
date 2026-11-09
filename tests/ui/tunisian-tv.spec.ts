import { test, expect } from '@playwright/test'
import { setup } from './helpers'

// Tunisian TV: the series of Tunisian channels' official YouTube channels, served by
// the app (YouTube Data API, faked here), played in YouTube's own player.
test('Tunisian TV: turned on with a YouTube key, found in Global Search, episodes in order, played by YouTube', async ({ page }) => {
  const api: string[] = []
  await page.route('https://www.googleapis.com/youtube/v3/**', r => {
    const u = new URL(r.request().url()), kind = u.pathname.split('/').pop()!
    api.push(kind + ' ' + (u.searchParams.get('q') || u.searchParams.get('channelId') || u.searchParams.get('playlistId') || u.searchParams.get('id') || ''))
    if (u.searchParams.get('key') !== 'AIza-test') return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid', errors: [{ reason: 'badRequest' }] } }) })
    const json = (b: any) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) })
    if (kind === 'search') return json({ items: [{ id: { channelId: 'UC-' + u.searchParams.get('q')!.replace(/\W/g, '') }, snippet: { channelId: 'UC-' + u.searchParams.get('q')!.replace(/\W/g, ''), channelTitle: u.searchParams.get('q') } }] })
    if (kind === 'playlists' && u.searchParams.get('channelId') === 'UC-ElhiwarEttounsi') return json({ items: [
      { id: 'PL-awled', snippet: { title: 'مسلسل أولاد مفيدة - الموسم الأول', publishedAt: '2015-06-01T00:00:00Z', thumbnails: { high: { url: 'https://i.ytimg.com/a.jpg' } } }, contentDetails: { itemCount: 3 } },
      { id: 'PL-empty', snippet: { title: 'Empty', publishedAt: '2020-01-01T00:00:00Z' }, contentDetails: { itemCount: 0 } }] })
    if (kind === 'playlists' && u.searchParams.get('id') === 'PL-awled') return json({ items: [{ snippet: { title: 'مسلسل أولاد مفيدة - الموسم الأول', description: 'Ramadan 2015', channelTitle: 'Elhiwar Ettounsi', thumbnails: { high: { url: 'https://i.ytimg.com/a.jpg' } } } }] })
    if (kind === 'playlists') return json({ items: [] })
    if (kind === 'playlistItems') return json({ items: [
      { snippet: { title: 'أولاد مفيدة الحلقة 2' }, contentDetails: { videoId: 'vid22222222' } },
      { snippet: { title: 'Private video' }, contentDetails: { videoId: 'priv0000000' } },
      { snippet: { title: 'أولاد مفيدة الحلقة 1' }, contentDetails: { videoId: 'vid11111111' } },
      { snippet: { title: 'أولاد مفيدة الحلقة 3' }, contentDetails: { videoId: 'vid33333333' } }] })
    return r.fulfill({ status: 404 })
  })
  await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body style="background:#000;color:#fff">YouTube player</body></html>' }))
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'seriesSources', 'mediaLangs:Series': JSON.stringify(['en']) } })
  await page.goto('/')
  const row = page.locator('.tntv-row')
  await expect(row).toContainText('Tunisian TV (official YouTube channels)')
  // A wrong key: clear message, nothing turned on.
  await row.getByLabel('YouTube API key').fill('bad')
  await row.getByRole('button', { name: 'Turn on' }).click()
  await expect(row.locator('.anime-toast')).toContainText('The YouTube key is not valid.')
  await row.getByLabel('YouTube API key').fill('AIza-test')
  await row.getByRole('button', { name: 'Turn on' }).click()
  await expect(row.locator('.anime-toast')).toContainText('Tunisian TV is ready')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mediaLangs:Series')!))).toEqual(['en', 'ar'])
  // Search with another spelling (no hamza): found.
  await page.locator('.sidebar').getByRole('button', { name: 'Global Search' }).click()
  await page.locator('main input').first().fill('اولاد مفيده')
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.locator('main')).toContainText('مسلسل أولاد مفيدة - الموسم الأول', { timeout: 15000 })
  await page.locator('.resultcard', { hasText: 'أولاد مفيدة' }).getByRole('button', { name: /Add to library/ }).click()
  await expect(page.locator('.resultcard', { hasText: 'أولاد مفيدة' })).toContainText('In your library')
  await page.locator('.sidebar').getByRole('button', { name: 'Series Library' }).click()
  await page.locator('.libcard', { hasText: 'أولاد مفيدة' }).getByRole('button', { name: 'Show episodes' }).click()
  // Episodes in order, private video left out.
  await expect(page.locator('main')).toContainText('أولاد مفيدة الحلقة 3', { timeout: 15000 })
  const names = await page.locator('.episodecell').allInnerTexts()
  const order = ['الحلقة 1', 'الحلقة 2', 'الحلقة 3'].map(x => names.findIndex(n => n.includes(x)))
  expect(order.every(i => i >= 0)).toBe(true); expect(order).toEqual([...order].sort((a, b) => a - b))
  expect(names.join(' ')).not.toContain('Private video')
  await page.locator('.episodecell', { hasText: 'الحلقة 1' }).locator('.episodecard').click()
  const frame = page.locator('.youtube-player iframe')
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/vid11111111\?autoplay=1/)
  await expect(page.locator('.youtube-player')).toContainText('Played by YouTube')
  // Quota: channels looked up once (1 refused bad-key try + 6), then kept.
  expect(api.filter(x => x.startsWith('search')).length).toBe(7)
})
