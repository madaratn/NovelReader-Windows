import { test, expect, type Page } from '@playwright/test'
import { setup, nav } from './helpers'

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
        if (path.includes('/sources')) return { anime: [{ id: '42', name: 'Mapple', lang: 'en', pkg: 'mapple' }, { id: '43', name: 'LaMovie', lang: 'es', pkg: 'lamovie' }, { id: '44', name: 'Partial', lang: 'en', pkg: 'partial' }, { id: '45', name: 'Gogoanime', lang: 'en', pkg: 'gogo' }] }
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
  await page.locator('.libcard', { hasText: 'The Bear' }).locator('.more-btn').click().then(()=>page.locator('.libcard', { hasText: 'The Bear' }).locator('.shelfselect').selectOption('dropped'))
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
  // A stream that really plays: otherwise the player moves on to another server
  // when this one fails, and the intro button goes with it.
  const clip = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'clip.webm'))
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', r => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
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
  // While it plays, the video is the first block of the page (above the poster and the facts), in view.
  const playerBox = await page.locator('.media-player-top').boundingBox(), heroBox = await page.locator('.media-hero').boundingBox()
  expect(playerBox!.y).toBeLessThan(heroBox!.y)
  await expect(page.locator('.media-player-top .remote-player')).toBeInViewport()
  await page.locator('.player-skip').click()
  await expect.poll(() => page.locator('.remote-player video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(0)
})

test('advertisement escape switches to another playable stream', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')])
  })
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.media-hero .primary').click()
  const quality = page.locator('.player-trackbar label', { hasText: 'Quality' }).locator('select')
  await expect(quality).toBeVisible()
  const selected = await quality.locator('option:checked').textContent()
  await page.getByRole('button', { name: 'Ad instead of episode?' }).click()
  await expect.poll(() => quality.locator('option:checked').textContent()).not.toBe(selected)
  await expect(page.locator('.remote-player')).not.toContainText('No other stream is available here')
})

test('advertisement escape explains when the only stream is affected', async ({ page }) => {
  await openVideo(page, {
    mode: 'series', 'lastPage:series': 'series',
    seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')])
  })
  await page.evaluate(() => {
    const w = window as any
    const original = w.novelReader.miwayomiFetch
    w.novelReader.miwayomiFetch = async (path: string, ...args: any[]) => {
      const result = await original(path, ...args)
      return path.includes('/videos') ? result.slice(0, 1) : result
    }
  })
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.media-hero .primary').click()
  await page.getByRole('button', { name: 'Ad instead of episode?' }).click()
  await expect(page.locator('.remote-player')).toContainText('No other stream is available here')
})

test('video sources: test installed sources and remove the dead one', async ({ page }) => {
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'animeSources' })
  await page.getByRole('button', { name: 'Test my sources' }).click()
  await expect(page.locator('.source-health .engine-row p')).toContainText('1 working, 1 partly working, 1 not responding.')
  // Full chain: list, episodes, streams of one title
  await expect(page.locator('.health-row.ok')).toContainText('List ✓ · Episodes ✓ · Streams ✓ (2)')
  await expect(page.locator('.health-row.ok .health-state')).toHaveText('Plays')
  await expect(page.locator('.health-row.warn')).toContainText('List ✓ · Episodes ✗ · Streams ✗')
  // In plain words, with the technical message on hover.
  await expect(page.locator('.health-row.warn .source-advice')).toContainText('The site changed and the source no longer reads it.')
  await expect(page.locator('.health-row.warn .source-advice')).toHaveAttribute('title', /No episode/)
  // Remembered, and dead sources are skipped by the fallback search
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('videoSourceHealth') || '{}'))
  expect(saved.lamovie.state).toBe('dead'); expect(saved.lamovie.sourceIds).toEqual(['43']); expect(saved.mapple.state).toBe('ok')
  const dead = page.locator('.health-row.dead')
  await expect(dead).toContainText('LaMovie')
  await expect(dead.locator('.source-advice')).toContainText('The site no longer exists')
  await expect(dead.locator('.source-advice')).toHaveAttribute('title', 'Hôte inconnu (la.movie)')
  await page.getByRole('button', { name: 'Remove 1 dead source' }).click()
  await page.getByRole('button', { name: 'Yes, uninstall' }).click()
  await expect(page.locator('.health-row')).toHaveCount(2)
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('videoSourceHealth') || '{}')).sort())).toEqual(['mapple', 'partial'])
  await expect.poll(() => page.evaluate(() => (window as any).__engine.calls.some((c: string) => c === 'POST /api/v1/extensions/uninstall'))).toBe(true)
})

