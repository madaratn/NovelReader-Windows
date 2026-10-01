// Fails when a UI string used with t()/plural() (or a menu/theme/shelf label)
// has no French translation in src/i18n.ts. Run: npm run check:i18n
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', 'src')
const files = []
;(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(f) && f !== 'i18n.ts') files.push(p) } })(root)
const unq = s => s.replace(/\\'/g, "'")
const keys = new Map()
const add = (k, file) => { if (k && !keys.has(k)) keys.set(k, path.relative(root, file)) }
for (const file of files) {
  const s = fs.readFileSync(file, 'utf8')
  for (const m of s.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) add(unq(m[1]), file)
  for (const m of s.matchAll(/\bplural\([^,]+?,'((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'\)/g)) { add(unq(m[1]), file); add(unq(m[2]), file) }
  for (const m of s.matchAll(/\bt\([a-zA-Z.]+\?'([^']*)':'([^']*)'\)/g)) { add(m[1], file); add(m[2], file) }
  // Labels rendered through t(x.label) / t(v): menus, shelves, reader themes, shortcuts, page titles
  for (const m of s.matchAll(/\blabel:'([^']+)'/g)) add(m[1], file)
  const sc = s.match(/const SHORTCUTS:[^=]*=(\[[\s\S]*?\]\])/)
  if (sc) for (const m of sc[1].matchAll(/\['[^']*','([^']*)'\]/g)) add(m[1], file)
  const dt = s.match(/const DETAIL_TITLES[^=]*=\{([^}]*)\}/)
  if (dt) for (const m of dt[1].matchAll(/:'([^']+)'/g)) add(m[1], file)
}
const i18n = fs.readFileSync(path.join(root, 'i18n.ts'), 'utf8')
const fr = new Set([...i18n.matchAll(/'((?:[^'\\]|\\.)*)'\s*:/g)].map(m => unq(m[1])))
const LANG_NAMES = new Set(['English', 'Français'])
const missing = [...keys].filter(([k]) => !fr.has(k) && !LANG_NAMES.has(k))
console.log(`${keys.size} UI strings checked in ${files.length} files`)
if (missing.length) {
  console.error(`\n${missing.length} string(s) without a French translation in src/i18n.ts:`)
  for (const [k, f] of missing) console.error(`  - ${JSON.stringify(k)}  (${f})`)
  process.exit(1)
}
console.log('All strings have a French translation.')
