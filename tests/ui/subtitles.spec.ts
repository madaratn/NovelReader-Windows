import { test, expect } from '@playwright/test'
import { setup } from './helpers'

const VTT = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nHello there\nfriend\n\n2\n00:00:04.000 --> 00:00:06.000\n<i>Run!</i>\n'

async function open(page: any, storage: Record<string, string> = {}) {
  await setup(page, { storage: { mode: 'series', 'lastPage:series': 'series', seriesLibrary: JSON.stringify([{ id: 'series1', name: 'Lanterns', sourceId: '42', sourceName: 'Mapple', url: '/series/1', episodes: 2, addedAt: Date.now() }]), ...storage } })
  await page.route('http://127.0.0.1:4567/api/v1/proxy**', (r: any) => r.request().url().includes('en.vtt') ? r.fulfill({ status: 200, body: VTT, headers: { 'Content-Type': 'text/vtt', 'Access-Control-Allow-Origin': '*' } }) : r.fulfill({ status: 404 }))
  await page.addInitScript(() => {
    const w = window as any, base = w.novelReader
    w.__tr = []
    w.novelReader = {
      ...base,
      miwayomiStatus: async () => ({ online: true }),
      translate: async (o: any) => { w.__tr.push(o); return o.texts.map((x: string) => '[' + o.to + '] ' + x) },
      miwayomiFetch: async (path: string) => {
        if (path.includes('/details')) return { title: 'Lanterns' }
        if (path.includes('/episodes')) return [{ name: 'S1 E1', url: '/ep/1', episode_number: 1 }, { name: 'S1 E2', url: '/ep/2', episode_number: 2 }]
        if (path.includes('/videos')) return [{ videoUrl: 'https://cdn.test/a.mp4', videoTitle: 'Zeus - 720p', headers: {}, subtitleTracks: [{ url: 'https://cdn.test/en.vtt', lang: 'English' }], audioTracks: [] }]
        return []
      }
    }
  })
  await page.goto('/')
  await page.locator('.libcard', { hasText: 'Lanterns' }).getByRole('button', { name: 'Show episodes' }).click()
  await page.locator('.episodecell').first().locator('.episodecard').click()
}
const cues = (page: any) => page.evaluate(() => { const v = document.querySelector('.media-player-top video') as HTMLVideoElement; const tr = [...v.textTracks].find(t => t.mode === 'showing'); return tr && tr.cues ? [...tr.cues].map((c: any) => c.text) : null })

test('translate the subtitles of an episode; timings and line breaks kept', async ({ page }) => {
  await open(page)
  await page.getByTitle('Subtitle style').click()
  await page.getByRole('button', { name: 'Translate into English' }).click()
  await expect(page.locator('.sub-translate')).toContainText('Translated subtitles shown')
  await expect.poll(() => cues(page)).toEqual(['[en] Hello there\nfriend', '[en] <i>Run!</i>'])
  const sent = await page.evaluate(() => (window as any).__tr[0])
  expect(sent).toEqual({ texts: ['Hello there<br>friend', '<i>Run!</i>'], to: 'en' })
})

test('automatic translation when no subtitle is in the chosen language', async ({ page }) => {
  await open(page, { subAutoTranslate: '1', translateTo: 'fr' })
  await expect.poll(() => cues(page)).toEqual(['[fr] Hello there\nfriend', '[fr] <i>Run!</i>'])
})

test('choose the subtitle language (French, English, Arabic…) for the translation', async ({ page }) => {
  await open(page)
  await page.getByTitle('Subtitle style').click()
  await page.locator('.sub-translate select').selectOption('ar')
  await page.getByRole('button', { name: 'Translate into العربية' }).click()
  await expect.poll(() => cues(page)).toEqual(['[ar] Hello there\nfriend', '[ar] <i>Run!</i>'])
  // Automatic translation follows the chosen language
  await page.locator('.sub-auto input').check()
  await page.locator('.sub-translate select').selectOption('fr')
  await expect.poll(() => cues(page)).toEqual(['[fr] Hello there\nfriend', '[fr] <i>Run!</i>'])
})
