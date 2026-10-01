// Offline chapters: chapter HTML saved on disk per novel (main process).
// Layout: <userData>/offline/<sha1(novelId)>/{index.json, <sha1(path)>.html}

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MAX_CHAPTER_BYTES = 5 * 1024 * 1024
const sha1 = s => crypto.createHash('sha1').update(String(s)).digest('hex')

function createOfflineStore({ app }) {
  const root = () => path.join(app.getPath('userData'), 'offline')
  const dirOf = novelId => path.join(root(), sha1(novelId))
  const indexOf = novelId => path.join(dirOf(novelId), 'index.json')

  function readIndex(novelId) {
    try { const x = JSON.parse(fs.readFileSync(indexOf(novelId), 'utf8')); return x && typeof x === 'object' ? x : { paths: {} } } catch { return { paths: {} } }
  }
  function writeIndex(novelId, idx) {
    const tmp = indexOf(novelId) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(idx))
    fs.renameSync(tmp, indexOf(novelId))
  }
  const check = (novelId, chapterPath) => {
    if (typeof novelId !== 'string' || !novelId || novelId.length > 2000) throw new Error('Invalid novel id')
    if (typeof chapterPath !== 'string' || !chapterPath || chapterPath.length > 4000) throw new Error('Invalid chapter path')
  }

  async function save(novelId, chapterPath, html, novelName) {
    check(novelId, chapterPath)
    const text = String(html || '')
    if (!text.trim()) throw new Error('Empty chapter')
    if (Buffer.byteLength(text) > MAX_CHAPTER_BYTES) throw new Error('Chapter too large')
    await fs.promises.mkdir(dirOf(novelId), { recursive: true })
    const file = sha1(chapterPath) + '.html'
    await fs.promises.writeFile(path.join(dirOf(novelId), file), text, 'utf8')
    const idx = readIndex(novelId)
    idx.novelId = novelId
    if (novelName) idx.name = String(novelName).slice(0, 300)
    idx.paths[chapterPath] = file
    writeIndex(novelId, idx)
    return true
  }

  async function get(novelId, chapterPath) {
    check(novelId, chapterPath)
    const file = readIndex(novelId).paths[chapterPath]
    if (!file) return null
    try { return await fs.promises.readFile(path.join(dirOf(novelId), file), 'utf8') } catch { return null }
  }

  async function list(novelId) {
    if (typeof novelId !== 'string' || !novelId) return []
    return Object.keys(readIndex(novelId).paths)
  }

  async function remove(novelId) {
    if (typeof novelId !== 'string' || !novelId) return false
    await fs.promises.rm(dirOf(novelId), { recursive: true, force: true })
    return true
  }

  async function usage() {
    let bytes = 0, chapters = 0, novels = 0
    let dirs = []
    try { dirs = await fs.promises.readdir(root()) } catch { return { bytes, chapters, novels } }
    for (const d of dirs) {
      let files = []
      try { files = await fs.promises.readdir(path.join(root(), d)) } catch { continue }
      let n = 0
      for (const f of files) {
        if (!f.endsWith('.html')) continue
        n++
        try { bytes += (await fs.promises.stat(path.join(root(), d, f))).size } catch {}
      }
      if (n) { novels++; chapters += n }
    }
    return { bytes, chapters, novels }
  }

  async function clearAll() { await fs.promises.rm(root(), { recursive: true, force: true }); return true }

  return { save, get, list, remove, usage, clearAll }
}

module.exports = { createOfflineStore }
