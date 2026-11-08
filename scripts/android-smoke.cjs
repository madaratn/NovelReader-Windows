// Runs inside the installed Android app (through the WebView debugger): checks the
// interface is up, then a real search -> novel -> chapter on live book sources.
const { chromium } = require('playwright-core')
const MANIFEST = 'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForFunction(() => !!document.querySelector('#root')?.children.length && !!window.novelReader, null, { timeout: 30000 })
  const shell = await page.evaluate(() => ({ platform: window.novelReader.platform, android: document.documentElement.classList.contains('android'), text: document.body.innerText.slice(0, 200) }))
  console.log('interface:', JSON.stringify(shell))
  if (!shell.android) throw new Error('Android bridge not installed')
  const r = await page.evaluate(async (manifest) => {
    const all = await (await fetch(manifest)).json()
    const list = (Array.isArray(all) ? all : all.plugins).filter(p => /english/i.test(p.lang))
    const prefer = ['novelfull', 'freewebnovel', 'novelbin', 'royalroad', 'lightnovelworld', 'novelhall', 'wuxiaworld', 'boxnovel']
    const picks = [...prefer.map(id => list.find(p => p.id.toLowerCase().includes(id))).filter(Boolean), ...list].slice(0, 12)
    const log = []
    for (const p of picks) {
      try {
        const res = await window.novelReader.searchPlugin(p, 'shadow')
        if (!res.length) { log.push(p.id + ': 0 results'); continue }
        const novel = await window.novelReader.parseNovel(p, res[0].path)
        const ch = novel.chapters?.[0]
        const text = ch ? await window.novelReader.parseChapter(p, ch.path) : ''
        const plain = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        log.push(`${p.id}: ${res.length} results, "${novel.name}", ${novel.chapters?.length || 0} chapters, chapter text ${plain.length} chars`)
        if (plain.length > 200) return { ok: true, log, sample: plain.slice(0, 160) }
      } catch (e) { log.push(p.id + ': ' + String(e?.message || e).slice(0, 160)) }
    }
    return { ok: false, log }
  }, MANIFEST)
  for (const l of r.log) console.log('  ' + l)
  if (r.sample) console.log('chapter sample:', r.sample)
  // Same path as a person: global search in the interface.
  await browser.close().catch(() => {})
  if (!r.ok) { console.error('No live source could be read on Android'); process.exit(1) }
  console.log('Android smoke test OK')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
