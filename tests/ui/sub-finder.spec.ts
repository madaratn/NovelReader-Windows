import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setup } from './helpers'

const clip = fs.readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'))
async function open(page: any, storage: Record<string, string> = {}) {
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Rick and Morty', sourceId: '42', sourceName: 'Mapple', url: '/series/1', episodes: 2, addedAt: Date.now() }]), ...storage } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => r.fulfill({ status: 200, body: clip, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' } }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__subs = { search: [] as any[], chunks: [] as number[] }
    w.novelReader = { ...base,
      miwayomiStatus: async () => ({ online: true }),
      translate: async (o: any) => o.texts.map((x: string) => '[' + o.to + '] ' + x),
      miwayomiFetch: async (p: string) => {
        if (p.includes('/details')) return { title: 'Rick and Morty' }
        if (p.includes('/episodes')) return [{ name: 'S2 E3 - Auto Erotic', url: '/ep/1', episode_number: 3, season: 2 }]
        if (p.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.webm', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [], audioTracks: [] }]
        return []
      },
      subsSearch: async (o: any) => { w.__subs.search.push(o); if (!o.key) throw new Error('NO_KEY'); return { imdb: { id: 'tt2861424', title: 'Rick and Morty', year: 2013 }, results: [{ id: 'a', url: 'https://sub.test/fr', language: 'fr', display: 'French', release: 'Rick.and.Morty.S02E03.VFF', source: 'opensubtitles', format: 'srt', encoding: '', hi: false, downloads: 3 }, { id: 'b', url: 'https://sub.test/en', language: 'en', display: 'English', release: 'Rick.and.Morty.S02E03.WEB', source: 'subdl', format: 'srt', encoding: '', hi: false, downloads: 9 }] } },
      subsFetch: async (o: any) => 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n' + (o.url.endsWith('fr') ? 'Salut Morty' : 'Hi Morty') + '\n',
      subsAiReady: async () => false,
      subsAiPrepare: async () => { await new Promise(r => setTimeout(r, 200)); return true },
      onSubsAiProgress: () => () => {},
      subsAiChunk: async (o: any) => { w.__subs.chunks.push(o.start); return { language: 'ja', lines: [{ start: o.start + 1, end: o.start + 3, text: 'Konnichiwa ' + o.start }] } } }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Rick and Morty' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.episodecell').first().locator('.episodecard').click()
  await expect.poll(() => page.locator('.media-player-top video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
}
const cues = (page: any) => page.evaluate(() => { const v = document.querySelector('.media-player-top video') as HTMLVideoElement; const tr = [...v.textTracks].find(t => t.mode === 'showing'); return tr && tr.cues ? [...tr.cues].map((c: any) => c.text) : null })

test('find subtitles online for an episode (title, season, episode), pick one, it is shown', async ({ page }) => {
  await open(page, { wyzieKey: 'KEY', subAutoOnline: '0' })
  await page.getByRole('button', { name: /💬 Subtitles/ }).click()
  const box = page.locator('.sub-finder')
  await expect(box.locator('.sub-results li')).toHaveCount(2)
  expect(await page.evaluate(() => (window as any).__subs.search[0])).toEqual({ kind: 'series', title: 'Rick and Morty', season: 2, episode: 3, langs: ['en'], key: 'KEY' })
  await box.getByRole('button', { name: /Rick\.and\.Morty\.S02E03\.VFF/ }).click()
  await expect(box).toHaveCount(0)
  await expect.poll(() => cues(page)).toEqual(['Salut Morty'])
  await expect(page.locator('.player-trackbar select').filter({ has: page.locator('option', { hasText: 'Français · online' }) })).toHaveCount(1)
})

test('without a key: explains where to add it; the AI writes subtitles ahead of playback, translated', async ({ page }) => {
  await open(page, { subAutoOnline: '0' })
  await page.getByRole('button', { name: /💬 Subtitles/ }).click()
  const box = page.locator('.sub-finder')
  await expect(box).toContainText('add your free Wyzie Subs key in Settings › Subtitles')
  await box.getByRole('button', { name: 'Generate subtitles' }).click()
  await expect(box).toContainText(/lines written so far/, { timeout: 10_000 })
  // Pieces of 30 s from the current position, up to 90 s ahead
  await expect.poll(() => page.evaluate(() => (window as any).__subs.chunks)).toEqual([0])
  await expect.poll(() => cues(page)).toEqual(['[en] Konnichiwa 0'])
  await expect(page.locator('.player-trackbar select option:checked').filter({ hasText: 'AI · English' })).toHaveCount(1)
  // Another subtitle language: what was written is translated again, and the search uses it first
  await box.getByLabel('Subtitle language').selectOption('ar')
  await expect.poll(() => cues(page)).toEqual(['[ar] Konnichiwa 0'])
  await expect(page.locator('.player-trackbar select option:checked').filter({ hasText: 'AI · العربية' })).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('subTranslateTo'))).toBe('ar')
  await box.getByRole('button', { name: 'Stop the AI subtitles' }).click()
  await expect(box.getByRole('button', { name: 'Generate subtitles' })).toBeVisible()
})

test('settings: Wyzie key and AI options', async ({ page }) => {
  await setup(page, {})
  await page.goto('/')
  await page.locator('.sidebar').getByText('Settings').click()
  const block = page.locator('.sub-settings')
  await block.getByLabel('Wyzie Subs key').fill('abc123')
  await block.getByRole('button', { name: 'Save' }).click()
  await expect(block.getByRole('button', { name: '✓ Saved' })).toBeVisible()
  await block.getByLabel('When nothing is found, let the AI write them by itself').check()
  await block.getByRole('button', { name: 'More accurate (470 MB, slower)' }).click()
  expect(await page.evaluate(() => [localStorage.getItem('wyzieKey'), localStorage.getItem('aiSubAuto'), localStorage.getItem('aiSubSize')])).toEqual(['abc123', '1', 'small'])
})
