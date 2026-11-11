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
  // Each profile syncs with its own folder (electron/profiles.cjs).
  const cfgFile = () => require('./profiles.cjs').forApp(app).dataPath('sync.json')
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) || {} } catch { return {} } }
  const writeCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)) }
  const device = () => {
    const c = readCfg()
    if (!c.deviceId) { c.deviceId = crypto.randomBytes(8).toString('hex'); writeCfg(c) }
    return { deviceId: c.deviceId, deviceName: os.hostname() }
  }
  // The synced folder when one is chosen; otherwise, when a phone is linked directly
  // (electron/engine-share.cjs), a file kept on this PC that the phone reads and writes.
  const hubFile = () => require('./profiles.cjs').forApp(app).dataPath('phone-sync.json')
  const target = () => { const c = readCfg(); return c.folder ? path.join(c.folder, 'NovelReader', FILE) : c.hub ? hubFile() : null }
  function setHub(on) { const c = readCfg(); if (!!c.hub !== !!on) { c.hub = !!on; writeCfg(c) } }

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
    return { enabled: !!file, folder: c.folder || null, direct: !c.folder && !!c.hub, file, remote, ...device() }
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

  // For a linked phone: the file as it is (null when none yet), and a write of the
  // phone's merged copy (same checks as a read; the phone signs it with its own name).
  async function readRaw() { try { return await read() } catch { return null } }
  async function writeRaw(x) {
    const file = target(); if (!file) throw new Error('Sync is not set up.')
    if (!x || x.app !== 'NovelReader' || !x.data || typeof x.data !== 'object') throw new Error('Invalid sync data.')
    for (const [k, v] of Object.entries(x.data)) if (typeof v !== 'string') throw new Error('Invalid sync data: ' + k)
    const payload = { app: 'NovelReader', version: 1, at: Date.now(), deviceId: String(x.deviceId || '').slice(0, 64), deviceName: String(x.deviceName || 'Phone').slice(0, 80), data: x.data }
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    const tmp = file + '.' + process.pid + '.phone.tmp'
    await fs.promises.writeFile(tmp, JSON.stringify(payload), 'utf8')
    await fs.promises.rename(tmp, file)
    return { at: payload.at }
  }

  return { status, choose, read, write, disable, setHub, readRaw, writeRaw }
}

module.exports = { createFolderSync }
