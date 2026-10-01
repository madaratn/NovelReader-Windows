// Folder sync (main process): reads/writes NovelReader/library-sync.json in a
// folder the user picks (usually OneDrive, Google Drive or Dropbox, whose own
// client copies the file between PCs). Merging happens in the renderer.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const FILE = 'library-sync.json'
const MAX_BYTES = 50 * 1024 * 1024

function createFolderSync({ app, dialog }) {
  const cfgFile = () => path.join(app.getPath('userData'), 'sync.json')
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) || {} } catch { return {} } }
  const writeCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)) }
  const device = () => {
    const c = readCfg()
    if (!c.deviceId) { c.deviceId = crypto.randomBytes(8).toString('hex'); writeCfg(c) }
    return { deviceId: c.deviceId, deviceName: os.hostname() }
  }
  const target = () => { const c = readCfg(); return c.folder ? path.join(c.folder, 'NovelReader', FILE) : null }

  async function status() {
    const c = readCfg(), file = target()
    let remote = null
    if (file) {
      try {
        const st = await fs.promises.stat(file)
        const head = JSON.parse(await fs.promises.readFile(file, 'utf8'))
        remote = { deviceName: String(head.deviceName || ''), deviceId: String(head.deviceId || ''), at: Number(head.at) || st.mtimeMs }
      } catch {}
    }
    return { enabled: !!c.folder, folder: c.folder || null, file, remote, ...device() }
  }

  async function choose(win) {
    const suggested = process.env.OneDrive || process.env.OneDriveConsumer || app.getPath('documents')
    const r = await dialog.showOpenDialog(win, { title: 'Choose a synced folder (OneDrive, Google Drive, Dropbox…)', defaultPath: suggested, properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return status()
    const folder = r.filePaths[0]
    await fs.promises.mkdir(path.join(folder, 'NovelReader'), { recursive: true })
    await fs.promises.access(path.join(folder, 'NovelReader'), fs.constants.W_OK)
    writeCfg({ ...readCfg(), folder })
    return status()
  }

  async function read() {
    const file = target(); if (!file) return null
    let st; try { st = await fs.promises.stat(file) } catch { return null }
    if (st.size > MAX_BYTES) throw new Error('The sync file is too large.')
    let x
    try { x = JSON.parse(await fs.promises.readFile(file, 'utf8')) } catch { throw new Error('The sync file is damaged. It will be rewritten from this PC.') }
    if (!x || x.app !== 'NovelReader' || typeof x.data !== 'object') throw new Error('The sync file is not a NovelReader file.')
    for (const [k, v] of Object.entries(x.data)) if (typeof k !== 'string' || typeof v !== 'string') throw new Error('The sync file is damaged.')
    return x
  }

  async function write(data) {
    const file = target(); if (!file) throw new Error('Sync is not set up.')
    if (!data || typeof data !== 'object') throw new Error('Invalid sync data.')
    for (const [k, v] of Object.entries(data)) if (typeof v !== 'string') throw new Error('Invalid sync data: ' + k)
    const payload = { app: 'NovelReader', version: 1, at: Date.now(), ...device(), data }
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    const tmp = file + '.' + process.pid + '.tmp'
    await fs.promises.writeFile(tmp, JSON.stringify(payload), 'utf8')
    await fs.promises.rename(tmp, file)
    return { at: payload.at }
  }

  function disable() { const c = readCfg(); delete c.folder; writeCfg(c); return status() }

  return { status, choose, read, write, disable }
}

module.exports = { createFolderSync }
