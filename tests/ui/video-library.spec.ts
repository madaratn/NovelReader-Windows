import { test, expect, type Page } from '@playwright/test'
import { setup } from './helpers'

// Anime / Series / Movies: libraries, statuses, resume banner, new episodes,
// detail page, remembered server, skip intro and installed source health.
// The video engine is replaced by a scripted fake (window.__engine).

const item = (kind: string, i: number, name: string, extra: any = {}) => ({ id: kind + i, name, sourceId: '42', sourceName: 'Mapple', url: '/' + kind + '/' + i, thumbnail: '', episodes: kind === 'movie' ? 1 : 8, addedAt: Date.now() - i * 3600_000, ...extra })

async function openVideo(page: Page, storage: Record<string, string>) {
  await setup(page, { storage })
  await page.addInitScript(() => {
    const w = window as any
    const eps = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S1 E${i + 1} - Chapter ${i + 1}`, url: '/ep/' + (i + 1), episode_number: i + 1 }))
    w.__engine = { calls: [] as string[], episodes: 8 }
    const base = w.novelReader
    w.novelReader = {
      ...base,
      miwayomiStatus: async () => ({ online: true, baseUrl: 'http://127.0.0.1:4567' }),
      miwayomiFetch: async (path: string, method?: string, body?: any) => {
        w.__engine.calls.push((method || 'GET') + ' ' + path)
        if (path.includes('/details')) return { title: 'Lanterns', description: 'A mystery. **Type:** TV Show **Score:** ★ 8.4 ![Backdrop](https://x/y.jpg)', genre: ['Drama'], status: 2, thumbnail_url: 'https://img.test/cover.jpg' }
        if (path.includes('/44/episodes')) return []
        if (path.includes('/episodes')) return eps(w.__engine.episodes)
        if (path.includes('/videos')) return [
          { videoUrl: 'https://cdn.test/a.mp4', videoTitle: 'Zeus - 480p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [] },
          { videoUrl: 'https://cdn.test/b.mp4', videoTitle: 'Hermes - 1080p', headers: {}, subtitleTracks: [], audioTracks: [], timestamps: [{ start: 0, end: 85, name: 'Intro', type: 'Opening' }] }
        ]
        if (path.includes('/extensions/installed')) return [{ name: 'Mapple', pkg: 'mapple' }, { name: 'Aniyomi: LaMovie', pkg: 'lamovie' }, { name: 'Partial', pkg: 'partial' }]
        if (path.includes('/extensions/uninstall')) return { ok: true, pkg: body?.pkg }
        if (path.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'mapple' }, { id: '43', name: 'LaMovie', lang: 'es', pkg: 'lamovie' }, { id: '44', name: 'Partial', lang: 'en', pkg: 'partial' }] }
        if (path.includes('/44/popular')) return { animes: [{ title: 'Empty show', url: '/p/1' }] }
        if (path.includes('/43/popular')) throw new Error("Error invoking remote method 'anime:miwayomiFetch': Error: Miwayomi HTTP 500 — {\"error\":\"Hôte inconnu (la.movie)\"}")
        if (path.includes('/42/popular')) return path.endsWith('page=1') ? { animes: [{ title: 'Lanterns', url: '/series/1', thumbnail_url: 'https://img.test/l.jpg' }, { title: 'Severance', url: '/s/sev', thumbnail_url: 'https://img.test/s.jpg' }], hasNextPage: true } : { animes: [{ title: 'Andor', url: '/s/andor', thumbnail_url: 'https://img.test/a.jpg' }], hasNextPage: false }
        if (path.includes('/latest')) throw new Error('Miwayomi HTTP 500 — {"error":"Latest is not supported by this source"}')
        if (path.includes('/popular')) return { animes: [] }
        return []
      }
    }
  })
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
}

test('series library: statuses, resume banner and new episodes badge', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 0, 'The Bear'), item('series', 1, 'Lanterns'), item('series', 2, 'Dune Prophecy', { shelf: 'completed' })]),
    'lastEpInfo:series1': JSON.stringify({ url: '/ep/3', name: 'S1 E3 - Chapter 3', n: 3, at: Date.now() - 3600_000 }),
    'mediapos:series:series1:/ep/3': JSON.stringify({ t: 1325, d: 2700, at: Date.now() - 3600_000 })
  })
  // Resume banner, like the Books library
  const banner = page.locator('.lib-resume')
  await expect(banner).toContainText('Lanterns')
  await expect(banner).toContainText('stopped at 22:05')
  await expect(banner.getByRole('button')).toHaveText('Continue · Ep. 3')
  // Status tabs with counts; the watched title is "Watching" by default
  await expect(page.locator('.shelftab')).toHaveText(['All 3', 'Watching 1', 'Plan to watch 1', 'Completed 1', 'Dropped 0'])
  await page.locator('.shelftab', { hasText: 'Completed' }).click()
  await expect(page.locator('.libcard h2')).toHaveText(['Dune Prophecy'])
  await page.locator('.shelftab', { hasText: 'All' }).click()
  await page.locator('.libcard', { hasText: 'The Bear' }).locator('.shelfselect').selectOption('dropped')
  await expect(page.locator('.shelftab', { hasText: 'Dropped' })).toHaveText('Dropped 1')
  // New episodes: the source now has 10 episodes instead of 8
  await page.evaluate(() => { (window as any).__engine.episodes = 10 })
  await page.getByRole('button', { name: 'Check for new episodes' }).click()
  await expect(page.locator('.lib-update-status')).toHaveText('3 titles have new episodes.')
  await expect(page.locator('.libcard', { hasText: 'Lanterns' }).locator('.newbadge')).toHaveText('+2 new')
  // Missing covers are filled from the source details
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').every((x: any) => x.thumbnail === 'https://img.test/cover.jpg'))).toBe(true)
})

test('series detail: Books-style hero, clean facts, remembered server, skip intro', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]),
    'prefServer:series1': 'Hermes - 1080p'
  })
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await expect(page.locator('.media-hero h1')).toHaveText('Lanterns')
  await expect(page.locator('.media-hero .primary')).toHaveText('Start · Ep. 1')
  await expect(page.locator('.media-description')).toHaveText('A mystery.')
  await expect(page.locator('.media-info dl')).toContainText('StatusFinished') // status 2, not "2"
  await expect(page.locator('.media-info')).not.toContainText('Backdrop')
  await page.locator('.media-hero .primary').click()
  // The server that worked last time is selected first
  await expect(page.locator('.player-trackbar select').first().locator('option:checked')).toHaveText('Hermes - 1080p')
  await expect(page.locator('.player-skip')).toHaveText('Skip intro ⏭')
  await page.locator('.player-skip').click()
  await expect.poll(() => page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(0)
})

test('video sources: test installed sources and remove the dead one', async ({ page }) => {
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'animeSources' })
  await page.getByRole('button', { name: 'Test my sources' }).click()
  await expect(page.locator('.source-health .engine-row p')).toContainText('1 working, 1 partly working, 1 not responding.')
  // Full chain: list, episodes, streams of one title
  await expect(page.locator('.health-row.ok')).toContainText('List ✓ · Episodes ✓ · Streams ✓ (2)')
  await expect(page.locator('.health-row.ok .health-state')).toHaveText('Plays')
  await expect(page.locator('.health-row.warn')).toContainText('List ✓ · Episodes ✗ · Streams ✗')
  await expect(page.locator('.health-row.warn')).toContainText('No episode')
  // Remembered, and dead sources are skipped by the fallback search
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('videoSourceHealth') || '{}'))
  expect(saved.lamovie.state).toBe('dead'); expect(saved.lamovie.sourceIds).toEqual(['43']); expect(saved.mapple.state).toBe('ok')
  const dead = page.locator('.health-row.dead')
  await expect(dead).toContainText('LaMovie')
  await expect(dead.locator('small')).toHaveText('Hôte inconnu (la.movie)')
  await page.getByRole('button', { name: 'Remove 1 dead source' }).click()
  await page.getByRole('button', { name: 'Yes, uninstall' }).click()
  await expect(page.locator('.health-row')).toHaveCount(2)
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('videoSourceHealth') || '{}')).sort())).toEqual(['mapple', 'partial'])
  await expect.poll(() => page.evaluate(() => (window as any).__engine.calls.some((c: string) => c === 'POST /api/v1/extensions/uninstall'))).toBe(true)
})

test('episodes: watched marks, Shift marks the previous ones, counts on the card', async ({ page }) => {
  await openVideo(page, { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]) })
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await expect(page.locator('.episode-tools small')).toHaveText('0 / 8 watched')
  await page.locator('.episodecell').nth(3).hover()
  await page.locator('.episodecell').nth(3).locator('.ep-watch').click({ modifiers: ['Shift'] })
  await expect(page.locator('.episode-tools small')).toHaveText('4 / 8 watched')
  await expect(page.locator('.episodecard.watched')).toHaveCount(4)
  await page.locator('.episodecell').nth(0).locator('.ep-watch').click()
  await expect(page.locator('.episode-tools small')).toHaveText('3 / 8 watched')
  await page.getByRole('button', { name: 'Mark all as watched' }).click()
  await expect(page.locator('.episode-tools small')).toHaveText('8 / 8 watched')
  await page.locator('.sidebar .nav-item', { hasText: 'Series Library' }).click()
  await expect(page.locator('.libcard', { hasText: 'Lanterns' }).locator('small')).toContainText('8 watched')
})

async function dlFake(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__dl = { items: [] as any[], started: [] as any[], cb: null as any }
    const fire = () => w.__dl.cb && w.__dl.cb()
    w.__dlPatch = {
      dlStart: async (p: any) => { w.__dl.started.push(p); const id = 'series_' + w.__dl.started.length; w.__dl.items.push({ ...p, candidates: undefined, id, state: 'downloading', progress: 0.42, bytes: 5e6 }); setTimeout(fire, 0); return { id } },
      dlList: async () => w.__dl.items.map((x: any) => ({ ...x })),
      dlBase: async () => 'http://127.0.0.1:9',
      dlUsage: async () => ({ bytes: w.__dl.items.reduce((n: number, x: any) => n + (x.size || 0), 0), count: w.__dl.items.filter((x: any) => x.state === 'done').length, folder: 'C:/dl' }),
      dlCancel: async (id: string) => { w.__dl.items = w.__dl.items.filter((x: any) => x.id !== id); fire(); return true },
      dlRemove: async (id: string) => { w.__dl.items = w.__dl.items.filter((x: any) => x.id !== id); fire(); return true },
      dlClear: async () => { w.__dl.items = []; fire(); return true },
      dlOpenFolder: async () => true,
      onDownloadsChanged: (cb: any) => { w.__dl.cb = cb; return () => {} }
    }
    w.__dlFinish = () => { for (const x of w.__dl.items) Object.assign(x, { state: 'done', progress: 1, type: 'file', file: 'video.mp4', size: 3.2e8, title: 'Hermes - 1080p', subtitles: [{ label: 'English', lang: 'en', file: 'sub0.vtt' }] }); fire() }
  })
}

test('discover: popular list of a source, add to library, load more, latest unsupported', async ({ page }) => {
  await openVideo(page, { mode: 'series', 'lastPage:series': 'seriesDiscover', seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]) })
  await expect(page.locator('h1')).toHaveText('Discover')
  await expect(page.locator('.media-discover .resultcard h3')).toHaveText(['Lanterns', 'Severance'])
  // Already saved titles link to the library instead of offering to add them again
  await expect(page.locator('.resultcard', { hasText: 'Lanterns' })).toContainText('In your library')
  await page.locator('.resultcard', { hasText: 'Severance' }).getByRole('button', { name: /Add to library/ }).click()
  await expect(page.locator('.resultcard', { hasText: 'Severance' })).toContainText('In your library')
  const lib = await page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').map((x: any) => x.name))
  expect(lib).toEqual(['Severance', 'Lanterns'])
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.locator('.media-discover .resultcard h3')).toHaveText(['Lanterns', 'Severance', 'Andor'])
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Latest' }).click()
  await expect(page.locator('.anime-toast.error')).toContainText('no list of latest releases')
  // The choice of source is kept per mode
  await page.locator('.discover-bar select').selectOption('43')
  expect(await page.evaluate(() => localStorage.getItem('discoverSource:Series'))).toBe('43')
})

test('background check: new episodes found while away raise a Windows notification', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('__background', '1'))
  await openVideo(page, {
    episodeCheckDelay: '1500', mode: 'books',
    seriesLibrary: JSON.stringify([item('series', 0, 'The Bear'), item('series', 1, 'Lanterns', { shelf: 'dropped' })])
  })
  await page.evaluate(() => { (window as any).__engine.episodes = 10 })
  await expect.poll(() => page.evaluate(() => (window as any).__notes)).toEqual([{ title: '1 title has new episodes.', body: 'The Bear' }])
  const lib = await page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]'))
  expect(lib.find((x: any) => x.name === 'The Bear').newEpisodes).toBe(2)
  // Dropped titles are not checked
  expect(await page.evaluate(() => (window as any).__engine.calls.filter((c: string) => c.includes('/series/1')).length)).toBe(0)
  await page.evaluate(() => (window as any).__lastNote.onclick())
  await expect(page.locator('.libcard', { hasText: 'The Bear' })).toBeVisible()
  // Done for the next 6 hours
  expect(Number(await page.evaluate(() => localStorage.getItem('lastEpisodeCheck')))).toBeGreaterThan(0)
})

test('background check can be turned off in Settings', async ({ page }) => {
  await openVideo(page, { episodeCheckDelay: '300', autoCheckEpisodes: '0', seriesLibrary: JSON.stringify([item('series', 0, 'The Bear')]) })
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => (window as any).__engine.calls.filter((c: string) => c.includes('/episodes')).length)).toBe(0)
})

test('offline downloads: download an episode, play it from this PC, manage it in Downloads', async ({ page }) => {
  await dlFake(page)
  await openVideo(page, { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]) })
  await page.evaluate(() => Object.assign((window as any).novelReader, (window as any).__dlPatch))
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  const cell = page.locator('.episodecell').nth(1)
  await cell.hover()
  await cell.getByRole('button', { name: 'Download for offline viewing' }).click()
  await expect(cell.locator('.ep-dl')).toHaveText('42%')
  const started = await page.evaluate(() => (window as any).__dl.started[0])
  expect(started.kind).toBe('series')
  expect(started.episodeUrl).toBe('/ep/2')
  expect(started.mediaKey).toBe('series:series1:/ep/2')
  expect(started.candidates.map((c: any) => c.type)).toEqual(['file', 'file'])
  expect(started.candidates[0].url).toContain('/api/v1/proxy?')
  await page.evaluate(() => (window as any).__dlFinish())
  await expect(cell.locator('.ep-dl.done')).toBeVisible()
  // The downloaded episode plays from this PC, without asking the source
  const before = await page.evaluate(() => (window as any).__engine.calls.filter((c: string) => c.includes('/videos')).length)
  await cell.locator('.episodecard').click()
  await expect(page.locator('.remote-player video')).toHaveAttribute('src', 'http://127.0.0.1:9/series_1/video.mp4')
  expect(await page.evaluate(() => (window as any).__engine.calls.filter((c: string) => c.includes('/videos')).length)).toBe(before)
  // Downloads page: grouped by title, size, play and delete
  await page.locator('.sidebar .nav-item', { hasText: 'Downloads' }).click()
  await expect(page.locator('.dl-group h2')).toHaveText('Lanterns')
  await expect(page.locator('.dl-group')).toContainText('1 video · 320 MB')
  await expect(page.locator('.dl-group .dl-row')).toContainText('1 subtitle')
  await page.locator('.dl-group').getByRole('button', { name: /Play/ }).click()
  await expect(page.locator('.downloads-page .remote-player video')).toHaveAttribute('src', 'http://127.0.0.1:9/series_1/video.mp4')
  await page.locator('.dl-group').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.lib-empty')).toContainText('No downloads yet')
})

test('up next: next episode of each title in progress, opens on that episode', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 0, 'The Bear'), item('series', 1, 'Lanterns'), item('series', 2, 'Caught up'), item('series', 3, 'Dropped', { shelf: 'dropped' })]),
    'lastEpInfo:series0': JSON.stringify({ url: '/ep/2', name: 'S1 E2', n: 2, at: Date.now() - 60_000 }),
    'mediapos:series:series0:/ep/2': JSON.stringify({ t: 0, d: 2700, done: true, at: Date.now() - 60_000 }),
    'lastEpInfo:series1': JSON.stringify({ url: '/ep/5', name: 'S1 E5', n: 5, at: Date.now() - 3600_000 }),
    'mediapos:series:series1:/ep/5': JSON.stringify({ t: 900, d: 2700, at: Date.now() - 3600_000 }),
    'lastEpInfo:series2': JSON.stringify({ url: '/ep/8', name: 'S1 E8', n: 8, at: Date.now() - 7200_000 }),
    'mediapos:series:series2:/ep/8': JSON.stringify({ t: 0, d: 2700, done: true, at: Date.now() - 7200_000 }),
    'lastEpInfo:series3': JSON.stringify({ url: '/ep/1', name: 'S1 E1', n: 1, at: Date.now() - 100 })
  })
  // The most recent one is the banner, and it offers the next episode since E2 is finished
  await expect(page.locator('.lib-resume h2')).toHaveText('The Bear')
  await expect(page.locator('.lib-resume button.primary')).toHaveText('Next · Ep. 3')
  // The row has the others in progress; caught-up and dropped titles are left out
  await expect(page.locator('.upnext-card b')).toHaveText(['Lanterns'])
  await expect(page.locator('.upnext-card')).toContainText('Continue · Ep. 5 · 30 min left')
  await page.locator('.lib-resume button.primary').click()
  await expect(page.locator('.media-player-top h2')).toContainText('S1 E3')
})

test('batch download: the next episodes after the last one watched; auto-delete once watched', async ({ page }) => {
  await dlFake(page)
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]),
    'lastEpInfo:series1': JSON.stringify({ url: '/ep/2', name: 'S1 E2', n: 2, at: Date.now() - 60_000 }),
    'mediapos:series:series1:/ep/2': JSON.stringify({ t: 0, d: 2700, done: true, at: Date.now() - 60_000 })
  })
  await page.evaluate(() => Object.assign((window as any).novelReader, (window as any).__dlPatch))
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.batch-dl select').selectOption('3')
  await page.locator('.batch-dl').getByRole('button', { name: /Download the next episodes/ }).click()
  await expect(page.locator('.batch-dl-msg')).toHaveText('3 episodes queued.')
  expect(await page.evaluate(() => (window as any).__dl.started.map((p: any) => p.episodeUrl))).toEqual(['/ep/3', '/ep/4', '/ep/5'])
  await page.evaluate(() => (window as any).__dlFinish())
  await expect(page.locator('.batch-dl-info').first()).toHaveText('3 episodes on this PC')
  // Auto-delete: a watched download goes away once another episode plays, not before
  await page.evaluate(() => localStorage.setItem('dlAutoDelete', '1'))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('nr-watched', { detail: { key: 'series:series1:/ep/3' } })))
  expect(await page.evaluate(() => (window as any).__dl.items.length)).toBe(3)
  await page.locator('.episodecell').nth(5).locator('.episodecard').click()
  await expect.poll(() => page.evaluate(() => (window as any).__dl.items.map((x: any) => x.episodeUrl))).toEqual(['/ep/4', '/ep/5'])
})

test('report a problem: versions, sources and logs copied from Settings and from an error', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__reportPatch = {
      reportCollect: async () => ({ app: '0.5.0', electron: '38.0.0', os: 'Windows_NT 10.0.26100 x64', memoryMB: 16000, freeMB: 8000, uptimeMin: 12, locale: 'fr', engine: { running: true, tag: 'v0.2.9-novelreader' }, mainLogs: ['10:00:00 WARN [downloads] candidate failed'], engineLogs: ['10:00:01 ERR Hoster error: timeout'] }),
      reportRedact: async (t: string) => t.replace(/C:\\Users\\ali/g, '~'),
      reportCopy: async (t: string) => { w.__copied = t; return true },
      reportSave: async () => 'C:/Users/x/Desktop/report.txt'
    }
  })
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'settings' })
  await page.evaluate(() => { Object.assign((window as any).novelReader, (window as any).__reportPatch); console.warn('player stalled at C:\\Users\\ali\\x') })
  await page.locator('.sidebar .nav-item', { hasText: 'Library' }).first().click()
  await page.locator('.sidebar').getByText('Settings').click()
  const panel = page.locator('.report-panel')
  await panel.locator('.report-what').fill('Spider-Man does not start')
  await panel.getByRole('button', { name: 'Copy the report' }).click()
  await expect(panel).toContainText('Report copied')
  const text = await page.evaluate(() => (window as any).__copied as string)
  expect(text).toContain('What happened: Spider-Man does not start')
  expect(text).toContain('App: 0.5.0 · Electron 38.0.0 · Windows_NT 10.0.26100 x64')
  expect(text).toContain('Video engine: running · v0.2.9-novelreader')
  expect(text).toContain('--- Installed video sources (3) ---')
  expect(text).toContain('LaMovie')
  expect(text).toContain('WARN player stalled at ~')
  expect(text).toContain('Hoster error: timeout')
  await panel.getByRole('button', { name: 'Preview' }).click()
  await expect(panel.locator('.report-preview')).toHaveValue(/NovelReader problem report/)
})
