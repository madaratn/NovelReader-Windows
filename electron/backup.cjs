// Backup / restore of the renderer's saved data (library, reading progress,
// preferences). Runs in the main process: the renderer hands over a JSON
// snapshot and receives one back; it never gets filesystem access.
//
// - exportBackup: "Save as…" dialog, user picks the file
// - importBackup: "Open…" dialog, file is validated before being returned
// - autoBackup:   rotating copies in <userData>/backups (only when changed)

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MAX_BYTES = 50 * 1024 * 1024
const KEEP_AUTO = 10
const AUTO_RE = /^auto-\d{8}-\d{6}\.json$/

function validate(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('This file is not a NovelReader backup.')
  if (payload.app !== 'NovelReader' || payload.version !== 1) throw new Error('This file is not a NovelReader backup.')
  const data = payload.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The backup is damaged (no data).')
  for (const [k, v] of Object.entries(data)) {
    if (typeof k !== 'string' || typeof v !== 'string') throw new Error('The backup is damaged (invalid entry).')
  }
  return { app: 'NovelReader', version: 1, exportedAt: Number(payload.exportedAt) || 0, data }
}

function summarize(payload) {
  let novels = 0
  try { novels = JSON.parse(payload.data.library || '[]').length } catch {}
  return { novels, keys: Object.keys(payload.data).length, exportedAt: payload.exportedAt }
}

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function createBackupManager({ app, dialog, shell }) {
  const dir = () => path.join(app.getPath('userData'), 'backups')
  const hashOf = payload => crypto.createHash('sha1').update(JSON.stringify(payload.data)).digest('hex')

  async function exportBackup(win, payload) {
    const clean = validate(payload)
    const today = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(win, {
      title: 'Save NovelReader backup',
      defaultPath: path.join(app.getPath('documents'), `NovelReader-backup-${today}.json`),
      filters: [{ name: 'NovelReader backup', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    await fs.promises.writeFile(r.filePath, JSON.stringify(clean, null, 1), 'utf8')
    return { ok: true, path: r.filePath, ...summarize(clean) }
  }

  async function readFile(file) {
    const st = await fs.promises.stat(file)
    if (st.size > MAX_BYTES) throw new Error('The backup file is too large.')
    let parsed
    try { parsed = JSON.parse(await fs.promises.readFile(file, 'utf8')) } catch { throw new Error('This file is not a NovelReader backup.') }
    return validate(parsed)
  }

  async function importBackup(win) {
    const r = await dialog.showOpenDialog(win, {
      title: 'Restore NovelReader backup',
      properties: ['openFile'],
      filters: [{ name: 'NovelReader backup', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    const payload = await readFile(r.filePaths[0])
    return { ok: true, payload, ...summarize(payload) }
  }

  async function listAuto() {
    let names = []
    try { names = (await fs.promises.readdir(dir())).filter(n => AUTO_RE.test(n)).sort().reverse() } catch { return [] }
    const out = []
    for (const name of names) {
      try {
        const payload = await readFile(path.join(dir(), name))
        out.push({ name, ...summarize(payload) })
      } catch {}
    }
    return out
  }

  async function autoBackup(payload, { force = false } = {}) {
    const clean = validate(payload)
    await fs.promises.mkdir(dir(), { recursive: true })
    const existing = (await fs.promises.readdir(dir())).filter(n => AUTO_RE.test(n)).sort()
    const latest = existing[existing.length - 1]
    if (!force && latest) {
      try {
        const prev = JSON.parse(await fs.promises.readFile(path.join(dir(), latest), 'utf8'))
        if (hashOf(prev) === hashOf(clean)) return { saved: false, name: latest }
      } catch {}
    }
    let name = `auto-${stamp()}.json`
    if (existing.includes(name)) name = `auto-${stamp(new Date(Date.now() + 1000))}.json`
    const tmp = path.join(dir(), name + '.tmp')
    await fs.promises.writeFile(tmp, JSON.stringify(clean), 'utf8')
    await fs.promises.rename(tmp, path.join(dir(), name))
    const all = (await fs.promises.readdir(dir())).filter(n => AUTO_RE.test(n)).sort()
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_AUTO))) {
      await fs.promises.rm(path.join(dir(), old), { force: true })
    }
    return { saved: true, name }
  }

  async function readAuto(name) {
    if (typeof name !== 'string' || !AUTO_RE.test(name)) throw new Error('Invalid backup name.')
    return readFile(path.join(dir(), name))
  }

  async function openFolder() {
    await fs.promises.mkdir(dir(), { recursive: true })
    const err = await shell.openPath(dir())
    if (err) throw new Error(err)
    return true
  }

  return { exportBackup, importBackup, listAuto, autoBackup, readAuto, openFolder, dir }
}

module.exports = { createBackupManager, validate }
