// Second way to get an update (electron/update-fallback.cjs) and its hand-over from
// the normal updater (electron/app-shell.cjs).
const test = require('node:test'), assert = require('node:assert')
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto')
const { fetchUpdate, parseLatest, newer } = require('../../electron/update-fallback.cjs')

const EXE = crypto.randomBytes(300000)
const yml = (v, body = EXE) => `version: ${v}\nfiles:\n  - url: NovelReader-Setup-${v}.exe\n    sha512: ${crypto.createHash('sha512').update(body).digest('base64')}\n    size: ${body.length}\npath: NovelReader-Setup-${v}.exe\nsha512: ${crypto.createHash('sha512').update(body).digest('base64')}\nreleaseDate: '2026-11-13T00:00:00.000Z'\n`
function server(opts = {}) {
  const st = { hits: 0, ranges: [] }
  const srv = http.createServer((q, s) => {
    if (q.url === '/latest.yml') return s.end(yml(opts.version || '9.9.9', opts.claimed || EXE))
    if (q.url === '/go') { s.writeHead(302, { location: '/latest.yml' }); return s.end() }
    st.hits++; st.ranges.push(q.headers.range || '')
    const from = q.headers.range ? Number(/bytes=(\d+)-/.exec(q.headers.range)[1]) : 0
    s.writeHead(from ? 206 : 200, { 'content-length': EXE.length - from })
    // The first answers are cut in the middle (what a bad Wi-Fi route does).
    if (st.hits <= (opts.cuts || 0)) { s.write(EXE.subarray(from, from + 100000)); return setTimeout(() => s.destroy(), 20) }
    s.end(EXE.subarray(from))
  })
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, st, feed: 'http://127.0.0.1:' + srv.address().port + '/' })))
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nr-upd-'))

test('versions and latest.yml', () => {
  assert.equal(newer('0.25.2', '0.25.1'), true); assert.equal(newer('0.25.1', '0.25.1'), false); assert.equal(newer('0.9.0', '0.25.1'), false); assert.equal(newer('1.0.0', '0.99.9'), true)
  const i = parseLatest(yml('1.2.3')); assert.equal(i.version, '1.2.3'); assert.equal(i.file, 'NovelReader-Setup-1.2.3.exe'); assert.equal(i.size, EXE.length)
  assert.throws(() => parseLatest('version: 1.0.0\npath: ../evil.exe\nsha512: ' + 'A'.repeat(88)))
})

test('second way: downloads, resumes after cuts, and checks the fingerprint', async () => {
  const { srv, st, feed } = await server({ cuts: 2 }); const dir = tmp()
  try {
    const seen = []
    const r = await fetchUpdate({ current: '0.25.1', dir, feed, wait: 10, onProgress: p => seen.push(p) })
    assert.equal(r.state, 'ready'); assert.equal(r.version, '9.9.9')
    assert.deepEqual(fs.readFileSync(r.file), EXE)
    assert.equal(st.hits, 3)
    assert.deepEqual(st.ranges, ['', 'bytes=100000-', 'bytes=200000-']) // continued, not restarted
    assert.ok(seen.length > 0 && seen[seen.length - 1] === 1)
  } finally { srv.close() }
})

test('second way: already up to date; a file that is not the published one is refused', async () => {
  const a = await server({ version: '0.25.1' })
  try { assert.equal((await fetchUpdate({ current: '0.25.1', dir: tmp(), feed: a.feed, wait: 5 })).state, 'up-to-date') } finally { a.srv.close() }
  const b = await server({ claimed: Buffer.from('something else') }); const dir = tmp()
  try {
    await assert.rejects(fetchUpdate({ current: '0.1.0', dir, feed: b.feed, wait: 5, tries: 2 }))
    assert.deepEqual(fs.readdirSync(dir), []) // nothing is kept
  } finally { b.srv.close() }
})

test('updater: after two failures of the normal way, the second way downloads and installs', async () => {
  const { createUpdater } = require('../../electron/app-shell.cjs')
  const events = {}, handlers = {}, sent = []
  const fake = { on: (n, f) => { events[n] = f }, checkForUpdates: async () => { fake.checks++; events.error(new Error('net::ERR_CONNECTION_RESET')); throw new Error('net::ERR_CONNECTION_RESET') }, checks: 0 }
  const real = require.cache[require.resolve('electron-updater')]
  require.cache[require.resolve('electron-updater')] = { exports: { autoUpdater: fake }, loaded: true, id: require.resolve('electron-updater') }
  const env = process.env.NR_SMOKE_TEST; delete process.env.NR_SMOKE_TEST
  try {
    let asked = 0
    const u = createUpdater({ app: { isPackaged: true, getVersion: () => '0.25.1', getPath: () => os.tmpdir(), on: () => {}, quit: () => {} }, ipcMain: { handle: (n, f) => { handlers[n] = f } },
      getWindow: () => ({ isDestroyed: () => false, webContents: { send: (_c, s) => sent.push({ ...s }) } }), log: { warn: () => {}, info: () => {} }, retryMs: 2100,
      fetchUpdate: async o => { asked++; o.onInfo({ version: '0.25.2' }); o.onProgress(0.5); return { state: 'ready', version: '0.25.2', file: '/nowhere/NovelReader-Setup-0.25.2.exe' } } })
    await u.check()
    assert.equal(asked, 0) // one failure (reported twice by the updater): tried again first
    assert.equal(sent[sent.length - 1].state, 'error')
    await new Promise(r => setTimeout(r, 2600))
    assert.equal(fake.checks, 2)
    assert.equal(asked, 1)
    const last = await handlers['update:status']()
    assert.equal(last.state, 'ready'); assert.equal(last.next, '0.25.2'); assert.equal(last.error, null)
    assert.ok(sent.some(s => s.state === 'downloading' && s.percent === 50))
  } finally { if (real) require.cache[require.resolve('electron-updater')] = real; else delete require.cache[require.resolve('electron-updater')]; if (env !== undefined) process.env.NR_SMOKE_TEST = env }
})
