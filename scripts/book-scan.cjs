// Checks every LNReader book source the way the PC app runs them
// (electron/plugin-runner.cjs): popular list -> a novel -> its first chapter.
//   node scripts/book-scan.cjs <out.json> [langs: English,French,…|all] [only: comma names]
// The user agent can be changed with NR_BOOK_UA (see plugin-runner.cjs).
const fs = require('fs')
const runner = require('../electron/plugin-runner.cjs')
const MANIFEST = 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
const [, , OUT = 'book-scan.json', LANGS = 'all', ONLY = ''] = process.argv
const limit = (p, ms, what) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('timeout ' + what)), ms))])
const short = e => (String(e && e.message || e) + ' @ ' + String(e && e.stack || '').split('\n').slice(1, 2).join('').trim()).slice(0, 240)
async function check(plugin) {
  const t = Date.now(), r = { name: plugin.name, id: plugin.id, lang: plugin.lang, version: plugin.version, site: plugin.site, step: '', error: '' }
  try {
    r.step = 'popular'
    let list = await limit(runner.popular(plugin, { page: 1 }), 30000, 'popular').catch(e => { r.popularError = short(e); return [] })
    if (!list.length) { r.step = 'search'; list = await limit(runner.search(plugin, 'the'), 30000, 'search') }
    if (!list.length) throw new Error('empty list')
    r.titles = list.length
    r.step = 'novel'
    const novel = await limit(runner.parseNovel(plugin, list[0].path), 30000, 'novel')
    const chapters = (novel && novel.chapters) || []
    r.chapters = chapters.length
    if (!chapters.length) throw new Error('no chapter')
    r.step = 'chapter'
    const html = String(await limit(runner.parseChapter(plugin, chapters[0].path), 30000, 'chapter') || '')
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    r.textLength = text.length
    if (text.length < 200) throw new Error('chapter text too short (' + text.length + ')')
    r.state = 'ok'
  } catch (e) { r.state = 'dead'; r.error = short(e); r.trace = runner.traceOf ? runner.traceOf(plugin.url) : [] }
  r.seconds = Math.round((Date.now() - t) / 1000)
  return r
}
;(async () => {
  let list = await (await fetch(MANIFEST)).json()
  if (LANGS !== 'all') { const want = LANGS.split(',').map(x => x.trim().toLowerCase()); list = list.filter(p => want.includes(String(p.lang).toLowerCase())) }
  if (ONLY) { const want = ONLY.split(',').map(x => x.trim().toLowerCase()); list = list.filter(p => want.includes(p.name.toLowerCase())) }
  console.log('checking', list.length, 'book sources, UA:', process.env.NR_BOOK_UA || '(app default)')
  const out = [], queue = [...list]
  await Promise.all(Array.from({ length: 10 }, async () => { while (queue.length) { const p = queue.shift(); const r = await check(p); out.push(r); console.log((r.state === 'ok' ? '✓' : '✗') + ' ' + p.lang.padEnd(10) + ' ' + p.name.padEnd(28) + ' ' + (r.state === 'ok' ? r.titles + ' titles, ' + r.chapters + ' chapters, ' + r.textLength + ' chars' : r.step + ': ' + r.error + (r.popularError ? '\n      popular: ' + r.popularError : '') + (r.trace && r.trace.length ? '\n      ' + r.trace.slice(-3).join('\n      ') : ''))) } }))
  const ok = out.filter(r => r.state === 'ok').length
  console.log('SUMMARY ok', ok, 'of', out.length)
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), ua: process.env.NR_BOOK_UA || '', results: out.sort((a, b) => a.name.localeCompare(b.name)) }))
  process.exit(0)
})()
