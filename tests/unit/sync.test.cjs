const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), os = require('os'), path = require('path')
const { createFolderSync } = require('../../electron/sync.cjs')

test('folder sync: choose a folder, write, read back, disable', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-ud-'))
  const cloud = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-cloud-'))
  const app = { getPath: () => userData }
  const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [cloud] }) }
  const sync = createFolderSync({ app, dialog })
  assert.equal((await sync.status()).enabled, false)
  assert.equal(await sync.read(), null)
  const st = await sync.choose(null)
  assert.equal(st.enabled, true); assert.equal(st.folder, cloud)
  await sync.write({ library: '[]', 'reading:a': '{"index":1}' })
  const back = await sync.read()
  assert.equal(back.app, 'NovelReader'); assert.equal(back.data['reading:a'], '{"index":1}')
  assert.equal(back.deviceId, st.deviceId)
  assert.ok(fs.existsSync(path.join(cloud, 'NovelReader', 'library-sync.json')))
  const st2 = await sync.status()
  assert.equal(st2.remote.deviceId, st.deviceId)
  await assert.rejects(sync.write({ library: 5 }), /Invalid sync data/)
  fs.writeFileSync(path.join(cloud, 'NovelReader', 'library-sync.json'), '{broken')
  await assert.rejects(sync.read(), /damaged/)
  assert.equal((await sync.disable()).enabled, false)
})

test('direct sync with a phone: a file kept on this PC, read and written by the phone through the share relay', async () => {
  const { createEngineShare } = require('../../electron/engine-share.cjs')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-ud-'))
  const cloud = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-cloud-'))
  const app = { getPath: () => userData }
  const sync = createFolderSync({ app, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [cloud] }) } })
  const share = createEngineShare({ configFile: path.join(userData, 'share.json'), port: 0, addresses: () => ['192.168.1.5'], name: 'PC-SALON', sync: { read: () => sync.readRaw(), write: x => sync.writeRaw(x) } })
  try {
    // Nothing linked: the PC does not sync.
    assert.equal((await sync.status()).enabled, false)
    sync.setHub(true)
    const st = await sync.status()
    assert.equal(st.enabled, true); assert.equal(st.direct, true); assert.equal(st.folder, null)
    const s = await share.enable(), base = 'http://127.0.0.1:' + s.port + '/e/' + s.code
    assert.deepEqual(await (await fetch(base + '/nr/hello')).json(), { app: 'NovelReader', device: 'PC-SALON', sync: true })
    assert.equal(await (await fetch(base + '/nr/sync')).json(), null) // no file yet
    // The PC writes, the phone reads it.
    await sync.write({ library: '[{"id":"n1"}]' })
    const got = await (await fetch(base + '/nr/sync')).json()
    assert.equal(got.data.library, '[{"id":"n1"}]'); assert.equal(got.deviceId, st.deviceId)
    // The phone writes its merged copy, the PC reads it, signed by the phone.
    const w = await fetch(base + '/nr/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'NovelReader', deviceId: 'phone1', deviceName: 'Pixel 8', data: { library: '[{"id":"n1"},{"id":"n2"}]', 'reading:n2': '{"index":4}' } }) })
    assert.equal(w.status, 200)
    const back = await sync.read()
    assert.equal(back.deviceName, 'Pixel 8'); assert.equal(back.data['reading:n2'], '{"index":4}')
    assert.equal((await sync.status()).remote.deviceId, 'phone1')
    // Refused: not the app's data, or without the code.
    for (const bad of ['{"hello":1}', '{"app":"NovelReader","data":{"library":5}}', 'not json']) assert.equal((await fetch(base + '/nr/sync', { method: 'POST', body: bad })).status, 400)
    assert.equal((await sync.read()).deviceName, 'Pixel 8')
    assert.equal((await fetch('http://127.0.0.1:' + s.port + '/e/aaaaaaaaaa/nr/sync')).status, 404)
    assert.equal((await fetch(base + '/nr/other')).status, 404)
    // With a cloud folder, the phone shares that same file.
    await sync.choose(null)
    assert.equal((await sync.status()).direct, false)
    await sync.write({ library: '[{"id":"cloud"}]' })
    assert.equal((await (await fetch(base + '/nr/sync')).json()).data.library, '[{"id":"cloud"}]')
    assert.ok(fs.existsSync(path.join(cloud, 'NovelReader', 'library-sync.json')))
    // Link turned off and no folder: no sync on the PC.
    await sync.disable(); sync.setHub(false)
    assert.equal((await sync.status()).enabled, false)
  } finally { share.stop() }
})