test('anime source pack: installs the recommended anime sources that worked in the weekly check', async ({ page }) => {
  const index = [
    { name: 'Aniyomi: Hianimes', pkg: 'p.hianimes', apk: 'hianimes.apk', lang: 'en' },
    { name: 'Aniyomi: Gogoanime', pkg: 'p.gogo', apk: 'gogo.apk', lang: 'en' },
    { name: 'Aniyomi: AnimeKai (Unoriginal)', pkg: 'p.kai', apk: 'kai.apk', lang: 'en' },
    { name: 'Aniyomi: Anikoto', pkg: 'p.anikoto', apk: 'anikoto.apk', lang: 'all' },
    { name: 'Aniyomi: Vostfree', pkg: 'p.vostfree', apk: 'vostfree.apk', lang: 'fr' },
    { name: 'Aniyomi: MovieBox', pkg: 'p.moviebox', apk: 'moviebox.apk', lang: 'all' }
  ]
  await page.route('**/index.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(index) }))
  await page.addInitScript((idx: any[]) => { (window as any).__repoIndex = idx }, index)
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'animeSources', animeRepos: JSON.stringify([{ name: 'Test repo', url: 'https://raw.githubusercontent.com/test/anime-repo/repo/index.min.json', enabled: true }]), sourceScan: JSON.stringify({ at: new Date().toISOString(), results: [{ name: 'Anikoto', pkg: 'p.anikoto', lang: 'all', repo: 'x', state: 'partial', detail: 'no stream' }, { name: 'Hianimes', pkg: 'p.hianimes', lang: 'en', repo: 'x', state: 'ok', detail: '6 streams' }] }), sourceScanFetched: String(Date.now()) })
  await page.evaluate(() => { const w = window as any, f = w.novelReader.miwayomiFetch; w.__installs = []; w.novelReader.miwayomiFetch = async (p: string, m?: string, b?: any) => { if (p.startsWith('/api/v1/extensions/repo')) return w.__repoIndex; if (p === '/api/v1/extensions/install') { w.__installs.push(b.apk); return { ok: true } } return f(p, m, b) } })
  await page.getByRole('button', { name: 'Install the anime pack' }).click()
  await expect(page.locator('.anime-toast')).toContainText('Source pack ready: 3 sources installed or already available.')
  expect((await page.evaluate(() => (window as any).__installs)).sort()).toEqual(['gogo.apk', 'hianimes.apk', 'kai.apk']) // Anikoto failed the check, Vostfree is French, MovieBox is not anime
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
  await page.locator('.resultcard', { hasText: 'Severance' }).getByRole('button', { name: '＋ Add', exact: true }).click()
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

test('background check: NovelReader in front shows the new episodes in the app', async ({ page }) => {
  await openVideo(page, { episodeCheckDelay: '1500', mode: 'books', seriesLibrary: JSON.stringify([item('series', 0, 'The Bear')]) })
  await page.evaluate(() => { (window as any).__engine.episodes = 10; document.hasFocus = () => true })
  const toast = page.locator('.new-eps-toast')
  await expect(toast).toContainText('1 title has new episodes.', { timeout: 15_000 })
  await expect(toast).toContainText('The Bear')
  expect(await page.evaluate(() => (window as any).__notes || [])).toEqual([]) // no system notification in front
  await toast.getByRole('button', { name: 'See' }).click()
  await expect(page.locator('.libcard', { hasText: 'The Bear' })).toBeVisible()
  await expect(toast).toHaveCount(0)
})

test('discover: watch a title without adding it, then add it from its page', async ({ page }) => {
  await openVideo(page, { mode: 'series', 'lastPage:series': 'seriesDiscover', seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns')]) })
  await page.locator('.resultcard', { hasText: 'Severance' }).getByRole('button', { name: '▶ Watch' }).click()
  await expect(page.locator('.media-hero')).toBeVisible() // the title page (its name comes from the source's details)
  const bar = page.locator('.preview-bar')
  await expect(bar).toContainText('Not in your library')
  const ids = () => page.evaluate(() => JSON.parse(localStorage.getItem('seriesLibrary') || '[]').map((x: any) => x.id))
  expect(await ids()).toEqual(['series1'])
  // Back returns to the results, not to the library.
  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.locator('h1')).toHaveText('Discover')
  await page.locator('.resultcard', { hasText: 'Severance' }).getByRole('button', { name: '▶ Watch' }).click()
  await bar.getByRole('button', { name: '＋ Add to library' }).click()
  await expect(bar).toHaveCount(0)
  await expect(page.getByRole('button', { name: '← Series Library' })).toBeVisible()
  expect(await ids()).toEqual(['series:42:/s/sev', 'series1']) // same id as when watched: progress kept
})

test('opening a title whose source gives no episode list uses another source it was found on', async ({ page }) => {
  // Source 44 answers with an empty list; the same title was also found on 42.
  await openVideo(page, { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([item('series', 1, 'Lanterns', { sourceId: '44', sourceName: 'Partial', alternates: [{ sourceId: '42', sourceName: 'Mapple', url: '/series/1' }] })]) })
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await expect(page.locator('.episodecell')).toHaveCount(8)
  await expect(page.locator('main')).toContainText('The usual source did not answer: opened from Mapple.')
})

test('sources page: a failing source says why in plain words and what to do', async ({ page }) => {
  await openVideo(page, { mode: 'series', 'lastPage:series': 'series', videoSourceHealth: JSON.stringify({ lamovie: { name: 'LaMovie', state: 'dead', error: 'list: Miwayomi HTTP 500 — Hôte inconnu UnknownHostException la.movie', at: Date.now() }, partial: { name: 'Partial', state: 'warn', error: 'no stream for the first episode', at: Date.now() } }) })
  await nav(page, 'Sources')
  await expect(page.locator('.health-row', { hasText: 'LaMovie' }).locator('.source-advice')).toContainText('The site no longer exists')
  await expect(page.locator('.health-row', { hasText: 'Partial' }).locator('.source-advice')).toContainText('gives no video')
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
  await nav(page, 'Downloads')
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
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'settings', settingsTab: 'about' })
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

test('AniList: finished episode updates the AniList progress; the AniList list leads to a source search', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__al = []
    w.__alPatch = {
      anilistStatus: async () => ({ clientId: '123', connected: true, user: { id: 7, name: 'ali' }, expiresAt: 0 }),
      anilistCall: async (name: string, vars: any) => {
        w.__al.push({ name, vars })
        if (name === 'search') return { Page: { media: [{ id: 99, title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End' }, episodes: 28 }, { id: 5, title: { romaji: 'Lanterns' }, episodes: 8 }] } }
        if (name === 'entry') return { Media: { id: vars.id, episodes: 8, mediaListEntry: { status: 'CURRENT', progress: 2 } } }
        if (name === 'save') return { SaveMediaListEntry: { id: 1, ...vars } }
        if (name === 'list') return { MediaListCollection: { lists: [{ entries: [{ status: 'CURRENT', progress: 3, media: { id: 99, title: { romaji: 'Sousou no Frieren' }, episodes: 28 } }] }] } }
      }
    }
  })
  await openVideo(page, {
    mode: 'anime', 'lastPage:anime': 'anime', animeLibrary: JSON.stringify([item('anime', 1, 'Lanterns')]),
    'lastEpInfo:anime1': JSON.stringify({ url: '/ep/3', name: 'E3', n: 3, at: Date.now() })
  })
  await page.evaluate(() => Object.assign((window as any).novelReader, (window as any).__alPatch))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('nr-watched', { detail: { key: 'anime:anime1:/ep/3' } })))
  await expect.poll(() => page.evaluate(() => (window as any).__al.map((c: any) => c.name))).toEqual(['search', 'entry', 'save'])
  const save = await page.evaluate(() => (window as any).__al[2].vars)
  expect(save).toEqual({ mediaId: 5, progress: 3, status: 'CURRENT' }) // exact title match wins over the first result
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('animeLibrary') || '[]')[0].anilistId)).toBe(5)
  // Settings: the AniList list, and a title searched in the sources
  await page.locator('.sidebar').getByText('Settings').click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  const panel = page.locator('.anilist-panel')
  await expect(panel).toContainText('Connected to AniList')
  await expect(panel).toContainText('AniList: Lanterns → episode 3')
  await panel.getByRole('button', { name: 'Show my AniList list' }).click()
  await panel.locator('.anilist-row').getByRole('button', { name: 'Find in my sources' }).click()
  await expect(page.locator('main .searchbar input, main input').first()).toHaveValue('Sousou no Frieren')
})

