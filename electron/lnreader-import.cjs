// Import a backup made by the LNReader mobile app (Settings > Backup > Create).
// The backup is a zip with Version.json and one JSON file per novel in
// NovelAndChapters/ (older backups may nest these inside data.zip).
// We only read it: nothing is written back, and covers stored inside the
// backup are ignored (remote cover URLs are kept).

const fs = require('fs')
const JSZip = require('jszip')

const MAX_BYTES = 300 * 1024 * 1024
const MAX_NOVEL_JSON = 20 * 1024 * 1024

async function openZip(buffer) {
  try { return await JSZip.loadAsync(buffer) } catch { throw new Error('This file is not an LNReader backup (not a zip file).') }
}

function chapterTime(c) {
  const t = Date.parse(c && c.readTime || '')
  return Number.isFinite(t) ? t : 0
}

// Turn one LNReader novel JSON into what NovelReader needs.
function mapNovel(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.pluginId !== 'string' || typeof raw.path !== 'string' || !raw.name) return null
  if (raw.inLibrary === false || raw.inLibrary === 0) return null
  if (raw.isLocal) return null
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .filter(c => c && typeof c.path === 'string')
    .map((c, i) => ({ c, i }))
    // LNReader keeps a position for each chapter; fall back to the file order.
    .sort((a, b) => (Number.isFinite(a.c.position) && Number.isFinite(b.c.position) ? a.c.position - b.c.position : a.i - b.i))
    .map(x => x.c)
  // Last read chapter: most recently read one, else the furthest marked as read.
  let lastIndex = -1, lastAt = 0
  chapters.forEach((c, i) => {
    const t = chapterTime(c)
    const read = c.unread === false || c.unread === 0 || (Number(c.progress) > 0)
    if (t && t >= lastAt) { lastAt = t; lastIndex = i }
    else if (!lastAt && read && i > lastIndex) lastIndex = i
  })
  const at = lastAt || Date.parse(raw.lastReadAt || '') || 0
  const last = lastIndex >= 0 ? chapters[lastIndex] : null
  const progress = last ? Math.max(0, Math.min(100, Number(last.progress) || 0)) : 0
  return {
    pluginId: raw.pluginId,
    path: raw.path,
    name: String(raw.name),
    author: raw.author ? String(raw.author) : '',
    cover: typeof raw.cover === 'string' && /^https?:\/\//i.test(raw.cover) ? raw.cover : '',
    chapters: chapters.map((c, i) => ({ name: String(c.name || 'Chapter ' + (i + 1)), path: c.path, releaseTime: c.releaseTime || undefined })),
    reading: last ? { index: lastIndex, path: last.path, at: at || Date.now(), scroll: progress >= 100 ? 0 : progress / 100 } : null
  }
}

async function readBackup(buffer) {
  let zip = await openZip(buffer)
  const hasNovels = z => Object.keys(z.files).some(n => /(^|\/)NovelAndChapters\/[^/]+\.json$/.test(n))
  if (!hasNovels(zip)) {
    const nested = Object.keys(zip.files).find(n => /(^|\/)data\.zip$/i.test(n))
    if (nested) zip = await openZip(await zip.file(nested).async('nodebuffer'))
  }
  const names = Object.keys(zip.files).filter(n => /(^|\/)NovelAndChapters\/[^/]+\.json$/.test(n) && !zip.files[n].dir)
  if (!names.length) throw new Error('No novels were found in this LNReader backup.')
  let appVersion = ''
  const versionName = Object.keys(zip.files).find(n => /(^|\/)Version\.json$/.test(n))
  if (versionName) { try { appVersion = String(JSON.parse(await zip.file(versionName).async('string')).appVersion || '') } catch {} }
  const novels = []
  let skipped = 0
  for (const n of names) {
    try {
      const entry = zip.file(n)
      const text = await entry.async('string')
      if (text.length > MAX_NOVEL_JSON) { skipped++; continue }
      const mapped = mapNovel(JSON.parse(text))
      if (mapped) novels.push(mapped); else skipped++
    } catch { skipped++ }
  }
  return { appVersion, novels, skipped }
}

function createLNReaderImporter({ dialog }) {
  async function importBackup(win) {
    const r = await dialog.showOpenDialog(win, { title: 'Import an LNReader backup', properties: ['openFile'], filters: [{ name: 'LNReader backup', extensions: ['zip'] }] })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    const st = await fs.promises.stat(r.filePaths[0])
    if (st.size > MAX_BYTES) throw new Error('The backup file is too large.')
    const result = await readBackup(await fs.promises.readFile(r.filePaths[0]))
    return { ok: true, ...result }
  }
  return { importBackup }
}

module.exports = { createLNReaderImporter, readBackup, mapNovel }
