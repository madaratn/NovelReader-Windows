// Checks every LNReader book source the way the PC app runs them
// (electron/plugin-runner.cjs): popular list -> a novel -> its first chapter.
//   node scripts/book-scan.cjs <out.json> [langs: English,French,…|all] [only: comma names]
// The user agent can be changed with NR_BOOK_UA (see plugin-runner.cjs).
const fs = require('fs')
const runner = require('../electron/plugin-runner.cjs')
const MANIFEST = 'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
// Also runs inside Electron (electron scripts/book-scan.cjs …) to check the sources
// the way the PC app really fetches them (Chromium network + Cloudflare checks).
const IN_ELECTRON = !!process.versions.electron
const [OUT = 'book-scan.json', LANGS = 'all', ONLY = ''] = process.argv.slice(IN_ELECTRON ? 1 : 2).filter(a => !a.startsWith('--') && !/book-scan\.cjs$/.test(a))
const limit = (p, ms, what) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('timeout ' + what)), ms))])
const short = e => (String(e && e.message || e) + ' @ ' + String(e && e.stack || '').split('\n').slice(1, 2).join('').trim()).slice(0, 240)
// What the app is told (release asset book-status.json):
//  ok      the list works (a first chapter that is only pictures is not a failure);
//  blocked the site refuses this checker (Cloudflare, captcha, 403, too slow): it may
//          well work at home, the app never sets it aside for that;
//  dead    gone, expired certificate, error page, or the source no longer reads the site.
const BLOCKED = /just a moment|captcha|webview|cloudflare|ddos|security check|bot check|not a bot|\b(401|403|429)\b|timeout|timed out|check not passed|Attention Required/i
function verdict(r) {
  if (r.state === 'ok' || r.step === 'novel' || r.step === 'chapter') return 'ok'
  const all = [r.error, r.popularError || '', ...(r.trace || [])].join(' | ')
  return BLOCKED.test(all) ? 'blocked' : 'dead'
}
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
  r.verdict = verdict(r)
  r.seconds = Math.round((Date.now() - t) / 1000)
  return r
}
async function ready() {
  if (!IN_ELECTRON) return
  const { app, session, BrowserWindow } = require('electron')
  app.commandLine.appendSwitch('no-sandbox'); app.disableHardwareAcceleration()
  app.on('window-all-closed', () => {})
  await app.whenReady()
  runner.configure(require('../electron/book-web.cjs').createBookWeb({ session, BrowserWindow, showWhenStuck: false, log: m => console.log('   ', m) }))
}
;(async () => {
  await ready()
  let list = await (await fetch(MANIFEST)).json()
  if (LANGS !== 'all') { const want = LANGS.split(',').map(x => x.trim().toLowerCase()); list = list.filter(p => want.includes(String(p.lang).toLowerCase())) }
  if (ONLY) { const want = ONLY.split(',').map(x => x.trim().toLowerCase()); list = list.filter(p => want.includes(p.name.toLowerCase())) }
  console.log('checking', list.length, 'book sources,', IN_ELECTRON ? 'through Chromium (as the PC app)' : 'UA: ' + (process.env.NR_BOOK_UA || '(app default)'))
  const out = [], queue = [...list]
  await Promise.all(Array.from({ length: 10 }, async () => { while (queue.length) { const p = queue.shift(); const r = await check(p); out.push(r); console.log((r.state === 'ok' ? '✓' : '✗') + ' ' + p.lang.padEnd(10) + ' ' + p.name.padEnd(28) + ' ' + (r.state === 'ok' ? r.titles + ' titles, ' + r.chapters + ' chapters, ' + r.textLength + ' chars' : r.step + ': ' + r.error + (r.popularError ? '\n      popular: ' + r.popularError : '') + (r.trace && r.trace.length ? '\n      ' + r.trace.slice(-3).join('\n      ') : ''))) } }))
  const ok = out.filter(r => r.state === 'ok').length
  console.log('SUMMARY ok', ok, 'of', out.length)
  const count = v => out.filter(r => r.verdict === v).length
  console.log('VERDICT ok', count('ok'), 'blocked', count('blocked'), 'dead', count('dead'))
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), ua: process.env.NR_BOOK_UA || '', results: out.sort((a, b) => a.name.localeCompare(b.name)) }))
  process.exit(0)
})()