test('MyAnimeList: finished episode updates the MAL progress; the MAL list leads to a source search', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__mal = []
    w.__malPatch = {
      malStatus: async () => ({ clientId: 'abcdef0123456789abcdef0123456789', hasSecret: false, connected: true, user: { id: 7, name: 'ali' }, expiresAt: 0 }),
      malCall: async (name: string, vars: any) => {
        w.__mal.push({ name, vars })
        if (name === 'search') return { data: [{ node: { id: 52991, title: 'Sousou no Frieren', alternative_titles: { en: 'Frieren' } } }, { node: { id: 5, title: 'Lanterns', alternative_titles: { synonyms: [] } } }] }
        if (name === 'entry') return { id: vars.id, num_episodes: 3, my_list_status: { status: 'watching', num_episodes_watched: 2 } }
        if (name === 'save') return { status: vars.status, num_episodes_watched: vars.episodes }
        if (name === 'list') return [{ node: { id: 52991, title: 'Sousou no Frieren', num_episodes: 28 }, list_status: { status: 'watching', num_episodes_watched: 4 } }]
      }
    }
  })
  await openVideo(page, {
    mode: 'anime', 'lastPage:anime': 'anime', animeLibrary: JSON.stringify([item('anime', 1, 'Lanterns')]),
    'lastEpInfo:anime1': JSON.stringify({ url: '/ep/3', name: 'E3', n: 3, at: Date.now() })
  })
  await page.evaluate(() => Object.assign((window as any).novelReader, (window as any).__malPatch))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('nr-watched', { detail: { key: 'anime:anime1:/ep/3' } })))
  await expect.poll(() => page.evaluate(() => (window as any).__mal.map((c: any) => c.name))).toEqual(['search', 'entry', 'save'])
  expect(await page.evaluate(() => (window as any).__mal[2].vars)).toEqual({ id: 5, episodes: 3, status: 'completed' }) // last episode: completed
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('animeLibrary') || '[]')[0].malId)).toBe(5)
  // A second time: the stored id is used, no new search
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('nr-watched', { detail: { key: 'anime:anime1:/ep/3' } })))
  await expect.poll(() => page.evaluate(() => (window as any).__mal.length)).toBe(5)
  expect(await page.evaluate(() => (window as any).__mal[3].name)).toBe('entry')
  await page.locator('.sidebar').getByText('Settings').click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  const panel = page.locator('.mal-panel')
  await expect(panel).toContainText('Connected to MyAnimeList')
  await expect(panel).toContainText('MyAnimeList: Lanterns → episode 3')
  await panel.getByRole('button', { name: 'Show my MyAnimeList list' }).click()
  await expect(panel.locator('.anilist-row')).toContainText('Episode 4 / 28')
  await panel.locator('.anilist-row').getByRole('button', { name: 'Find in my sources' }).click()
  await expect(page.locator('main .searchbar input, main input').first()).toHaveValue('Sousou no Frieren')
})

