import { expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Fake Electron bridge (window.novelReader) and test data.
// The renderer only talks to Electron through this object, so replacing it
// lets the UI run in a normal browser with deterministic behaviour.
// ---------------------------------------------------------------------------

export type Novel = { id: string, name: string, author?: string, path?: string, source?: any, chapterCount: number, chapters: { name: string, path: string }[], addedAt?: number, cover?: string, shelf?: string }

export function novel(id: string, name: string, chapters: number, extra: Partial<Novel> = {}): Novel {
  return {
    id, name, author: 'Test Author', path: id, source: { id: 'src1', name: 'Royal Road', url: 'https://plugins.test/src1.js', lang: 'English' },
    chapterCount: chapters, chapters: Array.from({ length: chapters }, (_, i) => ({ name: `Chapter ${i + 1}: The Road`, path: `ch-${i + 1}` })),
    addedAt: Date.now() - 3600_000, cover: '', ...extra
  }
}

export type Setup = {
  storage?: Record<string, string>      // localStorage entries applied before the app starts (first load only)
  onboarded?: boolean                    // skip the welcome guide (default true)
  lang?: 'en' | 'fr'                     // UI language (default en)
  library?: Novel[]
  reading?: Record<string, { index: number, scroll?: number, at?: number }>
  plugins?: any[]                        // LNReader manifest served to the app
  newChapters?: Record<string, number>   // parseNovel returns this many chapters for a novel path
  videos?: { relPath: string }[]         // Local Videos
  slowSources?: boolean                  // make each source take ~2 s (to test Stop)
}

export const PLUGINS = (() => {
  const langs: [string, number][] = [['English', 12], ['French', 4], ['Spanish', 4], ['Multi', 2]]
  const out: any[] = []; let k = 0
  for (const [lang, n] of langs) for (let i = 0; i < n; i++) { k++; out.push({ id: 'src' + k, name: `${lang.slice(0, 2).toUpperCase()} Source ${k}`, site: `https://site${k}.test`, lang, version: '1.0.' + k, url: `https://plugins.test/src${k}.js`, iconUrl: '' }) }
  return out
})()

export async function setup(page: Page, s: Setup = {}) {
  await page.route('**/plugins.min.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(s.plugins ?? PLUGINS) }))
  await page.route('https://plugins.test/**', r => r.fulfill({ contentType: 'text/javascript', body: '/* plugin */' + ' '.repeat(80) }))
  const storage: Record<string, string> = { ...(s.storage || {}) }
  if (s.onboarded !== false) storage.onboarded = '1'
  storage.lang = s.lang || 'en'
  if (s.library) storage.library = JSON.stringify(s.library)
  for (const [id, r] of Object.entries(s.reading || {})) storage['reading:' + id] = JSON.stringify({ path: 'ch-' + (r.index + 1), at: Date.now() - 2 * 3600_000, ...r })
  await page.addInitScript(([storage, newChapters, videos, slow]) => {
    // Seed storage once per test (reloads keep what the app saved).
    if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1') }
    const autos: any[] = JSON.parse(sessionStorage.getItem('__autos') || '[]')
    const saveAutos = () => sessionStorage.setItem('__autos', JSON.stringify(autos))
    const w = window as any
    w.__calls = { search: [] as string[], parseChapter: 0 }
    const vids = (videos || []).map((v: any, i: number) => ({ name: v.relPath.split('/').pop(), folder: 'D:/Videos', relPath: v.relPath, size: 1_000_000 * (i + 1), mtime: Date.now() - i * 86400_000, url: '/fixtures/clip.webm?v=' + encodeURIComponent(v.relPath) }))
    let folders = vids.length ? ['D:/Videos'] : []
    w.novelReader = {
      searchPlugin: async (pl: any, q: string) => {
        w.__calls.search.push(pl.id)
        const n = Number(String(pl.id).replace(/\D/g, '')) || 0
        await new Promise(r => setTimeout(r, (60 + (n * 37) % 240) * (slow ? 8 : 1)))
        if (n === 3) throw new Error('source down')
        if (q === 'the') return [{ name: 'The Probe', path: '/p' }]
        if (n % 2 === 0) return [{ name: 'Shadow Slave', path: '/novel/ss-' + n }, { name: 'Shadow Slave Side Stories', path: '/novel/sss-' + n }]
        return [{ name: 'Unrelated', path: '/u' }]
      },
      parseNovel: async (_pl: any, path: string) => {
        await new Promise(r => setTimeout(r, 80))
        const count = (newChapters || {})[path] ?? 12
        return { name: 'Shadow Slave', author: 'Guiltythree', cover: '', chapters: Array.from({ length: count }, (_, i) => ({ name: `Chapter ${i + 1}: The Road`, path: `ch-${i + 1}` })) }
      },
      parseChapter: async (_src: any, path: string) => {
        w.__calls.parseChapter++
        const n = String(path).replace(/\D/g, '')
        return '<p>' + Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of chapter ${n}. The lantern light trembled across the old stone corridor as the travellers paused to listen.`).join('</p><p>') + '</p>'
      },
      miwayomiStatus: async () => ({ online: false, baseUrl: 'http://127.0.0.1:4567' }), miwayomiDebug: async () => ({}), miwayomiFetch: async () => [],
      localFolders: async () => folders, localAddFolder: async () => (folders = ['D:/Videos']), localRemoveFolder: async () => (folders = []), localListVideos: async () => (folders.length ? vids : []),
      archiveSearch: async () => [], archiveFiles: async () => ({ files: [], hasTorrent: false }),
      torrentStart: async () => ({}), torrentStartMagnet: async () => ({}), torrentStatus: async () => ({ state: 'stopped' }), torrentStop: async () => true,
      backupAuto: async (payload: any, force?: boolean) => {
        const last = autos[0]
        if (!force && last && JSON.stringify(last.p.data) === JSON.stringify(payload.data)) return { saved: false, name: last.name }
        const name = 'auto-' + (Date.now() + autos.length) + '.json'; autos.unshift({ name, p: payload }); autos.splice(10); saveAutos(); return { saved: true, name }
      },
      backupListAuto: async () => autos.map(a => ({ name: a.name, novels: JSON.parse(a.p.data.library || '[]').length, keys: 0, exportedAt: a.p.exportedAt })),
      backupReadAuto: async (name: string) => autos.find(a => a.name === name).p,
      backupExport: async () => ({ ok: true, path: 'C:/Users/test/Documents/NovelReader-backup.json', novels: 1 }),
      backupImport: async () => ({ ok: false, canceled: true }), backupOpenFolder: async () => true,
      appVersion: async () => '0.2.0', focusWindow: async () => { w.__focused = (w.__focused || 0) + 1; return true },
      updateStatus: async () => w.__update, updateCheck: async () => { w.__update = { state: 'up-to-date', version: '0.2.0', checkedAt: Date.now() }; w.__updateCb && w.__updateCb(w.__update); return w.__update },
      updateInstall: async () => { w.__installed = true; return true },
      onUpdateStatus: (cb: any) => { w.__updateCb = cb; return () => { w.__updateCb = null } }
    }
    w.__update = { state: 'idle', version: '0.2.0' }
    w.__emitUpdate = (st: any) => { w.__update = st; w.__updateCb && w.__updateCb(st) }
    // Windows notifications: record them; pretend the window is in the background when asked.
    w.__notes = []
    w.Notification = class { onclick: any; constructor(title: string, opts: any) { w.__notes.push({ title, body: opts && opts.body }); w.__lastNote = this } }
    if (sessionStorage.getItem('__background')) document.hasFocus = () => false
  }, [storage, s.newChapters || {}, s.videos || [], !!s.slowSources] as const)
}

export async function open(page: Page, s: Setup = {}) {
  await setup(page, s)
  await page.goto('/')
  await expect(page.locator('aside.sidebar')).toBeVisible()
}

/** Fake speech synthesis: each utterance "ends" after 30 ms. */
export async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__spoken = []
    class U { text: string; rate = 1; voice: any = null; lang = ''; onend: any; onerror: any; _x = false; constructor(t: string) { this.text = t } }
    w.SpeechSynthesisUtterance = U
    let cur: any = null
    const voices = [{ name: 'Microsoft Hortense', lang: 'fr-FR', voiceURI: 'hortense' }, { name: 'Microsoft Zira', lang: 'en-US', voiceURI: 'zira' }]
    const ss = {
      getVoices: () => voices, addEventListener() {}, removeEventListener() {},
      speak(u: any) { cur = u; w.__spoken.push({ text: u.text.slice(0, 40), voice: u.voice && u.voice.name, rate: u.rate }); setTimeout(() => { if (cur === u && !u._x) { cur = null; u.onend && u.onend() } }, 30) },
      cancel() { if (cur) { const u = cur; u._x = true; cur = null; u.onerror && u.onerror({ error: 'interrupted' }) } }
    }
    Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true })
  })
}

export const nav = (page: Page, label: string) => page.locator('.sidebar .nav-item', { hasText: label }).click()
