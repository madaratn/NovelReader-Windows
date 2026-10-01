// Static server for the UI tests: serves the built renderer (dist/ or
// UI_DIST) and the test fixtures, with HTTP Range support for video seeking.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(process.env.UI_DIST || path.join(here, '..', '..', 'dist'))
const fixtures = path.join(here, 'fixtures')
const port = Number(process.argv[2] || 4179)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let file = url.pathname.startsWith('/fixtures/') ? path.join(fixtures, url.pathname.slice(10)) : path.join(root, url.pathname === '/' ? 'index.html' : url.pathname)
  file = path.normalize(file)
  if ((!file.startsWith(root) && !file.startsWith(fixtures)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
  const size = fs.statSync(file).size
  const type = TYPES[path.extname(file)] || 'application/octet-stream'
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' })
    return fs.createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' })
  fs.createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`UI test server on ${port}, serving ${root}`))