test('MyAnimeList: sign-in steps shown when not connected', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__malPatch = { malStatus: async () => ({ clientId: '', hasSecret: false, connected: false, user: null, expiresAt: 0 }), malLogin: async (id: string) => { (window as any).__login = id; return { clientId: id, hasSecret: false, connected: true, user: { id: 1, name: 'ali' }, expiresAt: 0 } } } })
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'anime' })
  await page.evaluate(() => Object.assign((window as any).novelReader, (window as any).__malPatch))
  await page.locator('.sidebar').getByText('Settings').click()
  await page.locator('.settings-tabs').getByRole('tab', { name: 'Library & sync' }).click()
  const panel = page.locator('.mal-panel')
  await expect(panel).toContainText('http://localhost/novelreader-mal')
  const btn = panel.getByRole('button', { name: 'Sign in with MyAnimeList' })
  await expect(btn).toBeDisabled()
  await panel.getByLabel('MyAnimeList client ID').fill('abcdef0123456789abcdef0123456789')
  await btn.click()
  await expect(panel).toContainText('Connected to MyAnimeList')
  expect(await page.evaluate(() => (window as any).__login)).toBe('abcdef0123456789abcdef0123456789')
})

test('sections: anime sources only in Anime, movie/series sources in Series and Movies, series titles not in Movies', async ({ page }) => {
  await openVideo(page, { mode: 'movies', 'lastPage:movies': 'movieDiscover' })
  const options = () => page.locator('.discover-bar select option').allInnerTexts()
  await expect.poll(options).toEqual(['Mapple (EN)', 'LaMovie (ES)', 'Partial (EN)'])
  // A title whose address says it is a series is not listed in Movies
  await expect(page.locator('.media-discover .resultcard h3')).toHaveText(['Severance'])
  await page.locator('.mode-switch').getByRole('tab', { name: /Anime/ }).click()
  await page.locator('.sidebar .nav-item', { hasText: 'Discover' }).click()
  await expect.poll(options).toEqual(['Partial (EN)', 'Gogoanime (EN)'])
  // The Sources page shows each source's sections; adding Anime to Mapple
  await page.locator('.sidebar .nav-item', { hasText: 'Sources' }).click()
  const mapple = page.locator('.health-row', { hasText: 'Mapple' })
  await expect(mapple.locator('.sec-chip.on')).toHaveText(['Series', 'Movies'])
  await mapple.getByRole('button', { name: 'Anime' }).click()
  await expect(mapple.locator('.sec-chip.on')).toHaveText(['Anime', 'Series', 'Movies'])
  await page.locator('.sidebar .nav-item', { hasText: 'Discover' }).click()
  await expect.poll(options).toContain('Mapple (EN)')
})

