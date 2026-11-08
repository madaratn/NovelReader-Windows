// Packs dist/ for interface updates without closing the app (electron/ui-update.cjs):
// release/ui-<version>.json.gz = gzip(JSON {version, shell, files: {path: base64}})
// release/ui.json = {version, shell, file, sha512}
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { shellId } = require('../electron/ui-update.cjs')

const root = process.cwd(), dist = path.join(root, 'dist'), out = path.join(root, 'release')
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const shell = shellId(root)
const files = {}
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files[path.relative(dist, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64') } }
walk(dist)
if (!files['index.html']) throw new Error('dist/index.html missing: run the build first')
const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ version, shell, files })), { level: 9 })
fs.mkdirSync(out, { recursive: true })
const file = `ui-${version}.json.gz`
fs.writeFileSync(path.join(out, file), gz)
fs.writeFileSync(path.join(out, 'ui.json'), JSON.stringify({ version, shell, file, sha512: crypto.createHash('sha512').update(gz).digest('base64') }))
console.log(`interface bundle ${file}: ${Object.keys(files).length} files, ${(gz.length / 1e6).toFixed(1)} MB, shell ${shell}`)
