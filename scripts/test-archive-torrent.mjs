// End-to-end check of the Internet Archive torrent streaming layer, in plain
// Node (no Electron). Uses a public-domain cartoon from archive.org's
// classic_cartoons collection and compares streamed byte ranges with the
// same ranges downloaded directly over HTTP from archive.org.
import { createRequire } from 'module'
import os from 'os'
import path from 'path'
import fs from 'fs'
const require = createRequire(import.meta.url)
const archive = require('../electron/archive.cjs')
const { createTorrentManager } = require('../electron/torrent-manager.cjs')

const ID = process.env.TEST_ARCHIVE_ID || 'popeye_taxi-turvey'
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } console.log('ok  -', msg) }
const cacheRoot = path.join(os.tmpdir(), 'nr-torrent-test')

const results = await archive.search('popeye')
console.log('search sample:', results.slice(0, 3).map(r => `${r.identifier} (${r.title})`).join(' | '))
assert(results.length > 0, 'archive search returns results')

const details = await archive.files(ID)
const mp4 = details.files.find(f => /\.mp4$/i.test(f.name))
assert(details.hasTorrent, 'item has an archive.org torrent')
assert(mp4, 'item lists an MP4 file: ' + (mp4 && mp4.name))

const tm = createTorrentManager({ cacheRoot, log: (...a) => console.log('  [log]', ...a) })
const t0 = Date.now()
const info = await tm.start({ identifier: ID, fileName: mp4.name })
console.log('started in', Date.now() - t0, 'ms:', JSON.stringify(info))
assert(info.streamUrl.startsWith('http://127.0.0.1:'), 'stream URL is loopback-only')
assert(info.size === mp4.size, 'torrent file size matches archive metadata')

const direct = `https://archive.org/download/${ID}/${encodeURIComponent(mp4.name)}`
async function compare(range, label) {
  const t = Date.now()
  const a = await fetch(info.streamUrl, { headers: { Range: range } })
  const bufA = Buffer.from(await a.arrayBuffer())
  const b = await fetch(direct, { headers: { Range: range } })
  const bufB = Buffer.from(await b.arrayBuffer())
  console.log(`  ${label}: status=${a.status} content-range=${a.headers.get('content-range')} len=${bufA.length} type=${a.headers.get('content-type')} in ${Date.now() - t} ms`)
  assert(a.status === 206 && a.headers.get('accept-ranges') === 'bytes', label + ': 206 Partial Content with Accept-Ranges')
  assert(Number(a.headers.get('content-length')) === bufA.length, label + ': Content-Length matches body')
  assert(bufA.equals(bufB), label + ': bytes identical to archive.org direct download')
}
await compare('bytes=0-65535', 'start of file')
const mid = Math.floor(info.size / 2)
await compare(`bytes=${mid}-${mid + 262143}`, 'seek to middle')
await compare('bytes=-4096', 'suffix range (last 4 KiB)')

const r416 = await fetch(info.streamUrl, { headers: { Range: `bytes=${info.size + 10}-` } })
assert(r416.status === 416, 'out-of-range request returns 416')
const r404 = await fetch(info.streamUrl.replace(/torrent\/[a-f0-9]+/, 'torrent/' + 'a'.repeat(24)))
assert(r404.status === 404, 'unknown session returns 404')

for (let i = 0; i < 6; i++) {
  const st = tm.status(info.sessionId)
  console.log(`  status: ${st.state} progress=${(st.progress * 100).toFixed(1)}% peers=${st.numPeers} speed=${(st.downloadSpeed / 1048576).toFixed(2)} MB/s`)
  await new Promise(r => setTimeout(r, 1000))
}
const st = tm.status(info.sessionId)
assert(st.downloaded > 0 && st.progress < 1.0001, 'status reports download progress')

await tm.stop(info.sessionId)
assert(tm.status(info.sessionId).state === 'stopped', 'stop() ends the session')
assert(!fs.existsSync(path.join(cacheRoot, info.sessionId)), 'stop() deletes the cached pieces')
await assert((await fetch(info.streamUrl).catch(() => ({ status: 0 }))).status !== 206, 'stream URL no longer serves after stop')
await tm.shutdown()
console.log('ALL TORRENT TESTS PASSED')
process.exit(0)