test('weekly source check: shown for sources not tested on this PC', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__scan = { at: '2026-11-02T03:20:00Z', results: [{ name: 'Mapple', pkg: 'mapple', lang: 'en', repo: 'r', state: 'ok', detail: '2 streams' }, { name: 'LaMovie', pkg: 'lamovie', lang: 'es', repo: 'r', state: 'dead', detail: 'host unknown' }] } })
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'anime' })
  await page.evaluate(() => { (window as any).novelReader.sourceStatus = async () => (window as any).__scan })
  await page.locator('.sidebar .nav-item', { hasText: 'Sources' }).click()
  await expect(page.locator('.health-row', { hasText: 'Mapple' }).locator('.scan-line')).toContainText('✓ Weekly check')
  await expect(page.locator('.health-row', { hasText: 'Mapple' }).locator('.scan-line')).toContainText('plays videos')
  await expect(page.locator('.health-row', { hasText: 'LaMovie' }).locator('.scan-line.dead')).toContainText('not responding')
})

test('languages for videos, as in Books: search only the chosen languages', async ({ page }) => {
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'animeSearch' })
  await page.evaluate(() => {
    const w = window as any, f = w.novelReader.miwayomiFetch
    w.__searched = []
    w.novelReader.miwayomiFetch = async (p: string, m?: string, b?: any) => {
      if (p === '/api/v1/sources') return { anime: [{ id: '50', name: 'Hianimes', lang: 'en' }, { id: '51', name: 'Vostfree', lang: 'fr' }, { id: '52', name: 'AnimeFLV', lang: 'es' }, { id: '53', name: 'AnimeXin', lang: 'all' }] }
      const sid = /\/anime\/(\d+)\/search/.exec(p)?.[1]
      if (sid) { w.__searched.push(sid); return [{ title: 'Naruto', url: '/n/' + sid, thumbnail_url: 'https://img.test/n.jpg' }] }
      return f(p, m, b)
    }
  })
  // Reopen the page so the chips load the sources above
  await page.locator('.sidebar').getByText('Anime Library').click()
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  const bar = page.locator('.langbar')
  await expect(bar.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(bar.getByRole('button', { name: /Multi/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(bar.getByRole('button', { name: /Español/ })).toHaveAttribute('aria-pressed', 'false')
  await expect(bar).toContainText('2 sources selected')
  await bar.getByRole('button', { name: /Français/ }).click()
  await page.locator('.search-main input').fill('Naruto')
  await page.locator('.search-main input').press('Enter')
  await expect(page.locator('.resultcard')).toHaveCount(1)
  expect((await page.evaluate(() => (window as any).__searched)).sort()).toEqual(['50', '51', '53'])
  await expect(page.locator('.resultcard .result-langs')).toContainText('English')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mediaLangs:Anime') || '[]').sort())).toEqual(['all', 'en', 'fr'])
})

test('video source catalog: language chips like Books', async ({ page }) => {
  const index = [
    { name: 'Aniyomi: Hianimes', pkg: 'p.h', apk: 'h.apk', lang: 'en' },
    { name: 'Aniyomi: AnimeXin', pkg: 'p.x', apk: 'x.apk', lang: 'all' },
    { name: 'Aniyomi: AnimeFLV', pkg: 'p.f', apk: 'f.apk', lang: 'es' },
    { name: 'Aniyomi: Anime-Sama', pkg: 'p.s', apk: 's.apk', lang: 'fr' }
  ]
  await page.route('**/index.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(index) }))
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'animeSources', animeRepos: JSON.stringify([{ name: 'Test repo', url: 'https://raw.githubusercontent.com/test/anime-repo/repo/index.min.json', enabled: true }]) })
  // Repositories and their catalogue are in the closed "Advanced" block.
  await page.locator('.sources-advanced summary').click()
  await page.getByRole('button', { name: 'Load all sources' }).click()
  const bar = page.locator('.langbar')
  await expect(bar).toContainText('2 sources shown')
  await expect(page.locator('.anime-source-list')).toContainText('Hianimes')
  await expect(page.locator('.anime-source-list')).not.toContainText('AnimeFLV')
  await bar.getByRole('button', { name: /Español/ }).click()
  await expect(page.locator('.anime-source-list')).toContainText('AnimeFLV')
  await bar.getByRole('button', { name: 'All languages' }).click()
  await expect(bar).toContainText('4 sources shown')
})

test('Turkish series pack: installs the sources that have Turkish series (international, Arabic, Turkish)', async ({ page }) => {
  const index = [
    { name: 'Aniyomi: OneTouch TV', pkg: 'p.one', apk: 'one.apk', lang: 'en' },
    { name: 'Aniyomi: Egy Dead', pkg: 'p.egy', apk: 'egy.apk', lang: 'ar' },
    { name: 'Aniyomi: HDFilmCehennemi', pkg: 'p.hdf', apk: 'hdf.apk', lang: 'tr', nsfw: 1 },
    { name: 'Aniyomi: Torrentio (Torrent / Debrid)', pkg: 'p.tor', apk: 'tor.apk', lang: 'all' },
    { name: 'Aniyomi: Hianimes', pkg: 'p.h', apk: 'h.apk', lang: 'en' },
    { name: 'Aniyomi: Gnula', pkg: 'p.g', apk: 'g.apk', lang: 'es' }
  ]
  await page.route('**/index.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(index) }))
  await page.addInitScript((idx: any[]) => { (window as any).__repoIndex = idx }, index)
  await openVideo(page, { mode: 'series', 'lastPage:series': 'seriesSources', animeRepos: JSON.stringify([{ name: 'Test repo', url: 'https://raw.githubusercontent.com/test/anime-repo/repo/index.min.json', enabled: true }]) })
  await page.evaluate(() => { const w = window as any, f = w.novelReader.miwayomiFetch; w.__installs = []; w.novelReader.miwayomiFetch = async (p: string, m?: string, b?: any) => { if (p.startsWith('/api/v1/extensions/repo')) return w.__repoIndex; if (p === '/api/v1/extensions/install') { w.__installs.push(b.apk); return { ok: true } } return f(p, m, b) } })
  await page.getByRole('button', { name: 'Install the Turkish pack' }).click()
  await expect(page.locator('.anime-toast')).toContainText('Source pack ready: 4 sources installed or already available.')
  expect((await page.evaluate(() => (window as any).__installs)).sort()).toEqual(['egy.apk', 'hdf.apk', 'one.apk', 'tor.apk'])
})

test('Arabic pack: installs the Arabic film and series sites only', async ({ page }) => {
  const index = [
    { name: 'Aniyomi: Arab Seed', pkg: 'p.as', apk: 'as.apk', lang: 'ar' },
    { name: 'Aniyomi: FASELHD', pkg: 'p.fa', apk: 'fa.apk', lang: 'ar' },
    { name: 'Aniyomi: Tuktuk Cinema', pkg: 'p.tu', apk: 'tu.apk', lang: 'ar' },
    { name: 'Aniyomi: Cimaleek', pkg: 'p.ci', apk: 'ci.apk', lang: 'ar' },
    { name: 'Aniyomi: Egy Dead', pkg: 'p.egy', apk: 'egy.apk', lang: 'ar' },
    { name: 'Aniyomi: Anime4up', pkg: 'p.a4', apk: 'a4.apk', lang: 'ar' },
    { name: 'Aniyomi: OneTouch TV', pkg: 'p.one', apk: 'one.apk', lang: 'en' }
  ]
  await page.route('**/index.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(index) }))
  await page.addInitScript((idx: any[]) => { (window as any).__repoIndex = idx }, index)
  await openVideo(page, { mode: 'movies', 'lastPage:movies': 'movieSources', animeRepos: JSON.stringify([{ name: 'Test repo', url: 'https://raw.githubusercontent.com/test/anime-repo/repo/index.min.json', enabled: true }]) })
  await page.evaluate(() => { const w = window as any, f = w.novelReader.miwayomiFetch; w.__installs = []; w.novelReader.miwayomiFetch = async (p: string, m?: string, b?: any) => { if (p.startsWith('/api/v1/extensions/repo')) return w.__repoIndex; if (p === '/api/v1/extensions/install') { w.__installs.push(b.apk); return { ok: true } } return f(p, m, b) } })
  await page.getByRole('button', { name: 'Install the Arabic pack' }).click()
  await expect(page.locator('.anime-toast')).toContainText('Source pack ready: 5 sources installed or already available.')
  expect((await page.evaluate(() => (window as any).__installs)).sort()).toEqual(['as.apk', 'ci.apk', 'egy.apk', 'fa.apk', 'tu.apk'])
})

test('episode list in order: seasons then episodes, whatever the language of the names or the source order', async ({ page }) => {
  await openVideo(page, { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([item('series', 1, 'Kara Sevda')]) })
  await page.evaluate(() => {
    const w = window as any, f = w.novelReader.miwayomiFetch
    w.novelReader.miwayomiFetch = async (p: string, m?: string, b?: any) => {
      if (p.includes('/episodes')) return ['Kara Sevda 2. Sezon 10. Bölüm', 'Kara Sevda 2. Sezon 2. Bölüm', 'Kara Sevda 1. Sezon 12. Bölüm', 'Kara Sevda 1. Sezon 1. Bölüm', 'Kara Sevda 1. Sezon 2. Bölüm', 'Kara Sevda 2. Sezon 1. Bölüm'].map((name, i) => ({ name, url: '/ep/' + i, episode_number: -1 }))
      return f(p, m, b)
    }
  })
  await page.locator('.libcard', { hasText: 'Kara Sevda' }).getByRole('button', { name: 'Show episodes' }).click()
  const order = async () => (await page.locator('.episodecell').allInnerTexts()).map(n => /(\d+)\. Sezon (\d+)\. Bölüm/.exec(n)?.slice(1).join('x'))
  // One season at a time, starting with the one being watched
  await expect(page.locator('.season-chips .chip.on')).toContainText('Season 1')
  expect(await order()).toEqual(['1x1', '1x2', '1x12'])
  await page.locator('.season-chips').getByRole('tab', { name: /Season 2/ }).click()
  expect(await order()).toEqual(['2x1', '2x2', '2x10'])
  // All seasons, with a heading per season
  await page.locator('.season-chips').getByRole('tab', { name: 'All seasons' }).click()
  expect(await order()).toEqual(['1x1', '1x2', '1x12', '2x1', '2x2', '2x10'])
  await expect(page.locator('.season-head')).toHaveText(['Season 1', 'Season 2'])
  // Last to first (remembered)
  await page.getByRole('button', { name: '↑ First to last' }).click()
  expect(await order()).toEqual(['2x10', '2x2', '2x1', '1x12', '1x2', '1x1'])
  expect(await page.evaluate(() => localStorage.getItem('epOrder'))).toBe('desc')
})

test('sources broken for more than 10 days are set aside from searches, listed in Sources, and can be used anyway', async ({ page }) => {
  const day = 86400e3
  await openVideo(page, { mode: 'anime', 'lastPage:anime': 'mediaSearch', 'mediaLangs:Anime': JSON.stringify(['en', 'fr']),
    // Vostfree: seen broken 12 days ago. AnimeFLV: broken since yesterday only. Gone: was broken, works again in the new check.
    deadSources: JSON.stringify({ vostfree: Date.now() - 12 * day, gone: Date.now() - 30 * day }) })
  await page.goto('/')
  await page.evaluate(async () => {
    const w = window as any, f = w.novelReader.miwayomiFetch
    w.__searched = []
    w.novelReader.sourceStatus = async () => ({ at: new Date().toISOString(), results: [
      { name: 'Hianimes', pkg: 'p.hi', lang: 'en', repo: 'r', state: 'ok', detail: '' },
      { name: 'Vostfree', pkg: 'p.vf', lang: 'fr', repo: 'r', state: 'dead', detail: 'no stream' },
      { name: 'AnimeFLV', pkg: 'p.flv', lang: 'en', repo: 'r', state: 'dead', detail: 'no stream' },
      { name: 'Gone', pkg: 'p.gone', lang: 'en', repo: 'r1', state: 'dead', detail: '' }, { name: 'Gone', pkg: 'p.gone', lang: 'en', repo: 'r2', state: 'ok', detail: '' }] })
    w.novelReader.miwayomiFetch = async (p: string, m?: string, b?: any) => {
      if (p === '/api/v1/sources') return { anime: [{ id: '50', name: 'Hianimes', lang: 'en' }, { id: '51', name: 'Vostfree', lang: 'fr' }, { id: '52', name: 'AnimeFLV', lang: 'en' }, { id: '54', name: 'Gone', lang: 'en' }] }
      const sid = /\/anime\/(\d+)\/search/.exec(p)?.[1]
      if (sid) { w.__searched.push(sid); return [{ title: 'Naruto', url: '/n/' + sid, thumbnail_url: 'https://img.test/n.jpg' }] }
      return f(p, m, b)
    }
  })
  // The new weekly check is read: "Gone" works again in one repository, so it is forgotten.
  await page.locator('.sidebar').getByText('Sources', { exact: true }).click()
  await expect(page.locator('.set-aside')).toContainText('1 source set aside')
  await expect(page.locator('.set-aside')).toContainText('Vostfree')
  await expect(page.locator('.set-aside')).not.toContainText('AnimeFLV')
  const tracked = await page.evaluate(() => JSON.parse(localStorage.getItem('deadSources') || '{}'))
  expect(Object.keys(tracked).sort()).toEqual(['animeflv', 'vostfree'])
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  await page.locator('.search-main input').fill('Naruto')
  await page.locator('.search-main input').press('Enter')
  await expect(page.locator('.resultcard')).toHaveCount(1)
  expect((await page.evaluate(() => (window as any).__searched)).sort()).toEqual(['50', '52', '54'])
  // "Use anyway" brings it back.
  await page.locator('.sidebar').getByText('Sources', { exact: true }).click()
  await page.locator('.set-aside').getByRole('button', { name: 'Use anyway' }).click()
  await expect(page.locator('.set-aside')).toHaveCount(0)
  await page.locator('.qs-open').click().then(()=>page.locator('.qs-all').click())
  await page.evaluate(() => { (window as any).__searched = [] })
  await page.locator('.search-main input').fill('Naruto')
  await page.locator('.search-main input').press('Enter')
  await expect.poll(async () => (await page.evaluate(() => (window as any).__searched)).sort()).toEqual(['50', '51', '52', '54'])
})
