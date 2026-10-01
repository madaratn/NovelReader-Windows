import { test, expect } from '@playwright/test'
import { open } from './helpers'

// Local Videos: subtitles (list from the bridge, WebVTT attached as <track>)
// and audio tracks (real 2-audio MKV fixture, video.audioTracks).
const SUBS = [
  { id: 'mkv:4', source: 'embedded', label: '', lang: 'fre', codec: 'S_TEXT/UTF8', default: true, forced: false, supported: true },
  { id: 'mkv:5', source: 'embedded', label: 'English (signs)', lang: 'eng', codec: 'S_TEXT/ASS', default: false, forced: false, supported: true },
  { id: 'mkv:6', source: 'embedded', label: '', lang: 'jpn', codec: 'S_HDMV/PGS', default: false, forced: false, supported: false },
  { id: 'file:Movie.es.srt', source: 'file', label: '', lang: 'es', codec: 'srt', default: false, forced: false, supported: true, file: 'Movie.es.srt' },
]
const videos = [
  { relPath: 'Films/Movie.mkv', file: 'tracks.mkv', subtitles: SUBS },
  { relPath: 'Films/Movie 2.mkv', file: 'tracks.mkv', subtitles: SUBS.slice(0, 3) },
  { relPath: 'Films/Plain.webm' },
]
const showing = (page: any) => page.locator('.local-player video').evaluate((v: HTMLVideoElement) => {
  const tr = [...v.textTracks].find(t => t.mode === 'showing')
  return tr ? (tr.cues && tr.cues.length ? (tr.cues[0] as VTTCue).text : 'loading') : 'none'
})

test('subtitles: list, default track, switch, off, C key, remembered', async ({ page }) => {
  await open(page, { storage: { mode: 'anime', 'lastPage:anime': 'localVideos' }, videos })
  await page.locator('.localcard', { hasText: 'Movie.mkv' }).click()
  const sel = page.getByRole('combobox', { name: 'Subtitles' })
  await expect(sel.locator('option')).toHaveText(['Off', 'French', 'English (signs)', 'Japanese — pictures, cannot be shown', 'Spanish · file'])
  await expect(sel.locator('option', { hasText: 'Japanese' })).toHaveAttribute('disabled', '')
  // No preference yet: a subtitle file put next to the video wins
  await expect(sel).toHaveValue('file:Movie.es.srt')
  await expect.poll(() => showing(page)).toBe('Cue from file:Movie.es.srt')
  await sel.selectOption('mkv:4')
  await expect.poll(() => showing(page)).toBe('Cue from mkv:4')
  await sel.selectOption('')
  await expect.poll(() => showing(page)).toBe('none')
  // C cycles through the readable tracks
  await page.locator('main h1').click()
  await page.keyboard.press('c')
  await expect(sel).toHaveValue('mkv:4')
  await page.keyboard.press('c')
  await expect(sel).toHaveValue('mkv:5')
  await expect.poll(() => showing(page)).toBe('Cue from mkv:5')
  await expect(page.locator('.player-hint').last()).toContainText('C subtitles')
  // The next video uses the language picked last (English)
  await page.locator('.localcard', { hasText: 'Movie 2.mkv' }).click()
  await expect(sel).toHaveValue('mkv:5')
  // Back to the first one: its own choice is remembered
  await page.locator('.localcard', { hasText: 'Movie.mkv' }).first().click()
  await expect(sel).toHaveValue('mkv:5')
})

test('audio tracks: listed with their language, switched, preferred language reused', async ({ page }) => {
  await open(page, { storage: { mode: 'anime', 'lastPage:anime': 'localVideos' }, videos })
  await page.locator('.localcard', { hasText: 'Movie.mkv' }).click()
  const audio = page.getByRole('combobox', { name: 'Audio' })
  await expect(audio.locator('option')).toHaveText(['French — Français', 'Japanese — Japonais'])
  await expect(audio).toHaveValue('0')
  await audio.selectOption('1')
  const enabled = () => page.locator('.local-player video').evaluate((v: any) => [...v.audioTracks].map((t: any) => t.enabled))
  await expect.poll(enabled).toEqual([false, true])
  await page.locator('.localcard', { hasText: 'Movie 2.mkv' }).click()
  await expect(audio).toHaveValue('1')
  await expect.poll(enabled).toEqual([false, true])
  await page.locator('main h1').click()
  await page.keyboard.press('a')
  await expect(audio).toHaveValue('0')
  await expect.poll(enabled).toEqual([true, false])
  // A file with one audio track and no subtitles: no audio menu, a hint instead
  await page.locator('.localcard', { hasText: 'Plain.webm' }).click()
  await expect(page.locator('.local-player h2')).toHaveText('Plain.webm')
  await expect(audio).toHaveCount(0)
  await expect(page.locator('.track-row')).toContainText('No subtitles found')
})

test('without a preference, the track marked "default" in the MKV is shown', async ({ page }) => {
  await open(page, { storage: { mode: 'anime', 'lastPage:anime': 'localVideos' }, videos: [videos[1]] })
  await page.locator('.localcard').first().click()
  await expect(page.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('mkv:4')
  await expect.poll(() => showing(page)).toBe('Cue from mkv:4')
})

test('subtitles in French UI, and a readable error when a track cannot be read', async ({ page }) => {
  const broken = [{ ...SUBS[0], id: 'broken', default: true }]
  await open(page, { lang: 'fr', storage: { mode: 'anime', 'lastPage:anime': 'localVideos' }, videos: [{ relPath: 'Films/Movie.mkv', file: 'tracks.mkv', subtitles: [...broken, SUBS[1]] }] })
  await page.locator('.localcard').first().click()
  await expect(page.getByRole('combobox', { name: 'Sous-titres' }).locator('option')).toHaveText(['Désactivés', 'Français', 'Anglais — English (signs)'])
  await expect(page.locator('.local-player .anime-toast.error')).toHaveText(/Ces sous-titres utilisent une compression non prise en charge/)
  await expect(page.getByRole('combobox', { name: 'Audio' }).locator('option')).toHaveText(['Français', 'Japonais'])
})
